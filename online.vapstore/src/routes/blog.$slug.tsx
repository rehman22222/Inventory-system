import { useState, type FormEvent } from "react";
import { canonicalLink } from "@/lib/seo";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Clock3, MessageCircle } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import {
  getBlogComments,
  getBlogPost,
  getBlogPosts,
  submitBlogComment,
  type BlogBlock,
  type BlogComment,
  type BlogPost,
  type BlogPostSummary,
} from "@/lib/catalog-api";
import { useAccount } from "@/lib/account-context";
import { RichText } from "@/components/RichText";
import { tidyArticleHtml } from "@/lib/rich-text";
import { cldAuto } from "@/lib/img";

const LATEST_COUNT = 5;

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => {
    const [post, comments, posts] = await Promise.all([
      getBlogPost({ data: params.slug }),
      getBlogComments({ data: params.slug }),
      getBlogPosts(),
    ]);
    if (!post) throw notFound();
    const latest = posts.filter((item) => item.slug !== post.slug).slice(0, LATEST_COUNT);
    return { post, comments, latest };
  },
  head: ({ loaderData }) => {
    const post = loaderData?.post;
    return {
      meta: [
        { title: `${post?.seoTitle || post?.title || "Blog"} — Cliffs of Puff` },
        {
          name: "description",
          content: post?.seoDescription || post?.excerpt || "Cliffs of Puff article.",
        },
        // Set from the editor's "Hide from search engines" switch. The article
        // stays live and linkable; it just asks not to be listed.
        ...(post?.noindex ? [{ name: "robots", content: "noindex, follow" }] : []),
      ],
      links: [
        // Only emitted when an author has said this article was published
        // somewhere else first. Absent means "this page is the original".
        // The article's own URL, unless its author said it was first published
        // somewhere else — then that original.
        ...(post
          ? [
              post.canonicalUrl
                ? { rel: "canonical", href: post.canonicalUrl }
                : canonicalLink(`/blog/${post.slug}`),
            ]
          : []),
        // Poppins, for articles only (see --font-blog in styles.css).
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,400;0,500;0,600;1,500&display=swap",
        },
      ],
    };
  },
  component: BlogArticleDetailPage,
});

const longDate = (value: string) =>
  new Date(value).toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" });

/* The article page: the article and its comments in the main column, a short
 * "latest articles" list beside it on a wide screen and beneath it on a phone. */
