import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { FiLock, FiPrinter, FiRefreshCw } from "react-icons/fi";
import toast from "react-hot-toast";
import axiosInstance from "../../lib/axios";
import PosModal from "./PosModal";
import { HistoryTabs } from "./HistoryTabs";
import { currency, printSlip } from "./posUtils";

const STATUS_TONE = {
  completed: "text-emerald-400",
  voided: "text-red-400",
  refunded: "text-red-400",
  "partially-refunded": "text-amber-400",
};

const METHOD_TONE = {
  cash: "bg-emerald-950 text-emerald-300 ring-emerald-800",
  creditcard: "bg-blue-950 text-blue-300 ring-blue-800",
  wallet: "bg-violet-950 text-violet-300 ring-violet-800",
  split: "bg-amber-950 text-amber-300 ring-amber-800",
};

function SaleHistoryModal({ canRefund, onRefund, onReprint, onShowRefunds, onClose }) {
  const { t } = useTranslation();
  const { store: SHOP } = useSelector((state) => state.store);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null); // receipt being toggled

  useEffect(() => {
    let alive = true;

    axiosInstance
      .get("pos/receipts", { params: { limit: 50 } })
      .then((response) => {
        if (alive) setReceipts(response.data.receipts || []);
      })
      .catch((error) => {
        toast.error(error.response?.data?.message || t("pos.history.failed"));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [t]);

  // One-tap switch between cash and card — for when the cashier tapped the wrong
  // tender. Anything else (wallet/split) flips to cash first, then toggles.
  const toggleMethod = async (receipt) => {
    const next = receipt.paymentMethod === "cash" ? "creditcard" : "cash";
    setBusyId(receipt._id);
    try {
      const response = await axiosInstance.patch(
        `pos/receipt/${receipt.receiptNo}/payment`,
        { paymentMethod: next }
      );
      const updated = response.data.receipt;
      setReceipts((current) =>
        current.map((entry) => (entry._id === updated._id ? updated : entry))
      );
      toast.success(t("pos.history.paymentChanged"));
    } catch (error) {
      toast.error(error.response?.data?.message || t("pos.history.changeFailed"));
    } finally {
      setBusyId(null);
    }
  };

  // What has gone back out on one receipt. A receipt can be refunded more than
  // once, and a partial refund leaves the original total standing, so the only
  // honest figure is the sum of its refunds.
  const refundedOn = (receipt) =>
    (receipt.refunds || []).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  // Three figures, because they answer three different questions: what was rung
  // up, what went back, and what the shop actually kept. A voided or refunded
  // row still carries its original total, so a list that only added those up
  // would report money the till does not have.
  const round = (value) => Number(value.toFixed(2));
  const gross = round(receipts.reduce((sum, entry) => sum + Number(entry.total || 0), 0));
  const refunded = round(receipts.reduce((sum, entry) => sum + refundedOn(entry), 0));
  const takings = round(gross - refunded);

  return (
    <PosModal
      title={t("pos.history.title")}
      subtitle={t("pos.history.subtitle")}
      onClose={onClose}
      footer={
        receipts.length > 0 && (
          <>
            <span className="me-auto text-sm text-slate-400">
              {receipts.length} ·{" "}
              <span className="font-semibold text-slate-100">{currency(takings)}</span>
              {/* Only worth saying when something actually went back. */}
              {refunded > 0 && (
                <span className="ms-2 text-xs text-red-400">
                  {t("dayClosing.refunded")} -{currency(refunded)}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => printSlip("sale-history-print")}
              className="flex items-center gap-2 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700"
            >
              <FiPrinter className="h-4 w-4" />
              {t("dayClosing.print", "Print")}
            </button>
          </>
        )
      }
    >
      <HistoryTabs active="sales" onSales={() => {}} onRefunds={onShowRefunds} t={t} />

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">{t("pos.processing")}</p>
      ) : receipts.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">{t("pos.history.empty")}</p>
      ) : (
        <div className="space-y-1">
          {receipts.map((receipt) => {
            const target =
              receipt.paymentMethod === "cash" ? "creditcard" : "cash";
            return (
              <div key={receipt._id} className="border border-slate-800 bg-slate-950">
                <div className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-semibold">{receipt.receiptNo}</p>
                    <p className="truncate text-xs text-slate-500">
                      {new Date(receipt.createdAt).toLocaleString()} · {receipt.customerName} ·{" "}
                      {t("pos.history.items", { count: receipt.items?.length || 0 })}
                    </p>
                  </div>

                  <PaymentBadge receipt={receipt} />

                  <span
                    className={`hidden text-[11px] font-semibold uppercase sm:block ${
                      STATUS_TONE[receipt.status] || "text-slate-400"
                    }`}
                  >
                    {receipt.status}
                  </span>

                  <span className="w-24 text-end tabular-nums">
                    {/* The original total stays put — it is what the customer
                        was charged — with what came back underneath it. */}
                    <span className="block font-semibold">{currency(receipt.total)}</span>
                    {refundedOn(receipt) > 0 && (
                      <span className="block text-[11px] font-semibold text-red-400">
                        -{currency(refundedOn(receipt))}
                      </span>
                    )}
                  </span>

                  <div className="flex gap-1">
                    {/* Simple toggle — switch the tender to the other one. Shows
                        what it will become; locked once the day is closed. */}
                    <button
                      type="button"
                      onClick={() => toggleMethod(receipt)}
                      disabled={Boolean(receipt.dayClosing) || busyId === receipt._id}
                      title={
                        receipt.dayClosing
                          ? t("pos.history.lockedHint")
                          : t("pos.history.changePayment")
                      }
                      className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {receipt.dayClosing ? (
                        <FiLock className="h-3 w-3" />
                      ) : (
                        <FiRefreshCw className={`h-3 w-3 ${busyId === receipt._id ? "animate-spin" : ""}`} />
                      )}
                      {!receipt.dayClosing && t(`common.payments.${target}`, target)}
                    </button>
                    <button
                      type="button"
                      onClick={() => onReprint(receipt)}
                      className="bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                    >
                      {t("pos.history.reprint")}
                    </button>
                    {canRefund &&
                      receipt.status !== "voided" &&
                      receipt.status !== "refunded" && (
                        <button
                          type="button"
                          onClick={() => onRefund(receipt.receiptNo)}
                          className="bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600"
                        >
                          {t("pos.history.refund")}
                        </button>
                      )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* The same list on the 72mm roll. */}
          <div id="sale-history-print" className="slip hidden">
            <div className="s-head">
              <div className="s-shop">{SHOP?.name}</div>
              <div className="s-title">{t("pos.history.title")}</div>
            </div>
            <div className="s-meta">
              <span>{t("dayClosing.printedAt", "Printed")}</span>
              <span>{new Date().toLocaleString()}</span>
            </div>
            <div className="s-rule" />

            {receipts.map((entry) => {
              const back = round(refundedOn(entry));
              return (
                <div key={`slip-${entry.receiptNo}`} className="s-row">
                  <div className="s-row-top">
                    <span>{entry.receiptNo}</span>
                    <span>{currency(entry.total)}</span>
                  </div>
                  <div className="s-row-sub">
                    <span>
                      {new Date(entry.createdAt).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {t(`common.payments.${entry.paymentMethod}`, entry.paymentMethod)}
                    </span>
                    {/* A voided or refunded row still shows its original total,
                        so the state has to travel with it or the column lies. */}
                    <span>{entry.status !== "completed" ? entry.status : ""}</span>
                  </div>
                  {/* Every line on the sale. A receipt number and a total say
                      that a sale happened and nothing about what left the
                      shelf, which is the one thing somebody reading this roll
                      later actually needs. */}
                  {(entry.items || []).map((item, index) => (
                    <div key={`${entry.receiptNo}-${index}`} className="s-item">
                      <span>
                        {item.quantity} × {item.name}
                      </span>
                      <span>{currency(item.lineTotal)}</span>
                    </div>
                  ))}

                  {/* What went back on this one, and what is left of it. Anyone
                      checking the roll against the drawer needs the second
                      figure, and doing that subtraction by hand down a column
                      of fifty receipts is how mistakes get made. */}
                  {back > 0 && (
                    <div className="s-item">
                      <span>
                        {t("dayClosing.refunded")} -{currency(back)}
                      </span>
                      <span>{currency(round(Number(entry.total || 0) - back))}</span>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="s-rule" />
            {/* Rung up, gone back, kept. The last one is the only figure that
                should ever be compared with the drawer, so it is the one set in
                bold at the bottom. */}
            <div className="s-line">
              <span>{t("pos.subtotal", "Subtotal")}</span>
              <span>{currency(gross)}</span>
            </div>
            {refunded > 0 && (
              <div className="s-line">
                <span>{t("dayClosing.refunded")}</span>
                <span>-{currency(refunded)}</span>
              </div>
            )}
            <div className="s-total">
              <span>{t("pos.history.netTakings", "Net takings")}</span>
              <span>{currency(takings)}</span>
            </div>
            <div className="s-line">
              <span>{t("dayClosing.salesCount")}</span>
              <span>{receipts.length}</span>
            </div>
          </div>
        </div>
      )}
    </PosModal>
  );
}

function PaymentBadge({ receipt }) {
  const { t } = useTranslation();
  const method = receipt.paymentMethod;

  return (
    <span
      title={
        method === "split"
          ? (receipt.payments || [])
              .map((p) => `${t(`common.payments.${p.method}`, p.method)} ${p.amount}`)
              .join(" + ")
          : undefined
      }
      className={`shrink-0 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${
        METHOD_TONE[method] || "bg-slate-800 text-slate-400 ring-slate-700"
      }`}
    >
      {t(`common.payments.${method}`, method)}
    </span>
  );
}

export default SaleHistoryModal;
