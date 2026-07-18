import { useCallback, useEffect, useRef, useState } from "react";
import Keyboard from "react-simple-keyboard";
import "react-simple-keyboard/build/css/index.css";
import { FiX } from "react-icons/fi";
import { MdKeyboard, MdKeyboardHide } from "react-icons/md";

// A global on-screen keyboard for touch monitors (POS tills). When enabled,
// focusing any text field pops a keyboard up from the bottom; tapping keys types
// into that field. A physical keyboard keeps working alongside it. The shop
// turns it on/off with the floating button (remembered per device); it defaults
// ON for touch/coarse-pointer screens and OFF for a normal mouse desktop.

// Which fields the keyboard drives (skip checkboxes, files, pickers, buttons…).
const EDITABLE_SELECTOR =
  'input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]):not([type=color]):not([type=date]):not([type=datetime-local]):not([type=month]):not([type=time]):not([type=week]):not([type=submit]):not([type=button]):not([type=reset]), textarea';

const isEditable = (el) =>
  el && el.matches && el.matches(EDITABLE_SELECTOR) && !el.readOnly && !el.disabled;

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

function VirtualKeyboard() {
  const keyboard = useRef(null);
  const activeEl = useRef(null);

  const [enabled, setEnabled] = useState(() => {
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

  useEffect(() => {
    try {
      localStorage.setItem("osk-enabled", enabled ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (!enabled) setVisible(false);
  }, [enabled]);

  // Bind to whichever editable field is focused.
  useEffect(() => {
    if (!enabled) return undefined;

    const onFocusIn = (e) => {
      const el = e.target;
      if (isEditable(el)) {
        activeEl.current = el;
        setLayoutName("default");
        if (keyboard.current) keyboard.current.setInput(el.value || "");
        setVisible(true);
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
  }, [enabled]);

  const onChange = useCallback((input) => {
    if (activeEl.current) setNativeValue(activeEl.current, input);
  }, []);

  const onKeyPress = useCallback((button) => {
    if (button === "{shift}" || button === "{lock}") {
      setLayoutName((prev) => (prev === "default" ? "shift" : "default"));
      return;
    }
    if (button === "{enter}") {
      const el = activeEl.current;
      if (el && el.tagName !== "TEXTAREA") {
        setVisible(false);
        el.blur();
      }
    }
  }, []);

  return (
    <>
      {/* Enable/disable toggle — always reachable so a shop can switch it per
          device. */}
      <button
        type="button"
        onClick={() => setEnabled((v) => !v)}
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
          className="no-print fixed inset-x-0 bottom-0 z-[55] border-t border-slate-700 bg-slate-900 p-2 shadow-2xl"
        >
          <div className="mx-auto max-w-4xl">
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
            <Keyboard
              keyboardRef={(r) => (keyboard.current = r)}
              layoutName={layoutName}
              onChange={onChange}
              onKeyPress={onKeyPress}
              theme="hg-theme-default osk-dark"
            />
          </div>
        </div>
      )}
    </>
  );
}

export default VirtualKeyboard;
