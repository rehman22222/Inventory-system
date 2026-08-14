const mongoose = require("mongoose");

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
    blocks: { type: [BlogBlockSchema], default: [] },
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
