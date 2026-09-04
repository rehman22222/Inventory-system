import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

/* The frame around signing in, signing up and resetting a password.
 *
 * One component for all four so they cannot drift apart — these are the pages
 * where a shopper decides whether this shop looks like it can be trusted with a
 * password, and four slightly different forms is exactly what that judgement
 * notices.
 *
 * `aside` is optional. Sign-up uses it for the reasons to bother; sign-in
 * doesn't need one and gets a narrow, centred column instead.
 */
export function AuthLayout({
  eyebrow = "Your account",
  title,
  lede,
  aside,
  children,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main
        className={`container-x py-12 md:py-20 ${aside ? "" : "max-w-md"}`}
      >
        <div
          className={
            aside
              ? "grid items-start gap-10 lg:grid-cols-2 lg:gap-20"
              : undefined
          }
        >
          <div>
            <div className="eyebrow">{eyebrow}</div>
            <h1 className="mt-3 font-display text-4xl leading-none tracking-tight md:text-6xl">
              {title}
            </h1>
            {lede && (
              <p className="mt-4 max-w-prose text-sm text-ink-muted md:text-base">
                {lede}
              </p>
            )}
            {aside}
          </div>

          <div className={aside ? "w-full max-w-md" : "mt-8"}>{children}</div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

/** A form error, spoken plainly and announced to a screen reader. */
export function AuthError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
    >
      {message}
    </p>
  );
}

/**
 * One field.
 *
 * `text-base` on small screens is not a style choice: iOS Safari zooms the
 * whole page in when a focused input's font is under 16px, and a shopper who
 * has to pinch back out after every field usually stops filling the form in.
 */
export function AuthField({
  label,
  value,
  onChange,
  hint,
  icon: Icon,
  type = "text",
  ...rest
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  icon?: typeof Loader2;
  type?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type">) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <div className="mt-1.5 flex items-center border hair bg-background focus-within:border-ink">
        {Icon && <Icon className="ml-3 h-4 w-4 shrink-0 text-ink-muted" />}
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full bg-transparent px-3 py-3.5 text-base outline-none sm:text-sm"
          {...rest}
        />
      </div>
      {hint && <span className="mt-1.5 block text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

/** The one thing this page is for. Full width — it is the primary action. */
export function AuthSubmit({
  busy,
  children,
  busyLabel,
}: {
  busy: boolean;
  children: string;
  busyLabel?: string;
}) {
  return (
    <button type="submit" disabled={busy} className="btn-primary w-full">
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {busy ? busyLabel || children : children}
    </button>
  );
}
