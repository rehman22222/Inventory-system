import React, { useState } from "react";
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
function DealPriceModal({ entry, applied, onApply, onReset, onClose }) {
  const { t } = useTranslation();

  // What the deal portion costs right now: shelf value less the saving in force.
  const current = Number(entry.normal) - Number(entry.amount);
  const configured = Number(entry.normal) - Number(entry.configuredAmount);

  const [value, setValue] = useState(current.toFixed(2));

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
        <dl className="space-y-1 border border-slate-800 bg-slate-950 px-3 py-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">{t("pos.deal.normal")}</dt>
            <dd className="tabular-nums text-slate-300">{currency(entry.normal)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">{t("pos.deal.dealPrice", "Deal price")}</dt>
            <dd className="tabular-nums text-slate-300">{currency(configured)}</dd>
          </div>
          {entry.sets > 1 && (
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">{t("pos.deal.sets", "Complete sets")}</dt>
              <dd className="tabular-nums text-slate-300">{entry.sets}</dd>
            </div>
          )}
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
