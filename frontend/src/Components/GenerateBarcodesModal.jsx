import React, { useState } from "react";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import { FiPrinter, FiX } from "react-icons/fi";
import toast from "react-hot-toast";
import { generateRandomBarcodes, gettingallproducts } from "../features/productSlice";
import BarcodeLabel from "./BarcodeLabel";

// Generate a batch of price-point barcodes for the permanent "Random" category —
// for generic items that have no manufacturer barcode. The result can be printed
// as a simple label sheet.
function GenerateBarcodesModal({ onClose }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();

  const [count, setCount] = useState("50");
  const [tiers, setTiers] = useState("5, 10, 15");
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState([]);

  const submit = async (event) => {
    event.preventDefault();

    const parsedCount = Math.floor(Number(count));
    const parsedTiers = tiers
      .split(/[,\s]+/)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (!parsedCount || parsedCount < 1) {
      toast.error(t("generate.invalidCount"));
      return;
    }
    if (parsedTiers.length === 0) {
      toast.error(t("generate.invalidTiers"));
      return;
    }

    setBusy(true);
    const result = await dispatch(
      generateRandomBarcodes({ count: parsedCount, tiers: parsedTiers })
    );
    setBusy(false);

    if (result.error) {
      toast.error(result.payload || t("generate.failed"));
      return;
    }

    setGenerated(result.payload.products || []);
    toast.success(t("generate.done", { count: result.payload.products?.length || 0 }));
    dispatch(gettingallproducts());
  };

  // The app's default print page is an 80mm receipt roll (set in index.css for
  // the POS). Labels go on a normal sheet, so override @page just for this
  // print — a rule appended last wins the cascade.
  const printLabels = () => {
    const style = document.createElement("style");
    style.textContent = "@page { size: A4; margin: 8mm; }";
    document.head.appendChild(style);

    const cleanup = () => {
      style.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);

    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-2xl">
        <div className="no-print flex items-start justify-between gap-4 border-b border-base-300 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">{t("generate.title")}</h2>
            <p className="mt-0.5 text-sm text-base-content/60">{t("generate.sub")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-base-content/50 hover:bg-base-200"
            aria-label={t("generate.close")}
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {generated.length === 0 ? (
            <form onSubmit={submit} className="no-print space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-base-content/60">
                  {t("generate.count")}
                </label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  className="h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-3"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-base-content/60">
                  {t("generate.tiers")}
                </label>
                <input
                  value={tiers}
                  onChange={(e) => setTiers(e.target.value)}
                  placeholder="5, 10, 15"
                  className="h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-3"
                />
                <p className="mt-1 text-xs text-base-content/50">{t("generate.tiersHint")}</p>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="h-11 w-full rounded-lg bg-blue-800 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? t("generate.generating") : t("generate.generate")}
              </button>
            </form>
          ) : (
            <div id="barcode-sheet">
              <p className="no-print mb-3 text-sm text-base-content/60">
                {t("generate.resultHint", { count: generated.length })}
              </p>
              <div className="bc-grid grid grid-cols-2 gap-2 sm:grid-cols-3">
                {generated.map((product) => (
                  <BarcodeLabel
                    key={product._id}
                    code={product.barcode}
                    price={product.Price}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {generated.length > 0 && (
          <div className="no-print flex items-center justify-end gap-3 border-t border-base-300 px-5 py-4">
            <button
              type="button"
              onClick={() => setGenerated([])}
              className="rounded-lg bg-base-200 px-4 py-2 text-sm font-semibold hover:bg-base-300"
            >
              {t("generate.again")}
            </button>
            <button
              type="button"
              onClick={printLabels}
              className="flex items-center gap-2 rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <FiPrinter className="h-4 w-4" />
              {t("generate.print")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default GenerateBarcodesModal;
