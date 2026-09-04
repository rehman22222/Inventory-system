import { createServerFn } from "@tanstack/react-start";
import {
  deleteCookie,
  getCookie,
  setCookie,
} from "@tanstack/react-start/server";
import { z } from "zod";

/* SERVER ONLY — the customer's session.
 *
 * The same boundary catalog-api.ts draws, for the same reason, plus one more.
 *
 * The shopper's token NEVER reaches their browser as script-readable data. It
 * is issued by the E360 backend, kept in an httpOnly cookie on this domain, and
 * read back here, on the server, to be forwarded to the backend in a header. So:
 *
 *   - an XSS on the storefront cannot steal a session, because there is nothing
 *     in `document.cookie` or in any store for it to read;
 *   - the inventory API is never called from a shopper's browser at all, so it
 *     stays an internal service with one caller;
 *   - STOREFRONT_API_KEY stays on the server, as it already did.
 *
 * Everything below is therefore a server function. The client calls them like
 * ordinary async functions and TanStack turns each into an RPC.
 */

const API = () => (process.env.E360_API_URL || "http://localhost:3003").replace(/\/+$/, "");
const KEY = () => process.env.STOREFRONT_API_KEY || "";

const COOKIE = "cop_session";
// Matches the backend's own token lifetime (libs/customerToken.js). The cookie
// expiring first would log somebody out while their token was still good; the
// token expiring first leaves a cookie that produces a 401 and is then cleared.
// Keeping them equal avoids both.
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

const setSession = (token: string) => {
  setCookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Set on https only. In local development the site is plain http, and a
    // Secure cookie there is one the browser silently refuses to store — which
    // looks exactly like a broken login.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
};

const clearSession = () => {
  deleteCookie(COOKIE, { path: "/" });
};

const token = () => getCookie(COOKIE) || "";

type ApiError = { message?: string };

