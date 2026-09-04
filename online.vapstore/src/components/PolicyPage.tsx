import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { RichText } from "@/components/RichText";
import { looksLikeHtml } from "@/lib/rich-text";

/* Renders the shop's own policy text, edited from the admin "Online store →
 * Settings" tab.
 *
 * There are two shapes to deal with, and both are live:
 *
 *   1. Rich text — HTML from the WYSIWYG editor, sanitised on the server. This
 *      is what a policy becomes once somebody edits it, and it is the only one
 *      that can carry links.
 *   2. Plain text — the original format, where a blank line separated
 *      paragraphs and a line beginning "## " was a section heading. Every shop
 *      that has not touched its policies since is still on this.
 *
 * The second is not converted on the fly. Reinterpreting a shop's legal wording
 * as markup, unasked, is not a call to make on their behalf — the admin editor
 * offers a "Convert" button instead, and until somebody presses it the page
 * renders exactly as it always has. */
function renderPlainPolicy(content: string): ReactNode {
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
  const text = String(content || "");

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
        <div className="max-w-3xl text-[15px]">
          {looksLikeHtml(text) ? (
            <RichText html={text} />
          ) : (
            renderPlainPolicy(text)
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
