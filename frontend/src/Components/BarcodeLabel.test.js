import { act } from "react";
import { createRoot } from "react-dom/client";
import BarcodeLabel from "./BarcodeLabel";

/* The shelf ticket's four lines, and the rules about the two the shop writes.
 *
 * jsbarcode draws into a real <svg> and needs no mocking for this — the check
 * is about which LINES are on the ticket, not about the symbol itself. */

let container;
let root;

const mount = (props) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<BarcodeLabel variant="shelf" code="0422383775540" price={2.99} {...props} />);
  });
};

const text = (sel) => container.querySelector(sel)?.textContent ?? null;
const lines = () => [...container.querySelectorAll(".bc-name, .bc-now, .bc-svg, .bc-foot")]
  .map((el) => el.className.baseVal ?? el.className);

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe("BarcodeLabel — the shelf ticket", () => {
  test("the four lines come out in the order a shopper reads them", () => {
    mount({ name: "HARIBO", header: "HALLOWEEN", footer: "2 FOR 5" });
    expect(lines()).toEqual(["bc-name", "bc-now", "bc-svg", "bc-foot"]);
  });

  test("the header is what the shop wrote", () => {
    mount({ name: "HARIBO TWIN SNAKES", header: "HALLOWEEN DEAL" });
    expect(text(".bc-name")).toBe("HALLOWEEN DEAL");
  });

  /* The whole reason a ticket that ignores both prints exactly as it used to. */
  test("an empty header falls back to the product name", () => {
    mount({ name: "HARIBO TWIN SNAKES", header: "   " });
    expect(text(".bc-name")).toBe("HARIBO TWIN SNAKES");
  });

  test("no header and no name means no line at all", () => {
    mount({ name: "", header: "" });
    expect(container.querySelector(".bc-name")).toBeNull();
  });

  // An empty line on a 40mm ticket is a waste of roll, not a blank row.
  test("an empty footer prints nothing rather than an empty line", () => {
    mount({ name: "HARIBO", footer: "   " });
    expect(container.querySelector(".bc-foot")).toBeNull();
    expect(lines()).toEqual(["bc-name", "bc-now", "bc-svg"]);
  });

  test("a footer with words is printed under the symbol", () => {
    mount({ name: "HARIBO", footer: "AISLE 3" });
    expect(text(".bc-foot")).toBe("AISLE 3");
  });

  test("the price is always there, and carries the shop's symbol", () => {
    mount({ name: "HARIBO", symbol: "£", price: 12.5 });
    expect(text(".bc-now")).toBe("£12.50");
  });

  /* The plain sticker the stock screens print in bulk must not have grown a
     header or a footer along the way. */
  test("the plain variant is untouched by any of this", () => {
    mount({ variant: "plain", header: "HALLOWEEN", footer: "2 FOR 5", name: "HARIBO" });
    expect(container.querySelector(".bc-foot")).toBeNull();
    expect(container.querySelector(".bc-name")).toBeNull();
    expect(text(".bc-price")).toBe("€2.99");
  });
});
