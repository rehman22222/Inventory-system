import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { currency, refundReasonLabel } from "./posUtils";

// The customer's record of what went back, as one definition.
//
// It is printed from two places — the refund that has just gone through, and
// any row in the refund history — and a second copy of this markup would drift
// from the first the moment either changed. The caller decides where it lives
// and what it is called; this only decides what it says.
//
// On an exchange it covers only the half that has just happened; what the
// customer took instead is rung up as an ordinary sale and prints its own
// receipt.
function RefundSlipBody({ slip, shop, t }) {
  // Same template the sale receipt uses, so a shop that points its QR at a
  // lookup URL gets it on both kinds of paper rather than only one.
  const qr = (shop?.qrTemplate || "{ref}").replace(
    "{ref}",
    slip.reference || slip.receiptNo || "",
  );

  return (
    <>
      <div className="s-head">
        <div className="s-shop">{shop?.name}</div>
        {(shop?.addressLines || []).map((line) => (
          <div key={line} className="s-addr">
            {line}
          </div>
        ))}
        <div className="s-title">{t("pos.refund.slipTitle", "Refund")}</div>
      </div>

      <div className="s-meta">
        <span>{t("pos.refund.slipRef", "Refund")}</span>
        <span>{slip.reference}</span>
      </div>
      <div className="s-meta">
        <span>{t("pos.receipt")}</span>
        <span>{slip.receiptNo}</span>
      </div>
      <div className="s-meta">
        <span>{t("dayClosing.printedAt", "Printed")}</span>
        <span>{new Date(slip.at).toLocaleString()}</span>
      </div>
      {slip.by && (
        <div className="s-meta">
          <span>{t("dayClosing.cashier", "Cashier")}</span>
          <span>{slip.by}</span>
        </div>
      )}

      <div className="s-rule" />
      <div className="s-section">{t("pos.refund.returned", "Returned")}</div>
      {(slip.items || []).map((item, i) => (
        <div key={`${item.name}-${i}`} className="s-item">
          <span>
            {item.quantity} × {item.name}
          </span>
          <span>{currency(item.lineTotal)}</span>
        </div>
      ))}

      <div className="s-rule" />
      <div className="s-total">
        <span>{t("dayClosing.refunded")}</span>
        <span>-{currency(slip.amount)}</span>
      </div>

      {/* What was spent on the replacement rather than handed over. Both halves
          have to be on the paper or the figures above them do not add up. */}
      {slip.exchangeCredit > 0 && (
        <div className="s-line">
          <span>{t("pos.exchange.credit", "Refund credit")}</span>
          <span>{currency(slip.exchangeCredit)}</span>
        </div>
      )}

      {/* Only when money genuinely crossed the counter. An exchange that used
          the whole refund handed nothing back, and "Refund by: Cash" under it
          would describe a payment that never happened. */}
      {slip.method && slip.cashBack !== 0 && (
        <div className="s-line">
          <span>{t("pos.refund.method", "Refund by")}</span>
          <span>
            {t(`common.payments.${slip.method}`, slip.method)}
            {slip.cashBack > 0 && slip.exchangeCredit > 0
              ? ` ${currency(slip.cashBack)}`
              : ""}
          </span>
        </div>
      )}

      {slip.reason && slip.reason !== "refund" && (
        <div className="s-line">
          <span>{t("pos.refund.why", "Why it came back")}</span>
          <span>{refundReasonLabel(t, slip.reason)}</span>
        </div>
      )}

      {slip.exchange?.length > 0 && (
        <>
          <div className="s-rule" />
          <div className="s-section">{t("pos.exchange.title", "Exchange for")}</div>
          {slip.exchange.map((item) => (
            <div key={String(item.productId)} className="s-item">
              <span>
                {item.quantity} × {item.name}
              </span>
              <span>{currency(item.price * item.quantity)}</span>
            </div>
          ))}
          <div className="s-line">
            <span>
              {slip.difference >= 0
                ? t("pos.exchange.customerPays", "Customer pays")
                : t("pos.exchange.customerGets", "Customer gets back")}
            </span>
            <span>{currency(Math.abs(slip.difference))}</span>
          </div>
        </>
      )}

      {/* The refund's own number, scannable. Last on the paper, the way it is
          on the sale receipt, so both kinds of slip end the same way. The
          number is not repeated under it — it is already at the top, and
          printing it twice only makes the customer wonder which one matters. */}
      <div className="s-rule" />
      <div className="s-qr">
        <QRCodeSVG value={qr} size={96} level="M" />
      </div>
    </>
  );
}

export default RefundSlipBody;
