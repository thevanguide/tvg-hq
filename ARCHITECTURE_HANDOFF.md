# The Van Guide — Website Architecture Handoff

**Purpose:** Context dump for a Claude session building out the TVG site architecture. Another session is handling insurance content + scraping builder data. This session's job is **site structure, design system, and technical foundation**.

---

## Project Overview

**Domain:** thevanguide.com (live with coming-soon page on Cloudflare Pages)
**Repo:** https://github.com/thevanguide/tvg-hq
**Local path:** `/Users/andrewunderhill/My Drive/tvg-hq/`
**Owner:** Andrew Underhill (also owns Emery Custom Builds — TVG is intentionally identity-separated from ECB)

**What TVG is:** A neutral editorial hub for van conversion owners and shoppers. Three pillars:
1. **Van builder directory** — massive database (100s–1000s of US van conversion shops), searchable, filterable, with profile pages
2. **Insurance & registration content** — blog posts, paid guide ($29), interactive tools (Van Insurance Finder)
3. **Future expansion** — cost guides, parts comparisons, campground directory, etc.

**Critical positioning:** TVG is a neutral resource, NOT a builder's site. It must feel editorial/authoritative, not like a business trying to sell you something. ECB is listed in the directory like any other builder — no visible connection from the site itself.

---

## Tech Stack (Already Decided)

- **Framework:** Astro 5 (static output) — already installed
- **Styling:** Tailwind CSS 4 — already installed
- **Hosting:** Cloudflare Pages — already wired up via `scripts/deploy.sh` (pulls credentials from macOS Keychain: `tvg-cf-token`, `tvg-cf-account-id`)
- **Database:** **Supabase** (Postgres + auto REST API + full-text search + storage). Not yet set up — needs new account for identity separation.
- **Interactivity:** React islands via `@astrojs/react` — not yet installed
- **Sitemap:** `@astrojs/sitemap` — already installed

**Why Supabase:** The other session is scraping builders into a database. Astro will pull from Supabase at build time to generate static builder profile pages (fast + SEO-friendly). Search/filter UI is a client-side React island hitting Supabase's REST API directly. Free tier handles thousands of listings.

---

## Current Repo State

```
tvg-hq/
├── astro.config.mjs       # Astro 5, static output, sitemap, Tailwind, sharp
├── package.json            # Basic setup, no React yet, no Supabase yet
├── tsconfig.json
├── public/
│   └── robots.txt          # Currently BLOCKS all crawlers (remove before launch)
├── src/
│   ├── layouts/
│   │   └── BaseLayout.astro
│   ├── pages/
│   │   └── index.astro     # Coming soon page
│   └── styles/
│       └── global.css
└── scripts/
    └── deploy.sh
```

**Identity separation already in place:**
- Git config is per-repo (`The Van Guide <hello@thevanguide.com>`)
- Cloudflare credentials in separate Keychain entries (`tvg-cf-*`)
- Separate GitHub account/org
- DO NOT push to ECB GitHub, DO NOT use ECB email, DO NOT cross-reference ECB in code/content

---

## What This Session Needs to Build

### 1. Brand Identity (NOT ECB)

