/* Proof that blog comments only ever appear when the shop says so.
 *
 *   npm run verify:blog-comments
 *
 * What matters here, in order:
 *   1. a visitor's comment is saved but NOT shown until it is approved;
 *   2. hiding an approved comment takes it off the article again;
 *   3. the website never receives a commenter's email address;
 *   4. only a live, published article can be commented on;
 *   5. spam is turned away before it reaches the queue (honeypot, links,
 *      flooding, repeats), and a bot gets no signal that it was;
 *   6. a signed-in customer comments as their account;
 *   7. moderation is written to the activity log.
 *
 * Follows verifyQuickSell.js exactly: a uniquely named TEMPORARY database is
 * created on the configured cluster, the real controllers run against it, and
 * only that database is dropped at the end. Nothing in the shop's own data is
 * read or written.
 */
require("dotenv").config();
const mongoose = require("mongoose");

// Atlas caps database names at 38 bytes. Keep the timestamp uniqueness without
// making the verification database too long to create.
const tempName = `e360_bc_${Date.now()}`;

const withDatabase = (uri, database) => {
  const queryAt = uri.indexOf("?");
  const base = queryAt === -1 ? uri : uri.slice(0, queryAt);
  const query = queryAt === -1 ? "" : uri.slice(queryAt);
  const slash = base.lastIndexOf("/");
  if (slash < "mongodb://".length) throw new Error("MONGODB_URL has no database path");
  return `${base.slice(0, slash + 1)}${database}${query}`;
};

