import { createFileRoute } from "@tanstack/react-router";
import { canonicalLink, ogUrlMeta } from "@/lib/seo";
import { PolicyPage } from "@/components/PolicyPage";
import { useCatalog } from "@/lib/catalog-context";

export const Route = createFileRoute("/shipping-returns")({
  component: ShippingReturns,
  head: () => ({
    links: [canonicalLink("/shipping-returns")],
    meta: [
      ogUrlMeta("/shipping-returns"),
      { title: "Shipping & Returns — Cliffs of Puff" },
      {
        name: "description",
        content: "Delivery, shipping and returns information for Cliffs of Puff orders.",
      },
    ],
  }),
});

function ShippingReturns() {
  const { settings } = useCatalog();
  return (
    <PolicyPage
      eyebrow="Support"
      title="Shipping & Returns"
      content={settings.policies.shippingReturns}
    />
  );
}
