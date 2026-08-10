import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";

/* Client-side cart. Lives in sessionStorage and is completely decoupled from the
 * catalogue source, so when phase 0 swaps mock products for the E360 API the
 * cart does not change. SSR-safe: the tree renders with an empty cart on the
 * server and hydrates from storage after mount, so counts and totals are only
 * shown once we're on the client (see useHydratedCart). */

export interface CartLine {
  /** Cart-row key. Variants of the same listing must not collapse together. */
  id: string;
  slug: string;
  listingId: string;
  productId: string;
  variantLabel?: string;
  name: string;
  brand: string;
  price: number;
  image: string;
  qty: number;
  /** Stock at the time it was added — a soft cap in the UI. The real guarantee
   *  is the atomic decrement at checkout on the server (phase 1). */
  maxStock: number;
  /** Quantity deal: once `qty >= dealMinQty`, each unit costs `dealPrice`
   *  instead of `price`. The server re-derives this at checkout — these fields
   *  only keep the on-screen totals honest before then. */
  dealMinQty?: number;
  dealPrice?: number;
  eventId?: string;
  eventPrice?: number;
  eventLabel?: string;
}

/** Unit price for a line, applying its quantity deal once the listing's COMBINED
 *  quantity (this line + every other variant/flavour of the same listing in the
 *  basket) reaches the deal minimum. `listingQty` is that combined total. Kept in
 *  one place so the cart, cart page and checkout all agree. */
export function lineUnitPrice(l: CartLine, listingQty: number): number {
  if (l.eventId && l.eventPrice && l.eventPrice > 0) return l.eventPrice;
  if (l.dealMinQty && l.dealPrice && listingQty >= l.dealMinQty) return l.dealPrice;
  return l.price;
}

type Action =
  | { type: "add"; line: Omit<CartLine, "qty">; qty: number }
  | { type: "setQty"; id: string; qty: number }
  | { type: "remove"; id: string }
  | { type: "clear" }
  | { type: "replace"; lines: CartLine[] };

const STORAGE_KEY = "clipsofpuff-cart-session-v2";
const LEGACY_STORAGE_KEY = "clipsofpuff-cart-v1";

function reducer(state: CartLine[], action: Action): CartLine[] {
  switch (action.type) {
    case "add": {
      const existing = state.find((l) => l.id === action.line.id);
      if (existing) {
        return state.map((l) =>
          l.id === action.line.id ? { ...l, qty: Math.min(l.maxStock, l.qty + action.qty) } : l,
        );
      }
      return [...state, { ...action.line, qty: Math.min(action.line.maxStock, action.qty) }];
    }
    case "setQty":
      return state
        .map((l) =>
          l.id === action.id ? { ...l, qty: Math.max(0, Math.min(l.maxStock, action.qty)) } : l,
        )
        .filter((l) => l.qty > 0);
    case "remove":
      return state.filter((l) => l.id !== action.id);
    case "clear":
      return [];
    case "replace":
      return action.lines;
    default:
      return state;
  }
}

interface CartApi {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (line: Omit<CartLine, "qty">, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  /** Combined quantity of one listing across all its variants/flavours in the
   *  basket — what a quantity deal is judged on. */
  listingQty: (listingId: string) => number;
  /** Effective unit price for a line, quantity deal applied via listingQty. */
  unitPriceFor: (line: CartLine) => number;
  /** True once the cart has hydrated from storage — gate client-only UI on it
   *  to avoid a hydration mismatch on the count badge. */
  ready: boolean;
}

const CartContext = createContext<CartApi | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(reducer, [] as CartLine[]);
  const [ready, setReady] = useState(false);

  // Hydrate once, on the client.
  useEffect(() => {
    try {
      // The previous cart was persistent. Remove that legacy copy so product
      // selections do not remain on the device after the browser session ends.
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartLine[];
        if (Array.isArray(parsed)) {
          dispatch({
            type: "replace",
            lines: parsed.map((line) => ({
              ...line,
              slug: line.slug || line.id,
              listingId: line.listingId || "",
              productId: line.productId || "",
            })),
          });
        }
      }
    } catch {
      /* corrupt or unavailable storage — start empty */
    }
    setReady(true);
  }, []);

  // Persist after every change, but only once hydrated (so we never overwrite
  // stored state with the initial empty array during SSR/first paint).
  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* quota or private mode — the cart still works this session */
    }
  }, [lines, ready]);

  const api = useMemo<CartApi>(() => {
    const qtyByListing = new Map<string, number>();
    for (const l of lines) {
      qtyByListing.set(l.listingId, (qtyByListing.get(l.listingId) || 0) + l.qty);
    }
    const listingQty = (id: string) => qtyByListing.get(id) || 0;
    const unitPriceFor = (l: CartLine) => lineUnitPrice(l, listingQty(l.listingId));

    const count = lines.reduce((n, l) => n + l.qty, 0);
    const subtotal = lines.reduce((n, l) => n + unitPriceFor(l) * l.qty, 0);
    return {
      lines,
      count,
      subtotal,
      listingQty,
      unitPriceFor,
      ready,
      add: (line, qty = 1) => dispatch({ type: "add", line, qty }),
      setQty: (id, qty) => dispatch({ type: "setQty", id, qty }),
      remove: (id) => dispatch({ type: "remove", id }),
      clear: () => dispatch({ type: "clear" }),
    };
  }, [lines, ready]);

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}

export function useCart(): CartApi {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
