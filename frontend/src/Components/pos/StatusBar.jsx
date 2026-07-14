import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiPrinter, FiWifi, FiWifiOff } from "react-icons/fi";

const Field = ({ label, value }) => (
  <span className="flex items-center gap-1.5">
    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">
      {label}
    </span>
    <span className="text-[11px] font-semibold text-slate-300">{value}</span>
  </span>
);

function StatusBar({ user, till, onPrint }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(new Date());
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 30000);
    const up = () => setOnline(true);
    const down = () => setOnline(false);

    window.addEventListener("online", up);
    window.addEventListener("offline", down);

    return () => {
      clearInterval(clock);
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return (
    <footer className="flex items-center justify-between gap-4 border-t border-slate-800 bg-slate-950 px-4 py-1.5">
      <div className="flex min-w-0 items-center gap-x-4 gap-y-1 overflow-hidden">
        <Field label={t("pos.status.user")} value={user?.name || t("pos.demoCashier")} />
        <span className="hidden text-slate-800 sm:block">/</span>
        <span className="hidden sm:block">
          <Field label={t("pos.status.till")} value={till} />
        </span>
        <span className="hidden text-slate-800 lg:block">/</span>
        <span className="hidden text-[10px] font-semibold uppercase tracking-widest text-slate-600 lg:block">
          {t("pos.status.counter")}
        </span>
        <span className="hidden text-slate-800 lg:block">/</span>
        <span className="hidden text-[10px] font-semibold uppercase tracking-widest text-slate-600 lg:block">
          {t("pos.status.stdPrices")}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden font-mono text-[11px] tabular-nums text-slate-400 sm:block">
          {now.toLocaleDateString()}{" "}
          {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        <button
          type="button"
          onClick={onPrint}
          className="p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
          aria-label={t("pos.print")}
        >
          <FiPrinter className="h-3.5 w-3.5" />
        </button>
        {online ? (
          <span className="flex items-center gap-1 text-emerald-500" title={t("pos.status.online")}>
            <FiWifi className="h-3.5 w-3.5" />
          </span>
        ) : (
          <span className="flex items-center gap-1 text-red-500" title={t("pos.status.offline")}>
            <FiWifiOff className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </footer>
  );
}

export default StatusBar;
