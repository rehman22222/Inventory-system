import React from "react";
import { useTranslation } from "react-i18next";
import { FiEdit2, FiPlus, FiX } from "react-icons/fi";
import { FaMoneyBillWave } from "react-icons/fa";
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
  onEdit,
  onRemove,
  onToggleEdit,
  onQuickCash,
  editing = false,
}) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* Two groups, and the split is by what they act on.
          Left: the heading and the two controls that manage THE CARDS —
          add one, tidy them up. They sit against the word so it reads as
          "cards: add, edit", and neither is reachable without the label
          telling you what they belong to.
          Right, on its own: quick cash. It makes no card and changes none;
          it puts one price in the basket and closes. Grouping it with the
          card controls invited a thumb reaching for "add a card" to hit it
          instead, and the far corner is the cheapest way to say they are
          different things. */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
            {t("pos.quickSell.title", "Cards")}
          </p>

          {/* Only offered once there is something to tidy. */}
          {cards.length > 0 && (
            <button
              type="button"
              onClick={onToggleEdit}
              aria-pressed={editing}
              aria-label={
                editing ? t("pos.quickSell.done", "Done") : t("pos.quickSell.edit", "Edit")
              }
              title={
                editing ? t("pos.quickSell.done", "Done") : t("pos.quickSell.edit", "Edit")
              }
              className={`flex h-9 w-9 items-center justify-center ring-1 transition active:scale-95 ${
                editing
                  ? "bg-red-900/60 text-red-200 ring-red-700"
                  : "bg-slate-800 text-slate-400 ring-slate-700 hover:text-slate-100"
              }`}
            >
              <FiEdit2 className="h-4 w-4" />
            </button>
          )}
          {/* A bare plus. The word "New" beside a heading that already says
              Cards was saying the same thing twice, and the plus is the one
              symbol on a till nobody has to read. */}
          <button
            type="button"
            onClick={onNew}
            aria-label={t("pos.quickSell.new", "New card")}
            title={t("pos.quickSell.new", "New card")}
            className="flex h-9 w-9 items-center justify-center bg-slate-800 text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-700 hover:text-slate-100 active:scale-95"
          >
            <FiPlus className="h-5 w-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={onQuickCash}
          className="flex h-9 shrink-0 items-center gap-1.5 bg-amber-700 px-3.5 text-xs font-bold uppercase tracking-wide text-white ring-1 ring-amber-500 transition hover:bg-amber-600 active:scale-95"
        >
          <FaMoneyBillWave className="h-4 w-4" />
          {t("pos.quickCash.short", "Misc")}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pe-0.5">
        {cards.length === 0 ? (
          /* Says what the thing is for, because an empty rail on a new till
             explains nothing and this is the one panel a cashier will not go
             looking for on their own. */
          <p className="px-1 py-6 text-center text-xs leading-relaxed text-slate-600">
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
                  /* In edit mode the card stops being something you sell and
                     becomes something you change. Tapping it opens its price
                     and name rather than dropping it in the basket — pressing
                     "edit" and then having the card still ring up a sale is
                     the surprise that costs a refund. */
                  onClick={() => (editing ? onEdit(card) : onPick(card))}
                  className={`flex h-full w-full flex-col items-center justify-center gap-1 border bg-gradient-to-b px-2 py-3 text-center transition active:scale-[0.97] ${
                    editing
                      ? "border-dashed border-cyan-700 from-slate-800 to-slate-900 pt-7 hover:border-cyan-400"
                      : "border-slate-700 from-slate-800 to-slate-900 hover:border-amber-500 hover:from-slate-700"
                  }`}
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
                    title={t("pos.quickSell.remove", "Remove card")}
                    /* INSIDE the card, not hanging off it.
                       Sat at -top-1/-end-1 it overhung the tile on two sides,
                       which put it over the gap into the neighbour on the left
                       and straight under the scroll container's clip on the
                       right — so the last column's crosses were cut in half.
                       Nothing that has to be pressed should live outside the
                       box it belongs to. */
                    className="absolute end-1 top-1 flex h-6 w-6 items-center justify-center rounded-sm bg-red-800/90 text-white ring-1 ring-red-500 transition hover:bg-red-600"
                  >
                    <FiX className="h-3.5 w-3.5" />
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
