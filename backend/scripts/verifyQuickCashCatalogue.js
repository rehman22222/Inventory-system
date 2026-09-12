/* Proof that a quick cash sale stays a sale, and does not become catalogue.
 *
 *   node scripts/verifyQuickCashCatalogue.js
 *
 * No database and no network, like verifyBlogSecurity.js.
 *
 * THE CONSTRAINT THIS LIVES UNDER. The till prices every basket line from the
 * database and refuses a figure sent by a browser — see posController, "Price
 * always comes from the database, never from the request body." That guard is
 * worth keeping, and it means a quick cash line must point at a real Product
 * carrying that amount. So typing "5.80" at the counter DOES leave a product
 * behind, and no amount of wishing changes that.
 *
 * What was wrong was where those products showed up. A day of quick sales put
 * dozens of rows called "Misc." in the Products page, one for every amount rung
 * up, burying the shop's actual stock. They are sales, and they belong in the
 * sales ledger, not the catalogue.
 *
 * A KEPT CARD IS DIFFERENT. Ticking "Also save as a card" is the shop saying
 * "this is a thing we sell" — a product with a price and no barcode — and that
 * one belongs in the catalogue. The two are told apart by `quickSell`.
 */

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};
const section = (title) => console.log(`\n${title}`);

/* The filter the product list builds, and a tiny matcher for it, so this can
 * ask "would this row come back?" without a database. */
const CATALOGUE_FILTER = {
  $or: [{ nonStock: { $ne: true } }, { quickSell: true }],
};

const matches = (filter, row) => {
  if (filter.$or) return filter.$or.some((clause) => matches(clause, row));
  return Object.entries(filter).every(([field, rule]) => {
    const value = row[field];
    if (rule && typeof rule === "object" && "$ne" in rule) return value !== rule.$ne;
    if (rule && typeof rule === "object" && "$exists" in rule) {
      return rule.$exists ? value !== undefined : value === undefined;
    }
    if (rule && typeof rule === "object" && "$nin" in rule) return !rule.$nin.includes(value);
    return value === rule;
  });
};

const inCatalogue = (row) => matches(CATALOGUE_FILTER, row);

// The three kinds of row this has to tell apart.
const stockItem = { name: "OCB Papers", nonStock: false, quickSell: false, barcode: "123" };
const quickCash = { name: "Misc.", nonStock: true, quickSell: false, Price: 5.8 };
const keptCard = { name: "Coffee", nonStock: true, quickSell: true, Price: 2.5 };

function catalogue() {
  section("1. What belongs in the shop's catalogue");

  check("ordinary stock is in it", inCatalogue(stockItem));
  check(
    "a card the cashier kept is in it",
    inCatalogue(keptCard),
    "a price and no barcode is still a thing the shop sells",
  );
  check(
    "a quick cash sale is NOT",
    !inCatalogue(quickCash),
    "a day of these buried the real stock under rows called Misc.",
  );

  section("   ...and rows that predate any of these flags");

  // Every product in the shop's database today has neither flag set.
  check("a row with no flags at all is in it", inCatalogue({ name: "old" }));
  check(
    "a row with nonStock undefined is in it",
    inCatalogue({ name: "old", quickSell: false }),
    "nonStock must be TRUE to exclude, not merely absent",
  );
}

function tellingThemApart() {
  section("2. Keeping a card is what makes it catalogue");

  // The same product, before and after the cashier ticks "Also save as a card".
  const before = { ...quickCash, name: "Coffee", Price: 2.5 };
  const after = { ...before, quickSell: true };

  check("before it is kept, it is not in the catalogue", !inCatalogue(before));
  check("after it is kept, it is", inCatalogue(after));
  check(
    "and nothing else about it had to change",
    before.nonStock === after.nonStock && before.Price === after.Price,
    "pinning is a decision about the rail, not about what the thing is",
  );
}

function theTillIsUnaffected() {
  section("3. The till still sees what it needs to");

  /* The POS view has its own filter — it wants what can be scanned — and quick
   * cash cards are fetched separately through /quick-sell. Narrowing the
   * catalogue must not have touched either. */
  const POS_FILTER = { barcode: { $exists: true, $nin: [null, ""] } };

  check("the till's grid takes barcoded stock", matches(POS_FILTER, stockItem));
  check(
    "and not a quick cash row, which has no barcode",
    !matches(POS_FILTER, quickCash),
    "this was already true and must stay true",
  );
  check("nor a kept card, for the same reason", !matches(POS_FILTER, keptCard));

  // The rail is drawn from quickSell, not from the catalogue filter.
  const onTheRail = (row) => row.quickSell === true;
  check("the rail still shows a kept card", onTheRail(keptCard));
  check("and still does not show a quick cash sale", !onTheRail(quickCash));
}

function theFilterIsTheRealOne() {
  section("4. It is the filter the product list actually builds");

  const source = require("fs").readFileSync(
    require.resolve("../controller/productController"),
    "utf8",
  );
  check(
    "the product list excludes nonStock rows that were not kept",
    source.includes("const notQuickCash = { nonStock: { $ne: true } }") &&
      source.includes("$or: [notQuickCash, { quickSell: true }]"),
    "if this moved, the shape asserted above is no longer what runs",
  );
  check(
    "and the POS view keeps its own barcode filter",
    source.includes('{ barcode: { $exists: true, $nin: [null, ""] } }'),
  );
}

console.log("Quick cash and the catalogue");
console.log("============================");
catalogue();
tellingThemApart();
theTillIsUnaffected();
theFilterIsTheRealOne();
console.log(
  failures === 0
    ? "\nAll good — a quick sale stays a sale."
    : `\n${failures} check(s) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
