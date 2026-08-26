import reducer, {
  EditProduct,
  Removeproduct,
  Addproduct,
  Searchproduct,
} from "./productSlice";

// The Products table renders from `searchdata` while a query is active and from
// `getallproduct` otherwise, and only the second list is ever refetched. So a
// row edited or deleted from search results has to be patched in place, or the
// screen keeps showing the figure the shop just changed.

const product = (id, quantity) => ({
  _id: id,
  name: `Product ${id}`,
  quantity,
  Category: { _id: "cat1", name: "Vapes" },
});

const stateWith = (getallproduct, searchdata) => ({
  getallproduct,
  searchdata,
  isallproductget: false,
  isproductadd: false,
  isproductremove: false,
  issearchdata: false,
  editedProduct: null,
  iseditedProduct: false,
  gettopproduct: null,
});

describe("edited products land in whichever list is on screen", () => {
  it("updates the row in the full catalogue", () => {
    const next = reducer(
      stateWith([product("a", 5), product("b", 9)], null),
      { type: EditProduct.fulfilled.type, payload: product("a", 42) },
    );
    expect(next.getallproduct.map((p) => p.quantity)).toEqual([42, 9]);
  });

  it("updates the row in search results too", () => {
    const next = reducer(
      stateWith([product("a", 5)], [product("a", 5)]),
      { type: EditProduct.fulfilled.type, payload: product("a", 42) },
    );
    expect(next.searchdata[0].quantity).toBe(42);
    expect(next.getallproduct[0].quantity).toBe(42);
  });

  it("keeps the populated Category the table renders", () => {
    const next = reducer(
      stateWith([], [product("a", 5)]),
      { type: EditProduct.fulfilled.type, payload: product("a", 7) },
    );
    expect(next.searchdata[0].Category.name).toBe("Vapes");
  });

  it("accepts the { product } envelope as well as a bare product", () => {
    const next = reducer(
      stateWith([product("a", 5)], null),
      { type: EditProduct.fulfilled.type, payload: { product: product("a", 3) } },
    );
    expect(next.getallproduct[0].quantity).toBe(3);
  });

  it("never invents a row for a product the list does not hold", () => {
    const next = reducer(
      stateWith([product("a", 5)], [product("a", 5)]),
      { type: EditProduct.fulfilled.type, payload: product("zzz", 1) },
    );
    expect(next.getallproduct).toHaveLength(1);
    expect(next.searchdata).toHaveLength(1);
  });

  it("survives a null searchdata and a malformed payload", () => {
    expect(() =>
      reducer(stateWith([product("a", 5)], null), {
        type: EditProduct.fulfilled.type,
        payload: null,
      }),
    ).not.toThrow();
    const next = reducer(stateWith([product("a", 5)], null), {
      type: EditProduct.fulfilled.type,
      payload: { message: "ok" },
    });
    expect(next.searchdata).toBeNull();
    expect(next.getallproduct[0].quantity).toBe(5);
  });
});

describe("deleted products leave whichever list is on screen", () => {
  it("drops the row from both lists, for either thunk argument shape", () => {
    const bare = reducer(
      stateWith([product("a", 5), product("b", 9)], [product("a", 5)]),
      { type: Removeproduct.fulfilled.type, payload: {}, meta: { arg: "a" } },
    );
    expect(bare.getallproduct.map((p) => p._id)).toEqual(["b"]);
    expect(bare.searchdata).toHaveLength(0);

    const confirmed = reducer(
      stateWith([product("a", 5), product("b", 9)], [product("a", 5)]),
      {
        type: Removeproduct.fulfilled.type,
        payload: {},
        meta: { arg: { productId: "a", confirm: "DELETE" } },
      },
    );
    expect(confirmed.getallproduct.map((p) => p._id)).toEqual(["b"]);
    expect(confirmed.searchdata).toHaveLength(0);
  });

  it("leaves a null searchdata alone", () => {
    const next = reducer(stateWith([product("a", 5)], null), {
      type: Removeproduct.fulfilled.type,
      payload: {},
      meta: { arg: "a" },
    });
    expect(next.searchdata).toBeNull();
    expect(next.getallproduct).toHaveLength(0);
  });
});

describe("the lists still behave the way the page expects", () => {
  it("appends an added product to the catalogue", () => {
    const next = reducer(stateWith([product("a", 5)], null), {
      type: Addproduct.fulfilled.type,
      payload: { product: product("b", 2) },
    });
    expect(next.getallproduct.map((p) => p._id)).toEqual(["a", "b"]);
  });

  it("replaces search results wholesale on a new search", () => {
    const next = reducer(stateWith([], [product("a", 5)]), {
      type: Searchproduct.fulfilled.type,
      payload: [product("b", 1)],
    });
    expect(next.searchdata.map((p) => p._id)).toEqual(["b"]);
    expect(next.issearchdata).toBe(false);
  });
});
