import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/PolicyPage";
import { useCatalog } from "@/lib/catalog-context";

export const Route = createFileRoute("/shipping-returns")({
  component: ShippingReturns,
  head: () => ({
    meta: [
      { title: "Shipping & Returns — CliffsOfPuff" },
      {
        name: "description",
        content: "Delivery, shipping and returns information for CliffsOfPuff orders.",
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
