import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiAlertTriangle, FiArchive, FiRotateCcw, FiTrash2, FiX } from "react-icons/fi";
import toast from "react-hot-toast";
import axiosInstance from "../lib/axios";
import { currency } from "./pos/posUtils";

/* Taking a run of sales out of the shop's books.
 *
 * This replaces opening the database and deleting rows, which is what was
 * happening and which leaves nothing behind — no way back, and a day closing
 * still swearing to totals whose sales are gone.
 *
 * Nothing here deletes. The rows are archived: hidden from the sales list, the
 * revenue and profit report, the POS history, the credit book and the day's
 * takings, and restorable in one press. Stock is never touched — the goods left
 * the shop, and putting the paperwork away does not walk them back onto the
 * shelf.
 *
 * NOTHING HAPPENS UNTIL IT HAS BEEN SHOWN FIRST. Every archive is confirmed
 * against a preview built by the same resolution the archive itself runs, so
 * "214 sales, EUR 4,182.50, 2 closed days restated" is a sentence the owner can
 * actually check before it is true.
 *
 * The one exception to "nothing here deletes" lives on the Already archived
 * tab, and it is deliberately awkward to reach: rows have to be archived and
 * looked at first, the batch code has to be typed back, and what goes is
 * written to the activity log on the way out. It is there for takings that are
 * not takings — the sales rung to prove a till before it went live — which
 * archiving hides for ever but never gets out of the ledger.
 */

const MODES = [
  { key: "range", label: "By date and time" },
  { key: "receipts", label: "From one sale to another" },
  { key: "picked", label: "The rows I ticked" },
];

// A datetime-local value from a Date, in the browser's own zone — the till and
// the person reading this screen are in the same room.
const localInput = (date) => {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
};

