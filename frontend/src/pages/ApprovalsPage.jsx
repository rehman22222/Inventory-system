import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { FiCheck, FiCheckSquare, FiX } from "react-icons/fi";
import {
  ApproveRequest,
  RejectRequest,
  gettingAllRequests,
} from "../features/approvalSlice";
import { REQUEST_STATUS_TONE } from "./MyRequestspage";

const FILTERS = ["pending", "all", "approved", "rejected"];

// The superadmin's queue: approve to run the action, or reject with a note.
function ApprovalsPage() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { requests, pending, isloading } = useSelector((state) => state.approval);
  const [filter, setFilter] = useState("pending");

  useEffect(() => {
    dispatch(gettingAllRequests(filter === "all" ? undefined : filter));
  }, [dispatch, filter]);

  const reject = (request) => {
    const note = window.prompt(t("approvals.rejectPrompt", { ref: request.reference }));
    if (note === null) return; // cancelled
    dispatch(RejectRequest({ requestId: request._id, note }));
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex items-start gap-3">
        <FiCheckSquare className="mt-1 h-6 w-6 text-primary" />
        <div>
          <h1 className="font-display text-2xl font-bold">{t("approvals.title")}</h1>
          <p className="mt-1 text-sm text-base-content/60">
            {t("approvals.sub", { count: pending })}
          </p>
        </div>
      </header>

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
            {value === "all" ? t("approvals.all") : t(`requests.statuses.${value}`)}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {isloading ? (
          <p className="py-8 text-center text-sm text-base-content/50">{t("requests.loading")}</p>
        ) : requests.length === 0 ? (
          <p className="py-8 text-center text-sm text-base-content/50">{t("approvals.empty")}</p>
        ) : (
          requests.map((request) => (
            <div
              key={request._id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-base-300 bg-base-100 px-4 py-3"
            >
              <span className="font-mono text-xs font-semibold text-base-content/60">
                {request.reference}
              </span>

              <div className="min-w-0 flex-1">
                <p className="font-medium">{request.summary}</p>
                <p className="truncate text-xs text-base-content/50">
                  {t("approvals.by", { name: request.requestedByName })} ·{" "}
                  {new Date(request.createdAt).toLocaleString()}
                  {request.reason ? ` · "${request.reason}"` : ""}
                </p>
                {request.resultNote && request.status === "failed" && (
                  <p className="mt-0.5 text-xs text-red-500">{request.resultNote}</p>
                )}
              </div>

              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  REQUEST_STATUS_TONE[request.status]
                }`}
              >
                {t(`requests.statuses.${request.status}`, request.status)}
              </span>

              {request.status === "pending" && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => dispatch(ApproveRequest(request._id))}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
                  >
                    <FiCheck className="h-4 w-4" />
                    {t("approvals.approve")}
                  </button>
                  <button
                    type="button"
                    onClick={() => reject(request)}
                    className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500"
                  >
                    <FiX className="h-4 w-4" />
                    {t("approvals.reject")}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ApprovalsPage;
