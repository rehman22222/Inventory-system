/* Blog comments: readers write them on the website, the shop decides which are
 * shown.
 *
 * Storefront (called server-to-server by the website, see onlineStoreRouter):
 *   GET  /api/storefront/blog/:slug/comments   approved comments on one article
 *   POST /api/storefront/blog/:slug/comments   a new comment, always "pending"
 *
 * Back office (admin and super admin only):
 *   GET    /api/online/blog-comments           the moderation queue
 *   PATCH  /api/online/blog-comments/:id       approve / hide / back to pending
 *   DELETE /api/online/blog-comments/:id       remove for good
 *
 * WHY EVERYTHING WAITS FOR APPROVAL. A public comment box on a shop's site is
 * the first place spam lands, and on a site selling age-restricted products an
 * unmoderated comment is also a compliance risk. So nothing a visitor writes
 * reaches the article until somebody at the shop has read it.
 *
 * SPAM, BEFORE IT REACHES THE QUEUE. Every request arrives from the website's
 * own server, so an IP limit would throttle the whole public at once. Instead:
 *   - a hidden "website" field real people never see (a bot fills it in; the
 *     comment is accepted politely and thrown away, so the bot learns nothing),
 *   - at most MAX_LINKS links in a comment,
 *   - at most MAX_RECENT_PER_EMAIL comments from one address per window,
 *   - the same text on the same article from the same address only once.
 */

const mongoose = require("mongoose");
const OnlineBlogComment = require("../models/OnlineBlogCommentmodel");
const OnlineBlogPost = require("../models/OnlineBlogPostmodel");
const Store = require("../models/Storemodel");
const logActivity = require("../libs/logger");

const MAX_LINKS = 2;
const MAX_RECENT_PER_EMAIL = 3;
const RECENT_WINDOW_MS = 10 * 60 * 1000;
const STATUSES = ["pending", "approved", "hidden"];

const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const storeId = async () => {
  const shop = await Store.findOne({ key: "shop" }).select("_id").lean();
  if (!shop) throw Object.assign(new Error("Shop is not set up yet"), { statusCode: 503 });
  return shop._id;
};

// Only an article a visitor can actually read may be commented on.
const livePost = (store, slug) =>
  OnlineBlogPost.findOne({
    store,
    slug: slugify(slug),
    status: "published",
    publishedAt: { $lte: new Date() },
  })
    .select("_id title")
    .lean();

// Collapse runs of whitespace and blank lines; keep single line breaks.
const cleanText = (value, max) =>
  String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);

const countLinks = (text) => (text.match(/(https?:\/\/|www\.)/gi) || []).length;

// What the website is allowed to see of a comment. Never the email.
const publicComment = (comment) => ({
  _id: String(comment._id),
  name: comment.name,
  body: comment.body,
  createdAt: comment.createdAt,
  customer: Boolean(comment.customer),
});

const fail = (res, error, fallback) =>
  res.status(error.statusCode || 500).json({
    message: error.statusCode ? error.message : fallback,
  });

/* ── Storefront ─────────────────────────────────────────────────────────── */

module.exports.storefrontBlogComments = async (req, res) => {
  try {
    const store = await storeId();
    const post = await livePost(store, req.params.slug);
    if (!post) return res.status(404).json({ message: "Blog post not found" });

    const comments = await OnlineBlogComment.find({ post: post._id, status: "approved" })
      .sort({ createdAt: 1 })
      .limit(500)
      .lean();
    return res.status(200).json({ comments: comments.map(publicComment) });
  } catch (error) {
    return fail(res, error, "Could not load comments");
  }
};

