/* Proof that a set offer on the website charges what it says it charges.
 *
 *   node scripts/verifyOnlineDeals.js
 *
 * No database and no network, like verifyBlogSecurity.js — the only database
 * this machine points at is the shop's live one, and a check that can only run
 * against production is a check nobody dares run.
 *
 * This is a MONEY path, and every way it can be wrong is quiet: the page still
 * shows a price, the order still completes, the figure is just wrong. Four
 * things are worth holding still.
 *
 *   1. THE SHOPPER'S SIDE OF "ANY 5". The whole point of a mix deal is that
 *      five of one flavour, or three of one and two of another, are both five.
 *      A shopper who splits their pick and loses the offer has been told one
 *      thing and charged another.
 *
 *   2. WHICH DEALS ARE EVEN ON THE WEBSITE. Deals are built for the till. One
 *      reaching online orders without the shop putting it there would discount
 *      every basket it touches, silently, on a system nobody is watching.
 *
 *   3. THE CEILING. A discount must never exceed what the basket is worth. Get
 *      this wrong and an order can end up owing the customer money.
 *
 *   4. THAT IT IS THE TILL'S ENGINE DOING THE SUM. Not a copy of it.
 */

const fs = require("fs");
const { applicableDeals } = require("../libs/deals");
const { eventDealIds, priceEventDeals } = require("../libs/onlineDeals");

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};
const section = (title) => console.log(`\n${title}`);

// Three flavours of one pod at 4.00 each, on an "any 5 for 15" mix deal.
const MANGO = "aaaaaaaaaaaaaaaaaaaaaaa1";
const BERRY = "aaaaaaaaaaaaaaaaaaaaaaa2";
const MINT = "aaaaaaaaaaaaaaaaaaaaaaa3";
const SOAP = "bbbbbbbbbbbbbbbbbbbbbbb1"; // nothing to do with the offer

const fiveForFifteen = {
  _id: "deal000000000000000001",
  name: "Any 5 pods for 15",
  active: true,
  mode: "mix",
  groupQuantity: 5,
  quantityRule: "repeat_sets",
  discountType: "setPrice",
  discount: 15,
  items: [{ product: MANGO }, { product: BERRY }, { product: MINT }],
};

const line = (product, quantity, price) => ({ product: { _id: product }, quantity, price });
const five = (lines) => priceEventDeals(lines, [fiveForFifteen]).discount;

function mixing() {
  section("1. Five is five, however the shopper picks them");

  // 5 x 4.00 = 20.00 at shelf; the set costs 15.00; so 5.00 comes off.
  check("five of one flavour", five([line(MANGO, 5, 4)]) === 5, `got ${five([line(MANGO, 5, 4)])}`);
  check(
    "three of one and two of another",
    five([line(MANGO, 3, 4), line(BERRY, 2, 4)]) === 5,
    `got ${five([line(MANGO, 3, 4), line(BERRY, 2, 4)])}`,
  );
  check(
    "one, one and three across all three flavours",
    five([line(MANGO, 1, 4), line(BERRY, 1, 4), line(MINT, 3, 4)]) === 5,
  );

  check("four is not five — no offer", five([line(MANGO, 4, 4)]) === 0);
  check(
    "four pods and one bar of soap is still not five pods",
    five([line(MANGO, 4, 4), line(SOAP, 1, 4)]) === 0,
  );

  section("   ...and past the threshold");

  // Ten units are two complete sets: 40.00 at shelf, 30.00 as two sets.
  check(
    "ten units are two sets, not one",
    five([line(MANGO, 6, 4), line(BERRY, 4, 4)]) === 10,
    `got ${five([line(MANGO, 6, 4), line(BERRY, 4, 4)])}`,
  );
  // Seven is one set plus two at shelf price — those two must NOT be discounted.
  check(
    "seven units are one set and two at the ordinary price",
    five([line(MANGO, 7, 4)]) === 5,
    `got ${five([line(MANGO, 7, 4)])}`,
  );

  section("   ...and goods outside the offer are left alone");

  check("a basket of only other goods earns nothing", five([line(SOAP, 9, 4)]) === 0);
  check(
    "the offer comes off the pods, not off the rest of the basket",
    five([line(MANGO, 5, 4), line(SOAP, 3, 50)]) === 5,
    "a set price must not reach goods that are not in the deal",
  );
}

