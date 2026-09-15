/* The WYSIWYG editor used for blog articles and the legal pages.
 *
 * Built on TipTap (ProseMirror). What comes out is HTML, and it is sanitised
 * again on the server before it is stored — see backend/libs/richText.js. The
 * allowlist there is the security boundary; this toolbar is only the set of
 * things somebody can produce comfortably. Anything added here that the server
 * does not allow will simply vanish on save, so the two lists have to be kept
 * in step: headings h2–h4, bold/italic/underline/strike, lists, blockquote,
 * links, images, YouTube/Vimeo embeds, tables, rules and alignment.
 *
 * Deliberately NOT a controlled component. TipTap owns the document while a
 * person is typing in it; pushing `value` back in on every keystroke fights
 * the editor for the cursor and makes it jump to the end mid-word. Instead the
 * content is set once on mount and thereafter only when `value` changes for a
 * reason that is not our own typing — switching to a different article, or the
 * form being reset — which `syncKey` signals.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Youtube from "@tiptap/extension-youtube";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { TableKit } from "@tiptap/extension-table";
import {
  FiAlignCenter,
  FiAlignLeft,
  FiAlignRight,
  FiBold,
  FiCode,
  FiColumns,
  FiImage,
  FiItalic,
  FiLink,
  FiList,
  FiMinus,
  FiRotateCcw,
  FiRotateCw,
  FiUnderline,
  FiVideo,
  FiX,
} from "react-icons/fi";
import { LuHeading2, LuHeading3, LuHeading4, LuListOrdered, LuQuote, LuStrikethrough } from "react-icons/lu";

/* Accept what the server accepts and nothing more, so a bad link is refused
 * while the author is still looking at it rather than disappearing on save. */
const normaliseHref = (raw) => {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) return value;
  // A site-relative path — /shop, /blog/foo. The negative lookahead refuses
  // "//evil.com", which is a protocol-relative URL wearing a path's clothes.
  if (/^\/(?!\/)/.test(value)) return value;
  /* Bare email and phone, because that is what people actually type when they
   * are linking "email us at info@shop.ie". Refusing those and waiting for
   * somebody to know they owed us a "mailto:" is the editor being pedantic at
   * the author's expense — every other editor infers this. Checked before the
   * domain rule below, since an address contains a domain. */
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  // +353 87 123 4567, 087-1234567 — digits with the usual separators.
  if (/^\+?[\d][\d\s().-]{6,}$/.test(value)) return `tel:${value.replace(/[\s().-]/g, "")}`;
  // Bare domains too. Assume https rather than rejecting them; anything with a
  // scheme we do not allow falls through.
  if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(value)) return `https://${value}`;
  return "";
};

const ToolbarButton = ({ onClick, active, disabled, title, children }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    aria-pressed={Boolean(active)}
    disabled={disabled}
    onClick={onClick}
    className={`btn btn-xs gap-1 border-none ${
      active ? "btn-primary" : "btn-ghost"
    } ${disabled ? "opacity-40" : ""}`}
  >
    {children}
  </button>
);

const Divider = () => <span className="mx-1 h-5 w-px shrink-0 bg-base-300" aria-hidden="true" />;

