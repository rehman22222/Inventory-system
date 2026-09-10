import { isNewProduct, newestFirst } from "./productOrdering";

// A product row, as thin as the rule needs it to be.
const at = (hoursAgo, name) => ({
  name,
  createdAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString(),
});

describe("what counts as a new product", () => {
  test("something added just now is new", () => {
    expect(isNewProduct(at(0, "a"))).toBe(true);
  });

  test("still new an hour before the mark expires", () => {
    expect(isNewProduct(at(23, "a"))).toBe(true);
  });

  test("not new an hour after it", () => {
    expect(isNewProduct(at(25, "a"))).toBe(false);
  });

  test("a week-old product is not new", () => {
    expect(isNewProduct(at(24 * 7, "a"))).toBe(false);
  });

  // A row with no date, or a broken one, must not throw. Products predating
  // timestamps exist in the shop's database, and the list has to draw them.
  test("a missing or unreadable date is simply not new, and does not throw", () => {
    expect(isNewProduct({ name: "old" })).toBe(false);
    expect(isNewProduct({ name: "bad", createdAt: "not a date" })).toBe(false);
    expect(isNewProduct(null)).toBe(false);
    expect(isNewProduct(undefined)).toBe(false);
  });
});

describe("where a new product sits in the list", () => {
  test("the one just added is first", () => {
    const list = [at(50, "old"), at(80, "older"), at(0.1, "just added")];
    expect(newestFirst(list).map((p) => p.name)).toEqual([
      "just added",
      "old",
      "older",
    ]);
  });

  test("several new ones are newest first among themselves", () => {
    const list = [at(9, "c"), at(1, "a"), at(5, "b")];
    expect(newestFirst(list).map((p) => p.name)).toEqual(["a", "b", "c"]);
  });

  /* The point of the whole design: adding one product must not reshuffle the
     catalogue underneath the person who added it. */
  test("everything that is not new keeps the order it came in", () => {
    const list = [
      at(100, "one"),
      at(500, "two"),
      at(200, "three"),
      at(0.1, "brand new"),
      at(300, "four"),
    ];
    expect(newestFirst(list).map((p) => p.name)).toEqual([
      "brand new",
      "one",
      "two",
      "three",
      "four",
    ]);
  });

  test("products with no date at all keep their order and stay below the new one", () => {
    const list = [{ name: "x" }, { name: "y" }, at(0.1, "new"), { name: "z" }];
    expect(newestFirst(list).map((p) => p.name)).toEqual(["new", "x", "y", "z"]);
  });

  // Sorting the store's own array in place would reorder redux state behind
  // the reducer's back.
  test("the array handed in is not touched", () => {
    const list = [at(80, "old"), at(0.1, "new")];
    const before = list.map((p) => p.name);
    const sorted = newestFirst(list);
    expect(list.map((p) => p.name)).toEqual(before);
    expect(sorted).not.toBe(list);
  });

  test("a missing list is an empty list, not a crash", () => {
    expect(newestFirst(undefined)).toEqual([]);
    expect(newestFirst(null)).toEqual([]);
    expect(newestFirst("nonsense")).toEqual([]);
  });
});
