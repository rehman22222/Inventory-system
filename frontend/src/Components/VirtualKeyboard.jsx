import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Keyboard from "react-simple-keyboard";
import "react-simple-keyboard/build/css/index.css";
import { FiX } from "react-icons/fi";
import { MdKeyboard, MdKeyboardHide } from "react-icons/md";

// A global on-screen keyboard for touch monitors (POS tills). When enabled,
// focusing any text field pops a keyboard up from the bottom; tapping keys types
// into that field. A physical keyboard keeps working alongside it. The shop
// turns it on/off with the floating button (remembered per device); it defaults
// ON for desktop-class touch monitors and OFF for a normal mouse desktop.

// Phones and tablets already raise their OWN soft keyboard when a field is
// focused, so our keyboard would just fight it (two keyboards, focus flicker).
// A POS touch monitor runs a desktop OS where Chrome does NOT auto-raise one —
// that's the only place this keyboard is wanted. Detect the native-keyboard
// devices and stay out of their way entirely.
const hasNativeSoftKeyboard = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // Mobile phones and tablets (Android, iOS, iPadOS, Windows Phone). Desktop
  // touch monitors report a plain Windows/Mac UA with no "Mobile"/"Android".
  if (/Android|iPhone|iPad|iPod|Windows Phone|Mobile|Tablet|Silk|Kindle/i.test(ua)) {
    return true;
  }
  // iPadOS 13+ masquerades as desktop Safari but is a touch device with a
  // native keyboard: Mac UA + real touch points.
  const isTouchMac =
    /Macintosh/.test(ua) && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1;
  return isTouchMac;
};

const isKeyboardForcedForTesting = () => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("keyboard") === "1" ||
    params.get("osk") === "1" ||
    localStorage.getItem("osk-force") === "1"
  );
};

// Which fields the keyboard drives (skip checkboxes, files, pickers, buttons…).
const EDITABLE_SELECTOR =
  'input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]):not([type=color]):not([type=date]):not([type=datetime-local]):not([type=month]):not([type=time]):not([type=week]):not([type=submit]):not([type=button]):not([type=reset]), textarea';

const isEditable = (el) =>
  el && el.matches && el.matches(EDITABLE_SELECTOR) && !el.readOnly && !el.disabled;

// Focus leaving a text field does not always mean the cashier has finished with
// the form. Picking a category from the dropdown, or tapping a tab inside the
// till's modal, is part of filling that same form — but a <select> is not
// something this keyboard can type into, so it used to read as "they've left",
// the keyboard shut, and `body.osk-open` came off. That last part is what was
// actually felt: the modal is sized against the keyboard, so it sprang back to
// full height and everything jumped under the cashier's hands mid-entry.
//
// So the keyboard stays up for anything inside the modal, keeping the last text
// field as its target — tapping a letter simply returns there.
const keepsKeyboardOpen = (el) => {
  if (!el || el === document.body) return false;
  if (el.tagName === "SELECT") return true;
  return typeof el.closest === "function" && Boolean(el.closest(".pos-modal-panel"));
};

const isNumericField = (el) => {
  if (!el || el.tagName !== "INPUT") return false;
  const type = (el.getAttribute("type") || "").toLowerCase();
  const inputMode = (el.getAttribute("inputmode") || "").toLowerCase();
  return (
    type === "number" ||
    inputMode === "numeric" ||
    inputMode === "decimal" ||
    el.dataset?.keyboard === "numeric"
  );
};

// Strictly <input type="number">, which is the only kind that rejects a partial
// decimal. A text field wearing inputmode="decimal" holds "66." quite happily
// and needs none of the special handling below.
const isNumberInput = (el) =>
  Boolean(el) &&
  el.tagName === "INPUT" &&
  (el.getAttribute("type") || "").toLowerCase() === "number";

/* The till's keyboard, laid out like a phone rather than like a typewriter.
 *
 * It used to carry a full desktop row set: a digits row across the top, tab,
 * caps, brackets and backslash — fourteen columns and five rows. On a bar the
 * width of a till screen that made every key narrower than the finger pressing
 * it, which is the one thing an on-screen keyboard cannot afford.
 *
 * Eleven columns and four rows instead. The digits move behind a {numbers}
 * toggle, which is where a phone keeps them and where nobody has ever had
 * trouble finding them — and paying one tap for a digit buys roughly 30% more
 * width on every letter, every time. Quantities are typed on the till's own
 * keypad anyway; this bar is for names.
 *
 * Lowercase is the resting state now. Capitals were the default on the argument
 * that packaging is printed in caps, but what is actually typed here is a
 * search — and search does not care, while a name typed in caps is stored in
 * caps and reads as shouting everywhere it appears afterwards.
 */
