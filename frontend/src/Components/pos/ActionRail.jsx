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
  search: "#2E9E4F", // Find Product — green
  deals: "#6C2BD9", // Deals — rich purple: special value
  vouchers: "#5B36E8", // Promotions — bright violet: marketing
  code: "#374151", // Enter Barcode — charcoal: a utility
  credit: "#A85F00", // Credit Logs — amber: money and accounts
  /* Blue, and it is the one that moved rather than the amber above it.
   *
   * The two were near-identical warm tones sitting flush against each other,
   * on the one rail whose whole purpose is being found without reading. Amber
   * stays because it means something on this button — money and accounts — and
   * that meaning is worth keeping; a parked basket has no colour it has to be,
   * so it is the one free to move. Blue also reads as "put away, waiting",
   * which is exactly what a held sale is. */
  resume: "#1565C0", // Held Sales — blue
  // Near-black. It is the one button that throws work away, and giving it no
  // colour at all is its own kind of warning on a rail where everything else
  // has one: nothing about it invites a press.
  void: "#141619", // Clear Basket — black
  refund: "#C62828", // Refund / Exchange — red
  history: "#D9A400", // Sales History — yellow
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

/* Light at the top, dark at the bottom, and further apart than it was.
 *
 * At ±20 the sweep was there but barely — on a till monitor at arm's length the
 * buttons read as flat blocks of colour. ±42 across a slight diagonal gives
 * each one an actual face: the top edge catches light, the bottom sits in
 * shadow, and the rail looks like a row of keys rather than a painted strip.
 *
 * Still derived from the one hex per button above, so the table stays one line
 * per action and a colour changed there is still changed in one place. */
const gradient = (hex) =>
  `linear-gradient(158deg, ${shade(hex, 42)} 0%, ${shade(hex, 6)} 46%, ${shade(hex, -42)} 100%)`;

/* White text, or near-black?
 *
 * Worked out from the colour rather than written down beside it, because the
 * rail is meant to stay one line per action — a second entry per button is a
 * second thing to forget. It matters as soon as a light colour joins the list:
 * white on the yellow History button is about 2:1, which is unreadable at the
 * size these labels are set, while black on it is comfortable.
 *
 * Standard relative luminance, the same sum the WCAG contrast ratio is built
 * on, with the threshold where the two candidates cross over.
 */
const readableInk = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255);

  /* 0.35, not the 0.18 where black and white contrast equally.
   *
   * At the mathematical crossover this would flip the green and the orange to
   * black text too — technically better on each, but the rail would end up half
   * white-on-colour and half black-on-colour and read as a mistake. Sitting it
   * higher keeps the rail one thing, and still catches the case that actually
   * fails: white on the yellow History button is about 2:1, which cannot be
   * read at this size, while black on it is over 9:1. */
  return luminance > 0.35 ? "#161616" : "#ffffff";
};

function ActionRail({ actions }) {
  const { t } = useTranslation();

  return (
    <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-800 bg-slate-950 p-1 lg:w-[140px] lg:flex-col lg:overflow-x-visible lg:border-b-0 lg:border-e xl:w-[156px]">
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
              color: readableInk(colour),
              borderBottomColor: "rgba(255,255,255,0.28)",
            }}
            // The press feedback is unchanged — on a screen with no travel it
            // is the only thing telling a cashier the tap landed. Brightness on
            // hover rather than a second palette entry, so one hex per button
            // is still the whole story.
            className="group flex w-[92px] shrink-0 flex-col items-center justify-center gap-1.5 border-b-2 px-1.5 py-2.5 text-center shadow-md shadow-black/30 transition-all duration-150 hover:brightness-110 active:translate-y-px active:brightness-95 active:shadow-none disabled:cursor-not-allowed disabled:opacity-30 lg:min-h-0 lg:w-auto lg:flex-1 lg:py-0"
          >
            {Icon && (
              <Icon
                className="h-[22px] w-[22px] transition-transform group-hover:scale-110"
                strokeWidth={2}
              />
            )}
            <span className="text-[10px] font-bold uppercase leading-[1.2] tracking-[0.06em] lg:text-[12px]">
              {t(action.label)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export default ActionRail;
