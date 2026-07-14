import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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

function SaleHistoryModal({ canRefund, onRefund, onReprint, onClose }) {
  const { t } = useTranslation();
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <PosModal title={t("pos.history.title")} subtitle={t("pos.history.subtitle")} onClose={onClose}>
      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">{t("pos.processing")}</p>
      ) : receipts.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">{t("pos.history.empty")}</p>
      ) : (
        <div className="space-y-1">
          {receipts.map((receipt) => (
            <div
              key={receipt._id}
              className="flex items-center gap-3 border border-slate-800 bg-slate-950 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-semibold">{receipt.receiptNo}</p>
                <p className="truncate text-xs text-slate-500">
                  {new Date(receipt.createdAt).toLocaleString()} · {receipt.customerName} ·{" "}
                  {t("pos.history.items", { count: receipt.items?.length || 0 })}
                </p>
              </div>

              <span
                className={`text-[11px] font-semibold uppercase ${
                  STATUS_TONE[receipt.status] || "text-slate-400"
                }`}
              >
                {receipt.status}
              </span>

              <span className="w-24 text-end font-semibold tabular-nums">
                {currency(receipt.total)}
              </span>

              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => onReprint(receipt)}
                  className="bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                >
                  {t("pos.history.reprint")}
                </button>
                {canRefund && receipt.status !== "voided" && receipt.status !== "refunded" && (
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
          ))}
        </div>
      )}
    </PosModal>
  );
}

export default SaleHistoryModal;
