import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/PolicyPage";
import { useCatalog } from "@/lib/catalog-context";

export const Route = createFileRoute("/terms")({
  component: Terms,
  head: () => ({
    meta: [
      { title: "Terms & Conditions — CliffsOfPuff" },
      { name: "description", content: "The terms and conditions for shopping at CliffsOfPuff." },
    ],
  }),
});

function Terms() {
  const { settings } = useCatalog();
  return (
    <PolicyPage eyebrow="Legal" title="Terms & Conditions" content={settings.policies.terms} />
  );
}
