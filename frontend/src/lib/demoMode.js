export const DEMO_EMAIL = "demo@e360pro.com";
export const DEMO_PASSWORD = "Demo@Cliffs2026!";

const DEMO_FLAG_KEY = "e360_demo_mode";
const DEMO_DATA_KEY = "e360_demo_data";
const DEMO_SESSION_KEY = "sessionExpiresAt";

const nowIso = () => new Date().toISOString();

const emptyDemoData = () => ({
  products: [],
  categories: [
    {
      _id: "miscellaneous",
      name: "Miscellaneous",
      productCount: 0,
      isDemo: true,
    },
  ],
  heldSales: [],
  receipts: [],
  counters: {
    product: 1,
    category: 1,
    receipt: 1,
    held: 1,
  },
});

const safeStorage = () => {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
};

export const isDemoCredentials = (credentials = {}) =>
  String(credentials.email || "").trim().toLowerCase() === DEMO_EMAIL &&
  String(credentials.password || "") === DEMO_PASSWORD;

export const getDemoUser = () => ({
  _id: "demo-user",
  id: "demo-user",
  name: "Demo Client",
  email: DEMO_EMAIL,
  role: "admin",
  isDemo: true,
});

export const isDemoMode = () => safeStorage()?.getItem(DEMO_FLAG_KEY) === "1";

export const getDemoState = () => {
  const storage = safeStorage();
  if (!storage) return emptyDemoData();

  try {
    const parsed = JSON.parse(storage.getItem(DEMO_DATA_KEY));
    return {
      ...emptyDemoData(),
      ...(parsed || {}),
      counters: {
        ...emptyDemoData().counters,
        ...(parsed?.counters || {}),
      },
    };
  } catch {
    return emptyDemoData();
  }
};

const saveDemoState = (nextState) => {
  const storage = safeStorage();
  if (!storage) return nextState;
  storage.setItem(DEMO_DATA_KEY, JSON.stringify(nextState));
  return nextState;
};

export const clearDemoMode = () => {
  const storage = safeStorage();
  if (!storage) return;
  const wasDemo = storage.getItem(DEMO_FLAG_KEY) === "1" || Boolean(storage.getItem(DEMO_DATA_KEY));

  storage.removeItem(DEMO_FLAG_KEY);
  storage.removeItem(DEMO_DATA_KEY);
  storage.removeItem("token");
  storage.removeItem("user");
  storage.removeItem("authUser");
  storage.removeItem(DEMO_SESSION_KEY);

  // POS offline helpers also use browser storage. Keep the demo promise tight:
  // logout means the whole practice run disappears.
  if (wasDemo) {
    Object.keys(storage)
      .filter((key) => key.toLowerCase().includes("pos") || key.toLowerCase().includes("offline"))
      .forEach((key) => storage.removeItem(key));
  }
};

export const enableDemoMode = () => {
  const storage = safeStorage();
  const sessionExpiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
  const user = getDemoUser();

  clearDemoMode();

  if (storage) {
    storage.setItem(DEMO_FLAG_KEY, "1");
    storage.setItem(DEMO_DATA_KEY, JSON.stringify(emptyDemoData()));
    storage.setItem("user", JSON.stringify(user));
    storage.setItem(DEMO_SESSION_KEY, sessionExpiresAt);
  }

  return {
    user,
    sessionExpiresAt,
    message: "Demo mode started",
  };
};

const asUrl = (url = "") =>
  String(url)
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/?api\/?/i, "")
    .replace(/^\/+/, "");

