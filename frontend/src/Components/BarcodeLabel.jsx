import React, { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

/* HOW WIDE A PRICE TICKET IS, IN MILLIMETRES, AND THE ONLY PLACE IT IS SAID.
 *
 * The ticket prints on the till's roll, the same way a receipt does — see
 * VoucherModal.printLabels for why it does not declare a page of its own. So
 * this is not a paper size: it is how much of the roll one ticket takes,
 * centred, which is why the ticket keeps the same shape on a wider roll.
 *
 * Two things read it — the preview in the dialog and the print rules in
 * index.css — and when they disagree the preview lies about what the roll will
 * do. Change it here and both follow.
 *
 * A word of warning about going narrower. An EAN-13 is 37.3mm wide at its
 * nominal size and scanners give up somewhere around 80% of that — about 30mm.
 * Below 40mm there is no width left for the symbol to be readable in, and the
 * ticket stops being scannable before it stops being printable. */
export const SHELF_LABEL_MM = { width: 72.5 };


// One shelf-edge label: the price a customer reads, and a real EAN-13 symbol the
// scanner reads. Rendered as SVG so it stays crisp at any print size.
//
// Two shapes of label, because two places ask for one and they are not asking
// for the same thing:
//
//   plain — price over a symbol. What the stock screens print in bulk when all
//           they know is a code and a price. The default, so those callers keep
//           the sticker they already print.
//   shelf — the ticket that goes in the rail on the shelf edge, in the format
//           the roll printer is expected to cut: header/product text, price,
//           barcode digits, and optional footer.
//
// THE TICKET PRINTS ON THE TILL'S ROLL, the way a receipt does, at the width
// in SHELF_LABEL_MM above. That decides most of what it looks like.
//
// A thermal head has one ink and no greys: it cannot print a colour, and asking
// it to fills the area with a dither pattern that reads as dirt. So the price is
// not a highlighted block. It is simply the biggest thing on the sticker, which
// is what makes it readable anyway.
//
// There is no "was" price. A markdown ticket wants a second figure struck
// through, and on a ticket this size two numbers made both of them too small
// to read across a shelf.
//
// The bars are SHORT. An EAN-13 at its nominal height wants nearly 23mm, which
// on a ticket this size leaves no room for a price — so the symbol is truncated,
// the way every small retail label truncates it. Truncation costs a little
// scanning tolerance at bad angles; the full width, which is what actually
// matters, is kept.
//
// The `margin` is the quiet zone. It looks like empty space but it is part of
// the symbol — EAN-13 will not scan reliably without it, so do not set it to 0
// to squeeze the label down.
function BarcodeLabel({
  code,
  price,
  symbol = "€",
  name,
  // Optional text the shop wants above and below the price. See the note above.
  header,
  footer,
  variant = "plain",
}) {
  const ref = useRef(null);
  const shelf = variant === "shelf";

  useEffect(() => {
    if (!ref.current || !code) return;

    try {
      JsBarcode(ref.current, String(code), {
        format: "EAN13",
        // A 203dpi thermal head lays down a coarser dot than a laser, so thin
        // bars bleed into their gaps — the symbol looks right and scans badly.
        // Two modules per bar is as fine as this printer should be asked for.
        width: 2,
        height: shelf ? 50 : 46,
        fontSize: shelf ? 14 : 15,
        textMargin: shelf ? 0 : 1,
        margin: 8,
        displayValue: !shelf,
      });
    } catch {
      // A malformed code shouldn't take the whole sheet down — leave it blank
      // and let the rest of the batch print.
    }
  }, [code, shelf]);

  const money = (value) => `${symbol}${Number(value).toFixed(2)}`;

  if (!shelf) {
    return (
      <div className="bc-label">
        <div className="bc-price">{money(price)}</div>
        <svg ref={ref} className="bc-svg" />
      </div>
    );
  }

  // Header/product text, price, symbol, footer — the same fields as before,
  // printed in the clearer thermal-label style.
  const top = (header || "").trim() || name;
  const bottom = (footer || "").trim();

  return (
    <div className="bc-label bc-shelf">
      {top && <div className="bc-name">{top}</div>}
      <div className="bc-now">{money(price)}</div>
      <svg ref={ref} className="bc-svg" />
      {bottom && <div className="bc-foot">{bottom}</div>}
    </div>
  );
}

export default BarcodeLabel;
