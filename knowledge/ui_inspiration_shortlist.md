# Askly UI Inspiration (Star-Priority + Shadcn Plan)

## Reality check first
- There are very few highly-starred repos that are specifically "Star Wars form builder UI".
- High quality comes from combining: animation frameworks + shadcn design patterns + your own product layout.
- Best strategy: borrow visual motion language from high-star animation repos and keep form UX clean/readable.

## High-star repos worth learning from

### Animation / Space atmosphere
1. https://github.com/pmndrs/react-three-fiber (30k+ stars)
   - Why: strongest React + Three.js ecosystem for immersive visuals.
   - Use in Askly: hero background, subtle 3D scene, parallax stars.

2. https://github.com/pmndrs/drei (9k+ stars)
   - Why: helper components for react-three-fiber.
   - Use in Askly: stars, camera controls, environment presets.

3. https://github.com/pmndrs/react-three-next (2k+ stars)
   - Why: practical Next.js + R3F starter architecture.
   - Use in Askly: implementation pattern for Next App Router with animated canvas sections.

### Shadcn ecosystem
4. https://github.com/birobirobiro/awesome-shadcn-ui (19k+ stars)
   - Why: largest curated collection of shadcn-compatible components/templates.
   - Use in Askly: pick dashboard cards, nav patterns, command menus, chart blocks.

### Form builder references
5. https://github.com/blackjk3/react-form-builder (600+ stars)
   - Why: practical interaction ideas for field management and builder ergonomics.
   - Use in Askly: drag/reorder patterns, field settings UX ideas only (not direct UI copy).

6. https://github.com/strlrd-29/shadcn-ui-form-builder (100+ stars)
   - Why: closest direct overlap with your stack preference.
   - Use in Askly: shadcn-native composition style for builder controls.

## Proposed UI direction (fun + usable)

### Theme concept
- "Galactic control room" instead of full movie replica.
- Dark gradient base + starfield motion + neon accent colors.
- Keep content cards high contrast for readability.

### Motion guardrails
- Motion budget: 1 strong background animation + 2 micro-interactions max per screen.
- Disable/soften heavy effects on low-end devices or reduced-motion users.
- Form completion flow must stay faster than visual effects.

### Shadcn component baseline
- Navigation/shell: `Sidebar`, `Sheet`, `Breadcrumb`, `Tabs`.
- Data surfaces: `Card`, `Table`, `Badge`, `Skeleton`.
- Inputs/builder: `Input`, `Textarea`, `Switch`, `Select`, `Popover`, `Dialog`, `DnD`.
- Feedback: `Toast`, `Progress`, `Tooltip`.

## Recommended build order
1. Create design tokens (space palette, glow shadows, motion timings).
2. Rebuild dashboard shell with shadcn primitives.
3. Rebuild form builder panel with drag/reorder + field settings.
4. Add public form step-by-step "mission" UI.
5. Add animation layer last so core UX remains stable.

## What to avoid
- Full-screen heavy WebGL on every page.
- Overly bright neon text that reduces readability.
- Putting animation inside critical input controls.
