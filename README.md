# Askly

Askly is a Typeform-style form builder SaaS built on a Turborepo monorepo. Creators design dynamic forms, publish shareable links, collect responses without forcing respondents to sign in, and review analytics in a dedicated dashboard.

> Built for the ChaiForms hackathon. Stack: Turborepo · tRPC · Zod · Drizzle ORM · Scalar · Next.js.

---

## Demo

| | URL |
|---|---|
| Live app | `<<DEPLOYMENT_URL>>` *(set after deploying)* |
| API docs (Scalar) | `<<DEPLOYMENT_API_URL>>/docs` |
| OpenAPI JSON | `<<DEPLOYMENT_API_URL>>/openapi.json` |
| Local web | `http://localhost:3001` |
| Local API + docs | `http://localhost:8000` (`/docs` for Scalar) |

### Demo credentials (no setup required)

The `/dashboard` sign-in pane has a **"Start demo session"** button that provisions a creator account in one click — no password, no OAuth config. It calls `auth.loginAsDemo`, which idempotently logs you into `demo@askly.dev` with pre-seeded forms, responses, and funnel events.

| Field | Value |
|---|---|
| Demo creator | `demo@askly.dev` |
| Demo admin | `admin@askly.dev` (override with `ADMIN_EMAIL` env var; auto-promoted on seed) |
| Sign-in path | **Start demo session** on `/dashboard` (or Google OAuth if env vars set) |

To sign in as the admin during a demo, set `ADMIN_EMAIL` to whatever account you'll OAuth in with; the seed will promote it on the next `pnpm db:seed`.

### Quick tour for judges (15-minute walkthrough)

1. **Landing** → `/` — product overview
2. **Pricing** → `/pricing` — tier matrix with an explicit disclaimer that tier *limits* are illustrative; every feature listed is available to all demo users (no Stripe wiring)
3. **Explore** → `/explore` — public-visibility forms discoverable here
4. **Sign in** → `/dashboard` → click **Start demo session**
5. **Mission deck** → see seeded creator forms. Try **Clone**, **Archive**, **Publish/Unpublish** on a card
6. **Editor** → open any form → field types, validation, **conditional logic** (`Only show when…`), **multi-page breaks**, **theme picker**, **custom slug**, **expiry / response limit**
7. **Preview** → right-side preview pane updates live as you edit
8. **Share** → publish, then use **QR code** button or copy link
9. **Public renderer** → open `/forms/<slug>` in another tab — fill it out as a respondent
10. **Responses** → back in dashboard → paginated inbox → **filter by email** → **CSV export** → click **View** on any response for the per-answer detail drawer
11. **Analytics** → 7-day trend, funnel viz (view → start → submit), completion rate
12. **Admin** (admin role only) → `/admin` — platform-wide metrics, top creators, force-unpublish any form
13. **API docs** → API origin `/docs` — Scalar reference for every tRPC procedure

---

## Architecture

### Apps

- `apps/web` — Next.js 16 frontend (dashboard, explore, public form pages, admin console)
- `apps/api` — Express host for tRPC + OpenAPI/Scalar + Google OAuth callback

### Packages

- `packages/trpc` — API router, auth/session store, submission security, email queue worker
- `packages/database` — Drizzle schema, migrations, idempotent seed (themes + sample forms + responses + admin user)
- `packages/services` — provider integrations (Google OAuth, Resend email)
- `packages/validators` — Zod schemas shared across API + UI (includes `evaluateShowIf` for conditional logic, shared between client renderer and server validator so visibility is computed identically)
- `packages/types` — shared enums (field types, statuses, visibilities, roles)
- `packages/utils` — visibility / acceptance helpers (`canAcceptResponse`)
- `packages/api-client` — typed tRPC client wrapper

### Core stack

- Turborepo (build orchestration)
- pnpm 9 workspaces
- tRPC v11 + `trpc-to-openapi` (auto-generates OpenAPI from tRPC procedures)
- Zod (input + output validation, single source of truth)
- Drizzle ORM + PostgreSQL
- Next.js 16 (App Router, Turbopack)
- Scalar API reference

