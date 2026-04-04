# The Van Guide

Astro-based content hub and van builder directory.
Live at [thevanguide.com](https://thevanguide.com).

---

## Tech Stack

- **Framework:** Astro 5 (static output)
- **Styling:** Tailwind CSS 4
- **Hosting:** Cloudflare Pages
- **Deploy:** `wrangler pages deploy` via Keychain-stored API token

## Local Development

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # build to dist/
npm run preview   # preview built site
```

## Deployment

This project deploys to Cloudflare Pages using an API token stored in macOS Keychain — **not** via `wrangler login`. This keeps The Van Guide's Cloudflare account completely isolated from other projects on the same machine (e.g. ECB).

### One-time setup

1. **Create a Cloudflare API token** in the TVG Cloudflare account:
   - https://dash.cloudflare.com/profile/api-tokens
   - Click "Create Token" → use the "Edit Cloudflare Workers" template
     (or create a custom token with: `Account: Cloudflare Pages:Edit`, `Account: Account Settings:Read`, `User: User Details:Read`)
   - Copy the token (you'll only see it once)

2. **Find your Account ID:**
   - Cloudflare dashboard → right sidebar → "Account ID"

3. **Save both to macOS Keychain:**
   ```bash
   security add-generic-password -a "$USER" -s "tvg-cf-token" -w "YOUR_TOKEN_HERE"
   security add-generic-password -a "$USER" -s "tvg-cf-account-id" -w "YOUR_ACCOUNT_ID_HERE"
   ```

4. **Verify:**
   ```bash
   security find-generic-password -a "$USER" -s "tvg-cf-token" -w
   security find-generic-password -a "$USER" -s "tvg-cf-account-id" -w
   ```

### Deploying

```bash
npm run deploy
```

That's it. The `deploy.sh` script pulls credentials from Keychain, builds the site, and pushes to Cloudflare Pages.

### Custom domain

After the first deploy creates the `thevanguide` Pages project, connect the custom domain in the Cloudflare dashboard:
1. Pages → `thevanguide` project → Custom domains → Set up a custom domain
2. Enter `thevanguide.com`
3. Cloudflare auto-creates the DNS records (since the domain is in the same account)

## Project Structure

```
tvg-site/
├── astro.config.mjs
├── package.json
├── tsconfig.json
├── public/              # static assets (robots.txt, favicon, etc.)
├── src/
│   ├── layouts/         # Astro layout components
│   ├── pages/           # Astro route pages
│   └── styles/          # Tailwind + global CSS
└── scripts/
    └── deploy.sh        # Keychain → wrangler deploy wrapper
```

## Identity Separation Notes

- Git config is set per-repo to `The Van Guide <hello@thevanguide.com>` — no ECB email in commit history.
- Cloudflare credentials live in a separate Keychain entry (`tvg-cf-*`) distinct from any ECB credentials.
- Do not push to the ECB GitHub account. This repo belongs to a separate GitHub account/org.
- Robots.txt currently blocks all crawlers. Remove the block before launch.

## Roadmap

- [x] Phase 0: Foundation, domain, coming-soon page
- [ ] Phase 1: Data collection (Frey playbook — see `/Strategy & Planning/Future Projects/Van Builder Directory/`)
- [ ] Phase 2: Directory MVP build (builder profile pages, state landing pages, filters)
- [ ] Phase 3: Launch + builder outreach
- [ ] Phase 4: Content + authority building
- [ ] Phase 5: Monetization
