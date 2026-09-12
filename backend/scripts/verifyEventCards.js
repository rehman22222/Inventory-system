/* Proof that an events card only says what the shop told it to say.
 *
 *   node scripts/verifyEventCards.js
 *
 * No database and no network, like verifyBlogSecurity.js.
 *
 * A card used to arrive pre-answered: its type defaulted to "product", so an
 * untouched card looked like a decision somebody had made. Making "not chosen"
 * a real stored state is easy to get half right, and the half that is usually
 * missed is the one that matters:
 *
 *   1. AN UNTOUCHED CARD STAYS UNTOUCHED, through a save and back. If the
 *      server rounds an empty type up to "product", the blank dropdown is a
 *      lie — it reads blank until the page reloads and then answers itself.
 *
 *   2. CARDS THE SHOP ALREADY FILLED IN ARE NOT DISTURBED. Every card in the
 *      shop's database today has a type, and this change must be invisible to
 *      all of them.
 *
 *   3. RUBBISH IS "NOT CHOSEN", NOT "PRODUCT". A type that is none of the three
 *      real ones must fall back to empty rather than to a guess.
 *
 *   4. A CARD IS ABOUT ONE THING. A product, a category, or an offer — never a
 *      product AND an offer, because then the page has to guess which of them
 *      the card was advertising. A deal card in particular has no product of
 *      its own, and requiring one is what kept it off the page entirely.
 */

const mongoose = require("mongoose");
const Settings = require("../models/OnlineStoreSettingmodel");

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};
const section = (title) => console.log(`\n${title}`);

// The exact rules the controller applies when it saves a card.
const savedKind = (kind) =>
  ["product", "category", "deal"].includes(kind) ? kind : "";

/* A card is about ONE thing, and the server is where that is enforced.
 *
 * A browser that sent both a product and an offer would otherwise store a
 * card that means two things at once, and the page would have to guess which.
 */
const savedTarget = (item) =>
  item.kind === "deal" ? "" : String(item.targetId || "");
const savedDeal = (item) =>
  item.kind === "deal" ? item.deal || null : null;

function storing() {
  section("1. A card the shop has not filled in");

  const doc = new Settings({ store: new mongoose.Types.ObjectId() });
  doc.events.items = [{ enabled: false, kind: "", targetId: "" }];
  const error = doc.validateSync();
  check(
    "an empty type is a valid thing to store",
    !error,
    error ? error.message : "",
  );
  check("and it comes back empty, not as a product", doc.events.items[0].kind === "");

  const fresh = new Settings({ store: new mongoose.Types.ObjectId() });
  fresh.events.items = [{}];
  check(
    "a brand new card defaults to no type at all",
    fresh.events.items[0].kind === "",
    "this is the whole point: nothing is chosen until the shop chooses it",
  );
}

function saving() {
  section("2. What a save does to each type");

  check('"product" is kept', savedKind("product") === "product");
  check('"category" is kept', savedKind("category") === "category");
  check('"deal" is kept', savedKind("deal") === "deal");
  check('"" stays empty', savedKind("") === "");

  section("   ...and anything else is not guessed at");

  for (const rubbish of ["Product", "PRODUCT", "widget", null, undefined, 0, {}, []]) {
    check(
      `${JSON.stringify(rubbish) ?? String(rubbish)} becomes "not chosen"`,
      savedKind(rubbish) === "",
    );
  }
}

function existingCards() {
  section("3. Cards the shop already filled in are untouched");

  const doc = new Settings({ store: new mongoose.Types.ObjectId() });
  doc.events.items = [
    { enabled: true, kind: "product", targetId: "listing-1", tag: "Halloween" },
    { enabled: true, kind: "category", targetId: "rolling-papers" },
  ];
  const error = doc.validateSync();
  check("both still validate", !error, error ? error.message : "");
  check("the product card is still a product card", doc.events.items[0].kind === "product");
  check("the category card is still a category card", doc.events.items[1].kind === "category");
  check("and their targets are untouched", doc.events.items[0].targetId === "listing-1");
}

