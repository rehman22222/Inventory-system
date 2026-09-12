import { sellableProductIds } from "./onlineOffers";

/* Which products an offer built on the website ends up covering.
 *
 * Worth its own test because getting it wrong is completely silent: the offer
 * is created, it sits on a card advertising itself, and it simply never
 * applies — because it names products no basket can ever contain.
 *
 * The variant case is the one that matters. A pod listed in fifteen flavours
 * is fifteen products, and checkout sells the FLAVOUR, never the parent listing
 * row. An offer built over the parent would cover something unbuyable.
 */

const listing = (over) => ({ _id: "l1", ...over });
const product = (id) => ({ _id: id });

describe("what an offer covers", () => {
  test("a plain listing contributes its one product", () => {
    expect(sellableProductIds(listing({ product: product("p1") }))).toEqual(["p1"]);
  });

  test("a listing with flavours contributes every flavour", () => {
    expect(
      sellableProductIds(
        listing({
          product: product("parent"),
          variants: [{ product: product("mango") }, { product: product("berry") }],
        }),
      ),
    ).toEqual(["mango", "berry"]);
  });

  /* The whole point of the rule: checkout sells the flavour, so the parent is
     not something a shopper can buy and must not be in the offer. */
  test("and NOT the parent the flavours hang off", () => {
    const ids = sellableProductIds(
      listing({
        product: product("parent"),
        variants: [{ product: product("mango") }],
      }),
    );
    expect(ids).not.toContain("parent");
  });

  test("a flavour with no product of its own is skipped, not counted", () => {
    expect(
      sellableProductIds(
        listing({
          product: product("parent"),
          variants: [{ product: product("mango") }, {}, { product: null }],
        }),
      ),
    ).toEqual(["mango"]);
  });

  test("the same flavour listed twice is counted once", () => {
    expect(
      sellableProductIds(
        listing({
          variants: [{ product: product("mango") }, { product: product("mango") }],
        }),
      ),
    ).toEqual(["mango"]);
  });

  // An empty variants array is a listing with no flavours, not a broken one.
  test("an empty flavour list falls back to the listing's own product", () => {
    expect(sellableProductIds(listing({ product: product("p1"), variants: [] }))).toEqual([
      "p1",
    ]);
  });

  test("ids come back as strings, whatever they were", () => {
    const ids = sellableProductIds(listing({ product: { _id: 12345 } }));
    expect(ids).toEqual(["12345"]);
    expect(typeof ids[0]).toBe("string");
  });

  test("a listing with nothing sellable contributes nothing, and does not throw", () => {
    expect(sellableProductIds(listing({}))).toEqual([]);
    expect(sellableProductIds({})).toEqual([]);
    expect(sellableProductIds(null)).toEqual([]);
    expect(sellableProductIds(undefined)).toEqual([]);
  });
});
