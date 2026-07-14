import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { FiInbox, FiRefreshCw } from "react-icons/fi";
import { gettingallTickets } from "../features/ticketSlice";
import TicketThread from "../Components/TicketThread";

const FILTERS = ["all", "open", "in-progress", "resolved", "closed"];

// The vendor's queue: every ticket from every shop admin.
function SuperAdminTickets() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { tickets, counts, isloading } = useSelector((state) => state.ticket);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    dispatch(gettingallTickets(filter === "all" ? undefined : filter));
  }, [dispatch, filter]);

  const stats = [
    { key: "open", value: counts?.open },
    { key: "in-progress", value: counts?.inProgress },
    { key: "resolved", value: counts?.resolved },
    { key: "closed", value: counts?.closed },
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <FiInbox className="mt-1 h-6 w-6 text-primary" />
          <div>
            <h1 className="font-display text-2xl font-bold">{t("superadmin.title")}</h1>
            <p className="mt-1 text-sm text-base-content/60">{t("superadmin.sub")}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => dispatch(gettingallTickets(filter === "all" ? undefined : filter))}
          className="flex items-center gap-2 rounded-lg border border-base-300 px-3 py-2 text-sm font-semibold transition hover:bg-base-200"
        >
          <FiRefreshCw className={`h-4 w-4 ${isloading ? "animate-spin" : ""}`} />
          {t("superadmin.refresh")}
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.key}
            className="rounded-lg border border-base-300 bg-base-100 px-4 py-3"
          >
            <p className="text-xs font-semibold uppercase text-base-content/50">
              {t(`support.statuses.${stat.key}`)}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{stat.value ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase transition ${
              filter === value
                ? "bg-primary text-primary-content"
                : "border border-base-300 hover:bg-base-200"
            }`}
          >
            {value === "all" ? t("superadmin.all") : t(`support.statuses.${value}`)}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {isloading ? (
          <p className="py-8 text-center text-sm text-base-content/50">{t("support.loading")}</p>
        ) : tickets.length === 0 ? (
          <p className="py-8 text-center text-sm text-base-content/50">
            {t("superadmin.noTickets")}
          </p>
        ) : (
          tickets.map((ticket) => (
            <TicketThread key={ticket._id} ticket={ticket} canManage />
          ))
        )}
      </div>
    </div>
  );
}

export default SuperAdminTickets;