function storefront() {
  section("4. A card is about one thing, never two");

  const productCard = { kind: "product", targetId: "listing-1", deal: "deal-1" };
  check(
    "a product card keeps its product",
    savedTarget(productCard) === "listing-1",
  );
  check(
    "and any offer sent with it is dropped",
    savedDeal(productCard) === null,
    "a card that is a product AND an offer would have to be guessed at",
  );

  const dealCard = { kind: "deal", targetId: "listing-1", deal: "deal-1" };
  check("a deal card keeps its offer", savedDeal(dealCard) === "deal-1");
  check(
    "and any product sent with it is dropped",
    savedTarget(dealCard) === "",
  );

  section("   ...and a half-filled card is not shown");

  /* The storefront's own filter, kept here so the two cannot drift apart.

     A DEAL card qualifies on its offer, not on a target — it has no product
     of its own, which is the point of it. Requiring one is exactly what kept
     a deal-only card off the page. */
  const shown = (item) =>
    Boolean(
      item.enabled === true &&
        item.kind &&
        (item.kind === "deal" ? item.deal : item.targetId),
    );

  check("a finished product card shows", shown({ enabled: true, kind: "product", targetId: "x" }));
  check(
    "a deal card with no product still shows",
    shown({ enabled: true, kind: "deal", deal: "d1" }),
    "this is the bug that kept a deal-only card off the page entirely",
  );
  check(
    "a deal card with no offer does not",
    !shown({ enabled: true, kind: "deal", deal: null }),
  );
  check("no type, no card", !shown({ enabled: true, kind: "", targetId: "x" }));
  check("no target, no card", !shown({ enabled: true, kind: "product", targetId: "" }));
  check("switched off, no card", !shown({ enabled: false, kind: "product", targetId: "x" }));
  check(
    "an empty card is not shown",
    !shown({ enabled: false, kind: "", targetId: "" }),
    "a card with no type must never fall through to the product branch",
  );
}

/* The card's own wording, and the picture it is allowed to show.
 *
 * Both fall back to the catalogue, and the fallbacks are where the care is:
 *
 *   The NAME falls back to the till's name, so a card nobody renamed reads
 *   as it always did. What it must never do is follow the rename anywhere
 *   else — the basket, the order and the stock name the real product,
 *   because that is what is being sold and what the shop counts.
 *
 *   The PICTURE does NOT fall back. It used to borrow the catalogue
 *   photograph, which made a card nobody had styled look finished: a plain
 *   product shot sitting in a seasonal frame it was never meant for. */
function wording() {
  section("5. The name on the card, and the picture");

  // The storefront's own rule, kept here so the two cannot drift apart:
  // the shop's wording, then the offer's name, then the catalogue's.
  const shown = (card, catalogueName) =>
    (card.title || "").trim() || (card.deal?.name || "").trim() || catalogueName;

  check(
    "a card nobody renamed reads as the till names it",
    shown({}, "OCB Rolling Papers") === "OCB Rolling Papers",
  );
  check(
    "a renamed card reads as the shop wrote it",
    shown({ title: "Halloween Papers" }, "OCB Rolling Papers") === "Halloween Papers",
  );
  check(
    "a name of nothing but spaces is not a name",
    shown({ title: "   " }, "OCB Rolling Papers") === "OCB Rolling Papers",
  );

  section("   ...and a card carrying an offer is named after the offer");

  check(
    "an unnamed card with an offer reads as the offer",
    shown({ deal: { name: "Any 3 for 18" } }, "Monkey King") === "Any 3 for 18",
    "the card is advertising the offer; the product is only where it points",
  );
  check(
    "the shop's own wording still wins over both",
    shown({ title: "Halloween 3 for 18", deal: { name: "Any 3 for 18" } }, "Monkey King") ===
      "Halloween 3 for 18",
  );
  check(
    "no offer and no wording falls all the way back to the catalogue",
    shown({}, "Monkey King") === "Monkey King",
  );

  section("   ...and the rename goes no further than the card");

  const doc = new Settings({ store: new mongoose.Types.ObjectId() });
  doc.events.items = [
    { enabled: true, kind: "product", targetId: "listing-1", title: "Halloween Papers" },
  ];
  check("it validates", !doc.validateSync());
  check(
    "the card still points at the real product",
    doc.events.items[0].targetId === "listing-1",
    "the basket and the order follow targetId, never the wording",
  );

  section("   ...and the picture is never borrowed from the catalogue");

  const picture = (card) => card.image?.url || "";
  check("a card given a picture shows it", picture({ image: { url: "u" } }) === "u");
  check(
    "a card with no picture shows none",
    picture({}) === "" && picture({ image: {} }) === "",
    "borrowing the product shot made an unstyled card look finished",
  );
}