async function call<T>(
  path: string,
  {
    method = "GET",
    body,
    auth = false,
  }: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const session = auth ? token() : "";
  if (auth && !session) {
    throw new Error("SIGNED_OUT");
  }

  const res = await fetch(`${API()}/api/storefront${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(KEY() ? { "x-storefront-key": KEY() } : {}),
      ...(session ? { "x-customer-token": session } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const payload = (await res.json().catch(() => ({}))) as ApiError & T;

  if (!res.ok) {
    // A dead session is cleared here rather than left to rot. Otherwise every
    // page load keeps presenting a token the backend has already refused, and
    // the shopper sits on an account page that never loads with no way to see
    // why.
    if (res.status === 401) {
      clearSession();
      throw new Error("SIGNED_OUT");
    }
    throw new Error(payload.message || `Something went wrong (${res.status})`);
  }

  return payload as T;
}

/* ── Shapes ─────────────────────────────────────────────────────────────── */

export interface CustomerAddress {
  id: string;
  label: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
  isDefault: boolean;
}

export interface LoyaltyTier {
  name: string;
  threshold: number;
  multiplier: number;
  perk: string;
}

export interface CustomerLoyalty {
  enabled: boolean;
  programName: string;
  pointsName: string;
  balance: number;
  pending: number;
  lifetime: number;
  /** What the spendable balance is worth in currency. */
  value: number;
  redeemRate: number;
  earnRate: number;
  minRedeemPoints: number;
  maxRedeemPercent: number;
  tier: LoyaltyTier | null;
  nextTier: LoyaltyTier | null;
  tierProgress: number;
  tiers: LoyaltyTier[];
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  marketingOptIn: boolean;
  createdAt: string;
  addresses: CustomerAddress[];
  loyalty: CustomerLoyalty;
  stats: { orders: number; spend: number; lastOrderAt: string | null };
}

export interface TrackerStep {
  status: string;
  label: string;
  at: string | null;
  done: boolean;
  current: boolean;
}

export interface OrderSummary {
  orderNo: string;
  placedAt: string;
  status: string;
  statusLabel: string;
  total: number;
  itemCount: number;
  paymentStatus: string;
  loyalty: {
    earned: number;
    redeemed: number;
    redeemedValue: number;
    confirmed: boolean;
  };
  items: {
    name: string;
    brand: string;
    quantity: number;
    price: number;
    lineTotal: number;
  }[];
}

export interface OrderDetail extends OrderSummary {
  subtotal: number;
  shipping: number;
  discount: number;
  tax: number;
  voucher: { code: string; name: string } | null;
  note: string;
  shippingAddress: Record<string, string>;
  customer: { name: string; email: string; phone: string };
  payment: { method: string; status: string };
  tracking: { carrier: string; number: string; url: string; estimate: string };
  tracker: {
    cancelled: boolean;
    status: string;
    statusLabel: string;
    steps: TrackerStep[];
  };
  updates: { at: string; status: string; label: string; note: string }[];
}

export interface RewardEntry {
  id: string;
  at: string;
  kind: string;
  points: number;
  status: string;
  balanceAfter: number;
  orderNo: string;
  reason: string;
  value: number;
  breakdown: { name: string; rule: string; points: number }[];
}

export interface RewardsPage {
  summary: CustomerLoyalty;
  terms: string;
  entries: RewardEntry[];
  offers: {
    name: string;
    description: string;
    scope: string;
    earnMode: string;
    value: number;
    minSpend: number;
    endsAt: string | null;
  }[];
  page: number;
  pages: number;
  total: number;
}

/* ── Session ────────────────────────────────────────────────────────────── */

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).default(""),
  password: z.string().min(8).max(200),
  marketingOptIn: z.boolean().default(false),
});

export const registerAccount = createServerFn({ method: "POST" })
  .validator((input: z.infer<typeof registerSchema>) => registerSchema.parse(input))
  .handler(async ({ data }): Promise<{
    email: string;
    expiresInMinutes: number;
    devOtp?: string;
  }> => {
    return call<{
      email: string;
      expiresInMinutes: number;
      devOtp?: string;
    }>("/account/register", { method: "POST", body: data });
  });

const verifyRegistrationSchema = z.object({
  email: z.string().trim().email().max(200),
  otp: z.string().trim().regex(/^\d{6}$/),
});

export const verifyRegistration = createServerFn({ method: "POST" })
  .validator((input: z.infer<typeof verifyRegistrationSchema>) =>
    verifyRegistrationSchema.parse(input),
  )
  .handler(async ({ data }): Promise<{ customer: Customer; claimedOrders: number }> => {
    const result = await call<{
      token: string;
      customer: Customer;
      claimedOrders: number;
    }>("/account/register/verify", { method: "POST", body: data });
    setSession(result.token);
    return { customer: result.customer, claimedOrders: result.claimedOrders || 0 };
  });

const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

export const loginAccount = createServerFn({ method: "POST" })
  .validator((input: z.infer<typeof loginSchema>) => loginSchema.parse(input))
  .handler(async ({ data }): Promise<{ customer: Customer }> => {
    const result = await call<{ token: string; customer: Customer }>(
      "/account/login",
      { method: "POST", body: data },
    );
    setSession(result.token);
    return { customer: result.customer };
  });

export const logoutAccount = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: true }> => {
    clearSession();
    return { ok: true };
  },
);

/**
 * Who is signed in, or null.
 *
 * Returns null rather than throwing when there is no session, because every
 * route in the shell calls this and a signed-out visitor is the normal case,
 * not an error.
 */
export const getAccount = createServerFn({ method: "GET" }).handler(
  async (): Promise<Customer | null> => {
    if (!token()) return null;
    try {
      const result = await call<{ customer: Customer }>("/account/me", {
        auth: true,
      });
      return result.customer;
    } catch {
      return null;
    }
  },
);

/* ── Profile ────────────────────────────────────────────────────────────── */

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  marketingOptIn: z.boolean().optional(),
});

export const updateAccountProfile = createServerFn({ method: "POST" })
  .validator((input: z.infer<typeof profileSchema>) => profileSchema.parse(input))
  .handler(async ({ data }): Promise<{ message: string; customer: Customer }> =>
    call("/account/profile", { method: "PUT", body: data, auth: true }),
  );

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

export const changeAccountPassword = createServerFn({ method: "POST" })
  .validator((input: z.infer<typeof passwordSchema>) => passwordSchema.parse(input))
  .handler(async ({ data }): Promise<{ message: string }> =>
    call("/account/password", { method: "PUT", body: data, auth: true }),
  );

const addressSchema = z.object({
  id: z.string().trim().max(60).optional().default(""),
  label: z.string().trim().max(60).default(""),
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).default(""),
  city: z.string().trim().min(2).max(100),
  region: z.string().trim().max(100).default(""),
  postcode: z.string().trim().min(2).max(30),
  country: z.string().trim().min(2).max(100),
  isDefault: z.boolean().default(false),
});

export const saveAccountAddress = createServerFn({ method: "POST" })
  .validator((input: z.infer<typeof addressSchema>) => addressSchema.parse(input))
  .handler(async ({ data }): Promise<{ message: string; customer: Customer }> => {
    const { id, ...body } = data;
    return call(id ? `/account/addresses/${encodeURIComponent(id)}` : "/account/addresses", {
      method: id ? "PUT" : "POST",
      body,
      auth: true,
    });
  });

export const deleteAccountAddress = createServerFn({ method: "POST" })
  .validator((id: string) => z.string().trim().min(1).max(60).parse(id))
  .handler(async ({ data }): Promise<{ message: string; customer: Customer }> =>
    call(`/account/addresses/${encodeURIComponent(data)}`, {
      method: "DELETE",
      auth: true,
    }),
  );

/* ── Orders & rewards ───────────────────────────────────────────────────── */

export const getAccountOrders = createServerFn({ method: "GET" })
  .validator((page: number) => z.number().int().min(1).max(500).catch(1).parse(page))
  .handler(
    async ({
      data: page,
    }): Promise<{ orders: OrderSummary[]; page: number; pages: number; total: number }> =>
      call(`/account/orders?page=${page}&limit=20`, { auth: true }),
  );

export const getAccountOrder = createServerFn({ method: "GET" })
  .validator((orderNo: string) => z.string().trim().min(1).max(60).parse(orderNo))
  .handler(async ({ data }): Promise<OrderDetail> => {
    const result = await call<{ order: OrderDetail }>(
      `/account/orders/${encodeURIComponent(data)}`,
      { auth: true },
    );
    return result.order;
  });

export const getAccountRewards = createServerFn({ method: "GET" })
  .validator((page: number) => z.number().int().min(1).max(500).catch(1).parse(page))
  .handler(
    async ({ data: page }): Promise<RewardsPage> =>
      call(`/account/rewards?page=${page}&limit=30`, { auth: true }),
  );

/* ── Password reset ─────────────────────────────────────────────────────── */

export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator((email: string) => z.string().trim().email().max(200).parse(email))
  .handler(async ({ data }): Promise<{ message: string }> =>
    call("/account/forgot-password", { method: "POST", body: { email: data } }),
  );

const resetSchema = z.object({
  token: z.string().trim().min(10).max(200),
  password: z.string().min(8).max(200),
});

export const resetPassword = createServerFn({ method: "POST" })
  .validator((input: z.infer<typeof resetSchema>) => resetSchema.parse(input))
  .handler(async ({ data }): Promise<{ customer: Customer }> => {
    const result = await call<{ token: string; customer: Customer }>(
      "/account/reset-password",
      { method: "POST", body: data },
    );
    setSession(result.token);
    return { customer: result.customer };
  });

/* ── Checkout ───────────────────────────────────────────────────────────── */

const quoteSchema = z.object({
  items: z
    .array(
      z.object({
        listing: z.string().min(1).max(100),
        product: z.string().min(1).max(100),
        quantity: z.number().int().min(1).max(100),
        eventId: z.string().trim().max(100).optional().default(""),
      }),
    )
    .min(1)
    .max(50),
  voucherCode: z.string().trim().max(40).optional().default(""),
  redeemPoints: z.number().int().min(0).max(10_000_000).optional().default(0),
});

export interface LoyaltyQuote {
  enabled: boolean;
  pointsName?: string;
  programName?: string;
  /** What this basket would earn — answered whether or not they are signed in. */
  earn?: number;
  breakdown?: { name: string; rule: string; amount: number; points: number }[];
  signedIn?: boolean;
  tier?: LoyaltyTier | null;
  redeem?: {
    balance: number;
    /** The most this basket can absorb, so a slider can cap itself. */
    max: number;
    minPoints: number;
    rate: number;
    maxPercent: number;
    points: number;
    value: number;
    reason: string;
  };
}

/**
 * What this basket earns, and how much of a balance may go against it.
 *
 * Deliberately answered for signed-out visitors too: "you'd earn 240 points"
 * beside a sign-up link is the whole argument for making an account, and it is
 * only persuasive at the moment somebody is about to pay.
 */
export const getLoyaltyQuote = createServerFn({ method: "POST" })
  .validator((input: z.infer<typeof quoteSchema>) => quoteSchema.parse(input))
  .handler(async ({ data }): Promise<LoyaltyQuote> => {
    const session = token();
    const res = await fetch(`${API()}/api/storefront/loyalty/quote`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(KEY() ? { "x-storefront-key": KEY() } : {}),
        ...(session ? { "x-customer-token": session } : {}),
      },
      body: JSON.stringify(data),
      cache: "no-store",
    });
    if (!res.ok) return { enabled: false };
    return (await res.json()) as LoyaltyQuote;
  });

/**
 * The name of the session cookie, for the one other server function that needs
 * it (placeStorefrontOrder, in catalog-api.ts, which has to reach the backend
 * as this customer so the order links to their account and their points move).
 *
 * A NAME, deliberately, and not a function that reads it. A plain exported
 * helper calling getCookie can be imported by client code, where getCookie does
 * not exist — the bundler only strips server code out of createServerFn
 * handlers, not out of ordinary functions. So the reading happens inside that
 * handler, and what crosses this module boundary is a string.
 */
export const SESSION_COOKIE_NAME = COOKIE;
