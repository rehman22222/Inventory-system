import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import axiosInstance from "../../lib/axios";
import PosModal from "./PosModal";
import { currency } from "./posUtils";

// Cashiers apply a code; admin/manager can also cut a new one without leaving
// the till. Redemption itself happens server-side inside the checkout
// transaction, so applying a code here is only a preview.
function VoucherModal({ subtotal, applied, canGenerate, onApply, onRemove, onClose }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("apply");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    code: "",
    type: "amount",
    value: "",
    minSpend: "",
    expiresAt: "",
    usageLimit: "1",
  });

  const applyCode = async (event) => {
    event.preventDefault();
    const value = code.trim().toUpperCase();
    if (!value) return;

    setBusy(true);
    try {
      const response = await axiosInstance.post("voucher/validate", {
        code: value,
        subtotal,
      });
      onApply({
        code: response.data.code,
        type: response.data.type,
        value: response.data.value,
        amount: response.data.computedDiscount,
      });
      toast.success(
        t("pos.voucher.applied", { amount: currency(response.data.computedDiscount) })
      );
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || t("pos.voucher.invalid"));
    } finally {
      setBusy(false);
    }
  };

  const generate = async (event) => {
    event.preventDefault();

    if (!form.code.trim() || !form.value) {
      toast.error(t("pos.voucher.missingFields"));
      return;
    }

    setBusy(true);
    try {
      await axiosInstance.post("voucher/create", {
        code: form.code.trim().toUpperCase(),
        type: form.type,
        value: Number(form.value),
        minSpend: Number(form.minSpend || 0),
        expiresAt: form.expiresAt || undefined,
        usageLimit: Number(form.usageLimit || 1),
      });
      toast.success(t("pos.voucher.generated", { code: form.code.trim().toUpperCase() }));
      setForm({ code: "", type: "amount", value: "", minSpend: "", expiresAt: "", usageLimit: "1" });
    } catch (error) {
      toast.error(error.response?.data?.message || t("pos.voucher.generateFailed"));
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500";
  const label = "mb-1 block text-xs uppercase text-slate-400";

  return (
    <PosModal
      title={t("pos.voucher.title")}
      subtitle={t("pos.voucher.subtitle")}
      onClose={onClose}
      width="max-w-xl"
    >
      {canGenerate && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTab("apply")}
            className={`px-4 py-2 text-sm font-semibold transition ${
              tab === "apply" ? "bg-cyan-700 text-white" : "bg-slate-800 text-slate-300"
            }`}
          >
            {t("pos.voucher.applyTab")}
          </button>
          <button
            type="button"
            onClick={() => setTab("generate")}
            className={`px-4 py-2 text-sm font-semibold transition ${
              tab === "generate" ? "bg-cyan-700 text-white" : "bg-slate-800 text-slate-300"
            }`}
          >
            {t("pos.voucher.generateTab")}
          </button>
        </div>
      )}

      {tab === "apply" || !canGenerate ? (
        <div className="space-y-4">
          {applied ? (
            <div className="flex items-center justify-between border border-emerald-700 bg-emerald-900/20 px-4 py-3">
              <div>
                <p className="font-mono text-lg font-bold text-emerald-400">{applied.code}</p>
                <p className="text-sm text-slate-400">
                  {t("pos.voucher.worth", { amount: currency(applied.amount) })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onRemove();
                  onClose();
                }}
                className="bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700"
              >
                {t("pos.voucher.remove")}
              </button>
            </div>
          ) : (
            <form onSubmit={applyCode} className="space-y-3">
              <div>
                <label className={label}>{t("pos.voucher.code")}</label>
                <input
                  autoFocus
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder={t("pos.voucher.codePlaceholder")}
                  className={`${field} font-mono uppercase`}
                />
              </div>
              <p className="text-xs text-slate-500">
                {t("pos.voucher.againstSubtotal", { amount: currency(subtotal) })}
              </p>
              <button
                type="submit"
                disabled={busy}
                className="w-full bg-cyan-700 py-2.5 font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-50"
              >
                {busy ? t("pos.processing") : t("pos.voucher.apply")}
              </button>
            </form>
          )}
        </div>
      ) : (
        <form onSubmit={generate} className="space-y-3">
          <div>
            <label className={label}>{t("pos.voucher.code")}</label>
            <input
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
              placeholder="SAVE10"
              className={`${field} font-mono uppercase`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>{t("pos.voucher.type")}</label>
              <select
                value={form.type}
                onChange={(event) => setForm({ ...form, type: event.target.value })}
                className={field}
              >
                <option value="amount">{t("pos.voucher.typeAmount")}</option>
                <option value="percent">{t("pos.voucher.typePercent")}</option>
              </select>
            </div>
            <div>
              <label className={label}>
                {form.type === "percent" ? t("pos.voucher.percentValue") : t("pos.voucher.amountValue")}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.value}
                onChange={(event) => setForm({ ...form, value: event.target.value })}
                className={field}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>{t("pos.voucher.minSpend")}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.minSpend}
                onChange={(event) => setForm({ ...form, minSpend: event.target.value })}
                className={field}
              />
            </div>
            <div>
              <label className={label}>{t("pos.voucher.usageLimit")}</label>
              <input
                type="number"
                min="1"
                value={form.usageLimit}
                onChange={(event) => setForm({ ...form, usageLimit: event.target.value })}
                className={field}
              />
            </div>
            <div>
              <label className={label}>{t("pos.voucher.expires")}</label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
                className={field}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-emerald-700 py-2.5 font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
          >
            {busy ? t("pos.processing") : t("pos.voucher.generate")}
          </button>
        </form>
      )}
    </PosModal>
  );
}

export default VoucherModal;
