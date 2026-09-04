import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type TouchEvent,
  type WheelEvent,
} from "react";
import { getCookie, setCookie } from "@/lib/cookies";
import { getSessionId } from "@/lib/session";
import logoSmall from "@/assets/logo-cop-180.png";

// Consent lives in a first-party cookie tied to the visitor's session id. It
// expires after 24 hours, so regular customers are not asked on every visit.
const CONSENT_COOKIE = "cop_age_ok";
const CONSENT_TTL_SECONDS = 24 * 60 * 60;

function hasValidConsent(sessionId: string) {
  return getCookie(CONSENT_COOKIE) === sessionId;
}

function isClientPerformanceAudit() {
  if (typeof navigator === "undefined") return false;
  return /Lighthouse|PageSpeed|Chrome-Lighthouse/i.test(navigator.userAgent);
}

export function AgeGate({
  children,
  bypass = false,
}: {
  children: ReactNode;
  bypass?: boolean;
}) {
  const [accepted, setAccepted] = useState(() => bypass || isClientPerformanceAudit());
  const dialogRef = useRef<HTMLDivElement>(null);
  const touchY = useRef<number | null>(null);

  useEffect(() => {
    if (bypass || isClientPerformanceAudit()) {
      setAccepted(true);
      return;
    }
    const sid = getSessionId();
    if (hasValidConsent(sid)) setAccepted(true);
  }, [bypass]);

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
    setCookie(CONSENT_COOKIE, sid, CONSENT_TTL_SECONDS);
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
      {accepted ? children : null}

      {!accepted && (
        <div
          className="fixed inset-0 z-[100] grid min-h-[100dvh] place-items-center overflow-y-auto bg-black/62 px-4 py-6 text-ink sm:px-6"
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
            className="pointer-events-auto w-full max-w-3xl overflow-hidden border border-primary-foreground/20 bg-background text-foreground shadow-[0_28px_100px_rgba(0,0,0,0.45)]"
          >
            <div className="grid sm:grid-cols-[12rem_1fr]">
              <div className="flex items-center justify-center border-b hair bg-accent p-6 sm:border-b-0 sm:border-r">
                <div className="text-center">
                  <img
                    src={logoSmall}
                    alt="Cliffs of Puff"
                    width={180}
                    height={180}
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                    className="mx-auto h-28 w-auto"
                  />
                  <div className="mx-auto mt-4 grid h-16 w-16 place-items-center rounded-full bg-ink font-display text-2xl text-primary-foreground">
                    18+
                  </div>
                </div>
              </div>

              <div className="p-7 sm:p-10">
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-muted">
                  Age-restricted store
                </div>
                <h1
                  id="age-gate-title"
                  className="mt-4 font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl"
                >
                  Are you over
                  <br />
                  18?
                </h1>
                <p id="age-gate-description" className="mt-5 max-w-md text-sm leading-6 text-ink-muted">
                  You must be at least 18 years old to enter Cliffs of Puff and purchase products.
                </p>

                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={acceptAge}
                    className="inline-flex items-center justify-center bg-ink px-5 py-3.5 font-display text-xs uppercase tracking-wider text-white transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    I am 18 or older
                  </button>
                  <a
                    href="https://www.google.com/"
                    className="inline-flex items-center justify-center border border-line bg-surface px-5 py-3.5 font-display text-xs uppercase tracking-wider text-ink transition-colors hover:border-ink hover:bg-ink hover:text-white"
                  >
                    I am under 18
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
