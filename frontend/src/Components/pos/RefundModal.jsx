import React, { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { FiMinus, FiPlus, FiPrinter, FiX } from "react-icons/fi";
import axiosInstance from "../../lib/axios";
import PosModal from "./PosModal";
import { currency, printSlip } from "./posUtils";

// The customer's record of what went back. Rendered twice from one source: on
// screen so the counter can read it, and hidden for the 72mm roll — a preview
// that is not the paper is not a preview.
//
// On an exchange this covers only the half that has just happened; what they
// took instead is rung up as an ordinary sale and prints its own receipt.
function RefundSlipView({ slip, shop, t }) {
  const body = (
    <>
      <div className="s-head">
        <div className="s-shop">{shop?.name}</div>
        {(shop?.addressLines || []).map((line) => (
          <div key={line} className="s-addr">
            {line}
          </div>
        ))}
        <div className="s-title">{t("pos.refund.slipTitle", "Refund")}</div>
      </div>

      <div className="s-meta">
        <span>{t("pos.refund.slipRef", "Refund")}</span>
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
      {slip.by && (
        <div className="s-meta">
          <span>{t("dayClosing.cashier", "Cashier")}</span>
          <span>{slip.by}</span>
        </div>
      )}

      <div className="s-rule" />
      <div className="s-section">{t("pos.refund.returned", "Returned")}</div>
      {(slip.items || []).map((item, i) => (
        <div key={`${item.name}-${i}`} className="s-line">
          <span>
            {item.quantity} × {item.name}
          </span>
          <span>{currency(item.lineTotal)}</span>
        </div>
      ))}

      <div className="s-rule" />
      <div className="s-total">
        <span>{t("dayClosing.refunded")}</span>
        <span>-{currency(slip.amount)}</span>
      </div>
      {slip.method && (
        <div className="s-line">
          <span>{t("pos.refund.method", "Refund by")}</span>
          <span>{t(`common.payments.${slip.method}`, slip.method)}</span>
        </div>
      )}

      {slip.exchange?.length > 0 && (
        <>
          <div className="s-rule" />
          <div className="s-section">{t("pos.exchange.title", "Exchange for")}</div>
          {slip.exchange.map((item) => (
            <div key={String(item.productId)} className="s-line">
              <span>
                {item.quantity} × {item.name}
              </span>
              <span>{currency(item.price * item.quantity)}</span>
            </div>
          ))}
          <div className="s-line">
            <span>
              {slip.difference >= 0
                ? t("pos.exchange.customerPays", "Customer pays")
                : t("pos.exchange.customerGets", "Customer gets back")}
            </span>
            <span>{currency(Math.abs(slip.difference))}</span>
          </div>
          <div className="s-row-sub">
            <span>{t("pos.refund.exchangeNote", "Rung up on its own receipt")}</span>
          </div>
        </>
      )}
    </>
  );

  return (
    <div className="py-2">
      {/* Shown as a piece of paper rather than a panel: the counter is checking
          this against what is about to come out of the printer, and a roll has
          a torn top and bottom edge. */}
      <div className="mx-auto w-fit">
        <div className="slip-edge" />
        <div className="bg-white px-4 py-5 shadow-xl">
          <div className="slip">{body}</div>
        </div>
        <div className="slip-edge slip-edge-bottom" />
      </div>

      <div id="refund-slip-print" className="slip hidden">
        {body}
      </div>
    </div>
  );
}

// Refund a whole receipt or just some of its lines. Admin/manager only —
// the backend enforces that too.
//
// An exchange is built out of the same parts rather than being its own kind of
// transaction: what comes back is refunded here, and what the customer takes
// instead goes into the basket to be rung up as an ordinary sale. Two honest
// records the reports already understand, and the drawer nets to the
// difference — which is all that actually crosses the counter.
//
// `exchangeItems` and its handlers live in POSPage because picking a
// replacement opens the product search over this dialog, and this one has to
// keep its own half-filled state while that happens.
function RefundModal({
  initialReceiptNo = "",
  exchangeItems = [],
  onPickExchange,
  onSetExchangeQty,
  onRemoveExchange,
  onDone,
  onClose,
}) {
  const { t } = useTranslation();
  const { store: SHOP } = useSelector((state) => state.store);
  const [receiptNo, setReceiptNo] = useState(initialReceiptNo);
  const [receipt, setReceipt] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  // How the money goes back. Blank means "the way it came in", which is what a
  // refund did before this was a choice and is still the right default.
  const [method, setMethod] = useState("");
  // Finding a receipt the customer no longer has: pick the day and choose from
  // what was rung up on it.
  const [date, setDate] = useState("");
  const [dayReceipts, setDayReceipts] = useState(null);
  // The refund that has just gone through, held so its slip can be printed.
  const [done, setDone] = useState(null);

  // How many of each line are still refundable after earlier partial refunds.
  const outstandingOf = (loaded, item) => {
    const already = (loaded.refunds || []).reduce((sum, refund) => {
      const match = (refund.items || []).find(
        (entry) => String(entry.product) === String(item.product)
      );
      return sum + (match ? Number(match.quantity || 0) : 0);
    }, 0);
    return item.quantity - already;
  };

  const lookup = useCallback(
    async (code) => {
      const value = String(code || "").trim();
      if (!value) return;

      setBusy(true);
      try {
        const response = await axiosInstance.get(`pos/receipt/${value.toUpperCase()}`);
        const loaded = response.data.receipt;
        setReceipt(loaded);
        // Every line starts at what is still refundable on it, so the cashier
        // counts DOWN to what the customer actually brought back rather than up
        // from nothing. The plus button is capped at the same figure, so this
        // can only ever be reduced — nobody can hand back more than was sold.
        setQuantities(
          Object.fromEntries(
            loaded.items.map((item) => [String(item.product), outstandingOf(loaded, item)])
          )
        );
      } catch (error) {
        setReceipt(null);
        toast.error(error.response?.data?.message || t("pos.refund.notFound"));
      } finally {
        setBusy(false);
      }
    },
    [t]
  );

  useEffect(() => {
    if (initialReceiptNo) lookup(initialReceiptNo);
  }, [initialReceiptNo, lookup]);

  // With direct printing on the slip goes out by itself. In an effect rather
  // than at the end of submit: the node it prints has to be in the page first,
  // and that only happens on the render `done` causes.
  useEffect(() => {
    if (done && SHOP?.directPrint) printSlip("refund-slip-print");
  }, [done, SHOP?.directPrint]);

  const searchDay = async (value) => {
    if (!value) return;
    setBusy(true);
    try {
      const response = await axiosInstance.get("pos/receipts", {
        params: { date: value, limit: 100 },
      });
      setDayReceipts(response.data.receipts || []);
      setReceipt(null);
    } catch (error) {
      setDayReceipts([]);
      toast.error(error.response?.data?.message || t("pos.refund.notFound"));
    } finally {
      setBusy(false);
    }
  };

  // No slip, no date — but the customer is holding the thing. Scanning it finds
  // the sales it was on, and the refund still hangs off the sale that actually
  // happened: what was paid for it (a deal makes that not the shelf price) and
  // how much of it is still outstanding live there and nowhere else.
  const searchBarcode = async (code) => {
    const value = String(code || "").trim();
    if (!value) return;

    setBusy(true);
    try {
      const response = await axiosInstance.get("pos/receipts", {
        params: { barcode: value, limit: 50 },
      });
      const found = response.data.receipts || [];
      setDayReceipts(found);
      setReceipt(null);
      if (found.length === 0) toast.error(t("pos.refund.noSaleForItem"));
    } catch (error) {
      setDayReceipts([]);
      toast.error(error.response?.data?.message || t("pos.refund.notFound"));
    } finally {
      setBusy(false);
    }
  };

  const setQuantity = (productId, next, max) => {
    setQuantities((current) => ({
      ...current,
      [productId]: Math.max(0, Math.min(Number(next) || 0, max)),
    }));
  };

  // One tap either way: back to the whole receipt, or down to nothing so a
  // single returned item can be counted up on its own line.
  const selectAll = () => {
    if (!receipt) return;
    setQuantities(
      Object.fromEntries(
        receipt.items.map((item) => [String(item.product), outstandingOf(receipt, item)])
      )
    );
  };

  const clearAll = () => setQuantities({});

  const selectedCount = Object.values(quantities).reduce(
    (sum, value) => sum + Number(value || 0),
    0
  );

  const refundTotal = receipt
    ? receipt.items.reduce((sum, item) => {
        const quantity = quantities[String(item.product)] || 0;
        const ratio = receipt.subtotal ? receipt.total / receipt.subtotal : 1;
        return sum + item.price * quantity * ratio;
      }, 0)
    : 0;

  // What the replacements come to at today's shelf price, and what the customer
  // is left owing (or owed) once the refund is set against them.
  const exchangeTotal = exchangeItems.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );
  const difference = exchangeTotal - refundTotal;

  const submit = async () => {
    const items = receipt.items
      .map((item) => ({
        product: item.product,
        quantity: quantities[String(item.product)] || 0,
      }))
      .filter((item) => item.quantity > 0);

    if (items.length === 0) {
      toast.error(t("pos.refund.selectSomething"));
      return;
    }

    setBusy(true);
    try {
      const response = await axiosInstance.post("pos/refund", {
        receiptNo: receipt.receiptNo,
        items,
        reason: reason.trim() || undefined,
        method: method || undefined,
      });
      toast.success(
        t("pos.refund.done", { amount: currency(response.data.amount) })
      );
      // An exchange is the refund plus a fresh sale, and the refund is the half
      // that has just happened. Hand the replacements back so they land in the
      // basket: the cashier rings them up as normal and the drawer sees the
      // difference, which is the only figure that actually changes hands.
      onDone?.(exchangeItems);
      // Hold the dialog open on the refund's own slip. The customer is owed a
      // record of what went back — and on an exchange the till is about to
      // print a second one for what they took instead, so the two together are
      // the paperwork for the swap.
      setDone({
        ...response.data.slip,
        exchange: exchangeItems,
        difference,
      });
    } catch (error) {
      toast.error(error.response?.data?.message || t("pos.refund.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PosModal
      title={t("pos.refund.title")}
      subtitle={t("pos.refund.subtitle")}
      onClose={onClose}
      footer={
        done ? (
          <>
            <span className="me-auto text-sm text-slate-400">
              {done.reference}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700"
            >
              {t("pos.refund.close", "Close")}
            </button>
            <button
              type="button"
              onClick={() => printSlip("refund-slip-print")}
              className="flex items-center gap-2 bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600"
            >
              <FiPrinter className="h-4 w-4" />
              {t("dayClosing.print", "Print")}
            </button>
          </>
        ) :
        receipt && (
          <>
            <span className="me-auto text-sm text-slate-400">
              {t("pos.refund.refunding")}:{" "}
              <span className="font-semibold text-slate-100">{currency(refundTotal)}</span>
              {exchangeItems.length > 0 && (
                <>
                  {" · "}
                  {difference >= 0
                    ? t("pos.exchange.customerPays", "Customer pays")
                    : t("pos.exchange.customerGets", "Customer gets back")}{" "}
                  <span className="font-semibold text-slate-100">
                    {currency(Math.abs(difference))}
                  </span>
                </>
              )}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700"
            >
              {t("pos.refund.cancel")}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy || selectedCount === 0}
              className="bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
            >
              {busy
                ? t("pos.processing")
                : exchangeItems.length > 0
                  ? t("pos.exchange.confirm", "Refund & exchange")
                  : t("pos.refund.confirm")}
            </button>
          </>
        )
      }
    >
      {done ? (
        <RefundSlipView slip={done} shop={SHOP} t={t} />
      ) : (
      <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          lookup(receiptNo);
        }}
        className="mb-4 flex gap-2"
      >
        <input
          autoFocus
          value={receiptNo}
          onChange={(event) => setReceiptNo(event.target.value)}
          placeholder={t("pos.refund.receiptPlaceholder")}
          className="flex-1 border border-slate-700 bg-slate-950 px-3 py-2 font-mono uppercase text-slate-100 outline-none focus:border-cyan-500"
        />
        <button
          type="submit"
          disabled={busy}
          className="bg-cyan-700 px-5 py-2 font-semibold text-white hover:bg-cyan-600 disabled:opacity-50"
        >
          {t("pos.refund.find")}
        </button>
      </form>

      {/* No slip and no date, but they are holding the thing: scan it. */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const code = event.target.elements.scan.value;
          searchBarcode(code);
          event.target.reset();
        }}
        className="mb-3 flex gap-2"
      >
        <input
          name="scan"
          data-keyboard="numeric"
          placeholder={t("pos.refund.scanPlaceholder", "…or scan the item they brought back")}
          className="flex-1 border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-slate-100 outline-none focus:border-cyan-500"
        />
        <button
          type="submit"
          disabled={busy}
          className="bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
        >
          {t("pos.refund.findItem", "Find sales")}
        </button>
      </form>

      {/* The other way in: the customer has lost the slip but knows the day. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-slate-600">
          {t("pos.refund.orByDate", "or by date")}
        </span>
        <input
          type="date"
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
            searchDay(event.target.value);
          }}
          className="border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
        />
        {dayReceipts && (
          <button
            type="button"
            onClick={() => {
              setDate("");
              setDayReceipts(null);
            }}
            className="text-xs font-semibold text-slate-500 hover:text-slate-300"
          >
            {t("pos.refund.clearDate", "Clear")}
          </button>
        )}
      </div>

      {dayReceipts && !receipt && (
        <div className="mb-4 max-h-52 space-y-1 overflow-y-auto">
          {dayReceipts.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-600">
              {t("pos.refund.noneThatDay", "Nothing was rung up on that day")}
            </p>
          ) : (
            dayReceipts.map((entry) => (
              <button
                key={entry.receiptNo}
                type="button"
                onClick={() => {
                  setReceiptNo(entry.receiptNo);
                  lookup(entry.receiptNo);
                }}
                className="flex w-full items-center justify-between gap-3 border border-slate-800 bg-slate-950 px-3 py-2 text-start transition hover:border-cyan-700"
              >
                <span className="min-w-0">
                  <span className="block font-mono text-sm text-slate-200">
                    {entry.receiptNo}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {new Date(entry.createdAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {entry.customerName}
                    {entry.status && entry.status !== "completed"
                      ? ` · ${entry.status}`
                      : ""}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-300">
                  {currency(entry.total)}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {receipt && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1 border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-400">
            <span>
              {t("pos.customer")}:{" "}
              <span className="text-slate-200">{receipt.customerName}</span>
            </span>
            <span>
              {/* The key already reads "Cashier: {{name}}" — appending the name
                  again printed the placeholder itself back at the cashier. */}
              <span className="text-slate-200">
                {t("pos.cashier", { name: receipt.cashierName })}
              </span>
            </span>
            <span>
              {t("pos.total")}:{" "}
              <span className="text-slate-200">{currency(receipt.total)}</span>
            </span>
            <span>
              {t("pos.refund.status")}:{" "}
              <span className="text-amber-400">{receipt.status}</span>
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              {t("pos.refund.chooseItems", "Choose what the customer brought back")}
            </span>
            <button
              type="button"
              onClick={selectedCount > 0 ? clearAll : selectAll}
              className="border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:border-slate-500 hover:text-slate-100"
            >
              {selectedCount > 0
                ? t("pos.refund.clearAll", "Clear")
                : t("pos.refund.selectAll", "Select all")}
            </button>
          </div>

          <div className="space-y-1">
            {receipt.items.map((item) => {
              const key = String(item.product);
              const max = outstandingOf(receipt, item);
              const value = quantities[key] || 0;

              return (
                <div
                  key={key}
                  className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 border px-3 py-2 ${
                    max === 0
                      ? "border-slate-900 bg-slate-950 opacity-50"
                      : "border-slate-800 bg-slate-950"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-slate-500">
                      {currency(item.price)} ·{" "}
                      {t("pos.refund.refundable", { count: max, sold: item.quantity })}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={max === 0}
                      onClick={() => setQuantity(key, value - 1, max)}
                      className="bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 disabled:opacity-30"
                    >
                      <FiMinus className="h-3 w-3" />
                    </button>
                    <span className="w-8 text-center tabular-nums font-semibold">{value}</span>
                    <button
                      type="button"
                      disabled={max === 0}
                      onClick={() => setQuantity(key, value + 1, max)}
                      className="bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 disabled:opacity-30"
                    >
                      <FiPlus className="h-3 w-3" />
                    </button>
                  </div>

                  <span className="w-20 text-end text-sm font-semibold tabular-nums">
                    {currency(item.price * value)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* How the money goes back. A card sale handed back in cash is an
              ordinary thing at a counter, and the drawer needs to know which
              it was — so this is asked rather than assumed. */}
          <div className="border-t border-slate-800 pt-3">
            <span className="mb-2 block text-xs font-semibold uppercase text-slate-500">
              {t("pos.refund.method", "Refund by")}
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { key: "", label: t("pos.refund.sameAsSale", "Same as sale") },
                { key: "cash", label: t("common.payments.cash", "Cash") },
                { key: "creditcard", label: t("common.payments.creditcard", "Card") },
                { key: "wallet", label: t("common.payments.wallet", "Wallet") },
              ].map((option) => (
                <button
                  key={option.key || "same"}
                  type="button"
                  onClick={() => setMethod(option.key)}
                  className={`px-2 py-2 text-xs font-bold uppercase tracking-wide transition ${
                    method === option.key
                      ? "bg-cyan-800 text-white ring-1 ring-cyan-600"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* What the customer takes instead. Optional — leave it empty and
              this is an ordinary refund. */}
          <div className="border-t border-slate-800 pt-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase text-slate-500">
                {t("pos.exchange.title", "Exchange for")}
              </span>
              <button
                type="button"
                onClick={onPickExchange}
                className="border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:border-cyan-500 hover:text-cyan-300"
              >
                {t("pos.exchange.add", "+ Add product")}
              </button>
            </div>

            {exchangeItems.length === 0 ? (
              <p className="mt-2 text-xs text-slate-600">
                {t(
                  "pos.exchange.empty",
                  "Nothing yet — add a product and this becomes an exchange.",
                )}
              </p>
            ) : (
              <div className="mt-2 space-y-1">
                {exchangeItems.map((item) => (
                  <div
                    key={String(item.productId)}
                    className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border border-cyan-900 bg-slate-950 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-slate-500">{currency(item.price)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onSetExchangeQty(item.productId, item.quantity - 1)}
                        className="bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700"
                      >
                        <FiMinus className="h-3 w-3" />
                      </button>
                      <span className="w-8 text-center font-semibold tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSetExchangeQty(item.productId, item.quantity + 1)}
                        className="bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700"
                      >
                        <FiPlus className="h-3 w-3" />
                      </button>
                    </div>
                    <span className="w-20 text-end text-sm font-semibold tabular-nums">
                      {currency(item.price * item.quantity)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveExchange(item.productId)}
                      aria-label={t("pos.exchange.remove", "Remove")}
                      className="p-1 text-slate-500 hover:text-red-400"
                    >
                      <FiX className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                {/* The only figure that actually crosses the counter. */}
                <div className="flex justify-between gap-4 border-t border-slate-800 pt-2 text-sm">
                  <span className="text-slate-500">
                    {difference >= 0
                      ? t("pos.exchange.customerPays", "Customer pays")
                      : t("pos.exchange.customerGets", "Customer gets back")}
                  </span>
                  <span
                    className={`font-semibold tabular-nums ${
                      difference >= 0 ? "text-emerald-400" : "text-amber-400"
                    }`}
                  >
                    {currency(Math.abs(difference))}
                  </span>
                </div>
              </div>
            )}
          </div>

          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("pos.refund.reasonPlaceholder")}
            className="w-full border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
          />
        </div>
      )}
      </>
      )}
    </PosModal>
  );
}

export default RefundModal;
