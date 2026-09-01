import React from "react";
import candyArt from "../../images/category-icons/candy.png";
import disposableArt from "../../images/category-icons/disposible.png";
import drinksArt from "../../images/category-icons/drinks.png";
import eLiquidArt from "../../images/category-icons/e-liquid.png";
import miscArt from "../../images/category-icons/miccelinous.png";
import pouchesArt from "../../images/category-icons/pouches.png";
import devicesArt from "../../images/category-icons/vapes-devices.png";

// The shop's own category artwork.
//
// Drawn as a CSS mask rather than dropped in as an <img>. The art is white on
// transparency, and a white <img> is white wherever it lands — it would glare
// on the grey tiles and vanish against nothing. Masked, only the SHAPE is used
// and the colour comes from `currentColor`, so each icon picks up whatever the
// tile around it is already doing: muted on a closed aisle, bright on the open
// one, without a second copy of the file in a second colour.
//
// The source PNGs are 2000x2000 with a lot of empty margin around the ink. They
// live in images/Categories and are left exactly as delivered; what is imported
// here is a cropped, downscaled copy, because a till that renders these at
// fourteen pixels has no use for four million.
const mask = (src, name) => {
  const CategoryIcon = ({ className = "" }) => (
    <span
      role="presentation"
      className={className}
      style={{
        display: "inline-block",
        backgroundColor: "currentColor",
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );

  CategoryIcon.displayName = `CategoryIcon(${name})`;
  return CategoryIcon;
};

export const ICONS = {
  candy: mask(candyArt, "candy"),
  disposable: mask(disposableArt, "disposable"),
  drinks: mask(drinksArt, "drinks"),
  eLiquid: mask(eLiquidArt, "eLiquid"),
  misc: mask(miscArt, "misc"),
  pouches: mask(pouchesArt, "pouches"),
  devices: mask(devicesArt, "devices"),
};

// Matched on the category's NAME rather than its id, so the shop can rename
// "Drinks" to "Cold Drinks", or add "Vape Kits" next year, and the right icon
// still turns up without anybody editing this file. An id map would need a
// database migration to survive a rename.
//
// Order matters. "Nicotine Pouches" and "E-Liquids & Nic Salts" both contain
// "nic", and "Disposable Vapes" and "Vape Devices" both contain "vape" — the
// more specific word has to be tested first or the wrong icon wins.
const RULES = [
  [/dispos|single.?use/, ICONS.disposable],
  [/pouch|snus/, ICONS.pouches],
  // "e-juice" is caught here so it does not fall through to Drinks below.
  [/liquid|salt|e.?juice|shortfill/, ICONS.eLiquid],
  [/candy|sweet|chocolate|confection/, ICONS.candy],
  [/drink|soda|water|juice|beverage|energy|cola/, ICONS.drinks],
  // The rechargeable hardware — kits, mods, coils, tanks.
  [/vape|device|kit|mod|coil|tank|batter|pod/, ICONS.devices],
];

// Anything the shop has invented that none of the above describes. The
// miscellaneous mark rather than a question mark: an unrecognised category is
// not a problem, it is a miscellaneous one, and the shop already has a picture
// for that.
export const FALLBACK_ICON = ICONS.misc;

export const iconForCategory = (name) => {
  const text = String(name || "").toLowerCase();
  const hit = RULES.find(([pattern]) => pattern.test(text));
  return hit ? hit[1] : FALLBACK_ICON;
};

export default iconForCategory;
