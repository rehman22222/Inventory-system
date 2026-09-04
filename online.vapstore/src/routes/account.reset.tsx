import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import {
  AuthError,
  AuthField,
  AuthLayout,
  AuthSubmit,
} from "@/components/account/AuthLayout";
import { resetPassword } from "@/lib/account-api";
import { useAccount } from "@/lib/account-context";

export const Route = createFileRoute("/account/reset")({
  // The token arrives in the emailed link. Validated as a plain string here and
  // proved on the server — this only decides whether there is anything to try.
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  component: Reset,
  head: () => ({
    meta: [
      { title: "Choose a new password — Cliffs of Puff" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function Reset() {
  const { token } = Route.useSearch();
  const router = useRouter();
  const { refresh } = useAccount();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (password.length < 8) {
      return setError("Please choose a password of at least 8 characters.");
    }
    if (password !== confirm) {
      return setError("Those two passwords don't match.");
    }
    setBusy(true);
    setError("");
    try {
      await resetPassword({ data: { token, password } });
      // The server signs them straight in — somebody who has just proved they
      // can read the account's email should not then be asked to type the
      // password they set four seconds ago.
      await refresh();
      await router.navigate({ to: "/account" });
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "We couldn't reset your password. The link may have expired.",
      );
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthLayout
        title="That link isn't complete."
        lede="Open the link from your email exactly as it was sent, or ask for a new one."
      >
        <Link to="/account/forgot" className="btn-primary w-full">
          Send a new link
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <AuthError message={error} />
        <AuthField
          label="New password"
          type="password"
          icon={Lock}
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint="At least 8 characters."
          required
        />
        <AuthField
          label="Again, to be sure"
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          required
        />
        <AuthSubmit busy={busy} busyLabel="Saving…">
          Save and sign in
        </AuthSubmit>
      </form>
    </AuthLayout>
  );
}
