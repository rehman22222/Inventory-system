import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { FiPrinter, FiRotateCcw } from "react-icons/fi";
import axiosInstance from "../../lib/axios";
import PosModal from "./PosModal";
import {
  currency,
  printSlip,
  REFUND_REASONS,
  refundReasonLabel,
} from "./posUtils";

// What has gone back out over the counter. Built from the receipts rather than
// from a table of its own: a refund belongs to the sale it reverses, and a
// second copy of the same fact is a second thing to keep in step.
function RefundHistoryModal({ onClose }) {
  const { t } = useTranslation();
  const { store: SHOP } = useSelector((state) => state.store);
  const [refunds, setRefunds] = useState(null);

  useEffect(() => {
    let alive = true;

    axiosInstance
      .get("pos/refunds", { params: { limit: 100 } })
      .then((response) => {
        if (alive) setRefunds(response.data.refunds || []);
      })
      .catch((error) => {
        if (!alive) return;
        setRefunds([]);
        toast.error(error.response?.data?.message || t("pos.refund.historyFailed"));
      });

    return () => {
      alive = false;
    };
  }, [t]);

  const total = (refunds || []).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  return (
    <PosModal
      title={t("pos.refund.history", "Refund history")}
      subtitle={t("pos.refund.historySub", "What has gone back over the counter")}
      onClose={onClose}
      footer={
        refunds?.length > 0 && (
          <>
            <span className="me-auto text-sm text-slate-400">
              {refunds.length} ·{" "}
              <span className="font-semibold text-red-400">-{currency(total)}</span>
            </span>
            <button
              type="button"
              onClick={() => printSlip("refund-history-print")}
              className="flex items-center gap-2 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700"
            >
              <FiPrinter className="h-4 w-4" />
              {t("dayClosing.print", "Print")}
            </button>
          </>
        )
      }
    >
      {refunds === null ? (
        <p className="py-10 text-center text-sm text-slate-500">{t("pos.processing")}</p>
      ) : refunds.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-slate-700">
          <FiRotateCcw className="h-10 w-10" strokeWidth={1.25} />
          <p className="text-sm text-slate-600">
            {t("pos.refund.historyEmpty", "Nothing has been refunded yet")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {refunds.map((entry, index) => (
            <div
              key={`${entry.reference || entry.receiptNo}-${index}`}
              className="border border-slate-800 bg-slate-950 px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-100">
                      {/* Refunds put through before they carried their own
                          number fall back to the receipt they reversed. */}
                      {entry.reference || entry.receiptNo}
                    </span>
                    {entry.method && (
                      <span className="bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">
                        {t(`common.payments.${entry.method}`, entry.method)}
                      </span>
                    )}
                    {entry.reason === "void" && (
                      <span className="bg-red-950 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-300">
                        {t("pos.refund.voided", "Void")}
                      </span>
                    )}
                    {/* One of the three set answers, badged beside the method so
                        a month of returns can be read down the column. Anything
                        typed by hand stays as the quote underneath. */}
                    {REFUND_REASONS.includes(entry.reason) && (
                      <span className="bg-amber-950 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                        {refundReasonLabel(t, entry.reason)}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {t("pos.receipt")} {entry.receiptNo} ·{" "}
                    {new Date(entry.at).toLocaleString(undefined, {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {entry.by ? ` · ${entry.by}` : ""}
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums text-red-400">
                  -{currency(entry.amount)}
                </span>
              </div>

              {entry.items?.length > 0 && (
                <ul className="mt-2 space-y-0.5 border-t border-slate-900 pt-2">
                  {entry.items.map((item, i) => (
                    <li
                      key={`${item.name}-${i}`}
                      className="flex justify-between gap-3 text-xs text-slate-500"
                    >
                      <span className="truncate">
                        {item.quantity} × {item.name}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {currency(item.lineTotal)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {entry.reason &&
                entry.reason !== "refund" &&
                entry.reason !== "void" &&
                !REFUND_REASONS.includes(entry.reason) && (
                  <p className="mt-2 text-xs italic text-slate-600">"{entry.reason}"</p>
                )}
            </div>
          ))}

          {/* The same list on the 72mm roll, for the folder the shop keeps. */}
          <div id="refund-history-print" className="slip hidden">
            <div className="s-head">
              <div className="s-shop">{SHOP?.name}</div>
              <div className="s-title">{t("pos.refund.history", "Refund history")}</div>
            </div>
            <div className="s-meta">
              <span>{t("dayClosing.printedAt", "Printed")}</span>
              <span>{new Date().toLocaleString()}</span>
            </div>
            <div className="s-rule" />

            {refunds.map((entry, index) => (
              <div key={`slip-${entry.reference || entry.receiptNo}-${index}`} className="s-row">
                <div className="s-row-top">
                  <span>{entry.reference || entry.receiptNo}</span>
                  <span>-{currency(entry.amount)}</span>
                </div>
                <div className="s-row-sub">
                  <span>
                    {new Date(entry.at).toLocaleString(undefined, {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {entry.method
                      ? ` · ${t(`common.payments.${entry.method}`, entry.method)}`
                      : ""}
                    {entry.reason && entry.reason !== "refund"
                      ? ` · ${refundReasonLabel(t, entry.reason)}`
                      : ""}
                  </span>
                  <span>{entry.receiptNo}</span>
                </div>
                {(entry.items || []).map((item, i) => (
                  <div key={`slip-item-${i}`} className="s-item">
                    <span>
                      {item.quantity} × {item.name}
                    </span>
                    <span>{currency(item.lineTotal)}</span>
                  </div>
                ))}
              </div>
            ))}

            <div className="s-rule" />
            <div className="s-total">
              <span>{t("dayClosing.refunded")}</span>
              <span>-{currency(total)}</span>
            </div>
            <div className="s-line">
              <span>{t("pos.refund.history", "Refund history")}</span>
              <span>{refunds.length}</span>
            </div>
          </div>
        </div>
      )}
    </PosModal>
  );
}

export default RefundHistoryModal;
