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
  search: "#1976D2", // Find Product — strong blue: find, browse, navigate
  deals: "#6C2BD9", // Deals — rich purple: special value
  vouchers: "#5B36E8", // Promotions — bright violet: marketing
  code: "#374151", // Enter Barcode — charcoal: a utility
  credit: "#A85F00", // Customer Credit — amber: money and accounts
  resume: "#27864A", // Held Sales — green: saved and safe
  void: "#C62828", // Clear Basket — red: destructive
  // Deep magenta-red: a reversal is destructive too, but it is not the same
  // action as clearing, and two identical reds at a counter is how the wrong
  // one gets pressed.
  refund: "#A61E4D", // Refund / Exchange
  history: "#2952CC", // Sales History — royal blue: records
  dayClosing: "#2F6F6D", // Till Summary — deep teal: reporting
};

// Anything added later without a colour of its own. Charcoal rather than a
// bright default: a button whose meaning nobody has decided should not shout.
const FALLBACK = "#374151";

// The rail is painted with a gradient rather than a flat fill, so it sits with
// the tender buttons on the basket (CASH, CARD, CREDIT), which are gradients
// already. It is DERIVED from the one hex above rather than written out as a
// second colour per button: the table stays one line per action, and a colour
// changed there still only has to be changed once.
const shade = (hex, by) => {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${clamp(((n >> 16) & 255) + by)}, ${clamp(((n >> 8) & 255) + by)}, ${clamp(
    (n & 255) + by,
  )})`;
};

// Light at the top, dark at the bottom — the same direction and roughly the
// same distance as Tailwind's from-600/to-700 pairs the basket uses.
const gradient = (hex) => `linear-gradient(to bottom, ${shade(hex, 20)}, ${shade(hex, -20)})`;

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
            // backgroundColor stays underneath the gradient as the flat
            // fallback: if the image is ever not painted, the button is still
            // its own colour rather than transparent.
            style={{
              backgroundColor: colour,
              backgroundImage: gradient(colour),
              borderBottomColor: "rgba(255,255,255,0.28)",
            }}
            // The press feedback is unchanged — on a screen with no travel it
            // is the only thing telling a cashier the tap landed. Brightness on
            // hover rather than a second palette entry, so one hex per button
            // is still the whole story.
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
