import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { FiMail, FiX } from "react-icons/fi";
import axiosInstance from "../lib/axios";

// What the supplier will read, before anybody sends it.
//
// The order lines are not editable and should not be: an email that says one
// thing and an order that says another is how a wrong delivery arrives with
// paperwork backing it up. So the table is shown beside the message rather than
// inside it, and the message carries a marker saying where it will land.
// Everything else — the greeting, the note, the sign-off, the subject — is the
// shop's own voice and theirs to change.
function OrderEmailPreview({ order, onSent, onClose }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    let alive = true;

    axiosInstance
      .get(`order/preview/${order._id}`)
      .then((response) => {
        if (alive) setDraft(response.data);
      })
      .catch((error) => {
        toast.error(
          error.response?.data?.message ||
            t("orders.previewFailed", "Could not build the email"),
        );
        onClose();
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [order._id, onClose, t]);

  const send = async () => {
    setSending(true);
    try {
      await axiosInstance.post(`order/sendorder/${order._id}`, {
        subject: draft.subject,
        message: draft.message,
      });
      toast.success(t("orders.sent"));
      onSent();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || t("orders.sendFail"));
      setSending(false);
    }
  };

  const set = (field) => (event) =>
    setDraft((current) => ({ ...current, [field]: event.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-base-100 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-base-300 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <FiMail className="h-5 w-5" />
              {t("orders.previewTitle", "Send to Supplier")}
            </h2>
            <p className="mt-0.5 text-sm text-base-content/60">
              {t("orders.previewSub", "Read it before it goes. Nothing is sent until you press Send.")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-base-content/50 hover:bg-base-200"
            aria-label={t("dayClosing.back", "Back")}
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {loading || !draft ? (
          <p className="px-5 py-10 text-center text-sm text-base-content/60">
            {t("orders.loading", "Loading…")}
          </p>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-base-content/60">
                  {t("orders.previewTo", "To")}
                </label>
                {/* Not editable: the address belongs to the supplier record, and
                    a one-off address typed here is a delivery nobody can trace. */}
                <p className="rounded-lg border-2 border-base-300 bg-base-200/40 px-3 py-2 text-sm">
                  {draft.supplierName ? `${draft.supplierName} · ` : ""}
                  {draft.to || t("orders.noEmail")}
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-base-content/60">
                  {t("orders.previewSubject", "Subject")}
                </label>
                <input
                  value={draft.subject}
                  onChange={set("subject")}
                  className="h-11 w-full rounded-lg border-2 border-base-300 bg-base-100 px-3"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-base-content/60">
                  {t("orders.previewMessage", "Message")}
                </label>
                <textarea
                  value={draft.message}
                  onChange={set("message")}
                  rows={10}
                  className="w-full rounded-lg border-2 border-base-300 bg-base-100 px-3 py-2 text-sm leading-relaxed"
                />
                <p className="mt-1 text-xs text-base-content/50">
                  {t(
                    "orders.previewMarkerHint",
                    "[ORDER LINES] is where the table below is inserted. Delete it and the table goes at the end — a purchase order always carries its lines.",
                  )}
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-base-content/60">
                  {t("orders.previewLines", "Order Lines")}
                </label>
                <div className="overflow-hidden rounded-lg border-2 border-base-300">
                  <table className="w-full text-sm">
                    <thead className="bg-base-200/60">
                      <tr>
                        <th className="px-3 py-2 text-start font-semibold">
                          {t("orders.product", "Product")}
                        </th>
                        <th className="w-20 px-3 py-2 text-end font-semibold">
                          {t("orders.qty", "Qty")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(draft.lines || []).map((line, index) => (
                        <tr key={`${line.name}-${index}`} className="border-t border-base-300">
                          <td className="px-3 py-1.5">{line.name}</td>
                          <td className="px-3 py-1.5 text-end tabular-nums">{line.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {!draft.mailConfigured && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                  {t(
                    "orders.mailNotConfigured",
                    "Email is not set up on the server yet, so this cannot be sent.",
                  )}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-base-300 px-5 py-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-base-content/60 hover:bg-base-200"
              >
                {t("orders.cancel", "Cancel")}
              </button>
              <button
                type="button"
                onClick={send}
                disabled={sending || !draft.to || !draft.mailConfigured}
                className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-bold text-white hover:bg-blue-600 disabled:opacity-40"
              >
                {sending ? t("orders.sending", "Sending…") : t("orders.sendNow", "Send")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default OrderEmailPreview;
