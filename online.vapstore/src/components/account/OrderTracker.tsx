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
      className="overflow-hidden rounded-[14px] border border-[#dfe6f3] bg-white shadow-[0_16px_44px_rgba(45,71,121,0.12)]"
      aria-label="Order tracking"
    >
      <div className="border-b border-[#e5e7eb] bg-[#f3f4f6] px-5 py-3 text-center">
        <div className="font-display text-lg leading-tight tracking-tight text-ink">
          {stepLabel(current) || statusLabel}
        </div>
        <div className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
          Delivery progress
        </div>
      </div>

      <ol className="grid min-w-[680px] grid-cols-4 bg-white px-5 pb-6 pt-5 sm:min-w-0 sm:px-7">
        {steps.map((step, index) => {
          const reached = step.done || step.current || index <= currentIndex;
          const connectorReached =
            index < currentIndex || (index === currentIndex && step.done);
          const Icon = STEP_ICONS[step.status] || PackageCheck;

          return (
            <li
              key={step.status}
              className="relative flex min-w-0 flex-col items-center px-2 text-center"
            >
              {index < steps.length - 1 && (
                <span
                  aria-hidden
                  className={`absolute left-1/2 top-[17px] h-1 w-full ${
                    connectorReached ? "bg-[#75ad5d]" : "bg-[#d7d7d7]"
                  }`}
                />
              )}

              <span
                className={`relative z-10 grid h-9 w-9 place-items-center rounded-full border-2 text-sm font-semibold sm:h-10 sm:w-10 ${
                  reached
                    ? "border-[#75ad5d] bg-[#75ad5d] text-white"
                    : "border-[#d7d7d7] bg-white text-[#9a9a9a]"
                } ${
                  step.current
                    ? "outline outline-4 outline-[rgba(117,173,93,0.2)]"
                    : ""
                }`}
              >
                {reached ? (
                  <Check className="h-5 w-5" aria-hidden />
                ) : (
                  ""
                )}
              </span>

              <div
                className={`mt-4 grid h-12 w-12 place-items-center rounded-md border bg-white ${
                  reached ? "border-[#e5edf5]" : "border-[#ececec] opacity-55"
                }`}
              >
                <Icon
                  className={`h-7 w-7 ${
                    reached ? "text-[#6fa65a]" : "text-[#9a9a9a]"
                  }`}
                  aria-hidden
                />
              </div>

              <div className="mt-3 min-w-0">
                <div
                  className={`text-sm font-bold leading-5 sm:text-[15px] ${
                    reached ? "text-[#6fa65a]" : "text-ink"
                  }`}
                >
                  {stepLabel(step)}
                </div>
                {(step.at || step.current) && (
                  <div className="mx-auto mt-2 max-w-[120px] text-xs leading-5 text-ink-muted">
                    {step.at ? stampFor(step.at) : "Happening now"}
                  </div>
                )}
                {!step.at && !step.current && !reached && (
                  <div className="mx-auto mt-2 max-w-[120px] text-xs leading-5 text-ink-muted">
                    Expected delivery date
                  </div>
                )}
                <p className="mx-auto mt-2 max-w-[132px] text-xs leading-5 text-ink-muted">
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
