import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/PolicyPage";
import { useCatalog } from "@/lib/catalog-context";

export const Route = createFileRoute("/privacy")({
  component: Privacy,
  head: () => ({
    meta: [
      { title: "Privacy Policy — CliffsOfPuff" },
      { name: "description", content: "How CliffsOfPuff collects and uses your personal data." },
    ],
  }),
});

function Privacy() {
  const { settings } = useCatalog();
  return (
    <PolicyPage eyebrow="Legal" title="Privacy Policy" content={settings.policies.privacy} />
  );
}
