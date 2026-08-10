import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/PolicyPage";
import { useCatalog } from "@/lib/catalog-context";

export const Route = createFileRoute("/refunds")({
  component: Refunds,
  head: () => ({
    meta: [
      { title: "Refund Policy — Cliffs of Puff" },
      { name: "description", content: "When and how Cliffs of Puff issues refunds." },
    ],
  }),
});

function Refunds() {
  const { settings } = useCatalog();
  return (
    <PolicyPage eyebrow="Support" title="Refund Policy" content={settings.policies.refunds} />
  );
}
