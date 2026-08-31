import React from "react";
import { FiArrowLeft, FiX } from "react-icons/fi";

// Shared overlay shell for every POS dialog.
//
// A dialog reached from somewhere — the tender screen opened off a CASH button
// — takes `onBack` instead of a title, and gets an arrow in the corner rather
// than a cross. It is the same journey backwards: the cashier came from the
// basket and is going back to it, not dismissing something that appeared.
function PosModal({ title, subtitle, onClose, onBack, children, footer, width = "max-w-2xl" }) {
  const bare = !title && !subtitle;

  return (
    <div className="pos-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        className={`pos-modal-panel flex max-h-[90vh] w-full ${width} flex-col overflow-hidden border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl`}
      >
        <div
          className={`flex items-start gap-4 border-b border-slate-700 px-5 ${
            bare ? "py-2" : "py-4"
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
