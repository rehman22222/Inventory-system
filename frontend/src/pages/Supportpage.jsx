import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { FiChevronDown, FiLifeBuoy } from "react-icons/fi";
import { CreateTicket, gettingallTickets } from "../features/ticketSlice";
import TicketThread from "../Components/TicketThread";

const CATEGORIES = ["bug", "feature", "billing", "question", "other"];
const PRIORITIES = ["low", "normal", "high", "urgent"];
const FAQ_KEYS = ["barcode", "refund", "voucher", "users", "reports", "offline"];

const EMPTY = { subject: "", message: "", category: "question", priority: "normal" };

// The shop admin's channel to us: a short FAQ first, and a ticket if the FAQ
// doesn't answer it.
function Supportpage() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { tickets, isloading, iscreating } = useSelector((state) => state.ticket);

  const [form, setForm] = useState(EMPTY);
  const [openFaq, setOpenFaq] = useState(null);

  useEffect(() => {
    dispatch(gettingallTickets());
  }, [dispatch]);

  const submit = async (event) => {
    event.preventDefault();

    const result = await dispatch(
      CreateTicket({
        subject: form.subject.trim(),
        message: form.message.trim(),
        category: form.category,
        priority: form.priority,
      })
    );

    if (!result.error) setForm(EMPTY);
  };

  const field =
    "w-full rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary";
  const label = "mb-1 block text-xs font-semibold uppercase text-base-content/60";

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      <header className="flex items-start gap-3">
        <FiLifeBuoy className="mt-1 h-6 w-6 text-primary" />
        <div>
          <h1 className="font-display text-2xl font-bold">{t("support.title")}</h1>
          <p className="mt-1 text-sm text-base-content/60">{t("support.sub")}</p>
        </div>
      </header>

      {/* FAQ */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-base-content/60">
          {t("support.faqTitle")}
        </h2>

        {FAQ_KEYS.map((key) => (
          <div key={key} className="rounded-lg border border-base-300 bg-base-100">
            <button
              type="button"
              onClick={() => setOpenFaq(openFaq === key ? null : key)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start font-medium transition hover:bg-base-200"
            >
              {t(`support.faq.${key}.q`)}
              <FiChevronDown
                className={`h-4 w-4 shrink-0 transition-transform ${
                  openFaq === key ? "rotate-180" : ""
                }`}
              />
            </button>
            {openFaq === key && (
              <p className="border-t border-base-300 px-4 py-3 text-sm text-base-content/70">
                {t(`support.faq.${key}.a`)}
              </p>
            )}
          </div>
        ))}
      </section>

      {/* Raise a ticket */}
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-base-content/60">
          {t("support.raiseTitle")}
        </h2>

        <form
          onSubmit={submit}
          className="grid gap-4 rounded-lg border border-base-300 bg-base-100 p-5 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <label className={label}>{t("support.subject")}</label>
            <input
              value={form.subject}
              onChange={(event) => setForm({ ...form, subject: event.target.value })}
              placeholder={t("support.subjectPlaceholder")}
              className={field}
            />
          </div>

          <div>
            <label className={label}>{t("support.category")}</label>
            <select
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
              className={field}
            >
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {t(`support.categories.${category}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={label}>{t("support.priority")}</label>
            <select
              value={form.priority}
              onChange={(event) => setForm({ ...form, priority: event.target.value })}
              className={field}
            >
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {t(`support.priorities.${priority}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className={label}>{t("support.message")}</label>
            <textarea
              rows={5}
              value={form.message}
              onChange={(event) => setForm({ ...form, message: event.target.value })}
              placeholder={t("support.messagePlaceholder")}
              className={field}
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={iscreating}
              className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-content transition hover:opacity-90 disabled:opacity-50"
            >
              {iscreating ? t("support.sending") : t("support.send")}
            </button>
          </div>
        </form>
      </section>

      {/* My tickets */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-base-content/60">
          {t("support.myTickets")}
        </h2>

        {isloading ? (
          <p className="py-6 text-center text-sm text-base-content/50">{t("support.loading")}</p>
        ) : tickets.length === 0 ? (
          <p className="py-6 text-center text-sm text-base-content/50">{t("support.noTickets")}</p>
        ) : (
          tickets.map((ticket) => (
            <TicketThread key={ticket._id} ticket={ticket} canManage={false} />
          ))
        )}
      </section>
    </div>
  );
}

export default Supportpage;
