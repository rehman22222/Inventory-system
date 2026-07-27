import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import type { Category } from "@/lib/catalog";
import { productsByCategory } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";

/* Every tile is the same size — the grid reads as one system rather than one
 * hero item and a set of leftovers. Hierarchy comes from the hover state and
 * the numbering, not from making one cell bigger. */
export function CategoryTile({ category, index }: { category: Category; index: number }) {
  const { products } = useCatalog();
  const count = productsByCategory(products, category.slug).length;
  // A category may have no image (or a dead URL). Rather than the browser's
  // broken-image icon, fall back to a clean lettered placeholder.
  const [imgOk, setImgOk] = useState(Boolean(category.image));

  return (
    <Link
      to="/category/$slug"
      params={{ slug: category.slug }}
      className="group relative flex flex-col border hair bg-surface overflow-hidden transition-colors hover:border-ink"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-background">
        {imgOk ? (
          <img
            src={category.image}
            alt={category.name}
            loading="lazy"
            onError={() => setImgOk(false)}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.06]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface">
            <span className="font-display text-4xl uppercase tracking-tight text-ink-muted/30">
              {category.name.replace(/[^A-Za-z]/g, "").slice(0, 2) || "CP"}
            </span>
          </div>
        )}
        <span className="absolute left-3 top-3 font-mono text-[10px] uppercase tracking-widest bg-background/90 px-2 py-1">
          {String(index).padStart(2, "0")}
        </span>
        <span className="absolute right-3 top-3 font-mono text-[10px] uppercase tracking-widest bg-ink/85 text-primary-foreground px-2 py-1 tabular-nums">
          {count}
        </span>
      </div>

      <div className="flex flex-1 items-center justify-between gap-3 border-t hair p-4">
        <div className="min-w-0">
          <div className="font-display text-base leading-none tracking-tight truncate">
            {category.name}
          </div>
          <div className="mt-1.5 text-xs text-ink-muted truncate">{category.tagline}</div>
        </div>
        <span className="grid h-8 w-8 shrink-0 place-items-center border border-ink transition-colors group-hover:bg-accent group-hover:border-accent">
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}
