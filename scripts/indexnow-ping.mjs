#!/usr/bin/env node
/**
 * IndexNow ping — notifies Bing (and other IndexNow engines) of URLs after a
 * deploy. Google does not use IndexNow; it discovers via the sitemap.
 *
 * Usage:
 *   node scripts/indexnow-ping.mjs --live            # submit all sitemap URLs
 *   node scripts/indexnow-ping.mjs --live url1 url2  # submit specific URLs
 *   node scripts/indexnow-ping.mjs                   # dry run (prints, no ping)
 *
 * Safety: without --live this is a dry run. CI passes --live only in the
 * deploy workflow, after the site is actually deployed.
 *
 * The key file (public/<key>.txt) must be deployed and reachable at
 * https://thevanguide.com/<key>.txt for the submission to be accepted.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SITE = "https://thevanguide.com";
const KEY = "671fe291876f164b4acf0560056fae9b";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const SITEMAP = fileURLToPath(new URL("../dist/sitemap-0.xml", import.meta.url));

const args = process.argv.slice(2);
const live = args.includes("--live");
const explicitUrls = args.filter((a) => a.startsWith("http"));

function sitemapUrls() {
  if (!existsSync(SITEMAP)) {
    console.error(`No sitemap at ${SITEMAP} — run the build first.`);
    process.exit(1);
  }
  const xml = readFileSync(SITEMAP, "utf8");
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

const urls = explicitUrls.length > 0 ? explicitUrls : sitemapUrls();

// IndexNow accepts up to 10,000 URLs per POST; we're far under that.
const body = {
  host: "thevanguide.com",
  key: KEY,
  keyLocation: `${SITE}/${KEY}.txt`,
  urlList: urls,
};

if (!live) {
  console.log(`[dry run] Would submit ${urls.length} URLs to IndexNow.`);
  console.log(`[dry run] First 5: ${urls.slice(0, 5).join(", ")}`);
  process.exit(0);
}

const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});

// 200 = submitted, 202 = key validation pending — both fine.
if (res.status === 200 || res.status === 202) {
  console.log(`IndexNow: submitted ${urls.length} URLs (HTTP ${res.status}).`);
} else {
  console.error(`IndexNow submission failed: HTTP ${res.status} ${await res.text()}`);
  // Non-fatal: indexing pings should never fail a deploy.
  process.exit(0);
}
