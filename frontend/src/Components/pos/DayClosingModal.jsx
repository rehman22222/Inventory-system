import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { FiAlertTriangle, FiLock, FiPrinter } from "react-icons/fi";
import axiosInstance from "../../lib/axios";
import PosModal from "./PosModal";
import { currency, printSlip } from "./posUtils";

// Tenders that are money on a receipt and nothing in a drawer: a sale on
// account, and credit from a return being spent on the replacement. Mirrors
// NON_CASH_TENDERS in backend/libs/dayClosing.js.
const NON_TAKINGS = new Set(["credit", "refund"]);

const stamp = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const clock = (value) =>
  value
    ? new Date(value).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

// End of shift: show the cashier exactly what they are about to hand over, then
// close. Once closed the batch belongs to the admin and leaves this till's
// history — so the confirm step is deliberate and spells that out.
// A summary written before the takings were split into three figures still has
// to render. `net` was the sales total before refunds, so gross falls back to
// it and net sales falls back to net-minus-refunds — the arithmetic the screen
// was showing the shape of but never actually doing.
const figures = (summary) => {
  const grossSales = Number(summary.grossSales ?? summary.net ?? 0);
  const refundAmount = Number(summary.refundAmount ?? summary.refunded ?? 0);

  return {
    grossSales,
    refundAmount,
    exchangeCredit: Number(summary.exchangeCredit || 0),
    creditRepaid: Number(summary.creditRepaid || 0),
    netSales: Number(summary.netSales ?? grossSales - refundAmount),
    cashHandedBack: Number(
      summary.cashHandedBack ?? refundAmount - Number(summary.exchangeCredit || 0),
    ),
    // Older rows have no per-method refunds, so the best that can be said is
    // what was taken in. Marked as such rather than passed off as a count.
    drawer: (summary.byMethod || []).map((entry) => ({
      ...entry,
      expected: entry.expected ?? null,
    })),
  };
};

