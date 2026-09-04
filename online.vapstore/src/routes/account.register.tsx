import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Award, MailCheck, Package, Zap } from "lucide-react";
import {
  AuthError,
  AuthField,
  AuthLayout,
  AuthSubmit,
} from "@/components/account/AuthLayout";
import { registerAccount, verifyRegistration } from "@/lib/account-api";
import { useCatalog } from "@/lib/catalog-context";

export const Route = createFileRoute("/account/register")({
  beforeLoad: ({ context }) => {
    if (context.account) throw redirect({ to: "/account" });
  },
  component: Register,
  head: () => ({
    meta: [
      { title: "Create an account - Cliffs of Puff" },
      {
        name: "description",
        content: "Create an account to track orders and collect rewards.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function Register() {
  const { settings } = useCatalog();
  const accounts = settings.accounts;
  const loyalty = settings.loyalty;

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    marketingOptIn: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState<{
    email: string;
    expiresInMinutes: number;
    devOtp?: string;
  } | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (form.password.length < 8) {
      return setError("Please choose a password of at least 8 characters.");
    }
    setBusy(true);
    setError("");
    try {
      const result = await registerAccount({
        data: {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          password: form.password,
          marketingOptIn: form.marketingOptIn,
        },
      });
      setOtpSent(result);
      if (result.devOtp) setOtp(result.devOtp);
      setBusy(false);
    } catch (registerError) {
      setError(
        registerError instanceof Error
          ? registerError.message
          : "We couldn't send the verification code. Please try again.",
      );
      setBusy(false);
    }
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !otpSent) return;
    const cleanOtp = otp.replace(/\D/g, "");
    if (cleanOtp.length !== 6) {
      return setError("Enter the 6 digit code from your email.");
    }

    setBusy(true);
    setError("");
    try {
      const result = await verifyRegistration({
        data: { email: otpSent.email, otp: cleanOtp },
      });
      const claimed = result.claimedOrders ? `?claimed=${result.claimedOrders}` : "";
      window.location.assign(`/account/${claimed}`);
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "We couldn't verify your account. Please try again.",
      );
      setBusy(false);
    }
  };

  const perks = [
    { icon: Package, text: "Track every order from packed to delivered" },
    { icon: Zap, text: "Your details saved, so checkout is one step" },
    ...(loyalty?.enabled
      ? [
          {
            icon: Award,
            text: loyalty.signupBonus
              ? `${loyalty.signupBonus} ${loyalty.pointsName} when you join, and more on everything you buy`
              : `Collect ${loyalty.pointsName} on everything you buy`,
          },
        ]
      : []),
  ];

  return (
    <AuthLayout
      title={otpSent ? "Check your email" : accounts?.signupHeading || "Create your account"}
      lede={
        otpSent
          ? "Enter the verification code we sent you to finish creating your account."
          : accounts?.signupBlurb ||
            "Track your orders, save your delivery details and collect points every time you shop."
      }
      aside={
        <ul className="mt-8 space-y-3 border-t hair pt-6">
          {perks.map((perk) => (
            <li key={perk.text} className="flex items-start gap-3">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center bg-accent text-accent-foreground">
                <perk.icon className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm">{perk.text}</span>
            </li>
          ))}
        </ul>
      }
    >
      <form onSubmit={otpSent ? verify : submit} className="space-y-4" noValidate>
        <AuthError message={error} />

        {otpSent ? (
          <>
            <div className="flex items-start gap-3 border hair bg-surface px-4 py-3 text-sm leading-6 text-ink-muted">
              <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-ink" />
              <span>
                Code sent to{" "}
                <span className="font-medium text-ink">{otpSent.email}</span>.
                It expires in {otpSent.expiresInMinutes} minutes.
              </span>
            </div>
            <AuthField
              label="Verification code"
              inputMode="numeric"
              value={otp}
              onChange={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))}
              autoComplete="one-time-code"
              hint="Check your inbox and spam folder."
              required
            />
            <AuthSubmit busy={busy} busyLabel="Checking code...">
              Verify and create account
            </AuthSubmit>
            <button
              type="button"
              className="text-sm font-medium text-ink underline underline-offset-4"
              onClick={() => {
                setOtpSent(null);
                setOtp("");
                setError("");
              }}
            >
              Change email
            </button>
          </>
        ) : (
          <>
            <AuthField
              label="Your name"
              value={form.name}
              onChange={(value) => set("name", value)}
              autoComplete="name"
              required
            />
            <AuthField
              label="Email"
              type="email"
              inputMode="email"
              value={form.email}
              onChange={(value) => set("email", value)}
              autoComplete="email"
              required
            />
            <AuthField
              label="Phone (optional)"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(value) => set("phone", value)}
              autoComplete="tel"
            />
            <AuthField
              label="Password"
              type="password"
              value={form.password}
              onChange={(value) => set("password", value)}
              autoComplete="new-password"
              hint="At least 8 characters. Length beats punctuation."
              required
            />

            <label className="flex cursor-pointer items-start gap-3 pt-1">
              <input
                type="checkbox"
                checked={form.marketingOptIn}
                onChange={(event) => set("marketingOptIn", event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--ink)]"
              />
              <span className="text-sm text-ink-muted">
                Email me about new arrivals and offers. You can stop this at any time.
              </span>
            </label>

            <AuthSubmit busy={busy} busyLabel="Sending code...">
              Send verification code
            </AuthSubmit>
          </>
        )}

        <p className="border-t hair pt-5 text-sm text-ink-muted">
          Already have one?{" "}
          <Link
            to="/account/login"
            className="font-medium text-ink underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
