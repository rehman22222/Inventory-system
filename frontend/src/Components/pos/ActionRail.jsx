import React from "react";
import { useTranslation } from "react-i18next";

// The action rail. Each action carries its own colour so a cashier finds it by
// sight, not by reading — the way a real till's coloured keys work. On a till it
// is a vertical column whose buttons share the height; on a tablet it becomes a
// horizontally scrolling strip.
//
// The colours are chosen per button rather than picked off a palette, because
// the point is what each one MEANS. A shift learns "the red one clears, the
// dark red one reverses, the gold one is money owed" long before it learns to
// read ten labels in a column:
//
//   blue    finding and browsing        purple  deals and special value
//   violet  promotions                  grey    a tool, no consequence
//   gold    money and accounts          green   saved, safe, resume
//   red     destructive                 maroon  reversing a transaction
//   royal   records and history         teal    end-of-shift summary
//
// Two blues sit in here on purpose: finding a product and reading the sale
// history are both "go and look at something", and neither changes anything.
const COLOURS = {
  search: "#60A1C3", // Find Product — blue: find, browse, navigate
  deals: "#71268C", // Deals — deep purple: special value
  vouchers: "#6037D4", // Promotions — blue-violet: marketing
  code: "#4C5568", // Enter Barcode — charcoal: a utility
  credit: "#C0781C", // Customer Credit — gold: money and accounts
  resume: "#467659", // Held Sales — forest green: saved and safe
  void: "#BA3227", // Clear Basket — red: destructive
  refund: "#A0223B", // Refund / Exchange — maroon: reversing a sale
  history: "#3754D4", // Sales History — royal blue: records
  dayClosing: "#46756E", // Till Summary — muted teal: closing up
};

// Anything added later without a colour of its own. Charcoal rather than a
// bright default: a button whose meaning nobody has decided should not shout.
const FALLBACK = "#4C5568";

function ActionRail({ actions }) {
  const { t } = useTranslation();

  return (
    <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-800 bg-slate-950 p-1 lg:w-[112px] lg:flex-col lg:overflow-x-visible lg:border-b-0 lg:border-e">
      {actions.map((action) => {
        const Icon = action.icon;
        const colour = COLOURS[action.id] || FALLBACK;

        return (
          <button
            key={action.id}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.disabled ? t("pos.void.notAllowed") : undefined}
            style={{ backgroundColor: colour, borderBottomColor: "rgba(255,255,255,0.28)" }}
            // The press feedback is unchanged — on a screen with no travel it
            // is the only thing telling a cashier the tap landed. Brightness on
            // hover rather than a second colour, so one hex per button stays
            // the whole story.
            className="group flex w-[80px] shrink-0 flex-col items-center justify-center gap-1.5 border-b-2 px-1 py-2.5 text-center text-white shadow-md shadow-black/30 transition-all duration-150 hover:brightness-110 active:translate-y-px active:brightness-95 active:shadow-none disabled:cursor-not-allowed disabled:opacity-30 lg:min-h-0 lg:w-auto lg:flex-1 lg:py-0"
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
