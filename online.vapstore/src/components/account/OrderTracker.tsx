import {
  Check,
  XCircle,
} from "lucide-react";
import type { TrackerStep } from "@/lib/account-api";

const STEP_COPY: Record<string, string> = {
  processing: "Your order is being prepared.",
  ready: "Packed and ready to leave the store.",
  shipped: "Your order is with the courier.",
  delivered: "Your order has been delivered.",
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
  if (index === 0) return "We received your order.";
  return STEP_COPY[step.status] || "We will update this step soon.";
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

  return (
    <section
      className="overflow-hidden rounded-[18px] border border-border/80 bg-surface shadow-[0_14px_40px_rgba(15,23,42,0.07)]"
      aria-label="Order tracking"
    >
      <div className="border-b border-border/70 px-5 py-4 sm:px-6">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-muted">
          Delivery progress
        </div>
        <h2 className="mt-1 font-display text-2xl leading-tight tracking-tight">
          {statusLabel}
        </h2>
      </div>

      <ol className="bg-background px-5 py-6 sm:px-6">
        {steps.map((step, index) => {
          const reached = step.done || step.current || index <= currentIndex;
          const connectorReached =
            index < currentIndex || (index === currentIndex && step.done);

          return (
            <li
              key={step.status}
              className="relative grid grid-cols-[42px_1fr] gap-4 pb-8 last:pb-0"
            >
              {index < steps.length - 1 && (
                <span
                  aria-hidden
                  className={`absolute left-[20px] top-11 h-[calc(100%-2.75rem)] w-0.5 ${
                    connectorReached ? "bg-ink" : "bg-border"
                  }`}
                />
              )}

              <span
                className={`relative z-10 grid h-10 w-10 place-items-center border text-sm font-semibold ${
                  reached
                    ? "border-ink bg-ink text-background"
                    : "border-border bg-surface text-ink"
                } ${
                  step.current
                    ? "outline outline-4 outline-[color:var(--accent)]"
                    : ""
                }`}
              >
                {index === 0 && reached ? (
                  <Check className="h-5 w-5" aria-hidden />
                ) : (
                  index + 1
                )}
              </span>

              <div className="min-w-0 pt-1">
                <div className="text-base font-semibold leading-6 text-ink">
                  {step.label}
                </div>
                <p className="mt-1 text-sm leading-5 text-ink-muted">
                  {stepCopy(step, index)}
                </p>
                {(step.at || step.current) && (
                  <div
                    className={`mt-2 text-xs font-semibold ${
                      step.current ? "text-ink" : "text-ink-muted"
                    }`}
                  >
                    {step.at ? stampFor(step.at) : "Happening now"}
                  </div>
                )}
                {!step.at && !step.current && !reached && (
                  <div className="mt-2 text-xs text-ink-muted">Waiting</div>
                )}
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
