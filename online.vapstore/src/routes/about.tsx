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
        settings.policies.about ||
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."
      }
    />
  );
}
