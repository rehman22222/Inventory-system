import { act } from "react";
import { createRoot } from "react-dom/client";
import QuickSellCards from "./QuickSellCards";
import QuickCash from "./QuickCash";
import SaleCompleteModal from "./SaleCompleteModal";
import ActionRail from "./ActionRail";

/* Clicks, on the real components, against a real DOM.
 *
 * Everything else in the suite checks arithmetic — what a basket comes to, what
 * a refund hands back. This checks the other half: that pressing the thing
 * actually does the thing. A till is a screen somebody hits with a thumb all
 * day, and a button wired to nothing looks exactly like a button wired to
 * something right up until a customer is standing there.
 *
 * Same harness the keyboard tests use: react-dom into a container, real
 * MouseEvents, no testing-library (the project does not carry one).
 */

jest.mock("react-i18next", () => ({
  // Return the fallback when one is given, otherwise the key. That is what the
  // component would render anyway, and it keeps these tests from breaking every
  // time a piece of copy is reworded.
  useTranslation: () => ({
    t: (key, fallback) =>
      typeof fallback === "string" ? fallback : fallback?.defaultValue || key,
  }),
}));

jest.mock("react-hot-toast", () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("../../lib/axios", () => ({
  __esModule: true,
  default: { post: jest.fn(() => Promise.resolve({ data: {} })) },
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

const buttons = () => [...container.querySelectorAll("button")];

const byText = (text) =>
  buttons().find((b) => (b.textContent || "").trim().toLowerCase().includes(text.toLowerCase()));

const byLabel = (label) =>
  buttons().find((b) => (b.getAttribute("aria-label") || "") === label);

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

/* ── Quick-sell cards ───────────────────────────────────────────────────── */

describe("quick-sell cards — what each press does", () => {
  const cards = [
    { _id: "a", name: "Coil", Price: 5 },
    { _id: "b", name: "Pod", Price: 7 },
  ];

  test("tapping a card rings it up", () => {
    const onPick = jest.fn();
    mount(<QuickSellCards cards={cards} onPick={onPick} onNew={() => {}} />);

    click(byText("Coil"));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0].name).toBe("Coil");
  });

  test("the plus opens the new-card dialog", () => {
    const onNew = jest.fn();
    mount(<QuickSellCards cards={cards} onPick={() => {}} onNew={onNew} />);

    click(byLabel("New card"));

    expect(onNew).toHaveBeenCalledTimes(1);
  });

  test("Misc opens quick cash, and is not the same button as the plus", () => {
    const onNew = jest.fn();
    const onQuickCash = jest.fn();
    mount(
      <QuickSellCards
        cards={cards}
        onPick={() => {}}
        onNew={onNew}
        onQuickCash={onQuickCash}
      />,
    );

    click(byText("Misc"));

    expect(onQuickCash).toHaveBeenCalledTimes(1);
    expect(onNew).not.toHaveBeenCalled();
  });

  test("in edit mode a card is EDITED, not sold", () => {
    const onPick = jest.fn();
    const onEdit = jest.fn();
    mount(
      <QuickSellCards
        cards={cards}
        editing
        onPick={onPick}
        onEdit={onEdit}
        onNew={() => {}}
        onRemove={() => {}}
      />,
    );

    click(byText("Pod"));

    // The whole point of the mode: pressing "edit" and then having the card
    // still ring up a sale is the surprise that costs a refund.
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });

  test("the remove cross only exists in edit mode", () => {
    const onRemove = jest.fn();
    mount(
      <QuickSellCards cards={cards} onPick={() => {}} onNew={() => {}} onRemove={onRemove} />,
    );
    expect(byLabel("Remove card")).toBeUndefined();

    act(() => root.unmount());
    container.remove();

    mount(
      <QuickSellCards
        cards={cards}
        editing
        onPick={() => {}}
        onNew={() => {}}
        onRemove={onRemove}
      />,
    );
    click(byLabel("Remove card"));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  test("with no cards there is nothing to edit, so no Edit button", () => {
    mount(<QuickSellCards cards={[]} onPick={() => {}} onNew={() => {}} />);
    expect(byText("Edit")).toBeUndefined();
    // ...but a new one can still be made.
    expect(byLabel("New card")).toBeDefined();
  });
});

/* ── Quick cash ─────────────────────────────────────────────────────────── */

describe("quick cash — the amount actually reaches the basket", () => {
  const amountBox = () => container.querySelector("#quick-cash-amount");
  const nameBox = () => container.querySelector("#quick-cash-name");
  const tickBox = () => container.querySelector('input[type="checkbox"]');

  test("Add is dead until there is an amount", () => {
    const onAdd = jest.fn();
    mount(<QuickCash onAdd={onAdd} onClose={() => {}} />);

    const add = byText("Add to basket");
    expect(add.disabled).toBe(true);

    click(add);
    expect(onAdd).not.toHaveBeenCalled();
  });

  test("an amount and no name still goes through", () => {
    const onAdd = jest.fn();
    mount(<QuickCash onAdd={onAdd} onClose={() => {}} />);

    typeInto(amountBox(), "4.50");
    click(byText("Add"));

    expect(onAdd).toHaveBeenCalledWith({ Price: 4.5, name: "", pin: false });
  });

  test("the tick is what turns a one-off into a card", () => {
    const onAdd = jest.fn();
    mount(<QuickCash onAdd={onAdd} onClose={() => {}} />);

    typeInto(amountBox(), "6");
    typeInto(nameBox(), "Lighter");
    click(tickBox());
    click(byText("Add"));

    expect(onAdd).toHaveBeenCalledWith({ Price: 6, name: "Lighter", pin: true });
  });

  test("letters cannot be typed into the amount", () => {
    mount(<QuickCash onAdd={() => {}} onClose={() => {}} />);

    typeInto(amountBox(), "12abc.3x4");

    expect(amountBox().value).toBe("12.34");
  });

  test("Cancel closes without ringing anything up", () => {
    const onAdd = jest.fn();
    const onClose = jest.fn();
    mount(<QuickCash onAdd={onAdd} onClose={onClose} />);

    typeInto(amountBox(), "9");
    click(byText("Cancel"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
  });
});

/* ── The finished sale ──────────────────────────────────────────────────── */

describe("sale complete — three ways out, and they do different things", () => {
  const receipt = {
    receiptNo: "POS-000001",
    total: 6,
    changeDue: 0,
    amountTendered: 6,
    payments: [{ method: "cash", amount: 6 }],
    items: [],
  };

  test("Go Green closes straight back to the till", () => {
    const onClose = jest.fn();
    const onPrint = jest.fn();
    mount(<SaleCompleteModal receipt={receipt} onPrint={onPrint} onClose={onClose} />);

    click(byText("Go Green"));

    expect(onClose).toHaveBeenCalledTimes(1);
    // It must NOT print, and it must not go looking for an email address.
    expect(onPrint).not.toHaveBeenCalled();
  });

  test("Print prints and then closes", () => {
    const onClose = jest.fn();
    const onPrint = jest.fn();
    mount(<SaleCompleteModal receipt={receipt} onPrint={onPrint} onClose={onClose} />);

    click(byText("Print"));

    expect(onPrint).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("Email opens the field instead of ending the sale", () => {
    const onClose = jest.fn();
    mount(<SaleCompleteModal receipt={receipt} onPrint={() => {}} onClose={onClose} />);

    expect(container.querySelector("#pos-receipt-email")).toBeNull();

    click(byText("Email"));

    expect(container.querySelector("#pos-receipt-email")).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  test("the back arrow returns to the three buttons", () => {
    mount(<SaleCompleteModal receipt={receipt} onPrint={() => {}} onClose={() => {}} />);

    click(byText("Email"));
    expect(container.querySelector("#pos-receipt-email")).not.toBeNull();

    click(byLabel("Back"));

    expect(container.querySelector("#pos-receipt-email")).toBeNull();
    expect(byText("Go Green")).toBeDefined();
  });

  test("Send is dead until an address is typed", () => {
    mount(<SaleCompleteModal receipt={receipt} onPrint={() => {}} onClose={() => {}} />);

    click(byText("Email"));
    expect(byText("Send").disabled).toBe(true);

    typeInto(container.querySelector("#pos-receipt-email"), "someone@example.com");
    expect(byText("Send").disabled).toBe(false);
  });
});

/* ── The action rail ────────────────────────────────────────────────────── */

describe("action rail — every button fires its own action", () => {
  const actions = [
    { id: "search", label: "Find Product", icon: null, onClick: jest.fn() },
    { id: "void", label: "Clear Basket", icon: null, onClick: jest.fn() },
    { id: "refund", label: "Refund", icon: null, onClick: jest.fn(), disabled: true },
  ];

  beforeEach(() => actions.forEach((a) => a.onClick.mockClear()));

  test("a press calls that action and nothing else", () => {
    mount(<ActionRail actions={actions} />);

    click(byText("Find Product"));

    expect(actions[0].onClick).toHaveBeenCalledTimes(1);
    expect(actions[1].onClick).not.toHaveBeenCalled();
  });

  test("a disabled action cannot be fired", () => {
    mount(<ActionRail actions={actions} />);

    const refund = byText("Refund");
    expect(refund.disabled).toBe(true);
    click(refund);

    expect(actions[2].onClick).not.toHaveBeenCalled();
  });

  test("the yellow button gets dark text, the dark ones get white", () => {
    // Not decoration: white on the yellow History button is about 2:1 and
    // cannot be read at this size. The rail derives its ink from the colour,
    // so this is the check that the derivation still works.
    mount(
      <ActionRail
        actions={[
          { id: "history", label: "History", icon: null, onClick: () => {} },
          { id: "void", label: "Clear Basket", icon: null, onClick: () => {} },
        ]}
      />,
    );

    expect(byText("History").style.color).toBe("rgb(22, 22, 22)");
    expect(byText("Clear Basket").style.color).toBe("rgb(255, 255, 255)");
  });
});
