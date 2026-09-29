import { act } from "react";
import { createRoot } from "react-dom/client";
import BlogManager from "./BlogManager";

/* Writing an article must never lose it.
 *
 * Two ways it used to:
 *   - A SUCCESSFUL save cleared the form, which looked exactly like the article
 *     vanishing ("I write, I click, everything is gone").
 *   - Anything unsaved went with the component: switch to another Online store
 *     tab, refresh, or get signed out at midnight, and it was gone for real.
 *
 * The editor itself (TipTap) is replaced with a plain textarea here; what is
 * under test is the form around it, not the rich-text engine.
 */

jest.mock("./RichTextEditor", () => ({
  __esModule: true,
  default: ({ value, onChange }) => (
    <textarea data-testid="editor" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

jest.mock("react-hot-toast", () => {
  const toast = jest.fn();
  toast.success = jest.fn();
  toast.error = jest.fn();
  return { __esModule: true, default: toast };
});

const mockDispatch = jest.fn();
jest.mock("react-redux", () => ({ useDispatch: () => mockDispatch }));

jest.mock("../../features/onlineStoreSlice", () => ({
  createOnlineBlogPost: (payload) => ({ type: "create", payload }),
  updateOnlineBlogPost: (payload) => ({ type: "update", payload }),
  deleteOnlineBlogPost: (id) => ({ type: "delete", payload: id }),
  saveOnlineSettings: (payload) => ({ type: "settings", payload }),
  uploadBlogImages: () => ({ type: "upload" }),
}));

const DRAFT_KEY = "e360_blog_unsaved_draft";

let container;
let root;

const flush = async (ms = 0) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

const render = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<BlogManager posts={[]} settings={{}} isActing={false} canEditPage={false} />);
  });
  await flush(); // the lazy editor
};

const unmount = () => {
  act(() => root.unmount());
  container.remove();
};

// React listens for the native input event on the value it tracks.
const type = async (element, value) => {
  const proto = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);
  await act(async () => {
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const titleInput = () => container.querySelector('input[placeholder="What is this article called?"]');
const editor = () => container.querySelector('[data-testid="editor"]');
const articleForm = () => titleInput().closest("form");
const heading = () => articleForm().querySelector("h2").textContent;

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  window.localStorage.clear();
  mockDispatch.mockReset();
  jest.spyOn(window, "confirm").mockReturnValue(true);
  jest.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  if (root) unmount();
  root = null;
  jest.restoreAllMocks();
});

test("a successful save keeps the article open instead of clearing it", async () => {
  mockDispatch.mockResolvedValue({
    payload: { _id: "post-1", slug: "my-first-post", title: "My first post", publishedAt: null },
  });
  await render();

  await type(titleInput(), "My first post");
  await type(editor(), "<p>Hello world</p>");
  await act(async () => {
    articleForm().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await flush();

  expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "create" }));
  expect(titleInput().value).toBe("My first post");
  expect(editor().value).toBe("<p>Hello world</p>");
  expect(heading()).toBe("Edit article");
  expect(container.textContent).toContain("All changes saved.");
  expect(container.querySelector('input[placeholder="article-url-slug"]').value).toBe("my-first-post");
});

test("saving again updates the same article rather than creating another", async () => {
  mockDispatch.mockResolvedValue({ payload: { _id: "post-1", slug: "p", title: "P" } });
  await render();
  await type(titleInput(), "P");
  await type(editor(), "<p>one</p>");
  await act(async () => {
    articleForm().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await flush();

  await type(editor(), "<p>two</p>");
  await act(async () => {
    articleForm().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await flush();

  expect(mockDispatch.mock.calls[1][0]).toEqual(
    expect.objectContaining({ type: "update", payload: expect.objectContaining({ id: "post-1" }) }),
  );
});

test("unsaved writing survives the form going away and is offered back", async () => {
  await render();
  await type(titleInput(), "Half-written guide");
  await type(editor(), "<p>An hour of work</p>");
  expect(container.textContent).toContain("Unsaved changes");
  await flush(900); // past the backup delay

  const stored = JSON.parse(window.localStorage.getItem(DRAFT_KEY));
  expect(stored.draft.title).toBe("Half-written guide");

  unmount(); // switching tab, refreshing, or being signed out
  await render();

  expect(titleInput().value).toBe("Half-written guide");
  expect(editor().value).toBe("<p>An hour of work</p>");
  expect(container.textContent).toContain("Unsaved changes");
});

test("the backup is cleared once the article is saved", async () => {
  mockDispatch.mockResolvedValue({ payload: { _id: "post-9", slug: "s", title: "T" } });
  await render();
  await type(titleInput(), "T");
  await type(editor(), "<p>body</p>");
  await flush(900);
  expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull();

  await act(async () => {
    articleForm().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await flush(900);

  expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
});

test("a failed save keeps everything and says so", async () => {
  mockDispatch.mockResolvedValue({ error: { message: "x" }, payload: "Server said no" });
  await render();
  await type(titleInput(), "Keep me");
  await type(editor(), "<p>text</p>");
  await act(async () => {
    articleForm().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await flush();

  expect(titleInput().value).toBe("Keep me");
  expect(heading()).toBe("Write a new article");
  expect(container.textContent).toContain("Unsaved changes");
});

test("starting a new article with unsaved work asks first, and respects no", async () => {
  await render();
  await type(titleInput(), "Draft");
  await type(editor(), "<p>x</p>");

  window.confirm.mockReturnValue(false);
  const newButton = [...container.querySelectorAll("button")].find((b) => b.textContent.includes("New article"));
  await act(async () => newButton.click());
  expect(window.confirm).toHaveBeenCalled();
  expect(titleInput().value).toBe("Draft");

  window.confirm.mockReturnValue(true);
  await act(async () => newButton.click());
  expect(titleInput().value).toBe("");
});

test("pressing Edit on the open article does not silently throw away unsaved edits", async () => {
  mockDispatch.mockResolvedValue({ payload: { _id: "post-1", slug: "p", title: "P" } });
  const posts = [{ _id: "post-1", title: "P", slug: "p", content: "<p>saved</p>", status: "draft" }];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<BlogManager posts={posts} settings={{}} isActing={false} canEditPage={false} />);
  });
  await flush();

  const editButton = () => [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "Edit");
  await act(async () => editButton().click());
  expect(editor().value).toBe("<p>saved</p>");

  await type(editor(), "<p>saved and more</p>");
  window.confirm.mockReturnValue(false);
  await act(async () => editButton().click());
  expect(window.confirm).toHaveBeenCalled();
  expect(editor().value).toBe("<p>saved and more</p>");
});

test("the article editor is not inside a <label> (every click would press its Undo button)", async () => {
  await render();
  expect(editor().closest("label")).toBeNull();
});

test("an untouched form is not reported as unsaved", async () => {
  await render();
  expect(container.textContent).not.toContain("Unsaved changes");
  // What an empty TipTap document reports is not a change either.
  await type(editor(), "<p></p>");
  expect(container.textContent).not.toContain("Unsaved changes");
});

test("storage being unavailable never breaks the editor", async () => {
  jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  await render();
  await type(titleInput(), "Still works");
  await flush(900);
  expect(titleInput().value).toBe("Still works");
});
