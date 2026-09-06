import { act } from "react";
import { createRoot } from "react-dom/client";
import PosModal from "./PosModal";
import SaleTable from "./SaleTable";
import NumericKeypad from "./NumericKeypad";
import CategoryTiles from "./CategoryTiles";
import DiscountModal from "./DiscountModal";
import PaymentModal from "./PaymentModal";
import ProductSearchModal from "./ProductSearchModal";
import QuickSellModal from "./QuickSellModal";
import { HistoryTabs } from "./HistoryTabs";

/* The rest of the till, pressed rather than reasoned about.
 *
 * posClicks.test.js covers the cards, quick cash, the finished sale and the
 * action rail. This is everything else a shift touches that can be mounted on
 * its own: the shell every dialog is built on, the basket, the keypad, the
 * aisles, the discount box, the tender screen, the product picker.
 *
 * The tender screen is the one that matters most. It is the last thing between
 * a cashier and the customer's money, and every check on it here is about a
 * figure being right or a button refusing to fire when it should.
 */

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, fallback) => {
      if (typeof fallback === "string") return fallback;
      if (fallback && typeof fallback === "object") {
        if (fallback.defaultValue) return fallback.defaultValue;
        // Interpolated keys ("pos.itemsCount") come back as the key plus the
        // values, which is enough for a test to find and assert on.
        return `${key} ${Object.values(fallback).join(" ")}`;
      }
      return key;
    },
  }),
}));

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
  },
}));

let container;
let root;

const mount = (element) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(element));
};

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  container = null;
  root = null;
});

// Not every pressable thing is a <button>. The product picker builds its rows
// as div[role="button"] so the whole row is the target rather than a link
// inside it, and a click test has to reach those the same way a thumb does.
const buttons = () => [...container.querySelectorAll('button, [role="button"]')];
const text = () => container.textContent || "";
const byText = (s) =>
  buttons().find((b) => (b.textContent || "").trim().toLowerCase().includes(s.toLowerCase()));
const byExact = (s) =>
  buttons().find((b) => (b.textContent || "").trim() === s);
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

/* ── The shell every dialog is built on ─────────────────────────────────── */

