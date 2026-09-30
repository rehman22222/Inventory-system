import { createFileRoute } from "@tanstack/react-router";
import { canonicalLink, ogUrlMeta } from "@/lib/seo";
import { PolicyPage } from "@/components/PolicyPage";
import { useCatalog } from "@/lib/catalog-context";

export const Route = createFileRoute("/terms")({
  component: Terms,
  head: () => ({
    links: [canonicalLink("/terms")],
    meta: [
      ogUrlMeta("/terms"),
      { title: "Terms & Conditions — Cliffs of Puff" },
      { name: "description", content: "The terms and conditions for shopping at Cliffs of Puff." },
    ],
  }),
});

function Terms() {
  const { settings } = useCatalog();
  return (
    <PolicyPage eyebrow="Legal" title="Terms & Conditions" content={settings.policies.terms} />
  );
}
