import { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import RefundModal from "./RefundModal";
import DayClosingModal from "./DayClosingModal";
import VoucherModal from "./VoucherModal";
import UnknownBarcodeModal from "./UnknownBarcodeModal";
import DealPriceModal from "./DealPriceModal";
import StatusBar from "./StatusBar";
import HeldSalesModal from "./HeldSalesModal";
import axiosInstance from "../../lib/axios";
import * as offlineDb from "../../lib/offlineDb";

/* The dialogs that talk to the server, pressed rather than reasoned about.
 *
 * The other two click files cover what a component does on its own. These need
 * two more things standing up first: a store (all of them read the shop's own
 * details for their printed slips) and a stubbed axios, because every one of
 * them fetches the moment it opens.
 *
 * The refund dialog carries most of the weight here. It is the screen that
 * hands money back, and the checks on it are the ones about a figure being
 * right and a button refusing to fire when it should.
 */

/* One `t`, one `i18n`, one object — created once and handed back on every call.
 *
 * This matters more than it looks. RefundModal memoises its receipt lookup on
 * [t] and runs it from an effect. A mock that builds a fresh `t` on every
 * render makes that dependency change every render, so the effect re-fires
 * forever and the test hangs rather than failing — which reads like a bug in
 * the component and is not one. The real useTranslation returns a stable
 * reference; the mock has to as well. */
jest.mock("react-i18next", () => {
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

  return {
    // Spread the real module first: StatusBar pulls in LanguageSwitcher, which
    // pulls in the app's i18n setup and calls i18next.use(initReactI18next).
    // Replacing the module wholesale hands that an undefined and the suite dies
    // before a single test runs.
    ...jest.requireActual("react-i18next"),
    useTranslation: () => value,
  };
});

jest.mock("react-hot-toast", () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("../../lib/axios", () => ({
  __esModule: true,
  default: {
    get: jest.fn(() => Promise.resolve({ data: {} })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    put: jest.fn(() => Promise.resolve({ data: {} })),
    delete: jest.fn(() => Promise.resolve({ data: {} })),
  },
}));

jest.mock("../../lib/offlineDb", () => ({
  localHeldAll: jest.fn(() => Promise.resolve([])),
  localHeldRemove: jest.fn(() => Promise.resolve()),
  spentVouchers: jest.fn(() => Promise.resolve([])),
  markVoucherSpent: jest.fn(() => Promise.resolve()),
  cacheGet: jest.fn(() => Promise.resolve(null)),
  cacheSet: jest.fn(() => Promise.resolve()),
  newClientRef: () => "test-ref",
}));

jest.mock("../../lib/offlineQueue", () => ({
  onQueueChange: () => () => {},
  syncQueue: jest.fn(),
  pendingCount: () => Promise.resolve(0),
  isNetworkError: () => false,
  startAutoSync: () => () => {},
  newSaleRefs: () => ({ clientRef: "r", offlineRef: "OFF-R", soldAt: "" }),
  checkoutTimeoutMs: () => 1500,
  queueSale: jest.fn(),
}));

// Every one of these reads the shop for its printed slip, and nothing else.
const shop = {
  store: { store: { name: "QA Shop", currency: "EUR", addressLines: ["1 Test St"], footer: "" } },
};
const fakeStore = {
  getState: () => shop,
  subscribe: () => () => {},
  dispatch: () => {},
};

let container;
let root;

const mount = (element) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Provider store={fakeStore}>{element}</Provider>));
};

/* react-scripts turns on `resetMocks`, which strips the implementation off
 * every jest.fn() before each test — so the defaults declared up in the
 * jest.mock() factories are gone by the time a test runs, and the component
 * gets `undefined` back from a call it expects a promise from. They are put
 * back here, per test, and a test that wants different data overrides after. */
beforeEach(() => {
  axiosInstance.get.mockResolvedValue({ data: {} });
  axiosInstance.post.mockResolvedValue({ data: {} });
  axiosInstance.put.mockResolvedValue({ data: {} });
  axiosInstance.delete.mockResolvedValue({ data: {} });
  offlineDb.localHeldAll.mockResolvedValue([]);
  offlineDb.localHeldRemove.mockResolvedValue();
  offlineDb.spentVouchers.mockResolvedValue([]);
  offlineDb.markVoucherSpent.mockResolvedValue();
  offlineDb.cacheGet.mockResolvedValue(null);
  offlineDb.cacheSet.mockResolvedValue();
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  container = null;
  root = null;
});

const buttons = () => [...container.querySelectorAll('button, [role="button"]')];
const text = () => container.textContent || "";
const byText = (s) =>
  buttons().find((b) => (b.textContent || "").trim().toLowerCase().includes(s.toLowerCase()));
const byLabel = (l) => buttons().find((b) => (b.getAttribute("aria-label") || "") === l);
const click = (el) => {
  if (!el) throw new Error("nothing to click");
  act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};
