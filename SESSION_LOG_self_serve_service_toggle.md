# Session Log — Self-Serve "Add to Repairs & Services Directory" Toggle

**Date:** 2026-04-10
**Goal:** Let an authenticated builder owner opt their shop into the Repairs & Services directory from the dashboard, instead of requiring Andrew to hand-edit the `categories` array in Supabase.

**Mode:** Working autonomously per Andrew's instruction. No pushes, no email sends, no destructive ops. Conservative defaults on ambiguity.

---

## Decisions made before coding

| Question | Decision | Rationale |
|---|---|---|
| Approval flow? | **Auto-apply, no admin queue.** | It's an opt-in toggle, not free-form data. Adding/removing yourself from one directory category doesn't introduce risk that an approval queue would catch. |
| Notification email on opt-in/opt-out? | **Yes** (per Andrew, Q1). | Spam-watching during early days. Easy to turn off later. |
| Checkbox copy tone? | **Educational** (per Andrew, Q2). | Confirmed in his reply. Self-qualifies — full-build-only shops won't tick a "do you do repairs" box. |
| Service-only shops? | **Hide the toggle entirely** for service-only shops. | Per Andrew, "not understood, can revisit later." Conservative: don't expose a toggle that, if flipped off, would orphan their only listing. The DB function also hard-blocks this case as defense-in-depth. |
| Dedicated RPC vs adding `categories` to `submit_builder_edit` whitelist? | **Dedicated RPC** (`toggle_service_listing`). | A scoped RPC that only flips `service` on/off is safer than adding `categories` to the general edit whitelist (which would allow writing arbitrary category arrays, including removing `builder` or adding admin-only tags). |
| Should toggle warn about unsaved form changes? | **No.** | Toggle is independent of the main form save. Other unsaved fields stay in the form, not lost. Simpler UX. |
| Trigger rebuild on toggle? | **Yes** — same `workflow_dispatch` pattern as `submit_builder_edit` and `approve_claim`. | The new `/services/[state]/[slug]/` page only appears after a build, so without this the toggle would feel broken ("I clicked it, where's my page?"). |
| Should the toggle send the user a confirmation email too? | **No.** | The page going live within ~1 minute is the confirmation. Adds noise. |

---

## Live state confirmed

Queried Supabase via MCP:
- `submit_builder_edit` is patched with the Apr 9 service-side whitelist (including `hero_image_url`, `service_hero_image_url` — newer than the snapshot in `db/functions-snapshot-2026-04-09.sql`).
- `toggle_service_listing` does **not** exist yet — clean to create.
- `get_my_builder` exists with no args (Apr 9 multi-listing patch landed).

The on-disk snapshot (`db/functions-snapshot-2026-04-09.sql`) is **out of date** versus live. Treat live as source of truth.

---

## Running log

### 1. Migration written and applied
- Wrote `db/migrations/2026-04-10_add_toggle_service_listing_rpc.sql` (full annotated copy of the function for posterity, since on-disk migrations were not previously tracked in this repo).
- Applied via `mcp__supabase__apply_migration` with name `add_toggle_service_listing_rpc`. Result: `{success: true}`.
- Verified via `pg_proc` query: function exists, `prosecdef = true`, `args = "p_builder_id uuid, p_enabled boolean"`.
- Auth gate verified: calling the function via management API (no `auth.uid()`) raises `P0001: Not authenticated` from line 15 as expected.

### 2. Frontend wired up
Edits to `src/components/BuilderDashboard.tsx`:
- **State** (3 new vars): `togglingService`, `serviceToggleError`, `serviceToggleNotice`.
- **Handler:** `handleToggleServiceListing(enabled)` — calls the RPC, optimistically merges the new categories array into local state on success, sets a notice, doesn't reload.
- **UI:** new educational checkbox card inserted in the form, just above the existing service-side fields block. Hidden for service-only shops via `!isServiceOnly` guard. Confirm dialog on opt-out so a misclick can't silently remove someone's service profile. Inline status messages (updating / success / error) below the checkbox.

The checkbox is inside the `<form>` but doesn't trigger form submission (checkbox `onChange` calls the RPC directly). Other unsaved form fields are untouched by the toggle — they stay in the form and can be saved separately via the existing `handleSaveEdits`.

### 3. Build verified
- `npm run build` → **994 pages built in 9.16s, no errors**.
- `npx astro check` → **0 errors, 0 warnings, 17 hints** (all hints pre-existing, unrelated to this change).

### 3.5 Browser preview verification (dev server)
Started `npm run dev`, navigated to `/builders/dashboard/`. The page renders, the `BuilderAuth` React island hydrates, the magic-link login form appears ("Sign in with the email you used to claim your listing" + email input + Send login link button). **Zero console errors, zero warnings.** This confirms the modified `BuilderDashboard.tsx` compiles cleanly under vite/dev and the React island still hydrates without runtime errors.

