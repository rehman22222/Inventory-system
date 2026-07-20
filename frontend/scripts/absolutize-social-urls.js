// Rewrites og:image / twitter:image in the BUILT index.html to absolute URLs.
//
// Open Graph requires an absolute URL. Facebook, LinkedIn, WhatsApp and Slack
// silently drop a relative one, so the link preview ships with no image at all.
//
// This cannot be solved in public/index.html or in useSeo:
//   - %PUBLIC_URL% resolves to "" for a root deployment, giving "/login-hero.png".
//   - Setting CRA's PUBLIC_URL to the site origin would also make every script
//     and stylesheet absolute, pinning per-shop deploys to the marketing host.
//   - useSeo runs in the browser, and social scrapers never execute JavaScript.
//
// So it has to be a post-build rewrite of the emitted HTML, which is what this
// does. No-ops when REACT_APP_SITE_URL is unset — a half-absolute URL would be
// worse than the relative one we started with.

const fs = require("fs");
const path = require("path");

function readEnvFile(file) {
  const full = path.join(__dirname, "..", file);
  if (!fs.existsSync(full)) return {};
  return require("dotenv").parse(fs.readFileSync(full));
}

const isDev = process.env.NODE_ENV === "development";
const env = {
  ...readEnvFile(".env"),
  ...(isDev ? {} : readEnvFile(".env.production")),
};
if (process.env.REACT_APP_SITE_URL !== undefined) {
  env.REACT_APP_SITE_URL = process.env.REACT_APP_SITE_URL;
}

const SITE_URL = (env.REACT_APP_SITE_URL || "").trim().replace(/\/+$/, "");

// Matches postinstall.js, which builds straight into backend/client.
const OUT_DIR = process.env.BUILD_PATH
  ? path.resolve(process.env.BUILD_PATH)
  : path.join(__dirname, "..", "build");

const indexFile = path.join(OUT_DIR, "index.html");

if (!SITE_URL) {
  console.warn(
    "[seo] REACT_APP_SITE_URL is not set — og:image left relative, so link " +
      "previews will have no image."
  );
  process.exit(0);
}

if (!fs.existsSync(indexFile)) {
  console.warn(`[seo] no index.html at ${indexFile} — skipping social URL rewrite`);
  process.exit(0);
}

let html = fs.readFileSync(indexFile, "utf8");
let rewritten = 0;

// Only touch the two image properties, and only when the value is root-relative.
// An already-absolute URL (someone set PUBLIC_URL, or a future CDN) is left alone.
html = html.replace(
  /(<meta\s+(?:property|name)="(?:og:image|twitter:image)"\s+content=")(\/[^"]*)(")/g,
  (_match, open, relativePath, close) => {
    rewritten += 1;
    return `${open}${SITE_URL}${relativePath}${close}`;
  }
);

if (rewritten > 0) {
  fs.writeFileSync(indexFile, html, "utf8");
}

console.log(
  `[seo] social image URLs absolutised: ${rewritten} rewritten → ${SITE_URL}`
);
