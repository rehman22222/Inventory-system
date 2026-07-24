import React, { useEffect, useRef, useState } from "react";
import { FiChevronDown, FiDownload } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import axiosInstance from "../lib/axios";

// Excel is the presentation-ready default. CSV remains available for imports
// and analysis, but it cannot retain colours, widths, formulas or print layout.
const FORMATS = [
  { key: "xlsx", label: "Excel (.xlsx)", hint: "reports.excelHint" },
  { key: "pdf", label: "PDF", hint: "reports.pdfHint" },
  { key: "csv", label: "CSV (raw data)", hint: "reports.csvHint" },
];
const PRIMARY_FORMAT = "xlsx";

/**
 * Downloads a role-permitted report.
 *
 * @param {string} reportKey  e.g. "sales" | "inventory" | "day-closing"
 * @param {object} params     optional query params (e.g. { from, to, id })
 * @param {string} format     pin to one format and download on click, with no
 *                            menu. Use inside a scrolling container, where an
 *                            absolutely-positioned menu would be clipped.
 */
function ReportButton({ reportKey, label, params, format, className = "" }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  // Click-away, so the menu doesn't get stuck open over the page.
  useEffect(() => {
    if (!open) return;
    const onDown = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const download = async (format) => {
    setOpen(false);
    setLoading(true);
    try {
      const res = await axiosInstance.get(`reports/${reportKey}`, {
        params: { ...params, format },
        responseType: "blob",
      });

      const cd = res.headers["content-disposition"] || "";
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `${reportKey}-report.${format}`;

      const type = res.headers["content-type"] || "application/octet-stream";
      const url = URL.createObjectURL(new Blob([res.data], { type }));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t("reports.downloaded", { format: format.toUpperCase() }));
    } catch (err) {
      // The error body is a Blob because we asked for one — read it back so the
      // real reason (e.g. "no access to this report") reaches the user.
      let message = t("reports.failed");
      try {
        const text = await err.response?.data?.text?.();
        if (text) message = JSON.parse(text).message || message;
      } catch {
        /* keep the generic message */
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  // Pinned to one format: a plain button, no menu to be clipped.
  if (format) {
    return (
      <button
        type="button"
        onClick={() => download(format)}
        disabled={loading}
        title={t("reports.downloadAs", { format: format.toUpperCase() })}
        className={`inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60 ${className}`}
      >
        <FiDownload className="h-3.5 w-3.5" />
        {loading ? t("reports.generating") : label || t("reports.download")}
      </button>
    );
  }

  return (
    <div ref={boxRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => download(PRIMARY_FORMAT)}
        disabled={loading}
        title={t("reports.downloadAs", { format: "EXCEL" })}
        className="inline-flex h-full flex-1 items-center justify-center gap-2 rounded-l-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
      >
        <FiDownload />
        {loading ? t("reports.generating") : label || t("reports.download")}
      </button>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={loading}
        aria-label="Choose report format"
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-full items-center justify-center rounded-r-lg border-l border-emerald-500 bg-emerald-600 px-2.5 text-white transition hover:bg-emerald-700 disabled:opacity-60"
      >
        <FiChevronDown className={`transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-xl"
        >
          {FORMATS.map((format) => (
            <button
              key={format.key}
              type="button"
              role="menuitem"
              onClick={() => download(format.key)}
              className="flex w-full flex-col items-start px-3 py-2 text-start hover:bg-base-200"
            >
              <span className="text-sm font-semibold">{format.label}</span>
              <span className="text-xs text-base-content/60">{t(format.hint)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ReportButton;
