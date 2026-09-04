import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Mail, MailCheck } from "lucide-react";
import {
  AuthError,
  AuthField,
  AuthLayout,
  AuthSubmit,
} from "@/components/account/AuthLayout";
import { requestPasswordReset } from "@/lib/account-api";

export const Route = createFileRoute("/account/forgot")({
  component: Forgot,
  head: () => ({
    meta: [
      { title: "Reset your password — Cliffs of Puff" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function Forgot() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await requestPasswordReset({ data: email.trim() });
      setSent(true);
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "We couldn't send that just now. Please try again shortly.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout title="Check your email.">
        <div className="space-y-5">
          <span className="grid h-12 w-12 place-items-center bg-accent text-accent-foreground">
            <MailCheck className="h-5 w-5" />
          </span>
          {/* Deliberately worded not to confirm whether the address has an
              account. This form must not double as a way of finding out who
              shops at an age-restricted retailer. */}
          <p className="text-sm text-ink-muted">
            If that address has an account with us, a reset link is on its way.
            It works once and expires in an hour.
          </p>
          <Link to="/account/login" className="btn-primary w-full">
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgotten your password?"
      lede="Tell us the email you signed up with and we'll send you a link to choose a new one."
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
        <AuthSubmit busy={busy} busyLabel="Sending…">
          Send reset link
        </AuthSubmit>
        <p className="border-t hair pt-5 text-sm">
          <Link
            to="/account/login"
            className="text-ink-muted underline underline-offset-4 hover:text-ink"
          >
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