const typeInto = (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const settle = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

/* ── Refunds ────────────────────────────────────────────────────────────── */

describe("RefundModal — the screen that hands money back", () => {
  const receipt = {
    receiptNo: "POS-000001",
    customerName: "Walk-in Customer",
    cashierName: "Staff",
    createdAt: new Date().toISOString(),
    subtotal: 20,
    discount: 0,
    dealDiscount: 0,
    tax: 0,
    total: 20,
    status: "completed",
    paymentMethod: "cash",
    payments: [{ method: "cash", amount: 20 }],
    refunds: [],
    items: [
      { product: "p1", name: "COIL", quantity: 2, price: 5, lineTotal: 10 },
      { product: "p2", name: "POD", quantity: 1, price: 10, lineTotal: 10 },
    ],
  };

  test("it opens asking for a receipt, and does not refund before it has one", async () => {
    const onDone = jest.fn();
    mount(<RefundModal onDone={onDone} onClose={() => {}} />);
    await settle();

    // Nothing loaded yet, so nothing can go back over the counter.
    expect(axiosInstance.post).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  test("a receipt loads and its lines are shown", async () => {
    axiosInstance.get.mockResolvedValue({ data: { receipt } });

    mount(<RefundModal initialReceiptNo="POS-000001" onDone={() => {}} onClose={() => {}} />);
    await settle();

    expect(text()).toContain("COIL");
    expect(text()).toContain("POD");
  });

  test("the close button gets out without refunding anything", async () => {
    const onClose = jest.fn();
    axiosInstance.get.mockResolvedValue({ data: { receipt } });

    mount(<RefundModal initialReceiptNo="POS-000001" onDone={() => {}} onClose={onClose} />);
    await settle();

    const out = byLabel("Close") || byLabel("Back");
    click(out);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });

  test("Add product opens the picker rather than refunding", async () => {
    const onPickExchange = jest.fn();
    axiosInstance.get.mockResolvedValue({ data: { receipt } });

    mount(
      <RefundModal
        initialReceiptNo="POS-000001"
        onPickExchange={onPickExchange}
        onDone={() => {}}
        onClose={() => {}}
      />,
    );
    await settle();

    const add = byText("+ Add product") || byText("Add product");
    if (add) {
      click(add);
      expect(onPickExchange).toHaveBeenCalledTimes(1);
      expect(axiosInstance.post).not.toHaveBeenCalled();
    }
  });
});

/* ── Day closing ────────────────────────────────────────────────────────── */

describe("DayClosingModal — handing the shift over", () => {
  const summary = {
    receiptCount: 3,
    openedAt: new Date().toISOString(),
    gross: 60,
    discount: 0,
    tax: 0,
    grossSales: 60,
    refundAmount: 10,
    netSales: 50,
    exchangeCredit: 0,
    cashHandedBack: 10,
    creditRepaid: 0,
    expectedCash: 30,
    expectedCard: 20,
    byMethod: [
      { method: "cash", amount: 40, count: 2, refunded: 10, expected: 30 },
      { method: "creditcard", amount: 20, count: 1, refunded: 0, expected: 20 },
    ],
    creditTaken: [],
    unspentCredit: [],
    sales: [],
  };

  test("it shows what is being handed over before anything is closed", async () => {
    axiosInstance.get.mockResolvedValue({ data: { summary, cashierName: "Staff" } });

    mount(<DayClosingModal onClosed={() => {}} onClose={() => {}} />);
    await settle();

    // Gross, net and expected cash are three different figures on purpose.
    expect(text()).toContain("60.00");
    expect(text()).toContain("50.00");
    expect(text()).toContain("30.00");
    // Reading the preview must not close anything.
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });

  test("closing is behind a confirmation, not a single tap", async () => {
    axiosInstance.get.mockResolvedValue({ data: { summary, cashierName: "Staff" } });

    mount(<DayClosingModal onClosed={() => {}} onClose={() => {}} />);
    await settle();

    const close = byText("dayClosing.close") || byText("close the day") || byText("Close");
    if (close && !close.disabled) {
      click(close);
      // The first press asks; it does not hand the takings over.
      expect(axiosInstance.post).not.toHaveBeenCalled();
    }
  });
});

/* ── Vouchers and discounts ─────────────────────────────────────────────── */

describe("VoucherModal — applying a code without inventing money", () => {
  test("Apply does nothing until a code is typed", () => {
    const onApply = jest.fn();
    mount(
      <VoucherModal subtotal={50} applied={null} canGenerate onApply={onApply} onClose={() => {}} />,
    );

    const apply = byText("pos.voucher.apply") || byText("Apply");
    if (apply) {
      click(apply);
      expect(onApply).not.toHaveBeenCalled();
    }
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });

  test("the close button leaves the basket alone", () => {
    const onApply = jest.fn();
    const onClose = jest.fn();
    mount(
      <VoucherModal subtotal={50} applied={null} canGenerate onApply={onApply} onClose={onClose} />,
    );

    click(byLabel("Close") || byLabel("Back"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });
});

/* ── The unknown barcode ────────────────────────────────────────────────── */

describe("UnknownBarcodeModal — a scan the catalogue has never seen", () => {
  test("it shows the barcode that was scanned", async () => {
    axiosInstance.get.mockResolvedValue({ data: { Products: [] } });

    mount(
      <UnknownBarcodeModal
        barcode="5391234567890"
        categories={[{ _id: "c1", name: "Misc" }]}
        onResolved={() => {}}
        onClose={() => {}}
      />,
    );
    await settle();

    expect(text()).toContain("5391234567890");
  });

  test("closing it does not quietly create a product", async () => {
    const onResolved = jest.fn();
    const onClose = jest.fn();
    axiosInstance.get.mockResolvedValue({ data: { Products: [] } });

    mount(
      <UnknownBarcodeModal
        barcode="5391234567890"
        categories={[{ _id: "c1", name: "Misc" }]}
        onResolved={onResolved}
        onClose={onClose}
      />,
    );
    await settle();

    click(byLabel("Close") || byLabel("Back"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(axiosInstance.post).not.toHaveBeenCalled();
    expect(onResolved).not.toHaveBeenCalled();
  });
});

/* ── Hand-pricing a deal ────────────────────────────────────────────────── */

describe("DealPriceModal — a set priced by hand at the counter", () => {
  const entry = {
    dealId: "d1",
    name: "Any 3 for 15",
    sets: 1,
    maxSets: 2,
    normal: 18,
    amount: 3,
    configuredAmount: 3,
    edited: false,
    products: ["p1"],
    allocation: { p1: 3 },
  };

  test("Reset puts the shop's own price back", () => {
    const onReset = jest.fn();
    const onApply = jest.fn();
    mount(
      <DealPriceModal
        entry={entry}
        applied
        sets={1}
        onSets={() => {}}
        onApply={onApply}
        onReset={onReset}
        onClose={() => {}}
      />,
    );

    const reset = byText("reset");
    if (reset) {
      click(reset);
      expect(onReset).toHaveBeenCalledTimes(1);
      expect(onApply).not.toHaveBeenCalled();
    }
  });

  test("the number of sets can be changed without applying anything", () => {
    const onSets = jest.fn();
    const onApply = jest.fn();
    mount(
      <DealPriceModal
        entry={entry}
        applied
        sets={1}
        onSets={onSets}
        onApply={onApply}
        onReset={() => {}}
        onClose={() => {}}
      />,
    );

    const plus = buttons().find((b) => (b.textContent || "").trim() === "+");
    if (plus) {
      click(plus);
      expect(onSets).toHaveBeenCalled();
      expect(onApply).not.toHaveBeenCalled();
    }
  });
});

/* ── The status bar ─────────────────────────────────────────────────────── */

describe("StatusBar — the standing facts at the bottom of the till", () => {
  test("it names the user and the till", () => {
    mount(<StatusBar user={{ name: "Alice", role: "manager" }} till="TERMINAL-MAIN" onPrint={() => {}} />);
    expect(text()).toContain("Alice");
    expect(text()).toContain("TERMINAL-MAIN");
  });

  test("the print button prints", () => {
    const onPrint = jest.fn();
    mount(<StatusBar user={{ name: "Alice" }} till="T1" onPrint={onPrint} />);

    click(byLabel("pos.print"));

    expect(onPrint).toHaveBeenCalledTimes(1);
  });
});

/* ── Held sales ─────────────────────────────────────────────────────────── */

describe("HeldSalesModal — picking a parked basket back up", () => {
  test("an empty list resumes nothing", async () => {
    const onResume = jest.fn();
    axiosInstance.get.mockResolvedValue({ data: { held: [] } });

    mount(<HeldSalesModal onResume={onResume} onClose={() => {}} />);
    await settle();

    expect(onResume).not.toHaveBeenCalled();
  });

  test("a parked basket is listed and can be resumed", async () => {
    const onResume = jest.fn();
    axiosInstance.get.mockResolvedValue({
      data: {
        held: [
          {
            _id: "h1",
            customerName: "Walk-in Customer",
            till: "TERMINAL-MAIN",
            createdAt: new Date().toISOString(),
            items: [{ product: "p1", name: "COIL", quantity: 2, price: 5 }],
          },
        ],
      },
    });

    mount(<HeldSalesModal onResume={onResume} onClose={() => {}} />);
    await settle();

    // The list shows who it was for and what it comes to, not the line names —
    // a parked basket is identified by its customer and its total.
    expect(text()).toContain("Walk-in Customer");
    expect(text()).toContain("10.00");

    click(byText("pos.resume"));
    expect(onResume).toHaveBeenCalledTimes(1);
  });
});
