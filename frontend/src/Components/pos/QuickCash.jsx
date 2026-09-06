import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import PosModal from "./PosModal";
import { currency, sanitizeDecimal } from "./posUtils";

/* Quick cash — a price, straight into the basket.
 *
 * The card rail covers the things the shop sells constantly. This covers the
 * thing it sells once: a customer is holding something with no barcode that
 * nobody has a card for, and the cashier knows what it costs. Type the figure,
 * press add, it is in the basket.
 *
 * It opens as its own screen rather than living on the rail. Sat inline it took
 * a third of the column permanently to serve the rarer of the two jobs, and cut
 * the cards — the things actually pressed all day — down to a scrolling
 * sliver. A button costs one line; the form gets the whole screen when it is
 * wanted and none of it when it is not.
 *
 * Built on PosModal so the on-screen keyboard moves it clear rather than
 * covering it; every rule that does that is keyed on this shell's classes.
 *
 * The name is optional on purpose. A cashier with a queue will type "4.50" and
 * nothing else, and a form insisting on a description simply would not get
 * used — which puts the sale back on whatever wrong barcode was nearest.
 *
 * The tick is the difference between "this once" and "this again". Left off,
 * the sale happens and nothing is added to the rail. Turned on, the same figure
 * becomes a card the whole shop has from then on — which is how the rail is
 * meant to fill up: out of what actually gets sold, not out of somebody sitting
 * down to plan it.
 */
function QuickCash({ onAdd, onClose, busy = false }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");
  const [keep, setKeep] = useState(false);

  const value = Number(amount);
  const ready = Number.isFinite(value) && value > 0 && !busy;

  const submit = (event) => {
    event.preventDefault();
    if (!ready) return;
    onAdd({ Price: value, name: name.trim(), pin: keep });
  };

  return (
    <PosModal
      title={t("pos.quickCash.title", "Quick Cash")}
      onClose={onClose}
      width="max-w-md"
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label
            htmlFor="quick-cash-amount"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {t("pos.quickCash.amount", "Amount")}
          </label>
          {/* text + inputMode, never type=number — a number input will not hold
              a half-typed "4." and blanks the field, which at a till means the
              price the cashier just keyed in disappears. See posUtils.
              data-keyboard tells the on-screen keyboard to show the pad. */}
          <input
            id="quick-cash-amount"
            autoFocus
            type="text"
            inputMode="decimal"
            data-keyboard="numeric"
            value={amount}
            onChange={(event) => setAmount(sanitizeDecimal(event.target.value))}
            placeholder="0.00"
            className="h-16 w-full border border-slate-700 bg-slate-950 px-3 text-center font-mono text-3xl tabular-nums text-amber-300 outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <label
            htmlFor="quick-cash-name"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {t("pos.quickCash.name", "Name (optional)")}
          </label>
          <input
            id="quick-cash-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            /* No placeholder and no sentence under it. The label already says
               the field is optional, and a greyed-out "Misc." sitting in the
               box reads as something already typed — a cashier in a hurry
               either tries to clear it or assumes it is filled in. Blank means
               blank; what a blank one is recorded as is decided at the till,
               not explained on the form. */
            className="h-12 w-full border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-amber-500"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 border border-slate-800 bg-black/30 px-3 py-2.5 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={keep}
            onChange={(event) => setKeep(event.target.checked)}
            className="h-5 w-5 accent-amber-500"
          />
          {t("pos.quickCash.keep", "Also save as a card")}
        </label>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-slate-800 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
          >
            {t("pos.refund.cancel", "Cancel")}
          </button>
          <button
            type="submit"
            disabled={!ready}
            className="flex-1 bg-amber-600 py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-amber-500 disabled:opacity-40"
          >
            {busy
              ? t("pos.processing", "Working…")
              : ready
                ? t("pos.quickCash.addAmount", "Add {{amount}}", {
                    amount: currency(value),
                  })
                : t("pos.quickCash.add", "Add to basket")}
          </button>
        </div>
      </form>
    </PosModal>
  );
}

export default QuickCash;
