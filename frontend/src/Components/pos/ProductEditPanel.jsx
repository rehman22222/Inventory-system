import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { FiImage, FiX } from "react-icons/fi";
import axiosInstance from "../../lib/axios";
import { EditProduct } from "../../features/productSlice";
import { sanitizeDecimal, sanitizeInteger } from "./posUtils";

// Edit a product without leaving the till.
//
// A manager standing at the counter finds the wrong price, a missing barcode or
// a stock count that is out — and having to walk to the back office for that is
// what this exists to avoid. Same fields as the Products page, so there is one
// mental model rather than two.
//
// The till's catalogue is fetched with a narrow projection and deliberately
// carries no cost price, so the whole record is loaded here for the one product
// being edited (GET /api/product/:id, restricted to admin/manager).

function ProductEditPanel({ product, categories, onSaved, onClose }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { store: SHOP } = useSelector((state) => state.store);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  // The cost the record already held. Kept so an untouched cost is never sent
  // back — see the submit handler for why that matters.
  const [originalCost, setOriginalCost] = useState("");
  const [costSource, setCostSource] = useState(null);

  const [form, setForm] = useState({
    name: "",
    Category: "",
    shelfLabel: "",
    Price: "",
    costPrice: "",
    quantity: "",
    lowStockThreshold: "",
    barcode: "",
    expiryDate: "",
    Desciption: "",
  });

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  // Load the full record. The row that opened this panel only has what the till
  // needs, which is not enough to edit without blanking the rest.
  useEffect(() => {
    let alive = true;

    const asDateInput = (value) => {
      if (!value) return "";
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
    };

    axiosInstance
      .get(`product/${product._id}`)
      .then((response) => {
        if (!alive) return;
        const full = response.data.product || {};
        const cost = full.costPrice === undefined || full.costPrice === null ? "" : String(full.costPrice);

        setOriginalCost(cost);
        setCostSource(full.costSource?.currency ? full.costSource : null);
        setForm({
          name: full.name || "",
          Category: full.Category?._id || full.Category || "",
          shelfLabel: full.shelfLabel || "",
          Price: full.Price === undefined || full.Price === null ? "" : String(full.Price),
          costPrice: cost,
          quantity: full.quantity === undefined || full.quantity === null ? "" : String(full.quantity),
          lowStockThreshold:
            full.lowStockThreshold === undefined || full.lowStockThreshold === null
              ? ""
              : String(full.lowStockThreshold),
          barcode: full.barcode || "",
          expiryDate: asDateInput(full.expiryDate),
          Desciption: full.Desciption || "",
        });
        setImagePreview(full.image?.url || "");
      })
      .catch((error) => {
        if (!alive) return;
        setLoadError(
          error.response?.data?.message ||
            t("pos.productEdit.loadFailed", { defaultValue: "Could not load this product." }),
        );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [product._id, t]);

  const pickImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error(
        t("pos.productEdit.imageOnly", { defaultValue: "Choose an image file." }),
      );
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  // Shelf label is optional, but when given the server only accepts letters,
  // numbers, spaces and dashes — check it here so the cashier is told before the
  // round trip rather than after.
  const shelfLabelValid =
    form.shelfLabel === "" || /^[A-Za-z0-9][A-Za-z0-9\- ]*$/.test(form.shelfLabel);

  const submit = (event) => {
    event.preventDefault();

    if (!form.name.trim()) {
      toast.error(t("pos.productEdit.nameRequired", { defaultValue: "Product name is required." }));
      return;
    }
    if (form.Price === "" || !(Number(form.Price) >= 0)) {
      toast.error(t("pos.productEdit.priceRequired", { defaultValue: "Enter a valid selling price." }));
      return;
    }
    if (!shelfLabelValid) {
      toast.error(
        t("pos.productEdit.shelfLabelInvalid", {
          defaultValue: "Shelf label must be letters and numbers only.",
        }),
      );
      return;
    }

    const payload = new FormData();
    payload.append("name", form.name.trim());
    payload.append("Price", form.Price);
    if (form.Category) payload.append("Category", form.Category);
    if (form.shelfLabel) payload.append("shelfLabel", form.shelfLabel.trim());
    if (form.quantity !== "") payload.append("quantity", form.quantity);
    if (form.lowStockThreshold !== "") payload.append("lowStockThreshold", form.lowStockThreshold);
    if (form.barcode) payload.append("barcode", form.barcode.trim());
    if (form.expiryDate) payload.append("expiryDate", form.expiryDate);
    if (form.Desciption) payload.append("Desciption", form.Desciption.trim());
    if (imageFile) payload.append("image", imageFile);

    // Only send the cost when it has actually been changed. The server re-reads
    // any cost it is given as being in the shop's own currency, which clears the
    // record of a foreign supplier invoice — so sending an untouched figure back
    // would quietly throw away the rate and note somebody entered off the paper.
    if (form.costPrice !== originalCost) {
      payload.append("costPrice", form.costPrice === "" ? "0" : form.costPrice);
    }

    setSaving(true);
    dispatch(EditProduct({ id: product._id, formData: payload }))
      .unwrap()
      .then(() => {
        toast.success(t("pos.productEdit.saved", { defaultValue: "Product updated." }));
        onSaved();
      })
      .catch((error) =>
        toast.error(
          error || t("pos.productEdit.saveFailed", { defaultValue: "Could not update the product." }),
        ),
      )
      .finally(() => setSaving(false));
  };

  const control =
    "w-full border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500";
  const label = "mb-1 block text-[11px] uppercase tracking-wide text-slate-400";

  if (loading) {
    return (
      <div className="grid place-items-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-500" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <p className="text-sm text-rose-300">{loadError}</p>
        <button
          type="button"
          onClick={onClose}
          className="border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
        >
          {t("pos.back", { defaultValue: "Back" })}
        </button>
      </div>
    );
  }

  // The modal body is the scroll container (see PosModal), so this is plain flow
  // rather than a second nested scroller — one scrollbar, and the fields cannot
  // end up clipped in the space left beside the on-screen keyboard.
  return (
    <form onSubmit={submit}>
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            {t("pos.productEdit.title", { defaultValue: "Edit product" })}
          </p>
          <p className="truncate text-sm font-semibold text-slate-100">{product.name}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center border border-slate-700 text-slate-300 hover:bg-slate-800"
          aria-label={t("pos.back", { defaultValue: "Back" })}
        >
          <FiX className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        {/* Image */}
        <div className="flex items-center gap-3">
          {imagePreview ? (
            <img
              src={imagePreview}
              alt={form.name}
              className="h-16 w-16 shrink-0 object-cover ring-1 ring-slate-700"
            />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center bg-slate-800 text-slate-600 ring-1 ring-slate-700">
              <FiImage className="h-5 w-5" />
            </span>
          )}
          <div>
            <span className={label}>
              {t("pos.productEdit.image", { defaultValue: "Product image" })}
            </span>
            <label className="inline-flex cursor-pointer items-center border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800">
              {t("pos.productEdit.upload", { defaultValue: "Upload" })}
              <input type="file" accept="image/*" onChange={pickImage} className="hidden" />
            </label>
          </div>
        </div>

        <div>
          <label className={label} htmlFor="pos-edit-name">
            {t("pos.productEdit.name", { defaultValue: "Name" })} *
          </label>
          <input
            id="pos-edit-name"
            value={form.name}
            onChange={(e) => set("name")(e.target.value)}
            className={control}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="pos-edit-category">
              {t("pos.productEdit.category", { defaultValue: "Category" })}
            </label>
            <select
              id="pos-edit-category"
              value={form.Category}
              onChange={(e) => set("Category")(e.target.value)}
              className={control}
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
            <label className={label} htmlFor="pos-edit-shelf">
              {t("pos.productEdit.shelfLabel", { defaultValue: "Shelf label" })}
            </label>
            <input
              id="pos-edit-shelf"
              value={form.shelfLabel}
              onChange={(e) => set("shelfLabel")(e.target.value)}
              placeholder="E.G. A12"
              className={`${control} ${shelfLabelValid ? "" : "border-rose-500"}`}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="pos-edit-price">
              {t("pos.productEdit.sellingPrice", { defaultValue: "Selling price" })} *
            </label>
            <input
              id="pos-edit-price"
              type="text"
              inputMode="decimal"
              data-keyboard="numeric"
              value={form.Price}
              onChange={(e) => set("Price")(sanitizeDecimal(e.target.value))}
              className={control}
            />
          </div>
          <div>
            <label className={label} htmlFor="pos-edit-cost">
              {t("pos.productEdit.costPrice", { defaultValue: "Cost price" })}
              <span className="ms-1 text-slate-500">({SHOP?.currency || "EUR"})</span>
            </label>
            <input
              id="pos-edit-cost"
              type="text"
              inputMode="decimal"
              data-keyboard="numeric"
              value={form.costPrice}
              onChange={(e) => set("costPrice")(sanitizeDecimal(e.target.value))}
              className={control}
            />
            {costSource && (
              <p className="mt-1 text-[11px] leading-4 text-amber-300/80">
                {t("pos.productEdit.costSourceHint", {
                  defaultValue:
                    "Recorded from a {{currency}} invoice at {{rate}}. Changing it here records the figure in {{shop}} instead.",
                  currency: costSource.currency,
                  rate: costSource.rate,
                  shop: SHOP?.currency || "EUR",
                })}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="pos-edit-qty">
              {t("pos.productEdit.quantity", { defaultValue: "Quantity" })}
            </label>
            <input
              id="pos-edit-qty"
              type="text"
              inputMode="numeric"
              data-keyboard="numeric"
              value={form.quantity}
              onChange={(e) => set("quantity")(sanitizeInteger(e.target.value))}
              className={control}
            />
          </div>
          <div>
            <label className={label} htmlFor="pos-edit-low">
              {t("pos.productEdit.lowStock", { defaultValue: "Low-stock threshold" })}
            </label>
            <input
              id="pos-edit-low"
              type="text"
              inputMode="numeric"
              data-keyboard="numeric"
              value={form.lowStockThreshold}
              onChange={(e) => set("lowStockThreshold")(sanitizeInteger(e.target.value))}
              className={control}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="pos-edit-barcode">
              {t("pos.productEdit.barcode", { defaultValue: "Barcode" })}
            </label>
            <input
              id="pos-edit-barcode"
              value={form.barcode}
              onChange={(e) => set("barcode")(e.target.value)}
              placeholder={t("pos.productEdit.barcodePlaceholder", {
                defaultValue: "Scan or enter barcode",
              })}
              className={control}
            />
          </div>
          <div>
            <label className={label} htmlFor="pos-edit-expiry">
              {t("pos.productEdit.expiry", { defaultValue: "Expiry date" })}
            </label>
            <input
              id="pos-edit-expiry"
              type="date"
              value={form.expiryDate}
              onChange={(e) => set("expiryDate")(e.target.value)}
              className={control}
            />
          </div>
        </div>

        <div>
          <label className={label} htmlFor="pos-edit-desc">
            {t("pos.productEdit.description", { defaultValue: "Description" })}
          </label>
          <textarea
            id="pos-edit-desc"
            rows={2}
            value={form.Desciption}
            onChange={(e) => set("Desciption")(e.target.value)}
            className={control}
          />
        </div>
      </div>

      {/* Pinned to the bottom of the scroll area: on a till the cashier should
          never have to hunt for Update, however long the form is. */}
      <div className="sticky bottom-0 -mx-1 mt-3 flex gap-2 border-t border-slate-800 bg-slate-900 px-1 pb-1 pt-3">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 border border-slate-700 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
        >
          {t("pos.cancel", { defaultValue: "Cancel" })}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-[2] bg-cyan-700 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-50"
        >
          {saving
            ? t("pos.processing")
            : t("pos.productEdit.save", { defaultValue: "Update product" })}
        </button>
      </div>
    </form>
  );
}

export default ProductEditPanel;
