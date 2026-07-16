import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiEdit2, FiLock } from "react-icons/fi";
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

const METHODS = ["cash", "creditcard", "wallet"];

function SaleHistoryModal({ canRefund, onRefund, onReprint, onClose }) {
  const { t } = useTranslation();
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // receiptNo being re-tendered

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

  const applyChange = (updated) => {
    setReceipts((current) =>
      current.map((entry) => (entry._id === updated._id ? updated : entry))
    );
    setEditing(null);
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
          {receipts.map((receipt) => (
            <div key={receipt._id} className="border border-slate-800 bg-slate-950">
              <div className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-semibold">{receipt.receiptNo}</p>
                  <p className="truncate text-xs text-slate-500">
                    {new Date(receipt.createdAt).toLocaleString()} · {receipt.customerName} ·{" "}
                    {t("pos.history.items", { count: receipt.items?.length || 0 })}
                  </p>
                </div>

                {/* How it was settled — the thing a cashier needs to spot at a
                    glance when they realise they tapped the wrong tender. */}
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
                  <button
                    type="button"
                    onClick={() =>
                      setEditing(editing === receipt.receiptNo ? null : receipt.receiptNo)
                    }
                    disabled={Boolean(receipt.dayClosing)}
                    title={
                      receipt.dayClosing
                        ? t("pos.history.lockedHint")
                        : t("pos.history.changePayment")
                    }
                    className="flex items-center gap-1 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {receipt.dayClosing ? (
                      <FiLock className="h-3 w-3" />
                    ) : (
                      <FiEdit2 className="h-3 w-3" />
                    )}
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

              {editing === receipt.receiptNo && (
                <ChangePayment
                  receipt={receipt}
                  onDone={applyChange}
                  onCancel={() => setEditing(null)}
                />
              )}
            </div>
          ))}
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

// Re-tender an open sale: one method, or a split that must add up to the total.
function ChangePayment({ receipt, onDone, onCancel }) {
  const { t } = useTranslation();
  const total = Number(receipt.total || 0);

  const [split, setSplit] = useState(receipt.paymentMethod === "split");
  const [method, setMethod] = useState(
    receipt.paymentMethod === "split" ? "cash" : receipt.paymentMethod
  );
  const [rows, setRows] = useState(() =>
    receipt.payments?.length > 0
      ? receipt.payments.map((p) => ({ method: p.method, amount: String(p.amount) }))
      : [{ method: "cash", amount: String(total) }]
  );
  const [busy, setBusy] = useState(false);

  const entered = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const remaining = Math.round((total - entered) * 100) / 100;

  const save = async () => {
    setBusy(true);
    try {
      const body = split
        ? { payments: rows.map((r) => ({ method: r.method, amount: Number(r.amount) || 0 })) }
        : { paymentMethod: method };

      const response = await axiosInstance.patch(
        `pos/receipt/${receipt.receiptNo}/payment`,
        body
      );
      toast.success(t("pos.history.paymentChanged"));
      onDone(response.data.receipt);
    } catch (error) {
      toast.error(error.response?.data?.message || t("pos.history.changeFailed"));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-slate-800 bg-black/40 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          {t("pos.history.changePayment")}
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-400">
          <input
            type="checkbox"
            checked={split}
            onChange={(event) => setSplit(event.target.checked)}
            className="h-3.5 w-3.5 accent-cyan-500"
          />
          {t("pos.history.splitPayment")}
        </label>
      </div>

      {!split ? (
        <div className="flex flex-wrap gap-1.5">
          {METHODS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMethod(value)}
              className={`px-3 py-2 text-xs font-bold uppercase transition ${
                method === value
                  ? "bg-cyan-700 text-white ring-1 ring-cyan-500"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              {t(`common.payments.${value}`, value)}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((row, index) => (
            <div key={index} className="flex gap-1.5">
              <select
                value={row.method}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((r, i) =>
                      i === index ? { ...r, method: event.target.value } : r
                    )
                  )
                }
                className="flex-1 border border-slate-800 bg-black px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-600"
              >
                {METHODS.map((value) => (
                  <option key={value} value={value}>
                    {t(`common.payments.${value}`, value)}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                min="0"
                value={row.amount}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((r, i) =>
                      i === index ? { ...r, amount: event.target.value } : r
                    )
                  )
                }
                className="w-24 border border-slate-800 bg-black px-2 py-1.5 text-end text-xs tabular-nums text-slate-100 outline-none focus:border-cyan-600"
              />
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                  className="bg-slate-800 px-2 text-xs text-slate-400 hover:bg-red-950 hover:text-red-400"
                >
                  ×
                </button>
              )}
            </div>
          ))}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() =>
                setRows((current) => [
                  ...current,
                  { method: "creditcard", amount: String(Math.max(0, remaining)) },
                ])
              }
              className="bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-700"
            >
              + {t("pos.history.addPayment")}
            </button>
            <span
              className={`text-[11px] font-semibold tabular-nums ${
                Math.abs(remaining) < 0.005 ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {t("pos.history.mustTotal", { total: currency(total) })}
              {Math.abs(remaining) >= 0.005 && ` · ${currency(remaining)}`}
            </span>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
        >
          {t("pos.refund.cancel")}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy || (split && Math.abs(remaining) >= 0.005)}
          className="bg-cyan-700 px-4 py-1.5 text-xs font-bold uppercase text-white hover:bg-cyan-600 disabled:opacity-40"
        >
          {busy ? t("pos.processing") : t("pos.history.savePayment")}
        </button>
      </div>
    </div>
  );
}

export default SaleHistoryModal;
