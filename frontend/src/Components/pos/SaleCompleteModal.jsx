import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { FiMail, FiPrinter, FiSlash } from "react-icons/fi";
import axiosInstance from "../../lib/axios";
import PosModal from "./PosModal";
import { currency } from "./posUtils";

// The moment the sale lands. Change due is the only thing the cashier needs in
// that second, so it is the whole screen; everything else is a choice about the
// receipt, made once and deliberately.
//
// "Go green" is emailed rather than printed. The address is used for this one
// message and not stored — a shop offering to save paper should not be quietly
// building a mailing list out of it.
function SaleCompleteModal({ receipt, onPrint, onClose }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);

  const send = async () => {
    const to = email.trim();
    if (!to) return;

    setSending(true);
    try {
      await axiosInstance.post(`pos/receipt/${receipt.receiptNo}/email`, {
        email: to,
      });
      toast.success(t("pos.complete.emailed", { email: to }));
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || t("pos.complete.emailFailed"));
    } finally {
      setSending(false);
    }
  };

  const change = Number(receipt.changeDue || 0);
  const tendered = Number(receipt.amountTendered || 0);

  return (
    <PosModal
      title={t("pos.complete.title", "Sale complete")}
      subtitle={receipt.receiptNo}
      onClose={onClose}
      width="max-w-lg"
    >
      <div className="space-y-6 py-2">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            {t("pos.changeDue")}
          </p>
          <p
            className={`font-display text-6xl font-bold tabular-nums ${
              change > 0 ? "text-amber-300" : "text-slate-100"
            }`}
          >
            {currency(change)}
          </p>
        </div>

        <dl className="space-y-1 border border-slate-800 bg-black/40 px-4 py-3 text-sm">
          <div className="flex justify-between gap-6">
            <dt className="text-slate-500">{t("pos.total")}</dt>
            <dd className="tabular-nums text-slate-200">{currency(receipt.total)}</dd>
          </div>
          {tendered > 0 && (
            <div className="flex justify-between gap-6">
              <dt className="text-slate-500">{t("pos.complete.tendered", "Amount tendered")}</dt>
              <dd className="tabular-nums text-slate-200">{currency(tendered)}</dd>
            </div>
          )}
        </dl>

        {receipt.offlinePending && (
          <p className="border border-amber-900 bg-amber-950/40 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-amber-300">
            {t("pos.offline.notSynced")}
          </p>
        )}

        {asking ? (
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("pos.complete.customerEmail", "Customer email")}
            </label>
            <div className="flex gap-2">
              <input
                autoFocus
                type="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && send()}
                placeholder="name@example.com"
                className="h-12 flex-1 border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={send}
                disabled={sending || !email.trim()}
                className="bg-emerald-700 px-5 text-sm font-bold uppercase tracking-wide text-white hover:bg-emerald-600 disabled:opacity-40"
              >
                {sending ? t("pos.processing") : t("pos.complete.send", "Send")}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setAsking(false)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-300"
            >
              {t("dayClosing.back")}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex flex-col items-center gap-2 border border-slate-800 py-4 text-slate-400 transition hover:border-slate-600 hover:text-slate-200"
            >
              <FiSlash className="h-6 w-6" />
              <span className="text-xs font-semibold">
                {t("pos.complete.noReceipt", "No receipt")}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setAsking(true)}
              className="flex flex-col items-center gap-2 border border-emerald-800 bg-emerald-950/30 py-4 text-emerald-300 transition hover:border-emerald-500 hover:bg-emerald-900/40"
            >
              <FiMail className="h-6 w-6" />
              <span className="text-xs font-semibold">
                {t("pos.complete.goGreen", "Go green")}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                onPrint();
                onClose();
              }}
              className="flex flex-col items-center gap-2 border border-slate-700 bg-slate-800/60 py-4 text-slate-100 transition hover:border-cyan-500 hover:bg-slate-800"
            >
              <FiPrinter className="h-6 w-6" />
              <span className="text-xs font-semibold">
                {t("pos.complete.print", "Print receipt")}
              </span>
            </button>
          </div>
        )}
      </div>
    </PosModal>
  );
}

export default SaleCompleteModal;
