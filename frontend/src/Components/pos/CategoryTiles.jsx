import React from "react";
import { tileColor } from "./posUtils";

// Colour-blocked category tiles. `layout="row"` gives a horizontally scrolling
// strip for narrow screens, where the dedicated category column is hidden.
function CategoryTiles({ categories, selected, onSelect, layout = "grid" }) {
  const row = layout === "row";

  const wrapper = row
    ? "flex gap-2 overflow-x-auto pb-1"
    : "grid grid-cols-2 gap-2";

  const tile = row
    ? "h-[52px] w-[104px] shrink-0"
    : "h-[64px]";

  return (
    <div className={wrapper}>
      {categories.map((category) => {
        const active = selected === category._id;

        return (
          <button
            key={category._id}
            type="button"
            onClick={() => onSelect(category._id)}
            className={`${tile} relative flex flex-col items-center justify-center px-1 text-center text-[11px] font-bold uppercase leading-[1.15] tracking-wide text-white ring-1 transition active:scale-[0.97] ${tileColor(
              category.name
            )} ${
              active
                ? "ring-2 ring-white shadow-lg shadow-black/40"
                : "ring-black/20 hover:brightness-110"
            }`}
          >
            <span className="line-clamp-2 px-0.5">{category.name}</span>
            {typeof category.productCount === "number" && (
              <span className="absolute end-1 top-0.5 text-[9px] font-semibold opacity-70">
                {category.productCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default CategoryTiles;
