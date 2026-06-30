import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { getTopProductsByQuantity } from "../features/productSlice";
import { Bar } from "react-chartjs-2";
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

function Gettopproduct() {
  const dispatch = useDispatch();
  const { gettopproduct } = useSelector((state) => state.product);

  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute("data-theme") === "dark"
  );

  useEffect(() => {
    dispatch(getTopProductsByQuantity());
  }, [dispatch]);

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

  const chartData = {
    labels: gettopproduct?.map((product) => product.name) || [],
    datasets: [
      {
        label: "Quantity",
        data: gettopproduct?.map((product) => product.quantity) || [],
        backgroundColor: [
          "rgba(8, 145, 178, 0.78)",
          "rgba(16, 185, 129, 0.78)",
          "rgba(99, 102, 241, 0.78)",
          "rgba(245, 158, 11, 0.78)",
          "rgba(14, 165, 233, 0.78)",
          "rgba(100, 116, 139, 0.78)",
        ],
        borderWidth: 0,
        borderRadius: 6,
        barThickness: 22,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y",
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true },
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: {
          color: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(148, 163, 184, 0.16)",
        },
        ticks: { color: isDark ? "#94a3b8" : "#64748b" },
      },
      y: {
        grid: { display: false },
        ticks: {
          color: isDark ? "#cbd5e1" : "#334155",
          font: { weight: "600" },
        },
      },
    },
  };

  return (
    <div className="rounded-xl border border-base-300 bg-base-100 p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-base-content/50">
            Inventory Mix
          </p>
          <h2 className="mt-2 text-xl font-semibold text-base-content">
            Top products by quantity
          </h2>
        </div>
        <span className="rounded-full bg-cyan-50 px-3 py-1 text-sm font-semibold text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-400">
          Live stock
        </span>
      </div>
      <div className="h-80">
        <Bar data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}

export default Gettopproduct;
