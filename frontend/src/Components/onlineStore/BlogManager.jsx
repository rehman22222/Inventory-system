/* The blog editor: writing, publishing and managing articles.
 *
 * Rendered in two places, which is why it lives here rather than inside
 * OnlineStorePage:
 *
 *   • Online store → Blog, for the shop's own admins.
 *   • /BlogStudio, the whole of the back office for a content-only ("seo")
 *     account — an outside agency that writes the blog and can do nothing else.
 *
 * That second case is the reason for the split. Importing this out of
 * OnlineStorePage would have pulled the entire online-store admin — orders,
 * customers, takings, settings — into the bundle of somebody who is only ever
 * allowed to write articles.
 *
 * The article body is HTML from RichTextEditor. It is sanitised on the server
 * before storage (backend/libs/richText.js), which is the boundary that
 * matters; nothing here is a security control.
 */

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import toast from "react-hot-toast";
import {
  FiEdit2,
  FiExternalLink,
  FiEye,
  FiPlus,
  FiSave,
  FiTrash2,
} from "react-icons/fi";
import {
  createOnlineBlogPost,
  deleteOnlineBlogPost,
  saveOnlineSettings,
  updateOnlineBlogPost,
  uploadBlogImages,
} from "../../features/onlineStoreSlice";
import { Field, storefrontPublicUrl, toLocalDateTime } from "./shared";

/* TipTap and ProseMirror are a few hundred kilobytes between them, and most
 * visits to the online store never open the Blog tab. Splitting the editor out
 * keeps that weight off everybody who came here to check an order. */
const RichTextEditor = lazy(() => import("./RichTextEditor"));

export const BLOG_PAGE_DEFAULTS = {
  eyebrow: "Journal",
  heading: "Stories, guides & updates.",
  intro: "Product guides, store news and useful information from Cliffs of Puff.",
  featuredHeading: "Featured article",
  latestHeading: "Latest articles",
  seoTitle: "Blog",
  seoDescription: "News, guides and product stories from Cliffs of Puff.",
};

/* An article being written is kept in this browser until it is saved.
 *
 * The form lives in component state, and that state goes whenever the
 * component does: switching to another Online store tab, a refresh, or the
 * sign-out every session gets at the shop's midnight. An hour's writing lost to
 * a stray click is the one failure a writing tool must not have. So the unsaved
 * draft is copied here as it changes and offered back when the form next opens.
 * It is cleared once the article is saved or deliberately discarded.
 *
 * This is a convenience, not storage: it is one browser, and it may be
 * unavailable (private windows, blocked storage), in which case nothing here
 * throws and the editor simply works as it did before. */
const DRAFT_STORAGE_KEY = "e360_blog_unsaved_draft";
const DRAFT_SAVE_DELAY_MS = 800;

const readStoredDraft = () => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DRAFT_STORAGE_KEY) || "null");
    return parsed && typeof parsed.draft === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const writeStoredDraft = (value) => {
  try {
    if (value) window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Storage full or blocked: the draft just isn't backed up.
  }
};

/* A comparable fingerprint of the form, for "is there unsaved work?". An empty
 * editor produces "<p></p>" where a blank form holds "", and the two must not
 * count as a difference. */
const snapshotOf = (draft) =>
  JSON.stringify({
    ...draft,
    content: /^\s*(<p>\s*<\/p>\s*)*$/i.test(draft.content || "") ? "" : draft.content,
  });

const makeBlankBlogPost = () => ({
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  coverImage: "",
  coverAlt: "",
  author: "Cliffs of Puff",
  featured: false,
  titleAlign: "center",
  status: "draft",
  publishedAt: "",
  seoTitle: "",
  seoDescription: "",
  canonicalUrl: "",
  noindex: false,
});

/* Articles written under the old block editor and not yet migrated.
 *
 * The server still hands those back as `blocks`, so the editor renders them as
 * HTML once, on open, and from then on the article is a rich-text document
 * like any other — saving it writes `content` and drops the blocks. Same shape
 * of conversion as scripts/migrateBlogToRichText.js; this is the copy that
 * catches anything the script has not been run against yet. */
