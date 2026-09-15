import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, Clock3 } from "lucide-react";
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
  component: BlogArticleDetailPage,
});

function BlogArticleDetailPage() {
  const post = Route.useLoaderData();
  const titleAlignment = post.titleAlign === "left" ? "text-left" : "text-center";
  const titleMargin = post.titleAlign === "left" ? "" : "mx-auto";
  const published = new Date(post.publishedAt);
  const firstBlockImage = post.blocks?.find(
    (block) => block.type === "image" && safeMediaUrl(block.url),
  );
  const heroImage = post.coverImage || firstBlockImage?.url || "";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <article className="border-b hair">
        <header className={`container-x py-10 md:py-16 ${titleAlignment}`}>
          <Link
            to="/blog"
            className="mb-8 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to blog
          </Link>
          <div className="flex flex-wrap items-center justify-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted">
            {post.featured && <span className="bg-accent px-2 py-1 text-ink">Featured</span>}
            <span>{post.author || "Cliffs of Puff"}</span>
            <span className="hidden h-px w-8 bg-line sm:block" aria-hidden="true" />
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {published.toLocaleDateString("en-IE", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
            {post.readingMinutes ? (
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5" />
                {post.readingMinutes} min read
              </span>
            ) : null}
          </div>
          <h1 className={`${titleMargin} mt-6 max-w-5xl font-display text-5xl leading-[0.9] tracking-tight sm:text-7xl md:text-8xl`}>
            {post.title}
          </h1>
          {post.excerpt && (
            <p className={`${titleMargin} mt-6 max-w-2xl text-base leading-7 text-ink-muted md:text-lg`}>
              {post.excerpt}
            </p>
          )}
        </header>

        {heroImage && (
          <div className="container-x pb-10 md:pb-16">
            <div className="mx-auto max-w-6xl bg-[#86bfd8] p-4 sm:p-6 md:p-8">
              <div className="border-[10px] border-white bg-white shadow-[0_18px_40px_rgba(0,0,0,0.16)]">
                <img
                  src={cldAuto(heroImage)}
                  alt={post.coverAlt || firstBlockImage?.alt || post.title}
                  className="max-h-[680px] w-full object-cover"
                />
              </div>
            </div>
          </div>
        )}

        <div className="container-x grid gap-10 py-10 md:py-16 lg:grid-cols-[220px_minmax(0,760px)] lg:justify-center">
          <aside className="hidden border-t hair pt-5 lg:block">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted">
              Article
            </p>
            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">Published</dt>
                <dd className="mt-1 text-ink">
                  {published.toLocaleDateString("en-IE", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </dd>
              </div>
              {post.readingMinutes ? (
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">Read time</dt>
                  <dd className="mt-1 text-ink">{post.readingMinutes} min</dd>
                </div>
              ) : null}
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">Author</dt>
                <dd className="mt-1 text-ink">{post.author || "Cliffs of Puff"}</dd>
              </div>
            </dl>
          </aside>
          <div className="min-w-0">
            <ArticleBody post={post} />
          </div>
        </div>
      </article>
      <Footer />
    </div>
  );
}

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