export default function RichTextEditor({
  value = "",
  onChange,
  onUploadImage,
  placeholder = "Write your article…",
  syncKey = "",
  minHeight = 420,
  disabled = false,
}) {
  const [linkDraft, setLinkDraft] = useState(null);
  const [showSource, setShowSource] = useState(false);
  const [sourceDraft, setSourceDraft] = useState("");
  const fileInputRef = useRef(null);
  // Guards the effect below: without it, setContent triggers onUpdate, which
  // calls onChange, which changes `value`, which re-runs the effect.
  const applyingExternal = useRef(false);

  const editor = useEditor({
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        // Matches the server: relative, http(s), mailto and tel.
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ["http", "https", "mailto", "tel"],
          HTMLAttributes: { rel: "noopener noreferrer" },
        },
        // The server strips <pre>-with-language and code blocks are not
        // something a shop's blog needs; inline <code> stays.
        codeBlock: false,
      }),
      Image.configure({ inline: false, allowBase64: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Youtube.configure({
        nocookie: true,
        controls: true,
        modestBranding: true,
        width: 640,
        height: 360,
      }),
      Placeholder.configure({ placeholder }),
      CharacterCount.configure({ limit: 200000 }),
      TableKit.configure({ table: { resizable: true } }),
    ],
    content: value || "",
    onUpdate: ({ editor: instance }) => {
      if (applyingExternal.current) return;
      onChange?.(instance.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose-editor focus:outline-none",
        style: `min-height:${minHeight}px`,
      },
    },
    // The editor is mounted inside a React 19 tree; TipTap needs telling not to
    // render immediately so SSR/strict-mode double-invocation stays quiet.
    immediatelyRender: false,
  });

  /* Pull an external change in — a different article opened, or the form
   * reset. Keyed on syncKey rather than on `value` so ordinary typing (which
   * also changes `value`) does not reach in and reset the cursor. */
  useEffect(() => {
    if (!editor) return;
    applyingExternal.current = true;
    editor.commands.setContent(value || "", { emitUpdate: false });
    applyingExternal.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, syncKey]);

  useEffect(() => {
    if (editor) editor.setEditable(!disabled);
  }, [editor, disabled]);

  const openLinkEditor = useCallback(() => {
    if (!editor) return;
    setLinkDraft({
      href: editor.getAttributes("link").href || "",
      // Remember what was selected: the selection is lost once focus moves to
      // the popover's input, so the command has to be replayed against the
      // stored range when the author confirms.
      from: editor.state.selection.from,
      to: editor.state.selection.to,
      hadText: !editor.state.selection.empty,
    });
  }, [editor]);

  const applyLink = useCallback(
    (event) => {
      event.preventDefault();
      if (!editor || !linkDraft) return;
      const href = normaliseHref(linkDraft.href);
      if (!href) return;

      const chain = editor.chain().focus().setTextSelection({ from: linkDraft.from, to: linkDraft.to });
      if (linkDraft.hadText) {
        chain.setLink({ href }).run();
      } else {
        // Nothing was selected, so there is no text to turn into a link.
        // Insert the URL as its own text and link that, which is what every
        // other editor does and what an author expects.
        chain.insertContent(`<a href="${href}">${href}</a>`).run();
      }
      setLinkDraft(null);
    },
    [editor, linkDraft],
  );

  const removeLink = useCallback(() => {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkDraft(null);
  }, [editor]);

  const insertImage = useCallback(
    async (files) => {
      if (!editor || !files?.length || !onUploadImage) return;
      const url = await onUploadImage(files);
      if (!url) return;
      const alt = window.prompt(
        "Describe this image for screen readers and search engines (recommended):",
        "",
      );
      const { to } = editor.state.selection;
      editor
        .chain()
        .focus()
        .setTextSelection(to)
        .insertContent({
          type: "image",
          attrs: { src: url, alt: alt || "" },
        })
        .run();
    },
    [editor, onUploadImage],
  );

  const insertVideo = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Paste a YouTube or Vimeo link:", "");
    if (!url) return;
    // Vimeo is allowed by the server but TipTap's Youtube extension only knows
    // YouTube, so a Vimeo link is inserted as its own iframe.
    const vimeo = url.match(/vimeo\.com\/(\d+)/i);
    if (vimeo) {
      editor
        .chain()
        .focus()
        .insertContent(
          `<iframe src="https://player.vimeo.com/video/${vimeo[1]}" allowfullscreen loading="lazy"></iframe>`,
        )
        .run();
      return;
    }
    editor.commands.setYoutubeVideo({ src: url });
  }, [editor]);

  const openSource = useCallback(() => {
    if (!editor) return;
    setSourceDraft(editor.getHTML());
    setShowSource(true);
  }, [editor]);

  const applySource = useCallback(() => {
    if (!editor) return;
    applyingExternal.current = true;
    editor.commands.setContent(sourceDraft, { emitUpdate: false });
    applyingExternal.current = false;
    onChange?.(editor.getHTML());
    setShowSource(false);
  }, [editor, sourceDraft, onChange]);

  if (!editor) {
    return (
      <div
        className="grid place-items-center rounded-lg border border-base-300 bg-base-200/40"
        style={{ minHeight }}
      >
        <span className="loading loading-spinner loading-md text-primary" />
      </div>
    );
  }

  const words = editor.storage.characterCount.words();
  const characters = editor.storage.characterCount.characters();

  return (
    <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-0.5 border-b border-base-300 bg-base-200/80 p-1.5 backdrop-blur">
        <ToolbarButton title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
          <FiRotateCcw />
        </ToolbarButton>
        <ToolbarButton title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
          <FiRotateCw />
        </ToolbarButton>

        <Divider />

        <ToolbarButton title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <FiBold />
        </ToolbarButton>
        <ToolbarButton title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <FiItalic />
        </ToolbarButton>
        <ToolbarButton title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <FiUnderline />
        </ToolbarButton>
        <ToolbarButton title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <LuStrikethrough />
        </ToolbarButton>
        <ToolbarButton title="Inline code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
          <FiCode />
        </ToolbarButton>

        <Divider />

        {/* h1 is the article title, rendered by the page itself — an author who
            adds another one puts two competing top-level headings on the page,
            which is a real SEO fault. So the editor starts at h2. */}
        <ToolbarButton title="Section heading (H2)" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <LuHeading2 />
        </ToolbarButton>
        <ToolbarButton title="Subheading (H3)" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <LuHeading3 />
        </ToolbarButton>
        <ToolbarButton title="Minor heading (H4)" active={editor.isActive("heading", { level: 4 })} onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}>
          <LuHeading4 />
        </ToolbarButton>

        <Divider />

        <ToolbarButton title="Bulleted list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <FiList />
        </ToolbarButton>
        <ToolbarButton title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <LuListOrdered />
        </ToolbarButton>
        <ToolbarButton title="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <LuQuote />
        </ToolbarButton>
        <ToolbarButton title="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <FiMinus />
        </ToolbarButton>

        <Divider />

        <ToolbarButton title="Align left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
          <FiAlignLeft />
        </ToolbarButton>
        <ToolbarButton title="Align centre" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
          <FiAlignCenter />
        </ToolbarButton>
        <ToolbarButton title="Align right" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
          <FiAlignRight />
        </ToolbarButton>

        <Divider />

        <ToolbarButton title="Insert or edit link" active={editor.isActive("link")} onClick={openLinkEditor}>
          <FiLink />
        </ToolbarButton>
        {onUploadImage && (
          <ToolbarButton title="Insert image" onClick={() => fileInputRef.current?.click()}>
            <FiImage />
          </ToolbarButton>
        )}
        <ToolbarButton title="Embed a YouTube or Vimeo video" onClick={insertVideo}>
          <FiVideo />
        </ToolbarButton>
        <ToolbarButton
          title="Insert table"
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <FiColumns />
        </ToolbarButton>

        <Divider />

        <ToolbarButton title="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
          <FiX />
        </ToolbarButton>
        <button
          type="button"
          onClick={openSource}
          className="btn btn-ghost btn-xs border-none font-mono text-[10px]"
          title="Edit the underlying HTML"
        >
          HTML
        </button>
      </div>

      {editor.isActive("table") && (
        <div className="flex flex-wrap gap-1 border-b border-base-300 bg-base-200/40 px-2 py-1.5">
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => editor.chain().focus().addColumnAfter().run()}>+ Column</button>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => editor.chain().focus().addRowAfter().run()}>+ Row</button>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => editor.chain().focus().deleteColumn().run()}>− Column</button>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => editor.chain().focus().deleteRow().run()}>− Row</button>
          <button type="button" className="btn btn-ghost btn-xs text-error" onClick={() => editor.chain().focus().deleteTable().run()}>Delete table</button>
        </div>
      )}

      {/* The link popover is a <div>, not a <form>, and every button in it is
          type="button".

          This editor is always rendered INSIDE another form — the article form
          in BlogManager, the settings form on the Online store page. A nested
          <form> is invalid HTML, and worse, React's synthetic submit event
          bubbles up the component tree: pressing Apply fired this handler and
          then the outer form's onSubmit, saving the whole page and throwing the
          author back to the top of the tab. preventDefault() does not stop
          that — only not being a form does. */}
      {linkDraft && (
        <div className="border-b border-base-300 bg-base-200/40 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              autoFocus
              className="input input-xs input-bordered min-w-0 flex-1 font-mono"
              placeholder="example.com, /shop, info@shop.ie or 087 123 4567"
              value={linkDraft.href}
              onChange={(event) => setLinkDraft((current) => ({ ...current, href: event.target.value }))}
              onKeyDown={(event) => {
                // Enter still applies the link and Escape still cancels, which
                // is what the form gave us for free before.
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.stopPropagation();
                  applyLink(event);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setLinkDraft(null);
                }
              }}
            />
            <button
              type="button"
              className="btn btn-primary btn-xs"
              disabled={!normaliseHref(linkDraft.href)}
              onClick={applyLink}
            >
              Apply
            </button>
            {editor.isActive("link") && (
              <button type="button" className="btn btn-ghost btn-xs text-error" onClick={removeLink}>
                Remove link
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setLinkDraft(null)}>
              Cancel
            </button>
          </div>
          {/* An email typed on its own becomes a mailto:, a phone number a
              tel:, a bare domain an https:. Show the result rather than doing
              it silently — the author should see what is about to be saved. */}
          {linkDraft.href.trim() && (
            <p className="mt-1.5 font-mono text-[10px] text-base-content/50">
              {normaliseHref(linkDraft.href) ? (
                <>
                  Links to <span className="text-success">{normaliseHref(linkDraft.href)}</span>
                </>
              ) : (
                <span className="text-error">
                  Not a link we can use — try a web address, a page like /shop, an email or a phone number.
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {showSource ? (
        <div className="p-3">
          <textarea
            className="textarea textarea-bordered h-80 w-full font-mono text-xs"
            value={sourceDraft}
            onChange={(event) => setSourceDraft(event.target.value)}
          />
          <p className="mt-2 text-[11px] text-base-content/50">
            Anything the site does not allow is removed when you save — scripts, event handlers
            and links that are not http(s), mailto or tel.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn btn-primary btn-xs" onClick={applySource}>Apply HTML</button>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowSource(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <EditorContent editor={editor} className="px-4 py-3" />
      )}

      <div className="flex items-center justify-between border-t border-base-300 bg-base-200/40 px-3 py-1.5 text-[11px] text-base-content/50">
        <span>
          {words} word{words === 1 ? "" : "s"} · {characters.toLocaleString()} characters
        </span>
        <span>
          about {Math.max(1, Math.round(words / 200))} min read
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          insertImage(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