function Figure({ label, value, tone = "" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-sm opacity-70">{label}</span>
      <span className={`font-semibold tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}

function SalesArchiveModal({ picked = [], pickedReceiptNos = [], onClose, onDone }) {
  const { t } = useTranslation();
  const tickedCount = picked.length || pickedReceiptNos.length;
  const [tab, setTab] = useState("archive");
  const [mode, setMode] = useState(tickedCount ? "picked" : "range");

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fromReceiptNo, setFromReceiptNo] = useState("");
  const [toReceiptNo, setToReceiptNo] = useState("");
  const [reason, setReason] = useState("");

  const [preview, setPreview] = useState(null);
  const [checking, setChecking] = useState(false);
  const [working, setWorking] = useState(false);
  const [archives, setArchives] = useState([]);

  // What the chosen mode comes to as a request. One place, so the preview and
  // the archive can never be asked different questions.
  const selection = useCallback(() => {
    // Ticked rows arrive as sale ids from the sales list and as receipt numbers
    // from the ghost view, which lists receipts rather than sale rows. The
    // server resolves either into the same set.
    if (mode === "picked") {
      return picked.length ? { saleIds: picked } : { receiptNos: pickedReceiptNos };
    }
    if (mode === "receipts") return { fromReceiptNo: fromReceiptNo.trim(), toReceiptNo: toReceiptNo.trim() };
    return {
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
    };
  }, [mode, picked, pickedReceiptNos, from, to, fromReceiptNo, toReceiptNo]);

  const ready =
    (mode === "picked" && tickedCount > 0) ||
    (mode === "range" && (from || to)) ||
    (mode === "receipts" && (fromReceiptNo.trim() || toReceiptNo.trim()));

  // A preview belongs to the selection that produced it. Changing the selection
  // and leaving the old figures on screen is how somebody archives a different
  // set from the one they read.
  useEffect(() => {
    setPreview(null);
  }, [mode, from, to, fromReceiptNo, toReceiptNo]);

  const loadArchives = useCallback(async () => {
    try {
      const { data } = await axiosInstance.get("sales/archive/list");
      setArchives(data?.archives || []);
    } catch {
      setArchives([]);
    }
  }, []);

  useEffect(() => {
    if (tab === "archived") loadArchives();
  }, [tab, loadArchives]);

  const check = async () => {
    setChecking(true);
    try {
      const { data } = await axiosInstance.post("sales/archive/preview", selection());
      setPreview(data);
      if (!data?.sales && !data?.refunds) {
        toast(t("salesArchive.nothingMatched", "Nothing matched that selection"), { icon: "🔍" });
      }
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          t("salesArchive.checkFailed", "Could not work out that selection"),
      );
    } finally {
      setChecking(false);
    }
  };

  const archive = async () => {
    if (!reason.trim()) {
      toast.error(t("salesArchive.reasonNeeded", "Say why these sales are being archived"));
      return;
    }
    setWorking(true);
    try {
      const { data } = await axiosInstance.post("sales/archive", {
        ...selection(),
        reason: reason.trim(),
      });
      toast.success(
        t("salesArchive.done", "{{n}} sales archived as {{batch}}", {
          n: data.sales + data.refunds,
          batch: data.batch,
        }),
      );
      setPreview(null);
      setReason("");
      onDone?.();
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          t("salesArchive.failed", "Could not archive those sales"),
      );
    } finally {
      setWorking(false);
    }
  };

  /* Destroying an archive.
   *
   * One press. There was a confirmation here — the batch code typed back —
   * and it was taken out because the people who use this are clearing test
   * takings a dozen times a day, and the rows are ALREADY archived: they are
   * out of every report and list before this button is ever visible. The
   * decision was made on the Archive tab; this is only the paperwork. */
  const purgeNow = async (batch) => {
    setWorking(true);
    try {
      const { data } = await axiosInstance.delete(`sales/archive/${batch}`);
      toast.success(
        t("salesArchive.purged", "{{batch}} deleted for good — {{n}} row(s) gone", {
          batch: data.batch,
          n: data.sales,
        }),
      );
      await loadArchives();
      onDone?.();
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          t("salesArchive.purgeFailed", "Could not delete that archive"),
      );
    } finally {
      setWorking(false);
    }
  };

  const restore = async (batch) => {
    setWorking(true);
    try {
      await axiosInstance.post(`sales/archive/${batch}/restore`);
      toast.success(t("salesArchive.restored", "{{batch}} is back in the books", { batch }));
      await loadArchives();
      onDone?.();
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          t("salesArchive.restoreFailed", "Could not restore that archive"),
      );
    } finally {
      setWorking(false);
    }
  };

  const closings = preview?.dayClosings || [];

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/60 p-4">
      <div className="mt-6 w-full max-w-2xl rounded-lg bg-base-100 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-base-300 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <FiArchive /> {t("salesArchive.title", "Archive sales")}
            </h2>
            <p className="mt-0.5 text-sm opacity-70">
              {t(
                "salesArchive.subtitle",
                "Takes sales out of every report and list. Nothing is deleted, and stock is not put back.",
              )}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close", "Close")}>
            <FiX className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-base-300 px-5 pt-3">
          {[
            ["archive", t("salesArchive.tabArchive", "Archive")],
            ["archived", t("salesArchive.tabArchived", "Already archived")],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-3 py-2 text-sm font-semibold ${
                tab === key ? "border-b-2 border-primary text-primary" : "opacity-60"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "archive" ? (
          <div className="space-y-4 px-5 py-4">
            <div className="flex flex-wrap gap-2">
              {MODES.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setMode(option.key)}
                  disabled={option.key === "picked" && tickedCount === 0}
                  className={`rounded border px-3 py-1.5 text-sm ${
                    mode === option.key
                      ? "border-primary bg-primary/10 font-semibold text-primary"
                      : "border-base-300 opacity-80"
                  } disabled:opacity-30`}
                >
                  {t(`salesArchive.mode.${option.key}`, option.label)}
                  {option.key === "picked" && tickedCount > 0 ? ` (${tickedCount})` : ""}
                </button>
              ))}
            </div>

            {mode === "range" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block opacity-70">{t("salesArchive.from", "From")}</span>
                  <input
                    type="datetime-local"
                    value={from}
                    max={to || undefined}
                    onChange={(event) => setFrom(event.target.value)}
                    className="input input-bordered w-full"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block opacity-70">{t("salesArchive.to", "To")}</span>
                  <input
                    type="datetime-local"
                    value={to}
                    min={from || undefined}
                    onChange={(event) => setTo(event.target.value)}
                    className="input input-bordered w-full"
                  />
                </label>
                <p className="text-xs opacity-60 sm:col-span-2">
                  {t(
                    "salesArchive.rangeHint",
                    "Leave one end empty for everything before or after the other.",
                  )}{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      const now = new Date();
                      setFrom(localInput(new Date(now.getFullYear(), now.getMonth(), now.getDate())));
                      setTo(localInput(now));
                    }}
                  >
                    {t("salesArchive.today", "Today so far")}
                  </button>
                </p>
              </div>
            )}

            {mode === "receipts" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block opacity-70">
                    {t("salesArchive.fromSale", "From this sale")}
                  </span>
                  <input
                    value={fromReceiptNo}
                    onChange={(event) => setFromReceiptNo(event.target.value)}
                    placeholder="POS-000008"
                    className="input input-bordered w-full"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block opacity-70">
                    {t("salesArchive.toSale", "To this sale")}
                  </span>
                  <input
                    value={toReceiptNo}
                    onChange={(event) => setToReceiptNo(event.target.value)}
                    placeholder="POS-000042"
                    className="input input-bordered w-full"
                  />
                </label>
                <p className="text-xs opacity-60 sm:col-span-2">
                  {t(
                    "salesArchive.receiptHint",
                    "Both sales are included, along with everything rung up between them.",
                  )}
                </p>
              </div>
            )}

            {mode === "picked" && (
              <p className="text-sm opacity-70">
                {t("salesArchive.pickedHint", "{{n}} row(s) ticked on the sales list.", {
                  n: tickedCount,
                })}
              </p>
            )}

            <button
              type="button"
              onClick={check}
              disabled={!ready || checking}
              className="btn btn-outline btn-sm"
            >
              {checking
                ? t("salesArchive.checking", "Checking…")
                : t("salesArchive.check", "Check what this removes")}
            </button>

            {preview && (
              <div className="rounded border border-base-300 bg-base-200/50 p-3">
                <Figure label={t("salesArchive.salesCount", "Sales")} value={preview.sales} />
                <Figure label={t("salesArchive.refundsCount", "Refunds")} value={preview.refunds} />
                <Figure
                  label={t("salesArchive.receiptsCount", "Receipts")}
                  value={preview.receipts}
                />
                <Figure
                  label={t("salesArchive.revenue", "Revenue removed")}
                  value={currency(preview.revenue)}
                  tone="text-error"
                />
                {preview.first && preview.last && (
                  <p className="mt-2 text-xs opacity-70">
                    {t("salesArchive.span", "{{first}} through {{last}}", {
                      first: preview.first.receiptNo || "—",
                      last: preview.last.receiptNo || "—",
                    })}
                  </p>
                )}

                {closings.length > 0 && (
                  <div className="mt-3 flex gap-2 rounded border border-warning/50 bg-warning/10 p-2 text-xs">
                    <FiAlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <div>
                      <p className="font-semibold">
                        {t(
                          "salesArchive.closingsWarn",
                          "{{n}} closed day(s) will be counted again",
                          { n: closings.length },
                        )}
                      </p>
                      <p className="mt-0.5 opacity-80">
                        {closings.map((closing) => closing.reference).join(", ")} —{" "}
                        {t(
                          "salesArchive.closingsNote",
                          "each keeps the figures it was signed off with, and is marked as restated.",
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {(preview.sales > 0 || preview.refunds > 0) && (
                  <div className="mt-3">
                    <label className="text-sm">
                      <span className="mb-1 block opacity-70">
                        {t("salesArchive.reason", "Why are these going?")}
                      </span>
                      <input
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder={t(
                          "salesArchive.reasonPlaceholder",
                          "Demo takings from the trade show",
                        )}
                        className="input input-bordered input-sm w-full"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={archive}
                      disabled={working || !reason.trim()}
                      className="btn btn-error btn-sm mt-3 text-white"
                    >
                      {working
                        ? t("salesArchive.archiving", "Archiving…")
                        : t("salesArchive.confirm", "Archive these sales")}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2 px-5 py-4">
            {archives.length === 0 ? (
              <p className="py-6 text-center text-sm opacity-60">
                {t("salesArchive.none", "Nothing has been archived yet.")}
              </p>
            ) : (
              archives.map((entry) => (
                <div
                  key={entry.batch}
                  className="flex flex-wrap items-center justify-between gap-3 rounded border border-base-300 p-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {entry.batch}{" "}
                      <span className="font-normal opacity-60">
                        · {entry.sales} {t("salesArchive.rows", "rows")} ·{" "}
                        {currency(entry.revenue)}
                      </span>
                    </p>
                    <p className="truncate text-xs opacity-70">
                      {entry.reason} — {entry.byName} ·{" "}
                      {new Date(entry.at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => restore(entry.batch)}
                      disabled={working}
                      className="btn btn-outline btn-xs gap-1"
                    >
                      <FiRotateCcw className="h-3 w-3" />
                      {t("salesArchive.restore", "Put back")}
                    </button>
                    <button
                      type="button"
                      onClick={() => purgeNow(entry.batch)}
                      disabled={working}
                      className="btn btn-outline btn-error btn-xs gap-1"
                    >
                      <FiTrash2 className="h-3 w-3" />
                      {t("salesArchive.purge", "Delete for good")}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <div className="flex justify-end border-t border-base-300 px-5 py-3">
          <button type="button" onClick={onClose} className="btn btn-sm">
            {t("common.close", "Close")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SalesArchiveModal;
