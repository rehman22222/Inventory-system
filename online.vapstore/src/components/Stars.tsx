import { Star } from "lucide-react";

/* A five-star rating. Read-only by default; pass `onChange` to make it an
 * interactive input (used on the review form). `value` may be fractional for
 * display — the fill rounds to the nearest half looks fine at these sizes, so
 * we keep it simple and round to whole stars for the filled state. */
export function Stars({
  value,
  size = 16,
  onChange,
  className = "",
}: {
  value: number;
  size?: number;
  onChange?: (rating: number) => void;
  className?: string;
}) {
  const interactive = typeof onChange === "function";
  return (
    <div className={`inline-flex items-center gap-0.5 ${className}`} role={interactive ? "radiogroup" : undefined}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value);
        const star = (
          <Star
            style={{ width: size, height: size }}
            className={filled ? "fill-current text-amber-500" : "text-ink-muted/40"}
          />
        );
        return interactive ? (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            aria-checked={n === Math.round(value)}
            role="radio"
            onClick={() => onChange!(n)}
            className="p-0.5 transition-transform hover:scale-110"
          >
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </div>
  );
}
