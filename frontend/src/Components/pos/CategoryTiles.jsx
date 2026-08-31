import React from "react";
import { useTranslation } from "react-i18next";
import { FiX } from "react-icons/fi";

// The category tiles.
//
// They sit in the same grey as the product cards beside them, so the grid reads
// as one surface rather than a row of coloured blocks competing with the goods.
// The open one takes the same blue as CHARGE — the till already uses that blue
// to mean "this is the thing happening", and reusing it costs a cashier nothing
// to learn.
//
// Clear closes the lot. Nothing is open when a shift starts, and Clear puts it
// back to that: an empty grid, waiting for a tile or a scan.
function CategoryTiles({ categories, selected, onSelect, onClear, layout = "grid" }) {
  const { t } = useTranslation();
  const row = layout === "row";

  const wrapper = row
    ? "flex gap-2 overflow-x-auto pb-1"
    : "grid grid-cols-2 gap-2";

  const tile = row ? "h-[52px] w-[104px] shrink-0" : "h-[64px]";

  return (
    <div className="space-y-2">
      <div className={wrapper}>
        {categories.map((category) => {
          const active = selected === category._id;

          return (
            <button
              key={category._id}
              type="button"
              onClick={() => onSelect(category._id)}
              // The press feedback is unchanged — it is what tells a cashier
              // the tap landed on a screen they are not looking at.
              className={`${tile} relative flex flex-col items-center justify-center border px-1 text-center text-[11px] font-bold uppercase leading-[1.15] tracking-wide transition active:scale-[0.97] ${
                active
                  ? "border-blue-500 bg-gradient-to-b from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-950/50"
                  : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600 hover:bg-slate-800"
              }`}
            >
              <span className="line-clamp-2 px-0.5">{category.name}</span>
              {typeof category.productCount === "number" && (
                <span
                  className={`absolute end-1 top-0.5 text-[9px] font-semibold ${
                    active ? "text-blue-200" : "text-slate-600"
                  }`}
                >
                  {category.productCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Only worth offering when something is actually open. */}
      {selected && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="flex w-full items-center justify-center gap-1.5 border border-slate-800 bg-slate-900 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 transition hover:border-slate-600 hover:bg-slate-800 hover:text-slate-200 active:scale-[0.99]"
        >
          <FiX className="h-3 w-3" />
          {t("pos.clearCategory", "Clear")}
        </button>
      )}
    </div>
  );
}

export default CategoryTiles;
