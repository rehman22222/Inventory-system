import { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import SessionOwnerGuard from "./SessionOwnerGuard";
import axiosInstance from "../lib/axios";

/* The tab-takeover guard.
 *
 * One browser holds one session cookie, so signing in anywhere replaces it
 * everywhere. These check the thing that actually protects the shop: a tab that
 * has lost the session stops being usable, instead of carrying on with somebody
 * else's authority. */

jest.mock("react-i18next", () => {
  const t = (key, fallback, vars) => {
    if (typeof fallback !== "string") return key;
    return fallback.replace(/\{\{(\w+)\}\}/g, (_, name) => vars?.[name] ?? "");
  };
  return { ...jest.requireActual("react-i18next"), useTranslation: () => ({ t, i18n: {} }) };
});

jest.mock("../lib/axios", () => ({ __esModule: true, default: { get: jest.fn() } }));

const STAFF = { _id: "staff-1", name: "Sana", role: "staff" };
const ADMIN = { _id: "admin-9", name: "Bilal", role: "admin" };

let container;
let root;

const storeWith = (user) =>
  configureStore({
    reducer: { auth: (state = { Authuser: user }) => state },
  });

const mount = (user) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <Provider store={storeWith(user)}>
        <SessionOwnerGuard />
      </Provider>,
    );
  });
};

const text = () => container.textContent || "";

// The browser fires this in the OTHER tabs; jsdom needs it constructed by hand.
const otherTabWrites = (key, value) =>
  act(() => {
    window.dispatchEvent(
      new StorageEvent("storage", { key, newValue: value === null ? null : JSON.stringify(value) }),
    );
  });

beforeEach(() => {
  axiosInstance.get.mockReset();
  axiosInstance.get.mockResolvedValue({ data: { user: STAFF } });
  localStorage.clear();
  localStorage.setItem("user", JSON.stringify(STAFF));
  window.history.pushState({}, "", "/Dashboard");
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe("SessionOwnerGuard — one browser, one session", () => {
  test("a quiet tab shows nothing", () => {
    mount(STAFF);
    expect(container.textContent).toBe("");
  });

  test("someone signing in as another user takes this tab out of service", () => {
    mount(STAFF);
    otherTabWrites("user", ADMIN);

    expect(text()).toContain("signed out");
    // Named, so the cashier knows what happened rather than guessing.
    expect(text()).toContain("Bilal");
  });

  test("the stored profile is dropped, so a reload cannot come back as them", () => {
    mount(STAFF);
    otherTabWrites("user", ADMIN);

    expect(localStorage.getItem("user")).toBeNull();
    expect(localStorage.getItem("sessionExpiresAt")).toBeNull();
  });

  test("signing in again as the SAME user is not a takeover", () => {
    mount(STAFF);
    otherTabWrites("user", { ...STAFF, name: "Sana" });

    expect(container.textContent).toBe("");
  });

  test("a logout elsewhere is left to the paths that already own it", () => {
    mount(STAFF);
    otherTabWrites("user", null);

    expect(container.textContent).toBe("");
  });

  test("a signed-out tab has nothing to lose", () => {
    mount(null);
    otherTabWrites("user", ADMIN);

    expect(container.textContent).toBe("");
  });

  test("the cookie is asked who it belongs to when the tab is opened", () => {
    mount(STAFF);
    expect(axiosInstance.get).toHaveBeenCalledWith("auth/me");
  });

  test("the cookie's answer is what decides it, not the stored profile", async () => {
    // localStorage still says staff — the storage event never arrived — but the
    // cookie resolves to somebody else. That is the case that matters.
    axiosInstance.get.mockResolvedValue({ data: { user: ADMIN } });
    mount(STAFF);
    await act(async () => {});

    expect(text()).toContain("signed out");
    expect(text()).toContain("Bilal");
  });

  test("a dropped network does not throw the cashier out", async () => {
    axiosInstance.get.mockRejectedValue(new Error("offline"));
    mount(STAFF);
    await act(async () => {});

    expect(container.textContent).toBe("");
  });
});