const LETTER_ROWS_LOWER = [
  "q w e r t y u i o p {bksp}",
  "a s d f g h j k l ' {enter}",
  "{shift} z x c v b n m , . ? {shift}",
  "{numbers} @ {space} {hide}",
];

const LETTER_ROWS_UPPER = [
  "Q W E R T Y U I O P {bksp}",
  "A S D F G H J K L ' {enter}",
  "{shift} Z X C V B N M , . ? {shift}",
  "{numbers} @ {space} {hide}",
];

// Digits and the punctuation a product name or an email actually needs. Not a
// full symbol set: every key added here comes back out of the width of the
// others, and nothing at a counter is typed in APL.
const SYMBOL_ROWS = [
  "1 2 3 4 5 6 7 8 9 0 {bksp}",
  "- _ / : ; ( ) & % {enter}",
  "{letters} . , ? ! + = ' \" {letters}",
  "{letters} @ {space} {hide}",
];

const KEYBOARD_LAYOUTS = {
  lower: LETTER_ROWS_LOWER,
  upper: LETTER_ROWS_UPPER,
  symbols: SYMBOL_ROWS,
  // react-simple-keyboard falls back to a layout called "default" if the name
  // it is given ever goes missing. Point that at the ordinary letters so the
  // worst case is the usual keyboard rather than an empty one.
  default: LETTER_ROWS_LOWER,
};

const KEYBOARD_DISPLAY = {
  "{bksp}": "⌫",
  "{enter}": "enter",
  // Arrows, like a phone. "shift" spelled out took the width of two letters at
  // each end of the row it sits on, and the arrow is the more legible of the
  // two at a glance anyway.
  "{shift}": "↑",
  "{numbers}": "&123",
  "{letters}": "abc",
  "{hide}": "▼",
  "{space}": " ",
};

/* The resting state, and what shift does to it.
 *
 * Shift is a straight toggle that STAYS where it is put — there is deliberately
 * no one-shot release. Releasing after a single letter is right for prose and
 * wrong here: the thing being typed in capitals at a till is a whole product
 * name, not the first letter of a sentence.
 */
const TEXT_LAYOUT_LOWER = "lower";
const TEXT_LAYOUT_UPPER = "upper";
const TEXT_LAYOUT_SYMBOLS = "symbols";

// Which layout a field should open with. A number field gets the pad instead —
// that is a separate component entirely, see NUMERIC_KEY_ROWS below.
const layoutFor = (mode) => (mode === "numeric" ? "numeric" : TEXT_LAYOUT_LOWER);

const NUMERIC_KEY_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [".", "0", "{bksp}"],
  ["{enter}"],
];

// React tracks input values internally, so setting `el.value` directly is
// ignored on the next render. Go through the native setter and fire a real
// `input` event so controlled components update their state.
//
// Returns false when the browser refused the value, having left the field
// blank. A number input runs a value-sanitisation step that empties itself
// rather than hold a string it considers invalid, so a single keypress could
// otherwise wipe out everything the cashier had already entered. Nothing a key
// tap does should ever destroy more than that one character, so the previous
// value is put back and no input event is fired — the field simply doesn't move.
const setNativeValue = (el, value) => {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  const previous = el.value;
  const write = (next) => {
    if (setter) setter.call(el, next);
    else el.value = next;
  };

  write(value);

  if (value !== "" && el.value === "") {
    write(previous);
    return false;
  }

  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
};

const focusAndPlaceCaret = (el, position) => {
  if (!el) return;
  el.focus({ preventScroll: true });
  try {
    if (typeof el.setSelectionRange === "function") {
      el.setSelectionRange(position, position);
    }
  } catch {
    /* Some input types do not support selection ranges. */
  }
};

