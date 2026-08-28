import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiTrash2 } from "react-icons/fi";
import PosModal from "./PosModal";
import { currency, sanitizeDecimal } from "./posUtils";

// The tender screen. A customer paying €50 can hand over €30 cash and put €20
// on a card: each tender is added in turn, the remaining balance drops, and the
// sale only closes once the bill is fully covered. Overpaying in cash gives
// change.
//
// The method buttons TAKE the payment rather than just selecting a method:
// tapping one settles whatever is left on it. Type an amount first only when
// splitting — €30 → CASH leaves €20, then CARD clears the rest in one tap.
//
// A tap that clears the bill exactly also CLOSES the sale — no second confirm.
// A tap that leaves change does not: the cashier has to see what to hand back.
function PaymentModal({ total, methods, onConfirm, onClose, busy }) {
  const { t } = useTranslation();

  const [payments, setPayments] = useState([]);
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

  const addPayment = (value, payMethod) => {
    const entry = Math.round(Number(value || 0) * 100) / 100;
    if (entry <= 0 || busy) return;

    const next = [...payments, { method: payMethod, amount: entry }];
    setPayments(next);
    setAmount("");

    // One tap, one sale. The overwhelmingly common sale is exact and single
    // tender: making the cashier confirm a screen that has nothing left to say
    // is a keystroke per customer, all day.
    //
    // It closes ONLY on an exact settle. The moment there is change to hand
    // back, the screen stays up and shows the figure — a till that pockets the
    // sale before the cashier has read "change €2.80" is how drawers go short.
    const nowPaid = next.reduce((sum, item) => sum + item.amount, 0);
    const covered = nowPaid + 0.001 >= total;
    const owesChange = nowPaid - total > 0.001;
    if (covered && !owesChange) onConfirm(next);
  };

  const typed = Number(amount);
  const hasTyped = Number.isFinite(typed) && typed > 0;
  // A figure in the box is cash already on the counter — the customer put notes
  // down and is settling the rest another way. Only a figure SHORT of the
  // balance can mean that; anything at or over it is a single tender on
  // whichever method is tapped, which is how change gets handed back.
  const splitting = hasTyped && typed < remaining - 0.001;

  // What each button will actually put through, so nothing has to be guessed.
  const takesFor = (payMethod) => {
    if (!hasTyped) return remaining;
    if (!splitting) return Math.round(typed * 100) / 100;
    // Cash-and-cash is not a split; it is the whole balance in cash.
    return payMethod === "cash" ? remaining : Math.round((remaining - typed) * 100) / 100;
  };

  // Tap a method to settle on it. With cash already counted into the box, that
  // one tap finishes the sale — a split is not worth two.
  const takePayment = (payMethod) => {
    if (busy) return;

    if (splitting && payMethod !== "cash") {
      const cash = Math.round(typed * 100) / 100;
      const rest = Math.round((remaining - cash) * 100) / 100;
      const next = [
        ...payments,
        { method: "cash", amount: cash },
        { method: payMethod, amount: rest },
      ];
      setPayments(next);
      setAmount("");
      // The two together are the balance exactly, so there is no change to read
      // and nothing left to ask.
      onConfirm(next);
      return;
    }

    addPayment(hasTyped && !splitting ? typed : remaining, payMethod);
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
            {/* Amount — optional. Leave it blank and a method button settles the
                whole balance; type into it only to split. */}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                // Enter is the cash path: it is what a hand-typed amount is for.
                takePayment("cash");
              }}
            >
              <input
                autoFocus
                type="text"
                inputMode="decimal"
                data-keyboard="numeric"
                value={amount}
                onChange={(event) => setAmount(sanitizeDecimal(event.target.value))}
                placeholder={currency(remaining)}
                className="w-full border border-slate-700 bg-slate-950 px-3 py-2.5 text-center font-mono text-lg text-slate-100 outline-none focus:border-cyan-500"
              />
            </form>

            {/* Tap to take. The amount on each button is what it will actually
                put through, so there is no guessing. */}
            <div className="grid grid-cols-3 gap-1.5">
              {methods.map((entry) => {
                const takes = takesFor(entry.value);

                return (
                  <button
                    key={entry.value}
                    type="button"
                    onClick={() => takePayment(entry.value)}
                    className="flex flex-col items-center justify-center gap-0.5 bg-slate-800 py-2.5 text-xs font-bold uppercase text-slate-200 ring-1 ring-slate-700 transition hover:bg-cyan-800 hover:ring-cyan-600 active:scale-[0.98]"
                  >
                    {label(entry.value)}
                    <span className="text-[11px] font-semibold tabular-nums text-cyan-400">
                      {currency(takes)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Cash the customer overpays with, so there is change to hand back. */}
            {roundedUp && (
              <button
                type="button"
                onClick={() => addPayment(roundedUp, "cash")}
                className="flex w-full items-center justify-center gap-2 bg-slate-800 py-2.5 text-xs font-bold uppercase text-slate-200 transition hover:bg-slate-700"
              >
                {t("pos.payment.roundOff")}
                <span className="tabular-nums opacity-80">{currency(roundedUp)}</span>
                <span className="font-normal normal-case opacity-60">
                  {t("pos.payment.roundOffHint")}
                </span>
              </button>
            )}

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
