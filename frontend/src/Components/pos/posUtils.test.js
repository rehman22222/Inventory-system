import {
  currency,
  getCurrencyCode,
  setCurrencyCode,
} from "./posUtils";

describe("shop currency formatting", () => {
  beforeEach(() => {
    localStorage.clear();
    setCurrencyCode("EUR");
  });

  test("formats values in the configured shop currency", () => {
    setCurrencyCode("GBP");

    expect(getCurrencyCode()).toBe("GBP");
    expect(currency(4.99)).toContain("£");
    expect(currency(4.99)).toContain("4.99");
  });

  test("does not retain the obsolete cashier currency override", () => {
    localStorage.setItem("pos_currency", "GBP");

    setCurrencyCode("EUR");

    expect(localStorage.getItem("pos_currency")).toBeNull();
    expect(getCurrencyCode()).toBe("EUR");
  });

  test("falls back safely for an unsupported currency", () => {
    setCurrencyCode("XYZ");

    expect(getCurrencyCode()).toBe("EUR");
  });
});
