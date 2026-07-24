const Store = require("../models/Storemodel");

// The set the shop itself can trade in — kept in step with Storemodel's enum so
// a supplier currency is never something the reports cannot name.
const CURRENCIES = ["EUR", "GBP", "USD", "AED", "PKR", "INR", "BDT"];

/* The shop's trading currency. Everything money-shaped in the database is in
 * this unit; there is exactly one Store row, so this is cheap and cached-ish by
 * Mongo. Falls back to EUR, matching the schema default. */
async function shopCurrency() {
  const shop = await Store.findOne({ key: "shop" }).select("currency").lean();
  return shop?.currency || "EUR";
}

/* The trading currency plus the owner's saved rates, in one read.
 *
 * `.lean()` turns the schema's Map into a plain object, so rates are looked up
 * with rates[code] either way. */
async function fxContext() {
  const shop = await Store.findOne({ key: "shop" })
    .select("currency exchangeRates")
    .lean();
  return {
    shopCcy: shop?.currency || "EUR",
    rates: shop?.exchangeRates || {},
  };
}

/* Work out what to store for a product's cost.
 *
 * Suppliers do not all invoice in the shop's currency — a Galway shop buying
 * from Belfast gets billed in GBP while it sells in EUR. Writing the invoice's
 * number straight into costPrice makes every margin wrong, because the reports
 * subtract it from a euro shelf price without knowing it is pounds.
 *
 * So when a foreign currency is named, a rate is required — taken from the
 * owner's saved rates in Settings, or overridden per-product when one invoice
 * was settled at a different rate. What gets stored is the converted figure
 * plus a record of how it was arrived at.
 *
 * Returns { ok: true, costPrice, costSource } or { ok: false, message }.
 * `costSource` is null when the supplier billed in the shop's own currency.
 */
function resolveCost({ costPrice, costCurrency, costRate, costNote }, shopCcy, rates = {}) {
  const amount = Number(costPrice);
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, message: "Cost price must be a number of 0 or more" };
  }

  const currency = String(costCurrency || shopCcy).trim().toUpperCase();
  if (!CURRENCIES.includes(currency)) {
    return { ok: false, message: `Unsupported cost currency: ${costCurrency}` };
  }

  // Billed in the shop's own currency: nothing to convert, and no source to
  // record. Any previous conversion is cleared rather than left to mislead.
  if (currency === shopCcy) {
    return { ok: true, costPrice: round2(amount), costSource: null };
  }

  // An explicit rate wins — one invoice may have been settled at a rate that is
  // not the shop's standing one. Otherwise fall back to Settings.
  const given = costRate === undefined || costRate === null || costRate === "" ? null : Number(costRate);
  const stored = Number(rates?.[currency]);
  const rate = given !== null ? given : stored;

  if (!Number.isFinite(rate) || rate <= 0) {
    return {
      ok: false,
      message:
        given !== null
          ? `Exchange rate for ${currency} must be greater than 0`
          : `No exchange rate saved for ${currency}. Set "1 ${currency} = ? ${shopCcy}" in Settings, or enter a rate here.`,
    };
  }

  return {
    ok: true,
    costPrice: round2(amount * rate),
    costSource: {
      amount: round2(amount),
      currency,
      rate,
      note: typeof costNote === "string" ? costNote.trim() : undefined,
    },
  };
}

// Money is stored to the cent. Rounding here, once, keeps 1.85 * 1.17 from
// reaching the database as 2.1644999999999999.
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

module.exports = { CURRENCIES, shopCurrency, fxContext, resolveCost, round2 };
