import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import axiosInstance from "../../lib/axios";
import { cacheGet, isVoucherSpentOffline } from "../../lib/offlineDb";
import { isNetworkError } from "../../lib/offlineQueue";
import { FiPrinter } from "react-icons/fi";
import PosModal from "./PosModal";
import BarcodeLabel from "../BarcodeLabel";
import {
  currency,
  newInStoreBarcode,
  printSlip,
  sanitizeDecimal,
  sanitizeInteger,
} from "./posUtils";

// Work out what a cached voucher is worth, mirroring Vouchermodel's
// computeDiscount + rejectionReason so an offline preview matches what the
// server will conclude at sync.
const priceCachedVoucher = (voucher, subtotal) => {
  if (voucher.expiresAt && new Date(voucher.expiresAt).getTime() < Date.now()) {
    return { error: "expired" };
  }
  if (Number(subtotal) < Number(voucher.minSpend || 0)) {
    return { error: "minSpend", minSpend: voucher.minSpend };
  }

  const raw =
    voucher.type === "percent"
      ? (Number(subtotal) * Number(voucher.value)) / 100
      : Number(voucher.value);

  return { amount: Math.max(0, Math.min(raw, Number(subtotal))) };
};

// Cashiers apply a code; admin/manager can also cut a new one without leaving
// the till. Redemption itself happens server-side inside the checkout
// transaction, so applying a code here is only a preview.
function VoucherModal({
  subtotal,
  applied,
  canGenerate,
  categories = [],
  symbol = "€",
  onApply,
  onRemove,
  onProductAdded,
  onClose,
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("apply");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    code: "",
    type: "amount",
    value: "",
    minSpend: "",
    expiresAt: "",
    usageLimit: "1",
  });

  // With no line, price the code from the cached voucher list. The server has
  // the last word at sync: it redeems the code, and if another till already
  // spent it, the discount still stands but the admin is told.
  const applyFromCache = async (value) => {
    const cached = (await cacheGet("vouchers")) || [];
    const voucher = cached.find((entry) => entry.code === value);

    if (!voucher) {
      toast.error(t("pos.voucher.offlineUnknown"));
      return false;
    }

    // The one thing this till *can* be sure of: it hasn't already spent it.
    if (await isVoucherSpentOffline(value)) {
      toast.error(t("pos.voucher.offlineAlreadyUsed"));
      return false;
    }

    const priced = priceCachedVoucher(voucher, subtotal);

    if (priced.error === "expired") {
      toast.error(t("pos.voucher.expired"));
      return false;
    }
    if (priced.error === "minSpend") {
      toast.error(t("pos.voucher.minSpend", { amount: currency(priced.minSpend) }));
      return false;
    }

    onApply({
      code: voucher.code,
      type: voucher.type,
      value: voucher.value,
      amount: priced.amount,
      offline: true,
    });
    toast.success(t("pos.voucher.appliedOffline", { amount: currency(priced.amount) }));
    onClose();
    return true;
  };

  const applyCode = async (event) => {
    event.preventDefault();
    const value = code.trim().toUpperCase();
    if (!value) return;

    setBusy(true);

    // Known to be offline — go straight to the cache.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      await applyFromCache(value);
      setBusy(false);
      return;
    }

    try {
      const response = await axiosInstance.post("voucher/validate", {
        code: value,
        subtotal,
      });
      onApply({
        code: response.data.code,
        type: response.data.type,
        value: response.data.value,
        amount: response.data.computedDiscount,
      });
      toast.success(
        t("pos.voucher.applied", { amount: currency(response.data.computedDiscount) })
      );
      onClose();
    } catch (error) {
      // The line dropped rather than the server refusing — fall back to the
      // cache. A real refusal (used/expired) must still reach the cashier.
      if (isNetworkError(error)) {
        await applyFromCache(value);
      } else {
        toast.error(error.response?.data?.message || t("pos.voucher.invalid"));
      }
    } finally {
      setBusy(false);
    }
  };

  const generate = async (event) => {
    event.preventDefault();

    if (!form.code.trim() || !form.value) {
      toast.error(t("pos.voucher.missingFields"));
      return;
    }

    setBusy(true);
    try {
      await axiosInstance.post("voucher/create", {
        code: form.code.trim().toUpperCase(),
        type: form.type,
        value: Number(form.value),
        minSpend: Number(form.minSpend || 0),
        expiresAt: form.expiresAt || undefined,
        usageLimit: Number(form.usageLimit || 1),
      });
      toast.success(t("pos.voucher.generated", { code: form.code.trim().toUpperCase() }));
      setForm({ code: "", type: "amount", value: "", minSpend: "", expiresAt: "", usageLimit: "1" });
    } catch (error) {
      toast.error(error.response?.data?.message || t("pos.voucher.generateFailed"));
    } finally {
      setBusy(false);
    }
  };

  // Adding a product from the till, and the label that goes on the shelf after.
  const [product, setProduct] = useState({
    name: "",
    Price: "",
    costPrice: "",
    Category: "",
    quantity: "",
    barcode: "",
  });
  const [made, setMade] = useState(null);
  const [labels, setLabels] = useState(12);

  const setProductField = (key) => (event) =>
    setProduct((current) => ({ ...current, [key]: event.target.value }));

  const createProduct = async (event) => {
    event.preventDefault();

    if (!product.name.trim() || !product.Price) {
      toast.error(t("pos.newProduct.missingFields", "A name and a price are needed"));
      return;
    }
    // The label is an EAN-13 symbol, and EAN-13 is exactly this. Better to
    // refuse here than to print a sheet of stickers no scanner will read.
    if (!/^\d{12,13}$/.test(product.barcode.trim())) {
      toast.error(
        t("pos.newProduct.badBarcode", "A barcode is 12 or 13 digits — scan one, or generate it"),
      );
      return;
    }

    setBusy(true);
    try {
      const payload = new FormData();
      payload.append("name", product.name.trim());
      payload.append("Price", product.Price);
      if (product.costPrice) payload.append("costPrice", product.costPrice);
      if (product.Category) payload.append("Category", product.Category);
      payload.append("quantity", product.quantity || "0");
      payload.append("barcode", product.barcode.trim());

      // The till's own create path, open to every cashier — the same one the
      // unknown-barcode screen uses, so a product added here is identical to
      // one learned at the scanner.
      const response = await axiosInstance.post("product/quick-add", payload);
      const created = response.data.product || {};

      toast.success(t("pos.newProduct.created", { name: product.name.trim() }));
      setMade({
        name: created.name || product.name.trim(),
        barcode: created.barcode || product.barcode.trim(),
        Price: Number(created.Price ?? product.Price),
      });
      setProduct({ name: "", Price: "", costPrice: "", Category: "", quantity: "", barcode: "" });
      onProductAdded?.();
    } catch (error) {
      toast.error(error.response?.data?.message || t("pos.newProduct.failed", "Could not add it"));
    } finally {
      setBusy(false);
    }
  };

  // The app prints to an 80mm till roll by default. Shelf labels go on a normal
  // sheet, so @page is overridden for this print only — a rule appended last
  // wins the cascade, and it comes off again so the next receipt is not printed
  // on A4.
  const printLabels = () => {
    const style = document.createElement("style");
    style.textContent = "@page { size: A4; margin: 8mm; }";
    document.head.appendChild(style);

    try {
      printSlip("barcode-sheet");
    } finally {
      style.remove();
    }
  };

  const field =
    "w-full border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500";
  const label = "mb-1 block text-xs uppercase text-slate-400";

  return (
    <PosModal
      title={t("pos.voucher.title")}
      subtitle={t("pos.voucher.subtitle")}
      onClose={onClose}
      width="max-w-xl"
    >
      {canGenerate && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setTab("apply")}
            className={`px-4 py-2 text-sm font-semibold transition ${
              tab === "apply" ? "bg-cyan-700 text-white" : "bg-slate-800 text-slate-300"
            }`}
          >
            {t("pos.voucher.applyTab")}
          </button>
          <button
            type="button"
            onClick={() => setTab("generate")}
            className={`px-4 py-2 text-sm font-semibold transition ${
              tab === "generate" ? "bg-cyan-700 text-white" : "bg-slate-800 text-slate-300"
            }`}
          >
            {t("pos.voucher.generateTab")}
          </button>
          {/* Adding stock and its shelf label lives here because this is the
              screen somebody is already on when a delivery lands mid-shift. */}
          <button
            type="button"
            onClick={() => setTab("product")}
            className={`px-4 py-2 text-sm font-semibold transition ${
              tab === "product" ? "bg-cyan-700 text-white" : "bg-slate-800 text-slate-300"
            }`}
          >
            {t("pos.newProduct.tab", "Add Product")}
          </button>
        </div>
      )}

      {tab === "apply" || !canGenerate ? (
        <div className="space-y-4">
          {applied ? (
            <div className="flex items-center justify-between border border-emerald-700 bg-emerald-900/20 px-4 py-3">
              <div>
                <p className="font-mono text-lg font-bold text-emerald-400">{applied.code}</p>
                <p className="text-sm text-slate-400">
                  {t("pos.voucher.worth", { amount: currency(applied.amount) })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onRemove();
                  onClose();
                }}
                className="bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700"
              >
                {t("pos.voucher.remove")}
              </button>
            </div>
          ) : (
            <form onSubmit={applyCode} className="space-y-3">
              <div>
                <label className={label}>{t("pos.voucher.code")}</label>
                <input
                  autoFocus
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder={t("pos.voucher.codePlaceholder")}
                  className={`${field} font-mono uppercase`}
                />
              </div>
              <p className="text-xs text-slate-500">
                {t("pos.voucher.againstSubtotal", { amount: currency(subtotal) })}
              </p>
              <button
                type="submit"
                disabled={busy}
                className="w-full bg-cyan-700 py-2.5 font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-50"
              >
                {busy ? t("pos.processing") : t("pos.voucher.apply")}
              </button>
            </form>
          )}
        </div>
      ) : tab === "product" ? (
        made ? (
          /* The product exists. What the person who added it wants next is the
             label to put on the shelf, so that is the screen — not an empty
             form and a toast that has already gone. */
          <div className="space-y-4">
            <div className="border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                {t("pos.newProduct.added", "Product Added")}
              </p>
              <p className="text-lg font-bold text-slate-100">{made.name}</p>
              <p className="font-mono text-xs text-slate-400">{made.barcode}</p>
            </div>

            {/* One label at the size it prints, so nobody discovers the symbol
                is unreadable after running off a sheet of forty. */}
            <div className="mx-auto w-fit bg-white px-3 py-2">
              <div style={{ width: "36mm", textAlign: "center" }}>
                <BarcodeLabel code={made.barcode} price={made.Price} symbol={symbol} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold uppercase text-slate-400">
                {t("pos.newProduct.labels", "Labels")}
              </label>
              <input
                inputMode="numeric"
                value={labels}
                onChange={(event) => setLabels(sanitizeInteger(event.target.value))}
                className="w-20 border border-slate-700 bg-slate-950 px-2 py-1.5 text-center text-slate-100 outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={printLabels}
                className="ms-auto flex items-center gap-2 bg-cyan-700 px-4 py-2 text-sm font-bold uppercase text-white hover:bg-cyan-600"
              >
                <FiPrinter className="h-4 w-4" />
                {t("pos.newProduct.print", "Print Labels")}
              </button>
              <button
                type="button"
                onClick={() => setMade(null)}
                className="bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700"
              >
                {t("pos.newProduct.another", "Add Another")}
              </button>
            </div>

            {/* The sheet, hidden until it prints. */}
            <div id="barcode-sheet" className="hidden">
              <div className="bc-grid">
                {Array.from({
                  length: Math.max(1, Math.min(200, Number(labels) || 1)),
                }).map((_, index) => (
                  <BarcodeLabel
                    key={index}
                    code={made.barcode}
                    price={made.Price}
                    symbol={symbol}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={createProduct} className="space-y-3">
            <div>
              <label className={label}>{t("pos.newProduct.name", "Product Name")}</label>
              <input
                autoFocus
                value={product.name}
                onChange={setProductField("name")}
                placeholder={t("products.namePlaceholder")}
                className={field}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>{t("pos.newProduct.price", "Selling Price")}</label>
                <input
                  inputMode="decimal"
                  value={product.Price}
                  onChange={(event) =>
                    setProduct((current) => ({
                      ...current,
                      Price: sanitizeDecimal(event.target.value),
                    }))
                  }
                  placeholder="0.0"
                  className={field}
                />
              </div>
              <div>
                <label className={label}>{t("pos.newProduct.cost", "Cost Price")}</label>
                <input
                  inputMode="decimal"
                  value={product.costPrice}
                  onChange={(event) =>
                    setProduct((current) => ({
                      ...current,
                      costPrice: sanitizeDecimal(event.target.value),
                    }))
                  }
                  placeholder="0.0"
                  className={field}
                />
                {/* Not required, but the reports say so if it is missing: with
                    no cost there is no profit figure to report. */}
                <p className="mt-1 text-[11px] text-slate-500">
                  {t("pos.newProduct.costHint", "Without it, profit cannot be reported")}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>{t("pos.newProduct.category", "Category")}</label>
                <select
                  value={product.Category}
                  onChange={setProductField("Category")}
                  className={field}
                >
                  <option value="">{t("pos.uncategorized")}</option>
                  {categories.map((category) => (
                    <option key={category._id} value={category._id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>{t("pos.newProduct.stock", "Opening Stock")}</label>
                <input
                  inputMode="numeric"
                  value={product.quantity}
                  onChange={(event) =>
                    setProduct((current) => ({
                      ...current,
                      quantity: sanitizeInteger(event.target.value),
                    }))
                  }
                  placeholder="0.0"
                  className={field}
                />
              </div>
            </div>

            <div>
              <label className={label}>{t("pos.newProduct.barcode", "Barcode")}</label>
              <div className="flex gap-2">
                <input
                  value={product.barcode}
                  onChange={setProductField("barcode")}
                  placeholder={t("pos.newProduct.barcodePlaceholder", "Scan it, or generate one")}
                  className={`${field} font-mono`}
                />
                <button
                  type="button"
                  onClick={() =>
                    setProduct((current) => ({ ...current, barcode: newInStoreBarcode() }))
                  }
                  className="shrink-0 bg-slate-800 px-4 text-sm font-bold uppercase text-slate-200 transition hover:bg-slate-700"
                >
                  {t("pos.newProduct.generate", "Generate")}
                </button>
              </div>
              {/* Scanning the supplier's own barcode is better than inventing
                  one — it is already on the box. Generate is for loose stock
                  and own-brand items that carry none. */}
              <p className="mt-1 text-[11px] text-slate-500">
                {t(
                  "pos.newProduct.barcodeHint",
                  "Scan the one on the box if it has one. Generated codes use the in-store range, so they never clash with a real product.",
                )}
              </p>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-cyan-700 py-2.5 font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-50"
            >
              {busy ? t("pos.processing") : t("pos.newProduct.submit", "Add Product")}
            </button>
          </form>
        )
      ) : (
        <form onSubmit={generate} className="space-y-3">
          <div>
            <label className={label}>{t("pos.voucher.code")}</label>
            <input
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
              placeholder="SAVE10"
              className={`${field} font-mono uppercase`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>{t("pos.voucher.type")}</label>
              <select
                value={form.type}
                onChange={(event) => setForm({ ...form, type: event.target.value })}
                className={field}
              >
                <option value="amount">{t("pos.voucher.typeAmount")}</option>
                <option value="percent">{t("pos.voucher.typePercent")}</option>
              </select>
            </div>
            <div>
              <label className={label}>
                {form.type === "percent" ? t("pos.voucher.percentValue") : t("pos.voucher.amountValue")}
              </label>
              <input
                type="text"
                inputMode="decimal"
                data-keyboard="numeric"
                value={form.value}
                onChange={(event) =>
                  setForm({ ...form, value: sanitizeDecimal(event.target.value) })
                }
                className={field}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>{t("pos.voucher.minSpend")}</label>
              <input
                type="text"
                inputMode="decimal"
                data-keyboard="numeric"
                value={form.minSpend}
                onChange={(event) =>
                  setForm({ ...form, minSpend: sanitizeDecimal(event.target.value) })
                }
                className={field}
              />
            </div>
            <div>
              <label className={label}>{t("pos.voucher.usageLimit")}</label>
              <input
                type="text"
                inputMode="numeric"
                data-keyboard="numeric"
                value={form.usageLimit}
                onChange={(event) =>
                  setForm({ ...form, usageLimit: sanitizeInteger(event.target.value) })
                }
                className={field}
              />
            </div>
            <div>
              <label className={label}>{t("pos.voucher.expires")}</label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
                className={field}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-emerald-700 py-2.5 font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
          >
            {busy ? t("pos.processing") : t("pos.voucher.generate")}
          </button>
        </form>
      )}
    </PosModal>
  );
}

export default VoucherModal;
