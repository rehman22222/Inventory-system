import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { FiMail, FiPrinter } from "react-icons/fi";
import { FaLeaf } from "react-icons/fa";
import axiosInstance from "../../lib/axios";
import PosModal from "./PosModal";
import { currency } from "./posUtils";

// The moment the sale lands. Change due is the only thing the cashier needs in
// that second, so it is the whole screen; everything else is a choice about the
// receipt, made once and deliberately.
//
// Three ways to end it, and they are three separate things rather than one
// nested inside another:
//
//   Go green      — no paper, no email. Closes straight back to the till.
//   Email receipt — the optional field below, sent to whatever was typed.
//   Print receipt — the roll.
//
// "Go green" used to open the email field, which made the greenest choice of
// all — no paper AND no address — a thing you reached by pressing "go green"
// and then leaving a box empty. The cashier has a customer in front of them and
// a queue behind; the button they press to finish must finish.
//
// The address is used for this one message and not stored — a shop offering to
// save paper should not be quietly building a mailing list out of it.
function SaleCompleteModal({ receipt, onPrint, onClose }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);

  const emailReceipt = async () => {
    const to = email.trim();
    // Nothing typed: say so rather than closing, because pressing SEND is an
    // explicit ask for an email — unlike "go green", which is an explicit ask
    // for none.
    if (!to) {
      toast.error(t("pos.complete.emailNeeded", "Enter an email address first"));
      return;
    }

    setSending(true);
    try {
      await axiosInstance.post(`pos/receipt/${receipt.receiptNo}/email`, {
        email: to,
      });
      toast.success(t("pos.complete.emailed", { email: to }));
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || t("pos.complete.emailFailed"));
    } finally {
      setSending(false);
    }
  };

  const change = Number(receipt.changeDue || 0);
  const tendered = Number(receipt.amountTendered || 0);
  const tenders = Array.isArray(receipt.payments) ? receipt.payments : [];
  // Sold on account: the goods have gone and the money has not, which the
  // counter needs to see before the customer walks off with a slip.
  const onAccount = tenders.some((entry) => entry.method === "credit");

  return (
    <PosModal
      title={t("pos.complete.title", "Sale complete")}
      subtitle={receipt.receiptNo}
      /* An arrow in the corner while the email step is open, a cross otherwise.
         Same rule VoucherModal follows: a screen you REACHED from somewhere
         offers the way back, not a way out — closing from inside a sub-step
         throws away the step and the sale screen together, which is not what a
         cashier who opened the wrong one is asking for. */
      onBack={asking ? () => setAsking(false) : undefined}
      onClose={onClose}
      // A size up from lg, so the larger figures below have room to sit on one
      // line rather than being squeezed by the width the smaller type needed.
      width="max-w-xl"
    >
      <div className="space-y-4 py-1">
        <div className="text-center">
          <p className="text-base font-semibold uppercase tracking-[0.2em] text-slate-500">
            {t("pos.changeDue")}
          </p>
          <p
            className={`font-display text-6xl font-bold tabular-nums ${
              change > 0 ? "text-amber-300" : "text-slate-100"
            }`}
          >
            {currency(change)}
          </p>
        </div>

        {/* The figures the cashier reads back to the customer at the counter,
            across a till screen they are standing over rather than sitting at.
            Set a size up from the rest of the dialog for that reason — this
            block is read at arm's length, and the buttons under it are not. */}
        <dl className="space-y-1 border border-slate-800 bg-black/40 px-4 py-3 text-lg">
          <div className="flex justify-between gap-6">
            <dt className="text-slate-500">{t("pos.total")}</dt>
            <dd className="tabular-nums text-slate-200">{currency(receipt.total)}</dd>
          </div>

          {/* What was settled on what. A split sale is two figures the cashier
              has to be able to check against the drawer and the terminal, and
              "€36.00 paid" does not tell them which is which. */}
          {tenders.length > 0 && (
            <div className="mt-2 space-y-1.5 border-t border-slate-800 pt-2.5">
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-600">
                {t("pos.complete.paidBy", "Paid by")}
              </dt>
              {tenders.map((entry, index) => (
                <div
                  key={`${entry.method}-${index}`}
                  className="flex justify-between gap-6"
                >
                  <dt className="text-slate-400">
                    {t(`common.payments.${entry.method}`, entry.method)}
                  </dt>
                  <dd className="tabular-nums text-slate-200">
                    {currency(entry.amount)}
                  </dd>
                </div>
              ))}
            </div>
          )}

          {tendered > 0 && (
            <div className="flex justify-between gap-6 border-t border-slate-800 pt-2.5">
              <dt className="text-slate-500">{t("pos.complete.tendered", "Amount tendered")}</dt>
              <dd className="tabular-nums text-slate-200">{currency(tendered)}</dd>
            </div>
          )}
        </dl>

        {onAccount && (
          <p className="border border-amber-900 bg-amber-950/40 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-amber-300">
            {t("pos.complete.onAccount", "On account — not yet paid")}
          </p>
        )}

        {receipt.offlinePending && (
          <p className="border border-amber-900 bg-amber-950/40 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-amber-300">
            {t("pos.offline.notSynced")}
          </p>
        )}

        {/* Three ways to end the sale, side by side and all reachable without
            scrolling. That last part is the whole point of the shape.

            The email box used to sit open above these, permanently, which is
            what pushed the buttons off the bottom of the dialog — the cashier
            had to scroll a finished sale to find out how to finish it. It
            appears now only when Email is pressed, in the space the buttons
            themselves occupy, so nothing ever has to move to reach anything.

            All three end the sale and put the cashier back on the till. There
            is nothing after this screen to come back to. */}
        {asking ? (
          <div className="space-y-2">
            <label
              htmlFor="pos-receipt-email"
              className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              {t("pos.complete.emailOptional", "Email (optional)")}
            </label>
            <div className="flex gap-2">
              <input
                id="pos-receipt-email"
                autoFocus
                type="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && emailReceipt()}
                placeholder="name@example.com"
                className="h-12 min-w-0 flex-1 border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={emailReceipt}
                disabled={sending || !email.trim()}
                className="flex shrink-0 items-center gap-2 bg-emerald-700 px-5 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-emerald-600 disabled:opacity-40"
              >
                <FiMail className="h-4 w-4" />
                {sending ? t("pos.processing") : t("pos.complete.send", "Send")}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex flex-col items-center justify-center gap-1.5 border border-emerald-800 bg-emerald-950/30 py-4 text-emerald-300 transition hover:border-emerald-500 hover:bg-emerald-900/40"
            >
              <FaLeaf className="h-6 w-6" />
              <span className="text-xs font-semibold leading-tight">
                {t("pos.complete.goGreen", "Go Green")}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setAsking(true)}
              className="flex flex-col items-center justify-center gap-1.5 border border-slate-700 bg-slate-800/60 py-4 text-slate-100 transition hover:border-emerald-500 hover:bg-slate-800"
            >
              <FiMail className="h-6 w-6" />
              <span className="text-xs font-semibold leading-tight">
                {t("pos.complete.email", "Email")}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                onPrint();
                onClose();
              }}
              className="flex flex-col items-center justify-center gap-1.5 border border-slate-700 bg-slate-800/60 py-4 text-slate-100 transition hover:border-cyan-500 hover:bg-slate-800"
            >
              <FiPrinter className="h-6 w-6" />
              <span className="text-xs font-semibold leading-tight">
                {t("pos.complete.print", "Print")}
              </span>
            </button>
          </div>
        )}
      </div>
    </PosModal>
  );
}

export default SaleCompleteModal;
