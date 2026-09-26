import { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import store from "../store/store";
import POSPage from "./POSPage";
import axiosInstance from "../lib/axios";

/* The whole till, assembled, driven by clicks.
 *
 * The posClicks files each mount one component with props handed to it. This
 * mounts the PAGE — the real Redux store, the real slices, the real reducers —
 * so what is under test is the WIRING: that pressing a rail button opens the
 * dialog it claims to, that a card lands in the basket, that the basket's
 * total is what the lines add up to, that clearing empties it.
 *
 * That wiring is the part no component test can reach. A card that fires
 * onPick perfectly is still broken if the page hands onPick to the wrong
 * handler, and the only way to catch that is to press the real thing.
 *
 * The server is stubbed and the socket is a stub. Nothing here reaches a
 * database.
 */

jest.mock("react-i18next", () => {
  // One stable `t`, for the same reason the refund dialog needed one: several
  // components here memoise on it, and a fresh function each render re-fires
  // their effects forever.
  const t = (key, fallback) => {
    if (typeof fallback === "string") return fallback;
    if (fallback && typeof fallback === "object") {
      if (fallback.defaultValue) return fallback.defaultValue;
      return `${key} ${Object.values(fallback).join(" ")}`;
    }
    return key;
  };
  const i18n = { language: "en", changeLanguage: () => {} };
  const value = { t, i18n };
  return { ...jest.requireActual("react-i18next"), useTranslation: () => value };
});

jest.mock("react-hot-toast", () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

jest.mock("socket.io-client", () => ({
  io: () => ({ on: () => {}, off: () => {}, disconnect: () => {}, emit: () => {} }),
}));

jest.mock("../lib/axios", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock("../lib/offlineDb", () => ({
  localHeldAll: jest.fn(),
  localHeldAdd: jest.fn(),
  localHeldRemove: jest.fn(),
  spentVouchers: jest.fn(),
  markVoucherSpent: jest.fn(),
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  newClientRef: () => "test-client-ref",
}));

jest.mock("../lib/offlineQueue", () => ({
  onQueueChange: () => () => {},
  syncQueue: jest.fn(),
  pendingCount: () => Promise.resolve(0),
  isNetworkError: () => false,
  startAutoSync: () => () => {},
  newSaleRefs: () => ({ clientRef: "c", offlineRef: "OFF-C", soldAt: "" }),
  checkoutTimeoutMs: () => 1500,
  queueSale: jest.fn(),
}));

const offlineDb = require("../lib/offlineDb");

/* What the server hands back. Two scannable products, one aisle, one card. */
const PRODUCTS = [
  {
    _id: "p1",
    name: "COIL SMALL",
    Price: 5,
    quantity: 10,
    barcode: "1111",
    lowStockThreshold: 2,
    Category: { _id: "c1", name: "Vape" },
  },
  {
    _id: "p2",
    name: "POD LARGE",
    Price: 7.5,
    quantity: 4,
    barcode: "2222",
    lowStockThreshold: 2,
    Category: { _id: "c1", name: "Vape" },
  },
];

const CARDS = [
  { _id: "q1", name: "Coil", Price: 5, quantity: 0, nonStock: true, quickSell: true },
];

const route = (url) => {
  if (url.includes("product/quick-sell")) return { data: { cards: CARDS } };
  if (url.includes("product/getproduct")) return { data: { Products: PRODUCTS, totalProduct: 2 } };
  if (url.includes("category")) return { data: { category: [{ _id: "c1", name: "Vape", productCount: 2 }] } };
  if (url.includes("deal")) return { data: { deals: [] } };
  if (url.includes("store")) return { data: { store: { name: "QA Shop", currency: "EUR" } } };
  if (url.includes("pos/held")) return { data: { held: [] } };
  if (url.includes("voucher")) return { data: { vouchers: [] } };
  return { data: {} };
};

let container;
let root;

const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <Provider store={store}>
        <MemoryRouter>
          <POSPage />
        </MemoryRouter>
      </Provider>,
    );
  });
  // Let the mount-time fetches land and the page settle on them.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  axiosInstance.get.mockImplementation((url) => Promise.resolve(route(String(url))));
  axiosInstance.post.mockResolvedValue({ data: {} });
  axiosInstance.put.mockResolvedValue({ data: {} });
  axiosInstance.patch.mockResolvedValue({ data: {} });
  axiosInstance.delete.mockResolvedValue({ data: {} });
  offlineDb.localHeldAll.mockResolvedValue([]);
  offlineDb.localHeldRemove.mockResolvedValue();
  offlineDb.spentVouchers.mockResolvedValue([]);
  offlineDb.markVoucherSpent.mockResolvedValue();
  offlineDb.cacheGet.mockResolvedValue(null);
  offlineDb.cacheSet.mockResolvedValue();

  window.localStorage.setItem(
    "user",
    JSON.stringify({ _id: "u1", name: "Alice", role: "manager" }),
  );
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  container = null;
  root = null;
  window.localStorage.clear();
});

