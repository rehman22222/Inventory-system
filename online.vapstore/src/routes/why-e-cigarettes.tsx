import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/PolicyPage";
import { useCatalog } from "@/lib/catalog-context";

export const Route = createFileRoute("/why-e-cigarettes")({
  component: WhyECigarettesPage,
  head: () => ({
    meta: [
      { title: "Why e-cigarettes? — Cliffs of Puff" },
      {
        name: "description",
        content: "Information for adult customers about e-cigarettes and Cliffs of Puff.",
      },
    ],
  }),
});

function WhyECigarettesPage() {
  const { settings } = useCatalog();
  return (
    <PolicyPage
      eyebrow="Information"
      title={settings.footer.whyECigarettesTitle || "Why e-cigarettes?"}
      content={settings.footer.whyECigarettesContent}
    />
  );
}
