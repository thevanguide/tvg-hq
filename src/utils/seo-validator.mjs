// Post-build SEO validator
// Scans dist/**/*.html and flags SEO issues.
//
// BLOCKED (exit 1): missing title, missing meta description,
//   missing image alt text, missing JSON-LD schema
// WARNING (log only): title length, description length,
//   multiple H1s, thin content, few internal links

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const DIST = "dist";
const EXEMPT = ["/builders/admin/", "/builders/dashboard/", "/auth/", "/api/"];

// Programmatic directory pages — still get BLOCKED checks but skip
// content-depth warnings (thin content, internal links) since these
// are generated listing pages, not editorial content.
const DIRECTORY_PREFIXES = ["/builders/", "/services/"];

function walkHtml(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkHtml(full));
    } else if (full.endsWith(".html")) {
      results.push(full);
    }
  }
  return results;
}

function isExempt(filePath) {
  const rel = "/" + relative(DIST, filePath).replace(/\\/g, "/");
  return EXEMPT.some((p) => rel.includes(p));
}

function extractText(html) {
  // Strip tags to get rough word count
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let totalPages = 0;
let totalWarnings = 0;
let totalBlocked = 0;

const files = walkHtml(DIST);

for (const file of files) {
  if (isExempt(file)) continue;
  totalPages++;

  const html = readFileSync(file, "utf-8");
  const rel = relative(DIST, file);
  const relPath = "/" + rel.replace(/\\/g, "/");
  const isDirectory = DIRECTORY_PREFIXES.some((p) => relPath.startsWith(p));
  const blocked = [];
  const warnings = [];

  // --- BLOCKED checks ---

  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const titleText = titleMatch ? titleMatch[1].trim() : "";
  if (!titleText) {
    blocked.push("Missing <title> tag");
  }

  // Meta description
  const descMatch = html.match(
    /<meta\s[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*\/?>/i
  ) || html.match(
    /<meta\s[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*\/?>/i
  );
  const descText = descMatch ? descMatch[1].trim() : "";
  if (!descText) {
    blocked.push("Missing meta description");
  }

  // Image alt text — block images with NO alt attribute at all.
  // Empty alt="" is valid (decorative images per WCAG) so we allow it.
  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
  for (const img of imgTags) {
    if (!/\balt\s*=/i.test(img)) {
      blocked.push(`Image missing alt attribute: ${img.slice(0, 80)}...`);
      break; // One is enough to block
    }
  }

  // JSON-LD schema
  if (!/<script[^>]*type=["']application\/ld\+json["'][^>]*>/i.test(html)) {
    blocked.push("Missing JSON-LD schema");
  }

  // --- WARNING checks ---

  // Title length
  if (titleText && (titleText.length < 50 || titleText.length > 60)) {
    warnings.push(
      `Title length ${titleText.length} chars (ideal 50-60): "${titleText.slice(0, 70)}"`
    );
  }

  // Description length
  if (descText && (descText.length < 120 || descText.length > 155)) {
    warnings.push(
      `Description length ${descText.length} chars (ideal 120-155)`
    );
  }

  // Multiple H1s
  const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
  if (h1Count > 1) {
    warnings.push(`${h1Count} H1 tags found (should be 1)`);
  }

  // Thin content (skip for directory listing pages)
  if (!isDirectory) {
    const bodyMatch = html.match(/<body[\s\S]*?>([\s\S]*)<\/body>/i);
    if (bodyMatch) {
      const words = extractText(bodyMatch[1]).split(/\s+/).filter(Boolean).length;
      if (words < 300) {
        warnings.push(`Thin content: ${words} words (minimum 300)`);
      }
    }
  }

  // Internal links (skip for directory listing pages)
  if (!isDirectory) {
    const internalLinks = (
      html.match(/<a\s[^>]*href=["']\//gi) || []
    ).length;
    if (internalLinks < 2) {
      warnings.push(`Only ${internalLinks} internal links (minimum 2)`);
    }
  }

  // --- Report ---
  if (blocked.length > 0) {
    totalBlocked += blocked.length;
    console.error(`\n❌ BLOCKED — ${rel}`);
    for (const msg of blocked) console.error(`   ${msg}`);
  }

  if (warnings.length > 0) {
    totalWarnings += warnings.length;
    console.warn(`\n⚠️  WARNING — ${rel}`);
    for (const msg of warnings) console.warn(`   ${msg}`);
  }
}

console.log(
  `\n--- SEO Summary: ${totalPages} pages checked, ${totalWarnings} warnings, ${totalBlocked} blocked ---`
);

if (totalBlocked > 0) {
  console.error("\n🚫 Build blocked due to SEO issues above.\n");
  process.exit(1);
}

console.log("✅ All SEO checks passed.\n");
