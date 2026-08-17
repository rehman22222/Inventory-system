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

// The numeric keypad is our own <button>s, labelled by what they show. The text
// layout comes from react-simple-keyboard, which renders <div data-skbtn> keyed
// by the layout token ("Q", "{lock}") instead. Accept either.
const tap = (label) => {
  const ourKey = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === label,
  );
  const key = ourKey || container.querySelector(`[data-skbtn="${label}"]`);

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

describe("on-screen keypad — capitals by default", () => {
  // Cashiers type product names, brands and flavours, which are printed in
  // capitals on the packaging. Caps is the common case here, not the exception.
  const textBox = { type: "text" };

  test("a text field opens in capitals", () => {
    focusField(textBox);

    tap("Q");

    expect(field.value).toBe("Q");
  });

  test("caps drops to lowercase and stays there", () => {
    focusField(textBox);

    tap("{lock}");
    tap("q");
    tap("w");

    // Both letters are lowercase: there is no one-shot release putting the
    // second character back into capitals.
    expect(field.value).toBe("qw");
  });

  test("caps toggles back up again", () => {
    focusField(textBox);

    tap("{lock}");
    tap("q");
    tap("{lock}");
    tap("W");

    expect(field.value).toBe("qW");
  });

  test("the top row is digits, not symbols", () => {
    focusField(textBox);

    // A physical keyboard pairs capitals with the symbol row. Here capitals are
    // the default, so pairing them that way would have put "!@#$%" in front of
    // the cashier and hidden the digits behind a toggle.
    expect(container.querySelector('[data-skbtn="1"]')).not.toBeNull();
    expect(container.querySelector('[data-skbtn="!"]')).toBeNull();

    tap("6");
    tap("0");
    tap("0");
    tap("0");

    expect(field.value).toBe("6000");
  });

  test("the symbols arrive with lowercase on caps", () => {
    focusField(textBox);
    tap("{lock}");

    expect(container.querySelector('[data-skbtn="!"]')).not.toBeNull();
    expect(container.querySelector('[data-skbtn="1"]')).toBeNull();

    tap("@");

    expect(field.value).toBe("@");
  });

  test("everyday punctuation stays on the default layout", () => {
    focusField(textBox);

    // A full stop and a comma are needed far more often at a till than "<" and
    // ">", so they sit with the capitals rather than behind caps.
    tap("A");
    tap(".");
    tap("B");

    expect(field.value).toBe("A.B");
  });
});

describe("on-screen keypad — staying open while the form is used", () => {
  const openModalWithSelect = () => {
    const wrapper = document.createElement("div");
    wrapper.className = "pos-modal-panel";
    wrapper.innerHTML =
      '<input id="name" type="text" /><select id="cat"><option>Miscellaneous</option></select>';
    document.body.appendChild(wrapper);
    return wrapper;
  };

  const settle = async () => {
    // onFocusOut defers its decision by 120ms.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
  };

  // Mounting schedules a one-off showForCurrentField on a 0ms timer, and that
  // re-focuses the remembered field. Left pending it lands in the middle of the
  // scenario below and decides the outcome instead of the code under test, so it
  // is flushed before anything is asserted.
  const settleMount = settle;

  test("picking a category does not close the keyboard", async () => {
    const wrapper = openModalWithSelect();
    const name = wrapper.querySelector("#name");
    const category = wrapper.querySelector("#cat");

    act(() => {
      name.focus();
      name.dispatchEvent(new Event("focusin", { bubbles: true }));
    });
    await settleMount();
    expect(container.querySelector(".osk-text, .osk-numeric")).not.toBeNull();

    // Move to the dropdown, which is not something the keyboard can type into.
    act(() => {
      category.focus();
      name.dispatchEvent(new Event("focusout", { bubbles: true }));
    });
    await settle();

    // Still up — the modal is sized against it, so closing here yanked the whole
    // card back to full height mid-entry.
    expect(container.querySelector(".osk-text, .osk-numeric")).not.toBeNull();

    wrapper.remove();
  });

  test("leaving the form entirely does close it", async () => {
    const wrapper = openModalWithSelect();
    const name = wrapper.querySelector("#name");

    act(() => {
      name.focus();
      name.dispatchEvent(new Event("focusin", { bubbles: true }));
    });
    await settleMount();
    expect(container.querySelector(".osk-text, .osk-numeric")).not.toBeNull();

    const outside = document.createElement("button");
    document.body.appendChild(outside);

    act(() => {
      outside.focus();
      name.dispatchEvent(new Event("focusout", { bubbles: true }));
    });
    await settle();

    expect(container.querySelector(".osk-text, .osk-numeric")).toBeNull();

    outside.remove();
    wrapper.remove();
  });

});