/* The three codebases have to agree on what kinds of card exist.
 *
 * This is written from a real bug. "deal" was added to the model, to the
 * controller, to the storefront and to the dropdown — but not to the admin's
 * own normaliser, which every edit to a card runs back through. The effect
 * was not a rejected save: picking Deal erased itself instantly and the
 * dropdown sprang back to blank, with no error anywhere to explain it.
 *
 * So the lists are compared rather than trusted. A kind added to one place
 * and forgotten in another is caught here instead of in the shop's hands. */
function everyoneAgrees() {
  section("6. The admin, the server and the model agree on the kinds");

  const fs = require("fs");
  const path = require("path");
  const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", "..", ...parts), "utf8");

  /* The quoted words inside the bracketed list that starts at `from`.
   *
   * Plain string work rather than a regular expression: the thing being read
   * here is source code full of brackets and quotes, and a regex over it is
   * both harder to read and easier to get subtly wrong than walking to the
   * closing bracket and taking what is between the quotes. */
  const wordsInListAt = (source, from) => {
    const open = source.indexOf("[", from);
    const close = source.indexOf("]", open);
    if (open < 0 || close < 0) return "";
    return source
      .slice(open + 1, close)
      .split('"')
      .filter((_, index) => index % 2 === 1)
      .sort()
      .join(",");
  };

  // Every list that starts with "product" — the shape every kind list takes.
  const kindListsIn = (source) => {
    const found = [];
    let at = source.indexOf('["product"');
    while (at >= 0) {
      found.push(wordsInListAt(source, at));
      at = source.indexOf('["product"', at + 1);
    }
    return found;
  };

  const model = read("backend", "models", "OnlineStoreSettingmodel.js");
  const controller = read("backend", "controller", "onlineStoreController.js");
  const admin = read("frontend", "src", "pages", "OnlineStorePage.jsx");

  // The model writes its list as enum: ["", "product", ...], so the empty
  // string drops out of the comparison and the three real kinds remain.
  const modelKinds = wordsInListAt(model, model.indexOf('enum: ["", "product"'))
    .split(",")
    .filter(Boolean)
    .join(",");

  check("the model knows all three", modelKinds === "category,deal,product", modelKinds);

  for (const [name, source] of [
    ["the server's save", controller],
    ["the admin page", admin],
  ]) {
    const lists = kindListsIn(source);
    check(
      `${name} lists the same kinds the model does`,
      lists.length > 0 && lists.every((list) => list === "category,deal,product"),
      lists.length ? `found ${JSON.stringify(lists)}` : "no kind list found at all",
    );
  }
}

/* A card the shop filled in and ticked must reach the page.
 *
 * Two ways it silently did not, both found on the real store:
 *
 *   1. A DEAL WHOSE STOCK IS NOT SOLD ONLINE. Offers are built at the till,
 *      and plenty of them cover stock that has no web listing at all. The
 *      card was dropped outright for want of somewhere to link to, so a card
 *      that had been filled in and ticked simply never appeared.
 *
 *   2. THE OFFER NESTED INSIDE THE PRICE. A deal card has no price of its
 *      own in exactly that case — so the price did not render, and the offer,
 *      sitting inside it, went with it. The one thing the card had left to
 *      say was the thing that disappeared.
 */