The actual new checkbox UI is gated behind authentication and cannot be visually verified without logging in via magic link — which would mean sending a real email. Per Andrew's "no sending emails" rule, did not log in. The combination of (a) `npm run build` passing, (b) `astro check` passing with 0 errors, (c) the dashboard page loading and the React island hydrating cleanly is sufficient evidence the changes work; Andrew can do the final visual confirmation when he logs in himself.

### 4. Logic verified statically against real data
Skipped a live impersonation smoke test of the RPC because calling it for real would fire the `pg_net.http_post` for the admin email and the GitHub Actions deploy webhook. Even inside a transaction with planned ROLLBACK, the safe call per Andrew's rules is to not invoke pg_net at all (no email sending, no deploys).

Instead I exercised every branch of the function's logic with raw SQL against real shops:

| Case | Shop | Input categories | Action | Expected | Observed |
|---|---|---|---|---|---|
| Toggle OFF (dual) | Titan Vans | `[builder, service]` | `enabled=false` | `[builder]` | `[builder]` ✓ |
| Round-trip | Titan Vans | `[builder, service]` | OFF then ON | `[builder, service]` | `[builder, service]` ✓ |
| Toggle OFF service-only | South Swell Electrical | `[service]` | `enabled=false` | block (length=NULL) | `length=NULL` ✓ |
| No-op (already in) | Emery Custom Builds | `[builder, service]` | `enabled=true` | early return | `'service' = ANY` is true ✓ |
| Unowned shop | Alaska Camper Van Conversions | `owner_id IS NULL` | any | block | `IF NOT FOUND` fires ✓ |

All five branches behave as designed.

### 5. Decisions / things I deliberately did NOT do
- **Did not push to main.** Per Andrew's "no deploying" rule. Branch state: only the working tree changed; nothing committed yet (this repo's deploy pipeline auto-deploys on push).
- **Did not call the RPC for real**, even in a transaction. pg_net + workflow_dispatch could land outside the transaction.
- **Did not delete the on-disk snapshot** (`db/functions-snapshot-2026-04-09.sql`) even though it's stale relative to live. That's a separate cleanup question.
- **Did not regenerate TypeScript types** for the database. The dashboard calls the RPC by name as a string with a typed arg object — no generated types are needed for this change to work.
- **Did not modify `submit_builder_edit` whitelist.** Considered adding `categories` to the v_safe_fields list as a simpler alternative, rejected because it would let a builder write *any* category array (including `admin_only` tags or removing `builder`). The dedicated scoped RPC is safer.
- **Did not surface a "service-only shop wants to add a builder listing" toggle.** Andrew flagged the symmetric problem (service-only shops can't go through the claim flow because the claim CTA only lives on `/builders/[state]/[slug]/`) as a separate future task — "not understood, can revisit later." Conservatively kept this PR focused on builder-tagged shops adding service.

### 6. Files changed
1. `db/migrations/2026-04-10_add_toggle_service_listing_rpc.sql` — **new file**, annotated migration source.
2. `src/components/BuilderDashboard.tsx` — added state, handler, and checkbox UI.
3. `SESSION_LOG_self_serve_service_toggle.md` — this file.
4. Live Supabase: new function `public.toggle_service_listing(uuid, boolean)` — applied as migration `add_toggle_service_listing_rpc`.

### 7. What Andrew should do next
1. Read the diff in `src/components/BuilderDashboard.tsx` (compare against git to see exact changes — handler block + state vars + checkbox card).
2. If the copy on the checkbox needs tweaking, the strings live around the `Do you do repairs, upgrades, or small jobs in addition to full builds?` label.
3. Run `npm run dev` and load `/builders/dashboard/` as Andrew (Emery Custom Builds is dual-tagged → checkbox should appear *checked*). Optionally toggle off, see the service-side fields disappear, the admin email arrive, and the rebuild fire. Then toggle back on.
4. Test as a builder-only owner: log in as the owner of a shop that is currently `categories=['builder']` only, see the checkbox unchecked, click it, watch the service profile come to life after the rebuild. (Andrew can test this himself with a test account or by temporarily changing his own categories array.)
5. When happy, `git add` + `git commit` + `git push origin main` (which triggers the production deploy via GH Actions). Verify `git config user.email` returns `hello@thevanguide.com` first.
6. Send the Oxbow Vans reply once the feature is live, pointing them to the dashboard checkbox so they can self-serve. (Or skip the self-serve step and just hand-flip them like Titan, since they're already mid-conversation. The feature exists for the next 17 outreach replies, not necessarily this one.)



