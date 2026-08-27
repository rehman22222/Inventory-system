import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { FiMinus, FiPlus } from "react-icons/fi";
import axiosInstance from "../../lib/axios";
import PosModal from "./PosModal";
import { currency } from "./posUtils";

// Refund a whole receipt or just some of its lines. Admin/manager only —
// the backend enforces that too.
function RefundModal({ initialReceiptNo = "", onDone, onClose }) {
  const { t } = useTranslation();
  const [receiptNo, setReceiptNo] = useState(initialReceiptNo);
  const [receipt, setReceipt] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  // How many of each line are still refundable after earlier partial refunds.
  const outstandingOf = (loaded, item) => {
    const already = (loaded.refunds || []).reduce((sum, refund) => {
      const match = (refund.items || []).find(
        (entry) => String(entry.product) === String(item.product)
      );
      return sum + (match ? Number(match.quantity || 0) : 0);
    }, 0);
    return item.quantity - already;
  };

  const lookup = useCallback(
    async (code) => {
      const value = String(code || "").trim();
      if (!value) return;

      setBusy(true);
      try {
        const response = await axiosInstance.get(`pos/receipt/${value.toUpperCase()}`);
        const loaded = response.data.receipt;
        setReceipt(loaded);
        // Nothing is selected until the cashier picks it. Starting with the whole
        // receipt selected means one stray tap on Confirm sends back a basket the
        // customer never returned, and a partial return is the ordinary case —
        // "one of these five", not "all of it". Select all covers the rest.
        setQuantities({});
      } catch (error) {
        setReceipt(null);
        toast.error(error.response?.data?.message || t("pos.refund.notFound"));
      } finally {
        setBusy(false);
      }
    },
    [t]
  );

  useEffect(() => {
    if (initialReceiptNo) lookup(initialReceiptNo);
  }, [initialReceiptNo, lookup]);

  const setQuantity = (productId, next, max) => {
    setQuantities((current) => ({
      ...current,
      [productId]: Math.max(0, Math.min(Number(next) || 0, max)),
    }));
  };

  // Voiding a whole receipt is still one tap, now that nothing starts selected.
  const selectAll = () => {
    if (!receipt) return;
    setQuantities(
      Object.fromEntries(
        receipt.items.map((item) => [String(item.product), outstandingOf(receipt, item)])
      )
    );
  };

  const selectedCount = Object.values(quantities).reduce(
    (sum, value) => sum + Number(value || 0),
    0
  );

  const refundTotal = receipt
    ? receipt.items.reduce((sum, item) => {
        const quantity = quantities[String(item.product)] || 0;
        const ratio = receipt.subtotal ? receipt.total / receipt.subtotal : 1;
        return sum + item.price * quantity * ratio;
      }, 0)
    : 0;

  const submit = async () => {
    const items = receipt.items
      .map((item) => ({
        product: item.product,
        quantity: quantities[String(item.product)] || 0,
      }))
      .filter((item) => item.quantity > 0);

    if (items.length === 0) {
      toast.error(t("pos.refund.selectSomething"));
      return;
    }

    setBusy(true);
    try {
      const response = await axiosInstance.post("pos/refund", {
        receiptNo: receipt.receiptNo,
        items,
        reason: reason.trim() || undefined,
      });
      toast.success(
        t("pos.refund.done", { amount: currency(response.data.amount) })
      );
      onDone?.();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || t("pos.refund.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PosModal
      title={t("pos.refund.title")}
      subtitle={t("pos.refund.subtitle")}
      onClose={onClose}
      footer={
        receipt && (
          <>
            <span className="me-auto text-sm text-slate-400">
              {t("pos.refund.refunding")}:{" "}
              <span className="font-semibold text-slate-100">{currency(refundTotal)}</span>
            </span>
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700"
            >
              {t("pos.refund.cancel")}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy || selectedCount === 0}
              className="bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
            >
              {busy ? t("pos.processing") : t("pos.refund.confirm")}
            </button>
          </>
        )
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          lookup(receiptNo);
        }}
        className="mb-4 flex gap-2"
      >
        <input
          autoFocus
          value={receiptNo}
          onChange={(event) => setReceiptNo(event.target.value)}
          placeholder={t("pos.refund.receiptPlaceholder")}
          className="flex-1 border border-slate-700 bg-slate-950 px-3 py-2 font-mono uppercase text-slate-100 outline-none focus:border-cyan-500"
        />
        <button
          type="submit"
          disabled={busy}
          className="bg-cyan-700 px-5 py-2 font-semibold text-white hover:bg-cyan-600 disabled:opacity-50"
        >
          {t("pos.refund.find")}
        </button>
      </form>

      {receipt && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1 border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-400">
            <span>
              {t("pos.customer")}:{" "}
              <span className="text-slate-200">{receipt.customerName}</span>
            </span>
            <span>
              {t("pos.cashier")}: <span className="text-slate-200">{receipt.cashierName}</span>
            </span>
            <span>
              {t("pos.total")}:{" "}
              <span className="text-slate-200">{currency(receipt.total)}</span>
            </span>
            <span>
              {t("pos.refund.status")}:{" "}
              <span className="text-amber-400">{receipt.status}</span>
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              {t("pos.refund.chooseItems", "Choose what the customer brought back")}
            </span>
            <button
              type="button"
              onClick={selectAll}
              className="border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:border-slate-500 hover:text-slate-100"
            >
              {t("pos.refund.selectAll", "Select all")}
            </button>
          </div>

          <div className="space-y-1">
            {receipt.items.map((item) => {
              const key = String(item.product);
              const max = outstandingOf(receipt, item);
              const value = quantities[key] || 0;

              return (
                <div
                  key={key}
                  className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 border px-3 py-2 ${
                    max === 0
                      ? "border-slate-900 bg-slate-950 opacity-50"
                      : "border-slate-800 bg-slate-950"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-slate-500">
                      {currency(item.price)} ·{" "}
                      {t("pos.refund.refundable", { count: max, sold: item.quantity })}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={max === 0}
                      onClick={() => setQuantity(key, value - 1, max)}
                      className="bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 disabled:opacity-30"
                    >
                      <FiMinus className="h-3 w-3" />
                    </button>
                    <span className="w-8 text-center tabular-nums font-semibold">{value}</span>
                    <button
                      type="button"
                      disabled={max === 0}
                      onClick={() => setQuantity(key, value + 1, max)}
                      className="bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 disabled:opacity-30"
                    >
                      <FiPlus className="h-3 w-3" />
                    </button>
                  </div>

                  <span className="w-20 text-end text-sm font-semibold tabular-nums">
                    {currency(item.price * value)}
                  </span>
                </div>
              );
            })}
          </div>

          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("pos.refund.reasonPlaceholder")}
            className="w-full border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
          />
        </div>
      )}
    </PosModal>
  );
}

export default RefundModal;
