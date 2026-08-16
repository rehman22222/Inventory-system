import {
  currency,
  getCurrencyCode,
  sanitizeDecimal,
  sanitizeInteger,
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

describe("till number fields", () => {
  // The bug these guard against: the price box used to be <input type="number">,
  // and the on-screen keypad's "." key wiped whatever the cashier had already
  // typed. Holding the value as text is what fixes it, so the sanitiser has to
  // let a half-typed decimal through rather than snapping it to a number.
  test("keeps a decimal point that has no digits after it yet", () => {
    expect(sanitizeDecimal("1.")).toBe("1.");
    expect(sanitizeDecimal("66.")).toBe("66.");
  });

  test("types a price one keystroke at a time", () => {
    const typed = ["1", "1.", "1.8", "1.85"];
    expect(typed.map(sanitizeDecimal)).toEqual(["1", "1.", "1.8", "1.85"]);
  });

  test("backspaces back through the point without losing the field", () => {
    const erased = ["1.85", "1.8", "1.", "1", ""];
    expect(erased.map(sanitizeDecimal)).toEqual(["1.85", "1.8", "1.", "1", ""]);
  });

  test("allows only one decimal point", () => {
    expect(sanitizeDecimal("1.2.3")).toBe("1.23");
    expect(sanitizeDecimal("..5")).toBe("0.5");
  });

  test("never leaves a bare point for Number() to choke on", () => {
    // Number(".") is NaN, and every caller reads these boxes with Number() —
    // a lone point would otherwise turn a basket total into NaN.
    expect(sanitizeDecimal(".")).toBe("0.");
    expect(sanitizeDecimal(".5")).toBe("0.5");
  });

  test("every value it can produce is a finite number", () => {
    const keystrokes = ["", ".", "..", "1", "1.", "1.5", ".5", "0.", "abc", "-", "-.", "1.2.3", "00"];

    keystrokes.forEach((raw) => {
      const cleaned = sanitizeDecimal(raw);
      expect(Number.isFinite(Number(cleaned || 0))).toBe(true);
      expect(Number.isFinite(Number(sanitizeInteger(raw) || 0))).toBe(true);
    });
  });

  test("drops anything that is not part of a number", () => {
    expect(sanitizeDecimal("12abc.5")).toBe("12.5");
    expect(sanitizeDecimal("-4.50")).toBe("4.50");
    expect(sanitizeDecimal("")).toBe("");
  });

  test("integer fields take whole numbers only", () => {
    expect(sanitizeInteger("12")).toBe("12");
    expect(sanitizeInteger("1.5")).toBe("15");
    expect(sanitizeInteger("-7")).toBe("7");
    expect(sanitizeInteger("3 boxes")).toBe("3");
  });
});
