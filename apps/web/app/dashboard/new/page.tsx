"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Bug,
  Briefcase,
  CalendarCheck,
  Database,
  FileText,
  Globe,
  Lock,
  Loader2,
  Mail,
  MessageSquareHeart,
  Rocket,
  Sparkles,
} from "lucide-react";
import { GalacticShell } from "~/components/layout/galactic-shell";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

// User-id presence hint. After the OAuth-tokens-out-of-URL refactor
// (see auth security model in README), OAuth users have NO session token
// in localStorage — the HttpOnly cookie does the auth. The userId hint
// is the cross-flow signal that "we think we're signed in"; the real
// proof is whatever protected query happens next (it'll 401 if cookies
// are also gone, at which point GalacticShell wipes local state).
const DEMO_USER_STORAGE_KEY = "askly.userId";

type FieldType =
  | "short_text"
  | "long_text"
  | "email"
  | "number"
  | "single_select"
  | "multi_select"
  | "checkbox"
  | "rating"
  | "date";

type TemplateField = {
  type: FieldType;
  key: string;
  label: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
};

type Template = {
  id: string;
  name: string;
  icon: typeof FileText;
  accent: string;
  blurb: string;
  defaultTitle?: string;
  defaultDescription?: string;
  fields: TemplateField[];
};

