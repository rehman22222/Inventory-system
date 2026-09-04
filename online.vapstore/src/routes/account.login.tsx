import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Lock, Mail } from "lucide-react";
import {
  AuthError,
  AuthField,
  AuthLayout,
  AuthSubmit,
} from "@/components/account/AuthLayout";
import { loginAccount } from "@/lib/account-api";
import { useCatalog } from "@/lib/catalog-context";

export const Route = createFileRoute("/account/login")({
  // A signed-in shopper has no business on a sign-in form. Sending them on
  // before the page renders avoids the flash of a login box they do not need.
  beforeLoad: ({ context }) => {
    if (context.account) throw redirect({ to: "/account" });
  },
  component: SignIn,
  head: () => ({
    meta: [
      { title: "Sign in — Cliffs of Puff" },
      { name: "description", content: "Sign in to track your orders and rewards." },
      // A sign-in form has no business in search results.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function SignIn() {
  const { settings } = useCatalog();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await loginAccount({ data: { email: email.trim(), password } });
      window.location.assign("/account/");
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "We couldn't sign you in. Please try again.",
      );
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back."
      lede={
        settings.loyalty?.enabled
          ? `Track your orders, see your ${settings.loyalty.pointsName} and check out faster.`
          : "Track your orders and check out faster."
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <AuthError message={error} />

        <AuthField
          label="Email"
          type="email"
          inputMode="email"
          icon={Mail}
          value={email}
          onChange={setEmail}
          autoComplete="email"
          placeholder="you@example.com"
          required
        />

        <AuthField
          label="Password"
          type="password"
          icon={Lock}
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          placeholder="••••••••"
          required
        />

        <AuthSubmit busy={busy} busyLabel="Signing in…">
          Sign in
        </AuthSubmit>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-sm">
          <Link
            to="/account/forgot"
            className="text-ink-muted underline underline-offset-4 hover:text-ink"
          >
            Forgotten your password?
          </Link>
        </div>

        <p className="border-t hair pt-5 text-sm text-ink-muted">
          New here?{" "}
          <Link
            to="/account/register"
            className="font-medium text-ink underline underline-offset-4"
          >
            Create an account
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