function BlogArticleDetailPage() {
  const { post, comments, latest } = Route.useLoaderData();
  const centred = post.titleAlign !== "left";
  const firstBlockImage = post.blocks?.find(
    (block) => block.type === "image" && safeMediaUrl(block.url),
  );
  const heroImage = post.coverImage || firstBlockImage?.url || "";
  const published = new Date(post.publishedAt);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="blog-article container-x py-8 md:py-14">
        {/* The reading column is capped at ~720px — past that a line is too long
            to follow. With other articles to list, a sidebar sits beside it;
            with none, the column is simply centred. */}
        <div
          className={
            latest.length > 0
              ? "mx-auto grid max-w-[1080px] gap-12 lg:grid-cols-[minmax(0,720px)_280px] lg:justify-between lg:gap-14"
              : "mx-auto max-w-[720px]"
          }
        >
          <article className="min-w-0">
            <header className={centred ? "text-center" : "text-left"}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-kicker">
                Blog{post.featured ? " · Featured" : ""}
              </p>
              <h1
                className={`mt-3 text-[1.55rem] font-semibold leading-tight tracking-[-0.01em] text-foreground sm:text-[1.9rem] lg:text-[2.2rem] ${
                  centred ? "mx-auto max-w-3xl" : "max-w-3xl"
                }`}
              >
                {post.title}
              </h1>
              <p
                className={`mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] uppercase tracking-[0.14em] text-ink-muted ${
                  centred ? "justify-center" : ""
                }`}
              >
                <span>
                  Posted on {longDate(post.publishedAt)} by{" "}
                  <span className="text-foreground">{post.author || "Cliffs of Puff"}</span>
                </span>
                {post.readingMinutes ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="h-3 w-3" aria-hidden="true" />
                    {post.readingMinutes} min read
                  </span>
                ) : null}
                {comments.length > 0 && (
                  <a href="#comments" className="inline-flex items-center gap-1 hover:text-foreground">
                    <MessageCircle className="h-3 w-3" aria-hidden="true" />
                    {comments.length} comment{comments.length === 1 ? "" : "s"}
                  </a>
                )}
              </p>
            </header>

            {heroImage && (
              <figure className="relative mt-7 md:mt-9">
                <img
                  src={cldAuto(heroImage)}
                  alt={post.coverAlt || firstBlockImage?.alt || post.title}
                  className="aspect-[16/9] w-full border border-border object-cover"
                />
                <DateBadge date={published} className="absolute left-3 top-3 sm:left-4 sm:top-4" />
              </figure>
            )}

            {post.excerpt && (
              <p className="mt-8 border-l-2 border-kicker pl-4 text-[1.05rem] leading-8 text-foreground/85 sm:text-lg">{post.excerpt}</p>
            )}

            <div className="mt-6">
              <ArticleBody post={post} />
            </div>

            <div className="mt-12 border-t hair pt-6">
              <Link
                to="/blog"
                className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-ink-muted transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                All articles
              </Link>
            </div>

            <Comments slug={post.slug} comments={comments} />
          </article>

          {latest.length > 0 && (
            <aside className="min-w-0 space-y-10 lg:sticky lg:top-40 lg:self-start">
              <LatestPosts posts={latest} />
            </aside>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function DateBadge({ date, className = "" }: { date: Date; className?: string }) {
  return (
    <span
      className={`flex w-12 flex-col items-center border border-kicker bg-background/95 py-1 text-kicker ${className}`}
      aria-hidden="true"
    >
      <span className="text-base font-semibold leading-none">
        {date.toLocaleDateString("en-IE", { day: "2-digit" })}
      </span>
      <span className="mt-0.5 text-[10px] uppercase leading-none">
        {date.toLocaleDateString("en-IE", { month: "short" })}
      </span>
    </span>
  );
}

function SidebarHeading({ children }: { children: string }) {
  return (
    <h2 className="border-b hair pb-3 text-xs font-semibold uppercase tracking-[0.2em] text-foreground">
      {children}
    </h2>
  );
}

function LatestPosts({ posts }: { posts: BlogPostSummary[] }) {
  return (
    <section>
      <SidebarHeading>Latest articles</SidebarHeading>
      <ul className="mt-4 space-y-4">
        {posts.map((item) => (
          <li key={item._id}>
            <Link
              to="/blog/$slug"
              params={{ slug: item.slug }}
              className="group flex items-start gap-3"
            >
              <DateBadge date={new Date(item.publishedAt)} className="shrink-0" />
              <span className="text-sm leading-snug text-foreground transition-colors group-hover:text-kicker">
                {item.title}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Comments ──────────────────────────────────────────────────────────────
 * Readers see only what the shop has approved. A new comment is held for
 * approval, so the form thanks the writer rather than showing it at once. */
function Comments({ slug, comments }: { slug: string; comments: BlogComment[] }) {
  return (
    <section id="comments" className="mt-12 scroll-mt-48">
      <h2 className="text-lg font-semibold text-foreground">
        {comments.length ? `${comments.length} comment${comments.length === 1 ? "" : "s"}` : "Comments"}
      </h2>

      {comments.length > 0 ? (
        <ol className="mt-5 space-y-5">
          {comments.map((comment) => (
            <li key={comment._id} className="flex gap-3 sm:gap-4">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold uppercase text-foreground"
                aria-hidden="true"
              >
                {comment.name.trim().charAt(0) || "?"}
              </span>
              <div className="min-w-0 flex-1 border-b hair pb-5">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {comment.website ? (
                    // Reader-supplied link: nofollow + ugc so it passes no
                    // search ranking, and a new tab so the reader keeps the article.
                    <a
                      href={comment.website}
                      target="_blank"
                      rel="nofollow ugc noopener noreferrer"
                      className="text-sm font-semibold text-foreground underline decoration-kicker/50 underline-offset-2 transition-colors hover:text-kicker"
                    >
                      {comment.name}
                    </a>
                  ) : (
                    <span className="text-sm font-semibold text-foreground">{comment.name}</span>
                  )}
                  {comment.customer && (
                    <span className="bg-accent px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent-foreground">
                      Customer
                    </span>
                  )}
                  <span className="text-xs text-ink-muted">{longDate(comment.createdAt)}</span>
                </p>
                {/* Plain text: a comment is never rendered as HTML. */}
                <p className="mt-2 whitespace-pre-line break-words text-[0.95rem] leading-7 text-ink-muted">
                  {comment.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">No comments yet — be the first to share your thoughts.</p>
      )}

      <CommentForm slug={slug} />
    </section>
  );
}

function CommentForm({ slug }: { slug: string }) {
  const { customer } = useAccount();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState("");
  const [fax, setFax] = useState("");
  const [state, setState] = useState<{ status: "idle" | "sending" | "sent" | "error"; message: string }>({
    status: "idle",
    message: "",
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setState({ status: "sending", message: "" });
    try {
      const result = await submitBlogComment({
        data: {
          slug,
          name: name || customer?.name || "",
          email: customer ? "" : email,
          body,
          website,
          fax,
        },
      });
      setBody("");
      setState({ status: "sent", message: result.message });
    } catch (error) {
      setState({
        status: "error",
        message: (error as Error).message || "Your comment could not be sent. Please try again.",
      });
    }
  };

  const field =
    "mt-1.5 w-full border hair bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-foreground";

  return (
    <form onSubmit={submit} className="relative mt-10 border hair bg-surface/60 p-4 sm:p-6">
      <h3 className="text-base font-semibold text-foreground">Leave a comment</h3>
      <p className="mt-1 text-xs leading-5 text-ink-muted">
        {customer
          ? `Commenting as ${customer.name}. `
          : "Your email address is never published. "}
        Comments appear once the shop has approved them.
      </p>

      {!customer && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-medium text-foreground">
            Name *
            <input
              required
              maxLength={80}
              autoComplete="name"
              className={field}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="block text-xs font-medium text-foreground">
            Email *
            <input
              required
              type="email"
              maxLength={200}
              autoComplete="email"
              className={field}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
        </div>
      )}

      <label className="mt-4 block text-xs font-medium text-foreground">
        Website <span className="font-normal text-ink-muted">(optional)</span>
        <input
          type="text"
          inputMode="url"
          maxLength={200}
          autoComplete="url"
          placeholder="https://yourwebsite.com"
          className={field}
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </label>

      <label className="mt-4 block text-xs font-medium text-foreground">
        Comment *
        <textarea
          required
          minLength={3}
          maxLength={2000}
          rows={5}
          className={`${field} resize-y leading-6`}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </label>

      {/* A field people never see: a bot that fills it in is quietly ignored. */}
      <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
        <label>
          Fax
          <input tabIndex={-1} autoComplete="off" value={fax} onChange={(event) => setFax(event.target.value)} />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={state.status === "sending"}
          className="inline-flex min-h-11 items-center justify-center bg-ink px-6 text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground transition-colors hover:bg-kicker disabled:opacity-60"
        >
          {state.status === "sending" ? "Sending…" : "Post comment"}
        </button>
        {state.message && (
          <p
            role="status"
            className={`text-sm ${state.status === "error" ? "text-destructive" : "text-foreground"}`}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
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
  if (post.content) return <RichText html={tidyArticleHtml(post.content)} />;
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