function whichDealsAreOnline() {
  section("2. Only deals the shop actually put on the website");

  // A card that IS an offer. A product card carries none — see the last
  // check in this section for why that matters.
  const card = (over) => ({ enabled: true, kind: "deal", deal: "deal1", ...(over || {}) });
  const ids = (events) => eventDealIds({ events });

  check("a deal on a switched-on card is online", ids({ enabled: true, items: [card()] }).length === 1);
  check(
    "a card with no deal on it puts nothing online",
    ids({ enabled: true, items: [card({ deal: null })] }).length === 0,
  );
  check(
    "an unticked card takes its offer off the website with it",
    ids({ enabled: true, items: [card({ enabled: false })] }).length === 0,
    "an offer nobody can see advertised must not still be discounting baskets",
  );
  check(
    "the whole section switched off takes every offer with it",
    ids({ enabled: false, items: [card()] }).length === 0,
  );
  check("no events at all is not a crash", eventDealIds({}).length === 0 && eventDealIds(null).length === 0);
  check("the same deal on two cards is counted once", ids({ enabled: true, items: [card(), card()] }).length === 1);
  check(
    "a populated deal document is read the same as a bare id",
    ids({ enabled: true, items: [card({ deal: { _id: "deal1", name: "x" } })] })[0] === "deal1",
  );
  check(
    "an offer riding on a product card is ignored",
    ids({ enabled: true, items: [card({ kind: "product" })] }).length === 0,
    "a card is about one thing; a product card advertising an offer as well would leave the page unable to say which it meant",
  );
}

function theCeiling() {
  section("3. A discount can never be worth more than the basket");

  const lines = [line(MANGO, 5, 4)];
  check(
    "clamped to the room it is given",
    priceEventDeals(lines, [fiveForFifteen], 2).discount === 2,
    "5.00 earned, only 2.00 left to give",
  );
  check("no room means no discount", priceEventDeals(lines, [fiveForFifteen], 0).discount === 0);
  check("never negative, even if the room is", priceEventDeals(lines, [fiveForFifteen], -50).discount === 0);

  section("   ...and nothing to work with is simply nothing");

  check("no lines", priceEventDeals([], [fiveForFifteen]).discount === 0);
  check("no deals", priceEventDeals(lines, []).discount === 0);
  check(
    "rubbish in place of either is not a crash",
    priceEventDeals(null, null).discount === 0 && priceEventDeals(undefined, [fiveForFifteen]).discount === 0,
  );
  check(
    "a line with no product is skipped rather than counted as one",
    priceEventDeals([{ quantity: 5, price: 4 }], [fiveForFifteen]).discount === 0,
  );
}

function sameEngine() {
  section("4. It is the till's own engine doing the sum");

  const source = fs.readFileSync(require.resolve("../libs/onlineDeals"), "utf8");
  check("onlineDeals calls libs/deals rather than carrying a copy", source.includes("require(\"./deals\")"));
  check(
    "and defines no matcher of its own",
    !source.includes("function applicableDeals") && !source.includes("groupQuantity"),
    "any 'any N for X' arithmetic here would be a second engine to keep in step",
  );

  // The same basket, asked of both, must come back with the same figure.
  const cart = new Map([[MANGO, { quantity: 5, price: 4 }]]);
  const direct = applicableDeals(cart, [fiveForFifteen], [String(fiveForFifteen._id)]).total;
  const throughUs = five([line(MANGO, 5, 4)]);
  check("and agrees with it exactly", direct === throughUs, `${direct} vs ${throughUs}`);
}

console.log("Set offers on the website\n=========================");
mixing();
whichDealsAreOnline();
theCeiling();
sameEngine();
console.log(
  failures === 0
    ? "\nAll good — the website charges what the offer says."
    : `\n${failures} check(s) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
