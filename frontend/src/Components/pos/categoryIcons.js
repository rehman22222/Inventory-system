import {
  TbBattery,
  TbCandy,
  TbCloud,
  TbCup,
  TbDroplet,
  TbLayoutGrid,
  TbPackage,
  TbTag,
} from "react-icons/tb";

// One icon per kind of thing the shop sells.
//
// Matched on the category's NAME rather than its id, so the shop can rename
// "Drinks" to "Cold Drinks", or add "Vape Kits" next year, and the right icon
// still turns up without anybody editing this file. An id map would need a
// database migration to survive a rename.
//
// Order matters. "Nicotine Pouches" and "E-Liquids & Nic Salts" both contain
// "nic", and "Disposable Vapes" and "Vape Devices" both contain "vape" — the
// more specific word has to be tested first or the wrong icon wins.
const RULES = [
  // Puffed and thrown away: the vapour, not the hardware.
  [/dispos|single.?use/, TbCloud],
  [/pouch|snus/, TbPackage],
  // "e-juice" is caught here so it does not fall through to Drinks below.
  [/liquid|salt|e.?juice|shortfill/, TbDroplet],
  [/candy|sweet|chocolate|confection/, TbCandy],
  [/drink|soda|water|juice|beverage|energy|cola/, TbCup],
  // The rechargeable hardware — kits, mods, coils, tanks.
  [/vape|device|kit|mod|coil|tank|batter|pod/, TbBattery],
];

// Anything the shop has invented that none of the above describes. A plain
// grid rather than a question mark: an unrecognised category is not a problem,
// it is just a category.
export const FALLBACK_ICON = TbLayoutGrid;

// Deals are not a category at all — they ride in the sidebar as one.
export const DEALS_ICON = TbTag;

export const iconForCategory = (name) => {
  const text = String(name || "").toLowerCase();
  const hit = RULES.find(([pattern]) => pattern.test(text));
  return hit ? hit[1] : FALLBACK_ICON;
};

export default iconForCategory;
