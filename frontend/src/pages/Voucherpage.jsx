import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { FiSlash, FiTrash2 } from "react-icons/fi";
import { currencySymbol } from "../Components/pos/posUtils";
import {
  CreateVoucher,
  DisableVoucher,
  RemoveVoucher,
  gettingallVouchers,
} from "../features/voucherSlice";

const STATUS_TONE = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  used: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  expired: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  disabled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const EMPTY = {
  code: "",
  type: "amount",
  value: "",
  minSpend: "",
  usageLimit: "1",
  expiresAt: "",
};

function Voucherpage() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { vouchers, isloading, iscreating } = useSelector((state) => state.voucher);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    dispatch(gettingallVouchers());
  }, [dispatch]);

  const submit = async (event) => {
    event.preventDefault();

    const result = await dispatch(
      CreateVoucher({
        code: form.code.trim().toUpperCase(),
        type: form.type,
        value: Number(form.value),
        minSpend: Number(form.minSpend || 0),
        usageLimit: Number(form.usageLimit || 1),
        expiresAt: form.expiresAt || undefined,
      })
    );

    if (!result.error) setForm(EMPTY);
  };

  const field =
    "w-full rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-sm outline-none focus:border-cyan-500";
  const label = "mb-1 block text-xs font-semibold uppercase text-base-content/60";

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="font-display text-2xl font-bold">{t("vouchers.title")}</h1>
        <p className="mt-1 text-sm text-base-content/60">{t("vouchers.sub")}</p>
      </header>

      <form
        onSubmit={submit}
        className="grid gap-4 rounded-2xl border border-base-300 bg-base-100 p-5 sm:grid-cols-2 lg:grid-cols-6"
      >
        <div className="lg:col-span-2">
          <label className={label}>{t("vouchers.code")}</label>
          <input
            value={form.code}
            onChange={(event) => setForm({ ...form, code: event.target.value })}
            placeholder="SAVE10"
            className={`${field} font-mono uppercase`}
          />
        </div>

        <div>
          <label className={label}>{t("vouchers.type")}</label>
          <select
            value={form.type}
            onChange={(event) => setForm({ ...form, type: event.target.value })}
            className={field}
          >
            <option value="amount">{t("vouchers.typeAmount")}</option>
            <option value="percent">{t("vouchers.typePercent")}</option>
          </select>
        </div>

        <div>
          <label className={label}>
            {form.type === "percent" ? t("vouchers.percentValue") : t("vouchers.amountValue")}
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.value}
            onChange={(event) => setForm({ ...form, value: event.target.value })}
            className={field}
          />
        </div>

        <div>
          <label className={label}>{t("vouchers.minSpend")}</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.minSpend}
            onChange={(event) => setForm({ ...form, minSpend: event.target.value })}
            className={field}
          />
        </div>

        <div>
          <label className={label}>{t("vouchers.usageLimit")}</label>
          <input
            type="number"
            min="1"
            value={form.usageLimit}
            onChange={(event) => setForm({ ...form, usageLimit: event.target.value })}
            className={field}
          />
        </div>

        <div className="lg:col-span-2">
          <label className={label}>{t("vouchers.expires")}</label>
          <input
            type="date"
            value={form.expiresAt}
            onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
            className={field}
          />
        </div>

        <div className="flex items-end lg:col-span-2">
          <button
            type="submit"
            disabled={iscreating}
            className="w-full rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-50"
          >
            {iscreating ? t("vouchers.creating") : t("vouchers.create")}
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-base-300 bg-base-100">
        <table className="w-full text-sm">
          <thead className="bg-base-200 text-xs uppercase text-base-content/60">
            <tr>
              <th className="px-4 py-3 text-start">{t("vouchers.code")}</th>
              <th className="px-4 py-3 text-start">{t("vouchers.value")}</th>
              <th className="px-4 py-3 text-start">{t("vouchers.minSpend")}</th>
              <th className="px-4 py-3 text-start">{t("vouchers.used")}</th>
              <th className="px-4 py-3 text-start">{t("vouchers.expires")}</th>
              <th className="px-4 py-3 text-start">{t("vouchers.status")}</th>
              <th className="px-4 py-3 text-end">{t("vouchers.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {isloading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-base-content/50">
                  {t("vouchers.loading")}
                </td>
              </tr>
            ) : vouchers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-base-content/50">
                  {t("vouchers.empty")}
                </td>
              </tr>
            ) : (
              vouchers.map((voucher) => (
                <tr key={voucher._id} className="border-t border-base-300">
                  <td className="px-4 py-3 font-mono font-semibold">{voucher.code}</td>
                  <td className="px-4 py-3">
                    {voucher.type === "percent" ? `${voucher.value}%` : `${currencySymbol()}${voucher.value}`}
                  </td>
                  <td className="px-4 py-3">
                    {currencySymbol()}
                    {voucher.minSpend || 0}
                  </td>
                  <td className="px-4 py-3">
                    {voucher.usedCount} / {voucher.usageLimit}
                  </td>
                  <td className="px-4 py-3">
                    {voucher.expiresAt
                      ? new Date(voucher.expiresAt).toLocaleDateString()
                      : t("vouchers.never")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        STATUS_TONE[voucher.status] || STATUS_TONE.used
                      }`}
                    >
                      {t(`vouchers.statuses.${voucher.status}`, voucher.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {voucher.status === "active" && (
                        <button
                          type="button"
                          onClick={() => dispatch(DisableVoucher(voucher._id))}
                          className="rounded-lg p-2 text-amber-600 transition hover:bg-amber-50 dark:hover:bg-amber-900/20"
                          aria-label={t("vouchers.disable")}
                        >
                          <FiSlash className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => dispatch(RemoveVoucher(voucher._id))}
                        className="rounded-lg p-2 text-red-600 transition hover:bg-red-50 dark:hover:bg-red-900/20"
                        aria-label={t("vouchers.delete")}
                      >
                        <FiTrash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Voucherpage;
