import React, { useEffect, useState } from "react";
import TopNavbar from "../Components/TopNavbar";
import axiosInstance from "../lib/axios";
import toast from "react-hot-toast";
import { FiDownload, FiFileText } from "react-icons/fi";

const DESCRIPTIONS = {
  sales: "All sales transactions with totals, payment method and status.",
  "low-stock": "Products at or below the low-stock threshold — what to reorder.",
  inventory: "Full product list with stock valuation and expiry dates.",
  orders: "Purchase orders with quantities, totals and status.",
  suppliers: "Supplier directory with contact details.",
  "stock-transactions": "Stock-in / stock-out movement history.",
  users: "System users and their assigned roles.",
  activity: "Full audit trail of user actions with timestamps.",
};

function Reportspage() {
  const [reports, setReports] = useState([]);
  const [loadingKey, setLoadingKey] = useState(null);

  useEffect(() => {
    axiosInstance
      .get("reports")
      .then((res) => setReports(res.data.reports || []))
      .catch(() => toast.error("Failed to load reports"));
  }, []);

  const download = async (key, label) => {
    setLoadingKey(key);
    try {
      const res = await axiosInstance.get(`reports/${key}`, { responseType: "blob" });
      const cd = res.headers["content-disposition"] || "";
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `${key}-report.csv`;

      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`${label} report downloaded`);
    } catch (err) {
      toast.error("Failed to generate report");
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <div className="min-h-screen bg-base-200">
      <TopNavbar />
      <div className="px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold text-base-content">Reports</h1>
        <p className="mt-1 text-base-content/60">
          Download professionally formatted CSV reports available to your role.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((r) => (
            <div
              key={r.key}
              className="flex flex-col rounded-xl border border-base-300 bg-base-100 p-6 shadow-sm"
            >
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FiFileText className="text-xl" />
              </div>
              <h2 className="font-semibold text-base-content">{r.label} Report</h2>
              <p className="mt-1 flex-1 text-sm text-base-content/60">
                {DESCRIPTIONS[r.key] || ""}
              </p>
              <button
                onClick={() => download(r.key, r.label)}
                disabled={loadingKey === r.key}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-content transition hover:opacity-90 disabled:opacity-60"
              >
                <FiDownload />
                {loadingKey === r.key ? "Generating…" : "Download CSV"}
              </button>
            </div>
          ))}

          {reports.length === 0 && (
            <p className="text-base-content/50">No reports available for your role.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default Reportspage;
