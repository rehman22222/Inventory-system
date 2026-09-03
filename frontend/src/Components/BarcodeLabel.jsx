import React, { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

// One shelf-edge label: the price a customer reads, and a real EAN-13 symbol the
// scanner reads. Rendered as SVG so it stays crisp at any print size.
//
// Two shapes of label, because two places ask for one and they are not asking
// for the same thing:
//
//   plain — price over a symbol. What the stock screens print in bulk when all
//           they know is a code and a price. The default, so those callers keep
//           the sticker they already print.
//   shelf — the price sticker: what it costs NOW in the highlight, what it cost
//           before struck through on white beside it, the product named
//           underneath. No captions anywhere on it — a shopper does not need to
//           be told which of two numbers, one of them crossed out, is the one
//           they pay.
//
// `name` and `wasPrice` are optional even in the shelf variant — a ticket with
// neither is simply a price and a symbol laid out in the shelf shape.
//
// The symbol runs the FULL WIDTH of the shelf ticket. EAN-13 wants about 30mm
// to scan reliably, and a column beside the price blocks is barely 20mm — a
// prettier sticker that half the scans miss is a worse sticker.
//
// The `margin` is the quiet zone. It looks like empty space but it is part of
// the symbol — EAN-13 will not scan reliably without it, so do not set it to 0
// to squeeze the label down.
function BarcodeLabel({ code, price, wasPrice, symbol = "€", name, variant = "plain" }) {
  const ref = useRef(null);
  const shelf = variant === "shelf";

  useEffect(() => {
    if (!ref.current || !code) return;

    try {
      JsBarcode(ref.current, String(code), {
        format: "EAN13",
        width: 2,
        // Shorter on the shelf ticket: it shares the label with the price
        // blocks, and at the plain sticker's height it swamped them.
        height: shelf ? 32 : 46,
        fontSize: shelf ? 13 : 15,
        textMargin: 1,
        margin: 8,
        displayValue: true,
      });
    } catch {
      // A malformed code shouldn't take the whole sheet down — leave it blank
      // and let the rest of the batch print.
    }
  }, [code, shelf]);

  const money = (value) => `${symbol}${Number(value).toFixed(2)}`;

  // A markdown is only a markdown if the old price was HIGHER. Anything else —
  // a blank box, a typo, a figure that is not the previous shelf price — prints
  // no old price at all rather than a ticket claiming the price went up.
  const was = Number(wasPrice);
  const marked = Number.isFinite(was) && was > Number(price);

  if (!shelf) {
    return (
      <div className="bc-label">
        <div className="bc-price">{money(price)}</div>
        <svg ref={ref} className="bc-svg" />
      </div>
    );
  }

  return (
    <div className="bc-label bc-shelf">
      <div className="bc-shelf-row">
        {/* What it costs now, in the highlight. The one number on the sticker
            that has to be readable across an aisle. */}
        <div className="bc-now">{money(price)}</div>
        {/* What it cost before — left on the white, struck through, and
            deliberately smaller: it is context for the yellow, not a rival
            to it. */}
        {marked && <div className="bc-was">{money(was)}</div>}
      </div>

      {name && <div className="bc-name">{name}</div>}

      <svg ref={ref} className="bc-svg" />
    </div>
  );
}

export default BarcodeLabel;
