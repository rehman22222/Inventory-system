/* Convert blog articles from the old block editor to the WYSIWYG one.
 *
 *   node scripts/migrateBlogToRichText.js            # show what would change
 *   node scripts/migrateBlogToRichText.js --write    # actually convert
 *
 * Articles used to be an ordered array of typed blocks (paragraph, heading,
 * quote, image, video, button). They are now a single HTML document in
 * `content`. This walks every post that still has blocks and no content, turns
 * the blocks into the equivalent markup, and saves.
 *
 * Safe to run more than once: a post that already has `content` is skipped, so
 * a half-finished run can simply be run again. Nothing is deleted — the
 * original `blocks` array stays on the document until somebody edits and saves
 * the article in the new editor, so a bad conversion can be inspected and
 * re-run rather than mourned.
 *
 * The storefront renders either form, so the site is correct before, during
 * and after this — the migration buys editability, not correctness.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const OnlineBlogPost = require("../models/OnlineBlogPostmodel");
const { sanitizeRichText, readingMinutes } = require("../libs/richText");

const WRITE = process.argv.includes("--write");

/** Escape text that is about to be dropped into markup. */
const esc = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/* The old editor stored paragraphs as plain text with real newlines in them,
 * and the storefront rendered them with `whitespace-pre-line`. HTML collapses
 * whitespace, so those line breaks have to become <br> or the article silently
 * loses its shape. */
const textToHtml = (value) =>
  esc(value)
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${para.replace(/\n/g, "<br />")}</p>`)
    .join("");

const alignAttr = (align) =>
  align && align !== "left" ? ` style="text-align:${align}"` : "";

/** Same YouTube/Vimeo normalising the storefront did at render time. */
const videoEmbedUrl = (rawUrl) => {
  try {
    const url = new URL(rawUrl);
    if (url.hostname === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : "";
    }
    if (url.hostname.endsWith("youtube.com")) {
      const id =
        url.searchParams.get("v") ||
        url.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1];
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : "";
    }
    if (url.hostname.endsWith("vimeo.com")) {
      const id = url.pathname.split("/").filter(Boolean).pop();
      return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : "";
    }
  } catch {
    return "";
  }
  return "";
};

const blockToHtml = (block) => {
  const align = alignAttr(block.align);

  switch (block.type) {
    case "heading": {
      if (!block.text) return "";
      const tag = block.level === "h3" ? "h3" : "h2";
      return `<${tag}${align}>${esc(block.text)}</${tag}>`;
    }
    case "quote":
      return block.text ? `<blockquote${align}>${textToHtml(block.text)}</blockquote>` : "";
    case "image": {
      if (!block.url) return "";
      const img = `<img src="${esc(block.url)}" alt="${esc(block.alt || block.caption || "")}" loading="lazy" />`;
      return block.caption
        ? `<figure>${img}<figcaption>${esc(block.caption)}</figcaption></figure>`
        : `<figure>${img}</figure>`;
    }
    case "video": {
      if (!block.url) return "";
      const embed = videoEmbedUrl(block.url);
      // A direct video file has no embed URL. The new editor has no <video>
      // tag in its allowlist, so link it rather than drop it — the article
      // keeps the reference and an editor can decide what to do with it.
      const media = embed
        ? `<iframe src="${esc(embed)}" title="${esc(block.caption || "Video")}" allowfullscreen loading="lazy"></iframe>`
        : `<p><a href="${esc(block.url)}">${esc(block.caption || block.url)}</a></p>`;
      return block.caption && embed
        ? `<figure>${media}<figcaption>${esc(block.caption)}</figcaption></figure>`
        : media;
    }
    case "button": {
      if (!block.url || !block.text) return "";
      const link = `<p${align}><a href="${esc(block.url)}">${esc(block.text)}</a></p>`;
      return block.caption ? `${link}<p${align}>${esc(block.caption)}</p>` : link;
    }
    default:
      return textToHtml(block.text);
  }
};

const run = async () => {
  // MONGODB_URL is what this project uses (see libs/mongoconfig.js); the rest
  // are accepted so the script still runs against a host that names it
  // differently.
  const uri =
    process.env.MONGODB_URL ||
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.DB_URL;
  if (!uri) {
    console.error("No Mongo connection string in the environment (MONGODB_URL).");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(WRITE ? "Converting articles…\n" : "Dry run — nothing will be saved.\n");

  const posts = await OnlineBlogPost.find({
    $and: [
      { blocks: { $exists: true, $not: { $size: 0 } } },
      { $or: [{ content: { $exists: false } }, { content: "" }] },
    ],
  });

  if (!posts.length) {
    console.log("Nothing to convert — every article already has rich text.");
    await mongoose.disconnect();
    return;
  }

  let converted = 0;
  let skipped = 0;

  for (const post of posts) {
    const html = sanitizeRichText(
      post.blocks.map(blockToHtml).filter(Boolean).join(""),
    );

    if (!html) {
      console.log(`  SKIP  ${post.slug} — ${post.blocks.length} block(s) produced nothing`);
      skipped += 1;
      continue;
    }

    console.log(
      `  OK    ${post.slug} — ${post.blocks.length} block(s) → ${html.length} chars, ${readingMinutes(html)} min read`,
    );

    if (WRITE) {
      post.content = html;
      post.readingMinutes = readingMinutes(html);
      // `blocks` is left in place on purpose — see the header comment.
      await post.save();
    }
    converted += 1;
  }

  console.log(
    `\n${WRITE ? "Converted" : "Would convert"} ${converted} article(s)` +
      (skipped ? `, skipped ${skipped}.` : "."),
  );
  if (!WRITE) console.log("Re-run with --write to apply.");

  await mongoose.disconnect();
};

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
