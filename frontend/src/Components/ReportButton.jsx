import React, { useState } from "react";
import { FiDownload } from "react-icons/fi";
import toast from "react-hot-toast";
import axiosInstance from "../lib/axios";

/**
 * Downloads a role-permitted CSV report from the backend.
 * @param {string} reportKey  e.g. "sales" | "inventory" | "activity"
 * @param {object} params     optional query params (e.g. { from, to })
 */
function ReportButton({ reportKey, label = "Download Report", params, className = "" }) {
  const [loading, setLoading] = useState(false);

  const download = async () => {
    setLoading(true);
    try {
      const res = await axiosInstance.get(`reports/${reportKey}`, {
        params,
        responseType: "blob",
      });
      const cd = res.headers["content-disposition"] || "";
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `${reportKey}-report.xlsx`;

      const type =
        res.headers["content-type"] ||
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const url = URL.createObjectURL(new Blob([res.data], { type }));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Report downloaded");
    } catch (err) {
      toast.error("Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={download}
      disabled={loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60 ${className}`}
    >
      <FiDownload />
      {loading ? "Generating…" : label}
    </button>
  );
}

export default ReportButton;
