import DOMPurify from "isomorphic-dompurify";

/**
 * Helpers for working with user-submitted rich-text descriptions.
 *
 * Descriptions are stored in the existing `description` / `service_description`
 * columns as either legacy plain text (pre-TipTap) or sanitized HTML emitted by
 * the TipTap editor. The helpers here let render paths treat both forms safely.
 */

// Tags the editor toolbar can emit. Kept deliberately small so the markup
// never drifts toward blog-post structure: headings are capped at h2 since a
// profile page already has one h1 and additional deep nesting would break the
// document outline.
const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "a",
];

// Only the attributes links need. Nothing that can carry script URIs — TipTap's
// link extension already validates href schemes but DOMPurify is the second
// wall if the editor is ever bypassed.
const ALLOWED_ATTR = ["href", "rel", "target"];

/**
 * Sanitize HTML from user input for rendering. Strips any tag/attribute not on
 * the allow list, forces safe link rel attributes, and rejects javascript:/data:
 * hrefs via DOMPurify's default URI policy.
 */
export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return "";
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // All user-added links get rel="nofollow noopener ugc". Prevents tab
    // hijacking and keeps SEO juice from flowing to whatever a builder links.
    ADD_ATTR: ["target"],
    FORBID_ATTR: ["style", "class", "onclick", "onload"],
  }).replace(
    /<a\b([^>]*)>/gi,
    (_match, attrs: string) => {
      // Normalize link attributes: force rel + target in a predictable order
      // regardless of what the editor emitted.
      const cleaned = attrs.replace(/\s(rel|target)="[^"]*"/gi, "");
      return `<a${cleaned} rel="nofollow noopener ugc" target="_blank">`;
    },
  );
}

/**
 * Strip all HTML to plain text. Used where rich markup doesn't belong — meta
 * description tags, card previews, JSON-LD, etc.
 */
export function stripHtml(input: string | null | undefined): string {
  if (!input) return "";
  // Sanitize to a tag-less text blob, then collapse any whitespace introduced
  // by block-level elements (each <p> typically becomes a newline).
  const text = DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Does this value look like it already contains HTML markup? Used to route
 * between the two render paths: HTML gets sanitize+innerHTML, plain text gets
 * wrapped in a single <p>.
 */
export function isHtml(input: string | null | undefined): boolean {
  if (!input) return false;
  return /<\/?[a-z][\s\S]*?>/i.test(input);
}

/**
 * Convert any stored value into render-ready HTML. Legacy plain-text entries
 * become a single <p> so the profile page's `prose` container styles it
 * consistently with editor-emitted content.
 */
export function toRenderHtml(input: string | null | undefined): string {
  if (!input) return "";
  if (isHtml(input)) return sanitizeHtml(input);
  // Preserve paragraph breaks in legacy plain text by splitting on blank lines.
  const paragraphs = input
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br />")}</p>`);
  return paragraphs.join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
