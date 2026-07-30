import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, Cookie, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { getCookie, setCookie } from "@/lib/cookies";

const CONSENT_COOKIE = "cop_cookie_consent";
const CONSENT_VERSION = "2";
const CONSENT_TTL_SECONDS = 180 * 24 * 60 * 60; // 6 months
const OPEN_PREFERENCES_EVENT = "cop:open-cookie-preferences";

export type CookieChoice = "all" | "essential" | "custom";

type CookiePreferences = {
  analytics: boolean;
  marketing: boolean;
};

const DEFAULT_PREFERENCES: CookiePreferences = {
  analytics: false,
  marketing: false,
};

const encodeChoice = (preferences: CookiePreferences) => {
  const choice: CookieChoice =
    preferences.analytics && preferences.marketing
      ? "all"
      : !preferences.analytics && !preferences.marketing
        ? "essential"
        : "custom";
  return `${CONSENT_VERSION}:${choice}:${Number(preferences.analytics)}:${Number(
    preferences.marketing,
  )}`;
};

const readPreferences = (): { choice: CookieChoice; preferences: CookiePreferences } | null => {
  const raw = getCookie(CONSENT_COOKIE);
  if (!raw) return null;
  const [version, choice, analytics, marketing] = raw.split(":");
  if (
    version !== CONSENT_VERSION ||
    !["all", "essential", "custom"].includes(choice) ||
    !["0", "1"].includes(analytics) ||
    !["0", "1"].includes(marketing)
  ) {
    return null;
  }
  return {
    choice: choice as CookieChoice,
    preferences: { analytics: analytics === "1", marketing: marketing === "1" },
  };
};

/** The stored consent choice, or null when this consent version is unanswered. */
export function getCookieConsent(): CookieChoice | null {
  return readPreferences()?.choice ?? null;
}

/** True only when analytics cookies have been explicitly allowed. */
export function hasCookieConsent(): boolean {
  return readPreferences()?.preferences.analytics === true;
}

/** Lets the footer reopen preferences after the initial banner was dismissed. */
export function openCookiePreferences(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(OPEN_PREFERENCES_EVENT));
  }
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [managing, setManaging] = useState(false);
  const [preferences, setPreferences] =
    useState<CookiePreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    const stored = readPreferences();
    if (stored) setPreferences(stored.preferences);
    else setVisible(true);

    const open = () => {
      const latest = readPreferences();
      setPreferences(latest?.preferences ?? DEFAULT_PREFERENCES);
      setManaging(true);
      setVisible(true);
    };
    window.addEventListener(OPEN_PREFERENCES_EVENT, open);
    return () => window.removeEventListener(OPEN_PREFERENCES_EVENT, open);
  }, []);

  const save = (next: CookiePreferences) => {
    setCookie(CONSENT_COOKIE, encodeChoice(next), CONSENT_TTL_SECONDS);
    setPreferences(next);
    setManaging(false);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[90] border-t hair bg-background/98 shadow-[0_-16px_50px_rgba(0,0,0,0.14)] backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-description"
    >
      <div className="container-x py-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex max-w-3xl items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface">
              <Cookie className="h-5 w-5" />
            </span>
            <div>
              <h2 id="cookie-consent-title" className="font-display text-lg">
                Your privacy, your choice
              </h2>
              <p
                id="cookie-consent-description"
                className="mt-1 max-w-2xl text-sm leading-6 text-ink-muted"
              >
                We use essential cookies to verify age, remember your basket and
                keep the store working. Optional analytics and marketing cookies
                are used only with your permission.{" "}
                <Link
                  to="/cookies"
                  className="text-ink underline underline-offset-4 hover:opacity-70"
                >
                  Read our cookie policy
                </Link>
                .
              </p>
            </div>
          </div>

          <div className="grid shrink-0 gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => save(DEFAULT_PREFERENCES)}
              className="border hair px-4 py-2.5 font-display text-xs uppercase tracking-widest hover:bg-surface"
            >
              Reject optional
            </button>
            <button
              type="button"
              onClick={() => setManaging((current) => !current)}
              className="inline-flex items-center justify-center gap-2 border hair px-4 py-2.5 font-display text-xs uppercase tracking-widest hover:bg-surface"
              aria-expanded={managing}
              aria-controls="cookie-preferences"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Manage
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${managing ? "rotate-180" : ""}`}
              />
            </button>
            <button
              type="button"
              onClick={() => save({ analytics: true, marketing: true })}
              className="bg-ink px-4 py-2.5 font-display text-xs uppercase tracking-widest text-primary-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Accept all
            </button>
          </div>
        </div>

        {managing && (
          <div
            id="cookie-preferences"
            className="mt-5 grid gap-3 border-t hair pt-5 md:grid-cols-3"
          >
            <PreferenceCard
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Essential"
              description="Age verification, basket, security and your saved cookie choice."
              checked
              locked
              onChange={() => undefined}
            />
            <PreferenceCard
              title="Analytics"
              description="Helps us understand store usage and improve the shopping experience."
              checked={preferences.analytics}
              onChange={(analytics) =>
                setPreferences((current) => ({ ...current, analytics }))
              }
            />
            <PreferenceCard
              title="Marketing"
              description="Allows relevant promotions and campaign measurement."
              checked={preferences.marketing}
              onChange={(marketing) =>
                setPreferences((current) => ({ ...current, marketing }))
              }
            />
            <div className="md:col-span-3 flex justify-end">
              <button
                type="button"
                onClick={() => save(preferences)}
                className="inline-flex items-center gap-2 bg-ink px-5 py-3 font-display text-xs uppercase tracking-widest text-primary-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <Check className="h-4 w-4" />
                Save preferences
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PreferenceCard({
  icon,
  title,
  description,
  checked,
  locked = false,
  onChange,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  checked: boolean;
  locked?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 border hair bg-surface p-4">
      <span>
        <span className="flex items-center gap-2 font-display text-sm">
          {icon}
          {title}
        </span>
        <span className="mt-1 block text-xs leading-5 text-ink-muted">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={locked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-black disabled:opacity-60"
        aria-label={`${title} cookies`}
      />
    </label>
  );
}
