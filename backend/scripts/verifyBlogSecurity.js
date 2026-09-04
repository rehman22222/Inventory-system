/* Proof that the blog's two security boundaries hold.
 *
 *   node scripts/verifyBlogSecurity.js
 *
 * Needs no database and no network, so it runs anywhere the repo does. That is
 * deliberate: these are the two things in the blog feature that are dangerous
 * to get wrong, and a check that only runs when Mongo happens to be up is a
 * check that stops running.
 *
 *   1. Sanitising. Article bodies and legal pages are authored as HTML and
 *      rendered on public pages with dangerouslySetInnerHTML. libs/richText is
 *      the only thing standing between an author (or anybody who reaches an
 *      author's session) and stored XSS.
 *
 *   2. The content-role fence. The "seo" role is handed to an outside agency.
 *      Most routes in this app are guarded by `authmiddleware` alone, so the
 *      fence in that middleware — not the route guards — is what keeps such an
 *      account out of the till, the takings and the customer list.
 *
 * A third section checks the block→HTML conversion used by the migration, to
 * be sure old articles cannot smuggle markup through it.
 */

const assert = require("assert");
const express = require("express");
const Module = require("module");

const { sanitizeRichText, richTextToPlain, readingMinutes, excerptFrom } =
  require("../libs/richText");

let failures = 0;
const check = (name, condition) => {
  if (condition) {
    console.log(`  pass  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}`);
  }
};

/* ── 1. Sanitising ────────────────────────────────────────────────────────── */

const verifySanitiser = () => {
  console.log("\nSanitising author HTML");

  // Things that must not survive.
  const blocked = [
    ["<script>", "<p>ok</p><script>alert(1)</script>", /<script/i],
    ["inline handler", '<p onclick="steal()">x</p>', /\son\w+\s*=/i],
    ["img onerror", '<img src=x onerror="fetch(1)">', /onerror/i],
    ["javascript: href", '<a href="javascript:alert(1)">x</a>', /javascript:/i],
    ["vbscript: href", '<a href="vbscript:msgbox(1)">x</a>', /vbscript:/i],
    ["data: image", '<img src="data:text/html,<script>alert(1)</script>">', /data:/i],
    ["protocol-relative", '<a href="//evil.com">x</a>', /evil\.com/i],
    ["third-party iframe", '<iframe src="https://evil.com/x"></iframe>', /evil\.com/i],
    ["<svg onload>", "<svg onload=alert(1)></svg>", /svg|onload/i],
    ["<object>", '<object data="evil.swf"></object>', /object/i],
    ["<form>", '<form action="//evil.com"><input name="p"></form>', /form|input/i],
    ["<style>", "<style>body{display:none}</style>", /style>/i],
    ["<base>", '<base href="//evil.com/">', /base/i],
    ["meta refresh", '<meta http-equiv="refresh" content="0;url=//evil.com">', /meta|evil/i],
    ["position style", '<p style="position:fixed;top:0">x</p>', /position/i],
  ];
  for (const [name, input, mustNotMatch] of blocked) {
    check(`strips ${name}`, !mustNotMatch.test(sanitizeRichText(input)));
  }

  // Things that must survive — a sanitiser that eats the content is just as
  // broken as one that lets scripts through, only quieter about it.
  const kept = [
    ["headings", "<h2>A</h2><h3>B</h3><h4>C</h4>", /<h2>A<\/h2><h3>B<\/h3><h4>C<\/h4>/],
    ["internal link", '<a href="/shop">Shop</a>', /href="\/shop"/],
    ["external link", '<a href="https://hse.ie">HSE</a>', /href="https:\/\/hse\.ie"/],
    ["mailto", '<a href="mailto:hi@shop.ie">Mail</a>', /href="mailto:hi@shop\.ie"/],
    ["tel", '<a href="tel:+353871234567">Call</a>', /href="tel:\+353871234567"/],
    ["lists", "<ul><li>a</li></ul><ol><li>b</li></ol>", /<ul><li>a<\/li><\/ul><ol><li>b<\/li><\/ol>/],
    ["blockquote", "<blockquote>q</blockquote>", /<blockquote>q<\/blockquote>/],
    ["image + alt", '<img src="https://cdn.io/a.jpg" alt="Elf Bar">', /alt="Elf Bar"/],
    ["figure caption", "<figure><img src=\"/a.jpg\"><figcaption>Cap</figcaption></figure>", /<figcaption>Cap<\/figcaption>/],
    ["youtube embed", '<iframe src="https://www.youtube-nocookie.com/embed/a1"></iframe>', /youtube-nocookie\.com\/embed\/a1/],
    ["vimeo embed", '<iframe src="https://player.vimeo.com/video/12"></iframe>', /player\.vimeo\.com\/video\/12/],
    ["table", "<table><tr><th>H</th><td>D</td></tr></table>", /<th>H<\/th><td>D<\/td>/],
    ["text-align", '<p style="text-align:center">c</p>', /style="text-align:center"/],
    ["inline code", "<p>run <code>npm</code></p>", /<code>npm<\/code>/],
    ["horizontal rule", "<p>a</p><hr /><p>b</p>", /<hr \/>/],
  ];
  for (const [name, input, mustMatch] of kept) {
    check(`keeps ${name}`, mustMatch.test(sanitizeRichText(input)));
  }

  // Behaviours the storefront depends on.
  check(
    "external links get target+rel",
    /target="_blank"[^>]*rel="noopener noreferrer"|rel="noopener noreferrer"[^>]*target="_blank"/.test(
      sanitizeRichText('<a href="https://example.com">x</a>'),
    ),
  );
  check(
    "internal links are NOT forced into a new tab",
    !/target/.test(sanitizeRichText('<a href="/shop">x</a>')),
  );
  check("<b>/<i> normalise to <strong>/<em>",
    sanitizeRichText("<b>a</b><i>b</i>") === "<strong>a</strong><em>b</em>");
  check("images are lazy by default",
    /loading="lazy"/.test(sanitizeRichText('<img src="/a.jpg">')));
  check("an emptied editor stores nothing",
    sanitizeRichText("<p></p><p><br /></p>") === "");
  check("media with no words is NOT treated as empty",
    sanitizeRichText('<img src="/a.jpg">') !== "");
  check("respects the length cap",
    sanitizeRichText(`<p>${"a".repeat(500)}</p>`, 100).length === 100);
  check("plain-text extraction drops tags",
    richTextToPlain("<h2>Hi</h2><p>there</p>") === "Hi there");
  check("reading time counts words, not markup",
    readingMinutes(`<p>${"word ".repeat(400)}</p>`) === 2);
  check("auto excerpt cuts on a word boundary and ellipsises",
    /…$/.test(excerptFrom(`<p>${"word ".repeat(80)}</p>`, 50)));
};

