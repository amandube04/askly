# Askly Execution Plan

This is the working implementation plan for the hackathon build.

Strategy: backend-first foundation, then vertical slices end-to-end.

---

## Why This Approach

- Pure backend-first until completion is risky for demo-heavy judging.
- Pure frontend-first is risky for type safety and data model quality.
- Best tradeoff: establish backend core first, then ship each feature as a
  full backend+frontend slice.

---

## Phase 0 — Foundation (Start Here)

Goal: lock core architecture and avoid later rewrites.

- [ ] Confirm monorepo app/package layout (`apps/web`, `apps/api`, shared packages)
- [ ] Add/verify core dependencies (tRPC, Zod, Drizzle, auth, Scalar support)
- [ ] Design and implement Drizzle schema:
  - [ ] `users`
  - [ ] `forms`
  - [ ] `form_fields`
  - [ ] `responses`
  - [ ] `answers`
  - [ ] `themes`
- [ ] Add migrations + seed scaffolding
- [ ] Define shared Zod validators in `packages/validators`
- [ ] Define shared TS types in `packages/types`
- [ ] Implement base auth (creator login + protected routes)
- [ ] Create tRPC router structure (`auth`, `forms`, `responses`, `analytics`)
- [ ] Add visibility guard helpers (`public`, `unlisted`, `unpublished`)

Exit criteria:
- DB + API contracts stable enough for UI slices.

---

## Phase 1 — Slice: Creator Dashboard + Form CRUD

Goal: creators can create and manage forms.

- [ ] Dashboard shell with auth-protected access
- [ ] List forms for logged-in creator
- [ ] Create/edit basic form metadata (title, description, slug, visibility)
- [ ] Publish/unpublish toggle with backend enforcement
- [ ] Form management states (draft/published/unpublished)

Exit criteria:
- Creator can manage form lifecycle from dashboard.

---

## Phase 2 — Slice: Dynamic Form Builder

Goal: dynamic schema-driven form building.

- [ ] Add supported field types:
  - [ ] short text
  - [ ] long text
  - [ ] email
  - [ ] number
  - [ ] single select
  - [ ] multi select
- [ ] Field config UI (required, label, placeholder, validation)
- [ ] Persist field config to DB (`config_json`)
- [ ] Runtime schema generation from stored fields (Zod)
- [ ] Builder preview mode (bonus but recommended)

Exit criteria:
- Any saved form can generate runtime validation schema.

---

## Phase 3 — Slice: Public/Unlisted Submission Flow

Goal: respondents can submit published forms without auth.

- [ ] Public form route by slug/link
- [ ] Visibility handling:
  - [ ] `public`: listed + accessible
  - [ ] `unlisted`: direct-link only
  - [ ] `unpublished`: blocked
- [ ] Dynamic rendering of fields from schema
- [ ] Client-side validation (Zod)
- [ ] Server-side validation + DB constraints
- [ ] Response save + thank-you screen
- [ ] Graceful invalid/unavailable link states

Exit criteria:
- End-to-end submission works reliably for published forms.

---

## Phase 4 — Slice: Analytics + Response Management

Goal: creators can review performance and data.

- [ ] Response list with pagination/filter basics
- [ ] Core metrics:
  - [ ] views
  - [ ] responses
  - [ ] completion rate
  - [ ] drop-off
  - [ ] daily response trend
- [ ] Dashboard charts
- [ ] CSV export (bonus)

Exit criteria:
- Judges can quickly see meaningful analytics for demo forms.

---

## Phase 5 — SaaS Polish + Judge Readiness

Goal: production-feel and judge-friendly experience.

- [ ] Landing page
- [ ] Pricing page
- [ ] Explore/templates section for public forms
- [ ] Theme gallery + themed sample forms (>=3)
- [ ] Seeded demo responses + analytics data
- [ ] Demo credentials
- [ ] Email notification flow (creator/respondent)
- [ ] Scalar API docs
- [ ] Deployment + stable URLs
- [ ] README with:
  - [ ] setup
  - [ ] architecture summary
  - [ ] demo link
  - [ ] demo credentials
  - [ ] Scalar docs link

Exit criteria:
- Complete, judge-ready submission bundle.

---

## Cross-Cutting Standards (Every Phase)

- [ ] tRPC types are end-to-end, no `any` escape hatches
- [ ] Zod validators shared and reused
- [ ] Loading/error states in all async UI flows
- [ ] Basic spam/rate limit on submission APIs
- [ ] Keep package boundaries clean
- [ ] Keep seed/demo data realistic and themed

---

## Weekly Execution Rhythm (Optional)

- Day 1-2: Phase 0
- Day 3-4: Phase 1 + Phase 2 core
- Day 5: Phase 3
- Day 6: Phase 4
- Day 7: Phase 5 + final QA/demo recording

