import React from "react";
import { FiX } from "react-icons/fi";

// Shared overlay shell for every POS dialog.
function PosModal({ title, subtitle, onClose, children, footer, width = "max-w-2xl" }) {
  return (
    <div className="pos-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        className={`pos-modal-panel flex max-h-[90vh] w-full ${width} flex-col overflow-hidden border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-700 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
            aria-label="Close"
          >
            <FiX className="h-5 w-5" />
          </button>
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
