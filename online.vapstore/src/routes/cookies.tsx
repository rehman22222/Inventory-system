import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/PolicyPage";
import { useCatalog } from "@/lib/catalog-context";

export const Route = createFileRoute("/cookies")({
  component: Cookies,
  head: () => ({
    meta: [
      { title: "Cookie Policy — Cliffs of Puff" },
      { name: "description", content: "How Cliffs of Puff uses cookies and similar technologies." },
    ],
  }),
});

function Cookies() {
  const { settings } = useCatalog();
  return (
    <PolicyPage eyebrow="Legal" title="Cookie Policy" content={settings.policies.cookies} />
  );
}
