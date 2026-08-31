import React, { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

// A voucher as a sticker.
//
// CODE128, not EAN-13: a voucher code is "SAVE10", and EAN-13 takes twelve
// digits and nothing else. CODE128 encodes any ASCII, which is what lets the
// shop choose codes people can also read out over the phone.
//
// The label is sized to go on a product. A cashier scanning it at the till gets
// the discount applied without typing anything, and the code is printed under
// the bars so it still works when the sticker has been through a pocket.
//
// The `margin` is the quiet zone. It looks like empty space but the scanner
// needs it — do not set it to 0 to squeeze the label down.
function VoucherLabel({ voucher, symbol = "€" }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !voucher?.code) return;

    try {
      JsBarcode(ref.current, String(voucher.code), {
        format: "CODE128",
        width: 1.6,
        height: 38,
        fontSize: 13,
        textMargin: 1,
        margin: 8,
        displayValue: true,
      });
    } catch {
      // A code the symbology cannot carry shouldn't take the sheet down.
    }
  }, [voucher?.code]);

  const off =
    voucher?.type === "percent"
      ? `${Number(voucher.value)}% OFF`
      : `${symbol}${Number(voucher?.value || 0).toFixed(2)} OFF`;

  return (
    <div className="vc-label">
      <div className="vc-off">{off}</div>
      <svg ref={ref} className="vc-svg" />
      <div className="vc-terms">
        {Number(voucher?.minSpend) > 0 && (
          <span>
            Min spend {symbol}
            {Number(voucher.minSpend).toFixed(2)}
          </span>
        )}
        {voucher?.expiresAt && (
          <span>Until {new Date(voucher.expiresAt).toLocaleDateString()}</span>
        )}
      </div>
    </div>
  );
}

export default VoucherLabel;
