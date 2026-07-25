#!/usr/bin/env node
/**
 * Sitemap prune — removes thin directory city pages from dist/sitemap-0.xml
 * after the Astro build.
 *
 * Why: 779 of 896 sitemap URLs are the builders directory, and ~250 of those
 * are city pages with little unique content. With DR 0, spreading Google's
 * crawl attention across them starves the pages that can actually rank
 * (state hubs, profiles, insurance/registration content). City pages stay
 * live and internally linked — they just aren't advertised in the sitemap.
 *
 * City URLs (/builders/{state}/{city}/) and profile URLs
 * (/builders/{state}/{slug}/) share a URL shape, so membership is computed
 * from the same Supabase data the city pages are built from, using the same
 * slug rules as src/lib/supabase.ts (lowercase, spaces to hyphens).
 *
 * Fails open: if Supabase is unreachable, the sitemap is left untouched and
 * the build succeeds (a fat sitemap beats a broken deploy).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SITEMAP = fileURLToPath(new URL("../dist/sitemap-0.xml", import.meta.url));

// Match src/lib/supabase.ts stateToSlug/cityToSlug
const toSlug = (s) => s.toLowerCase().replace(/\s+/g, "-");

// DB stores state codes; URLs use full names (see stateCodeToName in
// src/lib/supabase.ts). Same mapping, inlined for a dependency-free script.
const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin",
  WY: "Wyoming", DC: "District of Columbia",
};

function loadEnv() {
  const envPath = fileURLToPath(new URL("../.env", import.meta.url));
  const env = { ...process.env };
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2];
    }
  }
  return env;
}

async function cityPaths() {
  const env = loadEnv();
  const url = env.PUBLIC_SUPABASE_URL;
  const key = env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");

  const res = await fetch(
    `${url}/rest/v1/builders?select=state,city&published=eq.true`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) throw new Error(`Supabase query failed: HTTP ${res.status}`);
  const rows = await res.json();

  const paths = new Set();
  for (const { state, city } of rows) {
    if (!state || !city) continue;
    const stateName = STATE_NAMES[state] ?? state;
    paths.add(`/builders/${toSlug(stateName)}/${toSlug(city)}/`);
  }
  return paths;
}

if (!existsSync(SITEMAP)) {
  console.error(`No sitemap at ${SITEMAP} — run after astro build.`);
  process.exit(1);
}

let cities;
try {
  cities = await cityPaths();
} catch (err) {
  console.warn(`prune-sitemap: skipped (${err.message}). Sitemap left untouched.`);
  process.exit(0);
}

const xml = readFileSync(SITEMAP, "utf8");
const entries = xml.match(/<url>.*?<\/url>/gs) ?? [];
const kept = [];
let dropped = 0;

for (const entry of entries) {
  const loc = entry.match(/<loc>([^<]+)<\/loc>/)?.[1] ?? "";
  const path = loc.replace("https://thevanguide.com", "");
  if (cities.has(path)) {
    dropped++;
  } else {
    kept.push(entry);
  }
}

if (dropped === 0) {
  console.log("prune-sitemap: no city URLs found in sitemap (nothing dropped).");
  process.exit(0);
}

const head = xml.slice(0, xml.indexOf("<url>"));
const tail = "</urlset>";
writeFileSync(SITEMAP, head + kept.join("") + tail);
console.log(`prune-sitemap: dropped ${dropped} city URLs, kept ${kept.length}.`);
