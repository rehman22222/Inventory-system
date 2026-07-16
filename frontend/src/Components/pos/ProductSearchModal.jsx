import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiArrowRight, FiImage, FiSearch } from "react-icons/fi";
import PosModal from "./PosModal";
import { currency } from "./posUtils";

// A filter-rich product search, in the style of a real till: a category tree on
// the left, a "search by" selector and sort controls on top, and result rows
// that show barcode, stock, price and category — each with an add button.
function ProductSearchModal({ products, categories, onPick, onClose }) {
  const { t } = useTranslation();

  const [query, setQuery] = useState("");
  const [searchBy, setSearchBy] = useState("all"); // all | name | barcode | category
  const [categoryId, setCategoryId] = useState(null); // null = all categories
  const [sortBy, setSortBy] = useState("name"); // name | price | stock
  const [asc, setAsc] = useState(true);

  const inputRef = useRef(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    const value = query.trim().toLowerCase();

    const matchesText = (product) => {
      if (!value) return true;
      const name = product.name?.toLowerCase() || "";
      const desc = product.Desciption?.toLowerCase() || "";
      const code = product.barcode?.toLowerCase() || "";
      const cat = product.Category?.name?.toLowerCase() || "";

      if (searchBy === "name") return name.includes(value) || desc.includes(value);
      if (searchBy === "barcode") return code.includes(value);
      if (searchBy === "category") return cat.includes(value);
      return name.includes(value) || desc.includes(value) || code.includes(value) || cat.includes(value);
    };

    const filtered = products.filter((product) => {
      if (categoryId && product.Category?._id !== categoryId) return false;
      return matchesText(product);
    });

    const dir = asc ? 1 : -1;
    filtered.sort((a, b) => {
      if (sortBy === "price") return (Number(a.Price) - Number(b.Price)) * dir;
      if (sortBy === "stock") return (Number(a.quantity) - Number(b.quantity)) * dir;
      return String(a.name || "").localeCompare(String(b.name || "")) * dir;
    });

    return filtered.slice(0, 120);
  }, [products, query, searchBy, categoryId, sortBy, asc]);

  const add = (product) => {
    if (Number(product.quantity) <= 0) return;
    onPick(product);
    inputRef.current?.focus();
  };

  const control =
    "border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500";

  return (
    <PosModal
      title={t("pos.productSearch.title")}
      subtitle={t("pos.productSearch.subtitle")}
      onClose={onClose}
      width="max-w-5xl"
    >
      <div className="flex min-h-[60vh] gap-3">
        {/* Category tree */}
        <aside className="w-44 shrink-0 space-y-1 overflow-y-auto border-e border-slate-800 pe-2">
          <button
            type="button"
            onClick={() => setCategoryId(null)}
            className={`w-full px-3 py-2 text-start text-sm font-semibold transition ${
              categoryId === null
                ? "bg-cyan-800 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {t("pos.productSearch.allCategories")}
          </button>
          {categories.map((category) => (
            <button
              key={category._id}
              type="button"
              onClick={() => setCategoryId(category._id)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm transition ${
                categoryId === category._id
                  ? "bg-cyan-800 text-white"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <span className="truncate">{category.name}</span>
              {typeof category.productCount === "number" && (
                <span className="shrink-0 text-[11px] opacity-60">{category.productCount}</span>
              )}
            </button>
          ))}
        </aside>

        {/* Search + results */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <select value={searchBy} onChange={(e) => setSearchBy(e.target.value)} className={control}>
              <option value="all">{t("pos.productSearch.byAll")}</option>
              <option value="name">{t("pos.productSearch.byName")}</option>
              <option value="barcode">{t("pos.productSearch.byBarcode")}</option>
              <option value="category">{t("pos.productSearch.byCategory")}</option>
            </select>

            <div className="relative min-w-[200px] flex-1">
              <FiSearch className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("pos.productSearch.placeholder")}
                className={`${control} w-full ps-9`}
              />
            </div>

            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={control}>
              <option value="name">{t("pos.productSearch.sortName")}</option>
              <option value="price">{t("pos.productSearch.sortPrice")}</option>
              <option value="stock">{t("pos.productSearch.sortStock")}</option>
            </select>

            <button
              type="button"
              onClick={() => setAsc((v) => !v)}
              className="border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              {asc ? t("pos.productSearch.asc") : t("pos.productSearch.desc")}
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {results.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-600">
                {query.trim() ? t("pos.productSearch.noResults") : t("pos.productSearch.hint")}
              </p>
            ) : (
              results.map((product) => {
                const stock = Number(product.quantity);
                const out = stock <= 0;

                return (
                  <div
                    key={product._id}
                    className="flex items-center gap-3 border border-slate-800 bg-slate-950 px-3 py-2"
                  >
                    {product.image?.url ? (
                      <img
                        src={product.image.url}
                        alt={product.name}
                        className="h-11 w-11 shrink-0 object-cover ring-1 ring-slate-700"
                      />
                    ) : (
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-slate-800 text-slate-600 ring-1 ring-slate-700">
                        <FiImage className="h-4 w-4" />
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-100">{product.name}</p>
                      <p className="truncate font-mono text-[11px] text-slate-500">
                        {product.barcode
                          ? `${t("pos.productSearch.code")}: ${product.barcode}`
                          : t("pos.productSearch.noCode")}
                        {" · "}
                        {t("pos.productSearch.stock")}: {stock}
                      </p>
                    </div>

                    <span className="shrink-0 text-sm font-bold tabular-nums text-cyan-400">
                      {currency(product.Price)}
                      <span className="text-[10px] font-normal text-slate-500">
                        /{t("pos.productSearch.each")}
                      </span>
                    </span>

                    <span className="hidden w-28 shrink-0 truncate text-end text-[11px] font-semibold uppercase text-slate-500 sm:block">
                      {product.Category?.name || t("pos.uncategorized")}
                    </span>

                    <button
                      type="button"
                      disabled={out}
                      onClick={() => add(product)}
                      title={out ? t("pos.productSearch.outOfStock") : t("pos.add")}
                      className="flex h-9 w-9 shrink-0 items-center justify-center bg-cyan-700 text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600"
                    >
                      <FiArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </PosModal>
  );
}

export default ProductSearchModal;
