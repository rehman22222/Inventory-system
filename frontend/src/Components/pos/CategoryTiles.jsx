import React from "react";
import { useTranslation } from "react-i18next";

// The category tiles.
//
// They sit in the same grey as the product cards beside them, so the grid reads
// as one surface rather than a row of coloured blocks competing with the goods.
// The open one takes the same blue as CHARGE — the till already uses that blue
// to mean "this is the thing happening", and reusing it costs a cashier nothing
// to learn.
//
// Clear is a tile like the rest, not a strip underneath. It does the same kind
// of job — choosing what the grid shows — so it belongs in the same row of
// targets, at the same size, where a thumb already is.
function CategoryTiles({ categories, selected, onSelect, onClear, layout = "grid" }) {
  const { t } = useTranslation();
  const row = layout === "row";

  const wrapper = row ? "flex gap-2 overflow-x-auto pb-1" : "grid grid-cols-2 gap-2";
  const size = row ? "h-[52px] w-[104px] shrink-0" : "h-[64px]";
  const base = `${size} flex flex-col items-center justify-center gap-0.5 border px-1 text-center text-[11px] font-bold uppercase leading-[1.15] tracking-wide transition active:scale-[0.97]`;
  const idle =
    "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600 hover:bg-slate-800";

  return (
    <div className={wrapper}>
      {categories.map((category) => {
        const active = selected === category._id;

        return (
          <button
            key={category._id}
            type="button"
            onClick={() => onSelect(category._id)}
            className={`${base} ${
              active
                ? "border-blue-500 bg-gradient-to-b from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-950/50"
                : idle
            }`}
          >
            <span className="line-clamp-2 px-0.5">{category.name}</span>
            {/* Under the name, not tucked in a corner: how many things are in
                an aisle is part of reading the aisle, and the top bar no longer
                repeats it. */}
            {typeof category.productCount === "number" && (
              <span
                className={`text-[9px] font-semibold tabular-nums ${
                  active ? "text-blue-200" : "text-slate-500"
                }`}
              >
                {category.productCount}
              </span>
            )}
          </button>
        );
      })}

      {/* Only worth offering when something is actually open. */}
      {selected && onClear && (
        <button type="button" onClick={onClear} className={`${base} ${idle}`}>
          <span className="line-clamp-2 px-0.5">{t("pos.clearCategory", "Clear")}</span>
        </button>
      )}
    </div>
  );
}

export default CategoryTiles;