const response = () => {
  const result = { statusCode: 200, body: null };
  return {
    result,
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
};

const request = ({ body = {}, params = {}, query = {}, user = null, customer = null } = {}) => ({
  body,
  params,
  query,
  user,
  customer,
  ip: "127.0.0.1",
  get: () => "verify-script",
  app: { get: () => null },
});

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `\n          ${detail}`}`);
};

async function main() {
  if (!process.env.MONGODB_URL) throw new Error("MONGODB_URL is not configured");
  process.env.MONGODB_URL = withDatabase(process.env.MONGODB_URL, tempName);
  await mongoose.connect(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 20_000 });
  if (mongoose.connection.name !== tempName) {
    throw new Error(`Refusing to run: connected to ${mongoose.connection.name}, not the temp database`);
  }
  console.log(`temporary database: ${mongoose.connection.name}\n`);

  const Store = require("../models/Storemodel");
  const User = require("../models/Usermodel");
  const OnlineBlogPost = require("../models/OnlineBlogPostmodel");
  const OnlineBlogComment = require("../models/OnlineBlogCommentmodel");
  const ActivityLog = require("../models/ActivityLogmodel");
  const comments = require("../controller/onlineBlogCommentController");

  const store = await Store.create({ key: "shop", name: "Blog comment verification shop", currency: "EUR" });
  const admin = await User.create({
    name: "Verify Admin",
    email: `verify_bc_${Date.now()}@example.test`,
    password: "not-a-real-password",
    role: "admin",
  });
  const post = await OnlineBlogPost.create({
    store: store._id,
    title: "Vape Guide",
    slug: "vape-guide",
    status: "published",
    publishedAt: new Date(Date.now() - 60_000),
    content: "<p>Article</p>",
  });
  await OnlineBlogPost.create({
    store: store._id,
    title: "Unpublished",
    slug: "draft-post",
    status: "draft",
    content: "<p>Draft</p>",
  });

  const submit = async (body, slug = "vape-guide", customer = null) => {
    const res = response();
    await comments.submitBlogComment(request({ body, params: { slug }, customer }), res);
    return res.result;
  };
  const shown = async (slug = "vape-guide") => {
    const res = response();
    await comments.storefrontBlogComments(request({ params: { slug } }), res);
    return res.result;
  };
  const moderate = async (id, status) => {
    const res = response();
    await comments.setBlogCommentStatus(request({ body: { status }, params: { id }, user: admin }), res);
    return res.result;
  };

  console.log("moderation");
  const first = await submit({ name: "Aoife", email: "Aoife@Example.ie", body: "Really useful guide, thanks!" });
  check("a visitor's comment is accepted", first.statusCode === 201, JSON.stringify(first));
  const saved = await OnlineBlogComment.findOne({ name: "Aoife" }).lean();
  check("it is stored as pending", saved?.status === "pending", `status=${saved?.status}`);
  check("its email is stored lowercased", saved?.email === "aoife@example.ie", saved?.email);
  let page = await shown();
  check("a pending comment is NOT on the article", page.body?.comments?.length === 0, JSON.stringify(page.body));

  const approved = await moderate(String(saved._id), "approved");
  check("an admin can approve it", approved.statusCode === 200 && approved.body?.comment?.status === "approved");
  page = await shown();
  check("once approved it appears on the article", page.body?.comments?.length === 1);
  check("the website never receives the email", !JSON.stringify(page.body).includes("example.ie"), JSON.stringify(page.body));

  await moderate(String(saved._id), "hidden");
  page = await shown();
  check("hiding it takes it off the article again", page.body?.comments?.length === 0);
  const bogus = await moderate(String(saved._id), "published");
  check("an unknown status is refused", bogus.statusCode === 400, String(bogus.statusCode));

  const log = await ActivityLog.findOne({ entity: "blogComment" }).lean();
  check("moderation is written to the activity log", Boolean(log) && /hidden|approved/.test(log.description), log?.description);

  console.log("\nwhich articles");
  const draft = await submit({ name: "X", email: "x@example.ie", body: "hello there" }, "draft-post");
  check("an unpublished article cannot be commented on", draft.statusCode === 404, String(draft.statusCode));
  const missing = await submit({ name: "X", email: "x@example.ie", body: "hello there" }, "no-such-post");
  check("a missing article cannot be commented on", missing.statusCode === 404, String(missing.statusCode));

  console.log("\nvalidation and spam");
  const before = await OnlineBlogComment.countDocuments();
  const bot = await submit({ name: "Bot", email: "bot@spam.test", body: "buy now", fax: "555-0100" });
  check("a bot filling the hidden field is told it worked", bot.statusCode === 201);
  check("…but nothing is saved", (await OnlineBlogComment.countDocuments()) === before);
  const links = await submit({ name: "L", email: "l@example.ie", body: "a http://a.ie b http://b.ie c http://c.ie" });
  check("more than two links is refused", links.statusCode === 400, String(links.statusCode));
  const noEmail = await submit({ name: "N", email: "not-an-email", body: "hello there" });
  check("an invalid email is refused", noEmail.statusCode === 400);
  const empty = await submit({ name: "N", email: "n@example.ie", body: "  " });
  check("an empty comment is refused", empty.statusCode === 400);

  await submit({ name: "R", email: "r@example.ie", body: "first thought" });
  const repeat = await submit({ name: "R", email: "r@example.ie", body: "first thought" });
  check("the same comment twice is accepted once", repeat.statusCode === 201 &&
    (await OnlineBlogComment.countDocuments({ email: "r@example.ie" })) === 1);
  await submit({ name: "R", email: "r@example.ie", body: "second thought" });
  await submit({ name: "R", email: "r@example.ie", body: "third thought" });
  const flood = await submit({ name: "R", email: "r@example.ie", body: "fourth thought" });
  check("a fourth comment within ten minutes is refused", flood.statusCode === 429, String(flood.statusCode));

  console.log("\nthe commenter's website");
  const withSite = await submit({ name: "Site", email: "site@example.ie", body: "see my shop", website: "https://my-shop.ie/about" });
  const siteDoc = await OnlineBlogComment.findOne({ email: "site@example.ie" }).lean();
  check("a website is kept with the comment", withSite.statusCode === 201 && siteDoc?.website === "https://my-shop.ie/about", siteDoc?.website);
  check("…and a comment with a website is not mistaken for a bot", Boolean(siteDoc));
  await submit({ name: "Bare", email: "bare@example.ie", body: "bare domain", website: "bare-domain.ie" });
  const bare = await OnlineBlogComment.findOne({ email: "bare@example.ie" }).lean();
  check("a bare domain is given https://", bare?.website === "https://bare-domain.ie/", bare?.website);
  const evil = await submit({ name: "Evil", email: "evil@example.ie", body: "click", website: "javascript:alert(1)" });
  check("a javascript: website is refused", evil.statusCode === 400, String(evil.statusCode));
  const junk = await submit({ name: "Junk", email: "junk@example.ie", body: "junk", website: "not a website" });
  check("something that is not a website is refused", junk.statusCode === 400, String(junk.statusCode));
  await moderate(String(siteDoc._id), "approved");
  page = await shown();
  check("the website reaches the article with the approved comment",
    page.body?.comments?.some((c) => c.website === "https://my-shop.ie/about"), JSON.stringify(page.body));

  console.log("\nsigned-in customers");
  const customerId = new mongoose.Types.ObjectId();
  const signedIn = await submit(
    { name: "", email: "someone-else@example.ie", body: "As a customer, great read." },
    "vape-guide",
    { _id: customerId, name: "Ciara Byrne", email: "ciara@example.ie" },
  );
  const customerComment = await OnlineBlogComment.findOne({ customer: customerId }).lean();
  check("a signed-in customer comments as their account",
    signedIn.statusCode === 201 && customerComment?.email === "ciara@example.ie" && customerComment?.name === "Ciara Byrne",
    JSON.stringify(customerComment));

  console.log("\nthe moderation queue");
  const queueRes = response();
  await comments.listBlogComments(request({ query: { status: "pending" }, user: admin }), queueRes);
  check("the queue lists pending comments with counts per status",
    queueRes.result.statusCode === 200 &&
      queueRes.result.body.comments.every((c) => c.status === "pending") &&
      queueRes.result.body.counts.hidden === 1,
    JSON.stringify(queueRes.result.body?.counts));

  const delRes = response();
  await comments.deleteBlogComment(request({ params: { id: String(saved._id) }, user: admin }), delRes);
  check("a comment can be deleted for good",
    delRes.result.statusCode === 200 && !(await OnlineBlogComment.findById(saved._id)));
  check("the post the comments belonged to is untouched", Boolean(await OnlineBlogPost.findById(post._id)));

  const failed = checks.filter((c) => !c.ok);
  console.log(failed.length ? `\nFAIL: ${failed.length} of ${checks.length}` : `\nPASS: all ${checks.length} blog comment checks`);
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Drop ONLY the temporary database, and only if that is what we are on.
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === tempName) {
      await mongoose.connection.dropDatabase();
      console.log(`dropped temporary database: ${tempName}`);
    }
    await mongoose.disconnect();
  });
