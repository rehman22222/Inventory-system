import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { FiSend } from "react-icons/fi";
import { ReplyToTicket, UpdateTicketStatus } from "../features/ticketSlice";

export const STATUS_TONE = {
  open: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "in-progress": "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  closed: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const PRIORITY_TONE = {
  low: "text-slate-500",
  normal: "text-slate-500",
  high: "text-amber-600 dark:text-amber-400",
  urgent: "text-red-600 dark:text-red-400",
};

// One ticket, its conversation, and the reply box. Shared by the shop admin's
// support page and the vendor's ticket queue — the vendor simply also gets the
// status controls.
function TicketThread({ ticket, canManage }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { isreplying } = useSelector((state) => state.ticket);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);

  const send = (event) => {
    event.preventDefault();
    if (!message.trim()) return;

    dispatch(ReplyToTicket({ ticketId: ticket._id, message: message.trim() })).then((result) => {
      if (!result.error) setMessage("");
    });
  };

  return (
    <div className="rounded-lg border border-base-300 bg-base-100">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-3 px-4 py-3 text-start transition hover:bg-base-200"
      >
        <span className="font-mono text-xs font-semibold text-base-content/60">
          {ticket.reference}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{ticket.subject}</span>
          <span className="block truncate text-xs text-base-content/50">
            {ticket.raisedByName} · {new Date(ticket.createdAt).toLocaleString()} ·{" "}
            {t(`support.categories.${ticket.category}`, ticket.category)}
          </span>
        </span>

        <span className={`text-xs font-semibold uppercase ${PRIORITY_TONE[ticket.priority]}`}>
          {t(`support.priorities.${ticket.priority}`, ticket.priority)}
        </span>

        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            STATUS_TONE[ticket.status]
          }`}
        >
          {t(`support.statuses.${ticket.status}`, ticket.status)}
        </span>

        {ticket.replies?.length > 0 && (
          <span className="text-xs text-base-content/50">{ticket.replies.length}</span>
        )}
      </button>

      {open && (
        <div className="space-y-3 border-t border-base-300 px-4 py-4">
          <div className="rounded-lg bg-base-200 p-3 text-sm">
            <p className="whitespace-pre-wrap">{ticket.message}</p>
          </div>

          {ticket.replies?.map((reply, index) => {
            const fromVendor = reply.byRole === "superadmin";

            return (
              <div
                key={index}
                className={`rounded-lg p-3 text-sm ${
                  fromVendor
                    ? "border border-primary/30 bg-primary/5"
                    : "bg-base-200"
                }`}
              >
                <p className="mb-1 text-xs font-semibold text-base-content/60">
                  {reply.byName}
                  {fromVendor && ` · ${t("support.vendor")}`} ·{" "}
                  {new Date(reply.at).toLocaleString()}
                </p>
                <p className="whitespace-pre-wrap">{reply.message}</p>
              </div>
            );
          })}

          {ticket.status !== "closed" && (
            <form onSubmit={send} className="flex gap-2">
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={t("support.replyPlaceholder")}
                className="flex-1 rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={isreplying}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-90 disabled:opacity-50"
              >
                <FiSend className="h-4 w-4" />
                {t("support.reply")}
              </button>
            </form>
          )}

          {canManage && (
            <div className="flex flex-wrap gap-2 border-t border-base-300 pt-3">
              {["open", "in-progress", "resolved", "closed"].map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={ticket.status === status}
                  onClick={() =>
                    dispatch(UpdateTicketStatus({ ticketId: ticket._id, status }))
                  }
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${STATUS_TONE[status]}`}
                >
                  {t(`support.markAs.${status}`, status)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TicketThread;
