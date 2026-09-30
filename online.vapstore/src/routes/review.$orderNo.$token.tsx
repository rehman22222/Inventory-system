import { createFileRoute, Link } from "@tanstack/react-router";
import { NOINDEX_META } from "@/lib/seo";
import { useState } from "react";
import { Check } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Stars } from "@/components/Stars";
import { getReviewContext, submitReview, type ReviewContext } from "@/lib/catalog-api";

export const Route = createFileRoute("/review/$orderNo/$token")({
  component: ReviewPage,
  loader: async ({ params }): Promise<ReviewContext> =>
    getReviewContext({ data: { order: params.orderNo, token: params.token } }),
  // The URL carries a private review token: never let it into search results.
  head: () => ({ meta: [{ title: "Write a review — Cliffs of Puff" }, NOINDEX_META] }),
});

const MESSAGES: Record<string, { title: string; body: string }> = {
  invalid: {
    title: "This review link isn't valid",
    body: "It may have expired or already been used. If you think this is a mistake, get in touch with the shop.",
  },
  not_delivered: {
    title: "Not quite yet",
    body: "You can review this order once it has been marked delivered. Please check back after it arrives.",
  },
  done: {
    title: "You're all done",
    body: "Thanks — you've already reviewed everything in this order. We appreciate it!",
  },
};

function ReviewPage() {
  const ctx = Route.useLoaderData();
  const { orderNo, token } = Route.useParams();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="container-x py-12 md:py-20 max-w-2xl">
        {ctx.state !== "ok" ? (
          <div className="border hair p-10 text-center">
            <div className="font-display text-3xl">{MESSAGES[ctx.state].title}</div>
            <p className="mt-3 text-ink-muted">{MESSAGES[ctx.state].body}</p>
            <Link to="/shop" className="mt-6 inline-block btn-primary">
              Continue shopping
            </Link>
          </div>
        ) : (
          <>
            <h1 className="font-display text-4xl md:text-5xl leading-none tracking-tight">
              Rate your order.
            </h1>
            <p className="mt-3 text-ink-muted">
              {ctx.customerName ? `Thanks ${ctx.customerName}! ` : ""}
              Tell other shoppers what you thought of order {orderNo}.
            </p>
            <div className="mt-10 space-y-8">
              {ctx.items.map((item) => (
                <ReviewItemForm
                  key={item.productId}
                  orderNo={orderNo}
                  token={token}
                  item={item}
                />
              ))}
            </div>
          </>
        )}
      </section>
      <Footer />
    </div>
  );
}

function ReviewItemForm({
  orderNo,
  token,
  item,
}: {
  orderNo: string;
  token: string;
  item: ReviewContext["items"][number];
}) {
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (rating < 1) {
      setError("Please pick a star rating.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await submitReview({ data: { order: orderNo, token, productId: item.productId, rating, title, body } });
      setDone(true);
    } catch (e) {
      setError((e as Error).message || "Could not save your review.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border hair p-5">
      <div className="flex items-center gap-4">
        {item.image && (
          <div className="h-16 w-16 shrink-0 border hair bg-surface">
            <img src={item.image} alt={item.name} className="h-full w-full object-contain" />
          </div>
        )}
        <div className="font-display text-lg leading-tight">{item.name}</div>
      </div>

      {done ? (
        <div className="mt-4 flex items-center gap-2 font-mono text-[12px] uppercase tracking-widest text-emerald-600">
          <Check className="h-4 w-4" /> Thanks for your review!
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <div className="eyebrow mb-2">Your rating</div>
            <Stars value={rating} size={28} onChange={setRating} />
          </div>
          <input
            className="w-full border hair bg-background px-3 py-2.5 text-sm outline-none focus:border-ink"
            placeholder="Add a headline (optional)"
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="w-full border hair bg-background px-3 py-2.5 text-sm outline-none focus:border-ink"
            rows={4}
            placeholder="What did you think? (optional)"
            maxLength={2000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          {error && <div className="text-sm text-[color:var(--sale)]">{error}</div>}
          <button
            onClick={submit}
            disabled={busy}
            className="btn-primary disabled:opacity-50"
          >
            {busy ? "Submitting…" : "Submit review"}
          </button>
        </div>
      )}
    </div>
  );
}
