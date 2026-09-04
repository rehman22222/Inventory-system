import { hardenRichText } from "@/lib/rich-text";

/**
 * A block of author-written rich text — a blog article, or a legal page.
 *
 * The HTML was sanitised on the server before it was stored
 * (backend/libs/richText.js); `hardenRichText` is a second, deliberately crude
 * pass that is not relied on. See lib/rich-text.ts for why both exist.
 *
 * `.rich-text` in styles.css gives it the article type scale — the
 * storefront's own, not the editor's, so the published page is the one that
 * decides how it looks.
 */
export function RichText({
  html,
  className = "",
}: {
  html: string;
  className?: string;
}) {
  const safe = hardenRichText(html);
  if (!safe.trim()) return null;
  return (
    <div
      className={`rich-text ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
