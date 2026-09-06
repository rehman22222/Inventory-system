import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import PosModal from "./PosModal";
import { sanitizeDecimal } from "./posUtils";

/* Make a quick-sell card at the counter.
 *
 * Built on PosModal so the on-screen keyboard gets it out of the way — see the
 * body.osk-open rules in index.css, which are keyed on this shell's classes.
 *
 * Two fields and nothing else. A card is a name and a price; asking for a
 * category, a barcode or a stock figure here would be asking the cashier to
 * answer questions about an item they are holding precisely because nobody has
 * had time to answer them yet.
 */
// `card` turns this into an edit rather than a create. Same two fields either
// way — a card IS a name and a price — so one form serves both instead of a
// second dialog that would have to be kept in step with this one.
function QuickSellModal({ card = null, onCreate, onClose, saving = false }) {
  const { t } = useTranslation();
  const editing = Boolean(card);
  const [name, setName] = useState(card?.name || "");
  const [price, setPrice] = useState(
    card?.Price === undefined || card?.Price === null ? "" : String(card.Price),
  );

  const amount = Number(price);
  const ready = name.trim().length > 0 && Number.isFinite(amount) && amount > 0;

  const submit = (event) => {
    event.preventDefault();
    if (!ready || saving) return;
    onCreate({ name: name.trim(), Price: amount });
  };

  return (
    <PosModal
      title={
        editing
          ? t("pos.quickSell.editTitle", "Edit card")
          : t("pos.quickSell.newTitle", "New quick-sell card")
      }
      subtitle={t(
        "pos.quickSell.newSubtitle",
        "For something you sell often that has no barcode",
      )}
      onClose={onClose}
      width="max-w-md"
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label
            htmlFor="quick-sell-name"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {t("pos.quickSell.name", "Name")}
          </label>
          <input
            id="quick-sell-name"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            placeholder={t("pos.quickSell.namePlaceholder", "e.g. Coil")}
            className="h-12 w-full border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <label
            htmlFor="quick-sell-price"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {t("pos.quickSell.price", "Price")}
          </label>
          {/* text + inputMode, not type=number — see the note in posUtils on why
              a number input cannot hold a half-typed decimal at the till.
              data-keyboard tells the on-screen keyboard to show the pad. */}
          <input
            id="quick-sell-price"
            type="text"
            inputMode="decimal"
            data-keyboard="numeric"
            value={price}
            onChange={(event) => setPrice(sanitizeDecimal(event.target.value))}
            placeholder="0.00"
            className="h-12 w-full border border-slate-700 bg-slate-950 px-3 font-mono text-lg tabular-nums text-slate-100 outline-none focus:border-amber-500"
          />
        </div>

        <p className="text-[11px] leading-relaxed text-slate-500">
          {t(
            "pos.quickSell.notCounted",
            "This is not counted as stock — it can never run out, and it will not appear in the stock report.",
          )}
        </p>

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
            disabled={!ready || saving}
            className="flex-1 bg-amber-600 py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-amber-500 disabled:opacity-40"
          >
            {saving
              ? t("pos.processing", "Working…")
              : editing
                ? t("common.save", "Save")
                : t("pos.quickSell.create", "Add card")}
          </button>
        </div>
      </form>
    </PosModal>
  );
}

export default QuickSellModal;