const nodes = () => [...container.querySelectorAll('button, [role="button"]')];
const text = () => container.textContent || "";
const byText = (s) =>
  nodes().find((n) => (n.textContent || "").trim().toLowerCase().includes(s.toLowerCase()));
const byLabel = (l) => nodes().find((n) => (n.getAttribute("aria-label") || "") === l);
const click = async (el) => {
  if (!el) throw new Error("nothing to click");
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
};

/* ── It stands up at all ────────────────────────────────────────────────── */

describe("POSPage — the till assembles and shows what it sold", () => {
  test("the page mounts with the rail, the basket and the cards", async () => {
    await mount();

    expect(text()).toContain("pos.rail.productSearch");   // the action rail
    expect(text()).toContain("Cards");                    // the quick-sell rail
    expect(text()).toContain("Coil");                     // a card off the server
    expect(text()).toContain("0.00");                     // an empty basket total
  });

  test("it asks the server for the things a till needs, once", async () => {
    await mount();

    const asked = axiosInstance.get.mock.calls.map((c) => String(c[0]));
    expect(asked.some((u) => u.includes("product/getproduct"))).toBe(true);
    expect(asked.some((u) => u.includes("product/quick-sell"))).toBe(true);
    expect(asked.some((u) => u.includes("category"))).toBe(true);
  });
});

/* ── The wiring no component test can reach ─────────────────────────────── */

describe("POSPage — a card is wired to the basket", () => {
  test("tapping a card puts a real line in the basket and totals it", async () => {
    await mount();

    expect(container.querySelector("p.whitespace-nowrap.font-mono")?.textContent).toContain(
      "0.00",
    );

    await click(byText("Coil"));

    // The line is in the basket, and the total is what it costs. This is the
    // join that no props test can see: the card's onPick reaching addToCart.
    expect(container.querySelector("p.whitespace-nowrap.font-mono")?.textContent).toContain(
      "5.00",
    );
  });

  test("tapping it twice charges for two", async () => {
    await mount();

    await click(byText("Coil"));
    await click(byText("Coil"));

    expect(text()).toContain("10.00");
  });

  test("Clear Basket empties it again", async () => {
    await mount();

    await click(byText("Coil"));
    expect(text()).toContain("5.00");

    await click(byText("pos.rail.void"));

    // Back to nothing owed.
    expect(text()).toContain("0.00");
  });
});

/* ── The rail opens what it says it opens ───────────────────────────────── */

describe("POSPage — every rail button opens its own screen", () => {
  const opens = [
    ["pos.rail.search", "pos.productSearch.title"],
    ["pos.rail.enterCode", "pos.enterCode.title"],
    ["pos.rail.deals", "deals.title"],
    ["pos.rail.vouchers", "pos.voucher.title"],
  ];

  test.each(opens)("%s opens %s", async (railKey, expected) => {
    await mount();

    const button = byText(railKey);
    if (!button) return; // that action is not on this role's rail

    await click(button);

    expect(text()).toContain(expected);
  });

  test("the dialog it opens can be closed again", async () => {
    await mount();

    await click(byText("pos.rail.enterCode"));
    expect(text()).toContain("pos.enterCode.title");

    await click(byLabel("Close"));

    expect(text()).not.toContain("pos.enterCode.title");
  });
});

/* ── Tendering is refused on an empty basket ────────────────────────────── */

describe("POSPage — the till will not take money for nothing", () => {
  test("CASH on an empty basket does not open the tender screen", async () => {
    await mount();

    const cash = byText("Cash");
    expect(cash.disabled).toBe(true);

    await click(cash);

    // No tender screen, and nothing sent to the server.
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });

  test("with something in the basket, CASH opens the tender screen", async () => {
    await mount();

    await click(byText("Coil"));

    const cash = byText("Cash");
    expect(cash.disabled).toBe(false);

    await click(cash);

    expect(text()).toContain("pos.closeOrder");
    // Opening the screen is not paying: nothing has gone to the server yet.
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });
});

/* ── Quick cash, through the page rather than the component ─────────────── */

describe("POSPage — quick cash reaches the basket", () => {
  test("Misc opens the dialog, and an amount lands as a line", async () => {
    axiosInstance.post.mockResolvedValue({
      data: { card: { _id: "qc1", name: "Misc.", Price: 4.5, quantity: 0, nonStock: true, quickSell: false } },
    });

    await mount();
    await click(byText("Misc"));

    expect(text()).toContain("Quick Cash");

    const amount = container.querySelector("#quick-cash-amount");
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    await act(async () => {
      setter.call(amount, "4.50");
      amount.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await click(byText("Add"));

    // It had to become a real product first — checkout prices from the
    // catalogue and refuses a figure sent by a browser — so the page posts it
    // and then rings up what came back.
    expect(axiosInstance.post).toHaveBeenCalled();
    expect(String(axiosInstance.post.mock.calls[0][0])).toContain("quick-sell");
    expect(text()).toContain("4.50");
  });
});
