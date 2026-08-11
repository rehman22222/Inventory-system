import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { FiPlus, FiTrash2, FiX, FiTag } from "react-icons/fi";
import toast from "react-hot-toast";
import {
  gettingallDeals,
  CreateDeal,
  UpdateDeal,
  RemoveDeal,
} from "../features/dealSlice";
import { gettingallCategory } from "../features/categorySlice";
import { RaiseRequest } from "../features/approvalSlice";

// Build and manage bundle deals: name the deal, pick the products that make it
// up, and set the discount. The POS detects the deal automatically when those
// products land in the basket together. Available to admin and manager.
function DealsModal({ onClose }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();

  const { getallproduct } = useSelector((state) => state.product);
  const { getallCategory } = useSelector((state) => state.category);
  const { deals, iscreating } = useSelector((state) => state.deal);
  const { Authuser } = useSelector((state) => state.auth);

  // Only the owner creates a deal outright; everyone else asks.
  const canCreateDirectly = Authuser?.role === "superadmin";

  const products = useMemo(
    () => (Array.isArray(getallproduct) ? getallproduct : []),
    [getallproduct]
  );

  const categories = useMemo(
    () => (Array.isArray(getallCategory) ? getallCategory : []),
    [getallCategory]
  );

  const [name, setName] = useState("");
  const [discount, setDiscount] = useState("");
  // "amount" = € off the bundle; "percent" = % off the deal's own products.
  const [discountType, setDiscountType] = useState("amount");
  const [picked, setPicked] = useState([]); // [{ productId, name, price, quantity }]
  const [query, setQuery] = useState("");
  // "" = all categories; otherwise a category _id to browse.
  const [categoryId, setCategoryId] = useState("");

  useEffect(() => {
    dispatch(gettingallDeals());
    dispatch(gettingallCategory());
  }, [dispatch]);

  // Browse by category and/or search text. With neither, show everything so the
  // whole catalogue is reachable without typing.
  const matches = useMemo(() => {
    const value = query.trim().toLowerCase();
    return products
      .filter((product) => {
        if (categoryId && String(product.Category?._id) !== String(categoryId)) return false;
        if (!value) return true;
        return (
          product.name?.toLowerCase().includes(value) ||
          product.barcode?.toLowerCase().includes(value)
        );
      })
      .slice(0, 100);
  }, [products, query, categoryId]);

  const pickedIds = useMemo(
    () => new Set(picked.map((entry) => entry.productId)),
    [picked]
  );

  const addProduct = (product) => {
    setPicked((current) => {
      const existing = current.find((entry) => entry.productId === product._id);
      if (existing) {
        return current.map((entry) =>
          entry.productId === product._id
            ? { ...entry, quantity: entry.quantity + 1 }
            : entry
        );
      }
      return [
        ...current,
        {
          productId: product._id,
          name: product.name,
          price: Number(product.Price || 0),
          quantity: 1,
        },
      ];
    });
  };

  const setQty = (productId, quantity) =>
    setPicked((current) =>
      current
        .map((entry) =>
          entry.productId === productId
            ? { ...entry, quantity: Math.max(0, Math.floor(quantity)) }
            : entry
        )
        .filter((entry) => entry.quantity > 0)
    );

  const removePicked = (productId) =>
    setPicked((current) => current.filter((entry) => entry.productId !== productId));

  const normalTotal = picked.reduce((sum, entry) => sum + entry.price * entry.quantity, 0);
  const pickedUnitCount = picked.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);

  const resetForm = () => {
    setName("");
    setDiscount("");
    setDiscountType("amount");
    setPicked([]);
    setQuery("");
  };

  // What the deal is actually worth against the picked products, so the form can
  // show the resulting price before it is saved.
  const savings =
    discountType === "percent"
      ? (normalTotal * Number(discount || 0)) / 100
      : Number(discount || 0);

  const submit = async (event) => {
    event.preventDefault();

    if (!name.trim()) {
      toast.error(t("deals.nameRequired"));
      return;
    }
    if (!Number(discount) || Number(discount) <= 0) {
      toast.error(t("deals.discountRequired"));
      return;
    }
    if (discountType === "percent" && Number(discount) > 100) {
      toast.error(t("deals.percentMax"));
      return;
    }
    if (pickedUnitCount < 2) {
      toast.error(t("deals.minProducts"));
      return;
    }

    const payload = {
      name: name.trim(),
      discount: Number(discount),
      discountType,
      items: picked.map((entry) => ({ product: entry.productId, quantity: entry.quantity })),
    };

    // A deal gives money away, so it is the owner's call. Everyone else sends it
    // for approval — approving is what creates it.
    if (!canCreateDirectly) {
      const asked = await dispatch(RaiseRequest({ type: "create_deal", payload }));

      if (asked.error) {
        toast.error(asked.payload || t("deals.requestFailed"));
        return;
      }

      toast.success(
        t("deals.requested", { ref: asked.payload?.request?.reference || "" })
      );
      resetForm();
      return;
    }

    const result = await dispatch(CreateDeal(payload));

    if (result.error) {
      toast.error(result.payload || t("deals.createFailed"));
      return;
    }

    toast.success(t("deals.created"));
    resetForm();
  };

  const toggleActive = (deal) =>
    dispatch(UpdateDeal({ dealId: deal._id, changes: { active: !deal.active } }));

  const removeDeal = (deal) => {
    if (!window.confirm(t("deals.confirmDelete", { name: deal.name }))) return;
    dispatch(RemoveDeal(deal._id))
      .unwrap()
      .then(() => toast.success(t("deals.deleted")))
      .catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-base-300 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-800 text-white">
              <FiTag className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">{t("deals.title")}</h2>
              <p className="mt-0.5 text-sm text-base-content/60">{t("deals.sub")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-base-content/50 hover:bg-base-200"
            aria-label={t("deals.close")}
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* Create form */}
          <form onSubmit={submit} className="space-y-4 rounded-xl border border-base-300 bg-base-200/40 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-base-content/60">
                  {t("deals.name")}
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("deals.namePlaceholder")}
                  className="h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-3"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-base-content/60">
                  {t("deals.discount")}
                </label>
                <div className="flex">
                  {/* Amount vs percent — a percent deal comes off the deal's own
                      products, not the whole basket. */}
                  <div className="flex shrink-0 overflow-hidden rounded-s-lg border-2 border-e-0 border-base-300">
                    {[
                      { key: "amount", label: "€" },
                      { key: "percent", label: "%" },
                    ].map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setDiscountType(option.key)}
                        className={`w-10 text-sm font-bold transition ${
                          discountType === option.key
                            ? "bg-blue-800 text-white"
                            : "bg-base-200 text-base-content/60 hover:bg-base-300"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min="0"
                    max={discountType === "percent" ? "100" : undefined}
                    step="0.01"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder={discountType === "percent" ? "10" : "3.00"}
                    className="h-10 w-full rounded-e-lg border-2 border-base-300 bg-base-100 px-3"
                  />
                </div>
                <p className="mt-1 text-xs text-base-content/50">
                  {discountType === "percent" ? t("deals.percentHint") : t("deals.amountHint")}
                </p>
              </div>
            </div>

            {/* Product picker — browse by category and/or search */}
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-base-content/60">
                {t("deals.products")}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="h-10 rounded-lg border-2 border-base-300 bg-base-100 px-2 sm:w-44"
                >
                  <option value="">{t("deals.allCategories")}</option>
                  {categories.map((category) => (
                    <option key={category._id} value={category._id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("deals.searchProducts")}
                  className="h-10 flex-1 rounded-lg border-2 border-base-300 bg-base-100 px-3"
                />
              </div>

              <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-base-300 bg-base-100">
                {matches.length === 0 ? (
                  <p className="py-6 text-center text-sm text-base-content/50">
                    {t("deals.noMatches")}
                  </p>
                ) : (
                  matches.map((product) => {
                    const added = pickedIds.has(product._id);
                    return (
                      <button
                        type="button"
                        key={product._id}
                        onClick={() => addProduct(product)}
                        className={`flex w-full items-center justify-between gap-2 border-b border-base-200 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-base-200 ${
                          added ? "bg-blue-50/60" : ""
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate">{product.name}</span>
                          {product.Category?.name && (
                            <span className="shrink-0 rounded bg-base-200 px-1.5 py-0.5 text-[10px] text-base-content/60">
                              {product.Category.name}
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-base-content/60">
                          <span className="tabular-nums">
                            ${Number(product.Price || 0).toFixed(2)}
                          </span>
                          <FiPlus className={`h-4 w-4 ${added ? "text-blue-700" : ""}`} />
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Picked list */}
            {picked.length > 0 && (
              <div className="space-y-2">
                {picked.map((entry) => (
                  <div
                    key={entry.productId}
                    className="flex items-center gap-2 rounded-lg border border-base-300 bg-base-100 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{entry.name}</span>
                    <span className="tabular-nums text-sm text-base-content/60">
                      ${entry.price.toFixed(2)}
                    </span>
                    <input
                      type="number"
                      min="1"
                      value={entry.quantity}
                      onChange={(e) => setQty(entry.productId, Number(e.target.value))}
                      className="h-8 w-16 rounded-md border-2 border-base-300 bg-base-100 px-2 text-center text-sm"
                      aria-label={t("deals.quantity")}
                    />
                    <button
                      type="button"
                      onClick={() => removePicked(entry.productId)}
                      className="rounded-md p-1.5 text-red-500 hover:bg-red-50"
                      aria-label={t("deals.remove")}
                    >
                      <FiTrash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}

                <div className="flex items-center justify-between px-1 text-sm">
                  <span className="text-base-content/60">
                    {t("deals.normalPrice")}: ${normalTotal.toFixed(2)}
                  </span>
                  {Number(discount) > 0 && (
                    <span className="font-semibold text-emerald-600">
                      {t("deals.dealPrice")}: ${Math.max(0, normalTotal - savings).toFixed(2)}
                      <span className="ms-1 font-normal text-base-content/50">
                        (−${Math.min(savings, normalTotal).toFixed(2)})
                      </span>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Say up front that this goes to the owner. */}
            {!canCreateDirectly && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                {t("deals.needsApproval")}
              </p>
            )}

            <button
              type="submit"
              disabled={iscreating}
              className="h-11 w-full rounded-lg bg-blue-800 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {iscreating
                ? t("deals.saving")
                : canCreateDirectly
                ? t("deals.create")
                : t("deals.sendForApproval")}
            </button>
          </form>

          {/* Existing deals */}
          <div className="mt-6">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-base-content/60">
              {t("deals.existing")}
            </h3>
            {(!deals || deals.length === 0) ? (
              <p className="rounded-lg border border-dashed border-base-300 py-6 text-center text-sm text-base-content/50">
                {t("deals.none")}
              </p>
            ) : (
              <div className="space-y-2">
                {deals.map((deal) => (
                  <div
                    key={deal._id}
                    className="rounded-lg border border-base-300 bg-base-100 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{deal.name}</span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                              deal.active
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-base-300 text-base-content/50"
                            }`}
                          >
                            {deal.active ? t("deals.active") : t("deals.inactive")}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm text-base-content/60">
                          {(deal.items || [])
                            .map(
                              (item) =>
                                `${item.quantity > 1 ? `${item.quantity}× ` : ""}${
                                  item.product?.name || t("deals.product")
                                }`
                            )
                            .join(" + ")}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-md bg-blue-50 px-2 py-1 text-sm font-bold text-blue-800">
                          {deal.discountType === "percent"
                            ? `−${Number(deal.discount || 0)}%`
                            : `−$${Number(deal.discount || 0).toFixed(2)}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleActive(deal)}
                          className="rounded-md border border-base-300 px-2.5 py-1 text-xs font-semibold hover:bg-base-200"
                        >
                          {deal.active ? t("deals.pause") : t("deals.enable")}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeDeal(deal)}
                          className="rounded-md p-1.5 text-red-500 hover:bg-red-50"
                          aria-label={t("deals.remove")}
                        >
                          <FiTrash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DealsModal;
