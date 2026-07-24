import { useCatalog } from "@/lib/catalog-context";
import { brandsOf } from "@/lib/catalog";

export function BrandMarquee() {
  const { products } = useCatalog();
  // The brands the shop actually stocks, taken from what is listed.
  const brands = brandsOf(products);
  if (brands.length === 0) return null;
  // Doubled so the track can loop seamlessly.
  const row = [...brands, ...brands];
  return (
    <section className="border-y hair bg-ink text-primary-foreground overflow-hidden">
      <div className="flex marquee-track whitespace-nowrap py-6">
        {row.map((b, i) => (
          <div key={i} className="flex items-center gap-12 px-8">
            <span className="font-display text-2xl md:text-3xl tracking-tight">{b}</span>
            <span className="text-accent">✦</span>
          </div>
        ))}
      </div>
    </section>
  );
}
