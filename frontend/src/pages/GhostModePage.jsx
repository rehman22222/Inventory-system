import React, { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { FiChevronLeft, FiChevronRight, FiEye } from "react-icons/fi";
import toast from "react-hot-toast";
import axiosInstance from "../lib/axios";
import ReportButton from "../Components/ReportButton";

const money = (value) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const STATUS_TONE = {
  completed: "bg-emerald-100 text-emerald-700",
  voided: "bg-red-100 text-red-700",
  refunded: "bg-red-100 text-red-700",
  "partially-refunded": "bg-amber-100 text-amber-700",
};

const METHOD_TONE = {
  cash: "bg-emerald-50 text-emerald-700",
  creditcard: "bg-blue-50 text-blue-700",
  wallet: "bg-violet-50 text-violet-700",
  split: "bg-amber-50 text-amber-700",
};

// Ghost mode: the owner's unfiltered view of the shop. Every sale, every
// cashier, every day — including batches already handed over at day closing,
// which is exactly what nobody else can see.
function GhostModePage() {
  const { t } = useTranslation();
  const { store } = useSelector((state) => state.store);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ from: "", to: "", cashier: "", status: "" });
  const [taxReport, setTaxReport] = useState({
    from: "",
    to: "",
    jurisdiction: "",
    taxRate: "",
    taxMode: "exclusive",
    targetTotal: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axiosInstance.get("pos/all-sales", {
        params: {
          page,
          limit: 50,
          from: filters.from || undefined,
          to: filters.to || undefined,
          cashier: filters.cashier || undefined,
          status: filters.status || undefined,
        },
      });
      setData(response.data);
    } catch (error) {
      toast.error(error.response?.data?.message || t("ghost.failed"));
    } finally {
      setLoading(false);
    }
  }, [page, filters, t]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (key) => (event) => {
    setPage(1);
    setFilters({ ...filters, [key]: event.target.value });
  };

  const clear = () => {
    setPage(1);
    setFilters({ from: "", to: "", cashier: "", status: "" });
  };

  const setTaxField = (key) => (event) => {
    setTaxReport({ ...taxReport, [key]: event.target.value });
  };

  const taxReportParams = {
    from: taxReport.from || undefined,
    to: taxReport.to || undefined,
    cashier: filters.cashier || undefined,
    status: filters.status || undefined,
    jurisdiction: taxReport.jurisdiction || undefined,
    taxRate: taxReport.taxRate || 0,
    taxMode: taxReport.taxMode,
    targetTotal: taxReport.targetTotal || undefined,
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex items-start gap-3">
        <FiEye className="mt-1 h-6 w-6 text-primary" />
        <div>
          <h1 className="font-display text-2xl font-bold">
            {t("ghost.title")}
            {store?.name && (
              <span className="ms-2 align-middle text-base font-normal text-base-content/50">
                · {store.name}
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-base-content/60">{t("ghost.sub")}</p>
        </div>
      </header>

      {/* Totals across the whole filter, not just this page. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: t("ghost.sales"), value: data?.total ?? 0, plain: true },
          { label: t("ghost.gross"), value: data?.totals?.gross ?? 0 },
          { label: t("ghost.discount"), value: data?.totals?.discount ?? 0 },
          { label: t("ghost.net"), value: data?.totals?.net ?? 0, accent: true },
        ].map((stat) => (
          <div
            key={stat.label}
            className={`rounded-xl p-5 shadow-sm ${
              stat.accent ? "bg-blue-800 text-white" : "bg-slate-950 text-white"
            }`}
          >
            <h2 className="text-sm font-semibold text-white/70">{stat.label}</h2>
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {stat.plain ? stat.value : `$${money(stat.value)}`}
            </p>
          </div>
        ))}
      </div>

      {/* Who took what — the quickest read on the shop. */}
      {data?.byCashier?.length > 0 && (
        <div className="rounded-xl border border-base-300 bg-base-100 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-base-content/60">
            {t("ghost.byCashier")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {data.byCashier.map((entry) => (
              <button
                key={String(entry.cashier)}
                type="button"
                onClick={() => {
                  setPage(1);
                  setFilters({ ...filters, cashier: String(entry.cashier) });
                }}
                className={`rounded-lg border px-3 py-2 text-start transition hover:border-blue-700 ${
                  filters.cashier === String(entry.cashier)
                    ? "border-blue-700 bg-blue-50"
                    : "border-base-300"
                }`}
              >
                <p className="text-sm font-semibold">{entry.name}</p>
                <p className="text-xs text-base-content/60">
                  {entry.count} · ${money(entry.net)}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-base-300 bg-base-100 p-4">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-base-content/60">
            {t("ghost.from")}
          </label>
          <input
            type="date"
            value={filters.from}
            onChange={setFilter("from")}
            className="h-10 rounded-lg border-2 border-base-300 bg-base-100 px-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-base-content/60">
            {t("ghost.to")}
          </label>
          <input
            type="date"
            value={filters.to}
            onChange={setFilter("to")}
            className="h-10 rounded-lg border-2 border-base-300 bg-base-100 px-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-base-content/60">
            {t("ghost.status")}
          </label>
          <select
            value={filters.status}
            onChange={setFilter("status")}
            className="h-10 rounded-lg border-2 border-base-300 bg-base-100 px-2"
          >
            <option value="">{t("ghost.allStatuses")}</option>
            <option value="completed">completed</option>
            <option value="refunded">refunded</option>
            <option value="partially-refunded">partially-refunded</option>
            <option value="voided">voided</option>
          </select>
        </div>
        <button
          type="button"
          onClick={clear}
          className="h-10 rounded-lg border-2 border-base-300 px-4 text-sm font-semibold hover:bg-base-200"
        >
          {t("ghost.clear")}
        </button>
      </div>

      {/* Shadow tax report: report-only recalculation for any country/province.
          The backend distributes the new total across copied receipt rows and
          never writes the result back to Sales, Receipts or stock. */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
        <div className="mb-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-blue-900">
            {t("ghost.tax.title")}
          </h2>
          <p className="mt-1 text-sm text-blue-900/70">{t("ghost.tax.sub")}</p>
        </div>

        <div className="mb-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-blue-900/70">
              {t("ghost.tax.from")}
            </label>
            <input
              type="date"
              value={taxReport.from}
              onChange={setTaxField("from")}
              className="h-10 w-full rounded-lg border-2 border-blue-100 bg-white px-3"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-blue-900/70">
              {t("ghost.tax.to")}
            </label>
            <input
              type="date"
              value={taxReport.to}
              onChange={setTaxField("to")}
              className="h-10 w-full rounded-lg border-2 border-blue-100 bg-white px-3"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase text-blue-900/70">
              {t("ghost.tax.periodHint")}
            </label>
            <div className="flex h-10 items-center rounded-lg border-2 border-blue-100 bg-white px-3 text-sm text-blue-900/70">
              {taxReport.from || taxReport.to
                ? `${taxReport.from || "…"} → ${taxReport.to || "…"}`
                : t("ghost.tax.allTime")}
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase text-blue-900/70">
              {t("ghost.tax.jurisdiction")}
            </label>
            <input
              value={taxReport.jurisdiction}
              onChange={setTaxField("jurisdiction")}
              placeholder={t("ghost.tax.jurisdictionPlaceholder")}
              className="h-10 w-full rounded-lg border-2 border-blue-100 bg-white px-3"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-blue-900/70">
              {t("ghost.tax.rate")}
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.001"
              value={taxReport.taxRate}
              onChange={setTaxField("taxRate")}
              placeholder="23"
              className="h-10 w-full rounded-lg border-2 border-blue-100 bg-white px-3"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-blue-900/70">
              {t("ghost.tax.mode")}
            </label>
            <select
              value={taxReport.taxMode}
              onChange={setTaxField("taxMode")}
              className="h-10 w-full rounded-lg border-2 border-blue-100 bg-white px-3"
            >
              <option value="exclusive">{t("ghost.tax.exclusive")}</option>
              <option value="inclusive">{t("ghost.tax.inclusive")}</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-blue-900/70">
              {t("ghost.tax.target")}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={taxReport.targetTotal}
              onChange={setTaxField("targetTotal")}
              placeholder={t("ghost.tax.targetPlaceholder")}
              className="h-10 w-full rounded-lg border-2 border-blue-100 bg-white px-3"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-xs text-blue-900/70">{t("ghost.tax.safety")}</p>
          <ReportButton
            reportKey="ghost-tax"
            label={t("ghost.tax.download")}
            params={taxReportParams}
            className="h-10 min-w-48"
          />
        </div>
      </div>

      {/* Sales */}
      {loading ? (
        <p className="py-10 text-center text-sm text-base-content/50">{t("ghost.loading")}</p>
      ) : !data?.receipts?.length ? (
        <p className="rounded-lg border border-dashed border-base-300 py-10 text-center text-sm text-base-content/50">
          {t("ghost.empty")}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full rounded-lg border border-base-300 bg-base-100 shadow-md">
              <thead className="bg-base-200">
                <tr>
                  <th className="border px-3 py-2 text-left">{t("ghost.receipt")}</th>
                  <th className="border px-3 py-2 text-left">{t("ghost.when")}</th>
                  <th className="border px-3 py-2 text-left">{t("ghost.cashier")}</th>
                  <th className="border px-3 py-2 text-left">{t("ghost.items")}</th>
                  <th className="border px-3 py-2 text-left">{t("ghost.payment")}</th>
                  <th className="border px-3 py-2 text-left">{t("ghost.status")}</th>
                  <th className="border px-3 py-2 text-right">{t("ghost.total")}</th>
                </tr>
              </thead>
              <tbody>
                {data.receipts.map((receipt) => (
                  <tr key={receipt._id}>
                    <td className="border px-3 py-2 font-mono text-sm font-semibold">
                      {receipt.receiptNo}
                      {receipt.offline?.ref && (
                        <span
                          title={t("ghost.wasOffline")}
                          className="ms-1 rounded bg-amber-100 px-1 text-[9px] font-bold uppercase text-amber-700"
                        >
                          {t("ghost.offline")}
                        </span>
                      )}
                      {receipt.dayClosing && (
                        <span
                          title={t("ghost.handedOver")}
                          className="ms-1 rounded bg-base-200 px-1 text-[9px] font-bold uppercase text-base-content/50"
                        >
                          {t("ghost.closed")}
                        </span>
                      )}
                    </td>
                    <td className="border px-3 py-2 text-sm">
                      {new Date(receipt.createdAt).toLocaleString()}
                    </td>
                    <td className="border px-3 py-2 text-sm">{receipt.cashierName}</td>
                    <td className="border px-3 py-2 text-xs text-base-content/70">
                      {(receipt.items || [])
                        .map((item) => `${item.quantity}× ${item.name}`)
                        .join(", ")}
                    </td>
                    <td className="border px-3 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          METHOD_TONE[receipt.paymentMethod] || "bg-base-200"
                        }`}
                      >
                        {t(`common.payments.${receipt.paymentMethod}`, receipt.paymentMethod)}
                      </span>
                    </td>
                    <td className="border px-3 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          STATUS_TONE[receipt.status] || "bg-base-200"
                        }`}
                      >
                        {receipt.status}
                      </span>
                    </td>
                    <td className="border px-3 py-2 text-right font-semibold tabular-nums">
                      ${money(receipt.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.pages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 rounded-lg border-2 border-base-300 px-3 py-2 text-sm font-semibold disabled:opacity-40"
              >
                <FiChevronLeft /> {t("ghost.prev")}
              </button>
              <span className="text-sm text-base-content/60">
                {t("ghost.pageOf", { page: data.page, pages: data.pages })}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                disabled={page >= data.pages}
                className="flex items-center gap-1 rounded-lg border-2 border-base-300 px-3 py-2 text-sm font-semibold disabled:opacity-40"
              >
                {t("ghost.next")} <FiChevronRight />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default GhostModePage;
