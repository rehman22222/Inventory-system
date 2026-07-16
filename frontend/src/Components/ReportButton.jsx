import React, { useEffect, useRef, useState } from "react";
import { FiChevronDown, FiDownload } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import axiosInstance from "../lib/axios";

// The formats the shop actually asks for. The server also still serves xlsx,
// which is the default when no format is given.
const FORMATS = [
  { key: "pdf", label: "PDF", hint: "reports.pdfHint" },
  { key: "csv", label: "CSV", hint: "reports.csvHint" },
  { key: "xlsx", label: "Excel", hint: "reports.excelHint" },
];

/**
 * Downloads a role-permitted report, letting the user pick the format.
 * @param {string} reportKey  e.g. "sales" | "inventory" | "activity"
 * @param {object} params     optional query params (e.g. { from, to })
 */
function ReportButton({ reportKey, label, params, className = "" }) {
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

  return (
    <div ref={boxRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={loading}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-full w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
      >
        <FiDownload />
        {loading ? t("reports.generating") : label || t("reports.download")}
        <FiChevronDown className={`transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 z-30 mt-1 w-52 overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-xl"
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