TVG needs its own visual identity. **It must NOT look like ECB.** ECB uses gold (#DCA54A) + dark navy (#0F172A) + cream (#FAF5E5) + Montserrat/Poppins/Noto Sans. TVG should feel completely distinct — more editorial, more neutral, more "trusted resource" than "custom shop."

**Direction suggestions for TVG (pick one or propose alternatives):**
- **Editorial clean:** Deep charcoal + a single accent color (muted orange, clay, or sage) + serif display font (like Fraunces or Source Serif) paired with a clean sans (Inter)
- **Modern magazine:** Off-white background, blackish text, vibrant accent (rust or forest), serif headlines
- **Outdoor/utilitarian:** Warm neutral palette (sand, slate, terracotta) with a functional sans throughout (Inter or Geist)

Deliverable: a brand token file (CSS variables in `global.css` or a `tokens.css`) with colors, fonts, spacing, border radius, shadow scale. Should feel distinct from ECB at a glance.

### 2. Site Information Architecture

Recommended URL structure:

```
/                                    → Homepage
/builders/                           → Directory landing + search/filter
/builders/[state]/                   → State-level directory (e.g., /builders/california/)
/builders/[state]/[builder-slug]/    → Individual builder profile
/insurance/                          → Insurance content hub
/insurance/[article-slug]/           → Individual insurance articles
/registration/                       → Registration/titling content hub
/registration/[state]/               → State-specific registration guides
/tools/                              → Interactive tools landing
/tools/van-insurance-finder/         → Van Insurance Finder tool
/guide/                              → Paid guide landing/checkout
/blog/                               → Broader blog
/about/                              → About the site (neutral editorial voice)
/contact/
```

Trailing slashes are ON (already configured in astro.config.mjs).

### 3. Core Layouts & Components to Build

**Layouts:**
- `BaseLayout.astro` — exists, needs proper nav/footer/meta
- `ArticleLayout.astro` — for blog/insurance/registration content (typography-focused reading experience)
- `DirectoryLayout.astro` — for builder pages
- `ToolLayout.astro` — minimal chrome for interactive tools

**Components:**
- `SiteHeader.astro` — nav with Builders, Insurance, Tools, Guide links
- `SiteFooter.astro` — simple footer, no ECB reference
- `BuilderCard.astro` — preview card for directory listings
- `ArticleCard.astro` — preview card for blog/content
- `CalloutBox.astro` — tips/warnings in articles
- `EmailCapture.astro` — reusable lead magnet form (connects to Supabase or ConvertKit/Mailchimp later)

**Content collections (Astro content collections):**
- `src/content/insurance/` — insurance articles (MDX)
- `src/content/registration/` — registration guides (MDX)
- `src/content/blog/` — broader blog (MDX)

Set up Zod schemas for frontmatter (title, description, publishDate, updatedDate, author, slug, ogImage, keywords, etc.).

### 4. Supabase Integration

**Not yet set up.** Needs:
1. New Supabase account (separate from any ECB Supabase if one exists) — identity separation matters
2. Create `tvg-production` project
3. Schema for builders table (the other session will define fields based on scraping, but at minimum: id, name, slug, state, city, website, platforms[], services[], price_tier, year_founded, description, logo_url, gallery_urls[], claimed, verified, created_at, updated_at)
4. Set up Astro to query Supabase at build time via `@supabase/supabase-js` using anon key (read-only public data) and generate static builder pages
5. Store Supabase URL + anon key in `.env` (already gitignored) and document in README

**Important:** The other session is building the scraper and will populate the DB. This session just needs to set up the schema + Astro integration so the directory pages can be generated once data exists.

### 5. React Islands Setup

Install `@astrojs/react` and configure it so interactive components can be dropped into `.astro` pages with `client:load` / `client:visible` directives. Only used for:
- Directory search/filter UI
- Van Insurance Finder (the other session will build this content/logic, but the island scaffold should exist)
- Any future calculators

Keep the rest of the site pure Astro (no JS shipped).

### 6. SEO Foundation

- Meta tag system in BaseLayout (title, description, og, twitter card, canonical)
- `@astrojs/sitemap` is installed — configure to exclude drafts
- Structured data (JSON-LD) for articles (Article schema) and builder profiles (LocalBusiness schema)
- Robots.txt — **currently blocks everything, needs to be updated before content launches** (leave blocked for now if site not ready for indexing)
- Open Graph image generation — consider `satori` or `astro-og-canvas` for auto-generating social preview images per page

### 7. Homepage

Should clearly communicate the three pillars without feeling like a landing page:
- Hero: short editorial tagline, not marketing copy
- "Find a builder" — directory entry point with state picker or search
- "Insurance & registration" — content hub entry point
- "Tools" — interactive tools preview
- Recent articles
- Footer with About link (editorial positioning)

---

## What This Session Should NOT Do

- **Do not write insurance content** — another session is doing that
- **Do not build the scraper or populate builder data** — another session is doing that
- **Do not reference ECB anywhere** in code, content, comments, or commits
- **Do not use ECB brand colors/fonts** — TVG has its own identity
- **Do not push to ECB GitHub** — different account entirely
- **Do not launch / remove robots.txt block** until content is ready

---

## Order of Operations

1. **Install dependencies:** `@astrojs/react`, `react`, `react-dom`, `@supabase/supabase-js`, `@astrojs/mdx`
2. **Propose brand identity** (colors, fonts, 3 directions to pick from) — wait for Andrew to choose
3. **Build design token system** in CSS (variables in global.css)
4. **Build core layouts + components** (SiteHeader, SiteFooter, BaseLayout updates, ArticleLayout, BuilderCard, ArticleCard, CalloutBox)
5. **Set up content collections** with Zod schemas
6. **Scaffold placeholder pages** for all main routes (even if empty) so navigation works
7. **Set up Supabase project + schema + Astro integration** (requires Andrew to create account)
8. **Build homepage** (real version, not coming-soon)
9. **Build directory landing page** (with placeholder data until scraper runs)
10. **Build article template pages** (ready for content session to drop MDX files in)
11. **Test full local build + deploy to Cloudflare Pages staging**

---

## Key Context Files (Read These First)

- `README.md` in repo — deployment instructions, identity separation rules, roadmap
- `astro.config.mjs` — current config
- `/Strategy & Planning/Future Projects/Van Builder Directory/` (outside repo, in Andrew's My Drive) — directory strategy context from Frey playbook
- `/Strategy & Planning/Content-Led SEO/Insurance_Registration_Product_Research_Apr2026.md` — research context for what the insurance session will produce (so the site is structured to host it)

---

## Questions to Ask Andrew Before Coding

1. **Brand direction** — pick from proposed options or propose alternatives
2. **Logo/wordmark** — does he have one in mind or should we do a simple wordmark-only treatment to start?
3. **Supabase account** — create new one under what email? (`hello@thevanguide.com`?)
4. **MDX vs Markdown** — default to MDX since tools/calculators will embed in articles
5. **Analytics** — Cloudflare Web Analytics (already in the CF account) or add Plausible/Fathom?
6. **Email capture** — ConvertKit, Mailchimp, Buttondown, or roll our own via Supabase? (ECB uses Mailchimp — for identity separation, TVG should probably use a different tool)

---

## Non-Negotiables

- **Static output.** Every content page must be pre-rendered at build time. No SSR. SEO depends on this.
- **Identity separation from ECB.** Visual, technical, and editorial.
- **Editorial voice.** TVG is a resource, not a sales funnel. No "we" voice implying a builder. Neutral third-person or second-person ("here's what you need to know").
- **Speed.** Cloudflare Pages + static Astro + minimal JS. Target 95+ Lighthouse across the board.
- **Accessibility.** Semantic HTML, keyboard nav, proper contrast, ARIA where needed.
