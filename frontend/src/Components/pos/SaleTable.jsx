import React from "react";
import { useTranslation } from "react-i18next";
import { FiMinus, FiPlus, FiShoppingBag, FiTag, FiX } from "react-icons/fi";
import { currency } from "./posUtils";

const COLS = "grid-cols-[1fr_60px_92px_88px] sm:grid-cols-[1fr_92px_104px_110px]";

// The middle sale panel: the running list of lines on this transaction.
function SaleTable({
  cart,
  selectedId,
  dealProductIds,
  onSelect,
  onQuantityChange,
  onRemove,
}) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-950">
      <div
        className={`grid ${COLS} gap-2 border-b border-slate-800 bg-slate-900/80 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500`}
      >
        <span>{t("pos.table.product")}</span>
        <span className="text-end">{t("pos.table.rate")}</span>
        <span className="text-center">{t("pos.table.qty")}</span>
        <span className="text-end">{t("pos.table.total")}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-700">
            <FiShoppingBag className="h-12 w-12" strokeWidth={1.25} />
            <p className="text-sm font-medium text-slate-600">{t("pos.scanOrSelect")}</p>
          </div>
        ) : (
          cart.map((item) => {
            const active = selectedId === item.productId;
            const inDeal = dealProductIds?.has(String(item.productId));

            return (
              <div
                key={item.productId}
                onClick={() => onSelect(item.productId)}
                className={`grid ${COLS} cursor-pointer items-center gap-2 border-b border-slate-900 px-4 py-2.5 text-sm transition ${
                  active
                    ? "bg-cyan-950/50 shadow-[inset_3px_0_0_0_theme(colors.cyan.500)]"
                    : "hover:bg-slate-900/60"
                }`}
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate font-medium text-slate-100">
                    <span className="truncate">{item.name}</span>
                    {inDeal && (
                      <span className="inline-flex shrink-0 items-center gap-1 bg-fuchsia-950 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-fuchsia-300 ring-1 ring-fuchsia-800">
                        <FiTag className="h-2.5 w-2.5" />
                        {t("pos.dealTag")}
                      </span>
                    )}
                  </p>
                  <p className="truncate font-mono text-[11px] text-slate-600">
                    {item.barcode || item.category || t("pos.uncategorized")}
                  </p>
                </div>

                <span className="text-end tabular-nums text-slate-400">
                  {currency(item.price)}
                </span>

                <div className="flex items-center justify-center gap-1">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onQuantityChange(item.productId, item.quantity - 1);
                    }}
                    className="bg-slate-800 p-1.5 text-slate-400 transition hover:bg-slate-700 hover:text-slate-100 active:scale-90"
                    aria-label={t("pos.table.decrease")}
                  >
                    <FiMinus className="h-3 w-3" />
                  </button>
                  <span className="w-7 text-center font-semibold tabular-nums text-slate-100">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onQuantityChange(item.productId, item.quantity + 1);
                    }}
                    className="bg-slate-800 p-1.5 text-slate-400 transition hover:bg-slate-700 hover:text-slate-100 active:scale-90"
                    aria-label={t("pos.table.increase")}
                  >
                    <FiPlus className="h-3 w-3" />
                  </button>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <span className="font-semibold tabular-nums text-slate-100">
                    {currency(item.price * item.quantity)}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove(item.productId);
                    }}
                    className="p-1 text-slate-700 transition hover:bg-red-950 hover:text-red-400"
                    aria-label={t("pos.table.remove")}
                  >
                    <FiX className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default SaleTable;
