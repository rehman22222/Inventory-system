import React, { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

// One shelf-edge label: the price a cashier reads, and a real EAN-13 symbol the
// scanner reads. Rendered as SVG so it stays crisp at any print size.
//
// The `margin` is the quiet zone. It looks like empty space but it is part of
// the symbol — EAN-13 will not scan reliably without it, so do not set it to 0
// to squeeze the label down.
function BarcodeLabel({ code, price, symbol = "€" }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !code) return;

    try {
      JsBarcode(ref.current, String(code), {
        format: "EAN13",
        width: 2,
        height: 46,
        fontSize: 15,
        textMargin: 1,
        margin: 8,
        displayValue: true,
      });
    } catch {
      // A malformed code shouldn't take the whole sheet down — leave it blank
      // and let the rest of the batch print.
    }
  }, [code]);

  return (
    <div className="bc-label">
      <div className="bc-price">
        {symbol}
        {Number(price).toFixed(2)}
      </div>
      <svg ref={ref} className="bc-svg" />
    </div>
  );
}

export default BarcodeLabel;
