import { act } from "react";
import { createRoot } from "react-dom/client";
import VirtualKeyboard from "./VirtualKeyboard";

// The on-screen keypad drives the till's price, discount and tender boxes, so a
// mistake here is a mistake in front of a customer. These drive the real
// component against a real DOM rather than re-checking the algorithm by hand.
//
// "osk-force" is the component's own testing hook: it switches the keyboard on
// without needing matchMedia or a coarse pointer, neither of which jsdom has.

let container;
let root;
let field;

const mount = () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<VirtualKeyboard />));
};

// Put a field on the page and hand it focus, which is what pops the keypad up.
const focusField = (attributes) => {
  field = document.createElement("input");
  Object.entries(attributes).forEach(([name, value]) => field.setAttribute(name, value));
  document.body.appendChild(field);

  act(() => {
    field.focus();
    field.dispatchEvent(new Event("focusin", { bubbles: true }));
  });

  return field;
};

const tap = (label) => {
  const key = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === label,
  );
  if (!key) throw new Error(`No "${label}" key on the keypad`);
  act(() => key.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};

const type = (keys) => keys.forEach(tap);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("osk-force", "1");
  mount();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  if (field) field.remove();
  field = null;
});

describe("on-screen keypad — till money boxes (type=text)", () => {
  const priceBox = { type: "text", inputmode: "decimal", "data-keyboard": "numeric" };

  test("shows the decimal point as soon as it is tapped", () => {
    focusField(priceBox);

    type(["1"]);
    expect(field.value).toBe("1");

    // The whole point of the fix: the box shows "1." immediately, rather than
    // holding the point back until a digit follows it.
    type(["."]);
    expect(field.value).toBe("1.");

    type(["8"]);
    expect(field.value).toBe("1.8");
  });

  test("backspaces back through the decimal point", () => {
    focusField(priceBox);
    type(["1", ".", "8", "5"]);
    expect(field.value).toBe("1.85");

    tap("⌫");
    expect(field.value).toBe("1.8");
    tap("⌫");
    expect(field.value).toBe("1.");
    tap("⌫");
    expect(field.value).toBe("1");
    tap("⌫");
    expect(field.value).toBe("");
  });

  test("a tapped key never wipes what is already in the box", () => {
    focusField(priceBox);
    type(["6", "6"]);

    type([".", "5", "0"]);

    expect(field.value).toBe("66.50");
  });
});

describe("on-screen keypad — plain number boxes (type=number)", () => {
  // The admin screens still use <input type="number">. Those cannot hold "66."
  // at all, so the keypad has to keep them intact instead of letting the
  // browser's value sanitiser blank them.
  const numberBox = { type: "number" };

  test("tapping the point leaves the value alone instead of erasing it", () => {
    focusField(numberBox);
    type(["6", "6"]);
    expect(field.value).toBe("66");

    tap(".");

    // Nothing lost — this is the bug that was reported.
    expect(field.value).toBe("66");
  });

  test("the point still commits once a digit follows it", () => {
    focusField(numberBox);
    type(["6", "6", ".", "5"]);

    expect(field.value).toBe("66.5");
  });

  test("a leading point becomes a zero rather than an unreadable value", () => {
    focusField(numberBox);
    type([".", "5"]);

    expect(field.value).toBe("0.5");
    expect(Number.isFinite(Number(field.value))).toBe(true);
  });

  test("backspace is never stuck on a decimal point", () => {
    focusField(numberBox);
    type(["1", ".", "8"]);
    expect(field.value).toBe("1.8");

    // "1." is a value the field refuses to hold, so the point leaves with the
    // digit rather than the key appearing to do nothing.
    tap("⌫");
    expect(field.value).toBe("1");
    tap("⌫");
    expect(field.value).toBe("");
  });

  test("a second point is ignored", () => {
    focusField(numberBox);
    type(["6", "6", ".", ".", "5"]);

    expect(field.value).toBe("66.5");
  });
});

describe("on-screen keypad — carry-over between fields", () => {
  test("a point tapped on one field does not leak into the next", () => {
    const price = focusField({ type: "number" });
    type(["6", "6", "."]);
    expect(price.value).toBe("66");

    // Move to the stock box without completing the decimal.
    const stock = document.createElement("input");
    stock.setAttribute("type", "number");
    document.body.appendChild(stock);
    act(() => {
      stock.focus();
      stock.dispatchEvent(new Event("focusin", { bubbles: true }));
    });

    type(["5"]);

    // The 5 is a plain 5 here, not the tail of the price box's decimal.
    expect(stock.value).toBe("5");

    stock.remove();
  });
});
