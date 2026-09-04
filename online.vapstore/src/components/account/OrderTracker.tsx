import {
  Check,
  ClipboardClock,
  Handshake,
  PackageCheck,
  ShoppingCart,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TrackerStep } from "@/lib/account-api";

const STEP_COPY: Record<string, string> = {
  processing: "Your order is in pending status.",
  ready: "Your order has been confirmed.",
  shipped: "Your order has been packed and processed.",
  delivered: "Your order has been delivered.",
};

const DISPLAY_LABELS: Record<string, string> = {
  processing: "Pending",
  ready: "Order Confirm",
  shipped: "Packed and Processed",
  delivered: "Delivered",
};

const STEP_ICONS: Record<string, LucideIcon> = {
  processing: ClipboardClock,
  ready: ShoppingCart,
  shipped: PackageCheck,
  delivered: Handshake,
};

const stampFor = (value: string | null) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const currentIndexFor = (steps: TrackerStep[]) => {
  const currentIndex = steps.findIndex((step) => step.current);
  if (currentIndex >= 0) return currentIndex;

  for (let index = steps.length - 1; index >= 0; index -= 1) {
    if (steps[index].done) return index;
  }

  return 0;
};

function stepCopy(step: TrackerStep, index: number) {
  return STEP_COPY[step.status] || "We will update this step soon.";
}

function stepLabel(step: TrackerStep) {
  return DISPLAY_LABELS[step.status] || step.label;
}

export function OrderTracker({
  steps,
  cancelled,
  statusLabel,
}: {
  steps: TrackerStep[];
  cancelled: boolean;
  statusLabel: string;
}) {
  if (cancelled) {
    return (
      <div className="border border-destructive/35 bg-destructive/5 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <div className="font-display text-xl leading-tight tracking-tight">
              {statusLabel}
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-muted">
              This order was stopped. Any points used on it have been returned
              to your account.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const currentIndex = currentIndexFor(steps);
  const current = steps[currentIndex];

  return (
    <section
      className="overflow-hidden rounded-[14px] border hair bg-surface shadow-[0_16px_44px_rgba(24,20,16,0.08)]"
      aria-label="Order tracking"
    >
      <div className="border-b hair bg-muted px-5 py-3 text-center">
        <div className="font-display text-lg leading-tight tracking-tight text-ink">
          {stepLabel(current) || statusLabel}
        </div>
        <div className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
          Delivery progress
        </div>
      </div>

      <ol className="grid grid-cols-4 bg-surface px-2 pb-5 pt-4 sm:px-7 sm:pb-6 sm:pt-5">
        {steps.map((step, index) => {
          const reached = step.done || step.current || index <= currentIndex;
          const connectorReached =
            index < currentIndex || (index === currentIndex && step.done);
          const Icon = STEP_ICONS[step.status] || PackageCheck;

          return (
            <li
              key={step.status}
              className="relative flex min-w-0 flex-col items-center px-1 text-center sm:px-2"
            >
              {index < steps.length - 1 && (
                <span
                  aria-hidden
                  className={`absolute left-1/2 top-[14px] h-0.5 w-full sm:top-[17px] sm:h-1 ${
                    connectorReached ? "bg-accent" : "bg-border"
                  }`}
                />
              )}

              <span
                className={`relative z-10 grid h-7 w-7 place-items-center rounded-full border-2 text-sm font-semibold sm:h-10 sm:w-10 ${
                  reached
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-surface text-ink-muted"
                } ${
                  step.current
                    ? "outline outline-4 outline-accent/25"
                    : ""
                }`}
              >
                {reached ? (
                  <Check className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                ) : (
                  ""
                )}
              </span>

              <div
                className={`mt-3 grid h-9 w-9 place-items-center rounded-md border bg-background sm:mt-4 sm:h-12 sm:w-12 ${
                  reached ? "border-accent/45" : "border-border opacity-55"
                }`}
              >
                <Icon
                  className={`h-5 w-5 sm:h-7 sm:w-7 ${
                    reached ? "text-accent-foreground" : "text-ink-muted"
                  }`}
                  aria-hidden
                />
              </div>

              <div className="mt-2 min-w-0 sm:mt-3">
                <div
                  className={`text-[11px] font-bold leading-4 sm:text-[15px] sm:leading-5 ${
                    reached ? "text-accent-foreground" : "text-ink"
                  }`}
                >
                  {stepLabel(step)}
                </div>
                {(step.at || step.current) && (
                  <div className="mx-auto mt-1 max-w-[72px] text-[10px] leading-4 text-ink-muted sm:mt-2 sm:max-w-[120px] sm:text-xs sm:leading-5">
                    {step.at ? stampFor(step.at) : "Happening now"}
                  </div>
                )}
                {!step.at && !step.current && !reached && (
                  <div className="mx-auto mt-1 max-w-[72px] text-[10px] leading-4 text-ink-muted sm:mt-2 sm:max-w-[120px] sm:text-xs sm:leading-5">
                    Expected
                  </div>
                )}
                <p className="mx-auto mt-1 hidden max-w-[132px] text-xs leading-5 text-ink-muted sm:block">
                  {stepCopy(step, index)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function stepTone(step: TrackerStep, index: number, currentIndex: number) {
  if (step.current) return "current";
  if (step.done || index < currentIndex) return "done";
  return "waiting";
}

export function TrackerPips({
  steps,
  cancelled,
}: {
  steps: TrackerStep[];
  cancelled: boolean;
}) {
  if (cancelled) {
    return <XCircle className="h-4 w-4 text-destructive" aria-hidden />;
  }

  const currentIndex = currentIndexFor(steps);

  return (
    <span className="flex items-center gap-1" aria-hidden>
      {steps.map((step, index) => {
        const tone = stepTone(step, index, currentIndex);
        return (
          <span
            key={step.status}
            title={step.label}
            className={`h-1.5 w-5 ${
              tone === "current"
                ? "bg-ink"
                : tone === "done"
                  ? "bg-ink/45"
                  : "bg-border"
            }`}
          />
        );
      })}
    </span>
  );
}