const readPayload = (data) => {
  if (!data) return {};

  if (typeof FormData !== "undefined" && data instanceof FormData) {
    const result = {};
    data.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  return data;
};

const categoryName = (categoryId, categories) =>
  categories.find((category) => category._id === categoryId)?.name || "Miscellaneous";

const toProduct = (payload, state, barcodeFallback = "") => {
  const id = `demo-product-${state.counters.product}`;
  state.counters.product += 1;

  const categoryId = payload.Category || payload.category || "miscellaneous";
  return {
    _id: id,
    id,
    name: String(payload.name || payload.Name || "Demo product").trim(),
    Desciption: payload.Desciption || payload.description || "",
    Price: Number(payload.Price || payload.price || 0),
    quantity: Number(payload.quantity || payload.stock || payload.openingStock || 0),
    barcode: String(payload.barcode || barcodeFallback || "").trim(),
    sku: String(payload.sku || "").trim(),
    Category: {
      _id: categoryId,
      name: categoryName(categoryId, state.categories),
    },
    createdAt: nowIso(),
    isDemo: true,
  };
};

const response = (config, data = {}, status = 200) => ({
  data,
  status,
  statusText: status >= 400 ? "Error" : "OK",
  headers: {},
  config,
});

const errorResponse = (config, status, message) => ({
  isAxiosError: true,
  config,
  response: response(config, { message }, status),
});

const receiptFromCheckout = (payload, state) => {
  const products = state.products;
  const items = (payload.items || []).map((item) => {
    const product = products.find((entry) => entry._id === String(item.product));
    const quantity = Number(item.quantity || 1);
    const price = Number(product?.Price || item.price || 0);
    if (product) {
      product.quantity = Math.max(0, Number(product.quantity || 0) - quantity);
    }
    return {
      product: product?._id || item.product,
      name: product?.name || item.name || "Demo product",
      barcode: product?.barcode || item.barcode || "",
      quantity,
      price,
      lineTotal: price * quantity,
    };
  });
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const discount = Number(payload.discount || 0);
  const total = Math.max(0, subtotal - discount);
  const tendered = (payload.payments || []).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const receiptNo = `DEMO-${String(state.counters.receipt).padStart(5, "0")}`;
  state.counters.receipt += 1;

  return {
    _id: receiptNo,
    receiptNo,
    customerName: payload.customerName || "Walk-in Customer",
    cashierName: getDemoUser().name,
    paymentMethod: payload.payments?.length === 1 ? payload.payments[0].method : "split",
    payments: payload.payments || [],
    items,
    subtotal,
    discount,
    dealDiscount: 0,
    taxRate: Number(payload.taxRate || 0),
    tax: 0,
    total,
    amountTendered: tendered,
    changeDue: Math.max(0, tendered - total),
    createdAt: nowIso(),
    demo: true,
  };
};

export const handleDemoAxiosRequest = (config = {}) => {
  if (!isDemoMode()) return null;

  const method = String(config.method || "get").toLowerCase();
  const url = asUrl(config.url);
  const payload = readPayload(config.data);
  const state = getDemoState();

  if (url.includes("auth/logout")) {
    clearDemoMode();
    return { response: response(config, { success: true }) };
  }

  if (url.includes("auth/")) {
    return { response: response(config, { user: getDemoUser(), users: [], staff: [], managers: [] }) };
  }

  if (method === "get" && url.includes("product/barcode/")) {
    const code = decodeURIComponent(url.split("product/barcode/")[1] || "");
    const product = state.products.find((entry) => entry.barcode === code || entry.sku === code);
    if (!product) return { error: errorResponse(config, 404, "Barcode is not linked to any demo product yet") };
    return { response: response(config, { product }) };
  }

  if (method === "get" && url.includes("product/getproduct")) {
    return { response: response(config, { Products: state.products }) };
  }

  if (method === "get" && url.includes("product/searchproduct")) {
    const query = String(config.params?.query || new URLSearchParams(url.split("?")[1] || "").get("query") || "")
      .trim()
      .toLowerCase();
    const Products = query
      ? state.products.filter((product) => product.name?.toLowerCase().includes(query))
      : state.products;
    return { response: response(config, { Products, products: Products }) };
  }

  if (method === "post" && (url.includes("product/addproduct") || url.includes("product/quick-add"))) {
    const product = toProduct(payload, state);
    state.products.push(product);
    saveDemoState(state);
    return { response: response(config, { product, message: "Demo product created" }, 201) };
  }

  if (method === "put" && /product\/[^/]+\/barcode/.test(url)) {
    const productId = url.split("/")[1];
    const product = state.products.find((entry) => entry._id === productId);
    if (!product) return { error: errorResponse(config, 404, "Demo product not found") };
    product.barcode = String(payload.barcode || "").trim();
    saveDemoState(state);
    return { response: response(config, { product, message: "Demo barcode linked" }) };
  }

  if ((method === "put" || method === "patch") && url.includes("product/editproduct/")) {
    const productId = url.split("product/editproduct/")[1];
    const product = state.products.find((entry) => entry._id === productId);
    if (product) Object.assign(product, toProduct({ ...product, ...payload }, { ...state, counters: { ...state.counters } }));
    saveDemoState(state);
    return { response: response(config, { product, message: "Demo product updated" }) };
  }

  if (method === "delete" && url.includes("product/removeproduct/")) {
    // The real route now takes ?confirm=DELETE; keep the id, drop the query.
    const productId = url.split("product/removeproduct/")[1].split("?")[0];
    state.products = state.products.filter((product) => product._id !== productId);
    saveDemoState(state);
    return { response: response(config, { success: true }) };
  }

  if (method === "get" && url.includes("product/getTopProductsByQuantity")) {
    return { response: response(config, { topProducts: state.products.slice(0, 5) }) };
  }

  if (method === "get" && url.includes("category/getcategory")) {
    const categoriesWithCount = state.categories.map((category) => ({
      ...category,
      productCount: state.products.filter((product) => product.Category?._id === category._id).length,
    }));
    return { response: response(config, { categoriesWithCount }) };
  }

  if (method === "post" && url.includes("category/createcategory")) {
    const category = {
      _id: `demo-category-${state.counters.category}`,
      name: payload.name || payload.CategoryName || "Demo category",
      productCount: 0,
      isDemo: true,
    };
    state.counters.category += 1;
    state.categories.push(category);
    saveDemoState(state);
    return { response: response(config, category, 201) };
  }

  if (method === "get" && url.includes("pos/held")) {
    return { response: response(config, { heldSales: state.heldSales, sales: state.heldSales }) };
  }

  if (method === "post" && url.includes("pos/hold")) {
    const held = {
      _id: `demo-held-${state.counters.held}`,
      ...payload,
      createdAt: nowIso(),
      demo: true,
    };
    state.counters.held += 1;
    state.heldSales.push(held);
    saveDemoState(state);
    return { response: response(config, { heldSale: held, sale: held }) };
  }

  if (method === "delete" && url.includes("pos/held/")) {
    const heldId = url.split("pos/held/")[1];
    state.heldSales = state.heldSales.filter((held) => held._id !== heldId);
    saveDemoState(state);
    return { response: response(config, { success: true }) };
  }

  if (method === "post" && url.includes("pos/checkout")) {
    const receipt = receiptFromCheckout(payload, state);
    state.receipts.push(receipt);
    saveDemoState(state);
    return { response: response(config, { receipt }) };
  }

  if (url.includes("pos/void")) {
    return { response: response(config, { success: true }) };
  }

  if (url.includes("sales") || url.includes("orders") || url.includes("report")) {
    return { response: response(config, { sales: state.receipts, orders: [], reports: [], data: [] }) };
  }

  if (url.includes("voucher")) {
    return { response: response(config, { vouchers: [], voucher: null, data: [] }) };
  }

  if (url.includes("notification")) {
    return { response: response(config, { notifications: [], data: [] }) };
  }

  if (method === "get") {
    return {
      response: response(config, {
        Products: [],
        categoriesWithCount: [],
        products: [],
        categories: [],
        data: [],
        items: [],
        success: true,
      }),
    };
  }

  return { response: response(config, { success: true, demo: true, ...payload }) };
};