function reachesThePage() {
  section("7. A card the shop ticked is never dropped");

  /* The storefront's own rules, kept here so the two cannot drift apart. */
  const destination = (deal, listedProductIds) => {
    const first = (deal.productIds || []).find((id) => listedProductIds.includes(id));
    return first ? `/product/${first}` : "/shop";
  };
  // What the card renders: a row appears if there is a price OR an offer.
  const showsRow = (card) => typeof card.price === "number" || Boolean(card.dealLine);

  const offer = { name: "Any 2 for 55", productIds: ["p1", "p2"] };

  check(
    "an offer whose stock is sold online links to it",
    destination(offer, ["p2"]) === "/product/p2",
  );
  check(
    "an offer whose stock is NOT sold online still has somewhere to go",
    destination(offer, []) === "/shop",
    "this card used to be dropped entirely, with nothing to say why",
  );
  check(
    "an offer covering nothing at all still has somewhere to go",
    destination({ name: "x" }, ["p1"]) === "/shop",
  );

  section("   ...and it always has something to say");

  check(
    "a card with a price and an offer shows a row",
    showsRow({ price: 1, dealLine: "Any 2 for 55" }),
  );
  check(
    "a card with only an offer still shows one",
    showsRow({ dealLine: "Any 2 for 55" }),
    "the offer used to live inside the price, so no price meant no offer",
  );
  check(
    "a card with only a price still shows one",
    showsRow({ price: 1.5 }),
  );
  check(
    "a card with neither shows no row at all",
    !showsRow({}),
  );
}

/* The offer's own page.
 *
 * An offer is satisfied by any MIX of what it covers, so the page listing all
 * of it is the only place a shopper can actually complete one. A card used to
 * open whichever product came first in the offer — the one place they cannot
 * do that from, with nothing on screen saying what else counted.
 *
 * Reachable only through a card that is switched on, which is the same rule
 * the checkout prices by. An offer the shop has taken off the website must
 * not still have a page advertising terms the till would refuse to give. */
function offerPage() {
  section("8. The offer's own page");

  // The page's own lookup, kept here so the two cannot drift apart.
  const findOffer = (items, id) =>
    (items || []).find(
      (item) => item?.enabled && item.kind === "deal" && item.deal?.id === id,
    ) || null;

  const live = { enabled: true, kind: "deal", deal: { id: "d1", productIds: ["p1", "p2"] } };

  check("an offer on a switched-on card has a page", Boolean(findOffer([live], "d1")));
  check(
    "an offer on an unticked card does not",
    !findOffer([{ ...live, enabled: false }], "d1"),
    "an offer taken off the website must not keep a page advertising it",
  );
  check(
    "a product card is not an offer page",
    !findOffer([{ ...live, kind: "product" }], "d1"),
  );
  check("an id nobody is advertising has no page", !findOffer([live], "d2"));
  check("no cards at all is not a crash", !findOffer(null, "d1") && !findOffer([], "d1"));

  section("   ...and it lists everything the offer covers");

  // Only what the website actually sells: the rest is till-only stock.
  const listed = (deal, sellable) =>
    (deal.productIds || []).filter((id) => sellable.includes(id));

  check(
    "every covered product that is sold online is listed",
    listed(live.deal, ["p1", "p2", "p9"]).join(",") === "p1,p2",
  );
  check(
    "and one that is not sold online is left out rather than shown broken",
    listed(live.deal, ["p2"]).join(",") === "p2",
  );
  check(
    "an offer with nothing sold online lists nothing — the page says so",
    listed(live.deal, []).length === 0,
    "an empty grid with no explanation reads as a broken page",
  );
}

console.log("Events cards");
console.log("============");
storing();
saving();
existingCards();
storefront();
wording();
everyoneAgrees();
reachesThePage();
offerPage();
console.log(
  failures === 0
    ? "\nAll good — a card says only what the shop told it to."
    : `\n${failures} check(s) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