module.exports.submitBlogComment = async (req, res) => {
  try {
    const store = await storeId();
    const post = await livePost(store, req.params.slug);
    if (!post) return res.status(404).json({ message: "Blog post not found" });

    const accepted = {
      message: "Thanks — your comment will appear once the shop has approved it.",
    };

    // The honeypot. Real readers never see this field.
    if (String(req.body?.website || "").trim()) return res.status(201).json(accepted);

    // A signed-in customer comments as themselves; the name they typed is still
    // used if they gave one, so they can choose how they appear.
    const account = req.customer || null;
    const name = cleanText(req.body?.name || account?.name, 80);
    const email = String(account?.email || req.body?.email || "")
      .trim()
      .toLowerCase()
      .slice(0, 200);
    const body = cleanText(req.body?.body, 2000);

    if (!name) return res.status(400).json({ message: "Please add your name." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Please add a valid email address." });
    }
    if (body.length < 3) return res.status(400).json({ message: "Please write a comment." });
    if (countLinks(body) > MAX_LINKS) {
      return res
        .status(400)
        .json({ message: `Please include no more than ${MAX_LINKS} links in a comment.` });
    }

    const recent = await OnlineBlogComment.countDocuments({
      email,
      createdAt: { $gte: new Date(Date.now() - RECENT_WINDOW_MS) },
    });
    if (recent >= MAX_RECENT_PER_EMAIL) {
      return res
        .status(429)
        .json({ message: "You've commented a few times just now — please try again later." });
    }

    const duplicate = await OnlineBlogComment.exists({ post: post._id, email, body });
    if (duplicate) return res.status(201).json(accepted);

    const comment = await OnlineBlogComment.create({
      store,
      post: post._id,
      postTitle: post.title,
      name,
      email,
      body,
      customer: account?._id || null,
    });

    // Lets an open back office show the new comment without a refresh.
    try {
      req.app.get("io")?.emit("blogCommentSubmitted", { id: String(comment._id), post: post.title });
    } catch {
      /* realtime is best-effort */
    }

    return res.status(201).json(accepted);
  } catch (error) {
    return fail(res, error, "Could not save your comment");
  }
};

/* ── Back office ────────────────────────────────────────────────────────── */

module.exports.listBlogComments = async (req, res) => {
  try {
    const store = await storeId();
    const filter = { store };
    if (STATUSES.includes(req.query.status)) filter.status = req.query.status;
    if (mongoose.isValidObjectId(req.query.post)) filter.post = req.query.post;

    const [comments, counts] = await Promise.all([
      OnlineBlogComment.find(filter).sort({ createdAt: -1 }).limit(500).lean(),
      OnlineBlogComment.aggregate([
        { $match: { store } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    return res.status(200).json({
      comments,
      counts: Object.fromEntries(STATUSES.map((s) => [s, counts.find((c) => c._id === s)?.count || 0])),
    });
  } catch (error) {
    return fail(res, error, "Could not load comments");
  }
};

module.exports.setBlogCommentStatus = async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${STATUSES.join(", ")}` });
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const store = await storeId();
    const comment = await OnlineBlogComment.findOneAndUpdate(
      { _id: req.params.id, store },
      {
        $set: {
          status,
          moderatedBy: req.user?._id || null,
          moderatedByName: req.user?.name || "",
          moderatedAt: new Date(),
        },
      },
      { new: true },
    ).lean();
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    await logActivity({
      action: "Blog Comment Moderated",
      description: `Comment by "${comment.name}" on "${comment.postTitle}" set to ${status}.`,
      entity: "blogComment",
      entityId: comment._id,
      userId: req.user?._id,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    return res.status(200).json({ comment });
  } catch (error) {
    return fail(res, error, "Could not update the comment");
  }
};

module.exports.deleteBlogComment = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: "Comment not found" });
    }
    const store = await storeId();
    const comment = await OnlineBlogComment.findOneAndDelete({ _id: req.params.id, store }).lean();
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    await logActivity({
      action: "Blog Comment Deleted",
      description: `Comment by "${comment.name}" on "${comment.postTitle}" deleted.`,
      entity: "blogComment",
      entityId: comment._id,
      userId: req.user?._id,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    return res.status(200).json({ message: "Comment deleted", id: String(comment._id) });
  } catch (error) {
    return fail(res, error, "Could not delete the comment");
  }
};
