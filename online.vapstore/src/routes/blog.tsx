import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { getBlogPosts, getStorefront, type BlogPostSummary } from "@/lib/catalog-api";
import { cldAuto } from "@/lib/img";

export const Route = createFileRoute("/blog")({
  loader: async () => {
    const [posts, storefront] = await Promise.all([getBlogPosts(), getStorefront()]);
    return { posts, copy: storefront.settings.blog };
  },
  component: BlogIndexPage,
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.copy.seoTitle || "Blog"} — Cliffs of Puff` },
      {
        name: "description",
        content: loaderData?.copy.seoDescription || "News, guides and product stories from Cliffs of Puff.",
      },
    ],
  }),
});

function safeMediaUrl(value?: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^(https?:)?\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  return "";
}

function BlogIndexPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  const { posts, copy } = Route.useLoaderData();
  const featured = posts.find((post) => post.featured) || posts[0];
  const latest = featured ? posts.filter((post) => post._id !== featured._id) : posts;

  if (normalizedPath !== "/blog") return <Outlet />;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="border-b hair bg-background">
        <div className="container-x py-12 text-center md:py-16">
          {copy.eyebrow && (
            <p className="font-mono text-[10px] uppercase text-ink-muted">
              {copy.eyebrow}
            </p>
          )}
          <h1 className="mx-auto mt-4 max-w-4xl font-display text-5xl leading-[0.88] sm:text-7xl md:text-8xl">
            {copy.heading}
          </h1>
          {copy.intro && <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-ink-muted">{copy.intro}</p>}
        </div>
      </section>

      <main className="container-x py-10 md:py-14">
        {featured && (
          <section className="mb-14 md:mb-20">
            {copy.featuredHeading && (
              <p className="mb-6 text-center font-mono text-[10px] uppercase text-ink-muted">
                {copy.featuredHeading}
              </p>
            )}
            <FeaturedPost post={featured} />
          </section>
        )}

        {latest.length > 0 ? (
          <section className="mx-auto max-w-6xl">
            {copy.latestHeading && (
              <h2 className="mb-8 text-center font-display text-3xl leading-none md:text-4xl">
                {copy.latestHeading}
              </h2>
            )}
            <div className="grid gap-8 md:gap-10">
              {latest.map((post, index) => (
                <PostCard key={post._id} post={post} reverse={index % 2 === 1} />
              ))}
            </div>
          </section>
        ) : !featured ? (
          <div className="border hair px-6 py-16 text-center">
            <h2 className="font-display text-3xl">No articles published yet.</h2>
            <p className="mt-3 text-ink-muted">New articles are being prepared. Please check back soon.</p>
          </div>
        ) : null}
      </main>
      <Footer />
    </div>
  );
}

function FeaturedPost({ post }: { post: BlogPostSummary }) {
  return (
    <article className="mx-auto grid max-w-6xl min-w-0 items-center gap-0 md:grid-cols-[1.04fr_0.96fr]">
      <div className="relative min-w-0 bg-[#86bfd8] p-6 sm:p-8 md:p-10">
        <Link to="/blog/$slug" params={{ slug: post.slug }} className="group block">
          <PostImage
            post={post}
            className="aspect-[4/3] border-[10px] border-white shadow-[0_18px_34px_rgba(0,0,0,0.18)]"
          />
        </Link>
      </div>
      <div className="relative -mt-8 flex min-w-0 flex-col justify-center border hair bg-white p-6 shadow-[0_18px_42px_rgba(0,0,0,0.08)] sm:p-8 md:mt-0 md:-ml-12 md:min-h-[360px] md:p-10">
        <div className="flex items-center gap-4">
          <DateBadge post={post} />
          <span className="font-mono text-[10px] uppercase text-ink-muted">{post.featured ? "Featured" : "Latest"}</span>
        </div>
        <Link to="/blog/$slug" params={{ slug: post.slug }} className="mt-5 block w-fit">
          <h3 className="font-display text-3xl leading-[0.96] transition-colors hover:text-[#6aa7c2] sm:text-4xl md:text-5xl">
            {post.title}
          </h3>
        </Link>
        <PostPreview post={post} className="mt-5 max-w-xl" />
        <Link
          to="/blog/$slug"
          params={{ slug: post.slug }}
          className="mt-6 w-fit font-mono text-[10px] uppercase tracking-widest underline underline-offset-4 hover:text-[#6aa7c2]"
        >
          Read article
        </Link>
      </div>
    </article>
  );
}

function PostCard({ post, reverse }: { post: BlogPostSummary; reverse: boolean }) {
  return (
    <article className={`grid min-w-0 items-center border hair bg-white md:grid-cols-[0.92fr_1.08fr] ${reverse ? "md:[&>div:last-child]:order-first" : ""}`}>
      <div className="relative bg-[#eef5f7] p-5 sm:p-7">
        <Link to="/blog/$slug" params={{ slug: post.slug }} className="group block">
          <PostImage post={post} className="aspect-[4/3] border-[8px] border-white shadow-[0_12px_26px_rgba(0,0,0,0.12)]" />
        </Link>
      </div>
      <div className="flex min-w-0 flex-col p-6 sm:p-8">
        <PostDate post={post} />
        <Link to="/blog/$slug" params={{ slug: post.slug }} className="mt-4 block w-fit max-w-2xl">
          <h2 className="font-display text-2xl leading-none transition-colors hover:text-[#6aa7c2] sm:text-3xl">
            {post.title}
          </h2>
        </Link>
        <PostPreview post={post} className="mt-4 max-w-2xl" />
        <Link
          to="/blog/$slug"
          params={{ slug: post.slug }}
          className="mt-5 w-fit font-mono text-[10px] uppercase tracking-widest underline underline-offset-4 hover:text-[#6aa7c2]"
        >
          Read article
        </Link>
      </div>
    </article>
  );
}

/* The card's blurb.
 *
 * This used to render EVERY paragraph and quote block in the article, which
 * meant the blog index printed each post in full — the excerpt was only a
 * fallback for a post with no prose. Show the excerpt, which is what it is
 * for; the server writes one from the article when an author leaves it blank,
 * so there is always something here. */
function PostPreview({
  post,
  className = "",
}: {
  post: BlogPostSummary;
  className?: string;
}) {
  if (!post.excerpt?.trim()) return null;

  return (
    <p className={`${className} text-sm leading-7 text-ink-muted`}>
      {post.excerpt.trim()}
    </p>
  );
}

function PostImage({ post, className }: { post: BlogPostSummary; className: string }) {
  const imageFromBlocks = post.blocks?.find((block) => block.type === "image" && safeMediaUrl(block.url));
  const image = post.coverImage || imageFromBlocks?.url || "";
  return (
    <div className={`${className} overflow-hidden bg-[#eceae2]`}>
      {image ? (
        <img
          src={cldAuto(image)}
          alt={post.coverAlt || imageFromBlocks?.alt || post.title}
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          loading="lazy"
        />
      ) : (
        <div className="grid h-full min-h-56 place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(197,255,50,0.22),transparent_26%),linear-gradient(135deg,#f4f1e8,#e5e1d6)] px-8 text-center">
          <span className="h-16 w-16 border hair bg-white/60 shadow-[8px_8px_0_rgba(197,255,50,0.75)]" aria-hidden="true" />
          <span className="sr-only">{post.title}</span>
        </div>
      )}
    </div>
  );
}

function PostDate({ post }: { post: BlogPostSummary }) {
  return (
    <p className="flex items-center gap-2 font-mono text-[9px] uppercase text-ink-muted">
      <CalendarDays className="h-3.5 w-3.5" />
      {new Date(post.publishedAt).toLocaleDateString("en-IE", { day: "2-digit", month: "short", year: "numeric" })}
      {post.readingMinutes ? ` · ${post.readingMinutes} min read` : ""}
    </p>
  );
}

function DateBadge({ post }: { post: BlogPostSummary }) {
  const date = new Date(post.publishedAt);
  return (
    <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center bg-accent font-mono text-ink">
      <span className="text-lg font-bold leading-none">
        {date.toLocaleDateString("en-IE", { day: "2-digit" })}
      </span>
      <span className="mt-1 text-[9px] uppercase leading-none">
        {date.toLocaleDateString("en-IE", { month: "short" })}
      </span>
    </span>
  );
}
