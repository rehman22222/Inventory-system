import React from "react";

// Sales and refunds are one history with two sides, so they are one button on
// the rail with a tab each. The two panes stay separate components — each has
// its own fetch, its own totals and its own printable roll — and this bar is
// what makes them read as one screen.
export function HistoryTabs({ active, onSales, onRefunds, t }) {
  const tab = (key, label, onClick) => (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold transition ${
        active === key ? "bg-cyan-700 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mb-4 grid grid-cols-2 gap-2">
      {tab("sales", t("pos.rail.saleHistory"), onSales)}
      {tab("refunds", t("pos.rail.refundHistory"), onRefunds)}
    </div>
  );
}