const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const legacyBlocksToHtml = (blocks) =>
  (Array.isArray(blocks) ? blocks : [])
    .map((block) => {
      const align =
        block.align && block.align !== "left" ? ` style="text-align:${block.align}"` : "";
      const paragraphs = (text) =>
        escapeHtml(text)
          .split(/\n{2,}/)
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => `<p${align}>${part.replace(/\n/g, "<br />")}</p>`)
          .join("");

      switch (block.type) {
        case "heading": {
          if (!block.text) return "";
          const tag = block.level === "h3" ? "h3" : "h2";
          return `<${tag}${align}>${escapeHtml(block.text)}</${tag}>`;
        }
        case "quote":
          return block.text ? `<blockquote>${paragraphs(block.text)}</blockquote>` : "";
        case "image": {
          if (!block.url) return "";
          const img = `<img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt || "")}" />`;
          return block.caption
            ? `<figure>${img}<figcaption>${escapeHtml(block.caption)}</figcaption></figure>`
            : `<figure>${img}</figure>`;
        }
        case "video": {
          if (!block.url) return "";
          const youtube = block.url.match(
            /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]+)/i,
          );
          const vimeo = block.url.match(/vimeo\.com\/(\d+)/i);
          if (youtube) return `<iframe src="https://www.youtube-nocookie.com/embed/${youtube[1]}" allowfullscreen></iframe>`;
          if (vimeo) return `<iframe src="https://player.vimeo.com/video/${vimeo[1]}" allowfullscreen></iframe>`;
          return `<p><a href="${escapeHtml(block.url)}">${escapeHtml(block.caption || block.url)}</a></p>`;
        }
        case "button":
          return block.url && block.text
            ? `<p${align}><a href="${escapeHtml(block.url)}">${escapeHtml(block.text)}</a></p>`
            : "";
        default:
          return paragraphs(block.text);
      }
    })
    .filter(Boolean)
    .join("");

const postBodyHtml = (post) =>
  post?.content || legacyBlocksToHtml(post?.blocks) || "";

// The form's shape for an article the server sent back.
const draftFromPost = (post) => ({
  title: post.title || "",
  slug: post.slug || "",
  excerpt: post.excerpt || "",
  content: postBodyHtml(post),
  coverImage: post.coverImage || "",
  coverAlt: post.coverAlt || "",
  author: post.author || "Cliffs of Puff",
  featured: Boolean(post.featured),
  titleAlign: post.titleAlign === "left" ? "left" : "center",
  status: post.status === "published" ? "published" : "draft",
  publishedAt: toLocalDateTime(post.publishedAt),
  seoTitle: post.seoTitle || "",
  seoDescription: post.seoDescription || "",
  canonicalUrl: post.canonicalUrl || "",
  noindex: Boolean(post.noindex),
});

/* Google truncates a title around 60 characters and a description around 155,
 * so the counters warn before the hard field limits (70/170) rather than at
 * them — an SEO person wants to know they are about to be cut off, not that
 * they have run out of room. */
const SEO_TITLE_IDEAL = 60;
const SEO_DESC_IDEAL = 155;

function CharacterMeter({ value, ideal, max }) {
  const length = String(value || "").length;
  const tone = !length
    ? "text-base-content/40"
    : length > max
      ? "text-error"
      : length > ideal
        ? "text-warning"
        : "text-success";
  return (
    <span className={`mt-1 block text-right text-[10px] ${tone}`}>
      {length}/{ideal} ideal · {max} max
    </span>
  );
}

/* What the article will look like in a search result. The single most useful
 * thing you can put in front of somebody writing meta tags, and it costs
 * nothing to draw. */