/* ── 2. The content-role fence ────────────────────────────────────────────── */

const verifyFence = async () => {
  console.log("\nContent-role fence (seo may reach the blog and nothing else)");

  // Stub the token check and the user lookup so no database is needed. Nothing
  // else about the middleware is replaced — the fence under test is the real
  // one, running inside the real authmiddleware.
  const originalLoad = Module._load;
  const users = {
    seo: { _id: "1", role: "seo" },
    admin: { _id: "2", role: "admin" },
    superadmin: { _id: "3", role: "superadmin" },
    staff: { _id: "4", role: "staff" },
    manager: { _id: "5", role: "manager" },
  };
  let signedInAs = "seo";

  Module._load = function (request, parent) {
    if (request === "jsonwebtoken") return { verify: () => ({ userId: "x" }) };
    const loaded = originalLoad.apply(this, arguments);
    if (
      request === "../models/Usermodel" &&
      parent &&
      parent.filename.includes("Authmiddleware")
    ) {
      return { findById: () => ({ select: async () => users[signedInAs] }) };
    }
    return loaded;
  };

  const auth = require("../middleware/Authmiddleware");
  Module._load = originalLoad;

  const app = express();
  app.use((req, _res, next) => {
    req.cookies = { Inventorymanagmentsystem: "token" };
    next();
  });

  const ok = (_req, res) => res.json({ reached: true });

  // A representative slice of the app as it is actually mounted, including the
  // routes that carry no role guard at all.
  app.post("/api/pos/checkout", auth.authmiddleware, ok);
  app.post("/api/pos/refund", auth.authmiddleware, auth.tillUser, ok);
  app.get("/api/pos/day-closings", auth.authmiddleware, ok);
  app.get("/api/sales/getallsales", auth.authmiddleware, ok);
  app.get("/api/product/getproduct", auth.authmiddleware, ok);
  app.get("/api/reports/", auth.authmiddleware, ok);
  app.get("/api/activitylogs/getrecentActivitys", auth.authmiddleware, ok);
  app.get("/api/store/", auth.authmiddleware, ok);
  app.post("/api/auth/createuser", auth.authmiddleware, auth.superadminmiddleware, ok);
  app.post("/api/auth/logout", auth.authmiddleware, ok);
  app.put("/api/auth/updateProfile", auth.authmiddleware, ok);

  const blogRouter = express.Router();
  blogRouter.use(auth.authmiddleware, auth.blogEditorAccess);
  blogRouter.get("/blog", ok);
  blogRouter.post("/blog", ok);
  blogRouter.put("/blog/:id", ok);
  blogRouter.delete("/blog/:id", ok);
  blogRouter.post("/blog/upload", ok);

  const adminRouter = express.Router();
  adminRouter.use(auth.authmiddleware, auth.adminOrSuperadmin);
  adminRouter.get("/settings", ok);
  adminRouter.put("/settings", ok);
  adminRouter.post("/upload", ok);
  adminRouter.get("/orders", ok);
  adminRouter.get("/customers", ok);

  // Mount order matters: /blog must be matched before the admin router's
  // blanket guard can refuse it. Mirrors server.js.
  app.use("/api/online", blogRouter);
  app.use("/api/online", adminRouter);

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;

  const reach = async (role, method, path) => {
    signedInAs = role;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method });
    return res.status === 200;
  };

  const blogPaths = [
    ["GET", "/api/online/blog"],
    ["POST", "/api/online/blog"],
    ["PUT", "/api/online/blog/abc"],
    ["DELETE", "/api/online/blog/abc"],
    ["POST", "/api/online/blog/upload"],
  ];
  const forbiddenToSeo = [
    ["PUT", "/api/online/settings"],
    ["POST", "/api/online/upload"],
    ["GET", "/api/online/orders"],
    ["GET", "/api/online/customers"],
    ["POST", "/api/pos/checkout"],
    ["POST", "/api/pos/refund"],
    ["GET", "/api/pos/day-closings"],
    ["GET", "/api/sales/getallsales"],
    ["GET", "/api/product/getproduct"],
    ["GET", "/api/reports/"],
    ["GET", "/api/activitylogs/getrecentActivitys"],
    ["GET", "/api/store/"],
    ["POST", "/api/auth/createuser"],
  ];

  for (const [method, path] of blogPaths) {
    check(`seo may ${method} ${path}`, await reach("seo", method, path));
  }
  for (const [method, path] of forbiddenToSeo) {
    check(`seo may NOT ${method} ${path}`, !(await reach("seo", method, path)));
  }

  // Their own account, and nothing else under /auth.
  check("seo may log out", await reach("seo", "POST", "/api/auth/logout"));
  check("seo may edit their own profile", await reach("seo", "PUT", "/api/auth/updateProfile"));

  // No existing role may lose anything it had. This is the regression that
  // would matter most and be noticed last.
  console.log("\n  …and no existing role is affected");
  for (const role of ["admin", "superadmin"]) {
    check(`${role} still reaches the blog`, await reach(role, "GET", "/api/online/blog"));
    check(`${role} still reaches settings`, await reach(role, "PUT", "/api/online/settings"));
    check(`${role} still reaches the till`, await reach(role, "POST", "/api/pos/checkout"));
  }
  for (const role of ["staff", "manager"]) {
    check(`${role} still works the till`, await reach(role, "POST", "/api/pos/checkout"));
    check(`${role} still reads sales`, await reach(role, "GET", "/api/sales/getallsales"));
    check(`${role} is still kept out of the blog`, !(await reach(role, "GET", "/api/online/blog")));
  }

  server.close();
};

