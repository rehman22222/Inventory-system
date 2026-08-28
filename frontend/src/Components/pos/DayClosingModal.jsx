import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { FiAlertTriangle, FiLock, FiPrinter } from "react-icons/fi";
import axiosInstance from "../../lib/axios";
import PosModal from "./PosModal";
import { currency, printSlip } from "./posUtils";

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

  // One slip, rendered twice: once hidden for the printer, once on screen
  // when the shop has asked to see it first. Two copies of the markup would
  // drift, and the whole point of a preview is that it is what prints.
  const slip = summary && (
    <>
        <div className="s-head">
          <div className="s-shop">{SHOP?.name}</div>
          {(SHOP?.addressLines || []).map((line) => (
            <div key={line} className="s-addr">
              {line}
            </div>
          ))}
          <div className="s-title">{t("dayClosing.title")}</div>
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
          </div>
        ))}

        <div className="s-rule" />
        <div className="s-section">{t("dayClosing.byMethod")}</div>
        {summary.byMethod.map((entry) => (
          <div key={entry.method} className="s-line">
            <span>{t(`common.payments.${entry.method}`, entry.method)}</span>
            <span>{currency(entry.amount)}</span>
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
        {summary.refunded > 0 && (
          <div className="s-line">
            <span>{t("dayClosing.refunded")}</span>
            <span>-{currency(summary.refunded)}</span>
          </div>
        )}
        <div className="s-rule" />
        <div className="s-total">
          <span>{t("dayClosing.total")}</span>
          <span>{currency(summary.net)}</span>
        </div>
        <div className="s-line">
          <span>{t("dayClosing.salesCount")}</span>
          <span>{summary.receiptCount}</span>
        </div>
    </>
  );

  return (
    <PosModal
      title={t("dayClosing.title")}
      subtitle={t("dayClosing.subtitle")}
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

          {/* Payment breakdown — what should physically be in the drawer/terminal. */}
          <div className="border border-slate-800 bg-black/40 px-4 py-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">
              {t("dayClosing.byMethod")}
            </p>
            <div className="space-y-1.5 text-sm">
              {summary.byMethod.map((entry) => (
                <div key={entry.method} className="flex justify-between gap-6">
                  <span className="text-slate-400">
                    {t(`common.payments.${entry.method}`, entry.method)}
                  </span>
                  <span className="tabular-nums text-slate-200">{currency(entry.amount)}</span>
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
            {summary.refunded > 0 && (
              <div className="flex justify-between gap-6 text-slate-500">
                <span>{t("dayClosing.refunded")}</span>
                <span className="tabular-nums text-red-400">-{currency(summary.refunded)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between gap-6 border-t border-slate-800 pt-2">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {t("dayClosing.total")}
              </span>
              <span className="font-display text-2xl font-bold tabular-nums text-cyan-400">
                {currency(summary.net)}
              </span>
            </div>
          </div>

          {confirming && (
            <div className="flex gap-3 border border-amber-800 bg-amber-950/30 px-4 py-3">
              <FiAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <p className="text-sm text-amber-200">{t("dayClosing.warning")}</p>
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
