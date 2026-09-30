import { act } from "react";
import { createRoot } from "react-dom/client";
import BlogComments from "./BlogComments";

/* The moderation queue decides what readers see on the website, so the two
 * things that matter are that it asks the server for the right list and that
 * each button sends the right status. */

const mockGet = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();
jest.mock("../../lib/axios", () => ({
  __esModule: true,
  default: {
    get: (...args) => mockGet(...args),
    patch: (...args) => mockPatch(...args),
    delete: (...args) => mockDelete(...args),
  },
}));

const mockSocketHandlers = {};
jest.mock("socket.io-client", () => ({
  io: () => ({
    on: (event, handler) => {
      mockSocketHandlers[event] = handler;
    },
    disconnect: jest.fn(),
  }),
}));
jest.mock("../../lib/socket", () => ({ socketURL: "http://test" }));

jest.mock("react-hot-toast", () => {
  const toast = jest.fn();
  toast.success = jest.fn();
  toast.error = jest.fn();
  return { __esModule: true, default: toast };
});

const pending = {
  _id: "c1",
  name: "Aoife",
  email: "aoife@example.ie",
  body: "Great guide!",
  status: "pending",
  postTitle: "Vape Guide",
  createdAt: "2026-09-30T10:00:00.000Z",
};

let container;
let root;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const button = (text) => [...container.querySelectorAll("button")].find((b) => b.textContent.includes(text));

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(async () => {
  mockGet.mockReset().mockResolvedValue({
    data: { comments: [pending], counts: { pending: 1, approved: 2, hidden: 0 } },
  });
  mockPatch.mockReset().mockResolvedValue({ data: {} });
  mockDelete.mockReset().mockResolvedValue({ data: {} });
  jest.spyOn(window, "confirm").mockReturnValue(true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<BlogComments />));
  await flush();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

test("opens on the comments waiting for approval, with counts", () => {
  expect(mockGet).toHaveBeenCalledWith("online/blog-comments", { params: { status: "pending" } });
  expect(container.textContent).toContain("Great guide!");
  expect(container.textContent).toContain("aoife@example.ie");
  expect(button("Waiting").textContent).toContain("1");
  expect(button("All").textContent).toContain("3");
});

test("Approve shows the comment on the article", async () => {
  await act(async () => button("Approve").click());
  await flush();
  expect(mockPatch).toHaveBeenCalledWith("online/blog-comments/c1", { status: "approved" });
});

test("Hide keeps it off the article", async () => {
  await act(async () => button("Hide").click());
  await flush();
  expect(mockPatch).toHaveBeenCalledWith("online/blog-comments/c1", { status: "hidden" });
});

test("Delete asks first and does nothing on no", async () => {
  window.confirm.mockReturnValue(false);
  await act(async () => button("Delete").click());
  expect(mockDelete).not.toHaveBeenCalled();
  window.confirm.mockReturnValue(true);
  await act(async () => button("Delete").click());
  await flush();
  expect(mockDelete).toHaveBeenCalledWith("online/blog-comments/c1");
});

test("switching tab asks for that status; All asks for everything", async () => {
  await act(async () => button("Shown").click());
  await flush();
  expect(mockGet).toHaveBeenLastCalledWith("online/blog-comments", { params: { status: "approved" } });
  await act(async () => button("All").click());
  await flush();
  expect(mockGet).toHaveBeenLastCalledWith("online/blog-comments", { params: {} });
});

test("a new comment on the website refreshes the queue", async () => {
  const calls = mockGet.mock.calls.length;
  await act(async () => mockSocketHandlers.blogCommentSubmitted());
  await flush();
  expect(mockGet.mock.calls.length).toBe(calls + 1);
});

test("the commenter's website is shown as a nofollow link", async () => {
  mockGet.mockResolvedValue({
    data: { comments: [{ ...pending, website: "https://my-shop.ie/" }], counts: { pending: 1, approved: 0, hidden: 0 } },
  });
  await act(async () => button("Refresh").click());
  await flush();
  const link = container.querySelector('a[href="https://my-shop.ie/"]');
  expect(link).not.toBeNull();
  expect(link.getAttribute("rel")).toContain("nofollow");
});

test("a comment body is shown as text, never as HTML", async () => {
  mockGet.mockResolvedValue({
    data: { comments: [{ ...pending, body: "<img src=x onerror=alert(1)>" }], counts: { pending: 1, approved: 0, hidden: 0 } },
  });
  await act(async () => button("Refresh").click());
  await flush();
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
});
