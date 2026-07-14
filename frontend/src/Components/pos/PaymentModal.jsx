import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiTrash2 } from "react-icons/fi";
import PosModal from "./PosModal";
import { currency } from "./posUtils";

// The tender screen. A customer paying €50 can hand over €30 cash and put €20
// on a card: each tender is added in turn, the remaining balance drops, and the
// sale only closes once the bill is fully covered. Overpaying in cash gives
// change.
function PaymentModal({ total, methods, onConfirm, onClose, busy }) {
  const { t } = useTranslation();

  const [payments, setPayments] = useState([]);
  const [method, setMethod] = useState("cash");
  const [amount, setAmount] = useState("");

  const paid = payments.reduce((sum, entry) => sum + entry.amount, 0);
  const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
  const change = Math.max(0, Math.round((paid - total) * 100) / 100);
  const settled = paid + 0.001 >= total;

  // Rounding up to the next whole euro — what a customer hands over when they
  // don't want the coins back (€50.90 owed → €51). Hidden when the balance is
  // already a whole number, since that is just "Exact".
  const roundedUp = useMemo(() => {
    const up = Math.ceil(remaining);
    return up > remaining ? up : null;
  }, [remaining]);

  const addPayment = (value, payMethod = method) => {
    const entry = Math.round(Number(value || 0) * 100) / 100;
    if (entry <= 0) return;

    setPayments((current) => [...current, { method: payMethod, amount: entry }]);
    setAmount("");
  };

  const removePayment = (index) =>
    setPayments((current) => current.filter((_, i) => i !== index));

  const label = (value) =>
    t(`common.payments.${value}`, methods.find((m) => m.value === value)?.label || value);

  return (
    <PosModal
      title={t("pos.payment.title")}
      subtitle={t("pos.payment.subtitle")}
      onClose={onClose}
      width="max-w-lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700"
          >
            {t("pos.refund.cancel")}
          </button>
          <button
            type="button"
            disabled={!settled || busy}
            onClick={() => onConfirm(payments)}
            className="bg-gradient-to-b from-emerald-600 to-emerald-700 px-6 py-2 text-sm font-bold uppercase tracking-wide text-white ring-1 ring-emerald-500 transition hover:from-emerald-500 disabled:opacity-40"
          >
            {busy ? t("pos.processing") : t("pos.payment.complete")}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Running balance */}
        <div className="grid grid-cols-3 gap-2 border border-slate-800 bg-black/50 p-3 text-center">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
              {t("pos.total")}
            </p>
            <p className="text-lg font-bold tabular-nums text-slate-200">{currency(total)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
              {t("pos.payment.paid")}
            </p>
            <p className="text-lg font-bold tabular-nums text-cyan-400">{currency(paid)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
              {settled ? t("pos.changeDue") : t("pos.payment.remaining")}
            </p>
            <p
              className={`text-lg font-bold tabular-nums ${
                settled ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {currency(settled ? change : remaining)}
            </p>
          </div>
        </div>

        {/* Tenders taken so far */}
        {payments.length > 0 && (
          <div className="space-y-1">
            {payments.map((entry, index) => (
              <div
                key={`${entry.method}-${index}`}
                className="flex items-center justify-between border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              >
                <span className="font-semibold text-slate-300">{label(entry.method)}</span>
                <span className="flex items-center gap-3">
                  <span className="font-bold tabular-nums text-slate-100">
                    {currency(entry.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePayment(index)}
                    className="p-1 text-slate-600 transition hover:bg-red-950 hover:text-red-400"
                    aria-label={t("pos.payment.removeTender")}
                  >
                    <FiTrash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}

        {!settled && (
          <div className="space-y-3">
            {/* Method */}
            <div className="grid grid-cols-3 gap-1.5">
              {methods.map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  onClick={() => setMethod(entry.value)}
                  className={`py-2 text-xs font-bold uppercase transition ${
                    method === entry.value
                      ? "bg-cyan-700 text-white"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                  }`}
                >
                  {label(entry.value)}
                </button>
              ))}
            </div>

            {/* Amount */}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                addPayment(amount);
              }}
              className="flex gap-2"
            >
              <input
                autoFocus
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={currency(remaining)}
                className="flex-1 border border-slate-700 bg-slate-950 px-3 py-2.5 text-center font-mono text-lg text-slate-100 outline-none focus:border-cyan-500"
              />
              <button
                type="submit"
                className="bg-slate-800 px-4 text-sm font-bold uppercase text-slate-200 ring-1 ring-slate-700 transition hover:bg-slate-700"
              >
                {t("pos.payment.add")}
              </button>
            </form>

            {/* Quick tenders: take the exact balance, or round it up. */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => addPayment(remaining)}
                className="flex items-center justify-center gap-2 bg-emerald-800 py-2.5 text-xs font-bold uppercase text-white transition hover:bg-emerald-700"
              >
                {t("pos.exact")}
                <span className="tabular-nums opacity-80">{currency(remaining)}</span>
              </button>

              <button
                type="button"
                disabled={!roundedUp}
                onClick={() => addPayment(roundedUp)}
                className="flex items-center justify-center gap-2 bg-slate-800 py-2.5 text-xs font-bold uppercase text-slate-200 transition hover:bg-slate-700 disabled:opacity-30"
              >
                {t("pos.payment.roundOff")}
                {roundedUp && (
                  <span className="tabular-nums opacity-80">{currency(roundedUp)}</span>
                )}
              </button>
            </div>

            <p className="text-center text-[11px] text-slate-600">{t("pos.payment.hint")}</p>
          </div>
        )}

        {settled && change > 0 && (
          <p className="border border-emerald-800 bg-emerald-950/40 py-3 text-center text-sm font-semibold text-emerald-300">
            {t("pos.payment.giveChange", { amount: currency(change) })}
          </p>
        )}
      </div>
    </PosModal>
  );
}

export default PaymentModal;
