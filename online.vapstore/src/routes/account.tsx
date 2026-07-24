import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/account")({
  component: Account,
  head: () => ({
    meta: [
      { title: "Account — ClipsOfPuff" },
      { name: "description", content: "Sign in to your ClipsOfPuff account." },
    ],
  }),
});

function Account() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="container-x py-16 md:py-24 max-w-md">
        <div className="eyebrow">Account</div>
        <h1 className="mt-3 font-display text-5xl leading-none tracking-tight">Sign in.</h1>
        <form className="mt-8 space-y-4">
          <div>
            <label className="eyebrow block mb-2">Email</label>
            <input
              type="email"
              className="w-full border hair bg-background px-3 py-3 outline-none focus:border-ink"
            />
          </div>
          <div>
            <label className="eyebrow block mb-2">Password</label>
            <input
              type="password"
              className="w-full border hair bg-background px-3 py-3 outline-none focus:border-ink"
            />
          </div>
          <button type="button" className="btn-primary w-full">
            Continue
          </button>
          <p className="text-sm text-ink-muted text-center">
            New here?{" "}
            <Link to="/shop" className="underline">
              Just start shopping
            </Link>
            .
          </p>
        </form>
      </section>
      <Footer />
    </div>
  );
}
