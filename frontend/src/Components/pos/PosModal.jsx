import React from "react";
import { FiArrowLeft, FiX } from "react-icons/fi";

// Shared overlay shell for every POS dialog.
//
// A dialog reached from somewhere — the tender screen opened off a CASH button
// — takes `onBack` instead of a title, and gets an arrow in the corner rather
// than a cross. It is the same journey backwards: the cashier came from the
// basket and is going back to it, not dismissing something that appeared.
function PosModal({
  title,
  subtitle,
  onClose,
  onBack,
  // Anything the dialog wants to keep in view at all times — the tender
  // screen puts the balance up here so it survives whatever the body is doing.
  headerRight,
  children,
  footer,
  width = "max-w-2xl",
}) {
  const bare = !title && !subtitle;

  return (
    <div className="pos-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        className={`pos-modal-panel flex max-h-[90vh] w-full ${width} flex-col overflow-hidden border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl`}
      >
        <div
          className={`relative flex items-start gap-4 border-b border-slate-700 px-5 ${
            bare ? "py-3" : "py-4"
          }`}
        >
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="-ms-2 p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
              aria-label="Back"
            >
              <FiArrowLeft className="h-5 w-5" />
            </button>
          )}

          <div className="min-w-0 flex-1">
            {title && <h2 className="text-lg font-semibold">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
          </div>

          {/* Centred on the dialog rather than pushed to one end, and laid
              over the bar rather than in it: whatever this carries is the
              thing being looked at, and it should sit in the middle of the
              screen it belongs to. It takes no clicks, so the back arrow
              underneath keeps working right across the bar. */}
          {headerRight && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-14">
              {headerRight}
            </div>
          )}

          {/* An arrow and a cross side by side are two ways to do one thing,
              and a cashier reading the screen has to decide which. Whichever
              way out this dialog offers, it offers only one. */}
          {!onBack && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
              aria-label="Close"
            >
              <FiX className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-slate-700 px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default PosModal;
