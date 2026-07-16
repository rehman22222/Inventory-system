import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import axiosInstance from "../../lib/axios";
import PosModal from "./PosModal";
import { currency } from "./posUtils";

// The imported catalogue has PLU codes but no barcodes, so most first scans of a
// product will miss. Instead of a dead-end toast, let the cashier resolve it on
// the spot — either by attaching the scanned code to a product that already
// exists, or by creating the product there and then. Either way the barcode is
// learned and the next scan of that item goes straight into the cart.
function UnknownBarcodeModal({ barcode, products, categories, onResolved, onClose }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState("link"); // "link" | "create"
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    name: "",
    Price: "",
    Category: "",
    quantity: "1",
  });

  const matches = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return [];
    return products
      .filter(
        (product) =>
          product.name?.toLowerCase().includes(value) ||
          product.Desciption?.toLowerCase().includes(value)
      )
      .slice(0, 30);
  }, [products, query]);

  const linkToProduct = async (product) => {
    setBusy(true);
    try {
      const response = await axiosInstance.put(`product/${product._id}/barcode`, { barcode });
      toast.success(t("pos.unknownBarcode.linked", { name: product.name }));
      onResolved(response.data.product);
    } catch (error) {
      toast.error(error.response?.data?.message || t("pos.unknownBarcode.linkFailed"));
    } finally {
      setBusy(false);
    }
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
    >
      <div className="mb-4 grid grid-cols-2 gap-2">
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

          <div className="max-h-72 space-y-1 overflow-y-auto">
            {query.trim() && matches.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">
                {t("pos.unknownBarcode.noMatches")}
              </p>
            )}

            {matches.map((product) => (
              <button
                key={product._id}
                type="button"
                disabled={busy}
                onClick={() => linkToProduct(product)}
                className="flex w-full items-center justify-between gap-3 border border-slate-800 bg-slate-950 px-3 py-2 text-start transition hover:border-cyan-600 hover:bg-slate-800 disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{product.name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {product.Category?.name || t("pos.uncategorized")}
                    {product.barcode ? ` · ${product.barcode}` : ""}
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
        <form onSubmit={createProduct} className="space-y-3">
          <div>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs uppercase text-slate-400">
                {t("pos.unknownBarcode.price")}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.Price}
                onChange={(event) => setForm({ ...form, Price: event.target.value })}
                className="w-full border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase text-slate-400">
                {t("pos.unknownBarcode.openingStock")}
              </label>
              <input
                type="number"
                min="0"
                value={form.quantity}
                onChange={(event) => setForm({ ...form, quantity: event.target.value })}
                className="w-full border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase text-slate-400">
              {t("pos.unknownBarcode.category")}
            </label>
            <select
              value={form.Category}
              onChange={(event) => setForm({ ...form, Category: event.target.value })}
              className="w-full border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
            >
              <option value="">{t("pos.unknownBarcode.selectCategory")}</option>
              {categories.map((category) => (
                <option key={category._id} value={category._id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="border border-slate-800 bg-slate-950 px-3 py-2 text-sm">
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
