# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                    # install dependencies (only devDependency: wrangler)
npm run dev                    # wrangler dev — serves front + API on http://localhost:8787, D1 emulated locally
npm run db:migrate:local       # apply migrations/*.sql to the local emulated D1 database
npm run db:migrate:remote      # apply migrations/*.sql to the production D1 database
npm run deploy                 # wrangler deploy — publishes the Worker to Cloudflare
```

There is no test suite, linter, or build step by design (see "Deliberate simplicity" below). Verify changes by running `npm run dev` and exercising the app manually, or with `curl` against `/api/*`.

Before the first `npm run dev`, apply the local migration once: `npm run db:migrate:local`.

Before deploying for the first time, `wrangler.toml` needs a real D1 `database_id` (create it with `npx wrangler d1 create coffre-db`, then replace the `REPLACE_WITH_D1_DATABASE_ID` placeholder).

## Architecture

This is "Coffre", a personal single-user inventory app (chests/containers with limited, capacity-constrained slots) built on Cloudflare Workers + D1. Full spec lives in the PRD provided outside this repo.

**One Worker, no framework, no build step.** `worker/index.js` is the entire backend: request router, D1 access, the derived-state reducer, and all business-rule validation, in one file. It serves `/api/*` itself and delegates everything else to `env.ASSETS.fetch(request)` (the static files in `public/`), via the `[assets]` binding in `wrangler.toml`. The front (`public/`) is vanilla HTML/CSS/JS loaded as native ES modules (`<script type="module">`) — no bundler, no TypeScript.

**Event sourcing — there is no `coffres` table.** D1 only stores two tables: `catalogue` (the item types and their max quantity per slot) and `journal` (every operation ever performed, append-only with one exception: rows can be deleted). A chest's current contents are never stored directly — they are always recomputed by replaying the journal in `id` order through `computeCoffres()` in `worker/index.js`. Every route that needs to know a chest's current state (to validate a slot's quantity, block over-capacity, etc.) calls `computeCoffres(await getJournal(db))` first. Deleting a journal row is a legitimate operation that retroactively changes replayed state — this is intentional, not a bug to guard against.

**Server is the sole source of truth for business rules.** All quantity/capacity/uniqueness validation happens in `worker/index.js` route handlers, with the exact user-facing error message returned in the response body (`{ error: "..." }`). The front does only trivial required-field checks before submitting, then displays whatever message the server returns — it does not duplicate the reducer or the validation logic. When changing a business rule, change it in `worker/index.js` only.

**Front-end global-function wiring.** Since there's no framework, generated HTML (list rows, modals) uses inline `onclick="someFunction(...)"` attributes exactly like the original maquette this app was built from. Each `public/js/*.js` module ends with an explicit `window.foo = foo` (or `Object.assign(window, {...})`) for every function referenced from generated markup. When adding a new interactive element, follow this pattern rather than introducing addEventListener-based wiring — the two would silently diverge.

- `public/js/api.js` — thin fetch wrappers for `/api/*`; throws `Error(serverMessage)` on non-2xx so callers can display it directly.
- `public/js/render-*.js` — one per tab (Gestion/Journal/Catalogue), each fetches its own data and renders into its DOM container.
- `public/js/modals.js` — every form/confirmation modal (create/edit chest, add/remove item from a slot, catalogue CRUD). Talks to the API and calls `window.renderAll()` (defined in `app.js`) on success — this is why modals.js does not import the render modules directly, avoiding an import cycle.
- `public/js/app.js` — tab navigation and `renderAll()`, the orchestrator that re-fetches and re-renders all three tabs.

**Locked-in decisions from the PRD's open questions** (do not revisit without an explicit product decision):
- A chest's `nom` (name) is its permanent key, referenced directly by journal rows (`coffre_nom`). Renaming a chest after creation is not supported — the name field is disabled in the edit form.
- Reducing a chest's slot count is blocked if *any* slot at an index beyond the new count is occupied, regardless of its position in the list (`worker/index.js`'s `handleUpdateCoffre`, via `c.slots.slice(nbEmplacements).some(Boolean)`).

**Deliberate simplicity.** Plain JavaScript (no TypeScript), no automated test suite, no CI — a conscious tradeoff for a personal single-user app, made explicitly in favor of scalability/tooling. Don't introduce a bundler, framework, or type system without that decision being revisited first.
