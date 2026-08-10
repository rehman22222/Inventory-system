import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/PolicyPage";
import { useCatalog } from "@/lib/catalog-context";

export const Route = createFileRoute("/about")({
  component: AboutPage,
  head: () => ({
    meta: [
      { title: "About Us — Cliffs of Puff" },
      {
        name: "description",
        content: "Learn more about Cliffs of Puff.",
      },
    ],
  }),
});

function AboutPage() {
  const { settings } = useCatalog();
  return (
    <PolicyPage
      eyebrow="About"
      title="About Us"
      content={
        settings.footer.description ||
        "Cliffs of Puff is an independent, age-restricted vape store focused on authentic products and reliable service."
      }
    />
  );
}
