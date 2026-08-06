import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type TouchEvent,
  type WheelEvent,
} from "react";
import { ShieldCheck, X } from "lucide-react";
import logo from "@/assets/logo-cop.png";
import { getCookie, setSessionCookie } from "@/lib/cookies";
import { getSessionId } from "@/lib/session";

// Consent lives in a first-party cookie tied to the visitor's session id. It
// expires with the browser session, so age is confirmed once per visit.
const CONSENT_COOKIE = "cop_age_ok";

function hasValidConsent(sessionId: string) {
  return getCookie(CONSENT_COOKIE) === sessionId;
}

export function AgeGate({ children }: { children: ReactNode }) {
  const [accepted, setAccepted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const touchY = useRef<number | null>(null);

  useEffect(() => {
    const sid = getSessionId();
    if (hasValidConsent(sid)) setAccepted(true);
  }, []);

  useEffect(() => {
    if (accepted) return;

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() =>
      dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus(),
    );

    return () => {
      window.cancelAnimationFrame(focusFrame);
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
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
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

  const acceptAge = () => {
    const sid = getSessionId();
    setSessionCookie(CONSENT_COOKIE, sid);
    setAccepted(true);
  };

  const scrollBackground = (deltaY: number) => {
    window.scrollBy({ top: deltaY, behavior: "auto" });
  };

  const handleBackdropWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (dialogRef.current?.contains(event.target as Node)) return;
    event.preventDefault();
    scrollBackground(event.deltaY);
  };

  const handleBackdropTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (dialogRef.current?.contains(event.target as Node)) return;
    touchY.current = event.touches[0]?.clientY ?? null;
  };

  const handleBackdropTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (dialogRef.current?.contains(event.target as Node)) return;
    const currentY = event.touches[0]?.clientY ?? null;
    if (currentY == null || touchY.current == null) return;
    event.preventDefault();
    scrollBackground(touchY.current - currentY);
    touchY.current = currentY;
  };

  return (
    <>
      <div aria-hidden={!accepted}>{children}</div>

      {!accepted && (
        <div
          className="fixed inset-0 z-[100] grid min-h-[100dvh] place-items-center overflow-y-auto bg-ink/55 px-4 py-6 text-primary-foreground backdrop-blur-[2px] sm:px-6"
          role="presentation"
          onWheel={handleBackdropWheel}
          onTouchStart={handleBackdropTouchStart}
          onTouchMove={handleBackdropTouchMove}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="age-gate-title"
            aria-describedby="age-gate-description"
            onKeyDown={keepFocusInside}
            className="pointer-events-auto relative w-full max-w-xl overflow-hidden border border-primary-foreground/20 bg-background text-foreground shadow-[0_28px_100px_rgba(0,0,0,0.45)]"
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

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={acceptAge}
                    className="inline-flex items-center justify-center border border-ink bg-ink px-5 py-3.5 font-display text-xs uppercase tracking-[0.1em] text-primary-foreground transition-colors hover:border-accent hover:bg-accent hover:text-accent-foreground"
                  >
                    Yes, I am 18+
                  </button>
                  <a
                    href="https://www.google.com/"
                    className="inline-flex items-center justify-center gap-2 border border-line bg-surface px-5 py-3.5 font-display text-xs uppercase tracking-[0.1em] text-ink transition-colors hover:bg-ink hover:text-primary-foreground"
                  >
                    <X className="h-4 w-4" />
                    No, leave site
                  </a>
                </div>

                <div className="mt-4 flex flex-col gap-2 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
                  <span>Background remains visible and scrollable.</span>
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
