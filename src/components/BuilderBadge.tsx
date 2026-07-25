import React, { useState } from "react";

/**
 * "Listed on The Van Guide" badge embed for claimed builders.
 *
 * Shown in the dashboard so owners can paste the snippet on their own site.
 * The link back to their profile is how the directory earns real citations,
 * so keep the snippet plain HTML that works in any site builder
 * (Squarespace, Wix, WordPress) with no script tags.
 */

const SITE = "https://thevanguide.com";

export default function BuilderBadge({
  profileHref,
  builderName,
}: {
  profileHref: string;
  builderName: string;
}) {
  const [copied, setCopied] = useState(false);

  const profileUrl = `${SITE}${profileHref}?utm_source=badge`;
  const snippet = [
    `<a href="${profileUrl}" title="${builderName} on The Van Guide">`,
    `  <img src="${SITE}/badge/listed-badge.svg" alt="Listed on The Van Guide" width="200" height="56" loading="lazy" style="border:0;" />`,
    `</a>`,
  ].join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can fail in odd webviews; the textarea below is selectable.
    }
  }

  return (
    <div
      className="p-4 sm:p-5 border mb-8"
      style={{
        borderColor: "var(--color-border)",
        borderRadius: "var(--radius-lg)",
        background: "var(--color-surface)",
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <img
          src="/badge/listed-badge.svg"
          alt="Listed on The Van Guide"
          width={200}
          height={56}
          className="shrink-0"
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-sans-ui text-sm font-semibold mb-1">
            Add your badge
          </h3>
          <p className="font-sans-ui text-xs leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
            Paste this on your website to show customers you're listed here.
            It links straight to your profile.
          </p>
        </div>
        <button
          type="button"
          onClick={copy}
          className="btn btn-ghost text-sm shrink-0"
        >
          {copied ? "Copied!" : "Copy embed code"}
        </button>
      </div>
      <textarea
        readOnly
        value={snippet}
        rows={3}
        onFocus={(e) => e.target.select()}
        className="w-full mt-3 px-3 py-2 font-mono text-xs border"
        style={{
          borderColor: "var(--color-border-strong)",
          borderRadius: "var(--radius-md)",
          background: "white",
          color: "var(--color-text-muted)",
        }}
      />
    </div>
  );
}