---

## Features

### Functional requirements (per hackathon spec)

- Creator auth — demo session + Google OAuth (HttpOnly session cookies, no credentials in redirect URL)
- Protected creator dashboard (client gate + Next middleware + server `protectedProcedure` triple-check)
- Form CRUD — create, edit, publish, unpublish, **archive** (reversible)
- Dynamic form schema with per-field validation (min/max, regex, blocked email domains), required/optional flags
- 9 field types — `short_text`, `long_text`, `email`, `number`, `single_select`, `multi_select`, `checkbox`, `rating` (configurable 2–10 scale), `date`
- Two visibility modes
  - `public` — listed on `/explore` and selectable in template galleries
  - `unlisted` — hidden from public listings, link-only access
- Unpublished / archived / expired forms reject submissions at the API layer
- Public submission without login + post-submit confirmation
- Response analytics — view → start → submit funnel, 7-day daily trend, completion + drop-off estimates, totals
- Response management — paginated inbox, filter by respondent email, per-response detail drawer with formatted answers, CSV export
- Email notifications via Resend — queued with **exponential-backoff retry** (up to 5 attempts, 5s worker tick), creator + respondent flows, fails loudly if Resend returns a non-OK status (jobs requeue instead of being marked sent)
- Landing page + pricing page (with honest "hackathon MVP" disclaimer)
- API docs via Scalar at `/docs` (autogenerated from tRPC OpenAPI annotations)
- Seeded demo data — themed sample forms, responses, funnel events, idempotent re-runs
- Zod for input + output validation everywhere
- tRPC end-to-end type safety
- Rate-limit + honeypot + duplicate-submission guard on public submission
  - Rate limit: 5 submissions/IP+slug/min (in-memory; see [Known limitations](#known-limitations))
  - Honeypot: visually-hidden field, rejected server-side if non-empty
  - Duplicate guard: 20s SHA-256 fingerprint window, recorded only after a successful insert so failed retries aren't penalized
- Response-limit enforcement is **race-safe** — count + insert runs inside a Postgres transaction with `SELECT … FOR UPDATE` on the form row

### Non-functional

- Turborepo with proper task graph + caching
- Frontend and backend run as separate apps under one monorepo
- Shared packages for schemas, types, utilities, and the API client
- Type-safe APIs end-to-end (zero `any` in tRPC procedures)
- Clean Drizzle schema with explicit migrations + meta snapshots
- Visibility / acceptance checks centralized in `@repo/utils`
- Loading states, error states, and empty states on every list page
- Next middleware blocks unauthenticated visitors from `/dashboard/forms/*`, `/dashboard/new`, `/dashboard/analytics/*`, and `/admin/*` (see [Auth security model](#auth-security-model))

### Bonus features

| # | Feature | Where |
|---|---|---|
| 1 | Live preview pane while editing | `/dashboard/forms/[id]` right column |
| 2 | **Conditional logic between questions** (`equals`, `not_equals`, `contains`, `is_empty`, `is_not_empty`) | Editor `Only show when…` block; evaluated client-side + server-side via shared `evaluateShowIf` |
| 3 | Form expiry + response limit | Editor advanced settings |
| 4 | CSV export | Responses inbox → Export button |
| 5 | Analytics dashboard with charts | `/dashboard/analytics/[formId]` |
| 6 | Custom form slugs | Form creation page |
| 7 | **QR code sharing** | Share-link bar (dashboard card + editor) |
| 8 | Public explore page | `/explore` |
| 9 | Form templates + theme gallery | `/dashboard/new` (templates from DB), editor theme picker |
| 10 | Response filtering + pagination | Responses inbox |
| 11 | **Form clone + archive** | Dashboard form cards |
| 12 | **Multi-page form experience** | Per-field `Start new page before this field` toggle in editor; renderer groups fields into pages |
| 13 | **Admin dashboard** | `/admin` — platform metrics, top creators table, force-unpublish moderation tool, role-gated by `adminProcedure` (re-checks DB role every request) |
| 14 | Polished UX states (loading skeletons, empty states, error toasts) | Throughout |

### Not implemented

Be upfront so judges aren't surprised:

- **Password-protected forms** — the only bonus feature not implemented. Would be a `passwordHash` column on `forms` + a gate on the public renderer (~1 hour of work).
- **Custom domains, SSO, multi-seat workspaces, webhooks** — listed only as illustrative tier *features* on `/pricing`, but explicitly out of scope for this build (the pricing page carries a disclaimer about this).
- **Production-grade rate limiting** — see [Known limitations](#known-limitations).

---

## Auth security model

Worth being explicit because the OAuth flow has subtleties:

- Session tokens, refresh tokens, and CSRF tokens are issued on login.
  - **Session + refresh:** HttpOnly cookies set on the API origin. Never readable from JS, never put in URLs, never logged in access logs.
  - **CSRF:** Non-HttpOnly cookie (so the SPA can read it on same-origin) **plus** echoed via `auth.getSession` for cross-origin SPAs to stash in localStorage and attach as `x-csrf-token` headers (double-submit pattern).
- OAuth callback redirects to `/dashboard?oauth=success` — **no tokens in the URL**. The dashboard bootstraps by calling `auth.getSession()` over cookies.
- `protectedProcedure` validates the session token (Bearer header OR session cookie).
- `protectedMutationProcedure` additionally enforces double-submit CSRF + origin check.
- `adminProcedure` re-queries the user's `role` from the database on every request — role revocation takes effect immediately, no session re-issue required.
- Next.js middleware (`apps/web/middleware.ts`) gates protected paths server-side based on either the real HttpOnly session cookie (same-origin deploys) or a JS-readable `askly_present` presence hint (cross-origin). The hint is a UX optimization, not a security boundary — the real auth check happens at the tRPC layer.

---

## Local setup

### Prerequisites

- Node.js 20.19+
- pnpm 9+
- PostgreSQL running locally (any 14+)

### 1) Install

```bash
pnpm install
```

### 2) Create the database

```bash
psql -d "postgresql://$USER@localhost:5432/postgres" -c "CREATE DATABASE dev;"
```

### 3) Environment variables

Copy and edit the template at the repo root:

```bash
cp .env.example .env.local
```

Required vars:

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `BASE_URL` | API base URL (default `http://localhost:8000`) |
| `APP_BASE_URL` | Web base URL (default `http://localhost:3001`) |
| `NEXT_PUBLIC_API_URL` | tRPC endpoint the web app calls (default `http://localhost:8000/trpc`) |

Optional vars:

| Var | When you need it |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` / `GOOGLE_OAUTH_REDIRECT_URI` | Only if you want real Google sign-in. Without these, the demo-login button still works. |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Only for live email delivery. Without these, email jobs are queued and silently no-op (no errors). |
| `ADMIN_EMAIL` | Email to promote to admin role on `pnpm db:seed`. Defaults to `admin@askly.dev`. |

All root scripts (`pnpm dev`, `pnpm db:migrate`, `pnpm db:seed`) auto-load `.env.local` via `dotenv -e .env.local`. The file is gitignored.

### 4) Migrate and seed

```bash
pnpm db:migrate
pnpm db:seed
```

Seed is idempotent — re-running tops up missing themes / forms / fields without nuking manually-submitted responses. It also auto-promotes `ADMIN_EMAIL` to admin role.

### 5) Run

```bash
pnpm dev
```

Web on `http://localhost:3001`, API on `http://localhost:8000` (Scalar docs at `/docs`).

### Other commands

```bash
pnpm build            # Production build (web + API)
pnpm check-types      # Whole-monorepo TypeScript check
pnpm lint             # Whole-monorepo ESLint (zero warnings policy)
pnpm db:studio        # Drizzle Studio UI
pnpm db:generate      # Generate a new migration after schema changes
```

---

## API usage

The full API is browseable at `${BASE_URL}/docs` (Scalar). Concrete `curl` examples for the auth flow are in `docs/AUTH_EXAMPLES.md`.

Quick examples:

```bash
# Demo login (no body required)
curl -X POST http://localhost:8000/api/authentication/demo-login \
  -H 'content-type: application/json' -d '{}' -i

# Submit a public form response (no auth required)
curl -X POST http://localhost:8000/api/responses/submit \
  -H 'content-type: application/json' \
  -d '{
    "slug": "gaming-tournament-registration",
    "respondentEmail": "player@example.com",
    "answers": [{"fieldId": "<uuid>", "value": "Player One"}]
  }'

# Track a funnel event (only accepted for published forms)
curl -X POST http://localhost:8000/api/analytics/event \
  -H 'content-type: application/json' \
  -d '{"slug": "gaming-tournament-registration", "eventType": "view", "visitorId": "abc12345"}'
```

---

## Deployment

The app is **not currently hosted** — both `<<DEPLOYMENT_URL>>` placeholders above are unfilled. Step-by-step guide in `docs/DEPLOYMENT.md`. Short version:

- **Web (`apps/web`):** any Next.js host (Vercel recommended). Set `NEXT_PUBLIC_API_URL` to the deployed API URL.
- **API (`apps/api`):** any Node host (Railway / Render / Fly). Set `APP_BASE_URL` to the deployed web URL, `BASE_URL` to itself, plus all OAuth / Resend / DB vars.
- **DB:** any managed Postgres (Neon, Supabase, Railway Postgres). Run `pnpm db:migrate && pnpm db:seed` once.
- **OAuth:** add `${BASE_URL}/auth/google/callback` to the Google Cloud Console's authorized redirect URIs.

CORS is wired for both same-origin and cross-origin deploys.

---

## Known limitations

Honest list — judges will spot these if I don't.

- **Rate limiting is in-memory.** Resets on API restart and isn't shared across replicas. Single-instance deploy: fine. Multi-instance: an attacker can spread requests across replicas to defeat the limit. There's a loud `console.warn` at API boot in production if no shared store is wired up. The store is pluggable via `setSubmissionGuardStore` in `packages/trpc/server/security/submission-guard.ts` — a Redis adapter is a ~30-line drop-in.
- **Password-protected forms — not implemented.** See [Not implemented](#not-implemented).
- **Mobile layouts are not exhaustively tested.** Tailwind responsive classes are in place, but I haven't verified every page at phone widths. The public form renderer, landing, and pricing pages have been spot-checked; the editor is desktop-first.
- **No automated tests in this repo.** The code is type-checked, linted, and manually exercised, but there is no unit or e2e test suite. Adding one was outside the hackathon scope.

---

## Codebase notes for reviewers

- `packages/validators/index.ts` is the single source of truth for input/output shapes. `formFieldConfigSchema` carries everything per-field (placeholder, help text, validation, ratingMax, pageBreak, pageLabel, showIf).
- `evaluateShowIf` in `packages/validators` is the conditional-logic evaluator. It's imported by both the public form renderer (`apps/web/app/forms/[slug]/page.tsx`) and the response submit validator (`packages/trpc/server/routes/responses/route.ts`) so the visibility rules cannot drift between client and server.
- The response-limit + insert is wrapped in a transaction with `SELECT … FOR UPDATE` on the form row. See the inline comment in `responses.submit` for the full rationale.
- The submission-guard interface (`SubmissionGuardStore`) decouples rate-limit + dedupe state from its storage. The default in-memory implementation is correct for single-instance deploys; swap via `setSubmissionGuardStore` for multi-instance.
- The admin role gate (`adminProcedure`) hits the database on every request rather than trusting a cached claim, so admin revocation is immediate.

---

## References

- Implementation plan: `knowledge/execution_plan.md`
- Product spec context: `knowledge/hackathon_product_spec.md`
- Auth examples: `docs/AUTH_EXAMPLES.md`
- Deployment guide: `docs/DEPLOYMENT.md`
