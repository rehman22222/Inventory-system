import { createFileRoute } from "@tanstack/react-router";
import { canonicalLink, ogUrlMeta } from "@/lib/seo";
import { PolicyPage } from "@/components/PolicyPage";
import { useCatalog } from "@/lib/catalog-context";

export const Route = createFileRoute("/privacy")({
  component: Privacy,
  head: () => ({
    links: [canonicalLink("/privacy")],
    meta: [
      ogUrlMeta("/privacy"),
      { title: "Privacy Policy — Cliffs of Puff" },
      { name: "description", content: "How Cliffs of Puff collects and uses your personal data." },
    ],
  }),
});

function Privacy() {
  const { settings } = useCatalog();
  return (
    <PolicyPage eyebrow="Legal" title="Privacy Policy" content={settings.policies.privacy} />
  );
}
