import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiPrinter, FiRefreshCw, FiUploadCloud, FiWifi, FiWifiOff } from "react-icons/fi";
import { onQueueChange, syncQueue } from "../../lib/offlineQueue";
import LanguageSwitcher from "../LanguageSwitcher";

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
  // Sales taken with no line, still waiting to reach the server.
  const [queue, setQueue] = useState({ count: 0, syncing: false });

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

  useEffect(() => onQueueChange(setQueue), []);

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

        {/* Queued sales are money the server hasn't seen yet — never hide it. */}
        {queue.count > 0 && (
          <button
            type="button"
            onClick={() => syncQueue()}
            disabled={queue.syncing || !online}
            title={
              online ? t("pos.offline.syncNow") : t("pos.offline.willSyncWhenBack")
            }
            className="flex items-center gap-1.5 bg-amber-950 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-300 ring-1 ring-amber-800 transition hover:bg-amber-900 disabled:opacity-60"
          >
            {queue.syncing ? (
              <FiRefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <FiUploadCloud className="h-3 w-3" />
            )}
            {t("pos.offline.pending", { count: queue.count })}
          </button>
        )}

        <span className="pos-plain-num hidden font-mono text-[11px] tabular-nums text-slate-400 sm:block">
          {now.toLocaleDateString()}{" "}
          {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        <span className="hidden sm:block">
          <LanguageSwitcher tone="auto" drop="up" />
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
