import {
  allDealIds,
  applicableDeals,
  currency,
  getCurrencyCode,
  printSlip,
  REFUND_REASONS,
  refundReasonLabel,
  restocksOnRefund,
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

// The till detects and prices offers; the cashier decides. These pin both
// halves — what an offer is worth, and that it is worth nothing until asked
// for — plus the behaviour of every deal already in the shop's database, which
// this matcher must not reprice.

const cartOf = (quantity, price = 7, productId = "P1") => [
  { productId, quantity, price },
];

const mixDeal = (overrides = {}) => ({
  _id: "D1",
  name: "3 e-liquids for 18",
  mode: "mix",
  groupQuantity: 3,
  discountType: "setPrice",
  discount: 18,
  quantityRule: "repeat_sets",
  active: true,
  items: [{ product: "P1" }],
  ...overrides,
});

const units = (n) => n * 7;

const paid = (units, deals, chosen) =>
  units * 7 - applicableDeals(cartOf(units), deals, chosen).total;

describe("a multibuy offer repeats and leaves the remainder at shelf price", () => {
  const deals = [mixDeal()];
  const chosen = ["D1"];

  test.each([
    [1, 7],
    [2, 14],
    [3, 18],
    [4, 25],
    [5, 32],
    [6, 36],
    [7, 43],
    [9, 54],
  ])("%i eligible units cost %i", (units, expected) => {
    expect(paid(units, deals, chosen)).toBe(expected);
  });

  test("the till can show normal, deal and saving without doing the sum again", () => {
    const [offer] = applicableDeals(cartOf(6), deals, chosen).applied;
    expect(offer.sets).toBe(2);
    expect(offer.normal).toBe(42);
    expect(offer.amount).toBe(6);
    expect(offer.normal - offer.amount).toBe(36);
  });

  test("two of one flavour is a deal — units come from quantity, not variety", () => {
    const pair = [mixDeal({ groupQuantity: 2, discount: 12 })];
    expect(paid(2, pair, chosen)).toBe(12);
    expect(paid(3, pair, chosen)).toBe(19);
    expect(paid(4, pair, chosen)).toBe(24);
  });
});

describe("nothing is given away that the cashier did not ask for", () => {
  const deals = [mixDeal()];

  test("an offer the basket qualifies for is worth nothing until applied", () => {
    expect(applicableDeals(cartOf(3), deals, []).total).toBe(0);
    expect(applicableDeals(cartOf(3), deals, ["D1"]).total).toBe(3);
  });

  test("a caller that passes no choice at all gets no discount", () => {
    expect(applicableDeals(cartOf(3), deals).total).toBe(0);
  });

  test("allDealIds asks the same matcher what the basket could have", () => {
    const offers = applicableDeals(cartOf(3), deals, allDealIds(deals));
    expect(offers.applied).toHaveLength(1);
    expect(offers.total).toBe(3);
  });

  test("an inactive deal is not even an offer", () => {
    const off = [mixDeal({ active: false })];
    expect(applicableDeals(cartOf(3), off, allDealIds(off)).total).toBe(0);
  });
});

describe("deals written before quantityRule existed charge exactly what they did", () => {
  test("a mix deal with no rule still lands once", () => {
    const legacy = [mixDeal({ quantityRule: undefined })];
    expect(paid(3, legacy, ["D1"])).toBe(18);
    expect(paid(6, legacy, ["D1"])).toBe(39); // 18 + three at shelf price
  });

  test("a bundle deal with no rule still repeats", () => {
    const legacy = [
      {
        _id: "D2",
        name: "2 for 3 off",
        discountType: "amount",
        discount: 3,
        active: true,
        items: [{ product: "P1", quantity: 2 }],
      },
    ];
    expect(paid(2, legacy, ["D2"])).toBe(11);
    expect(paid(4, legacy, ["D2"])).toBe(22);
  });

  test("single_set caps a bundle that would otherwise repeat", () => {
    const capped = [
      {
        _id: "D3",
        name: "2 for 3 off, once",
        discountType: "amount",
        discount: 3,
        quantityRule: "single_set",
        active: true,
        items: [{ product: "P1", quantity: 2 }],
      },
    ];
    expect(paid(4, capped, ["D3"])).toBe(25);
  });
});

describe("a deal outside its dates is not offered", () => {
  const day = 24 * 60 * 60 * 1000;
  const chosen = ["D1"];

  test("before it starts", () => {
    const future = [mixDeal({ startsAt: new Date(Date.now() + day).toISOString() })];
    expect(applicableDeals(cartOf(3), future, chosen).total).toBe(0);
  });

  test("after it ends", () => {
    const past = [mixDeal({ endsAt: new Date(Date.now() - day).toISOString() })];
    expect(applicableDeals(cartOf(3), past, chosen).total).toBe(0);
  });

  test("inside the window", () => {
    const live = [
      mixDeal({
        startsAt: new Date(Date.now() - day).toISOString(),
        endsAt: new Date(Date.now() + day).toISOString(),
      }),
    ];
    expect(applicableDeals(cartOf(3), live, chosen).total).toBe(3);
  });
});

describe("a deal never makes the basket dearer", () => {
  test("a set price above shelf value yields nothing", () => {
    const bad = [mixDeal({ discount: 25 })]; // 3 x 7 = 21, offered at 25
    expect(applicableDeals(cartOf(3), bad, ["D1"]).total).toBe(0);
  });

  test("the dearest units go into the set", () => {
    const cart = [
      { productId: "P1", quantity: 2, price: 9 },
      { productId: "P2", quantity: 2, price: 5 },
    ];
    const deal = [mixDeal({ groupQuantity: 2, discount: 12, items: [{ product: "P1" }, { product: "P2" }] })];
    const [offer] = applicableDeals(cart, deal, ["D1"]).applied;
    expect(offer.sets).toBe(2);
    expect(offer.normal).toBe(28); // 9 + 9 + 5 + 5, both pairs complete
  });
});

/* Which sets, not just how many.
 *
 * A count can only ever mean "the first n" — the server sanitises dealSets to a
 * number — so the identity of the chosen sets travels as the units they are
 * made of, which is what a lock already was. These are the sums the till shows
 * and the server charges; libs/deals.js mirrors this branch, so a change here
 * without one there is a till that disagrees with its own receipt. */
describe("an offer is given on the sets the cashier picked", () => {
  // Three sets, priced apart so choosing differently cannot come out the same.
  const cart = [
    { productId: "A", quantity: 1, price: 10 },
    { productId: "B", quantity: 1, price: 9 },
    { productId: "C", quantity: 1, price: 8 },
    { productId: "D", quantity: 1, price: 7 },
    { productId: "E", quantity: 1, price: 6 },
    { productId: "F", quantity: 1, price: 5 },
    { productId: "G", quantity: 1, price: 4 },
    { productId: "H", quantity: 1, price: 3 },
    { productId: "I", quantity: 1, price: 2 },
  ];
  const ids = cart.map((line) => line.productId);
  const deal = [
    mixDeal({
      discount: 12, // any three for 12
      items: ids.map((product) => ({ product })),
    }),
  ];

  // The ladder the till lays out: dearest first, cut into threes.
  const ladder = () => {
    const [full] = applicableDeals(cart, deal, ["D1"], undefined, undefined, undefined, ids)
      .applied;
    const need = Math.round(full.picked.length / full.sets);
    return Array.from({ length: full.sets }, (_, i) =>
      full.picked.slice(i * need, (i + 1) * need),
    );
  };

  // What the page does: turn chosen positions into the lock that names them.
  const give = (indices) => {
    const sets = ladder();
    const allocation = {};
    indices.forEach((i) => {
      sets[i].forEach((id) => {
        allocation[id] = (allocation[id] || 0) + 1;
      });
    });
    return applicableDeals(
      cart,
      deal,
      ["D1"],
      undefined,
      { D1: indices.length },
      { D1: allocation },
      ids,
    ).applied[0];
  };

  test("the sets fall dearest first", () => {
    expect(ladder()).toEqual([
      ["A", "B", "C"],
      ["D", "E", "F"],
      ["G", "H", "I"],
    ]);
  });

  test("the first and the third are priced, and the second is not", () => {
    const offer = give([0, 2]);
    expect(offer.sets).toBe(2);
    expect(offer.normal).toBe(36); // 10+9+8 and 4+3+2, nothing from the middle
    expect(offer.amount).toBe(12); // 36 less 12 a set
    expect(offer.allocation).toEqual({ A: 1, B: 1, C: 1, G: 1, H: 1, I: 1 });
  });

  test("which is not the same as taking the first two", () => {
    expect(give([0, 1]).normal).toBe(45);
    expect(give([0, 1]).amount).toBe(21);
  });

  test("one set on its own is only that set", () => {
    expect(give([0]).normal).toBe(27);
    expect(give([1]).normal).toBe(18);
  });

  test("the ceiling still counts every set the basket holds", () => {
    expect(give([0, 2]).maxSets).toBe(3);
  });

  /* Reachable only now that sets are picked freely: cumulative selection always
     started at the dearest, so the first set taken was the best one. */
  test("sets worth less than the offer charges give nothing at all", () => {
    expect(give([2])).toBeUndefined(); // 4+3+2 = 9, offered at 12
  });
});

describe("a deal priced by hand at the till", () => {
  const deal = [mixDeal()]; // 3 for 18, shelf 7 each, normal 21
  const chosen = ["D1"];
  const priced = (units, price) =>
    applicableDeals(cartOf(units), deal, chosen, price === undefined ? undefined : { D1: price });

  test("the typed figure is what the deal portion costs", () => {
    expect(units(3) - priced(3, 17).total).toBe(17);
    expect(units(3) - priced(3, 12).total).toBe(12);
  });

  test("it is capped at the normal price — an edit never makes the basket dearer", () => {
    expect(units(3) - priced(3, 999).total).toBe(21);
  });

  test("a negative figure is ignored and the deal price stands", () => {
    expect(units(3) - priced(3, -5).total).toBe(18);
  });

  test("a deliberate zero gives the goods away rather than being dropped", () => {
    const [entry] = priced(3, 0).applied;
    expect(units(3) - priced(3, 0).total).toBe(0);
    expect(entry.edited).toBe(true);
  });

  test("it covers every complete set, not one of them", () => {
    expect(units(6) - priced(6, 30).total).toBe(30);
  });

  test("what the deal would have given is kept beside what was charged", () => {
    const [entry] = priced(3, 17).applied;
    expect(entry.configuredAmount).toBe(3); // the shop's 3-for-18
    expect(entry.amount).toBe(4); // what the cashier gave
    expect(entry.edited).toBe(true);
  });

  test("an untouched deal is not marked as edited", () => {
    const [entry] = priced(3).applied;
    expect(entry.edited).toBe(false);
    expect(entry.amount).toBe(entry.configuredAmount);
  });

  test("an override for a deal that was never applied does nothing", () => {
    expect(applicableDeals(cartOf(3), deal, [], { D1: 5 }).total).toBe(0);
  });
});

describe("only the units inside a set are in the offer", () => {
  const deals = [mixDeal()]; // any 3 for 18, shelf 7
  const chosen = ["D1"];

  test("five items are three at the deal and two at shelf price", () => {
    const [offer] = applicableDeals(cartOf(5), deals, chosen).applied;
    expect(offer.sets).toBe(1);
    expect(offer.allocation).toEqual({ P1: 3 });
    expect(units(5) - applicableDeals(cartOf(5), deals, chosen).total).toBe(32);
  });

  test("the allocation is spread across lines, dearest first", () => {
    const cart = [
      { productId: "P1", quantity: 2, price: 9 },
      { productId: "P2", quantity: 2, price: 5 },
    ];
    const spread = [mixDeal({ items: [{ product: "P1" }, { product: "P2" }] })];
    const [offer] = applicableDeals(cart, spread, chosen).applied;
    // Three of the four units qualify: both €9s and one €5.
    expect(offer.allocation).toEqual({ P1: 2, P2: 1 });
    expect(offer.normal).toBe(23);
  });

  test("what the basket qualifies for travels back as maxSets", () => {
    const [offer] = applicableDeals(cartOf(7), deals, chosen).applied;
    expect(offer.maxSets).toBe(2);
    expect(offer.sets).toBe(2);
  });
});

describe("the cashier decides how many sets to give", () => {
  const deals = [mixDeal()];
  const chosen = ["D1"];

  test("one set out of the two the basket qualifies for", () => {
    const one = applicableDeals(cartOf(7), deals, chosen, undefined, { D1: 1 });
    const [offer] = one.applied;
    expect(offer.sets).toBe(1);
    expect(offer.maxSets).toBe(2);
    expect(offer.allocation).toEqual({ P1: 3 });
    // 3 at 18, and the other four at shelf price.
    expect(units(7) - one.total).toBe(18 + 4 * 7);
  });

  test("asking for more than the basket holds gives what it holds", () => {
    const [offer] = applicableDeals(cartOf(7), deals, chosen, undefined, { D1: 9 }).applied;
    expect(offer.sets).toBe(2);
  });

  test("no choice means every complete set, as before", () => {
    const [offer] = applicableDeals(cartOf(6), deals, chosen).applied;
    expect(offer.sets).toBe(2);
    expect(units(6) - applicableDeals(cartOf(6), deals, chosen).total).toBe(36);
  });
});

describe("which units land in the set", () => {
  test("at one price it is the order they were rung up, not the deal's list", () => {
    // The deal lists these in a different order from the basket.
    const deal = [
      mixDeal({
        items: [{ product: "C" }, { product: "D" }, { product: "E" }, { product: "A" }, { product: "B" }],
      }),
    ];
    const cart = ["A", "B", "C", "D", "E"].map((id) => ({
      productId: id,
      quantity: 1,
      price: 7,
    }));

    const [offer] = applicableDeals(cart, deal, ["D1"]).applied;
    expect(offer.allocation).toEqual({ A: 1, B: 1, C: 1 });
  });

  test("mixed prices still take the dearest — the shopper's side of it", () => {
    const deal = [
      mixDeal({ items: [{ product: "A" }, { product: "B" }, { product: "C" }, { product: "D" }] }),
    ];
    const cart = [
      { productId: "A", quantity: 1, price: 5 },
      { productId: "B", quantity: 1, price: 9 },
      { productId: "C", quantity: 1, price: 7 },
      { productId: "D", quantity: 1, price: 6 },
    ];

    const [offer] = applicableDeals(cart, deal, ["D1"]).applied;
    expect(offer.allocation).toEqual({ B: 1, C: 1, D: 1 });
    expect(offer.normal).toBe(22);
  });
});

describe("a set the cashier has given stays on the items it was given on", () => {
  const deal = [
    mixDeal({ items: [{ product: "A" }, { product: "B" }, { product: "C" }] }),
  ];
  const chosen = ["D1"];
  const basket = (a, b, c) =>
    [
      { productId: "A", quantity: a, price: 7 },
      { productId: "B", quantity: b, price: 7 },
      { productId: "C", quantity: c, price: 7 },
    ].filter((line) => line.quantity > 0);

  test("scanning another of something already in the set leaves the set alone", () => {
    const [given] = applicableDeals(basket(1, 1, 1), deal, chosen).applied;
    const lock = { D1: given.allocation };

    // Without the lock the matcher would re-pick and push C out for a second A.
    const [loose] = applicableDeals(basket(2, 1, 1), deal, chosen).applied;
    expect(loose.allocation).toEqual({ A: 2, B: 1 });

    const [held] = applicableDeals(
      basket(2, 1, 1),
      deal,
      chosen,
      undefined,
      undefined,
      lock
    ).applied;
    expect(held.allocation).toEqual({ A: 1, B: 1, C: 1 });
  });

  test("breaking the set up re-chooses instead of dropping the offer", () => {
    // B is taken back off the basket, so the set that was given no longer
    // stands — but three qualifying units still do, and a cashier looking at
    // them needs the offer to still be there.
    const lock = { D1: { A: 1, B: 1, C: 1 } };
    const again = applicableDeals(
      basket(2, 0, 1),
      deal,
      chosen,
      undefined,
      undefined,
      lock
    );
    expect(again.applied).toHaveLength(1);
    expect(again.applied[0].allocation).toEqual({ A: 2, C: 1 });
  });

  test("but not while the set still stands", () => {
    const lock = { D1: { A: 1, B: 1, C: 1 } };
    const [held] = applicableDeals(
      basket(3, 1, 1),
      deal,
      chosen,
      undefined,
      undefined,
      lock
    ).applied;
    expect(held.allocation).toEqual({ A: 1, B: 1, C: 1 });
  });

  test("a named set can never be worth more than the one the matcher would pick", () => {
    const cart = [
      { productId: "A", quantity: 1, price: 9 },
      { productId: "B", quantity: 1, price: 7 },
      { productId: "C", quantity: 1, price: 5 },
    ];
    const free = applicableDeals(cart, deal, chosen).total;
    // Naming the cheapest units cannot buy a bigger discount than the default.
    const named = applicableDeals(cart, deal, chosen, undefined, undefined, {
      D1: { C: 1, B: 1, A: 1 },
    }).total;
    expect(named).toBeLessThanOrEqual(free);
  });
});

describe("holding a set does not freeze what the basket qualifies for", () => {
  const deal = [
    mixDeal({
      items: ["A", "B", "C", "D", "E"].map((product) => ({ product })),
    }),
  ];
  const chosen = ["D1"];

  test("scanning enough for a second set still offers the second set", () => {
    // Given on A×2 + B×1, then more is rung up: eight eligible units in all.
    const cart = [
      { productId: "A", quantity: 2, price: 7 },
      { productId: "B", quantity: 2, price: 7 },
      { productId: "C", quantity: 2, price: 7 },
      { productId: "D", quantity: 1, price: 7 },
      { productId: "E", quantity: 1, price: 7 },
    ];
    const lock = { D1: { A: 2, B: 1 } };

    const [held] = applicableDeals(cart, deal, chosen, undefined, undefined, lock).applied;
    // One set given, on the units it was given on...
    expect(held.sets).toBe(1);
    expect(held.allocation).toEqual({ A: 2, B: 1 });
    // ...but the basket plainly holds two, and the till has to be able to say so.
    expect(held.maxSets).toBe(2);
  });
});

describe("sets fall the way the customer put them on the counter", () => {
  const deal = [
    mixDeal({
      items: ["a", "b", "c", "d", "e"].map((product) => ({ product })),
    }),
  ];
  const chosen = ["D1"];
  // The basket merges these onto five lines; the order is lost with it.
  const cart = [
    { productId: "a", quantity: 3, price: 7 },
    { productId: "b", quantity: 3, price: 7 },
    { productId: "c", quantity: 1, price: 7 },
    { productId: "d", quantity: 1, price: 7 },
    { productId: "e", quantity: 1, price: 7 },
  ];

  test("a,b,c then a,b,d then a,b,e makes exactly those three sets", () => {
    const scanned = ["a", "b", "c", "a", "b", "d", "a", "b", "e"];
    const [offer] = applicableDeals(
      cart,
      deal,
      chosen,
      undefined,
      undefined,
      undefined,
      scanned
    ).applied;

    expect(offer.sets).toBe(3);
    expect(offer.picked.slice(0, 3)).toEqual(["a", "b", "c"]);
    expect(offer.picked.slice(3, 6)).toEqual(["a", "b", "d"]);
    expect(offer.picked.slice(6, 9)).toEqual(["a", "b", "e"]);
  });

  test("without the order the basket's own grouping shows through", () => {
    const [offer] = applicableDeals(cart, deal, chosen).applied;
    expect(offer.picked.slice(0, 3)).toEqual(["a", "a", "a"]);
  });

  test("a log that has drifted cannot invent or lose a unit", () => {
    // Names something no longer in the basket, and misses two that are.
    const drifted = ["zz", "a", "b"];
    const [offer] = applicableDeals(
      cart,
      deal,
      chosen,
      undefined,
      undefined,
      undefined,
      drifted
    ).applied;

    expect(offer.picked).toHaveLength(9);
    expect(offer.picked.slice(0, 2)).toEqual(["a", "b"]);
  });

  test("price still comes first — order only breaks ties", () => {
    const mixed = [
      { productId: "a", quantity: 1, price: 5 },
      { productId: "b", quantity: 1, price: 9 },
      { productId: "c", quantity: 1, price: 7 },
      { productId: "d", quantity: 1, price: 6 },
    ];
    const [offer] = applicableDeals(
      mixed,
      deal,
      chosen,
      undefined,
      undefined,
      undefined,
      ["a", "b", "c", "d"]
    ).applied;
    // Scanned first, but the €5 is still the one left out of a 3-for set.
    expect(offer.allocation).toEqual({ b: 1, c: 1, d: 1 });
  });
});

describe("what a refund reason does to stock", () => {
  const { restocksOnRefund: server } = require("../../../../backend/libs/refundReasons");

  test("expired and damaged goods are written off, not put back", () => {
    expect(restocksOnRefund("expired")).toBe(false);
    expect(restocksOnRefund("damaged")).toBe(false);
  });

  test("a customer who simply did not like it hands back sellable stock", () => {
    expect(restocksOnRefund("unwanted")).toBe(true);
  });

  test("anything unsaid restocks — the way a refund worked before this existed", () => {
    // A void, a typed-in reason, and a refund with no reason at all. Stock the
    // shop actually has is worse forgotten than double-counted.
    expect(restocksOnRefund("void")).toBe(true);
    expect(restocksOnRefund("customer changed their mind")).toBe(true);
    expect(restocksOnRefund("")).toBe(true);
    expect(restocksOnRefund(undefined)).toBe(true);
  });

  test("the till and the server answer identically", () => {
    // The till only says what is about to happen; the server decides it. They
    // must not be able to disagree on screen.
    for (const reason of [...REFUND_REASONS, "void", "refund", "", undefined, "broken"]) {
      expect(restocksOnRefund(reason)).toBe(server(reason));
    }
  });

  test("a reason nobody recognises is shown as it was written", () => {
    const t = (key) => `translated:${key}`;
    expect(refundReasonLabel(t, "expired")).toBe("translated:pos.refund.reasons.expired");
    // Refunds put through before the presets existed hold free text.
    expect(refundReasonLabel(t, "seal was broken")).toBe("seal was broken");
  });
});

describe("printing a slip", () => {
  let printed;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="root">
        <div id="dialog">
          <span id="before">before</span>
          <div id="day-closing-print" class="slip hidden">rows</div>
          <span id="after">after</span>
        </div>
      </div>
    `;
    printed = null;
    window.print = jest.fn(() => {
      // What the browser sees at the moment of printing.
      const node = document.getElementById("day-closing-print");
      printed = {
        parentId: node.parentElement.id,
        underBody: node.parentElement.parentElement === document.body,
        marked: node.classList.contains("is-printing"),
        bodyMarked: document.body.classList.contains("printing-slip"),
      };
    });
  });

  test("the slip prints from the top of the page, not from inside the dialog", () => {
    // Absolutely positioned content does not paginate — this is what keeps a
    // long shift report from being clipped to one sheet.
    printSlip("day-closing-print");
    expect(printed).toEqual({
      parentId: "print-root",
      underBody: true,
      marked: true,
      bodyMarked: true,
    });
  });

  test("and goes back exactly where React left it", () => {
    printSlip("day-closing-print");

    const dialog = document.getElementById("dialog");
    expect([...dialog.children].map((child) => child.id)).toEqual([
      "before",
      "day-closing-print",
      "after",
    ]);
    expect(document.getElementById("print-root")).toBeNull();
    expect(document.body.classList.contains("printing-slip")).toBe(false);
    expect(
      document.getElementById("day-closing-print").classList.contains("is-printing")
    ).toBe(false);
  });

  test("a slip that is not on the page prints nothing rather than throwing", () => {
    printSlip("no-such-slip");
    expect(window.print).not.toHaveBeenCalled();
  });
});
