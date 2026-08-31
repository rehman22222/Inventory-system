import React from "react";
import { tileColor, TILE_SELECTED } from "./posUtils";

// Colour-blocked category tiles. `layout="row"` gives a horizontally scrolling
// strip for narrow screens, where the dedicated category column is hidden.
//
// The colours are inline styles rather than Tailwind classes because they are
// the shop's own hex values, not palette steps — see tileColor. The selected
// tile switches to amber with dark text, which is the one state a cashier
// checks mid-transaction without stopping to read.
function CategoryTiles({ categories, selected, onSelect, layout = "grid" }) {
  const row = layout === "row";

  const wrapper = row
    ? "flex gap-2 overflow-x-auto pb-1"
    : "grid grid-cols-2 gap-2";

  const tile = row ? "h-[52px] w-[104px] shrink-0" : "h-[64px]";

  return (
    <div className={wrapper}>
      {categories.map((category) => {
        const active = selected === category._id;

        return (
          <button
            key={category._id}
            type="button"
            onClick={() => onSelect(category._id)}
            style={
              active
                ? { ...TILE_SELECTED, borderWidth: 2, borderStyle: "solid" }
                : {
                    background: tileColor(category.name),
                    borderWidth: 2,
                    borderStyle: "solid",
                    borderColor: "rgba(0,0,0,0.25)",
                  }
            }
            // The press feedback is unchanged — it is the thing that tells a
            // cashier the tap landed on a screen they are not looking at.
            className={`${tile} relative flex flex-col items-center justify-center px-1 text-center text-[11px] font-bold uppercase leading-[1.15] tracking-wide transition active:scale-[0.97] ${
              active ? "shadow-lg shadow-black/40" : "text-white hover:brightness-110"
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