function DayClosingModal({ onClosed, onClose }) {
  const { t } = useTranslation();
  const { store: SHOP } = useSelector((state) => state.store);
  const [summary, setSummary] = useState(null);
  const [cashierName, setCashierName] = useState("");
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const printNow = () => {
    printSlip("day-closing-print");
    setPreviewing(false);
  };

  // With direct printing on the slip goes straight out; with it off the till
  // shows what it is about to print and waits to be told. This is the shop's
  // own setting and is separate from the browser's print dialog, which no page
  // can suppress — that takes the --kiosk-printing launch flag.
  const printSummary = () => (SHOP?.directPrint ? printNow() : setPreviewing(true));

  useEffect(() => {
    let alive = true;

    axiosInstance
      .get("pos/day-closing/summary")
      .then((response) => {
        if (!alive) return;
        setSummary(response.data.summary);
        setCashierName(response.data.cashierName || "");
      })
      .catch((error) => {
        toast.error(error.response?.data?.message || t("dayClosing.summaryFailed"));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [t]);

  const closeDay = async () => {
    setClosing(true);
    try {
      const response = await axiosInstance.post("pos/day-closing/close");
      toast.success(
        t("dayClosing.closed", { reference: response.data.closing?.reference })
      );
      onClosed?.();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || t("dayClosing.closeFailed"));
      setClosing(false);
    }
  };

  const nothingToClose = !loading && (summary?.receiptCount || 0) === 0;

  // Credit a customer is still owed. Listing it was not enough — a list above
  // the button is a list somebody scrolls past — so closing the day has to say
  // out loud that it is being left behind. It does not block: the cashier may
  // genuinely be handing it to the next shift, and a till that cannot be closed
  // is worse than one that asks.
  const loose = summary?.unspentCredit || [];
  const looseTotal = loose.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  // One slip, rendered twice: once hidden for the printer, once on screen
  // when the shop has asked to see it first. Two copies of the markup would
  // drift, and the whole point of a preview is that it is what prints.
  const money = summary && figures(summary);

  const slip = summary && (
    <>
        <div className="s-head">
          <div className="s-shop">{SHOP?.name}</div>
          {(SHOP?.addressLines || []).map((line) => (
            <div key={line} className="s-addr">
              {line}
            </div>
          ))}
          {/* What the till calls it. The admin side still says "Day closing"
              on the stored record and its report — same document, two counters
              that name it differently. */}
          <div className="s-title">{t("pos.roaster.title", "Day Roaster")}</div>
        </div>

        <div className="s-meta">
          <span>{t("dayClosing.cashier", "Cashier")}</span>
          <span>{cashierName}</span>
        </div>
        <div className="s-meta">
          <span>{t("dayClosing.from", "From")}</span>
          <span>{stamp(summary.openedAt)}</span>
        </div>
        <div className="s-meta">
          <span>{t("dayClosing.printedAt", "Printed")}</span>
          <span>{stamp(new Date())}</span>
        </div>

        <div className="s-rule" />
        <div className="s-section">{t("dayClosing.salesOfDay", "Sales")}</div>

        {(summary.sales || []).map((sale) => (
          <div key={sale.receiptNo} className="s-row">
            <div className="s-row-top">
              <span>{sale.receiptNo}</span>
              <span>{currency(sale.total)}</span>
            </div>
            <div className="s-row-sub">
              <span>
                {clock(sale.at)} · {t(`common.payments.${sale.method}`, sale.method)} ·{" "}
                {t("dayClosing.itemCount", "{{n}} items", { n: sale.items })}
              </span>
              {sale.refunded > 0 && <span>-{currency(sale.refunded)}</span>}
            </div>
            {/* Every line on the sale. This is what makes the roll worth
                keeping: a receipt number and a total say a sale happened, and
                nothing about what left the shelf. */}
            {(sale.lines || []).map((line, index) => (
              <div key={`${sale.receiptNo}-${index}`} className="s-item">
                <span>
                  {line.quantity} × {line.name}
                </span>
                <span>{currency(line.lineTotal)}</span>
              </div>
            ))}
          </div>
        ))}

        <div className="s-rule" />
        <div className="s-section">{t("dayClosing.byMethod")}</div>
        {/* Taken in, handed back, and what should be there — per method, on one
            line each, because that is what the person counting the drawer is
            doing. A card sale refunded in cash moves the cash row, not the
            card row, and no other layout makes that visible. */}
        {money.drawer.map((entry) => (
          <div key={entry.method} className="s-row">
            <div className="s-row-top">
              <span>{t(`common.payments.${entry.method}`, entry.method)}</span>
              <span>
                {entry.expected === null ? currency(entry.amount) : currency(entry.expected)}
              </span>
            </div>
            {entry.expected !== null && entry.refunded > 0 && (
              <div className="s-row-sub">
                <span>
                  {t("dayClosing.takenIn", "Taken")} {currency(entry.amount)}
                </span>
                <span>
                  {t("dayClosing.handedBackShort", "Back")} -{currency(entry.refunded)}
                </span>
              </div>
            )}
            {NON_TAKINGS.has(entry.method) && (
              <div className="s-row-sub">
                <span>{t("dayClosing.notTakings", "not takings")}</span>
                <span>{currency(entry.amount)}</span>
              </div>
            )}
          </div>
        ))}

        <div className="s-rule" />
        <div className="s-line">
          <span>{t("pos.subtotal")}</span>
          <span>{currency(summary.gross)}</span>
        </div>
        {summary.discount > 0 && (
          <div className="s-line">
            <span>{t("pos.discount")}</span>
            <span>-{currency(summary.discount)}</span>
          </div>
        )}
        {summary.tax > 0 && (
          <div className="s-line">
            <span>{t("pos.tax")}</span>
            <span>{currency(summary.tax)}</span>
          </div>
        )}
        <div className="s-line">
          <span>{t("dayClosing.grossSales", "Gross sales")}</span>
          <span>{currency(money.grossSales)}</span>
        </div>
        {money.refundAmount > 0 && (
          <div className="s-line">
            <span>{t("dayClosing.refunded")}</span>
            <span>-{currency(money.refundAmount)}</span>
          </div>
        )}
        {/* Refunded value and cash out of the drawer stopped being the same
            number the day exchanges existed. What was spent on a replacement
            never left the till, so the count comes up short by exactly this
            much unless the slip says so. */}
        {money.exchangeCredit > 0 && (
          <div className="s-row-sub">
            <span>{t("dayClosing.exchangeCredit", "Spent on exchanges")}</span>
            <span>{currency(money.exchangeCredit)}</span>
          </div>
        )}
        {/* Refund credit nobody spent. On the paper as well as the screen: the
            slip is what gets checked against the drawer, and this is money the
            shop is holding for a customer who walked out without it. */}
        {(summary.unspentCredit || []).length > 0 && (
          <>
            <div className="s-rule" />
            <div className="s-section">
              {t("dayClosing.unspentCredit", "Refund credit not spent")}
            </div>
            {summary.unspentCredit.map((entry) => (
              <div key={entry.reference} className="s-item">
                <span>{entry.reference}</span>
                <span>{currency(entry.amount)}</span>
              </div>
            ))}
          </>
        )}

        <div className="s-rule" />
        {/* What the shop kept. The old slip printed the sales total here, under
            a line that said the refunds had been taken off — they had not. */}
        <div className="s-total">
          <span>{t("dayClosing.netSales", "Net sales")}</span>
          <span>{currency(money.netSales)}</span>
        </div>
        <div className="s-line">
          <span>{t("dayClosing.salesCount")}</span>
          <span>{summary.receiptCount}</span>
        </div>
    </>
  );

  return (
    <PosModal
      title={t("pos.roaster.title", "Day Roaster")}
      subtitle={t("pos.roaster.subtitle", "Hand your takings over to the admin.")}
      onClose={onClose}
      width="max-w-md"
      footer={
        !loading && !nothingToClose ? (
          confirming ? (
            <>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={closing}
                className="bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
              >
                {t("dayClosing.back")}
              </button>
              <button
                type="button"
                onClick={closeDay}
                disabled={closing}
                className="flex items-center gap-2 bg-red-700 px-4 py-2 text-sm font-bold uppercase tracking-wide text-white hover:bg-red-600 disabled:opacity-50"
              >
                <FiLock className="h-4 w-4" />
                {closing ? t("dayClosing.closingNow") : t("dayClosing.confirmClose")}
              </button>
            </>
          ) : (
            <>
              {/* Printable before closing as well as after: the cashier counts
                  the drawer against this slip, and that happens first. */}
              <button
                type="button"
                onClick={printSummary}
                className="me-auto flex items-center gap-2 border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
              >
                <FiPrinter className="h-4 w-4" />
                {t("dayClosing.print", "Print")}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="flex items-center gap-2 bg-gradient-to-b from-blue-600 to-blue-700 px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white ring-1 ring-blue-500 hover:from-blue-500"
              >
                <FiLock className="h-4 w-4" />
                {t("dayClosing.closeDay")}
              </button>
            </>
          )
        ) : null
      }
    >
      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">{t("pos.processing")}</p>
      ) : nothingToClose ? (
        <p className="py-8 text-center text-sm text-slate-500">{t("dayClosing.nothingToClose")}</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between border border-slate-800 bg-black/40 px-4 py-3">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {t("dayClosing.salesCount")}
            </span>
            <span className="text-lg font-bold tabular-nums text-slate-100">
              {summary.receiptCount}
            </span>
          </div>

          {/* What should physically be there, per method. The headline figure
              is what is left after refunds went back out — counting a drawer
              against what was taken IN is how a shift comes up short with
              nobody able to say why. */}
          <div className="border border-slate-800 bg-black/40 px-4 py-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">
              {t("dayClosing.expectedDrawer", "Count the drawer")}
            </p>
            <div className="space-y-2 text-sm">
              {money.drawer.map((entry) => (
                <div key={entry.method}>
                  <div className="flex justify-between gap-6">
                    <span className="text-slate-400">
                      {t(`common.payments.${entry.method}`, entry.method)}
                    </span>
                    <span
                      className={`tabular-nums ${
                        NON_TAKINGS.has(entry.method) ? "text-slate-500" : "text-slate-100"
                      }`}
                    >
                      {entry.expected === null
                        ? currency(entry.amount)
                        : currency(NON_TAKINGS.has(entry.method) ? entry.amount : entry.expected)}
                    </span>
                  </div>

                  {/* Only where the two figures differ. On an ordinary method
                      with no refunds there is nothing to explain. */}
                  {entry.expected !== null && entry.refunded > 0 && (
                    <div className="flex justify-between gap-6 text-[11px] text-slate-600">
                      <span>
                        {t("dayClosing.takenIn", "Taken")} {currency(entry.amount)}
                      </span>
                      <span className="text-red-400">
                        {t("dayClosing.handedBackShort", "Back")} -{currency(entry.refunded)}
                      </span>
                    </div>
                  )}

                  {NON_TAKINGS.has(entry.method) && (
                    <p className="text-[11px] text-slate-600">
                      {t("dayClosing.notTakings", "not takings")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Money */}
          <div className="space-y-1.5 border border-slate-800 bg-black/40 px-4 py-3 text-sm">
            <div className="flex justify-between gap-6 text-slate-500">
              <span>{t("pos.subtotal")}</span>
              <span className="tabular-nums text-slate-300">{currency(summary.gross)}</span>
            </div>
            {summary.discount > 0 && (
              <div className="flex justify-between gap-6 text-slate-500">
                <span>{t("pos.discount")}</span>
                <span className="tabular-nums text-amber-400">-{currency(summary.discount)}</span>
              </div>
            )}
            {summary.tax > 0 && (
              <div className="flex justify-between gap-6 text-slate-500">
                <span>{t("pos.tax")}</span>
                <span className="tabular-nums text-slate-300">{currency(summary.tax)}</span>
              </div>
            )}
            <div className="flex justify-between gap-6 text-slate-500">
              <span>{t("dayClosing.grossSales", "Gross sales")}</span>
              <span className="tabular-nums text-slate-300">{currency(money.grossSales)}</span>
            </div>
            {money.refundAmount > 0 && (
              <div className="flex justify-between gap-6 text-slate-500">
                <span>{t("dayClosing.refunded")}</span>
                <span className="tabular-nums text-red-400">-{currency(money.refundAmount)}</span>
              </div>
            )}
            {money.exchangeCredit > 0 && (
              <div className="flex justify-between gap-6 text-[11px] text-slate-600">
                <span>{t("dayClosing.exchangeCredit", "Spent on exchanges")}</span>
                <span className="tabular-nums">{currency(money.exchangeCredit)}</span>
              </div>
            )}
            {Number(money.creditRepaid || 0) > 0 && (
              <div className="flex justify-between gap-6 text-slate-500">
                <span>{t("dayClosing.creditRepaid", "Credit repaid")}</span>
                <span className="tabular-nums text-emerald-400">
                  {currency(money.creditRepaid)}
                </span>
              </div>
            )}
            {/* What the shop kept. This line used to print the sales total
                directly beneath "Refunded -30" — the layout read as arithmetic
                that was never done. */}
            <div className="mt-2 flex justify-between gap-6 border-t border-slate-800 pt-2">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {t("dayClosing.netSales", "Net sales")}
              </span>
              <span className="font-display text-2xl font-bold tabular-nums text-cyan-400">
                {currency(money.netSales)}
              </span>
            </div>
          </div>

          {/* Shown before the confirm step, not after it: this is a thing to go
              and do, not a warning to click past. */}
          {(summary.unspentCredit || []).length > 0 && (
            <div className="border border-amber-700 bg-amber-950/40 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-300">
                {t("dayClosing.unspentCredit", "Refund credit not spent")}
              </p>
              <p className="mt-1 text-xs text-amber-200/80">
                {t(
                  "dayClosing.unspentCreditHint",
                  "A return was taken as an exchange and the replacement was never rung up. This money is still the customer's.",
                )}
              </p>
              <ul className="mt-2 space-y-1">
                {summary.unspentCredit.map((entry) => (
                  <li
                    key={entry.reference}
                    className="flex justify-between gap-4 text-sm text-amber-100"
                  >
                    <span className="font-mono">{entry.reference}</span>
                    <span className="tabular-nums">{currency(entry.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {confirming && (
            <div className="space-y-3">
              <div className="flex gap-3 border border-amber-800 bg-amber-950/30 px-4 py-3">
                <FiAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                <p className="text-sm text-amber-200">{t("dayClosing.warning")}</p>
              </div>

              {loose.length > 0 && (
                <div className="flex gap-3 border border-red-800 bg-red-950/40 px-4 py-3">
                  <FiAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                  <p className="text-sm text-red-200">
                    {t("dayClosing.closingWithCredit", {
                      amount: currency(looseTotal),
                      count: loose.length,
                      defaultValue:
                        "{{amount}} of refund credit across {{count}} refund(s) is still unspent. Hand it back or ring up the replacement before closing — after this it belongs to the admin.",
                    })}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* The slip for the 80mm roll. Hidden on screen; the print stylesheet
              is what makes it the only thing on the page. */}
          <div id="day-closing-print" className="slip hidden">{slip}</div>

          {/* What is about to come out of the printer, on the same 72mm width
              and in the same type. `no-print` keeps this copy off the paper —
              the hidden one above is what actually prints. */}
          {previewing && (
            <div className="no-print fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
              <div className="flex max-h-[90vh] w-full max-w-[340px] flex-col bg-white shadow-2xl">
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <div className="slip">{slip}</div>
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-slate-300 p-3">
                  <button
                    type="button"
                    onClick={() => setPreviewing(false)}
                    className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
                  >
                    {t("dayClosing.back")}
                  </button>
                  <button
                    type="button"
                    onClick={printNow}
                    className="flex items-center gap-2 bg-slate-900 px-4 py-2 text-sm font-bold uppercase tracking-wide text-white hover:bg-slate-700"
                  >
                    <FiPrinter className="h-4 w-4" />
                    {t("dayClosing.print", "Print")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </PosModal>
  );
}

export default DayClosingModal;
