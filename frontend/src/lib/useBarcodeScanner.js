import { useEffect, useRef } from "react";

/**
 * Detects whether a keydown target is an editable field we must NOT hijack.
 * Barcode scanners (keyboard-wedge) emit rapid keystrokes ending in Enter while
 * focus is anywhere. If the user is genuinely typing in an input/textarea
 * (search, customer, discount, notes, the barcode field itself, etc.) we bail
 * so normal typing — and the barcode form's own Enter handler — keep working.
 */
const isEditableTarget = (el) => {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  if (tag === "INPUT") {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    const nonEditable = [
      "checkbox",
      "radio",
      "button",
      "submit",
      "reset",
      "range",
      "file",
      "color",
    ];
    return !nonEditable.includes(type);
  }
  return false;
};

/**
 * Global barcode-scanner capture.
 *
 * @param {(code: string) => void} onScan  Called with the scanned code on Enter.
 * @param {object}  options
 * @param {boolean} options.enabled          Master switch (e.g. only on the POS route).
 * @param {number}  options.maxKeyIntervalMs Max gap between keys to still count as one scan.
 * @param {number}  options.timeoutMs        Clear a partial buffer after this idle time.
 * @param {number}  options.minLength        Minimum code length to accept on Enter.
 */
export default function useBarcodeScanner(
  onScan,
  { enabled = true, maxKeyIntervalMs = 50, timeoutMs = 120, minLength = 3 } = {}
) {
  const onScanRef = useRef(onScan);
  const enabledRef = useRef(enabled);
  onScanRef.current = onScan;
  enabledRef.current = enabled;

  useEffect(() => {
    let buffer = "";
    let lastTime = 0;
    let timer = null;

    const reset = () => {
      buffer = "";
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const handleKeyDown = (event) => {
      if (!enabledRef.current) return;
      // Let real typing / the barcode form's Enter handler take over.
      if (isEditableTarget(event.target)) return;
      // Ignore shortcut combos.
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      const now = Date.now();
      // Rapid-input detection: a slow keypress starts a fresh buffer, so stray
      // manual keystrokes on the page body can never accumulate into a scan.
      if (now - lastTime > maxKeyIntervalMs) buffer = "";
      lastTime = now;

      if (event.key === "Enter") {
        const code = buffer.trim();
        reset();
        if (code.length >= minLength) {
          // Prevent Enter from also activating a focused button/link.
          event.preventDefault();
          onScanRef.current?.(code);
        }
        return;
      }

      // Accept printable single characters only.
      if (event.key.length === 1) {
        buffer += event.key;
        if (timer) clearTimeout(timer);
        timer = setTimeout(reset, timeoutMs);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      reset();
    };
  }, [maxKeyIntervalMs, timeoutMs, minLength]);
}