const TEMPLATES: Template[] = [
  {
    id: "blank",
    name: "Blank canvas",
    icon: FileText,
    accent: "text-stone-200",
    blurb: "One starter field. Build everything else in the editor.",
    fields: [
      {
        type: "short_text",
        key: "question_1",
        label: "Your answer",
        required: true,
      },
    ],
  },
  {
    id: "feedback",
    name: "Customer feedback",
    icon: MessageSquareHeart,
    accent: "text-amber-200",
    blurb: "Rating + free-form. The classic NPS-lite loop.",
    defaultTitle: "Customer feedback",
    defaultDescription:
      "Quick pulse check — should take less than 60 seconds.",
    fields: [
      { type: "short_text", key: "name", label: "Your name", required: false },
      { type: "email", key: "email", label: "Email", required: false },
      {
        type: "rating",
        key: "experience",
        label: "How would you rate your experience?",
        required: true,
      },
      {
        type: "long_text",
        key: "improvements",
        label: "What's one thing we could do better?",
        required: false,
        placeholder: "Be specific — concrete examples help us prioritize.",
      },
      {
        type: "single_select",
        key: "recommend",
        label: "Would you recommend us?",
        required: true,
        options: ["Yes, definitely", "Maybe", "Probably not"],
      },
    ],
  },
  {
    id: "rsvp",
    name: "Event RSVP",
    icon: CalendarCheck,
    accent: "text-emerald-200",
    blurb: "Headcount + dietary prefs in one trip.",
    defaultTitle: "Event RSVP",
    defaultDescription: "Let us know if you can make it.",
    fields: [
      { type: "short_text", key: "name", label: "Full name", required: true },
      { type: "email", key: "email", label: "Email", required: true },
      {
        type: "single_select",
        key: "attending",
        label: "Will you attend?",
        required: true,
        options: ["Yes", "No", "Maybe"],
      },
      {
        type: "single_select",
        key: "dietary",
        label: "Dietary preference",
        required: false,
        options: ["No restrictions", "Vegetarian", "Vegan", "Gluten-free", "Other"],
      },
      {
        type: "long_text",
        key: "notes",
        label: "Anything we should know?",
        required: false,
      },
    ],
  },
  {
    id: "contact",
    name: "Contact",
    icon: Mail,
    accent: "text-sky-200",
    blurb: "Name, email, message. The starter pack.",
    defaultTitle: "Contact us",
    defaultDescription: "We usually reply within 24 hours.",
    fields: [
      { type: "short_text", key: "name", label: "Your name", required: true },
      { type: "email", key: "email", label: "Email", required: true },
      {
        type: "long_text",
        key: "message",
        label: "What's on your mind?",
        required: true,
        placeholder: "Be as specific as you can.",
      },
    ],
  },
  {
    id: "bug",
    name: "Bug report",
    icon: Bug,
    accent: "text-rose-200",
    blurb: "Reproduction steps + severity, ready for triage.",
    defaultTitle: "Bug report",
    defaultDescription:
      "Help us reproduce the issue. The more detail the better.",
    fields: [
      {
        type: "short_text",
        key: "title",
        label: "Bug title",
        required: true,
        placeholder: "One line summary",
      },
      {
        type: "long_text",
        key: "steps",
        label: "Steps to reproduce",
        required: true,
        placeholder: "1. Go to…\n2. Click…\n3. See…",
      },
      {
        type: "long_text",
        key: "expected",
        label: "What did you expect to happen?",
        required: true,
      },
      {
        type: "single_select",
        key: "severity",
        label: "Severity",
        required: true,
        options: ["Low", "Medium", "High", "Critical"],
      },
      {
        type: "email",
        key: "email",
        label: "Your email (for follow-up)",
        required: false,
      },
    ],
  },
  {
    id: "application",
    name: "Job application",
    icon: Briefcase,
    accent: "text-violet-200",
    blurb: "Name, links, why, experience. Ready to share.",
    defaultTitle: "Application form",
    defaultDescription:
      "Tell us a bit about you. Most candidates finish in under five minutes.",
    fields: [
      { type: "short_text", key: "name", label: "Full name", required: true },
      { type: "email", key: "email", label: "Email", required: true },
      {
        type: "short_text",
        key: "portfolio",
        label: "LinkedIn or portfolio URL",
        required: false,
      },
      {
        type: "long_text",
        key: "why",
        label: "Why this role?",
        required: true,
        placeholder: "What draws you to this team specifically?",
      },
      {
        type: "single_select",
        key: "experience",
        label: "Years of relevant experience",
        required: true,
        options: ["Less than 1", "1–3", "3–5", "5–10", "10+"],
      },
    ],
  },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

export default function NewFormPage() {
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("blank");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "unlisted">("unlisted");
  // Empty string = use auto-generated (slugified title + random suffix).
  // Non-empty = use the user's exact value, validated against the slug regex
  // and rejected by the server if a duplicate.
  const [customSlug, setCustomSlug] = useState("");
  // Slug validation: same regex the server enforces. We mirror it client-side
  // so users get inline feedback before the round-trip.
  const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  useEffect(() => {
    const has = !!window.localStorage.getItem(DEMO_USER_STORAGE_KEY);
    setHasSession(has);
    setIsHydrated(true);
  }, []);

  // DB templates — seeded forms with isTemplate=true. Merged in below with
  // the hardcoded gallery so both sources show up. Public endpoint, no auth
  // required — judges should see templates even before signing in.
  const dbTemplatesQuery = trpc.forms.listTemplates.useQuery(undefined, {
    staleTime: 10 * 60_000,
  });

  // Project DB templates onto the same shape the hardcoded TEMPLATES use so
  // the renderer + selection handler don't have to branch.
  const dbTemplates: Template[] = useMemo(() => {
    const rows = dbTemplatesQuery.data ?? [];
    return rows.map((row) => ({
      id: `db:${row.id}`,
      name: row.title,
      icon: Database,
      accent: "text-sky-200",
      blurb: row.description?.slice(0, 80) ?? "Seeded demo template.",
      defaultTitle: row.title,
      defaultDescription: row.description ?? undefined,
      fields: row.fields.map((field) => {
        // configJson is `unknown`; pull just the fields the editor cares
        // about. Anything weird just falls back to safe defaults so a
        // broken seed never crashes the new-form page.
        const config =
          field.config && typeof field.config === "object"
            ? (field.config as { options?: unknown; placeholder?: unknown })
            : {};
        const options = Array.isArray(config.options)
          ? config.options.filter((o): o is string => typeof o === "string")
          : [];
        return {
          type: field.type as FieldType,
          key: field.key,
          label: field.label,
          required: field.required,
          options,
          placeholder:
            typeof config.placeholder === "string" ? config.placeholder : undefined,
        };
      }),
    }));
  }, [dbTemplatesQuery.data]);

  const allTemplates = useMemo(
    () => [...TEMPLATES, ...dbTemplates],
    [dbTemplates],
  );

  const selectedTemplate = useMemo(
    () =>
      allTemplates.find((t) => t.id === selectedTemplateId) ?? TEMPLATES[0]!,
    [selectedTemplateId, allTemplates],
  );

  // useUtils gives us programmatic access to the tRPC cache so we can
  // invalidate stale list queries when the user creates a new form.
  // Without this, the dashboard's `forms.listMineWithStats` would
  // serve a cached response that doesn't include the new form, and
  // the user has to manually hard-refresh to see it.
  const utils = trpc.useUtils();

  const createFormMutation = trpc.forms.create.useMutation({
    onSuccess: (form) => {
      // Fire-and-forget invalidation — we don't await it because the
      // user is about to navigate to the editor anyway, and the
      // dashboard list will refetch on its own when re-mounted.
      utils.forms.listMineWithStats.invalidate().catch(() => undefined);
      // The analytics list reads from a separate query that also
      // surfaces all forms; invalidate it too so analytics is in
      // sync when the user lands there next.
      utils.forms.listMine.invalidate().catch(() => undefined);
      router.push(`/dashboard/forms/${form.id}`);
    },
  });

  const onSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = allTemplates.find((t) => t.id === templateId);
    if (!template) return;
    // Auto-fill title/description if user hasn't touched them, so a one-click
    // template insertion produces a coherent form name without forcing typing.
    if (template.defaultTitle && title.trim().length === 0) {
      setTitle(template.defaultTitle);
    }
    if (template.defaultDescription && description.trim().length === 0) {
      setDescription(template.defaultDescription);
    }
  };

  const onCreate = () => {
    if (!hasSession || title.trim().length < 3) return;
    const slugBase = slugify(title);
    const uniqueSuffix = Date.now().toString().slice(-6);
    // If the user typed a custom slug, use it as-is (already-validated by
    // the SLUG_PATTERN check that gates the button). Otherwise auto-generate
    // from the title + a 6-digit time suffix so collisions are rare.
    const trimmedCustom = customSlug.trim();
    const finalSlug =
      trimmedCustom.length > 0
        ? trimmedCustom
        : `${slugBase || "form"}-${uniqueSuffix}`;

    createFormMutation.mutate({
      title: title.trim(),
      description: description.trim().length > 0 ? description.trim() : undefined,
      slug: finalSlug,
      visibility,
      status: "draft",
      isTemplate: false,
      fields: selectedTemplate.fields.map((field, index) => ({
        type: field.type,
        key: field.key,
        label: field.label,
        required: field.required,
        order: index,
        config: {
          options: field.options ?? [],
          placeholder: field.placeholder,
          validation: { blockedDomains: [] },
        },
      })),
    });
  };

  // ── unauth / loading
  if (!isHydrated) {
    return (
      <GalacticShell eyebrow="New mission" title="Launch a form">
        <div className="askly-card-glass h-96 animate-pulse" />
      </GalacticShell>
    );
  }
  if (!hasSession) {
    return (
      <GalacticShell eyebrow="New mission" title="Authenticate to continue">
        <div className="askly-card-glass p-8 text-center">
          <p className="text-stone-200">
            You need a creator session to launch a form.
          </p>
          <Button
            asChild
            className="askly-cta-glow mt-4 bg-amber-100 text-stone-900 hover:bg-amber-50"
          >
            <a href="/dashboard">Go to dashboard</a>
          </Button>
        </div>
      </GalacticShell>
    );
  }

  const trimmedCustomSlug = customSlug.trim();
  // Custom slug is valid if empty (auto-mode) OR matches the server regex
  // and is between 3–80 chars. Surfacing the same constraints client-side
  // avoids a server round-trip for obviously-bad input.
  const customSlugInvalid =
    trimmedCustomSlug.length > 0 &&
    (trimmedCustomSlug.length < 3 ||
      trimmedCustomSlug.length > 80 ||
      !SLUG_PATTERN.test(trimmedCustomSlug));
  const canCreate =
    title.trim().length >= 3 &&
    !customSlugInvalid &&
    !createFormMutation.isPending;
  const slugPreview = slugify(title) || "form";

  // Default template is "Blank form" (TEMPLATES[0]); checking whether the
  // user picked something else gates the "Starting from …" badge so a
  // first-time visitor doesn't see a pre-loaded template hint they
  // didn't ask for. Also drives whether the gallery starts open.
  const userPickedTemplate = selectedTemplateId !== TEMPLATES[0]!.id;

  return (
    <GalacticShell
      eyebrow="New mission"
      title="Launch a form"
      subtitle="Name it, pick visibility, launch. Templates are optional — open the gallery below if you want a starting point."
      actions={
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push("/dashboard")}
          className="border-stone-300/25 bg-stone-100/5 text-stone-200 hover:bg-stone-100/10"
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
      }
    >
      {/* Centered narrow column. Previous layout was a wide side-by-side
          hero (title-pane + visibility-pane) PLUS an always-open
          6-card template grid below — too many decisions visible at
          once for the most common "I know what I want to build" path.
          New shape: one focused launch card above the fold, template
          gallery collapsed into a <details> below for users who want
          inspiration. */}
      <div className="mx-auto w-full max-w-2xl space-y-5">
        {/* ── LAUNCH CARD: title → slug → visibility → CTA, stacked ── */}
        <div className="askly-card-glass relative overflow-hidden p-6">
          <div className="askly-scan-line opacity-20" aria-hidden />
          <div className="relative space-y-5">
            {/* Template hint — ONLY shows when the user actually
                picked a template. Otherwise the default Blank form
                triggers a misleading "Starting from Blank form" badge
                that creates the illusion of an active choice. */}
            {userPickedTemplate ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/35 bg-amber-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-amber-200">
                  <Sparkles className="size-3" />
                  Starting from {selectedTemplate.name}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-stone-300/20 bg-stone-100/4 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-stone-300/75">
                  {`${selectedTemplate.fields.length} ${selectedTemplate.fields.length === 1 ? "field" : "fields"} will be inserted`}
                </span>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <p className="askly-section-eyebrow">What is this form called?</p>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. NPS survey — Q3 2026"
                maxLength={120}
                className="w-full bg-transparent text-2xl font-semibold tracking-tight text-stone-50 placeholder:text-stone-500 focus:outline-none"
              />
              <p className="text-[10px] text-stone-400/65">
                {title.trim().length < 3
                  ? "At least 3 characters."
                  : `${title.trim().length}/120 characters`}
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="askly-section-eyebrow">Visibility</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                <VisibilityChip
                  active={visibility === "unlisted"}
                  onClick={() => setVisibility("unlisted")}
                  icon={Lock}
                  label="Unlisted"
                  blurb="Only people with the link"
                />
                <VisibilityChip
                  active={visibility === "public"}
                  onClick={() => setVisibility("public")}
                  icon={Globe}
                  label="Public"
                  blurb="Listed on /explore"
                />
              </div>
            </div>

            {/* Advanced (slug + description) is collapsed by default so
                the page surfaces only the two decisions every form
                NEEDS (title + visibility). Users who want a custom URL
                or a description can expand it. */}
            <details className="group/adv rounded-md border border-stone-300/12 bg-stone-100/2">
              <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-xs text-stone-300/80 transition hover:text-amber-100 [&::-webkit-details-marker]:hidden">
                <span className="askly-section-eyebrow">Advanced (optional)</span>
                <span className="text-stone-400/70 transition group-open/adv:rotate-180">▾</span>
              </summary>
              <div className="space-y-3 border-t border-stone-300/10 px-3 py-3">
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-stone-400/70">
                    Custom URL
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-400/80">
                    <span className="font-mono text-stone-400/65">/forms/</span>
                    <input
                      type="text"
                      value={customSlug}
                      onChange={(e) =>
                        setCustomSlug(
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9-]/g, "")
                            .slice(0, 80),
                        )
                      }
                      placeholder={`${slugPreview}-XXXXXX`}
                      className="min-w-0 flex-1 bg-transparent font-mono text-amber-100/90 placeholder:text-amber-100/30 focus:outline-none"
                    />
                  </div>
                  <p
                    className={cn(
                      "text-[10px]",
                      customSlugInvalid ? "text-rose-300" : "text-stone-400/65",
                    )}
                  >
                    {customSlugInvalid
                      ? "3–80 lowercase letters, digits, hyphens (no leading/trailing hyphen)."
                      : trimmedCustomSlug.length > 0
                        ? "Custom URL — must be unique across the workspace."
                        : "Leave empty to auto-generate with a random suffix."}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-stone-400/70">
                    Description
                  </p>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional — short context for respondents."
                    rows={2}
                    maxLength={500}
                    className="w-full resize-none rounded-md border border-stone-300/15 bg-stone-100/3 p-2 text-sm text-stone-300/85 placeholder:text-stone-500/70 focus:border-amber-200/35 focus:outline-none"
                  />
                </div>
              </div>
            </details>

            {createFormMutation.error ? (
              <p className="text-xs text-rose-300">
                {createFormMutation.error.message}
              </p>
            ) : null}

            <div className="space-y-1.5">
              <Button
                onClick={onCreate}
                disabled={!canCreate}
                className={cn(
                  "askly-cta-glow w-full gap-2 bg-amber-100 px-5 py-2.5 text-stone-900 hover:bg-amber-50",
                  !canCreate && "opacity-60",
                )}
              >
                {createFormMutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Launching…
                  </>
                ) : (
                  <>
                    <Rocket className="size-4" />
                    Launch form
                  </>
                )}
              </Button>
              <p className="text-center text-[10px] text-stone-400/65">
                Creates a draft. You can rearrange, rename, and add fields next. Publish from the builder.
              </p>
            </div>
          </div>
        </div>

        {/* ── TEMPLATE GALLERY (collapsed by default) ──
            Open by default ONLY if the user has already clicked a
            template card this session — otherwise hidden behind a
            single tap so first-timers see one focused launch card
            instead of a wall of options. */}
        <details className="group/templates" open={userPickedTemplate}>
          <summary className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-stone-300/12 bg-stone-100/2 px-4 py-3 transition hover:border-amber-200/30 hover:bg-amber-100/3 [&::-webkit-details-marker]:hidden">
            <div className="flex items-center gap-2">
              <Sparkles className="size-3.5 text-amber-200/80" />
              <p className="text-sm font-medium text-stone-100">
                Or start from a template
              </p>
              <span className="rounded-full border border-stone-300/20 bg-stone-100/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-stone-300/70">
                {allTemplates.length} available
              </span>
            </div>
            <span className="text-xs text-stone-400/70 transition group-open/templates:rotate-180">
              ▾
            </span>
          </summary>

          <div className="mt-3 space-y-2">
            <p className="text-xs text-stone-400/65">
              Tap any card — title + fields swap instantly. You can still rename and edit fields after.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {allTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  selected={template.id === selectedTemplateId}
                  onSelect={() => onSelectTemplate(template.id)}
                  fromDb={template.id.startsWith("db:")}
                />
              ))}
            </div>
          </div>
        </details>
      </div>
    </GalacticShell>
  );
}

