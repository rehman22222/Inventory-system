import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { FiAlertTriangle, FiLock } from "react-icons/fi";
import axiosInstance from "../../lib/axios";
import PosModal from "./PosModal";
import { currency } from "./posUtils";

// End of shift: show the cashier exactly what they are about to hand over, then
// close. Once closed the batch belongs to the admin and leaves this till's
// history — so the confirm step is deliberate and spells that out.
function DayClosingModal({ onClosed, onClose }) {
  const { t } = useTranslation();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let alive = true;

    axiosInstance
      .get("pos/day-closing/summary")
      .then((response) => {
        if (alive) setSummary(response.data.summary);
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
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex items-center gap-2 bg-gradient-to-b from-blue-600 to-blue-700 px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white ring-1 ring-blue-500 hover:from-blue-500"
            >
              <FiLock className="h-4 w-4" />
              {t("dayClosing.closeDay")}
            </button>
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
        </div>
      )}
    </PosModal>
  );
}

export default DayClosingModal;
