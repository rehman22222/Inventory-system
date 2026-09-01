import { iconForCategory, FALLBACK_ICON, ICONS } from "./categoryIcons";

// The shop's own seven categories, by the names they actually carry. If one of
// these ever picks up the wrong artwork the till has quietly started lying
// about what is in an aisle, and nobody would notice from a screenshot.
describe("iconForCategory", () => {
  it("knows the shop's categories", () => {
    expect(iconForCategory("Miscellaneous")).toBe(ICONS.misc);
    expect(iconForCategory("Drinks")).toBe(ICONS.drinks);
    expect(iconForCategory("Nicotine Pouches")).toBe(ICONS.pouches);
    expect(iconForCategory("Disposable Vapes")).toBe(ICONS.disposable);
    expect(iconForCategory("E-Liquids & Nic Salts")).toBe(ICONS.eLiquid);
    expect(iconForCategory("Vape Devices")).toBe(ICONS.devices);
    expect(iconForCategory("Candy")).toBe(ICONS.candy);
  });

  // Every category must be able to say something different from every other, or
  // the icons are decoration rather than information.
  it("gives each of them a different picture", () => {
    const shop = [
      "Miscellaneous",
      "Drinks",
      "Nicotine Pouches",
      "Disposable Vapes",
      "E-Liquids & Nic Salts",
      "Vape Devices",
      "Candy",
    ];
    expect(new Set(shop.map(iconForCategory)).size).toBe(shop.length);
  });

  // These are the pairs that share a word. Getting them right is the only
  // reason the rules are ordered rather than a plain object.
  describe("the overlapping names", () => {
    it("tells a disposable vape from a vape device", () => {
      expect(iconForCategory("Disposable Vapes")).toBe(ICONS.disposable);
      expect(iconForCategory("Vape Devices")).toBe(ICONS.devices);
      expect(iconForCategory("Single Use Vapes")).toBe(ICONS.disposable);
    });

    it("tells nicotine pouches from nic salts", () => {
      expect(iconForCategory("Nicotine Pouches")).toBe(ICONS.pouches);
      expect(iconForCategory("Nic Salts")).toBe(ICONS.eLiquid);
    });

    it("tells e-juice from juice", () => {
      expect(iconForCategory("E-Juice")).toBe(ICONS.eLiquid);
      expect(iconForCategory("Juice & Soda")).toBe(ICONS.drinks);
    });
  });

  it("survives the shop renaming things", () => {
    expect(iconForCategory("Cold Drinks")).toBe(ICONS.drinks);
    expect(iconForCategory("Vape Kits & Mods")).toBe(ICONS.devices);
    expect(iconForCategory("Sweets")).toBe(ICONS.candy);
    expect(iconForCategory("SHORTFILLS")).toBe(ICONS.eLiquid);
  });

  it("falls back to miscellaneous rather than breaking on something new", () => {
    expect(iconForCategory("Gift Cards")).toBe(FALLBACK_ICON);
    expect(iconForCategory("")).toBe(FALLBACK_ICON);
    expect(iconForCategory(undefined)).toBe(FALLBACK_ICON);
    expect(iconForCategory(null)).toBe(FALLBACK_ICON);
    expect(FALLBACK_ICON).toBe(ICONS.misc);
  });

  // The art is white on transparency. Painted in as an <img> it would be white
  // everywhere — glaring on a closed tile, invisible on nothing. As a mask it
  // takes the colour of whatever it sits in, which is the whole reason the
  // tiles can dim and brighten with one copy of each file.
  it("paints itself in the surrounding colour", () => {
    const Icon = iconForCategory("Candy");
    const { style } = Icon({ className: "h-4 w-4" }).props;

    expect(style.backgroundColor).toBe("currentColor");
    expect(style.maskImage).toMatch(/^url\(/);
    expect(style.WebkitMaskImage).toBe(style.maskImage);
    expect(style.maskSize).toBe("contain");
  });
});
