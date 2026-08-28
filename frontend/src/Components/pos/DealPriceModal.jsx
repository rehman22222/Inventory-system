import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiMinus, FiPlus } from "react-icons/fi";
import PosModal from "./PosModal";
import { currency, sanitizeDecimal } from "./posUtils";

// Price an applied deal by hand. The shop sets a figure; now and then the
// counter has a reason to charge something else, and the alternative to letting
// the cashier do it here is letting them do it with the manual-discount field,
// where it lands on the whole basket and nobody can tell afterwards which offer
// it was meant to be.
//
// Whatever is typed is still checked by the server against the value of the
// deal's own goods, and both figures — the deal's and the one charged — go into
// the log with the cashier's name.
function DealPriceModal({ entry, applied, sets, onSets, onApply, onReset, onClose }) {
  const { t } = useTranslation();

  // What the deal portion costs right now: shelf value less the saving in force.
  const current = Number(entry.normal) - Number(entry.amount);
  const configured = Number(entry.normal) - Number(entry.configuredAmount);

  const [value, setValue] = useState(current.toFixed(2));

  // Giving one set instead of two changes what the deal comes to, so the figure
  // in the box follows it. Only on an actual change: reopening an already
  // hand-priced deal must not quietly throw that price away.
  const [lastSets, setLastSets] = useState(sets);
  useEffect(() => {
    if (sets === lastSets) return;
    setLastSets(sets);
    setValue((Number(entry.normal) - Number(entry.configuredAmount)).toFixed(2));
  }, [sets, lastSets, entry.normal, entry.configuredAmount]);

  const typed = Number(value);
  const valid = value !== "" && Number.isFinite(typed) && typed >= 0;
  // Typing more than the goods are worth is not a deal; the server clamps it
  // anyway, but saying so here beats a total that quietly disagrees.
  const tooHigh = valid && typed > Number(entry.normal);
  const saving = valid ? Number(entry.normal) - Math.min(typed, Number(entry.normal)) : 0;

  const submit = () => {
    if (!valid) return;
    onApply(Math.min(typed, Number(entry.normal)));
  };

  return (
    <PosModal
      title={
        applied
          ? t("pos.deal.editTitle", "Change the deal price")
          : t("pos.deal.applyTitle", "Apply this deal")
      }
      subtitle={entry.name}
      onClose={onClose}
      width="max-w-md"
      footer={
        <>
          {/* Only worth offering once there is something to go back FROM. */}
          {Math.abs(current - configured) > 0.005 && (
            <button
              type="button"
              onClick={onReset}
              className="me-auto text-sm font-semibold text-slate-400 transition hover:text-slate-200"
            >
              {t("pos.deal.resetPrice", "Back to the deal price")}
            </button>
          )}
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
            disabled={!valid}
            className="bg-fuchsia-700 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-600 disabled:opacity-40"
          >
            {t("pos.deal.apply")}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* A basket can qualify for two sets and the counter still only want to
            give one. Which is the shop's call at the moment of sale, so it is
            asked here rather than decided by the arithmetic. */}
        {entry.maxSets > 1 && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("pos.deal.setsToGive", "Sets to give")}
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSets(Math.max(1, sets - 1))}
                disabled={sets <= 1}
                className="bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 disabled:opacity-30"
              >
                <FiMinus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center text-lg font-bold tabular-nums">{sets}</span>
              <button
                type="button"
                onClick={() => onSets(Math.min(entry.maxSets, sets + 1))}
                disabled={sets >= entry.maxSets}
                className="bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 disabled:opacity-30"
              >
                <FiPlus className="h-4 w-4" />
              </button>
              <span className="text-xs text-slate-500">
                {t("pos.deal.setsAvailable", "of {{n}} the basket qualifies for", {
                  n: entry.maxSets,
                })}
              </span>
            </div>
          </div>
        )}

        <dl className="space-y-1 border border-slate-800 bg-slate-950 px-3 py-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">{t("pos.deal.normal")}</dt>
            <dd className="tabular-nums text-slate-300">{currency(entry.normal)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">{t("pos.deal.dealPrice", "Deal price")}</dt>
            <dd className="tabular-nums text-slate-300">{currency(configured)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">{t("pos.deal.itemsCovered", "Items in the offer")}</dt>
            <dd className="tabular-nums text-slate-300">
              {Object.values(entry.allocation || {}).reduce((sum, n) => sum + n, 0)}
            </dd>
          </div>
        </dl>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
            {t("pos.deal.chargeInstead", "Charge instead")}
          </label>
          <input
            autoFocus
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(sanitizeDecimal(event.target.value))}
            onKeyDown={(event) => event.key === "Enter" && submit()}
            className="h-12 w-full border border-slate-700 bg-slate-950 px-3 text-lg tabular-nums text-slate-100 outline-none focus:border-fuchsia-500"
          />
          <p className="mt-1 text-xs text-slate-500">
            {entry.sets > 1
              ? t(
                  "pos.deal.editHintSets",
                  "For all {{n}} sets together, not one of them.",
                  { n: entry.sets },
                )
              : t("pos.deal.editHint", "What the customer pays for these items.")}
          </p>
        </div>

        <div className="flex justify-between gap-4 border-t border-slate-800 pt-3 text-sm">
          <span className="text-slate-500">{t("pos.deal.saving")}</span>
          <span
            className={`tabular-nums font-semibold ${
              tooHigh ? "text-amber-400" : "text-fuchsia-400"
            }`}
          >
            {currency(saving)}
            {tooHigh
              ? ` — ${t("pos.deal.cappedAtNormal", "capped at the normal price")}`
              : ""}
          </span>
        </div>
      </div>
    </PosModal>
  );
}

export default DealPriceModal;
