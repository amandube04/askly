# Askly Flow Context (from `askly_flow.svg`)

This file stores persistent implementation context extracted from:
- `/Users/aman.dubey/Downloads/askly_flow.svg`

Use this as a quick memory refresh before making feature decisions.

## Product Intent

- Build a scalable SaaS form platform (Typeform/Tally/Google Forms style).
- Priorities: production-grade architecture, polished UX, strong monorepo discipline.

## Required Monorepo Shape

- `apps/web`: Next.js frontend (App Router)
- `apps/api`: tRPC backend
- `packages/db`: Drizzle schema + DB logic
- `packages/ui`: shared components
- `packages/validators`: Zod schemas
- `packages/types`: shared TS types
- `packages/utils`: reusable helpers
- `packages/api-client`: tRPC client wrappers
- `tooling/*`: lint/ts configs

## Core Data Model

- `users`: auth + role metadata
- `forms`: creator-owned form config and visibility/status
- `form_fields`: dynamic field definitions with `config_json`
- `responses`: submission-level metadata (`meta_json`)
- `answers`: per-field answer payload (`value_json`)
- `themes`: reusable visual themes

## Dynamic Form Engine

- Creator builds fields dynamically in dashboard.
- Fields become JSON schema-like config in DB.
- Runtime generates Zod validators from stored definitions.
- Submission path requires both client and server validation.

## Visibility Rules

- `public`: listed/searchable/shareable/submittable
- `unlisted`: not listed, accessible by direct link
- `unpublished`: dashboard-only, no external submissions

## Route Blueprint

- Public: `/`, `/pricing`, `/explore`, `/forms/[slug]`
- Creator: `/dashboard`, `/dashboard/forms`, `/dashboard/forms/[id]`, `/dashboard/analytics/[id]`
- API: `/auth/*`, `/forms/*`, `/responses/*`, `/analytics/*`

## Security Expectations

- Rate limiting (target: 5 submissions/min/IP, Redis-backed)
- Spam defenses (honeypot, submission delay, duplicate detection)
- Validation must exist at client, server, and database layers

## Analytics Expectations

- Core metrics: views, responses, completion rate, drop-off, device split, daily responses
- Visualizations: line chart, pie chart, response heatmap

## Suggested Build Phases

1. Foundation: monorepo, DB schema, auth, tRPC
2. Form builder: dynamic fields, runtime Zod generation, CRUD
3. Public forms: share links + submission flow + thank-you page
4. Analytics: dashboard + metrics/charts
5. Polish: landing/pricing/themes/demo data

## Nice-to-Have Features

- Conditional logic
- Multi-step forms
- QR sharing
- CSV export
- Templates
- Clone form

## Working Rule For Future Edits

- When implementation decisions conflict with this context, prefer:
  1. runtime type safety,
  2. schema-driven dynamic forms,
  3. clean package boundaries in monorepo.
