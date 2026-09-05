import React from "react";
import { useTranslation } from "react-i18next";
import { FiEdit2, FiPlus, FiX } from "react-icons/fi";
import { currency } from "./posUtils";

/* One-tap cards for what the shop sells constantly and cannot scan.
 *
 * The situation these exist for: a customer is holding something with no
 * barcode, there is a queue, and labelling the box properly is a job for later.
 * Without a card the cashier either keeps the customer waiting or rings the
 * item up as something it is not — and it is always the second one, which is
 * how a shop ends up with sales figures nobody trusts.
 *
 * Each card is an ordinary product carrying `nonStock`, so tapping one puts a
 * real, named, priced line in the basket that reports and refunds like any
 * other. It simply is not counted, because there is no count behind it.
 *
 * Sized for a thumb rather than a cursor: this is pressed mid-sale with a
 * customer waiting, and the price is the thing being aimed at.
 */
function QuickSellCards({
  cards = [],
  onPick,
  onNew,
  onRemove,
  onToggleEdit,
  editing = false,
}) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">
          {t("pos.quickSell.title", "Quick sell")}
        </p>
        <div className="flex items-center gap-1">
          {/* Only offered once there is something to tidy. */}
          {cards.length > 0 && (
            <button
              type="button"
              onClick={onToggleEdit}
              aria-pressed={editing}
              className={`flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 transition active:scale-95 ${
                editing
                  ? "bg-red-900/60 text-red-200 ring-red-700"
                  : "bg-slate-800 text-slate-400 ring-slate-700 hover:text-slate-100"
              }`}
            >
              <FiEdit2 className="h-3 w-3" />
              {editing
                ? t("pos.quickSell.done", "Done")
                : t("pos.quickSell.edit", "Edit")}
            </button>
          )}
          <button
            type="button"
            onClick={onNew}
            className="flex items-center gap-1 bg-slate-800 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-700 hover:text-slate-100 active:scale-95"
          >
            <FiPlus className="h-3 w-3" />
            {t("pos.quickSell.new", "New")}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pe-0.5">
        {cards.length === 0 ? (
          /* Says what the thing is for, because an empty rail on a new till
             explains nothing and this is the one panel a cashier will not go
             looking for on their own. */
          <p className="px-1 py-6 text-center text-[11px] leading-relaxed text-slate-600">
            {t(
              "pos.quickSell.empty",
              "No cards yet. Add one for anything you sell often that has no barcode.",
            )}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {cards.map((card) => (
              <div key={card._id} className="relative">
                <button
                  type="button"
                  onClick={() => onPick(card)}
                  className="flex h-full w-full flex-col items-center justify-center gap-1 border border-slate-700 bg-gradient-to-b from-slate-800 to-slate-900 px-2 py-3 text-center transition hover:border-amber-500 hover:from-slate-700 active:scale-[0.97]"
                >
                  {/* Price first and largest. The name tells the cashier which
                      card this is; the price is what they are checking against
                      the thing in the customer's hand. */}
                  <span className="font-mono text-xl font-bold tabular-nums leading-none text-amber-300">
                    {currency(card.Price)}
                  </span>
                  <span className="line-clamp-2 text-[11px] font-semibold leading-tight text-slate-200">
                    {card.name}
                  </span>
                </button>

                {/* Removing is behind a mode rather than always on screen: a
                    cross on every card, at the size a thumb hits, is a card
                    deleted mid-sale by somebody reaching for the price. */}
                {editing && (
                  <button
                    type="button"
                    onClick={() => onRemove(card)}
                    aria-label={t("pos.quickSell.remove", "Remove card")}
                    className="absolute -end-1 -top-1 bg-red-800 p-1 text-white ring-1 ring-red-500 transition hover:bg-red-700"
                  >
                    <FiX className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default QuickSellCards;
