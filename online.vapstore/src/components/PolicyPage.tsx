import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

/* Renders the shop's own policy text (edited from the admin "Online store →
 * Settings" tab). The copy is plain text: blank lines separate paragraphs, and a
 * line beginning "## " is a section heading. We do NOT run a full markdown
 * parser — this keeps the admin editor simple and the output predictable. */
function renderPolicy(content: string): ReactNode {
  const blocks = content
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    return (
      <p className="text-ink-muted">
        This policy has not been added yet. Please check back soon or contact us.
      </p>
    );
  }

  return blocks.map((block, index) => {
    if (block.startsWith("## ")) {
      return (
        <h2
          key={index}
          className="mt-10 font-display text-xl sm:text-2xl tracking-tight first:mt-0"
        >
          {block.slice(3).trim()}
        </h2>
      );
    }
    return (
      <p key={index} className="mt-4 whitespace-pre-line leading-relaxed text-ink-muted">
        {block}
      </p>
    );
  });
}

export function PolicyPage({
  eyebrow,
  title,
  content,
}: {
  eyebrow: string;
  title: string;
  content: string;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="border-b hair">
        <div className="container-x py-10 md:py-14">
          <div className="eyebrow">{eyebrow}</div>
          <h1 className="mt-3 font-display text-4xl sm:text-5xl md:text-6xl leading-[0.95] tracking-tight break-words">
            {title}
          </h1>
        </div>
      </section>

      <section className="container-x py-10 md:py-14">
        <div className="max-w-3xl text-[15px]">{renderPolicy(content)}</div>
      </section>

      <Footer />
    </div>
  );
}
