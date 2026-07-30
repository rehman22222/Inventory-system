import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import logo from "@/assets/logo-cop.png";
import { getCookie, setSessionCookie } from "@/lib/cookies";
import { getSessionId } from "@/lib/session";

// Consent lives in a first-party cookie tied to the visitor's session id, and
// both expire when the browser session closes, so age is confirmed once per
// browser session.
const CONSENT_COOKIE = "cop_age_ok";

function hasValidConsent(sessionId: string) {
  return getCookie(CONSENT_COOKIE) === sessionId;
}

export function AgeGate({ children }: { children: ReactNode }) {
  const [accepted, setAccepted] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Ensure a session id exists (creates the cookie on first visit), then skip
    // the gate if this session already confirmed 18+ within the last 24h.
    const sid = getSessionId();
    if (hasValidConsent(sid)) setAccepted(true);
  }, []);

  useEffect(() => {
    if (accepted) return;

    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => checkboxRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [accepted]);

  const keepFocusInside = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;

    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'input:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const acceptAge = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!confirmed) return;

    // Bind the consent to the current browser session id.
    const sid = getSessionId();
    setSessionCookie(CONSENT_COOKIE, sid);
    setAccepted(true);
  };

  return (
    <>
      <div aria-hidden={!accepted}>{children}</div>

      {!accepted && (
        <div
          className="fixed inset-0 z-[100] grid min-h-[100dvh] place-items-center overflow-y-auto bg-ink px-4 py-6 text-primary-foreground sm:px-6"
          role="presentation"
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="age-gate-title"
            aria-describedby="age-gate-description"
            onKeyDown={keepFocusInside}
            className="relative w-full max-w-xl overflow-hidden border border-primary-foreground/20 bg-background text-foreground shadow-[0_28px_100px_rgba(0,0,0,0.45)]"
          >
            <div className="grid gap-0 sm:grid-cols-[9rem_1fr]">
              <div className="flex items-center justify-center border-b hair bg-accent p-5 sm:border-b-0 sm:border-r">
                <div className="text-center">
                  <img
                    src={logo}
                    alt="CliffsOfPuff"
                    width={640}
                    height={640}
                    className="mx-auto h-24 w-auto sm:h-28"
                  />
                  <div className="mx-auto mt-3 grid h-14 w-14 place-items-center rounded-full bg-ink font-display text-xl text-primary-foreground">
                    18+
                  </div>
                </div>
              </div>

              <div className="p-6 sm:p-8">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
                  <ShieldCheck className="h-4 w-4 text-foreground" />
                  Age-restricted store
                </div>
                <h1 id="age-gate-title" className="mt-4 font-display text-4xl leading-none">
                  Are you 18 or older?
                </h1>
                <p id="age-gate-description" className="mt-4 text-sm leading-6 text-ink-muted">
                  You must be at least 18 years old to enter CliffsOfPuff and purchase
                  age-restricted products.
                </p>

                <form onSubmit={acceptAge} className="mt-6">
                  <label className="flex cursor-pointer items-start gap-3 border hair bg-surface p-4">
                    <input
                      ref={checkboxRef}
                      type="checkbox"
                      checked={confirmed}
                      onChange={(event) => setConfirmed(event.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-black"
                      required
                    />
                    <span className="text-sm font-medium leading-5">
                      I confirm that I am 18 years of age or older.
                    </span>
                  </label>
                  <button
                    type="submit"
                    disabled={!confirmed}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 border border-ink bg-ink px-5 py-3.5 font-display text-xs uppercase tracking-[0.1em] text-primary-foreground transition-colors enabled:hover:border-accent enabled:hover:bg-accent enabled:hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Enter store
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </form>

                <div className="mt-4 flex flex-col gap-2 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
                  <a
                    href="https://www.google.com/"
                    className="underline underline-offset-4 transition-colors hover:text-foreground"
                  >
                    I am under 18 — leave this site
                  </a>
                  <span>Remembered for this browser session</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
