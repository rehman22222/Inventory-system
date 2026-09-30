const mongoose = require("mongoose");

/* A reader's comment on a blog article.
 *
 * Unlike a product review, which can only come from a delivered order, anyone
 * can write one of these — which is exactly why nothing is shown until the shop
 * has looked at it. Every comment starts "pending"; an admin or super admin
 * approves it (it appears on the article) or hides it (it never does, but the
 * record is kept so the same thing can be recognised if it comes back).
 *
 * The text is stored and rendered as plain text. It never becomes HTML, so
 * there is nothing in it for a browser to run.
 */
const OnlineBlogCommentSchema = new mongoose.Schema(
  {
    store: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: "OnlineBlogPost", required: true },
    // Snapshot of the article's title, so the moderation queue still reads
    // correctly if the article is renamed or deleted.
    postTitle: { type: String, default: "", trim: true },

    name: { type: String, required: true, trim: true, maxlength: 80 },
    // Never shown on the site. Kept so the shop can reply privately, and to
    // throttle one address posting over and over.
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 2000 },

    // Set when the reader was signed in to their shop account, so the queue
    // can tell a known customer from an anonymous visitor.
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "OnlineCustomer", default: null },

    status: {
      type: String,
      enum: ["pending", "approved", "hidden"],
      default: "pending",
    },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    moderatedByName: { type: String, default: "" },
    moderatedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// The article page: its approved comments, oldest first (a conversation).
OnlineBlogCommentSchema.index({ post: 1, status: 1, createdAt: 1 });
// The moderation queue: newest first, filtered by status.
OnlineBlogCommentSchema.index({ store: 1, status: 1, createdAt: -1 });
// Flood control: how much one address has posted recently.
OnlineBlogCommentSchema.index({ email: 1, createdAt: -1 });

module.exports = mongoose.model("OnlineBlogComment", OnlineBlogCommentSchema);
