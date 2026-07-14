import React from "react";
import { useTranslation } from "react-i18next";

// The action rail. Each action carries its own colour so a cashier finds it by
// sight, not by reading — the way a real till's coloured keys work. On a till it
// is a vertical column whose buttons share the height; on a tablet it becomes a
// horizontally scrolling strip.
const TONES = {
  rose: "bg-rose-700 hover:bg-rose-600 border-rose-500 text-white",
  red: "bg-red-600 hover:bg-red-500 border-red-400 text-white",
  amber: "bg-amber-600 hover:bg-amber-500 border-amber-400 text-white",
  emerald: "bg-emerald-700 hover:bg-emerald-600 border-emerald-500 text-white",
  blue: "bg-blue-700 hover:bg-blue-600 border-blue-500 text-white",
  indigo: "bg-indigo-700 hover:bg-indigo-600 border-indigo-500 text-white",
  violet: "bg-violet-700 hover:bg-violet-600 border-violet-500 text-white",
  cyan: "bg-cyan-700 hover:bg-cyan-600 border-cyan-500 text-white",
  slate: "bg-slate-600 hover:bg-slate-500 border-slate-400 text-white",
};

function ActionRail({ actions }) {
  const { t } = useTranslation();

  return (
    <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-800 bg-slate-950 p-1 lg:w-[112px] lg:flex-col lg:overflow-x-visible lg:border-b-0 lg:border-e">
      {actions.map((action) => {
        const Icon = action.icon;

        return (
          <button
            key={action.id}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.disabled ? t("pos.void.notAllowed") : undefined}
            className={`group flex w-[80px] shrink-0 flex-col items-center justify-center gap-1.5 border-b-2 px-1 py-2.5 text-center shadow-md shadow-black/30 transition-all duration-150 active:translate-y-px active:shadow-none disabled:cursor-not-allowed disabled:opacity-30 lg:min-h-0 lg:w-auto lg:flex-1 lg:py-0 ${
              TONES[action.tone] || TONES.slate
            }`}
          >
            {Icon && (
              <Icon
                className="h-[18px] w-[18px] transition-transform group-hover:scale-110"
                strokeWidth={2}
              />
            )}
            <span className="text-[9px] font-bold uppercase leading-[1.2] tracking-[0.06em] lg:text-[10px]">
              {t(action.label)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export default ActionRail;
