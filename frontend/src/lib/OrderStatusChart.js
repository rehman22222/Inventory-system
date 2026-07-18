import { Bar } from "react-chartjs-2";
import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

// Orders no longer carry a "status" — they're purchase orders placed with a
// supplier. So instead of a meaningless single "pending" bar, show something
// the shop actually cares about: how much has been ordered from each supplier.
function OrderStatusChart({ className }) {
  const { t } = useTranslation();
  const { getorder } = useSelector((state) => state.order);

  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute("data-theme") === "dark"
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  // Group orders by supplier: total spend + how many orders. Sorted by spend so
  // the biggest suppliers read left-to-right.
  const bySupplier = useMemo(() => {
    const orders = Array.isArray(getorder) ? getorder : [];
    const map = new Map();
    for (const order of orders) {
      const name = order?.supplierName || t("orders.noSupplier", "No supplier");
      const entry = map.get(name) || { name, spend: 0, count: 0 };
      entry.spend += Number(order?.totalAmount || 0);
      entry.count += 1;
      map.set(name, entry);
    }
    return [...map.values()].sort((a, b) => b.spend - a.spend);
  }, [getorder, t]);

  const textColor = isDark ? "#e5e7eb" : "#334155";
  const gridColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)";

  const palette = [
    "rgba(8, 145, 178, 0.82)",
    "rgba(16, 185, 129, 0.82)",
    "rgba(99, 102, 241, 0.82)",
    "rgba(245, 158, 11, 0.82)",
    "rgba(14, 165, 233, 0.82)",
    "rgba(236, 72, 153, 0.82)",
    "rgba(100, 116, 139, 0.82)",
  ];

  const data = {
    labels: bySupplier.map((s) => s.name),
    datasets: [
      {
        label: t("orders.totalSpend", "Total spend"),
        data: bySupplier.map((s) => Math.round(s.spend * 100) / 100),
        counts: bySupplier.map((s) => s.count),
        backgroundColor: bySupplier.map((_, i) => palette[i % palette.length]),
        borderWidth: 0,
        borderRadius: 8,
        maxBarThickness: 84,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: t("orders.spendBySupplier", "Spend by supplier"),
        font: { size: 20, weight: "bold" },
        color: textColor,
        padding: { bottom: 16 },
      },
      tooltip: {
        backgroundColor: "rgba(15,23,42,0.92)",
        titleFont: { size: 14, weight: "bold" },
        bodyFont: { size: 13 },
        padding: 10,
        callbacks: {
          label: (ctx) => {
            const count = ctx.dataset.counts?.[ctx.dataIndex] ?? 0;
            const orders = t("orders.ordersCount", { count, defaultValue: "{{count}} order(s)" });
            return `${currency.format(ctx.parsed.y)}  ·  ${orders}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { color: textColor, font: { size: 13 } },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: textColor,
          callback: (value) => currency.format(value),
        },
        grid: { color: gridColor },
      },
    },
  };

  const isEmpty = bySupplier.length === 0;

  return (
    <div className={`mx-auto w-full max-w-4xl rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm ${className || ""}`}>
      {isEmpty ? (
        <div className="flex h-64 items-center justify-center text-sm text-base-content/50">
          {t("orders.noOrder")}
        </div>
      ) : (
        <div style={{ height: "320px" }}>
          <Bar data={data} options={options} />
        </div>
      )}
    </div>
  );
}

export default OrderStatusChart;