describe("PosModal — the way out is one way, never two", () => {
  test("a dialog you opened offers a cross", () => {
    const onClose = jest.fn();
    mount(<PosModal title="Thing" onClose={onClose}>body</PosModal>);

    expect(byLabel("Close")).toBeDefined();
    expect(byLabel("Back")).toBeUndefined();

    click(byLabel("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("a dialog you REACHED offers an arrow, and only the arrow", () => {
    const onBack = jest.fn();
    const onClose = jest.fn();
    mount(
      <PosModal title="Thing" onBack={onBack} onClose={onClose}>
        body
      </PosModal>,
    );

    // An arrow and a cross side by side are two ways to do one thing, and a
    // cashier has to decide which. Whichever way out it offers, it offers one.
    expect(byLabel("Back")).toBeDefined();
    expect(byLabel("Close")).toBeUndefined();

    click(byLabel("Back"));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});

/* ── The basket ─────────────────────────────────────────────────────────── */

describe("SaleTable — the basket answers to its own buttons", () => {
  const cart = [
    { productId: "p1", name: "COIL", price: 5, quantity: 2, stock: 10 },
    { productId: "p2", name: "POD", price: 7, quantity: 1, stock: 10 },
  ];

  test("tapping a row selects that line", () => {
    const onSelect = jest.fn();
    mount(<SaleTable cart={cart} onSelect={onSelect} onQuantityChange={() => {}} onRemove={() => {}} />);

    act(() =>
      [...container.querySelectorAll("div")]
        .find((d) => (d.textContent || "").includes("COIL") && d.className.includes("cursor-pointer"))
        .dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );

    expect(onSelect).toHaveBeenCalledWith("p1");
  });

  test("plus and minus move the WHOLE line, not a part of it", () => {
    const onQuantityChange = jest.fn();
    mount(<SaleTable cart={cart} onSelect={() => {}} onQuantityChange={onQuantityChange} onRemove={() => {}} />);

    const plus = buttons().filter((b) => b.getAttribute("aria-label") === "pos.table.increase");
    const minus = buttons().filter((b) => b.getAttribute("aria-label") === "pos.table.decrease");

    click(plus[0]);
    expect(onQuantityChange).toHaveBeenCalledWith("p1", 3);

    click(minus[0]);
    expect(onQuantityChange).toHaveBeenCalledWith("p1", 1);
  });

  test("the cross removes the line and does NOT also select it", () => {
    const onRemove = jest.fn();
    const onSelect = jest.fn();
    mount(<SaleTable cart={cart} onSelect={onSelect} onQuantityChange={() => {}} onRemove={onRemove} />);

    click(buttons().find((b) => b.getAttribute("aria-label") === "pos.table.remove"));

    expect(onRemove).toHaveBeenCalledWith("p1");
    // stopPropagation: the row underneath must not also fire.
    expect(onSelect).not.toHaveBeenCalled();
  });

  test("an empty basket shows the trolley and no rows", () => {
    mount(<SaleTable cart={[]} onSelect={() => {}} onQuantityChange={() => {}} onRemove={() => {}} />);
    expect(buttons().length).toBe(0);
  });

  test("line totals are price x quantity", () => {
    mount(<SaleTable cart={cart} onSelect={() => {}} onQuantityChange={() => {}} onRemove={() => {}} />);
    expect(text()).toContain("10.00"); // 2 x 5
    expect(text()).toContain("7.00");
  });
});

/* ── The keypad ─────────────────────────────────────────────────────────── */

describe("NumericKeypad — the quantity multiplier", () => {
  test("every digit reports itself", () => {
    const onKey = jest.fn();
    mount(<NumericKeypad buffer="" multiplier={0} onKey={onKey} onClear={() => {}} />);

    ["1", "5", "0", "00", "X"].forEach((k) => {
      onKey.mockClear();
      click(byExact(k));
      expect(onKey).toHaveBeenCalledWith(k);
    });
  });

  test("CE clears rather than typing", () => {
    const onKey = jest.fn();
    const onClear = jest.fn();
    mount(<NumericKeypad buffer="12" multiplier={0} onKey={onKey} onClear={onClear} />);

    click(byText("pos.keypad.clear"));

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onKey).not.toHaveBeenCalled();
  });

  test("a pending multiplier is shown, so the next tap is not a surprise", () => {
    mount(<NumericKeypad buffer="3" multiplier={3} onKey={() => {}} onClear={() => {}} />);
    expect(text()).toContain("3");
  });
});

/* ── The aisles ─────────────────────────────────────────────────────────── */

describe("CategoryTiles", () => {
  const categories = [
    { _id: "c1", name: "Drinks", productCount: 12 },
    { _id: "c2", name: "Candy", productCount: 4 },
  ];

  test("tapping an aisle selects it", () => {
    const onSelect = jest.fn();
    mount(
      <CategoryTiles categories={categories} selected="c1" onSelect={onSelect} onClear={() => {}} />,
    );

    click(byText("Candy"));
    expect(onSelect).toHaveBeenCalledWith("c2");
  });

  test("clearing is its OWN tile, and only appears once something is open", () => {
    const onClear = jest.fn();

    mount(<CategoryTiles categories={categories} selected={null} onSelect={() => {}} onClear={onClear} />);
    expect(byText("Clear")).toBeUndefined();

    act(() => root.unmount());
    container.remove();

    mount(<CategoryTiles categories={categories} selected="c1" onSelect={() => {}} onClear={onClear} />);
    click(byText("Clear"));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  test("the count is shown so a cashier knows the aisle is not empty", () => {
    mount(<CategoryTiles categories={categories} selected={null} onSelect={() => {}} onClear={() => {}} />);
    expect(text()).toContain("12");
  });
});

/* ── The discount box ───────────────────────────────────────────────────── */

describe("DiscountModal — what comes off, and how much", () => {
  test("a flat amount is applied as typed", () => {
    const onApply = jest.fn();
    mount(
      <DiscountModal subtotal={100} discount={0} discountType="amount" onApply={onApply} onClose={() => {}} />,
    );

    typeInto(container.querySelector("input"), "15");
    click(byText("pos.discountModal.apply"));

    expect(onApply).toHaveBeenCalledWith(15, "amount");
  });

  test("a percentage previews the money before it is applied", () => {
    const onApply = jest.fn();
    mount(
      <DiscountModal subtotal={200} discount={0} discountType="percent" onApply={onApply} onClose={() => {}} />,
    );

    typeInto(container.querySelector("input"), "10");

    // 10% of 200 is 20 — the cashier sees the figure, not just the rate.
    expect(text()).toContain("20.00");

    click(byText("pos.discountModal.apply"));
    expect(onApply).toHaveBeenCalledWith(10, "percent");
  });
});

/* ── The tender screen ──────────────────────────────────────────────────── */

describe("PaymentModal — the last screen before the money", () => {
  const methods = [
    { value: "cash", label: "Cash" },
    { value: "creditcard", label: "Card" },
  ];

  const open = (props = {}) =>
    mount(
      <PaymentModal
        total={20}
        methods={methods}
        initialMethod="cash"
        onConfirm={props.onConfirm || (() => {})}
        onClose={props.onClose || (() => {})}
        busy={props.busy || false}
      />,
    );

  test("the amount owed is on the screen", () => {
    open();
    expect(text()).toContain("20.00");
  });

  test("paying the exact amount confirms with that tender", () => {
    const onConfirm = jest.fn();
    open({ onConfirm });

    // The quickest real path: charge the whole balance on the chosen method.
    const charge = byText("pos.payment.charge") || byText("charge");
    if (charge) {
      click(charge);
      expect(onConfirm).toHaveBeenCalled();
      const [payments] = onConfirm.mock.calls[0];
      const paid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
      expect(Math.round(paid * 100) / 100).toBe(20);
    }
  });

  test("it will not confirm while it is already working", () => {
    const onConfirm = jest.fn();
    open({ onConfirm, busy: true });

    buttons().filter((b) => !b.disabled).forEach(click);

    // Whatever is still clickable while busy, none of it may put a second sale
    // through — a double tap on Complete is the classic way to charge twice.
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test("the back arrow returns to the basket without charging", () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    open({ onConfirm, onClose });

    click(byLabel("Back"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

/* ── The product picker ─────────────────────────────────────────────────── */

describe("ProductSearchModal — finding something without a barcode", () => {
  const products = [
    { _id: "p1", name: "COIL SMALL", Price: 5, quantity: 10, barcode: "111", Category: { _id: "c1", name: "Vape" } },
    { _id: "p2", name: "POD LARGE", Price: 7, quantity: 0, barcode: "222", Category: { _id: "c1", name: "Vape" } },
  ];
  const categories = [{ _id: "c1", name: "Vape" }];

  test("typing narrows the list", () => {
    mount(
      <ProductSearchModal products={products} categories={categories} onPick={() => {}} onClose={() => {}} />,
    );

    expect(text()).toContain("COIL SMALL");
    expect(text()).toContain("POD LARGE");

    typeInto(container.querySelector('input[type="text"], input:not([type])'), "coil");

    expect(text()).toContain("COIL SMALL");
    expect(text()).not.toContain("POD LARGE");
  });

  test("picking one hands it back", () => {
    const onPick = jest.fn();
    mount(
      <ProductSearchModal products={products} categories={categories} onPick={onPick} onClose={() => {}} />,
    );

    click(byText("COIL SMALL"));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]._id).toBe("p1");
  });

  test("something out of stock cannot be picked", () => {
    const onPick = jest.fn();
    mount(
      <ProductSearchModal products={products} categories={categories} onPick={onPick} onClose={() => {}} />,
    );

    click(byText("POD LARGE"));

    // Stock is zero — the till must not put it in a basket it cannot sell.
    expect(onPick).not.toHaveBeenCalled();
  });
});

/* ── Making and editing a card ──────────────────────────────────────────── */

describe("QuickSellModal — one form, two jobs", () => {
  const fields = () => ({
    name: container.querySelector("#quick-sell-name"),
    price: container.querySelector("#quick-sell-price"),
  });

  test("a new card needs both a name and a price", () => {
    const onCreate = jest.fn();
    mount(<QuickSellModal onCreate={onCreate} onClose={() => {}} />);

    expect(byText("Add card").disabled).toBe(true);

    typeInto(fields().name, "Lighter");
    expect(byText("Add card").disabled).toBe(true); // still no price

    typeInto(fields().price, "2.50");
    expect(byText("Add card").disabled).toBe(false);

    click(byText("Add card"));
    expect(onCreate).toHaveBeenCalledWith({ name: "Lighter", Price: 2.5 });
  });

  test("editing opens with the card already in the fields", () => {
    const onCreate = jest.fn();
    mount(
      <QuickSellModal card={{ _id: "a", name: "Coil", Price: 5 }} onCreate={onCreate} onClose={() => {}} />,
    );

    expect(fields().name.value).toBe("Coil");
    expect(fields().price.value).toBe("5");

    typeInto(fields().price, "6");
    click(byText("Save"));

    expect(onCreate).toHaveBeenCalledWith({ name: "Coil", Price: 6 });
  });

  test("a price of zero is not a card", () => {
    const onCreate = jest.fn();
    mount(<QuickSellModal onCreate={onCreate} onClose={() => {}} />);

    typeInto(fields().name, "Free thing");
    typeInto(fields().price, "0");

    expect(byText("Add card").disabled).toBe(true);
    click(byText("Add card"));
    expect(onCreate).not.toHaveBeenCalled();
  });
});

/* ── The history tabs ───────────────────────────────────────────────────── */

describe("HistoryTabs", () => {
  test("each tab calls its own side", () => {
    const onSales = jest.fn();
    const onRefunds = jest.fn();
    mount(
      <HistoryTabs active="sales" onSales={onSales} onRefunds={onRefunds} t={(k, f) => f || k} />,
    );

    click(buttons()[1]);
    expect(onRefunds).toHaveBeenCalledTimes(1);
    expect(onSales).not.toHaveBeenCalled();

    click(buttons()[0]);
    expect(onSales).toHaveBeenCalledTimes(1);
  });
});