// ──────────────────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  selected,
  onSelect,
  fromDb,
}: {
  template: Template;
  selected: boolean;
  onSelect: () => void;
  fromDb?: boolean;
}) {
  const Icon = template.icon;
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.18 }}
      className={cn(
        "askly-card-glass group relative flex flex-col gap-2 overflow-hidden p-4 text-left transition",
        selected
          ? "border-amber-200/45 ring-1 ring-amber-200/25"
          : "hover:border-stone-300/35",
      )}
    >
      <div className="absolute right-3 top-3 flex items-center gap-1.5">
        {fromDb ? (
          <span
            className="flex items-center gap-1 rounded-full border border-sky-300/30 bg-sky-300/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.18em] text-sky-200"
            title="Loaded from seeded database templates"
          >
            From DB
          </span>
        ) : null}
        {selected ? (
          <span className="flex items-center gap-1 rounded-full border border-amber-200/40 bg-amber-100/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.18em] text-amber-100">
            Selected
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid size-9 place-items-center rounded-md border border-stone-300/20 bg-stone-950/40",
            template.accent,
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-stone-50">
            {template.name}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400/65">
            {`${template.fields.length} ${template.fields.length === 1 ? "field" : "fields"}`}
          </p>
        </div>
      </div>

      <p className="text-xs text-stone-300/80">{template.blurb}</p>

      {/* Field type icons preview row — gives a glance of what's inside */}
      <div className="mt-1 flex flex-wrap gap-1">
        {template.fields.slice(0, 6).map((field, i) => (
          <span
            key={`${field.key}-${i}`}
            className="rounded border border-stone-300/12 bg-stone-100/3 px-1.5 py-0.5 font-mono text-[9px] text-stone-300/75"
          >
            {field.type.replace("_", " ")}
          </span>
        ))}
      </div>
    </motion.button>
  );
}

function VisibilityChip({
  active,
  onClick,
  icon: Icon,
  label,
  blurb,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Lock;
  label: string;
  blurb: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-md border px-3 py-2 text-left transition",
        active
          ? "border-amber-200/45 bg-amber-100/8 text-amber-100 ring-1 ring-amber-200/20"
          : "border-stone-300/20 bg-stone-100/3 text-stone-200 hover:border-stone-300/40",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <div className="flex flex-col">
        <span className="text-sm font-medium leading-tight">{label}</span>
        <span className="text-[10px] text-stone-400/75 leading-tight">{blurb}</span>
      </div>
    </button>
  );
}
