import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiX, FiAlertTriangle } from "react-icons/fi";

// Deleting a product that is still in use is allowed, but never by accident: it
// takes the item off the storefront with it. The server refuses the first
// attempt and reports what else would go, and this dialog puts that list in
// front of whoever clicked, behind a word they have to type out.
//
// The word is short and fixed rather than the product's own name: this gets
// typed on a touchscreen, where a long name is its own source of mistakes.
function ConfirmDeleteProductModal({ details, busy, onConfirm, onClose }) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");
  const inputRef = useRef(null);

  const word = details?.confirmWord || "DELETE";
  const matches = typed.trim().toUpperCase() === word.toUpperCase();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape closes, so a cashier who opened this by mistake is one key away from
  // leaving it — but only while nothing is in flight.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // One plain sentence per thing that would be taken with it.
  const consequences = useMemo(() => {
    return (details?.blockers || []).map((blocker) => {
      if (blocker.kind === "online") {
        // A whole shop page going takes every other flavour on it with it. That
        // is a much bigger thing than losing one product, so it gets said.
        const stranded = Number(blocker.strandedVariants || 0);
        return {
          key: "online",
          text: t("products.deleteBlockerOnline", { count: blocker.count }),
          detail: [
            (blocker.names || []).join(", "),
            stranded ? t("products.deleteBlockerStranded", { count: stranded }) : "",
          ].filter(Boolean).join(" — "),
          grave: true,
        };
      }
      if (blocker.kind === "deals") {
        return {
          key: "deals",
          text: t("products.deleteBlockerDeals", { count: blocker.count }),
          detail: (blocker.names || []).join(", "),
        };
      }
      return {
        key: "sales",
        text: t("products.deleteBlockerSales", { count: blocker.count }),
        detail: t("products.deleteBlockerSalesNote"),
      };
    });
  }, [details, t]);

  const submit = (event) => {
    event.preventDefault();
    if (!matches || busy) return;
    onConfirm(word);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-base-300 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-lg bg-red-500/10 p-2 text-red-500">
              <FiAlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">{t("products.deleteConfirmTitle")}</h2>
              <p className="mt-0.5 break-words text-sm text-base-content/60">
                {details?.product}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-2 text-base-content/50 hover:bg-base-200 disabled:opacity-40"
            aria-label={t("common.close")}
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <p className="text-sm text-base-content/80">{t("products.deleteConfirmIntro")}</p>

            <ul className="mt-3 space-y-2">
              {consequences.map((item) => (
                <li
                  key={item.key}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    item.grave
                      ? "border-red-500/40 bg-red-500/5"
                      : "border-base-300 bg-base-200/50"
                  }`}
                >
                  <span className="font-medium">{item.text}</span>
                  {item.detail ? (
                    <span className="mt-0.5 block break-words text-xs text-base-content/60">
                      {item.detail}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>

            <label className="mt-4 block text-sm font-medium" htmlFor="confirm-delete-word">
              {t("products.deleteConfirmPrompt", { word })}
            </label>
            <input
              id="confirm-delete-word"
              ref={inputRef}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder={word}
              disabled={busy}
              className="mt-1.5 h-12 w-full rounded-lg border border-base-300 bg-base-100 px-3 font-mono tracking-widest outline-none focus:border-red-500"
            />
          </div>

          <div className="flex gap-2 border-t border-base-300 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="h-12 flex-1 rounded-lg border border-base-300 font-medium hover:bg-base-200 disabled:opacity-40"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={!matches || busy}
              className="h-12 flex-1 rounded-lg bg-red-500 font-medium text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? t("products.deleting") : t("products.deleteConfirmAction")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ConfirmDeleteProductModal;