function SearchPreview({ draft }) {
  const title = draft.seoTitle || draft.title || "Untitled article";
  const description = draft.seoDescription || draft.excerpt || "";
  const slug = draft.slug || "article-url";
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-3">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-base-content/40">
        Google preview
      </p>
      <p className="truncate text-[11px] text-base-content/50">
        {storefrontPublicUrl.replace(/^https?:\/\//, "")} › blog › {slug}
      </p>
      <p className="mt-0.5 truncate text-[15px] leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">
        {title.length > SEO_TITLE_IDEAL ? `${title.slice(0, SEO_TITLE_IDEAL)}…` : title}
      </p>
      <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-base-content/60">
        {description.length > SEO_DESC_IDEAL
          ? `${description.slice(0, SEO_DESC_IDEAL)}…`
          : description || "No description yet — search engines will invent one."}
      </p>
    </div>
  );
}

/* `canEditPage` is false for content-only accounts: they write articles, but
 * the blog landing page's own headings belong to the shop. The server enforces
 * this too — the settings endpoint is not on their allowlist — so this only
 * decides whether to draw a form that would fail. */
export default function BlogManager({ posts = [], settings, isActing, canEditPage = true }) {
  const dispatch = useDispatch();
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState(makeBlankBlogPost);
  const [pageDraft, setPageDraft] = useState(BLOG_PAGE_DEFAULTS);
  const [isUploading, setIsUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  /* Bumped whenever a DIFFERENT article is loaded into the form. The editor
   * uses it to know when to replace its document — it must not do that on
   * every keystroke, or the cursor jumps to the end mid-word. */
  const [editorKey, setEditorKey] = useState(0);
  /* The draft as it last matched what is saved (or blank, for a new article).
   * Anything different from this is unsaved work. */
  const savedSnapshot = useRef(snapshotOf(makeBlankBlogPost()));
  const isDirty = snapshotOf(draft) !== savedSnapshot.current;

  useEffect(() => {
    setPageDraft({ ...BLOG_PAGE_DEFAULTS, ...(settings?.blog || {}) });
  }, [settings?.blog]);

  // Offer back whatever was being written when the form last went away.
  useEffect(() => {
    const stored = readStoredDraft();
    if (!stored) return;
    setEditingId(stored.editingId || "");
    setDraft({ ...makeBlankBlogPost(), ...stored.draft });
    savedSnapshot.current = stored.baseline || snapshotOf(makeBlankBlogPost());
    setEditorKey((key) => key + 1);
    toast.success("Your unsaved article was restored.", { id: "blog-draft-restored" });
  }, []);

  // Keep the unsaved draft backed up while it changes; drop it once saved.
  useEffect(() => {
    const timer = setTimeout(() => {
      writeStoredDraft(
        isDirty ? { editingId, draft, baseline: savedSnapshot.current, savedAt: Date.now() } : null,
      );
    }, DRAFT_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, editingId, isDirty]);

  // Closing or reloading the page with unsaved work asks first.
  useEffect(() => {
    if (!isDirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const load = (id, nextDraft) => {
    setEditingId(id);
    setDraft(nextDraft);
    savedSnapshot.current = snapshotOf(nextDraft);
    writeStoredDraft(null);
    setEditorKey((key) => key + 1);
    setShowPreview(false);
  };

  const confirmDiscard = () =>
    !isDirty || window.confirm("You have unsaved changes to this article. Discard them?");

  const reset = () => load("", makeBlankBlogPost());

  const startNew = () => {
    if (confirmDiscard()) reset();
  };

  const edit = (post) => {
    // Reopening the article already open would reload the saved copy over
    // unsaved edits, so that asks first too.
    if (!confirmDiscard()) return;
    load(post._id, draftFromPost(post));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* Both the cover picker and the editor's image button land here. Returns the
   * URL so the editor can insert it at the caret; the cover just assigns it. */
  const uploadImage = async (files) => {
    if (!files?.length) return "";
    setIsUploading(true);
    try {
      const images = await dispatch(uploadBlogImages(files)).unwrap();
      const url = images?.[0]?.url || images?.[0];
      if (!url) throw new Error("Upload did not return an image URL");
      toast.success("Image uploaded");
      return url;
    } catch (error) {
      toast.error(typeof error === "string" ? error : error?.message || "Image upload failed");
      return "";
    } finally {
      setIsUploading(false);
    }
  };

  const uploadCover = async (files) => {
    const url = await uploadImage(files);
    if (url) setDraft((current) => ({ ...current, coverImage: url }));
  };

  const savePost = async (event) => {
    event.preventDefault();

    // The editor's empty document is "<p></p>", which is truthy. Ask the
    // question people actually mean: is there anything in the article?
    const hasBody = Boolean(
      draft.content.replace(/<[^>]*>/g, "").trim() || /<(img|iframe|hr)\b/i.test(draft.content),
    );
    if (!hasBody) {
      toast.error("The article is empty — write something before saving.");
      return;
    }

    const payload = {
      ...draft,
      publishedAt:
        draft.status === "published" && draft.publishedAt
          ? new Date(draft.publishedAt).toISOString()
          : undefined,
    };
    const result = await dispatch(
      editingId ? updateOnlineBlogPost({ id: editingId, ...payload }) : createOnlineBlogPost(payload),
    );
    if (result.error) {
      toast.error(result.payload || "Could not save the blog post");
      return;
    }
    toast.success(editingId ? "Blog post updated" : "Blog post created");

    /* Stay on the article. Clearing the form here made a successful save look
     * exactly like losing everything. The editor's own document is kept as it
     * is (editorKey is not bumped), so the cursor stays where it was; only the
     * fields the server fills in — the slug built from the title, the publish
     * time — are taken from what came back. */
    const saved = result.payload;
    if (saved?._id) {
      const next = {
        ...draft,
        slug: saved.slug || draft.slug,
        publishedAt: toLocalDateTime(saved.publishedAt) || draft.publishedAt,
      };
      setEditingId(saved._id);
      setDraft(next);
      savedSnapshot.current = snapshotOf(next);
    } else {
      savedSnapshot.current = snapshotOf(draft);
    }
    writeStoredDraft(null);
  };

  const saveBlogPage = async (event) => {
    event.preventDefault();
    const result = await dispatch(saveOnlineSettings({ blog: pageDraft }));
    result.error
      ? toast.error(result.payload || "Could not save the blog page")
      : toast.success("Blog page settings saved");
  };

  const remove = async (post) => {
    if (!window.confirm(`Delete “${post.title}”? This cannot be undone.`)) return;
    const result = await dispatch(deleteOnlineBlogPost(post._id));
    result.error
      ? toast.error(result.payload || "Could not delete the blog post")
      : toast.success("Blog post deleted");
    if (!result.error && editingId === post._id) reset();
  };

  const isLive = (post) =>
    post.status === "published" && (!post.publishedAt || new Date(post.publishedAt) <= new Date());

  const visiblePosts = posts.filter((post) => {
    const term = search.trim().toLowerCase();
    if (term && ![post.title, post.slug, post.excerpt].some((field) =>
      String(field || "").toLowerCase().includes(term),
    )) {
      return false;
    }
    if (statusFilter === "published") return isLive(post);
    if (statusFilter === "scheduled") return post.status === "published" && !isLive(post);
    if (statusFilter === "draft") return post.status !== "published";
    return true;
  });

  return (
    <div className="min-w-0 space-y-5">
      {canEditPage && (
        <form onSubmit={saveBlogPage} className="rounded-xl border bg-base-100 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">Blog landing page</h2>
              <p className="mt-1 text-xs text-base-content/50">
                Control the headings and introduction shown on the public blog page.
              </p>
            </div>
            <button className="btn btn-primary btn-sm gap-2" disabled={isActing}>
              <FiSave /> Save page settings
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Eyebrow">
              <input className="input input-sm input-bordered w-full" maxLength={80} value={pageDraft.eyebrow}
                onChange={(event) => setPageDraft((current) => ({ ...current, eyebrow: event.target.value }))} />
            </Field>
            <Field label="Page heading">
              <input className="input input-sm input-bordered w-full" maxLength={140} value={pageDraft.heading}
                onChange={(event) => setPageDraft((current) => ({ ...current, heading: event.target.value }))} />
            </Field>
            <Field label="Introduction">
              <textarea rows={3} className="textarea textarea-sm textarea-bordered w-full" maxLength={500} value={pageDraft.intro}
                onChange={(event) => setPageDraft((current) => ({ ...current, intro: event.target.value }))} />
            </Field>
            <Field label="Featured section heading">
              <input className="input input-sm input-bordered w-full" maxLength={100} value={pageDraft.featuredHeading}
                onChange={(event) => setPageDraft((current) => ({ ...current, featuredHeading: event.target.value }))} />
            </Field>
            <Field label="Latest section heading">
              <input className="input input-sm input-bordered w-full" maxLength={100} value={pageDraft.latestHeading}
                onChange={(event) => setPageDraft((current) => ({ ...current, latestHeading: event.target.value }))} />
            </Field>
            <Field label="Search result title">
              <input className="input input-sm input-bordered w-full" maxLength={70} value={pageDraft.seoTitle}
                onChange={(event) => setPageDraft((current) => ({ ...current, seoTitle: event.target.value }))} />
              <CharacterMeter value={pageDraft.seoTitle} ideal={SEO_TITLE_IDEAL} max={70} />
            </Field>
            <Field label="Search result description">
              <textarea rows={3} className="textarea textarea-sm textarea-bordered w-full" maxLength={170} value={pageDraft.seoDescription}
                onChange={(event) => setPageDraft((current) => ({ ...current, seoDescription: event.target.value }))} />
              <CharacterMeter value={pageDraft.seoDescription} ideal={SEO_DESC_IDEAL} max={170} />
            </Field>
          </div>
        </form>
      )}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <form onSubmit={savePost} className="min-w-0 space-y-4 rounded-xl border bg-base-100 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">
                {editingId ? "Edit article" : "Write a new article"}
              </h2>
              <p className="mt-1 text-xs text-base-content/50">
                Format text, add headings, links, images and video. Drafts stay private until you publish.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className={`btn btn-sm gap-2 ${showPreview ? "btn-primary" : ""}`}
                onClick={() => setShowPreview((current) => !current)}
              >
                <FiEye /> {showPreview ? "Back to editing" : "Preview"}
              </button>
              {(editingId || isDirty) && (
                <button type="button" className="btn btn-sm" onClick={startNew}>
                  <FiPlus /> New article
                </button>
              )}
            </div>
          </div>

          <Field label="Title">
            <input
              required
              maxLength={180}
              className="input input-bordered w-full text-lg font-semibold"
              placeholder="What is this article called?"
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            />
          </Field>

          {showPreview ? (
            <section className="rounded-lg border border-base-300 bg-base-200/30 p-5">
              <p className="mb-4 font-mono text-[10px] uppercase tracking-wide text-base-content/40">
                Roughly how this will read on the site
              </p>
              {draft.coverImage && (
                <img
                  src={draft.coverImage}
                  alt={draft.coverAlt || ""}
                  className="mb-6 aspect-[16/8] w-full rounded-lg border object-cover"
                />
              )}
              <h1
                className={`font-display text-3xl font-bold leading-tight sm:text-4xl ${
                  draft.titleAlign === "left" ? "text-left" : "text-center"
                }`}
              >
                {draft.title || "Untitled article"}
              </h1>
              {draft.excerpt && (
                <p className="mx-auto mt-4 max-w-2xl text-center text-sm text-base-content/60">
                  {draft.excerpt}
                </p>
              )}
              {/* Safe: this is the same string the editor just produced in this
                  browser, rendered back to its author. It has not been near the
                  network, and the server sanitises it again before anybody else
                  can ever see it. */}
              <div
                className="rich-content mx-auto mt-8 max-w-3xl"
                dangerouslySetInnerHTML={{ __html: draft.content }}
              />
            </section>
          ) : (
            // A div, not a <label>: see Field. Inside a label every click in the
            // article pressed the editor's Undo button.
            <Field label="Article" as="div">
              <Suspense
                fallback={
                  <div className="grid h-96 place-items-center rounded-lg border border-base-300 bg-base-200/40">
                    <span className="loading loading-spinner loading-md text-primary" />
                  </div>
                }
              >
                <RichTextEditor
                  value={draft.content}
                  syncKey={editorKey}
                  disabled={isActing}
                  onUploadImage={uploadImage}
                  placeholder="Start writing. Use the toolbar for headings, links, images and video…"
                  onChange={(html) => setDraft((current) => ({ ...current, content: html }))}
                />
              </Suspense>
            </Field>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="URL slug (leave blank to build it from the title)">
              <input
                maxLength={180}
                className="input input-sm input-bordered w-full font-mono text-xs"
                placeholder="article-url-slug"
                value={draft.slug}
                onChange={(event) => setDraft((current) => ({ ...current, slug: event.target.value }))}
              />
            </Field>
            <Field label="Author">
              <input
                maxLength={100}
                className="input input-sm input-bordered w-full"
                value={draft.author}
                onChange={(event) => setDraft((current) => ({ ...current, author: event.target.value }))}
              />
            </Field>
          </div>

          <Field label="Excerpt (leave blank and one is written from the article)">
            <textarea
              maxLength={600}
              rows={2}
              className="textarea textarea-bordered w-full"
              placeholder="A concise summary shown on the blog page and in link previews."
              value={draft.excerpt}
              onChange={(event) => setDraft((current) => ({ ...current, excerpt: event.target.value }))}
            />
          </Field>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Cover image URL">
              <input
                className="input input-sm input-bordered w-full"
                placeholder="https://res.cloudinary.com/..."
                value={draft.coverImage}
                onChange={(event) => setDraft((current) => ({ ...current, coverImage: event.target.value }))}
              />
            </Field>
            <Field label="Upload cover image">
              <input
                type="file"
                accept="image/*"
                className="file-input file-input-sm file-input-bordered w-full"
                disabled={isUploading}
                onChange={(event) => {
                  uploadCover(event.target.files);
                  event.target.value = "";
                }}
              />
            </Field>
          </div>
          <Field label="Cover image alternative text">
            <input
              maxLength={300}
              className="input input-sm input-bordered w-full"
              placeholder="Describe the image for accessibility and search engines"
              value={draft.coverAlt}
              onChange={(event) => setDraft((current) => ({ ...current, coverAlt: event.target.value }))}
            />
          </Field>
          {draft.coverImage && !showPreview && (
            <img src={draft.coverImage} alt="Blog cover preview" className="aspect-[16/8] w-full rounded-lg border object-cover" />
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Status">
              <select
                className="select select-sm select-bordered w-full"
                value={draft.status}
                onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </Field>
            <Field label="Publish date (future = scheduled)">
              <input
                type="datetime-local"
                className="input input-sm input-bordered w-full"
                disabled={draft.status !== "published"}
                value={draft.publishedAt}
                onChange={(event) => setDraft((current) => ({ ...current, publishedAt: event.target.value }))}
              />
            </Field>
            <Field label="Article title alignment">
              <select
                className="select select-sm select-bordered w-full"
                value={draft.titleAlign}
                onChange={(event) => setDraft((current) => ({ ...current, titleAlign: event.target.value }))}
              >
                <option value="center">Centre</option>
                <option value="left">Left</option>
              </select>
            </Field>
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-base-300 p-3 text-sm">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={draft.featured}
              onChange={(event) => setDraft((current) => ({ ...current, featured: event.target.checked }))}
            />
            <span>
              <strong>Feature this article</strong>
              <span className="ml-2 text-base-content/50">Show it prominently on the blog landing page.</span>
            </span>
          </label>

          <details className="rounded-xl border border-base-300 p-4" open={!editingId ? false : undefined}>
            <summary className="cursor-pointer font-display font-bold">Search engine settings</summary>
            <div className="mt-4 grid gap-3">
              <SearchPreview draft={draft} />
              <Field label="Search result title">
                <input
                  maxLength={70}
                  className="input input-sm input-bordered w-full"
                  placeholder={draft.title || "Falls back to the article title"}
                  value={draft.seoTitle}
                  onChange={(event) => setDraft((current) => ({ ...current, seoTitle: event.target.value }))}
                />
                <CharacterMeter value={draft.seoTitle} ideal={SEO_TITLE_IDEAL} max={70} />
              </Field>
              <Field label="Search result description">
                <textarea
                  maxLength={170}
                  rows={3}
                  className="textarea textarea-sm textarea-bordered w-full"
                  placeholder="Falls back to the excerpt"
                  value={draft.seoDescription}
                  onChange={(event) => setDraft((current) => ({ ...current, seoDescription: event.target.value }))}
                />
                <CharacterMeter value={draft.seoDescription} ideal={SEO_DESC_IDEAL} max={170} />
              </Field>
              <Field label="Canonical URL (only if this article is published elsewhere first)">
                <input
                  className="input input-sm input-bordered w-full font-mono text-xs"
                  placeholder="https://example.com/original-article"
                  value={draft.canonicalUrl}
                  onChange={(event) => setDraft((current) => ({ ...current, canonicalUrl: event.target.value }))}
                />
              </Field>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-base-300 p-3 text-sm">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={draft.noindex}
                  onChange={(event) => setDraft((current) => ({ ...current, noindex: event.target.checked }))}
                />
                <span>
                  <strong>Hide from search engines</strong>
                  <span className="ml-2 text-base-content/50">
                    Stays live and linkable, but asks Google not to list it.
                  </span>
                </span>
              </label>
            </div>
          </details>

          <button className="btn btn-primary w-full gap-2" disabled={isActing || isUploading}>
            <FiSave />{" "}
            {isUploading
              ? "Uploading image…"
              : editingId
                ? "Save article"
                : draft.status === "published"
                  ? "Publish article"
                  : "Save draft"}
          </button>
          <p className={`text-center text-xs ${isDirty ? "text-warning" : "text-base-content/50"}`} aria-live="polite">
            {isDirty
              ? "Unsaved changes — kept in this browser until you save."
              : editingId
                ? "All changes saved."
                : ""}
          </p>
        </form>

        <section className="min-w-0 rounded-xl border bg-base-100 p-4 sm:p-5">
          <h2 className="font-display text-xl font-bold">Articles</h2>
          <p className="mt-1 text-xs text-base-content/50">
            {posts.length} article{posts.length === 1 ? "" : "s"} for this store.
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              className="input input-sm input-bordered w-full"
              placeholder="Search by title or slug…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="select select-sm select-bordered"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All</option>
              <option value="published">Published</option>
              <option value="scheduled">Scheduled</option>
              <option value="draft">Drafts</option>
            </select>
          </div>

          <div className="mt-4 space-y-3">
            {visiblePosts.map((post) => (
              <article
                key={post._id}
                className={`overflow-hidden rounded-xl border ${
                  editingId === post._id ? "border-primary ring-1 ring-primary/30" : "border-base-300"
                }`}
              >
                {post.coverImage && (
                  <img src={post.coverImage} alt="" className="aspect-[16/8] w-full object-cover" loading="lazy" />
                )}
                <div className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`badge badge-sm ${
                        !isLive(post)
                          ? post.status === "published"
                            ? "badge-warning"
                            : "badge-ghost"
                          : "badge-success"
                      }`}
                    >
                      {post.status === "published" ? (isLive(post) ? "Published" : "Scheduled") : "Draft"}
                    </span>
                    {post.featured && <span className="badge badge-sm badge-primary">Featured</span>}
                    {post.noindex && <span className="badge badge-sm badge-ghost">No-index</span>}
                    <span className="font-mono text-[10px] text-base-content/45">/{post.slug}</span>
                  </div>
                  <h3 className="mt-2 font-display text-lg font-bold leading-tight">{post.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm text-base-content/60">{post.excerpt}</p>
                  {post.readingMinutes > 0 && (
                    <p className="mt-1 text-[11px] text-base-content/40">
                      {post.readingMinutes} min read
                    </p>
                  )}
                  {!post.content && post.blocks?.length > 0 && (
                    <p className="mt-2 rounded bg-warning/10 px-2 py-1 text-[11px] text-warning">
                      Written in the old editor — open it and save to convert.
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" className="btn btn-sm gap-2" onClick={() => edit(post)}>
                      <FiEdit2 /> Edit
                    </button>
                    {isLive(post) && (
                      <a
                        className="btn btn-sm gap-2"
                        href={`${storefrontPublicUrl}/blog/${post.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <FiExternalLink /> View
                      </a>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost gap-2 text-error"
                      disabled={isActing}
                      onClick={() => remove(post)}
                    >
                      <FiTrash2 /> Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {!visiblePosts.length && (
              <div className="rounded-xl border border-dashed border-base-300 p-8 text-center text-sm text-base-content/50">
                {posts.length
                  ? "No articles match that search."
                  : "No articles yet. Write your first one on the left."}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
