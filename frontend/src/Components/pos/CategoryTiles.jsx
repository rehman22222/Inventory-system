import React from "react";
import { useTranslation } from "react-i18next";
import { TbX } from "react-icons/tb";
import { iconForCategory } from "./categoryIcons";

// The category tiles.
//
// They sit in the same grey as the product cards beside them, so the grid reads
// as one surface rather than a row of coloured blocks competing with the goods.
// The open one takes the same blue as CHARGE — the till already uses that blue
// to mean "this is the thing happening", and reusing it costs a cashier nothing
// to learn.
//
// Three things in a fixed shape: the icon and the count share a top row, and
// the name has the whole space beneath them. The icon used to float in the
// corner over the top of everything, which was fine until a name ran to two
// lines — "E-Liquids & Nic Salts" then printed straight through it. Nothing
// here overlaps because nothing here sits on top of anything else.
//
// Clear is a tile like the rest, not a strip underneath. It does the same kind
// of job — choosing what the grid shows — so it belongs in the same row of
// targets, at the same size, where a thumb already is.
function CategoryTiles({ categories, selected, onSelect, onClear, layout = "grid" }) {
  const { t } = useTranslation();
  const row = layout === "row";

  const wrapper = row ? "flex gap-2 overflow-x-auto pb-1" : "grid grid-cols-2 gap-2";
  const size = row ? "h-[76px] w-[124px] shrink-0" : "h-[76px]";
  const base = `${size} flex flex-col border px-2 py-1.5 text-center text-[13px] font-bold uppercase leading-[1.2] tracking-wide transition active:scale-[0.97]`;
  const idle =
    "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600 hover:bg-slate-800";

  return (
    <div className={wrapper}>
      {categories.map((category) => {
        const active = selected === category._id;
        const Icon = iconForCategory(category.name);
        const muted = active ? "text-blue-200" : "text-slate-400";

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
            {/* The mark and the number together, at the start. Pushed to
                opposite ends of the tile they read as two separate facts with a
                gap of nothing between them; side by side they read as one — a
                picture of the aisle and how much is in it. */}
            <span className="flex w-full items-center gap-2">
              <Icon className={`h-[18px] w-[18px] shrink-0 ${muted}`} />
              {typeof category.productCount === "number" && (
                <span className={`text-[11px] font-semibold tabular-nums ${muted}`}>
                  {category.productCount}
                </span>
              )}
            </span>

            <span className="flex flex-1 items-center justify-center">
              <span className="line-clamp-2">{category.name}</span>
            </span>
          </button>
        );
      })}

      {/* Only worth offering when something is actually open. */}
      {selected && onClear && (
        <button type="button" onClick={onClear} className={`${base} ${idle}`}>
          <span className="flex w-full items-center justify-between">
            <TbX className="h-[18px] w-[18px] text-slate-400" strokeWidth={2} />
          </span>

          <span className="flex flex-1 items-center justify-center">
            <span className="line-clamp-2">{t("pos.clearCategory", "Clear")}</span>
          </span>
        </button>
      )}
    </div>
  );
}

export default CategoryTiles;
