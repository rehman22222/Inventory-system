import React from "react";
import { useTranslation } from "react-i18next";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "00", "X"];

// On-screen till keypad. Every control is a <button onClick> on purpose: the
// global barcode scanner hook listens for body-level keydown/Enter, so a
// keyboard-driven keypad would have its digits eaten by the scan buffer.
function NumericKeypad({ buffer, multiplier, onKey, onClear }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <div className="flex h-10 flex-1 items-center justify-between border border-slate-800 bg-black px-3">
          {multiplier ? (
            <span className="bg-cyan-900/60 px-1.5 py-0.5 text-[10px] font-bold uppercase text-cyan-300">
              {t("pos.keypad.qtyPending", { count: multiplier })}
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-widest text-slate-600">
              {t("pos.keypad.clear")}
            </span>
          )}
          <span className="font-mono text-lg tabular-nums text-cyan-300">{buffer}</span>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="h-10 w-14 bg-slate-800 text-xs font-bold uppercase text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-700 active:scale-95"
        >
          {t("pos.keypad.clear")}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onKey(key)}
            className={`h-11 text-lg font-semibold ring-1 transition active:scale-95 ${
              key === "X"
                ? "bg-gradient-to-b from-cyan-700 to-cyan-800 text-white ring-cyan-600 hover:from-cyan-600 hover:to-cyan-700"
                : "bg-gradient-to-b from-slate-800 to-slate-900 text-slate-100 ring-slate-700 hover:from-slate-700 hover:to-slate-800"
            }`}
          >
            {key}
          </button>
        ))}
      </div>

      <p className="text-center text-[10px] text-slate-600">{t("pos.keypad.hint")}</p>
    </div>
  );
}

export default NumericKeypad;
