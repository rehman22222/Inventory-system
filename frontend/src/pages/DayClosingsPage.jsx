import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { FiLock, FiX } from "react-icons/fi";
import {
  gettingallDayClosings,
  gettingDayClosing,
  clearSelectedClosing,
} from "../features/dayClosingSlice";
import ReportButton from "../Components/ReportButton";
// The shop's own currency, not a hard-coded dollar — these are Euro takings.
import { currency } from "../Components/pos/posUtils";

const money = (value) => currency(value);

// The admin's ledger of takings handed over by each cashier at day closing.
function DayClosingsPage() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { closings, selected, isloading, isloadingOne } = useSelector(
    (state) => state.dayClosing
  );
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    dispatch(gettingallDayClosings());
  }, [dispatch]);

  const open = (closing) => {
    setOpenId(closing._id);
    dispatch(gettingDayClosing(closing._id));
  };

  const close = () => {
    setOpenId(null);
    dispatch(clearSelectedClosing());
  };

  const totalHandedOver = closings.reduce((sum, entry) => sum + Number(entry.net || 0), 0);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex items-start gap-3">
        <FiLock className="mt-1 h-6 w-6 text-primary" />
        <div>
          <h1 className="font-display text-2xl font-bold">{t("dayClosings.title")}</h1>
          <p className="mt-1 text-sm text-base-content/60">{t("dayClosings.sub")}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-slate-950 p-5 text-white shadow-sm">
          <h2 className="text-sm font-semibold text-slate-300">{t("dayClosings.batches")}</h2>
          <p className="mt-2 text-2xl font-bold">{closings.length}</p>
        </div>
        <div className="rounded-xl bg-slate-950 p-5 text-white shadow-sm">
          <h2 className="text-sm font-semibold text-slate-300">
            {t("dayClosings.totalHandedOver")}
          </h2>
          <p className="mt-2 text-2xl font-bold">{money(totalHandedOver)}</p>
        </div>
      </div>

      {isloading ? (
        <p className="py-10 text-center text-sm text-base-content/50">{t("dayClosings.loading")}</p>
      ) : closings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-base-300 py-10 text-center text-sm text-base-content/50">
          {t("dayClosings.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full rounded-lg border border-base-300 bg-base-100 shadow-md">
            <thead className="bg-base-200">
              <tr>
                <th className="border px-3 py-2 text-left">{t("dayClosings.reference")}</th>
                <th className="border px-3 py-2 text-left">{t("dayClosings.cashier")}</th>
                <th className="border px-3 py-2 text-left">{t("dayClosings.closedAt")}</th>
                <th className="border px-3 py-2 text-right">{t("dayClosings.sales")}</th>
                <th className="border px-3 py-2 text-right">{t("dayClosings.net")}</th>
                <th className="border px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {closings.map((closing) => (
                <tr key={closing._id}>
                  <td className="border px-3 py-2 font-mono font-semibold">
                    {closing.reference}
                  </td>
                  <td className="border px-3 py-2">
                    {closing.cashierName}
                    <span className="ml-2 rounded bg-base-200 px-1.5 py-0.5 text-[10px] uppercase text-base-content/60">
                      {closing.cashierRole}
                    </span>
                  </td>
                  <td className="border px-3 py-2 text-sm">
                    {new Date(closing.closedAt).toLocaleString()}
                  </td>
                  <td className="border px-3 py-2 text-right tabular-nums">
                    {closing.receiptCount}
                  </td>
                  <td className="border px-3 py-2 text-right font-semibold tabular-nums">
                    {money(closing.net)}
                  </td>
                  <td className="border px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => open(closing)}
                        className="rounded-md bg-blue-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        {t("dayClosings.view")}
                      </button>
                      {/* This batch's own report — every line it was made of.
                          Pinned to PDF: a menu here would be clipped by the
                          table's own scroll container. Open it for CSV/Excel. */}
                      <ReportButton
                        reportKey="day-closing"
                        params={{ id: closing._id }}
                        format="pdf"
                        label={t("dayClosings.report")}
                        className="h-[30px] text-xs"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail */}
      {openId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-base-300 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">
                  {selected?.reference || t("dayClosings.title")}
                </h2>
                {selected && (
                  <p className="mt-0.5 text-sm text-base-content/60">
                    {selected.cashierName} · {new Date(selected.closedAt).toLocaleString()}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {/* This batch, as one report — every line sold, plus the
                    drawer/terminal split to reconcile against. */}
                {selected && (
                  <ReportButton
                    reportKey="day-closing"
                    params={{ id: selected._id }}
                    label={t("dayClosings.report")}
                    className="h-9 text-xs"
                  />
                )}
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg p-2 text-base-content/50 hover:bg-base-200"
                  aria-label={t("dayClosings.close")}
                >
                  <FiX className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {isloadingOne || !selected ? (
                <p className="py-8 text-center text-sm text-base-content/50">
                  {t("dayClosings.loading")}
                </p>
              ) : (
                <div className="space-y-5">
                  {/* Money */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: t("dayClosings.gross"), value: selected.gross },
                      { label: t("dayClosings.discount"), value: selected.discount },
                      { label: t("dayClosings.tax"), value: selected.tax },
                      { label: t("dayClosings.net"), value: selected.net },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-lg border border-base-300 bg-base-200/40 p-3"
                      >
                        <p className="text-[11px] font-semibold uppercase text-base-content/50">
                          {stat.label}
                        </p>
                        <p className="mt-1 font-bold tabular-nums">{money(stat.value)}</p>
                      </div>
                    ))}
                  </div>

                  {/* By payment method */}
                  <div>
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-base-content/60">
                      {t("dayClosing.byMethod")}
                    </h3>
                    <div className="space-y-1.5 rounded-lg border border-base-300 p-3">
                      {(selected.byMethod || []).map((entry) => (
                        <div key={entry.method} className="flex justify-between text-sm">
                          <span className="text-base-content/70">
                            {t(`common.payments.${entry.method}`, entry.method)}
                          </span>
                          <span className="tabular-nums font-medium">{money(entry.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Receipts in the batch, with what was actually sold on each —
                      a list of totals alone tells the admin nothing about where
                      the money came from. */}
                  <div>
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-base-content/60">
                      {t("dayClosings.receipts", { count: selected.receiptCount })}
                    </h3>
                    <div className="divide-y divide-base-200 rounded-lg border border-base-300">
                      {(selected.receipts || []).map((receipt) => (
                        <div key={receipt._id || receipt.receiptNo} className="px-3 py-2">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="font-mono font-medium">{receipt.receiptNo}</span>
                            <span className="min-w-0 flex-1 truncate text-base-content/60">
                              {receipt.customerName}
                            </span>
                            <span className="text-xs text-base-content/50">
                              {new Date(receipt.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                receipt.status === "completed"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {receipt.status}
                            </span>
                            <span className="w-20 text-end tabular-nums font-semibold">
                              {money(receipt.total)}
                            </span>
                          </div>

                          {(receipt.items || []).length > 0 && (
                            <div className="mt-1 space-y-0.5 ps-1">
                              {receipt.items.map((item, i) => (
                                <div
                                  key={i}
                                  className="flex justify-between gap-3 text-xs text-base-content/60"
                                >
                                  <span className="min-w-0 truncate">
                                    {item.quantity} × {item.name}
                                  </span>
                                  <span className="shrink-0 tabular-nums">
                                    {money(item.lineTotal)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DayClosingsPage;
