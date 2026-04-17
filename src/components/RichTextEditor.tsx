import React, { useEffect } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { sanitizeHtml } from "../lib/rich-text";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

/**
 * Minimal rich-text editor for builder descriptions. Emits sanitized HTML on
 * change. StarterKit gives us bold / italic / lists / headings / undo for
 * free; the Link extension adds the link toolbar button with safe rel/target
 * defaults applied downstream via sanitizeHtml.
 */
export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 200,
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        // No code block or horizontal rule — not useful for shop descriptions
        // and would clutter the toolbar.
        codeBlock: false,
        horizontalRule: false,
        blockquote: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ["http", "https", "mailto", "tel"],
        HTMLAttributes: {
          rel: "nofollow noopener ugc",
          target: "_blank",
        },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "tvg-rte-content prose",
        style: `min-height: ${minHeight}px;`,
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // An empty editor emits "<p></p>". Treat that as empty so dirty-checks
      // comparing against "" work the way the rest of the dashboard expects.
      onChange(html === "<p></p>" ? "" : sanitizeHtml(html));
    },
    // Avoid the SSR hydration mismatch warning that TipTap emits by default
    // when React rehydrates a server-rendered shell.
    immediatelyRender: false,
  });

  // Keep the editor in sync when the parent swaps value (e.g. the owner tabs
  // between multiple builder listings). Only update if the incoming HTML
  // actually differs to avoid loops.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = value || "<p></p>";
    if (current !== incoming) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div
        style={{
          minHeight,
          border: "1px solid var(--color-border-strong)",
          borderRadius: "var(--radius-md)",
          background: "#fff",
        }}
      />
    );
  }

  return (
    <div
      style={{
        border: "1px solid var(--color-border-strong)",
        borderRadius: "var(--radius-md)",
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <Toolbar editor={editor} />
      <div className="px-4 pt-3 pb-2" data-placeholder={placeholder}>
        <EditorContent editor={editor} />
      </div>
      <style>{`
        .tvg-rte-content:focus-visible { outline: none; }
        .tvg-rte-content > * { margin: 0 0 0.75em; }
        .tvg-rte-content > *:last-child { margin-bottom: 0; }
        .tvg-rte-content p:empty::before {
          content: attr(data-placeholder);
          color: var(--color-text-subtle, #999);
        }
        .tvg-rte-content ul { list-style: disc; padding-left: 1.5em; }
        .tvg-rte-content ol { list-style: decimal; padding-left: 1.5em; }
        .tvg-rte-content h2 { font-size: 1.25rem; font-weight: 600; }
        .tvg-rte-content h3 { font-size: 1.1rem; font-weight: 600; }
        .tvg-rte-content a { color: var(--color-primary); text-decoration: underline; }
      `}</style>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Toolbar
// -----------------------------------------------------------------------------

interface ToolbarProps {
  editor: Editor;
}

function Toolbar({ editor }: ToolbarProps) {
  return (
    <div
      className="flex flex-wrap gap-0.5 px-2 py-1.5 border-b"
      style={{
        borderColor: "var(--color-border)",
        background: "var(--color-bg-alt)",
      }}
    >
      <TBtn
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        label="Bold"
      >
        <strong>B</strong>
      </TBtn>
      <TBtn
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        label="Italic"
      >
        <em>I</em>
      </TBtn>
      <Divider />
      <TBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
        label="Heading"
      >
        H
      </TBtn>
      <TBtn
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        label="Bulleted list"
      >
        •≡
      </TBtn>
      <TBtn
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        label="Numbered list"
      >
        1.
      </TBtn>
      <Divider />
      <LinkButton editor={editor} />
      <Divider />
      <TBtn
        onClick={() => editor.chain().focus().undo().run()}
        active={false}
        label="Undo"
        disabled={!editor.can().undo()}
      >
        ↶
      </TBtn>
      <TBtn
        onClick={() => editor.chain().focus().redo().run()}
        active={false}
        label="Redo"
        disabled={!editor.can().redo()}
      >
        ↷
      </TBtn>
    </div>
  );
}

function Divider() {
  return (
    <div
      className="mx-1 self-stretch"
      style={{ width: 1, background: "var(--color-border)" }}
      aria-hidden="true"
    />
  );
}

interface TBtnProps {
  onClick: () => void;
  active: boolean;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}

function TBtn({ onClick, active, label, disabled, children }: TBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className="px-2 py-1 font-sans-ui text-sm rounded transition-colors"
      style={{
        minWidth: 28,
        background: active ? "var(--color-surface)" : "transparent",
        color: disabled
          ? "var(--color-text-subtle, #aaa)"
          : active
            ? "var(--color-text)"
            : "var(--color-text-muted)",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function LinkButton({ editor }: ToolbarProps) {
  function handleClick() {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return; // cancelled
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url })
      .run();
  }

  return (
    <TBtn
      onClick={handleClick}
      active={editor.isActive("link")}
      label="Link"
    >
      🔗
    </TBtn>
  );
}
