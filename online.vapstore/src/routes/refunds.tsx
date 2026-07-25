import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/PolicyPage";
import { useCatalog } from "@/lib/catalog-context";

export const Route = createFileRoute("/refunds")({
  component: Refunds,
  head: () => ({
    meta: [
      { title: "Refund Policy — CliffsOfPuff" },
      { name: "description", content: "When and how CliffsOfPuff issues refunds." },
    ],
  }),
});

function Refunds() {
  const { settings } = useCatalog();
  return (
    <PolicyPage eyebrow="Support" title="Refund Policy" content={settings.policies.refunds} />
  );
}
