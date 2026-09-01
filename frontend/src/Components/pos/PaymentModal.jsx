import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiTrash2 } from "react-icons/fi";
import PosModal from "./PosModal";
import { currency, sanitizeDecimal } from "./posUtils";

// The tender screen.
//
// How a sale is being paid is decided at the basket, not here: the cashier
// presses CASH, CARD or CREDIT down by the total and arrives with that method
// already chosen. That is the order the counter actually works in — the
// customer says how they are paying while the last item is still being scanned
// — and it saves the screen asking a question it was opened with the answer to.
//
// So the method buttons here SELECT rather than take. Nothing goes through
// until CHARGE, which is one button doing one thing: put the chosen tender
// through, and close the sale if that settles it.
//
// A customer paying 50 can still hand over 30 in cash and put 20 on a card —
// type the cash into the box, or open Split and give each method its share. The
// sale only closes once the bill is fully covered, and overpaying in cash gives
// change.
function PaymentModal({ total, methods, initialMethod, onConfirm, onClose, busy }) {
  const { t } = useTranslation();

  const [payments, setPayments] = useState([]);
  const [amount, setAmount] = useState("");
  // What CHARGE will put the money through on. Comes in from whichever button
  // was pressed at the basket; cash is the fallback because it is what a till
  // takes when nobody has said otherwise.
  const [method, setMethod] = useState(() => initialMethod || methods[0]?.value || "cash");
  // Splitting a bill by typing an amount and charging another method works, but
  // it is a trick you have to be told. This is the same thing said out loud:
  // one line per method, each taking whatever part of the bill it is paying.
  const [splitOpen, setSplitOpen] = useState(false);
  const [parts, setParts] = useState({});

  // A sale on account needs a way to collect it later. Held here because the
  // tender screen is where the decision is actually made.
  const [account, setAccount] = useState({ email: "", phone: "", termDays: 14 });

  const paid = payments.reduce((sum, entry) => sum + entry.amount, 0);
  const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
  const change = Math.max(0, Math.round((paid - total) * 100) / 100);
  const settled = paid + 0.001 >= total;

  // What is going on the book. A sale can be part cash, part account.
  const onAccount = payments
    .filter((entry) => entry.method === "credit")
    .reduce((sum, entry) => sum + entry.amount, 0);
  // Asked for as soon as CREDIT is the chosen method rather than after the
  // tender has gone through, so the cashier is not sent back for a phone number
  // by a button that has already stopped working.
  const goingOnAccount = onAccount > 0 || (!settled && method === "credit");
  // Something to reach them by, or the debt is a loss with paperwork. The
  // server refuses it too — this is so the cashier finds out here rather than
  // after pressing Charge.
  const accountReady =
    !goingOnAccount || Boolean(account.email.trim() || account.phone.trim());

  // Rounding up to the next whole euro — what a customer hands over when they
  // don't want the coins back (50.90 owed becomes 51). Hidden when the balance
  // is already a whole number, since that is just "Exact".
  const roundedUp = useMemo(() => {
    const up = Math.ceil(remaining);
    return up > remaining ? up : null;
  }, [remaining]);

  const terms = () =>
    onAccount > 0
      ? {
          email: account.email.trim(),
          phone: account.phone.trim(),
          termDays: Number(account.termDays) || 14,
        }
      : undefined;

  const addPayment = (value, payMethod) => {
    const entry = Math.round(Number(value || 0) * 100) / 100;
    if (entry <= 0 || busy) return;

    const next = [...payments, { method: payMethod, amount: entry }];
    setPayments(next);
    setAmount("");

    // One press, one sale. The overwhelmingly common sale is exact and single
    // tender, and making the cashier confirm a screen with nothing left to say
    // is a keystroke per customer, all day.
    //
    // It closes ONLY on an exact settle. The moment there is change to hand
    // back, the screen stays up and shows the figure — a till that pockets the
    // sale before the cashier has read "change 2.80" is how drawers go short.
    // ...unless part of it went on the book. That sale is not finished until
    // there is a way to collect it, and closing here would take the goods out
    // of the shop with nothing but a name attached.
    const nowPaid = next.reduce((sum, item) => sum + item.amount, 0);
    const covered = nowPaid + 0.001 >= total;
    const owesChange = nowPaid - total > 0.001;
    const anyCredit = next.some((item) => item.method === "credit");
    if (covered && !owesChange && !anyCredit) onConfirm(next);
  };

  const typed = Number(amount);
  const hasTyped = Number.isFinite(typed) && typed > 0;
  // A figure in the box is cash already on the counter — the customer put notes
  // down and is settling the rest another way. Only a figure SHORT of the
  // balance can mean that; anything at or over it is a single tender on
  // whichever method is chosen, which is how change gets handed back.
  const splitting = hasTyped && typed < remaining - 0.001;

  // What each method would actually put through, so nothing is guessed.
  const takesFor = (payMethod) => {
    if (!hasTyped) return remaining;
    if (!splitting) return Math.round(typed * 100) / 100;
    // Cash-and-cash is not a split; it is the whole balance in cash.
    return payMethod === "cash" ? remaining : Math.round((remaining - typed) * 100) / 100;
  };

  // CHARGE. Puts the chosen tender through — and with cash already counted into
  // the box, settles the rest on the chosen method in the same press.
  const charge = () => {
    if (busy || !accountReady) return;

    // Nothing left to collect: this press is the confirmation.
    if (settled) {
      onConfirm(payments, terms());
      return;
    }

    if (splitting && method !== "cash") {
      const cash = Math.round(typed * 100) / 100;
      const rest = Math.round((remaining - cash) * 100) / 100;
      const next = [...payments, { method: "cash", amount: cash }, { method, amount: rest }];
      setPayments(next);
      setAmount("");
      // The two together are the balance exactly, so there is no change to read
      // and — unless one of them is the book — nothing left to ask.
      if (method !== "credit") onConfirm(next);
      return;
    }

    addPayment(hasTyped && !splitting ? typed : remaining, method);
  };

  const removePayment = (index) =>
    setPayments((current) => current.filter((_, i) => i !== index));

  const label = (value) =>
    t(`common.payments.${value}`, methods.find((m) => m.value === value)?.label || value);

  return (
    <PosModal
      // No title. The cashier pressed CASH on the basket a moment ago and knows
      // exactly what this is; a heading saying "Take Payment" over the top of it
      // is a line to read past on the way to the figure.
      onBack={onClose}
      width="max-w-lg"
      footer={
        <button
          type="button"
          disabled={busy || !accountReady}
          onClick={charge}
          className="w-full bg-gradient-to-b from-blue-600 to-blue-700 px-6 py-3 text-sm font-bold uppercase tracking-wide text-white ring-1 ring-blue-500 transition hover:from-blue-500 disabled:opacity-40"
        >
          {busy ? t("pos.processing") : t("pos.closeOrder")}
        </button>
      }
    >
      <div className="space-y-4">
        {/* What is owed, and what is left of it. Stacked rather than spread over
            three columns: the balance is the figure the cashier is working to,
            so it is the biggest thing on the screen. */}
        <div className="border border-slate-800 bg-black/50 px-3 py-2.5 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
            {t("pos.total")}
          </p>
          <p className="text-sm font-bold tabular-nums text-slate-300">{currency(total)}</p>

          <p className="mt-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-600">
            {settled ? t("pos.changeDue") : t("pos.payment.due", "Due")}
          </p>
          <p
            className={`font-display text-2xl font-bold tabular-nums ${
              settled ? "text-emerald-400" : "text-amber-400"
            }`}
          >
            {currency(settled ? change : remaining)}
          </p>

          {/* Only worth saying once some of the bill has actually been taken —
              on an ordinary sale it would read 0.00 the whole way through. */}
          {paid > 0 && (
            <p className="mt-2 text-[11px] font-semibold text-slate-500">
              {t("pos.payment.paid")} {currency(paid)}
            </p>
          )}
        </div>

        {!settled && (
          <div className="space-y-3">
            {/* How it is being paid. Already chosen at the basket — this is
                where it changes if the customer changes their mind. */}
            <div className="grid grid-cols-3 gap-1.5">
              {methods.map((entry) => {
                const chosen = method === entry.value;

                return (
                  <button
                    key={entry.value}
                    type="button"
                    onClick={() => setMethod(entry.value)}
                    aria-pressed={chosen}
                    className={`flex flex-col items-center justify-center gap-0.5 py-2.5 text-xs font-bold uppercase transition active:scale-[0.98] ${
                      chosen
                        ? "bg-gradient-to-b from-blue-600 to-blue-700 text-white ring-1 ring-blue-400"
                        : "bg-slate-800 text-slate-300 ring-1 ring-slate-700 hover:bg-slate-700"
                    }`}
                  >
                    {label(entry.value)}
                    <span
                      className={`text-[11px] font-semibold tabular-nums ${
                        chosen ? "text-blue-100" : "text-slate-500"
                      }`}
                    >
                      {currency(takesFor(entry.value))}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Amount — optional. Leave it blank and Charge settles the whole
                balance; type into it to give change, or to split. */}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                charge();
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

            {/* Splitting, said out loud. Typing an amount and charging another
                method already splits a bill, but that is a trick you have to be
                told — this is one line per method, each taking the part it is
                paying, and it puts through exactly the same tenders. */}
            <button
              type="button"
              onClick={() => setSplitOpen((open) => !open)}
              className={`w-full py-2 text-xs font-bold uppercase tracking-wide transition ${
                splitOpen
                  ? "bg-cyan-800 text-white ring-1 ring-cyan-600"
                  : "bg-slate-800 text-slate-300 ring-1 ring-slate-700 hover:bg-slate-700"
              }`}
            >
              {t("pos.payment.split", "Split")}
            </button>

            {splitOpen && (
              <div className="space-y-1.5 border border-cyan-900 bg-cyan-950/20 p-2">
                {methods.map((entry) => (
                  <div key={`split-${entry.value}`} className="flex items-center gap-1.5">
                    <span className="w-16 shrink-0 text-[11px] font-bold uppercase text-slate-400">
                      {label(entry.value)}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      data-keyboard="numeric"
                      value={parts[entry.value] || ""}
                      onChange={(event) =>
                        setParts((current) => ({
                          ...current,
                          [entry.value]: sanitizeDecimal(event.target.value),
                        }))
                      }
                      placeholder={currency(remaining)}
                      className="min-w-0 flex-1 border border-slate-700 bg-slate-950 px-2 py-1.5 text-center font-mono text-sm text-slate-100 outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const part = Number(parts[entry.value]);
                        addPayment(
                          Number.isFinite(part) && part > 0 ? part : remaining,
                          entry.value,
                        );
                        setParts((current) => ({ ...current, [entry.value]: "" }));
                      }}
                      className="shrink-0 bg-slate-800 px-3 py-1.5 text-[11px] font-bold uppercase text-slate-200 transition hover:bg-cyan-800"
                    >
                      {t("pos.payment.take", "Take")}
                    </button>
                  </div>
                ))}
                <p className="pt-0.5 text-[10px] text-slate-500">
                  {t(
                    "pos.payment.splitHint",
                    "Leave an amount empty to put the whole balance on that method.",
                  )}
                </p>
              </div>
            )}

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

          </div>
        )}

        {/* On the book. Shown the moment any of the bill is headed for the
            account, because that is the moment the shop needs a way to collect
            it — a debt owed by "Walk-In" with no contact is a loss with
            paperwork. Either field will do; the server insists on one too. */}
        {goingOnAccount && (
          <div className="space-y-2 border border-amber-800 bg-amber-950/30 p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-wide text-amber-300">
                {t("pos.credit.onAccount", "On Account")}
              </span>
              <span className="font-bold tabular-nums text-amber-200">
                {currency(onAccount > 0 ? onAccount : takesFor("credit"))}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="email"
                inputMode="email"
                value={account.email}
                onChange={(event) =>
                  setAccount((current) => ({ ...current, email: event.target.value }))
                }
                placeholder={t("pos.credit.email", "Email")}
                className="min-w-0 border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100 outline-none focus:border-amber-500"
              />
              <input
                type="tel"
                inputMode="tel"
                value={account.phone}
                onChange={(event) =>
                  setAccount((current) => ({ ...current, phone: event.target.value }))
                }
                placeholder={t("pos.credit.phone", "Phone")}
                className="min-w-0 border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100 outline-none focus:border-amber-500"
              />
            </div>

            {/* How long they have. The common runs as buttons, because nobody
                agrees a term of 23 days. */}
            <div className="flex items-center gap-1.5">
              <span className="me-auto text-[11px] font-semibold uppercase text-slate-400">
                {t("pos.credit.payWithin", "Pay within")}
              </span>
              {[7, 14, 30, 60].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setAccount((current) => ({ ...current, termDays: days }))}
                  className={`px-2 py-1 text-[11px] font-bold uppercase transition ${
                    Number(account.termDays) === days
                      ? "bg-amber-700 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {t("pos.credit.days", "{{n}}d", { n: days })}
                </button>
              ))}
            </div>

            {!accountReady && (
              <p className="text-[11px] font-semibold text-amber-400">
                {t(
                  "pos.credit.contactRequired",
                  "An email or a phone number is needed — it is how this gets collected.",
                )}
              </p>
            )}
          </div>
        )}

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
