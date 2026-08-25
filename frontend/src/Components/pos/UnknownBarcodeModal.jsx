import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import axiosInstance from "../../lib/axios";
import PosModal from "./PosModal";
import { currency, MISC_CATEGORY, sanitizeDecimal, sanitizeInteger } from "./posUtils";

// The imported catalogue has PLU codes but no barcodes, so most first scans of a
// product will miss. Instead of a dead-end toast, let the cashier resolve it on
// the spot — either by attaching the scanned code to a product that already
// exists, or by creating the product there and then. Either way the barcode is
// learned and the next scan of that item goes straight into the cart.
function UnknownBarcodeModal({ barcode, categories, onResolved, onClose }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState("link"); // "link" | "create"
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  // Which pool to offer. The till's own catalogue is barcoded by definition —
  // exactly the products this dialog can never be about — so the candidates are
  // fetched rather than taken from the grid behind it.
  const [scope, setScope] = useState("needs"); // "needs" | "online" | "all"
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: "",
    Price: "",
    // Default to the "Miscellaneous" catch-all so a cashier who doesn't know the
    // category can still add the product; they can pick a real one if they do.
    Category: "miscellaneous",
    quantity: "1",
  });

  useEffect(() => {
    if (mode !== "link") return undefined;
    let cancelled = false;
    const params = { view: "link" };
    if (scope === "needs") params.needsBarcode = "1";
    if (scope === "online") {
      params.needsBarcode = "1";
      params.channel = "online";
    }

    setLoading(true);
    axiosInstance
      .get("product/getproduct", { params })
      .then((response) => {
        if (!cancelled) setCandidates(response.data?.Products || []);
      })
      .catch(() => {
        // A failed lookup must not trap the cashier — "Create new" still works.
        if (!cancelled) setCandidates([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, scope]);

  // The whole pool is shown before anything is typed: a cashier holding a box
  // knows the product by sight, not by the words the catalogue happens to use.
  //
  // No fallback pool. An empty result means this filter genuinely holds nothing;
  // quietly showing a different set would invite linking the scanned code to a
  // product the cashier never asked to see.
  const matches = useMemo(() => {
    const value = query.trim().toLowerCase();
    const pool = candidates;
    const filtered = value
      ? pool.filter(
          (product) =>
            product.name?.toLowerCase().includes(value) ||
            product.Desciption?.toLowerCase().includes(value)
        )
      : pool;
    return filtered.slice(0, 60);
  }, [candidates, query]);

  // Linking is the moment the count becomes real — the box is in their hand —
  // so the figure is confirmed here rather than guessed at later.
  const [picked, setPicked] = useState(null);
  const [countedQty, setCountedQty] = useState("");

  const choose = (product) => {
    setPicked(product);
    setCountedQty(String(product.quantity ?? ""));
  };

  const linkToProduct = async (product, { replace = false } = {}) => {
    setBusy(true);
    try {
      const response = await axiosInstance.put(`product/${product._id}/barcode`, {
        barcode,
        quantity: countedQty,
        replace,
      });
      toast.success(t("pos.unknownBarcode.linked", { name: product.name }));
      onResolved(response.data.product);
    } catch (error) {
      // The product already carries a different code: never silently retire it.
      if (error.response?.status === 409 && error.response.data?.needsReplaceConfirmation) {
        const ok = window.confirm(
          `${product.name} ${t("pos.unknownBarcode.alreadyHas", "already has barcode")} ` +
            `${error.response.data.currentBarcode}.

` +
            t("pos.unknownBarcode.replaceAsk", "Replace it with the scanned one?"),
        );
        if (ok) {
          setBusy(false);
          return linkToProduct(product, { replace: true });
        }
        setBusy(false);
        return undefined;
      }
      toast.error(error.response?.data?.message || t("pos.unknownBarcode.linkFailed"));
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  const createProduct = async (event) => {
    event.preventDefault();

    // Only name and price are required now — category is optional.
    if (!form.name.trim() || !form.Price) {
      toast.error(t("pos.unknownBarcode.missingFields"));
      return;
    }

    setBusy(true);
    try {
      const payload = new FormData();
      payload.append("name", form.name.trim());
      if (form.Category) payload.append("Category", form.Category);
      payload.append("Price", form.Price);
      payload.append("quantity", form.quantity || "0");
      payload.append("barcode", barcode);

      // The till's own create path: open to every cashier, unlike the
      // catalogue's addproduct, which is restricted to the owner side.
      const response = await axiosInstance.post("product/quick-add", payload);
      toast.success(t("pos.unknownBarcode.created", { name: form.name.trim() }));
      onResolved(response.data.product);
    } catch (error) {
      toast.error(error.response?.data?.message || t("pos.unknownBarcode.createFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PosModal
      title={t("pos.unknownBarcode.title")}
      subtitle={t("pos.unknownBarcode.subtitle", { barcode })}
      onClose={onClose}
      width="max-w-3xl"
    >
      <div className="unknown-barcode-tabs mb-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("link")}
          className={`px-4 py-2 text-sm font-semibold transition ${
            mode === "link" ? "bg-cyan-700 text-white" : "bg-slate-800 text-slate-300"
          }`}
        >
          {t("pos.unknownBarcode.linkTab")}
        </button>
        <button
          type="button"
          onClick={() => setMode("create")}
          className={`px-4 py-2 text-sm font-semibold transition ${
            mode === "create" ? "bg-cyan-700 text-white" : "bg-slate-800 text-slate-300"
          }`}
        >
          {t("pos.unknownBarcode.createTab")}
        </button>
      </div>

      {mode === "link" ? (
        <div className="space-y-3">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("pos.unknownBarcode.searchPlaceholder")}
            className="w-full border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
          />

          <div className="flex flex-wrap gap-2">
            {[
              { key: "needs", label: t("pos.unknownBarcode.scopeNeeds", "Needs barcode") },
              { key: "online", label: t("pos.unknownBarcode.scopeOnline", "Online") },
              { key: "all", label: t("pos.unknownBarcode.scopeAll", "All products") },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setScope(option.key)}
                className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                  scope === option.key
                    ? "bg-cyan-700 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {picked && (
            <div className="border border-cyan-700 bg-slate-900 p-3">
              <p className="text-sm font-semibold text-slate-100">{picked.name}</p>
              <p className="mb-2 text-xs text-slate-400">
                {picked.barcode
                  ? `${t("pos.unknownBarcode.alreadyHas", "already has barcode")} ${picked.barcode}`
                  : t("pos.unknownBarcode.noBarcodeYet", "no barcode yet")}
              </p>
              <label className="mb-1 block text-xs uppercase text-slate-400">
                {t("pos.unknownBarcode.countNow", "How many on the shelf?")}
              </label>
              <div className="flex gap-2">
                <input
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  data-keyboard="numeric"
                  value={countedQty}
                  onChange={(event) => setCountedQty(sanitizeInteger(event.target.value))}
                  className="w-28 border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => linkToProduct(picked)}
                  className="bg-cyan-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {t("pos.unknownBarcode.linkTab")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPicked(null)}
                  className="bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300"
                >
                  {t("common.cancel", "Cancel")}
                </button>
              </div>
            </div>
          )}

          <div className="max-h-72 space-y-1 overflow-y-auto">
            {loading && (
              <p className="py-6 text-center text-sm text-slate-500">
                {t("common.loading", "Loading...")}
              </p>
            )}

            {!loading && matches.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">
                {t("pos.unknownBarcode.noMatches")}
              </p>
            )}

            {matches.map((product) => (
              <button
                key={product._id}
                type="button"
                disabled={busy}
                onClick={() => choose(product)}
                className="flex w-full items-center justify-between gap-3 border border-slate-800 bg-slate-950 px-3 py-2 text-start transition hover:border-cyan-600 hover:bg-slate-800 disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{product.name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {product.Category?.name || t("pos.uncategorized")}
                    {product.barcode ? ` · ${product.barcode}` : ""}
                    {product.stockCounted ? "" : ` · ${t("pos.unknownBarcode.webStock", "web stock")}`}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {currency(product.Price)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <form onSubmit={createProduct} className="unknown-barcode-form space-y-3">
          <div className="unknown-barcode-field unknown-barcode-name-field">
            <label className="mb-1 block text-xs uppercase text-slate-400">
              {t("pos.unknownBarcode.name")}
            </label>
            <input
              autoFocus
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="w-full border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
            />
          </div>

          <div className="unknown-barcode-inline-row grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs uppercase text-slate-400">
                {t("pos.unknownBarcode.price")}
              </label>
              <input
                type="text"
                inputMode="decimal"
                data-keyboard="numeric"
                value={form.Price}
                onChange={(event) =>
                  setForm({ ...form, Price: sanitizeDecimal(event.target.value) })
                }
                className="w-full border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase text-slate-400">
                {t("pos.unknownBarcode.openingStock")}
              </label>
              <input
                type="text"
                inputMode="numeric"
                data-keyboard="numeric"
                value={form.quantity}
                onChange={(event) =>
                  setForm({ ...form, quantity: sanitizeInteger(event.target.value) })
                }
                className="w-full border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="unknown-barcode-category-field">
            <label className="mb-1 block text-xs uppercase text-slate-400">
              {t("pos.unknownBarcode.category")}
            </label>
            <select
              value={form.Category}
              onChange={(event) => setForm({ ...form, Category: event.target.value })}
              className="w-full border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
            >
              {/* Always available, even before any product uses it — the server
                  files it under the permanent "Miscellaneous" category. */}
              <option value="miscellaneous">
                {t("pos.unknownBarcode.miscellaneous", MISC_CATEGORY)}
              </option>
              {categories
                .filter((category) => category.name !== MISC_CATEGORY)
                .map((category) => (
                  <option key={category._id} value={category._id}>
                    {category.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="unknown-barcode-summary border border-slate-800 bg-slate-950 px-3 py-2 text-sm">
            <span className="text-slate-400">{t("pos.unknownBarcode.barcodeLabel")}: </span>
            <span className="font-mono text-cyan-400">{barcode}</span>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-cyan-700 py-2.5 font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-50"
          >
            {busy ? t("pos.processing") : t("pos.unknownBarcode.createAndAdd")}
          </button>
        </form>
      )}
    </PosModal>
  );
}

export default UnknownBarcodeModal;
