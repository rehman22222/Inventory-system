import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
function DealPriceModal({
  entry,
  applied,
  // Which sets the offer is on, as positions in setPreview. [0, 2] is the first
  // and the third — the whole reason this is a list and not a count.
  chosen = [],
  onToggleSet,
  // Whether the deal still gives anything on the sets chosen. False when they
  // are worth less than the offer charges, which is a selection the cashier can
  // only reach now that sets are picked freely.
  applies = true,
  // Every set the basket holds, each as a list of what is in it. Built by the
  // page with no lock and no count, because the entry on screen only knows about
  // the sets currently being given and this has to show the rest too.
  setPreview = [],
  onApply,
  onReset,
  onClose,
}) {
  const { t } = useTranslation();

  // What the deal portion costs right now: shelf value less the saving in force.
  const current = Number(entry.normal) - Number(entry.amount);
  const configured = Number(entry.normal) - Number(entry.configuredAmount);

  const [value, setValue] = useState(current.toFixed(2));

  // Changing which sets are given changes what the deal comes to, so the figure
  // in the box follows it. Keyed on the selection itself, not on how many were
  // picked: swapping the second set for the third is the same count and a
  // different set of goods, and the price has to move with it. Only on an actual
  // change — reopening an already hand-priced deal must not quietly throw that
  // price away.
  const key = chosen.join(",");
  const [lastKey, setLastKey] = useState(key);
  useEffect(() => {
    if (key === lastKey) return;
    setLastKey(key);
    setValue((Number(entry.normal) - Number(entry.configuredAmount)).toFixed(2));
  }, [key, lastKey, entry.normal, entry.configuredAmount]);

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
        {/* Each set the basket holds, laid out with what is in it. A number on
            its own says nothing about WHICH items the customer is getting the
            offer on; these cards do, and each one is its own switch.
            Independent on purpose — the counter can give the first set and the
            third and leave the second at shelf price, which a count could never
            express. */}
        {setPreview.length > 1 && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("pos.deal.setsToGive", "Sets to give")}
            </label>
            <div className="flex flex-wrap gap-2">
              {setPreview.map((set, index) => {
                const number = index + 1;
                const on = chosen.includes(index);
                // Turning the last one off would leave an offer on nothing,
                // which reads as the discount disappearing by itself. The X on
                // the rail is how an offer is given back.
                const locked = on && chosen.length === 1;

                return (
                  <button
                    key={number}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={t("pos.deal.setNumber", "Set {{n}}", { n: number })}
                    title={
                      locked
                        ? t("pos.deal.lastSet", "At least one set has to be given")
                        : undefined
                    }
                    onClick={() => !locked && onToggleSet(index)}
                    className={`min-w-[7.5rem] flex-1 border p-2 text-start transition ${
                      on
                        ? "border-fuchsia-500 bg-fuchsia-950/50"
                        : "border-slate-700 bg-slate-950 hover:border-slate-500"
                    } ${locked ? "cursor-default" : ""}`}
                  >
                    <span
                      className={`flex items-center justify-between gap-1 text-[10px] font-bold uppercase tracking-wide ${
                        on ? "text-fuchsia-300" : "text-slate-500"
                      }`}
                    >
                      {t("pos.deal.setNumber", "Set {{n}}", { n: number })}
                      {/* A tick, because a card that is merely brighter than its
                          neighbour does not survive a glance at arm_s length on
                          a till. */}
                      <span aria-hidden="true">{on ? "✓" : "+"}</span>
                    </span>
                    <span className="mt-1 block space-y-0.5">
                      {set.map((line, i) => (
                        <span
                          key={`${line}-${i}`}
                          className={`block truncate text-[11px] leading-snug ${
                            on ? "text-slate-300" : "text-slate-500"
                          }`}
                        >
                          {line}
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
            {!applies && (
              <p className="mt-1 border border-amber-900/60 bg-amber-950/30 px-2 py-1 text-xs text-amber-300">
                {t(
                  "pos.deal.setsWorthless",
                  "These sets are worth less than the offer charges for them, so it gives nothing. Tick another set, or type a price below.",
                )}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              {t("pos.deal.setsChosen", "{{given}} of {{max}} — the rest stay at their normal price", {
                given: chosen.length,
                max: entry.maxSets,
              })}
            </p>
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