/* ── 3. Legacy article conversion ─────────────────────────────────────────── */

const verifyMigration = () => {
  console.log("\nConverting old block articles to HTML");

  const source = require("fs").readFileSync(
    require("path").join(__dirname, "migrateBlogToRichText.js"),
    "utf8",
  );
  // Lift the pure converters out of the script so this runs without Mongo.
  const body = source.slice(source.indexOf("const esc ="), source.indexOf("const run = async"));
  // eslint-disable-next-line no-new-func
  const { blockToHtml } = new Function(`${body}; return { blockToHtml };`)();

  const converted = sanitizeRichText(
    [
      { type: "heading", level: "h2", text: "Why Elf Bar", align: "center" },
      { type: "paragraph", text: "Line one\nline two\n\nSecond para" },
      { type: "quote", text: "Best vape" },
      { type: "image", url: "https://cdn.io/a.jpg", alt: "Bar", caption: "Range" },
      { type: "video", url: "https://youtu.be/abc123", caption: "Tour" },
      { type: "button", url: "/shop", text: "Shop now", align: "center" },
    ]
      .map(blockToHtml)
      .join(""),
  );

  check("heading keeps its level and alignment",
    /<h2 style="text-align:center">Why Elf Bar<\/h2>/.test(converted));
  check("single newlines become <br>", /Line one<br \/>line two/.test(converted));
  check("blank lines split paragraphs", /<p>Second para<\/p>/.test(converted));
  check("quote survives", /<blockquote>/.test(converted));
  check("image becomes a figure with a caption", /<figcaption>Range<\/figcaption>/.test(converted));
  check("youtube link becomes a nocookie embed",
    /youtube-nocookie\.com\/embed\/abc123/.test(converted));
  check("button becomes a link", /<a href="\/shop">Shop now<\/a>/.test(converted));

  // The old editor stored plain text, so anything that looked like markup in it
  // was shown to readers as literal characters. It must not become live markup
  // now just because the article moved into an HTML field.
  const hostile = sanitizeRichText(
    blockToHtml({ type: "paragraph", text: '<img src=x onerror=alert(1)> <b>bold</b>' }),
  );
  check("old text that looked like HTML is escaped, not executed",
    /&lt;img/.test(hostile) && !/<img/.test(hostile));

  const evilButton = sanitizeRichText(
    blockToHtml({ type: "button", url: "javascript:alert(1)", text: "Evil" }),
  );
  check("a javascript: button loses its href", !/javascript:/i.test(evilButton));
};

const main = async () => {
  verifySanitiser();
  await verifyFence();
  verifyMigration();

  console.log(
    failures
      ? `\n${failures} check(s) FAILED\n`
      : "\nAll blog security checks passed.\n",
  );
  process.exit(failures ? 1 : 0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
