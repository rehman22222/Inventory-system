import { createFileRoute, notFound } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { getBlogPost, type BlogBlock, type BlogPost } from "@/lib/catalog-api";
import { RichText } from "@/components/RichText";
import { cldAuto } from "@/lib/img";

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => {
    const post = await getBlogPost({ data: params.slug });
    if (!post) throw notFound();
    return post;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.seoTitle || loaderData?.title || "Blog"} — Cliffs of Puff` },
      {
        name: "description",
        content: loaderData?.seoDescription || loaderData?.excerpt || "Cliffs of Puff article.",
      },
      // Set from the editor's "Hide from search engines" switch. The article
      // stays live and linkable; it just asks not to be listed.
      ...(loaderData?.noindex ? [{ name: "robots", content: "noindex, follow" }] : []),
    ],
    links: [
      // Only emitted when an author has said this article was published
      // somewhere else first. Absent means "this page is the original".
      ...(loaderData?.canonicalUrl
        ? [{ rel: "canonical", href: loaderData.canonicalUrl }]
        : []),
    ],
  }),
  component: BlogArticlePage,
});

function BlogArticlePage() {
  const post = Route.useLoaderData();
  const titleAlignment = post.titleAlign === "left" ? "text-left" : "text-center";
  const titleMargin = post.titleAlign === "left" ? "" : "mx-auto";
  const firstBlockImage = post.blocks?.find(
    (block) => block.type === "image" && safeMediaUrl(block.url),
  );
  const heroImage = post.coverImage || firstBlockImage?.url || "";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <article>
        <header className={`container-x py-12 md:py-20 ${titleAlignment}`}>
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink-muted">
            {post.author} ·{" "}
            {new Date(post.publishedAt).toLocaleDateString("en-IE", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            {post.readingMinutes ? ` · ${post.readingMinutes} min read` : ""}
          </p>
          <h1 className={`${titleMargin} mt-5 max-w-5xl font-display text-4xl leading-[0.92] tracking-tight sm:text-6xl md:text-8xl`}>
            {post.title}
          </h1>
          {post.excerpt && (
            <p className={`${titleMargin} mt-6 max-w-2xl text-base leading-7 text-ink-muted`}>
              {post.excerpt}
            </p>
          )}
        </header>
        {heroImage && (
          <div className="container-x">
            <img
              src={cldAuto(heroImage)}
              alt={post.coverAlt || firstBlockImage?.alt || post.title}
              className="max-h-[720px] w-full border hair object-cover"
            />
          </div>
        )}
        <div className="container-x mx-auto max-w-4xl py-12 md:py-16">
          <ArticleBody post={post} />
        </div>
      </article>
      <Footer />
    </div>
  );
}

/* An article is either rich text (everything written since the WYSIWYG editor
 * landed) or an array of typed blocks (everything written before it, until
 * scripts/migrateBlogToRichText.js has been run against it).
 *
 * Both are rendered rather than one being converted on the fly, so the site is
 * correct before, during and after that migration — and so a shop that never
 * runs it still has a working blog. */
function ArticleBody({ post }: { post: BlogPost }) {
  if (post.content) return <RichText html={post.content} />;
  if (post.blocks?.length) {
    return (
      <>
        {post.blocks.map((block, index) => (
          <LegacyBlock key={block._id || index} block={block} />
        ))}
      </>
    );
  }
  return null;
}

function LegacyBlock({ block }: { block: BlogBlock }) {
  const alignment =
    block.align === "center" ? "text-center" : block.align === "right" ? "text-right" : "text-left";
  if (block.type === "heading" && block.text) {
    const Heading = block.level === "h3" ? "h3" : "h2";
    return (
      <Heading className={`mb-4 mt-10 font-display leading-none ${alignment} ${block.level === "h3" ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"}`}>
        {block.text}
      </Heading>
    );
  }
  if (block.type === "quote" && block.text)
    return (
      <blockquote className={`my-10 border-l-4 border-accent pl-6 font-display text-2xl leading-tight ${alignment}`}>
        {block.text}
      </blockquote>
    );
  if (block.type === "image" && safeMediaUrl(block.url))
    return (
      <figure className="my-10">
        <img src={cldAuto(safeMediaUrl(block.url))} alt={block.alt || block.caption || ""} className="w-full border hair" loading="lazy" />
        {block.caption && (
          <figcaption className="mt-2 text-xs text-ink-muted">{block.caption}</figcaption>
        )}
      </figure>
    );
  if (block.type === "video" && block.url) {
    const embedUrl = videoEmbedUrl(block.url);
    return (
      <figure className="my-10">
        {embedUrl ? (
          <iframe
            src={embedUrl}
            title={block.caption || "Blog video"}
            className="aspect-video w-full border hair bg-black"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : safeMediaUrl(block.url) ? (
          <video
            src={safeMediaUrl(block.url)}
            controls
            preload="metadata"
            className="aspect-video w-full border hair bg-black"
          />
        ) : null}
        {block.caption && (
          <figcaption className="mt-2 text-xs text-ink-muted">{block.caption}</figcaption>
        )}
      </figure>
    );
  }
  if (block.type === "button" && block.url && block.text) {
    const href = safeLinkUrl(block.url);
    if (!href) return null;
    const external = /^https?:\/\//i.test(href);
    return (
      <div className={`my-8 ${alignment}`}>
        <a
          href={href}
          className="inline-flex min-h-12 items-center justify-center border hair bg-ink px-6 font-mono text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-accent hover:text-black"
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {block.text}
        </a>
        {block.caption && <p className="mt-2 text-xs text-ink-muted">{block.caption}</p>}
      </div>
    );
  }
  if (!block.text) return null;
  return (
    <p className={`my-5 whitespace-pre-line text-[16px] leading-8 text-ink-muted ${alignment}`}>{block.text}</p>
  );
}

function safeMediaUrl(rawUrl: string) {
  const value = String(rawUrl || "").trim();
  return /^(https?:\/\/|\/(?!\/))/i.test(value) ? value : "";
}

function safeLinkUrl(rawUrl: string) {
  const value = String(rawUrl || "").trim();
  return /^(https?:\/\/|\/(?!\/)|mailto:|tel:)/i.test(value) ? value : "";
}

function videoEmbedUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (url.hostname === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : "";
    }
    if (url.hostname.endsWith("youtube.com")) {
      const id =
        url.searchParams.get("v") || url.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1];
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
}
