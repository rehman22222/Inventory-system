import React, { useEffect, useMemo, useRef, useState } from "react";
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

// Build and manage bundle deals: name the deal, pick the products that make it
// up, and set the discount. The POS detects the deal automatically when those
// products land in the basket together. Available to admin and manager.
function DealsModal({ onClose }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();

  const { getallproduct } = useSelector((state) => state.product);
  const { getallCategory } = useSelector((state) => state.category);
  const { deals, iscreating } = useSelector((state) => state.deal);

  // A deal used to go to the owner for approval before it existed. The shop
  // asked for it to be made where it is used, so whoever opens this makes one
  // outright — no role check here and none on the route. The approval queue
  // still honours any create_deal request raised before this changed; it simply
  // does not receive new ones.

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
  // The pricing IS the deal type here: "setPrice" is a multi-buy ("any 3 for
  // €12"), anything else is a festive discount off the same set of products.
  const [discountType, setDiscountType] = useState("setPrice");
  const dealKind = discountType === "setPrice" ? "multibuy" : "festive";

  // Every deal this form builds is a pick-any-N that repeats for each complete
  // set. The engine still supports recipe bundles and once-per-sale offers, and
  // the deals already using them keep working — but they are not choices worth
  // putting in front of someone building the shop's everyday offer.
  const mode = "mix";
  const quantityRule = "repeat_sets";
  const [groupQuantity, setGroupQuantity] = useState("3");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [picked, setPicked] = useState([]); // [{ productId, name, price, quantity }]
  const [query, setQuery] = useState("");
  // "" = all categories; otherwise a category _id to browse.
  const [categoryId, setCategoryId] = useState("");
  // Only products the till can actually scan. See allMatches for why.
  const [tillOnly, setTillOnly] = useState(true);
  // The deal being edited, or null while building a new one. The form above is
  // the same form either way — a second one would be the same fields with the
  // same rules and its own bugs.
  const [editingId, setEditingId] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    dispatch(gettingallDeals());
    dispatch(gettingallCategory());
  }, [dispatch]);

  // Browse by category and/or search text. With neither, show everything so the
  // whole catalogue is reachable without typing.
  // Everything the filter finds — the list on screen is capped, but "add all"
  // must not be: a pick-any deal on ELFLIQ means all 33 flavours, not the first
  // hundred rows that happened to render.
  //
  // Matching is word-by-word and space-blind, because a deal built from a
  // half-matching search is a deal that quietly fails at the till. This
  // catalogue writes the same strength three ways — "10mg/ml", "10 Mg/ml",
  // "10 mg" — so a plain substring search on "ELFLIQ 10mg" found 24 of the 33
  // flavours and the cashier scanning one of the other nine saw no discount.
  const allMatches = useMemo(() => {
    const squash = (value) => String(value || "").toLowerCase().replace(/\s+/g, "");
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

    return products.filter((product) => {
      // A deal is rung up at the till, and the till only loads products it can
      // scan (getProduct's "pos" view drops anything without a barcode). An
      // unbarcoded row can never reach a basket, so putting one in a deal
      // builds an offer that can never fire — which is exactly what the shop's
      // existing deals did. Off by default, but reachable: a shop mid-way
      // through barcoding its stock still needs to see the rest.
      if (tillOnly && !String(product.barcode || "").trim()) return false;
      if (categoryId && String(product.Category?._id) !== String(categoryId)) return false;
      if (!terms.length) return true;

      const name = String(product.name || "").toLowerCase();
      const barcode = String(product.barcode || "").toLowerCase();
      const squashed = squash(product.name) + squash(product.barcode);

      // Every word has to appear somewhere — order and spacing are the
      // catalogue's business, not the person searching it.
      return terms.every(
        (term) =>
          name.includes(term) || barcode.includes(term) || squashed.includes(squash(term)),
      );
    });
  }, [products, query, categoryId, tillOnly]);

  const matches = useMemo(() => allMatches.slice(0, 100), [allMatches]);

  const pickedIds = useMemo(
    () => new Set(picked.map((entry) => entry.productId)),
    [picked]
  );

  // Typing "ELFLIQ 10mg" and adding thirty-three rows one at a time is the sort
  // of chore that ends in a half-built deal, so the whole filter goes in at once.
  const addAllMatching = () => {
    setPicked((current) => {
      const seen = new Set(current.map((entry) => entry.productId));
      const additions = allMatches
        .filter((product) => !seen.has(product._id))
        .map((product) => ({
          productId: product._id,
          name: product.name,
          price: Number(product.Price || 0),
          quantity: 1,
        }));
      if (!additions.length) {
        toast(t("deals.allAlreadyAdded", "All of these are already in the deal"));
        return current;
      }
      toast.success(
        t("deals.addedCount", "{{n}} products added", { n: additions.length }),
      );
      return [...current, ...additions];
    });
  };

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
    setDiscountType("setPrice");
    setGroupQuantity("3");
    setStartsAt("");
    setEndsAt("");
    setPicked([]);
    setQuery("");
    setEditingId(null);
  };

  // What the deal is actually worth against the picked products, so the form can
  // show the resulting price before it is saved. Mirrors libs/deals.js — in mix
  // mode one set is the N dearest units, since that is what the till will pick.
  const need = Math.floor(Number(groupQuantity || 0));
  const mixSetValue = (() => {
    if (mode !== "mix" || need < 2) return 0;
    const units = [];
    picked.forEach((entry) => {
      for (let i = 0; i < Number(entry.quantity || 0); i += 1) units.push(Number(entry.price || 0));
    });
    units.sort((a, b) => b - a);
    return units.slice(0, need).reduce((sum, price) => sum + price, 0);
  })();
  const setValue = mode === "mix" ? mixSetValue : normalTotal;
  const savings = (() => {
    if (discountType === "percent") return (setValue * Number(discount || 0)) / 100;
    if (discountType === "setPrice") return Math.max(0, setValue - Number(discount || 0));
    return Number(discount || 0);
  })();

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
    if (mode === "mix") {
      if (!picked.length) {
        toast.error(t("deals.minProducts"));
        return;
      }
      if (need < 2) {
        toast.error(t("deals.mixMin", "Set the number to buy — at least 2"));
        return;
      }
      // No check that the set is no bigger than the list. Units come from cart
      // QUANTITY, not from how many different products were picked, so "2 of
      // this one flavour for €12" and "any 3 across these two" are both real
      // deals the matcher handles — they were refused here for years.
    } else if (pickedUnitCount < 2) {
      toast.error(t("deals.minProducts"));
      return;
    }

    const payload = {
      name: name.trim(),
      discount: Number(discount),
      discountType,
      mode,
      // Only meaningful for mix; the server ignores it on a bundle.
      groupQuantity: mode === "mix" ? need : 0,
      quantityRule,
      // Empty means no limit at that end, which is what most deals want.
      startsAt: startsAt || null,
      endsAt: endsAt || null,
      // In mix mode every chosen product is simply eligible — the per-product
      // quantity is not a requirement, so it is pinned to 1.
      items: picked.map((entry) => ({
        product: entry.productId,
        quantity: mode === "mix" ? 1 : entry.quantity,
      })),
    };

    // Editing an existing deal goes straight through: the route is admin and
    // manager, because someone has to be able to correct or stop a live offer
    // without waiting for an approval. Only CREATING one needs the owner.
    if (editingId) {
      const saved = await dispatch(
        UpdateDeal({ dealId: editingId, changes: payload })
      );

      if (saved.error) {
        toast.error(saved.payload || t("deals.updateFailed", "Could not save the deal"));
        return;
      }

      toast.success(t("deals.updated", "Deal saved"));
      cancelEdit();
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

  // Load a saved deal back into the form. Prices come from the catalogue rather
  // than from the deal, because what a set is worth is today's shelf price, not
  // whatever it was when the deal was written.
  const editDeal = (deal) => {
    setEditingId(deal._id);
    setName(deal.name || "");
    setDiscount(String(deal.discount ?? ""));
    setDiscountType(deal.discountType || "setPrice");
    setGroupQuantity(String(deal.groupQuantity || 3));
    setStartsAt(deal.startsAt ? String(deal.startsAt).slice(0, 10) : "");
    setEndsAt(deal.endsAt ? String(deal.endsAt).slice(0, 10) : "");
    setPicked(
      (deal.items || []).map((item) => {
        const id = String(item.product?._id || item.product);
        const live = products.find((entry) => entry._id === id);
        return {
          productId: id,
          name: live?.name || item.product?.name || "",
          price: Number(live?.Price ?? item.product?.Price ?? 0),
          quantity: Number(item.quantity || 1),
        };
      })
    );
    setQuery("");
    // The form is at the top of a scrolling panel; editing from the list at the
    // bottom is otherwise a change nobody can see.
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
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

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* Create form */}
          <form
            onSubmit={submit}
            className={`space-y-4 rounded-xl border bg-base-200/40 p-4 ${
              editingId ? "border-blue-800 ring-1 ring-blue-800" : "border-base-300"
            }`}
          >
            {/* The form is the same one that builds a new deal, so say which
                deal it is holding — otherwise a save quietly overwrites one the
                person has stopped thinking about. */}
            {editingId && (
              <div className="flex items-center justify-between gap-3 rounded-lg bg-blue-800/10 px-3 py-2">
                <span className="text-sm font-semibold text-blue-800">
                  {t("deals.editingName", 'Editing "{{name}}"', { name })}
                </span>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="text-xs font-semibold underline"
                >
                  {t("deals.newInstead", "New deal instead")}
                </button>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Two kinds of deal, and only two. The engine can still express
                  bundles and once-per-sale, and the deals already using them
                  keep working — but building a NEW one out of three independent
                  choices meant twelve combinations, most of which nobody wants
                  and one of which is the offer the shop actually runs. */}
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase text-base-content/60">
                  {t("deals.kind", "Deal type")}
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    {
                      key: "multibuy",
                      title: t("deals.kindMultibuy", "Multi-buy"),
                      hint: t(
                        "deals.kindMultibuyHint",
                        "Any 3 for €12. Every complete set of 3 is €12; anything left over is at its normal price.",
                      ),
                    },
                    {
                      key: "festive",
                      title: t("deals.kindFestive", "Festive discount"),
                      hint: t(
                        "deals.kindFestiveHint",
                        "A straight amount or percentage off, once for every complete set.",
                      ),
                    },
                  ].map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() =>
                        setDiscountType(option.key === "multibuy" ? "setPrice" : "amount")
                      }
                      className={`rounded-lg border-2 p-3 text-start transition ${
                        dealKind === option.key
                          ? "border-primary bg-primary/10"
                          : "border-base-300 hover:border-base-content/30"
                      }`}
                    >
                      <p className="text-sm font-semibold">{option.title}</p>
                      <p className="mt-0.5 text-xs text-base-content/60">{option.hint}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-base-content/60">
                  {t("deals.perSet", "Products per set")}
                </label>
                <input
                  type="number"
                  min="2"
                  step="1"
                  value={groupQuantity}
                  onChange={(e) => setGroupQuantity(e.target.value)}
                  className="h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-3"
                />
                <p className="mt-1 text-xs text-base-content/50">
                  {t(
                    "deals.perSetHint",
                    "Any {{n}} from the products below — the shopper mixes them however they like, same flavour or not.",
                    { n: need >= 2 ? need : "…" },
                  )}
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-base-content/60">
                  {dealKind === "multibuy"
                    ? t("deals.setPrice", "Price per set")
                    : t("deals.discount")}
                </label>
                <div className="flex">
                  <div className="flex shrink-0 overflow-hidden rounded-s-lg border-2 border-e-0 border-base-300">
                    {dealKind === "multibuy" ? (
                      <span className="flex items-center bg-blue-800 px-3 text-sm font-bold text-white">
                        {t("deals.payEuro", "Pay €")}
                      </span>
                    ) : (
                      [
                        { key: "amount", label: "€ off" },
                        { key: "percent", label: "% off" },
                      ].map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setDiscountType(option.key)}
                          className={`whitespace-nowrap px-2.5 text-sm font-bold transition ${
                            discountType === option.key
                              ? "bg-blue-800 text-white"
                              : "bg-base-200 text-base-content/60 hover:bg-base-300"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))
                    )}
                  </div>
                  <input
                    type="number"
                    min="0"
                    max={discountType === "percent" ? "100" : undefined}
                    step="0.01"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder={
                      discountType === "percent"
                        ? "10"
                        : discountType === "setPrice"
                          ? "12.00"
                          : "3.00"
                    }
                    className="h-10 w-full rounded-e-lg border-2 border-base-300 bg-base-100 px-3"
                  />
                </div>
                <p className="mt-1 text-xs text-base-content/50">
                  {dealKind === "multibuy"
                    ? t(
                        "deals.setPriceHint",
                        "Every complete set costs this. 6 items = 2 sets; anything left over stays at its normal price.",
                      )
                    : discountType === "percent"
                      ? t("deals.percentHint")
                      : t("deals.amountHint")}
                </p>
              </div>

              <div className="sm:col-span-2">
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
                  {t("deals.startsAt", "Starts (optional)")}
                </label>
                <input
                  type="date"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-3"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-base-content/60">
                  {t("deals.endsAt", "Ends (optional)")}
                </label>
                <input
                  type="date"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-3"
                />
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
                <button
                  type="button"
                  onClick={addAllMatching}
                  disabled={!allMatches.length}
                  className="h-10 shrink-0 rounded-lg bg-blue-800 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-40"
                >
                  {t("deals.addAll", "Add all")} {allMatches.length ? `(${allMatches.length})` : ""}
                </button>
              </div>

              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-base-content/60">
                <input
                  type="checkbox"
                  checked={tillOnly}
                  onChange={(e) => setTillOnly(e.target.checked)}
                  className="h-3.5 w-3.5 accent-blue-800"
                />
                {t(
                  "deals.tillOnly",
                  "Only products the till can scan — a product without a barcode never reaches a basket, so a deal on one can never apply.",
                )}
              </label>

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
                    {mode === "mix" ? (
                      <span className="text-xs uppercase tracking-wide text-base-content/40">
                        {t("deals.eligible", "eligible")}
                      </span>
                    ) : (
                      <input
                        type="number"
                        min="1"
                        value={entry.quantity}
                        onChange={(e) => setQty(entry.productId, Number(e.target.value))}
                        className="h-8 w-16 rounded-md border-2 border-base-300 bg-base-100 px-2 text-center text-sm"
                        aria-label={t("deals.quantity")}
                      />
                    )}
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

            <button
              type="submit"
              disabled={iscreating}
              className="h-11 w-full rounded-lg bg-blue-800 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {iscreating
                ? t("deals.saving")
                : editingId
                ? t("deals.saveChanges", "Save changes")
                : t("deals.create")}
            </button>

            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="h-11 w-full rounded-lg border-2 border-base-300 font-semibold transition hover:bg-base-200"
              >
                {t("deals.cancelEdit", "Cancel")}
              </button>
            )}
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
                          onClick={() => editDeal(deal)}
                          className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
                            editingId === deal._id
                              ? "border-blue-800 bg-blue-800 text-white"
                              : "border-base-300 hover:bg-base-200"
                          }`}
                        >
                          {t("deals.edit", "Edit")}
                        </button>
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
