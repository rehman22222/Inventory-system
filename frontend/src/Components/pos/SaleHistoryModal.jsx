import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiLock, FiRefreshCw } from "react-icons/fi";
import toast from "react-hot-toast";
import axiosInstance from "../../lib/axios";
import PosModal from "./PosModal";
import { currency } from "./posUtils";

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

function SaleHistoryModal({ canRefund, onRefund, onReprint, onClose }) {
  const { t } = useTranslation();
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

  return (
    <PosModal
      title={t("pos.history.title")}
      subtitle={t("pos.history.subtitle")}
      onClose={onClose}
    >
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

                  <span className="w-24 text-end font-semibold tabular-nums">
                    {currency(receipt.total)}
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
