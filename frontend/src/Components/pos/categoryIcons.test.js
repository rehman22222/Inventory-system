import {
  TbBattery,
  TbCandy,
  TbCloud,
  TbCup,
  TbDroplet,
  TbLayoutGrid,
  TbPackage,
} from "react-icons/tb";
import { iconForCategory, FALLBACK_ICON } from "./categoryIcons";

// The shop's own seven categories, by the names they actually carry. If one of
// these ever picks up the wrong icon the till has quietly started lying about
// what is in an aisle, and nobody would notice from a screenshot.
describe("iconForCategory", () => {
  it("knows the shop's categories", () => {
    expect(iconForCategory("Miscellaneous")).toBe(TbLayoutGrid);
    expect(iconForCategory("Drinks")).toBe(TbCup);
    expect(iconForCategory("Nicotine Pouches")).toBe(TbPackage);
    expect(iconForCategory("Disposable Vapes")).toBe(TbCloud);
    expect(iconForCategory("E-Liquids & Nic Salts")).toBe(TbDroplet);
    expect(iconForCategory("Vape Devices")).toBe(TbBattery);
    expect(iconForCategory("Candy")).toBe(TbCandy);
  });

  // These are the pairs that share a word. Getting them right is the only
  // reason the rules are ordered rather than a plain object.
  describe("the overlapping names", () => {
    it("tells a disposable vape from a vape device", () => {
      expect(iconForCategory("Disposable Vapes")).toBe(TbCloud);
      expect(iconForCategory("Vape Devices")).toBe(TbBattery);
      expect(iconForCategory("Single Use Vapes")).toBe(TbCloud);
    });

    it("tells nicotine pouches from nic salts", () => {
      expect(iconForCategory("Nicotine Pouches")).toBe(TbPackage);
      expect(iconForCategory("Nic Salts")).toBe(TbDroplet);
    });

    it("tells e-juice from juice", () => {
      expect(iconForCategory("E-Juice")).toBe(TbDroplet);
      expect(iconForCategory("Juice & Soda")).toBe(TbCup);
    });
  });

  it("survives the shop renaming things", () => {
    expect(iconForCategory("Cold Drinks")).toBe(TbCup);
    expect(iconForCategory("Vape Kits & Mods")).toBe(TbBattery);
    expect(iconForCategory("Sweets")).toBe(TbCandy);
    expect(iconForCategory("SHORTFILLS")).toBe(TbDroplet);
  });

  it("falls back rather than breaking on something new", () => {
    expect(iconForCategory("Gift Cards")).toBe(FALLBACK_ICON);
    expect(iconForCategory("")).toBe(FALLBACK_ICON);
    expect(iconForCategory(undefined)).toBe(FALLBACK_ICON);
    expect(iconForCategory(null)).toBe(FALLBACK_ICON);
  });
});
