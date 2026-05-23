# Askly Hackathon Product Spec

This file captures the full challenge brief shared by the user and acts as the
canonical implementation spec for this repository.

## Goal

Build a production-style Typeform-like SaaS where creators can build dynamic
forms, publish shareable links, and collect/analyze responses.

## Required Stack

- Turborepo (monorepo foundation)
- tRPC (type-safe API layer)
- Zod (validation)
- Drizzle ORM (database schema + data layer)
- Scalar (API documentation)

## Repository Constraint

- Use the provided starter repo:
  - `https://github.com/piyushgarg-dev/trpc-monorepo`
- Frontend and backend must be separate apps in the monorepo.
- Shared code should live in packages (`types`, `validators`, `utils`, client, etc.).

## Core Product Capabilities

- Creator authentication + protected dashboard
- Form CRUD (create/edit/manage)
- Publish/unpublish workflows
- Dynamic field system with validation + required/optional config
- Public form submissions without respondent login
- Response management + analytics
- Email flows for creator/respondent notifications
- Landing + pricing pages
- Seeded demo data + demo credentials
- Deployed demo + judge-friendly setup
- API docs via Scalar

## Visibility Rules

Forms must support:

- `public`
  - Listed in public app areas (explore/templates/featured)
  - Accessible and submittable by anyone
- `unlisted`
  - Hidden from public listings
  - Accessible/submittable only via direct link
- `unpublished`
  - Must not accept responses
- Invalid/unavailable form links should be handled gracefully

## Minimum Field Support

Must support at least:

- short text
- long text
- email
- number
- single select
- multi select

Encouraged additional types:

- checkbox
- dropdown
- rating
- date

## Validation & API Requirements

- Zod must validate:
  - form definitions
  - submission payloads
- tRPC for type-safe API contracts
- Proper error handling and loading states
- Rate limiting + basic spam protection on public submission APIs
- Proper visibility checks for published/unlisted/unpublished/invalid forms

## Demo Requirements

Project must include:

- Landing page
- Pricing page
- Deployed demo URL
- API documentation URL (Scalar)
- Demo credentials
- At least 3 seeded themed forms + responses + analytics

Seed ideas include themes around:

- movies
- anime
- games
- startups
- tech companies
- operating systems
- events
- communities

## Bonus Ideas

- Form preview before publish
- Conditional logic between questions
- Form expiry / response limits
- CSV export
- Analytics charts
- Custom slugs
- QR sharing
- Password-protected forms
- Explore page
- Templates/theme gallery
- Response filtering + pagination
- Clone/archive forms
- Multi-page forms
- Admin dashboard

## Final Submission Checklist

- Public GitHub repository
- Deployed project link
- Demo credentials
- API docs link
- Proper README

## Quality/Integrity Constraints

- Solo hackathon (team size = 1)
- No plagiarism or low-effort generated code
- Broken deployment / invalid credentials / inaccessible demo can hurt scoring

