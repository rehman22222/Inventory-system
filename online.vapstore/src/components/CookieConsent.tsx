import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Cookie } from "lucide-react";
import { getCookie, setCookie } from "@/lib/cookies";

/* A lightweight, GDPR-style cookie banner. The store only sets strictly
 * necessary cookies today (age gate + session), so this is mostly transparency
 * — but it records the visitor's choice so any future analytics/marketing
 * cookies can check `hasCookieConsent()` before running. */

const CONSENT_COOKIE = "cop_cookie_consent";
const CONSENT_TTL_SECONDS = 180 * 24 * 60 * 60; // 6 months

export type CookieChoice = "all" | "essential";

/** The stored choice, or null if the visitor hasn't decided yet. */
export function getCookieConsent(): CookieChoice | null {
  const v = getCookie(CONSENT_COOKIE);
  return v === "all" || v === "essential" ? v : null;
}

/** True once the visitor has opted in to non-essential cookies. */
export function hasCookieConsent(): boolean {
  return getCookieConsent() === "all";
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!getCookieConsent()) setVisible(true);
  }, []);

  const choose = (choice: CookieChoice) => {
    setCookie(CONSENT_COOKIE, choice, CONSENT_TTL_SECONDS);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[90] border-t hair bg-background/98 backdrop-blur">
      <div className="container-x flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" />
          <p className="max-w-2xl text-sm leading-6 text-ink-muted">
            We use cookies to keep the site working — remembering your age
            confirmation and your basket. With your consent we may also use
            cookies to understand how the site is used.{" "}
            <Link
              to="/cookies"
              className="text-ink underline underline-offset-4 hover:text-accent-foreground"
            >
              Cookie policy
            </Link>
            .
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose("essential")}
            className="border hair px-4 py-2.5 font-display text-xs uppercase tracking-widest hover:bg-surface"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => choose("all")}
            className="bg-ink px-4 py-2.5 font-display text-xs uppercase tracking-widest text-primary-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
