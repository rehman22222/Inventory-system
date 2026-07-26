import { useState } from "react";
import type { Category } from "@/lib/catalog";
import type { ProductFilters } from "@/lib/useProductFilters";

/* The shared filter rail used by Shop and Category pages. Category and brand
 * lists come from the page; price, stock and attributes (flavours / colours /
 * options, each its own facet) are driven by the filters hook. */
export function FilterSidebar({
  filters,
  categories,
  brands,
  showCategory,
  open,
}: {
  filters: ProductFilters;
  categories: Category[];
  brands: string[];
  showCategory: boolean;
  open: boolean;
}) {
  const { state, set, bounds, attributeGroups, activeCount, reset, toggleAttribute } = filters;
  const [attrSearch, setAttrSearch] = useState("");
  const q = attrSearch.trim().toLowerCase();
  const hasLargeGroup = attributeGroups.some((g) => g.options.length > 8);

  return (
    <aside
      className={`${open ? "block" : "hidden"} lg:block lg:sticky lg:top-40 lg:self-start space-y-7`}
    >
      {activeCount > 0 && (
        <button
          onClick={reset}
          className="font-mono text-[11px] uppercase tracking-widest text-[color:var(--sale)] hover:underline"
        >
          Clear all ({activeCount})
        </button>
      )}

      {showCategory && (
        <div>
          <div className="eyebrow mb-3">Categories</div>
          <ul className="space-y-1">
            <li>
              <FilterButton
                active={state.category === "all"}
                onClick={() => set.setCategory("all")}
                label="All"
              />
            </li>
            {categories.map((c) => (
              <li key={c.slug}>
                <FilterButton
                  active={state.category === c.slug}
                  onClick={() => set.setCategory(c.slug)}
                  label={c.name}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {brands.length > 1 && (
        <div>
          <div className="eyebrow mb-3">Brands</div>
          <div className="flex flex-wrap gap-1.5">
            <BrandChip active={state.brand === "all"} onClick={() => set.setBrand("all")} label="All" />
            {brands.map((b) => (
              <BrandChip
                key={b}
                active={state.brand === b}
                onClick={() => set.setBrand(b)}
                label={b}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="eyebrow mb-3">Price (€)</div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder={bounds[0] ? `${bounds[0]}` : "Min"}
            value={state.minPrice}
            onChange={(e) => set.setMinPrice(e.target.value)}
            className="w-full border hair bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ink"
            aria-label="Minimum price"
          />
          <span className="text-ink-muted">–</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder={bounds[1] ? `${bounds[1]}` : "Max"}
            value={state.maxPrice}
            onChange={(e) => set.setMaxPrice(e.target.value)}
            className="w-full border hair bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ink"
            aria-label="Maximum price"
          />
        </div>
      </div>

      <div>
        <div className="eyebrow mb-3">Availability</div>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={state.inStockOnly}
            onChange={(e) => set.setInStockOnly(e.target.checked)}
            className="h-4 w-4 accent-black"
          />
          In stock only
        </label>
      </div>

      {attributeGroups.length > 0 && (
        <div className="space-y-5">
          {hasLargeGroup && (
            <input
              type="search"
              placeholder="Search flavours, options…"
              value={attrSearch}
              onChange={(e) => setAttrSearch(e.target.value)}
              className="w-full border hair bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ink"
            />
          )}
          {attributeGroups.map((group) => {
            const opts = (q
              ? group.options.filter((o) => o.label.toLowerCase().includes(q))
              : group.options
            ).slice(0, 60);
            if (!opts.length) return null;
            return (
              <div key={group.kind}>
                <div className="eyebrow mb-3">{group.title}</div>
                <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                  {opts.map((o) => {
                    const key = `${group.kind}::${o.label}`;
                    return (
                      <label
                        key={key}
                        className="flex cursor-pointer items-center gap-2.5 py-0.5 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={state.attributes.includes(key)}
                          onChange={() => toggleAttribute(key)}
                          className="h-4 w-4 shrink-0 accent-black"
                        />
                        <span className="truncate">{o.label}</span>
                        <span className="ml-auto font-mono text-[10px] text-ink-muted">
                          {o.count}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}

function FilterButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-2 py-1.5 font-display text-sm uppercase tracking-widest ${
        active ? "bg-ink text-primary-foreground" : "hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function BrandChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`font-mono text-[10px] uppercase tracking-widest px-2 py-1 border hair ${
        active ? "bg-ink text-primary-foreground border-ink" : "hover:bg-accent hover:border-accent"
      }`}
    >
      {label}
    </button>
  );
}