const mutateActiveValue = (el, replacement, removeBeforeCaret = 0) => {
  if (!el) return "";
  const currentValue = el.value || "";
  let start = currentValue.length;
  let end = currentValue.length;

  try {
    if (typeof el.selectionStart === "number") start = el.selectionStart;
    if (typeof el.selectionEnd === "number") end = el.selectionEnd;
  } catch {
    /* Fall back to editing at the end. */
  }

  const deleteFrom = Math.max(0, start - removeBeforeCaret);
  const nextValue = `${currentValue.slice(0, deleteFrom)}${replacement}${currentValue.slice(end)}`;
  const nextCaret = deleteFrom + replacement.length;

  // Report what the field actually ended up holding, not what we asked for —
  // a refused write leaves the old value in place, and the keyboard's own
  // buffer has to agree with the field or the next keypress edits the wrong
  // string.
  const applied = setNativeValue(el, nextValue);
  const settled = el.value || "";
  focusAndPlaceCaret(el, applied ? nextCaret : settled.length);
  return settled;
};

function VirtualKeyboard() {
  const keyboard = useRef(null);
  const keyboardPanel = useRef(null);
  const activeEl = useRef(null);
  const lastEditableEl = useRef(null);
  // A decimal point tapped on a number field, waiting for the digit it belongs
  // to. See onKeyPress — the two are written to the field together.
  const pendingDecimal = useRef(false);
  const forcedForTesting = useRef(isKeyboardForcedForTesting());

  // On phones/tablets the OS keyboard already handles input — decided once, up
  // front, so the whole component (button included) stays off those devices.
  const nativeKeyboard = useRef(!forcedForTesting.current && hasNativeSoftKeyboard());

  const [enabled, setEnabled] = useState(() => {
    if (forcedForTesting.current) return true;
    if (nativeKeyboard.current) return false;
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("osk-enabled") : null;
    if (saved !== null) return saved === "1";
    return (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(pointer: coarse)").matches
    );
  });
  const [visible, setVisible] = useState(false);
  const [layoutName, setLayoutName] = useState(TEXT_LAYOUT_LOWER);
  const [keyboardMode, setKeyboardMode] = useState("text");

  const syncKeyboardHeight = useCallback(() => {
    if (typeof document === "undefined") return;
    const height = visible && keyboardPanel.current ? keyboardPanel.current.offsetHeight : 0;
    document.documentElement.style.setProperty("--osk-height", `${height}px`);
    document.body.classList.toggle("osk-open", enabled && visible && height > 0);
  }, [enabled, visible]);

  const scrollFieldIntoSafeView = useCallback((el) => {
    if (!el) return;
    window.setTimeout(() => {
      try {
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      } catch {
        /* Ignore old browsers. */
      }
    }, 80);
  }, []);

  const showForCurrentField = useCallback(() => {
    const focused = document.activeElement;
    const remembered = lastEditableEl.current;
    const firstModalField = document.querySelector(
      ".pos-modal-panel input:not([type=checkbox]):not([type=radio]), .pos-modal-panel textarea, .pos-modal-panel select"
    );
    const el = isEditable(focused)
      ? focused
      : isEditable(remembered) && document.contains(remembered)
        ? remembered
        : isEditable(firstModalField)
          ? firstModalField
          : null;

    if (!isEditable(el)) return false;
    activeEl.current = el;
    lastEditableEl.current = el;
    // A point armed on the previous field must never land in this one.
    pendingDecimal.current = false;
    const nextMode = isNumericField(el) ? "numeric" : "text";
    setKeyboardMode(nextMode);
    setLayoutName(layoutFor(nextMode));
    focusAndPlaceCaret(el, (el.value || "").length);
    if (keyboard.current) keyboard.current.setInput(el.value || "");
    setVisible(true);
    scrollFieldIntoSafeView(el);
    return true;
  }, [scrollFieldIntoSafeView]);

  useEffect(() => {
    try {
      localStorage.setItem("osk-enabled", enabled ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (!enabled) {
      setVisible(false);
      return;
    }
    window.setTimeout(showForCurrentField, 0);
  }, [enabled, showForCurrentField]);

  useLayoutEffect(() => {
    syncKeyboardHeight();
    if (!enabled || !visible) {
      if (typeof document !== "undefined") {
        document.body.classList.remove("osk-open");
        document.documentElement.style.setProperty("--osk-height", "0px");
      }
      return undefined;
    }

    const observer =
      typeof ResizeObserver !== "undefined" && keyboardPanel.current
        ? new ResizeObserver(syncKeyboardHeight)
        : null;
    if (observer && keyboardPanel.current) observer.observe(keyboardPanel.current);

    const onResize = () => syncKeyboardHeight();
    window.addEventListener("resize", onResize);

    if (activeEl.current) scrollFieldIntoSafeView(activeEl.current);

    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [enabled, scrollFieldIntoSafeView, syncKeyboardHeight, visible]);

  useEffect(() => {
    return () => {
      document.body.classList.remove("osk-open");
      document.documentElement.style.setProperty("--osk-height", "0px");
    };
  }, []);

  // Bind to whichever editable field is focused.
  useEffect(() => {
    if (!enabled) return undefined;

    const onFocusIn = (e) => {
      const el = e.target;
      if (isEditable(el)) {
        activeEl.current = el;
        lastEditableEl.current = el;
        pendingDecimal.current = false;
        const nextMode = isNumericField(el) ? "numeric" : "text";
        setKeyboardMode(nextMode);
        setLayoutName(layoutFor(nextMode));
        if (keyboard.current) keyboard.current.setInput(el.value || "");
        setVisible(true);
        scrollFieldIntoSafeView(el);
      }
    };

    // Hide when focus leaves a field for something that isn't the keyboard
    // itself. Key taps don't blur the field (see onMouseDown below), so this
    // only fires when the user really moves away.
    const onFocusOut = () => {
      setTimeout(() => {
        const now = document.activeElement;
        if (isEditable(now)) return;
        // Still somewhere in the same form (the category dropdown, a tab) — hold
        // the keyboard and its target where they are.
        if (keepsKeyboardOpen(now)) return;

        activeEl.current = null;
        setVisible(false);
      }, 120);
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [enabled, scrollFieldIntoSafeView]);

  const onChange = useCallback(() => {
    // We apply key presses manually in onKeyPress. That keeps caret position,
    // Backspace, and React controlled fields consistent.
  }, []);

  const onKeyPress = useCallback((button) => {
    const el = activeEl.current;

    // Hide, from the keyboard itself. The reference bar this layout follows puts
    // it bottom-left, which is where a thumb already is.
    if (button === "{hide}") {
      setVisible(false);
      if (el) el.blur();
      return;
    }

    if (button === "{numbers}") {
      setLayoutName(TEXT_LAYOUT_SYMBOLS);
      return;
    }

    if (button === "{letters}") {
      setLayoutName(TEXT_LAYOUT_LOWER);
      return;
    }

    if (button === "{shift}") {
      // A straight toggle, and it stays where it is put — see the note above
      // TEXT_LAYOUT_LOWER for why there is no one-shot release. Pressed from
      // the symbol layout it goes back to letters, which is what a thumb that
      // reached for it there was after.
      setLayoutName((prev) =>
        prev === TEXT_LAYOUT_LOWER ? TEXT_LAYOUT_UPPER : TEXT_LAYOUT_LOWER,
      );
      return;
    }

    if (button === "{enter}") {
      pendingDecimal.current = false;
      if (el && el.tagName !== "TEXTAREA") {
        setVisible(false);
        el.blur();
      } else if (el) {
        const value = mutateActiveValue(el, "\n");
        if (keyboard.current) keyboard.current.setInput(value);
      }
      return;
    }

    if (button === "{bksp}") {
      pendingDecimal.current = false;

      // Deleting the digit after a point would leave "1.", which a number field
      // refuses to hold — the write is rejected and backspace looks stuck. Take
      // the point along with the digit so the key always does something.
      if (isNumberInput(el)) {
        const trimmed = (el.value || "").slice(0, -1);
        const next = trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
        setNativeValue(el, next);
        focusAndPlaceCaret(el, next.length);
        if (keyboard.current) keyboard.current.setInput(next);
        return;
      }

      const value = mutateActiveValue(el, "", 1);
      if (keyboard.current) keyboard.current.setInput(value);
      return;
    }

    if (!el) return;

    const specialValues = {
      "{space}": " ",
      "{tab}": "\t",
    };
    const nextCharacter = specialValues[button] ?? (button.startsWith("{") ? "" : button);
    if (!nextCharacter) return;

    // <input type="number"> cannot hold a partial decimal. Handed "66." the
    // browser decides that isn't a number and blanks the field, so tapping "."
    // wiped a price the cashier had already keyed in.
    //
    // The point is therefore held back and written together with the digit that
    // follows it, which is always a value the field accepts:
    // "66" + "." + "5" is stored in one go as "66.5".
    if (isNumberInput(el)) {
      if (nextCharacter === ".") {
        // A second point in the same number means nothing — ignore it rather
        // than arm a pending one that would corrupt the next digit.
        if (!(el.value || "").includes(".")) pendingDecimal.current = true;
        return;
      }

      if (pendingDecimal.current) {
        pendingDecimal.current = false;

        if (/^[0-9]$/.test(nextCharacter)) {
          // ".5" is refused for the same reason "66." is — a digit is required
          // on both sides of the point, so an empty field starts at zero.
          const base = el.value || "";
          const decimal = `${base === "" ? "0" : base}.${nextCharacter}`;
          setNativeValue(el, decimal);
          focusAndPlaceCaret(el, decimal.length);
          if (keyboard.current) keyboard.current.setInput(decimal);
          return;
        }
      }
    }

    const value = mutateActiveValue(el, nextCharacter);
    if (keyboard.current) keyboard.current.setInput(value);
  }, []);

  // Devices with a native soft keyboard (phones/tablets) get nothing from us —
  // not even the toggle — so the OS keyboard is the only one that ever appears.
  if (nativeKeyboard.current) return null;

  return (
    <>
      {/* Enable/disable toggle — always reachable so a shop can switch it per
          device. */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() =>
          setEnabled((wasEnabled) => {
            const nextEnabled = !wasEnabled;
            if (nextEnabled) window.setTimeout(showForCurrentField, 0);
            return nextEnabled;
          })
        }
        title={enabled ? "Turn off on-screen keyboard" : "Turn on on-screen keyboard"}
        aria-label={enabled ? "Turn off on-screen keyboard" : "Turn on on-screen keyboard"}
        className={`no-print fixed bottom-3 right-3 z-[60] flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition ${
          enabled ? "bg-blue-700 text-white hover:bg-blue-600" : "bg-slate-700 text-white/80 hover:bg-slate-600"
        }`}
      >
        {enabled ? <MdKeyboard className="h-5 w-5" /> : <MdKeyboardHide className="h-5 w-5" />}
      </button>

      {enabled && visible && (
        <div
          // preventDefault on mousedown keeps the focused field focused when a key
          // is tapped, so typing lands in the right place.
          onMouseDown={(e) => e.preventDefault()}
          ref={keyboardPanel}
          className={`no-print fixed inset-x-0 bottom-0 z-[55] border-t border-slate-700 bg-slate-900 px-1 py-2 shadow-2xl ${
            keyboardMode === "numeric" ? "osk-numeric" : "osk-text"
          }`}
        >
          {/* Sizing only — WHICH keyboard appears is decided above by
              `keyboardMode`, from isNumericField(): a number/decimal field gets
              the pad, everything else gets the full layout.

              Both caps are the shop's 20% cut: 1380px is 1725 less a fifth, and
              the pad's 410px is the same fraction off Tailwind's max-w-lg. The
              key heights in index.css come down by the same amount, so the bar
              shrinks in proportion rather than turning into a wide flat strip.

              The letter cap only bites on a display wide enough to reach it; on
              a narrower window the row already runs the full width, and the side
              padding above (px-1) is what buys the last few pixels there. */}
          <div
            className={`mx-auto w-full ${
              keyboardMode === "numeric" ? "max-w-[410px]" : "max-w-[1380px]"
            }`}
          >
            <div className="mb-1 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setVisible(false);
                  if (activeEl.current) activeEl.current.blur();
                }}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                <FiX className="h-4 w-4" /> Close
              </button>
            </div>
            {keyboardMode === "numeric" ? (
              <div className="pos-numeric-keypad" role="group" aria-label="Numeric keypad">
                {NUMERIC_KEY_ROWS.map((row, rowIndex) => (
                  <div
                    key={`numeric-row-${rowIndex}`}
                    className={`pos-numeric-keypad-row ${
                      row.length === 1 ? "pos-numeric-keypad-row-single" : ""
                    }`}
                  >
                    {row.map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={`pos-numeric-key ${
                          key === "{bksp}" ? "pos-numeric-key-action" : ""
                        } ${key === "{enter}" ? "pos-numeric-key-done" : ""}`}
                        onClick={() => onKeyPress(key)}
                      >
                        {key === "{bksp}" ? "⌫" : key === "{enter}" ? "Done" : key}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <Keyboard
                keyboardRef={(r) => (keyboard.current = r)}
                layout={KEYBOARD_LAYOUTS}
                layoutName={layoutName}
                display={KEYBOARD_DISPLAY}
                onChange={onChange}
                onKeyPress={onKeyPress}
                theme="hg-theme-default osk-dark"
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default VirtualKeyboard;
