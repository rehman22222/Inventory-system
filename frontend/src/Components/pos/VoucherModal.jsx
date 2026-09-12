import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import axiosInstance from "../../lib/axios";
import { cacheGet, isVoucherSpentOffline } from "../../lib/offlineDb";
import { isNetworkError } from "../../lib/offlineQueue";
import { FiMinus, FiPlus, FiPrinter } from "react-icons/fi";
import PosModal from "./PosModal";
import BarcodeLabel, { SHELF_LABEL_MM } from "../BarcodeLabel";
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
  products = [],
  symbol = "€",
  onApply,
  onRemove,
  discount = 0,
  discountType = "amount",
  onApplyDiscount,
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
    Category: "",
    quantity: "",
    barcode: "",
    // The two lines the shop writes on the ticket itself. Both optional; an
    // empty one prints nothing at all rather than a blank line.
    header: "",
    footer: "",
  });
  const [made, setMade] = useState(null);
  /* The product this label is FOR, when it is an existing one.
   *
   * A shelf label is usually wanted for something the shop already sells — a
   * ticket got wet, a price changed, the rail was rearranged. This screen
   * could only ever create a NEW product, so printing a replacement meant
   * either typing a duplicate into the catalogue or not using it at all.
   *
   * Empty means the old behaviour exactly: a new product, written on Print. */
  const [linked, setLinked] = useState(null);
  const [productSearch, setProductSearch] = useState("");
  // The barcode of the product this screen actually created. Nothing is written
  // until Print, and a second Print is another sheet of the same sticker rather
  // than a second product — so what was saved is remembered by its code, not by
  // a flag that a trip back to the form would reset.
  const [savedBarcode, setSavedBarcode] = useState(null);
  // How many tickets to print. One, always — a shelf edge takes a single label
  // whether four units came in or four hundred, and the steppers beside the box
  // count up for the times a strip is wanted. It used to open at the quantity
  // received, which offered forty stickers for one price change.
  const [labels, setLabels] = useState(1);

  // Hand-typed money off this basket, folded in from what used to be its own
  // rail button.
  const [discountValue, setDiscountValue] = useState(String(discount || ""));
  const [discountKind, setDiscountKind] = useState(discountType);
  const discountPreview =
    discountKind === "percent"
      ? (subtotal * Number(discountValue || 0)) / 100
      : Number(discountValue || 0);

  const setProductField = (key) => (event) =>
    setProduct((current) => ({ ...current, [key]: event.target.value }));

  // Generate checks the form and shows the sticker. It writes NOTHING: the
  // product is created by Print, so a cashier who looks at a preview and backs
  // out has put nothing in the catalogue, and the form they come back to still
  // holds everything they typed.
  const reviewProduct = (event) => {
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

    setMade({
      name: product.name.trim(),
      barcode: product.barcode.trim(),
      Price: Number(product.Price),
      header: product.header.trim(),
      footer: product.footer.trim(),
    });
    // One sticker. A shelf edge takes a single label however many units came in,
    // and a cashier who wants a strip can count up with the steppers.
    setLabels(1);
  };

  /* Print a label for something the shop already sells.
   *
   * Fills the form from the catalogue rather than asking the shop to retype
   * it — a retyped price is a price that can disagree with the till, and the
   * whole point of the ticket is that it matches. The header and footer are
   * left alone: they are the shop's words for this ticket, not the product's.
   */
  /* What the search box is offering.
   *
   * Capped at eight. A list that fills the dialog is not a shortlist, and a
   * cashier looking for one product will type another letter sooner than
   * scroll. Only searched once there are two characters, so an empty box does
   * not drop the whole catalogue under the field.
   */
  const matchingProducts = useMemo(() => {
    const needle = productSearch.trim().toLowerCase();
    if (needle.length < 2) return [];

    return (Array.isArray(products) ? products : [])
      .filter((entry) => {
        const name = String(entry?.name || "").toLowerCase();
        const barcode = String(entry?.barcode || "").toLowerCase();
        return name.includes(needle) || barcode.includes(needle);
      })
      .slice(0, 8);
  }, [products, productSearch]);

  const linkProduct = (found) => {
    if (!found) return;
    setLinked(found);
    setProductSearch("");
    setProduct((current) => ({
      ...current,
      name: found.name || "",
      Price: String(found.Price ?? ""),
      barcode: String(found.barcode || ""),
      // Stock is not being added; this is a ticket, not a delivery.
      quantity: "",
    }));
  };

  const unlinkProduct = () => {
    setLinked(null);
    setProduct((current) => ({ ...current, name: "", Price: "", barcode: "" }));
  };

  // Write the product. This is the moment the catalogue changes, and it happens
  // on Print rather than on Generate.
  const saveProduct = async () => {
    const payload = new FormData();
    payload.append("name", product.name.trim());
    payload.append("Price", product.Price);
    if (product.Category) payload.append("Category", product.Category);
    payload.append("quantity", product.quantity || "0");
    payload.append("barcode", product.barcode.trim());

    // The till's own create path, open to every cashier — the same one the
    // unknown-barcode screen uses, so a product added here is identical to one
    // learned at the scanner.
    await axiosInstance.post("product/quick-add", payload);
    toast.success(t("pos.newProduct.created", { name: product.name.trim() }));
    setSavedBarcode(product.barcode.trim());
    onProductAdded?.();
  };

  // Printed exactly the way a receipt is printed.
  //
  // No @page of its own. A sticker-sized page (40x30mm) is a size most drivers
  // do not have, and one that cannot honour it quietly falls back to its
  // default sheet — which is how a small ticket ended up adrift in the middle
  // of an A4 page with the browser's own header above it.
  //
  // The till's roll printer already prints receipts correctly under the app's
  // own @page, so the ticket goes out under the same one and the roll feeds and
  // cuts as it always does. What makes it a LABEL rather than a receipt is the
  // width of the ticket itself — see SHELF_LABEL_MM — not the page.
  const saveAndPrint = async () => {
    if (busy) return;

    /* Nothing to write when the label is for a product that already exists.
     *
     * This is the difference between a replacement ticket and a new line in
     * the catalogue. Without it, reprinting a label for something the shop
     * already sells would add a second copy of it — and the shop would find
     * out from a stock count. */
    if (!linked && savedBarcode !== made?.barcode) {
      setBusy(true);
      try {
        await saveProduct();
      } catch (error) {
        toast.error(
          error.response?.data?.message || t("pos.newProduct.failed", "Could not add it"),
        );
        // No sticker for a product the catalogue does not have: it would go on
        // a shelf carrying a code nothing scans.
        return;
      } finally {
        setBusy(false);
      }
    }

    printLabels();
  };

  /* Printed on the till's roll, with no margin of its own.
   *
   * The app's default print page is the 80mm receipt roll with a 4mm margin,
   * and that margin is where the browser draws ITS OWN header and footer — the
   * date, the page title and "1/1". On a receipt nobody minds. On a shelf
   * ticket the shop is left peeling a sticker that says "9/9/26, 10:51 AM" and
   * "Sign in — E360" above the price.
   *
   * Setting the margin to zero for this print alone is what removes them: with
   * no margin there is nowhere for the browser to put them. The rule is
   * appended last so it wins the cascade, and taken away again afterwards so
   * receipts keep the margin they need — a thermal head cannot print to the
   * very edge of the paper.
   *
   * The height stays `auto`: the roll should feed the ticket and stop, not a
   * whole page. If a long blank strip still comes out, that is the printer
   * driver's own paper length and is set there, not here.
   */
  const printLabels = () => {
    const style = document.createElement("style");
    style.textContent = "@page { size: 80mm auto; margin: 0; }";
    document.head.appendChild(style);

    const cleanup = () => {
      style.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);

    printSlip("barcode-sheet");
  };

  const field =
    "w-full border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500";
  const label = "mb-1 block text-xs uppercase text-slate-400";

  return (
    <PosModal
      title={t("pos.voucher.title")}
      // The sticker screen is a step further in, so it gets the arrow back to
      // the form — which still holds everything typed, because Generate only
      // previewed. Backing out of a preview leaves no trace anywhere.
      onBack={made ? () => setMade(null) : undefined}
      onClose={onClose}
      width="max-w-xl"
    >
      <div
        className={`mb-4 grid gap-2 ${canGenerate ? "grid-cols-4" : "grid-cols-2"}`}
      >
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
            onClick={() => setTab("discount")}
            className={`px-3 py-2 text-sm font-semibold transition ${
              tab === "discount" ? "bg-cyan-700 text-white" : "bg-slate-800 text-slate-300"
            }`}
          >
            {t("pos.rail.discount")}
          </button>
          {/* Cutting a voucher and adding stock are the owner side's; applying
              a code and taking money off this basket are anybody's. */}
          {canGenerate && (
            <>
              <button
                type="button"
                onClick={() => setTab("generate")}
                className={`px-4 py-2 text-sm font-semibold transition ${
                  tab === "generate" ? "bg-cyan-700 text-white" : "bg-slate-800 text-slate-300"
                }`}
              >
                {t("pos.voucher.generateTab")}
              </button>
              {/* Adding stock and its shelf label lives here because this is
                  the screen somebody is already on when a delivery lands
                  mid-shift. */}
              <button
                type="button"
                onClick={() => setTab("product")}
                className={`px-4 py-2 text-sm font-semibold transition ${
                  tab === "product" ? "bg-cyan-700 text-white" : "bg-slate-800 text-slate-300"
                }`}
              >
                {t("pos.newProduct.tab", "Add Product")}
              </button>
            </>
          )}
        </div>

      {tab === "apply" ? (
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
      ) : tab === "discount" ? (
        /* Taking money off this basket by hand. It lives beside the vouchers
           because they are the same decision from the cashier's side — "make
           this cheaper" — and having them on two rail buttons meant learning
           which one to reach for. */
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            {t("pos.voucher.againstSubtotal", { amount: currency(subtotal) })}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDiscountKind("amount")}
              className={`py-2 text-sm font-semibold transition ${
                discountKind === "amount"
                  ? "bg-cyan-700 text-white"
                  : "bg-slate-800 text-slate-300"
              }`}
            >
              {t("pos.voucher.typeAmount")}
            </button>
            <button
              type="button"
              onClick={() => setDiscountKind("percent")}
              className={`py-2 text-sm font-semibold transition ${
                discountKind === "percent"
                  ? "bg-cyan-700 text-white"
                  : "bg-slate-800 text-slate-300"
              }`}
            >
              {t("pos.voucher.typePercent")}
            </button>
          </div>

          <input
            autoFocus
            type="text"
            inputMode="decimal"
            data-keyboard="numeric"
            value={discountValue}
            onChange={(event) => setDiscountValue(sanitizeDecimal(event.target.value))}
            className="w-full border border-slate-700 bg-slate-950 px-3 py-3 text-center font-mono text-2xl text-slate-100 outline-none focus:border-cyan-500"
          />

          <p className="text-center text-sm text-slate-400">
            {t("pos.discountModal.preview")}:{" "}
            <span className="font-semibold text-slate-100">
              {currency(Math.min(discountPreview, subtotal))}
            </span>
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onApplyDiscount?.(0, "amount");
                onClose();
              }}
              className="bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700"
            >
              {t("pos.discountModal.clear")}
            </button>
            <button
              type="button"
              onClick={() => {
                onApplyDiscount?.(Number(discountValue || 0), discountKind);
                onClose();
              }}
              className="ms-auto bg-cyan-700 px-5 py-2 text-sm font-bold uppercase text-white hover:bg-cyan-600"
            >
              {t("pos.discountModal.apply")}
            </button>
          </div>
        </div>
      ) : tab === "product" ? (
        made ? (
          /* The sticker, before it is anything else. Nothing has been written
             yet — Print does that — so the banner says which of the two states
             this is rather than claiming a product that does not exist. */
          <div className="space-y-4">
            <div
              className={`border px-3 py-2 text-center ${
                savedBarcode === made.barcode
                  ? "border-emerald-800 bg-emerald-950/30"
                  : "border-slate-700 bg-slate-950"
              }`}
            >
              <p
                className={`text-xs font-semibold uppercase tracking-wide ${
                  savedBarcode === made.barcode ? "text-emerald-300" : "text-slate-400"
                }`}
              >
                {savedBarcode === made.barcode
                  ? t("pos.newProduct.added", "Product Added")
                  : t("pos.newProduct.savesOnPrint", "Saves when you print")}
              </p>
              <p className="text-lg font-bold text-slate-100">{made.name}</p>
              <p className="font-mono text-xs text-slate-400">{made.barcode}</p>
            </div>

            {/* One ticket, from the same constant the page and the stylesheet
                use — so nobody discovers the symbol is unreadable after running
                off a roll of them.

                Shown at TWICE its printed size, and it says so below. At 40mm
                the ticket is honest but too small to read across a counter,
                and the header and footer are what the shop is here to check.

                `zoom` rather than `transform: scale`, because zoom takes part
                in layout: a scaled ticket would keep its 40mm box and overlap
                whatever sat under it. Everything inside grows together, so the
                proportions stay exactly what the roll will print — a preview
                that flattered the label would be worse than none. */}
            <div className="mx-auto w-fit bg-white px-3 py-2">
              <div style={{ width: `${SHELF_LABEL_MM.width}mm`, zoom: 2 }}>
                <BarcodeLabel
                  variant="shelf"
                  code={made.barcode}
                  price={made.Price}
                  name={made.name}
                  header={made.header}
                  footer={made.footer}
                  symbol={symbol}
                />
              </div>
            </div>
            <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-wide text-slate-500">
              {t("pos.newProduct.previewScale", "Shown at twice actual size")}
            </p>

            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold uppercase text-slate-400">
                {t("pos.newProduct.labels", "Labels")}
              </label>
              {/* Counted up and down rather than typed. A strip of tickets is
                  one, two, three — a number of presses, not a number to key
                  in — and the box still takes a figure for the rare forty. */}
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => setLabels((n) => Math.max(1, (Number(n) || 1) - 1))}
                  disabled={(Number(labels) || 1) <= 1}
                  className="bg-slate-800 p-2 text-slate-300 transition hover:bg-slate-700 active:scale-90 disabled:opacity-30"
                  aria-label={t("pos.table.decrease")}
                >
                  <FiMinus className="h-3.5 w-3.5" />
                </button>
                <input
                  inputMode="numeric"
                  value={labels}
                  onChange={(event) => setLabels(sanitizeInteger(event.target.value))}
                  // An empty or zero box on the way out of the field becomes
                  // one, so Print never runs off a sheet of nothing.
                  onBlur={() =>
                    setLabels(Math.max(1, Math.min(200, Number(labels) || 1)))
                  }
                  className="w-14 border-y border-slate-700 bg-slate-950 px-2 py-1.5 text-center text-slate-100 outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={() => setLabels((n) => Math.min(200, (Number(n) || 1) + 1))}
                  disabled={(Number(labels) || 1) >= 200}
                  className="bg-slate-800 p-2 text-slate-300 transition hover:bg-slate-700 active:scale-90 disabled:opacity-30"
                  aria-label={t("pos.table.increase")}
                >
                  <FiPlus className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={saveAndPrint}
                className="ms-auto flex items-center gap-2 bg-cyan-700 px-4 py-2 text-sm font-bold uppercase text-white hover:bg-cyan-600"
              >
                <FiPrinter className="h-4 w-4" />
                {t("pos.newProduct.print", "Print Labels")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMade(null);
                  setSavedBarcode(null);
                  setProduct({
                    name: "",
                    Price: "",
                    Category: "",
                    quantity: "",
                    barcode: "",
                    header: "",
                    footer: "",
                  });
                }}
                className="bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700"
              >
                {t("pos.newProduct.another", "Add Another")}
              </button>
            </div>

            {/* The sheet, hidden until it prints. */}
            <div id="barcode-sheet" className="hidden">
              <div className="bc-grid bc-grid-shelf">
                {Array.from({
                  length: Math.max(1, Math.min(200, Number(labels) || 1)),
                }).map((_, index) => (
                  <BarcodeLabel
                    key={index}
                    variant="shelf"
                    code={made.barcode}
                    price={made.Price}
                    name={made.name}
                    header={made.header}
                    footer={made.footer}
                    symbol={symbol}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={reviewProduct} className="mx-auto max-w-md space-y-3">
            {/* Print a ticket for something the shop already sells.

                First, because it is the commoner errand: a ticket got wet, a
                price changed, the rail was rearranged. Leaving it empty is
                the old behaviour exactly — a new product, written on Print. */}
            <div>
              <label className={label}>
                {t("pos.newProduct.existing", "Existing product (optional)")}
              </label>
              {linked ? (
                <div className="flex items-center justify-between gap-2 rounded-md bg-slate-800 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-100">
                      {linked.name}
                    </div>
                    <div className="font-mono text-[11px] text-slate-400">
                      {linked.barcode}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={unlinkProduct}
                    className="shrink-0 text-xs font-semibold text-slate-300 hover:text-white"
                  >
                    {t("common.remove", "Remove")}
                  </button>
                </div>
              ) : (
                <>
                  <input
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder={t(
                      "pos.newProduct.existingHint",
                      "Search by name or barcode",
                    )}
                    className={field}
                  />
                  {matchingProducts.length > 0 && (
                    <div className="mt-1 max-h-40 overflow-y-auto rounded-md bg-slate-800">
                      {matchingProducts.map((found) => (
                        <button
                          key={found._id || found.barcode}
                          type="button"
                          onClick={() => linkProduct(found)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-700"
                        >
                          <span className="min-w-0 truncate text-sm text-slate-100">
                            {found.name}
                          </span>
                          <span className="shrink-0 font-mono text-[11px] text-slate-400">
                            {found.barcode}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div>
              <label className={label}>{t("pos.newProduct.name", "Inventory Name")}</label>
              <input
                autoFocus
                value={product.name}
                onChange={setProductField("name")}
                placeholder={t("products.namePlaceholder")}
                className={field}
              />
            </div>

            {/* What the shop writes on the ticket itself, above the price and
                under the symbol. Both optional: leave one empty and that line
                is not printed at all, so a ticket that ignores them is the
                ticket this printed before they existed. */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>
                  {t("pos.newProduct.header", "Header")}
                </label>
                <input
                  value={product.header}
                  onChange={setProductField("header")}
                  placeholder={t("pos.newProduct.headerHint", "Defaults to the product name")}
                  className={field}
                />
              </div>
              <div>
                <label className={label}>
                  {t("pos.newProduct.footer", "Footer")}
                </label>
                <input
                  value={product.footer}
                  onChange={setProductField("footer")}
                  placeholder={t("pos.newProduct.footerHint", "e.g. 2 for 5")}
                  className={field}
                />
              </div>
            </div>

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
                  placeholder={t("pos.newProduct.barcodePlaceholder", "Scan, type or generate")}
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
                placeholder="0.0"
                className={field}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>{t("pos.voucher.minSpendLabel")}</label>
              <input
                type="text"
                inputMode="decimal"
                data-keyboard="numeric"
                value={form.minSpend}
                onChange={(event) =>
                  setForm({ ...form, minSpend: sanitizeDecimal(event.target.value) })
                }
                placeholder="0.0"
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
                placeholder="0"
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
