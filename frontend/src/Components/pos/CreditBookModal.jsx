import React, { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { FiAlertCircle, FiPrinter, FiSearch } from "react-icons/fi";
import axiosInstance from "../../lib/axios";
import PosModal from "./PosModal";
import { currency, printSlip } from "./posUtils";

// What the shop is owed, and taking it back.
//
// A customer who bought on account comes back with none of the paperwork and
// only what they can remember — so the search takes the email or number they
// left, their name, or the receipt, and any of them finds the row.
//
// The paying is the other half. A debt is rarely settled in one go, so each
// payment is recorded against the account with its own method and date: the day
// it is repaid is not the day it was sold, and the drawer needs to know that.
function CreditBookModal({ onClose }) {
  const { t } = useTranslation();
  const { store: SHOP } = useSelector((state) => state.store);

  const [query, setQuery] = useState("");
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [taking, setTaking] = useState(null); // the account being paid
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null); // the slip just given

  const load = useCallback(
    async (search) => {
      setLoading(true);
      try {
        const response = await axiosInstance.get("pos/credits", {
          params: search ? { query: search } : {},
        });
        setBook(response.data);
      } catch (error) {
        toast.error(
          error.response?.data?.message || t("pos.credit.loadFailed", "Could not load the credit book"),
        );
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    load("");
  }, [load]);

  const take = async () => {
    const paying = Number(amount);
    if (!Number.isFinite(paying) || paying <= 0) {
      toast.error(t("pos.credit.enterAmount", "Enter how much they are paying"));
      return;
    }

    setBusy(true);
    try {
      const response = await axiosInstance.post(
        `pos/receipt/${taking.receiptNo}/credit-payment`,
        { amount: paying, method },
      );
      toast.success(response.data.message);
      setReceipt({
        ...response.data.credit,
        reference: response.data.reference,
        took: paying,
        method,
        at: new Date().toISOString(),
      });
      setTaking(null);
      setAmount("");
      load(query);
    } catch (error) {
      toast.error(error.response?.data?.message || t("pos.credit.takeFailed", "Could not record it"));
    } finally {
      setBusy(false);
    }
  };

  const rows = book?.credits || [];

  return (
    <PosModal
      title={t("pos.credit.title", "Credit Book")}
      subtitle={t("pos.credit.subtitle", "What the shop is owed, and taking it back")}
      onClose={onClose}
      width="max-w-3xl"
      footer={
        book &&
        !receipt && (
          <>
            <span className="me-auto text-sm text-slate-400">
              {t("pos.credit.outstandingTotal", "Outstanding")}{" "}
              <span className="font-semibold text-amber-300">{currency(book.outstanding)}</span>
              {book.overdue > 0 && (
                <span className="ms-3 text-red-400">
                  {t("pos.credit.overdueTotal", "Overdue")} {currency(book.overdue)}
                </span>
              )}
            </span>
            {/* The whole book on paper — what the shop is owed, to read away
                from the till or hand to whoever is chasing it. */}
            <button
              type="button"
              onClick={() => printSlip("credit-book-print")}
              disabled={rows.length === 0}
              className="flex items-center gap-2 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-40"
            >
              <FiPrinter className="h-4 w-4" />
              {t("dayClosing.print", "Print")}
            </button>
          </>
        )
      }
    >
      {/* The slip for a payment just taken — the customer's proof it was paid. */}
      {receipt ? (
        <div className="space-y-4 py-2">
          <div className="mx-auto w-fit">
            <div className="slip-edge" />
            <div className="bg-white px-4 py-5 shadow-xl">
              <div className="slip">
                <CreditSlip slip={receipt} shop={SHOP} t={t} />
              </div>
            </div>
          </div>
          <div id="credit-slip-print" className="slip hidden">
            <CreditSlip slip={receipt} shop={SHOP} t={t} />
          </div>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setReceipt(null)}
              className="bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700"
            >
              {t("pos.refund.close", "Close")}
            </button>
            <button
              type="button"
              onClick={() => printSlip("credit-slip-print")}
              className="flex items-center gap-2 bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600"
            >
              <FiPrinter className="h-4 w-4" />
              {t("dayClosing.print", "Print")}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              load(query.trim());
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <FiSearch className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t(
                  "pos.credit.searchPlaceholder",
                  "Email, phone, name or receipt number",
                )}
                className="h-11 w-full border border-slate-700 bg-slate-950 ps-9 pe-3 text-slate-100 outline-none focus:border-cyan-500"
              />
            </div>
            <button
              type="submit"
              className="bg-cyan-700 px-5 text-sm font-bold uppercase text-white hover:bg-cyan-600"
            >
              {t("pos.refund.find", "Find")}
            </button>
          </form>

          {loading ? (
            <p className="py-10 text-center text-sm text-slate-500">{t("pos.processing")}</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              {t("pos.credit.empty", "Nothing is owed")}
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => (
                <div
                  key={row.receiptNo}
                  className={`border px-3 py-2.5 ${
                    row.overdue
                      ? "border-red-800 bg-red-950/30"
                      : "border-slate-800 bg-slate-950"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-100">
                          {row.receiptNo}
                        </span>
                        <span className="text-sm text-slate-300">{row.customerName}</span>
                        {row.overdue && (
                          <span className="flex items-center gap-1 bg-red-950 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-300">
                            <FiAlertCircle className="h-3 w-3" />
                            {t("pos.credit.overdue", "Overdue")}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {row.email || row.phone || "—"}
                        {row.dueAt
                          ? ` · ${t("pos.credit.due", "Due")} ${new Date(
                              row.dueAt,
                            ).toLocaleDateString()}`
                          : ""}
                        {row.paid > 0
                          ? ` · ${t("pos.credit.paidSoFar", "Paid")} ${currency(row.paid)}`
                          : ""}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-semibold tabular-nums text-amber-300">
                        {currency(row.outstanding)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setTaking(row);
                          setAmount(String(row.outstanding));
                          setMethod("cash");
                        }}
                        className="bg-emerald-700 px-3 py-1.5 text-xs font-bold uppercase text-white hover:bg-emerald-600"
                      >
                        {t("pos.credit.take", "Take Payment")}
                      </button>
                      {/* This one account on paper — what they bought, what
                          they have paid, what is left. A customer disputing a
                          balance wants to see the working, not a figure. */}
                      <button
                        type="button"
                        onClick={() => printSlip(`credit-statement-${row.receiptNo}`)}
                        title={t("pos.credit.printOne", "Print this statement")}
                        aria-label={t("pos.credit.printOne", "Print this statement")}
                        className="flex h-8 w-8 items-center justify-center border border-slate-700 text-slate-400 transition hover:border-cyan-600 hover:bg-slate-800 hover:text-cyan-300"
                      >
                        <FiPrinter className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Taking it, in place — the row stays on screen so the
                      cashier can see what it is they are settling. */}
                  {taking?.receiptNo === row.receiptNo && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-2">
                      <input
                        autoFocus
                        inputMode="decimal"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        className="w-28 border border-slate-700 bg-slate-950 px-2 py-1.5 text-center font-mono text-slate-100 outline-none focus:border-emerald-500"
                      />
                      {[
                        { key: "cash", label: t("common.payments.cash", "Cash") },
                        { key: "creditcard", label: t("common.payments.creditcard", "Card") },
                      ].map((entry) => (
                        <button
                          key={entry.key}
                          type="button"
                          onClick={() => setMethod(entry.key)}
                          className={`px-3 py-1.5 text-xs font-bold uppercase transition ${
                            method === entry.key
                              ? "bg-cyan-800 text-white ring-1 ring-cyan-600"
                              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                          }`}
                        >
                          {entry.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={take}
                        disabled={busy}
                        className="ms-auto bg-emerald-700 px-4 py-1.5 text-xs font-bold uppercase text-white hover:bg-emerald-600 disabled:opacity-40"
                      >
                        {busy ? t("pos.processing") : t("pos.credit.confirm", "Confirm")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTaking(null)}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-300"
                      >
                        {t("pos.refund.cancel", "Cancel")}
                      </button>
                    </div>
                  )}

                  {/* Hidden until it is the one being printed. Every row
                      carries its own, so the button above has a target. */}
                  <div id={`credit-statement-${row.receiptNo}`} className="slip hidden">
                    <CreditStatement account={row} shop={SHOP} t={t} />
                  </div>
                </div>
              ))}

              {/* The whole book on the 72mm roll. */}
              <div id="credit-book-print" className="slip hidden">
                <div className="s-head">
                  <div className="s-shop">{SHOP?.name}</div>
                  <div className="s-title">{t("pos.credit.title", "Credit Book")}</div>
                </div>
                <div className="s-meta">
                  <span>{t("dayClosing.printedAt", "Printed")}</span>
                  <span>{new Date().toLocaleString()}</span>
                </div>
                <div className="s-rule" />

                {rows.map((row) => (
                  <div key={`book-${row.receiptNo}`} className="s-row">
                    <div className="s-row-top">
                      <span>{row.customerName}</span>
                      <span>{currency(row.outstanding)}</span>
                    </div>
                    <div className="s-row-sub">
                      <span>
                        {row.receiptNo}
                        {row.email || row.phone ? ` · ${row.email || row.phone}` : ""}
                      </span>
                      <span>
                        {row.dueAt
                          ? `${t("pos.credit.due", "Due")} ${new Date(
                              row.dueAt,
                            ).toLocaleDateString()}`
                          : ""}
                        {row.overdue ? ` · ${t("pos.credit.overdue", "Overdue")}` : ""}
                      </span>
                    </div>
                  </div>
                ))}

                <div className="s-rule" />
                <div className="s-total">
                  <span>{t("pos.credit.outstandingTotal", "Outstanding")}</span>
                  <span>{currency(book.outstanding)}</span>
                </div>
                {book.overdue > 0 && (
                  <div className="s-line">
                    <span>{t("pos.credit.overdueTotal", "Overdue")}</span>
                    <span>{currency(book.overdue)}</span>
                  </div>
                )}
                <div className="s-line">
                  <span>{t("pos.credit.accounts", "Accounts")}</span>
                  <span>{rows.length}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </PosModal>
  );
}

// One account, with its working shown: what was bought, what has been paid
// since, and what is left. A customer disputing a balance wants the working.
function CreditStatement({ account, shop, t }) {
  return (
    <>
      <div className="s-head">
        <div className="s-shop">{shop?.name}</div>
        <div className="s-title">{t("pos.credit.statement", "Account Statement")}</div>
      </div>

      <div className="s-meta">
        <span>{t("pos.receipt")}</span>
        <span>{account.receiptNo}</span>
      </div>
      <div className="s-meta">
        <span>{t("pos.customer", "Customer")}</span>
        <span>{account.customerName}</span>
      </div>
      {(account.email || account.phone) && (
        <div className="s-meta">
          <span>{t("pos.credit.contact", "Contact")}</span>
          <span>{account.email || account.phone}</span>
        </div>
      )}
      {account.dueAt && (
        <div className="s-meta">
          <span>{t("pos.credit.due", "Due")}</span>
          <span>{new Date(account.dueAt).toLocaleDateString()}</span>
        </div>
      )}

      <div className="s-rule" />
      <div className="s-section">{t("pos.credit.bought", "Bought")}</div>
      {(account.items || []).map((item, index) => (
        <div key={`${item.name}-${index}`} className="s-item">
          <span>
            {item.quantity} × {item.name}
          </span>
          <span>{currency(item.lineTotal)}</span>
        </div>
      ))}

      <div className="s-rule" />
      <div className="s-line">
        <span>{t("pos.credit.wasOwed", "Was owed")}</span>
        <span>{currency(account.amount)}</span>
      </div>

      {(account.payments || []).length > 0 && (
        <>
          <div className="s-section">{t("pos.credit.paymentsMade", "Paid so far")}</div>
          {account.payments.map((entry, index) => (
            <div key={`${entry.reference || index}`} className="s-item">
              <span>
                {new Date(entry.at).toLocaleDateString()}
                {entry.method
                  ? ` · ${t(`common.payments.${entry.method}`, entry.method)}`
                  : ""}
              </span>
              <span>-{currency(entry.amount)}</span>
            </div>
          ))}
        </>
      )}

      <div className="s-rule" />
      <div className="s-total">
        <span>{t("pos.credit.stillOwed", "Still owed")}</span>
        <span>{currency(account.outstanding)}</span>
      </div>
      {account.settledAt && (
        <div className="s-section">{t("pos.credit.settled", "Settled in full")}</div>
      )}
    </>
  );
}

// The customer's proof that they paid, and what is left.
function CreditSlip({ slip, shop, t }) {
  return (
    <>
      <div className="s-head">
        <div className="s-shop">{shop?.name}</div>
        <div className="s-title">{t("pos.credit.slipTitle", "Account Payment")}</div>
      </div>

      <div className="s-meta">
        <span>{t("pos.credit.slipRef", "Payment")}</span>
        <span>{slip.reference}</span>
      </div>
      <div className="s-meta">
        <span>{t("pos.receipt")}</span>
        <span>{slip.receiptNo}</span>
      </div>
      <div className="s-meta">
        <span>{t("dayClosing.printedAt", "Printed")}</span>
        <span>{new Date(slip.at).toLocaleString()}</span>
      </div>

      <div className="s-rule" />
      <div className="s-total">
        <span>{t("pos.credit.received", "Received")}</span>
        <span>{currency(slip.took)}</span>
      </div>
      <div className="s-line">
        <span>{t("pos.refund.method", "Paid by")}</span>
        <span>{t(`common.payments.${slip.method}`, slip.method)}</span>
      </div>

      <div className="s-rule" />
      <div className="s-line">
        <span>{t("pos.credit.wasOwed", "Was owed")}</span>
        <span>{currency(slip.amount)}</span>
      </div>
      <div className="s-line">
        <span>{t("pos.credit.stillOwed", "Still owed")}</span>
        <span>{currency(slip.outstanding)}</span>
      </div>
      {slip.outstanding <= 0 && (
        <div className="s-section">{t("pos.credit.settled", "Settled in full")}</div>
      )}
    </>
  );
}

export default CreditBookModal;
