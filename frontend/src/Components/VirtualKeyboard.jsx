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

const KEYBOARD_LAYOUTS = {
  default: [
    "` 1 2 3 4 5 6 7 8 9 0 - = {bksp}",
    "{tab} q w e r t y u i o p [ ] \\",
    "{lock} a s d f g h j k l ; ' {enter}",
    "{shift} z x c v b n m , . / {shift}",
    ".com @ {space}",
  ],
  shift: [
    "~ ! @ # $ % ^ & * ( ) _ + {bksp}",
    "{tab} Q W E R T Y U I O P { } |",
    "{lock} A S D F G H J K L : \" {enter}",
    "{shift} Z X C V B N M < > ? {shift}",
    ".com @ {space}",
  ],
  numeric: [
    "1 2 3",
    "4 5 6",
    "7 8 9",
    ". 0 {bksp}",
    "{enter}",
  ],
};

const KEYBOARD_DISPLAY = {
  "{bksp}": "backspace",
  "{enter}": "< enter",
  "{tab}": "tab",
  "{lock}": "caps",
  "{shift}": "shift",
  "{space}": " ",
};

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
const setNativeValue = (el, value) => {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
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

  setNativeValue(el, nextValue);
  focusAndPlaceCaret(el, nextCaret);
  return nextValue;
};

function VirtualKeyboard() {
  const keyboard = useRef(null);
  const keyboardPanel = useRef(null);
  const activeEl = useRef(null);
  const lastEditableEl = useRef(null);
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
  const [layoutName, setLayoutName] = useState("default");
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
    const nextMode = isNumericField(el) ? "numeric" : "text";
    setKeyboardMode(nextMode);
    setLayoutName(nextMode === "numeric" ? "numeric" : "default");
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
        const nextMode = isNumericField(el) ? "numeric" : "text";
        setKeyboardMode(nextMode);
        setLayoutName(nextMode === "numeric" ? "numeric" : "default");
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
        if (!isEditable(now)) {
          activeEl.current = null;
          setVisible(false);
        }
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

    if (layoutName === "numeric" && (button === "{shift}" || button === "{lock}" || button === "{tab}")) {
      return;
    }

    if (button === "{shift}" || button === "{lock}") {
      setLayoutName((prev) => (prev === "default" ? "shift" : "default"));
      return;
    }

    if (button === "{enter}") {
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

    const value = mutateActiveValue(el, nextCharacter);
    if (keyboard.current) keyboard.current.setInput(value);

    if (layoutName === "shift") {
      setLayoutName("default");
    }
  }, [layoutName]);

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
          className={`no-print fixed inset-x-0 bottom-0 z-[55] border-t border-slate-700 bg-slate-900 p-2 shadow-2xl ${
            keyboardMode === "numeric" ? "osk-numeric" : "osk-text"
          }`}
        >
          <div className={`mx-auto ${keyboardMode === "numeric" ? "max-w-md" : "max-w-4xl"}`}>
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
