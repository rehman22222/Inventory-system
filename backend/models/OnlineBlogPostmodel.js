const mongoose = require("mongoose");

/* Legacy — the block editor that preceded the WYSIWYG one.
 *
 * Articles used to be an ordered array of typed blocks. They are now a single
 * sanitised HTML document in `content`. This schema stays so that posts written
 * before the change are not silently truncated when they are loaded and saved
 * again, and so the storefront can still render one that has not been migrated
 * yet. `scripts/migrateBlogToRichText.js` converts them; nothing writes blocks
 * any more. */
const BlogBlockSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["paragraph", "heading", "quote", "image", "video", "button"],
      default: "paragraph",
    },
    text: { type: String, default: "", trim: true, maxlength: 12000 },
    url: { type: String, default: "", trim: true, maxlength: 2000 },
    caption: { type: String, default: "", trim: true, maxlength: 300 },
    alt: { type: String, default: "", trim: true, maxlength: 300 },
    level: { type: String, enum: ["h2", "h3"], default: "h2" },
    align: {
      type: String,
      enum: ["left", "center", "right"],
      default: "left",
    },
  },
  { _id: true },
);

const OnlineBlogPostSchema = new mongoose.Schema(
  {
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    excerpt: { type: String, default: "", trim: true, maxlength: 600 },
    coverImage: { type: String, default: "", trim: true, maxlength: 2000 },
    coverAlt: { type: String, default: "", trim: true, maxlength: 300 },
    author: { type: String, default: "Cliffs of Puff", trim: true, maxlength: 100 },
    featured: { type: Boolean, default: false, index: true },
    titleAlign: {
      type: String,
      enum: ["left", "center"],
      default: "center",
    },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
      index: true,
    },
    publishedAt: { type: Date, default: null, index: true },
    seoTitle: { type: String, default: "", trim: true, maxlength: 70 },
    seoDescription: { type: String, default: "", trim: true, maxlength: 170 },
    /* The article itself: sanitised HTML from the WYSIWYG editor.
     *
     * NEVER assign to this from anywhere but applyBlogPayload, which routes it
     * through libs/richText.sanitizeRichText. The storefront renders it with
     * dangerouslySetInnerHTML, so an unsanitised write here is stored XSS on a
     * public page. The 200k ceiling is roughly a 25,000-word article — far
     * past anything anyone will write, but bounded. */
    content: { type: String, default: "", maxlength: 200000 },
    // Derived from `content` on save so the storefront never has to count
    // words at render time.
    readingMinutes: { type: Number, default: 0, min: 0 },
    blocks: { type: [BlogBlockSchema], default: [] },
    /* ── SEO controls ─────────────────────────────────────────────────────
     * The people who will live in this editor are the shop's SEO people, so
     * the two knobs they always reach for are here rather than in a plugin. */
    // Points search engines at the original when an article is syndicated or
    // duplicates another URL. Empty = this page is the canonical one.
    canonicalUrl: { type: String, default: "", trim: true, maxlength: 2000 },
    // Keeps a page out of search results without unpublishing it — the usual
    // treatment for thin, seasonal or campaign landing articles.
    noindex: { type: Boolean, default: false },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

OnlineBlogPostSchema.index({ store: 1, slug: 1 }, { unique: true });
OnlineBlogPostSchema.index({ store: 1, status: 1, publishedAt: -1 });

module.exports = mongoose.model("OnlineBlogPost", OnlineBlogPostSchema);
