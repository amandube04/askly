"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlignLeft,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  AtSign,
  BarChart3,
  Calendar,
  CheckSquare,
  CircleDot,
  Eye,
  EyeOff,
  Hash,
  Inbox,
  ListChecks,
  Loader2,
  Lock,
  Plus,
  Save,
  Sparkles,
  Star,
  Trash2,
  Type,
  X,
} from "lucide-react";
import Link from "next/link";
import { GalacticShell } from "~/components/layout/galactic-shell";
import { ShareLinkBanner } from "~/components/forms/share-link";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

// Auth presence hint — see /dashboard/new for the full rationale. OAuth
// users no longer have a session token in localStorage (HttpOnly cookie
// does the auth), so we key off the userId hint instead. The real
// authoritative check happens server-side on the next tRPC call.
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

type FormStatus = "draft" | "published" | "unpublished" | "archived";
type FormVisibility = "public" | "unlisted";

type EditableField = {
  id?: string;
  type: FieldType;
  key: string;
  label: string;
  required: boolean;
  options: string[];
  placeholder: string;
  helpText: string;
  // Star count for rating fields. Stored on the form-field config so each
  // field picks its own scale. Defaults to 5; ignored for non-rating types.
  ratingMax: number;
  // True if this field starts a new page in the multi-page renderer. The
  // first field is implicitly a new page regardless.
  pageBreak: boolean;
  // Optional label shown above the page in the public renderer (e.g.
  // "Section 2: Preferences"). Only meaningful when pageBreak=true.
  pageLabel: string;
  // Conditional logic — when set, this field only renders if the target
  // field's answer matches. `null` = always visible. `fieldId` is the
  // dependency target; `op`/`value` mirror the validator's enum.
  showIf: {
    fieldId: string;
    op: "equals" | "not_equals" | "contains" | "is_empty" | "is_not_empty";
    value: string;
  } | null;
  expanded: boolean;
};

const FIELD_TYPE_META: Record<
  FieldType,
  {
    label: string;
    icon: typeof Type;
    blurb: string;
    accent: string;
  }
> = {
  short_text: {
    label: "Short text",
    icon: Type,
    blurb: "Single-line freeform input",
    accent: "text-sky-200/85",
  },
  long_text: {
    label: "Long text",
    icon: AlignLeft,
    blurb: "Multi-line textarea",
    accent: "text-sky-200/85",
  },
  email: {
    label: "Email",
    icon: AtSign,
    blurb: "Email with validation",
    accent: "text-amber-200/85",
  },
  number: {
    label: "Number",
    icon: Hash,
    blurb: "Numeric input",
    accent: "text-amber-200/85",
  },
  // NOTE on naming: these UI labels intentionally diverge from the
  // underlying enum names (single_select / multi_select / checkbox).
  // The enum names are kept stable to avoid a DB migration, but the
  // labels match what users actually expect from other form tools
  // (Google Forms, Typeform, Tally): "Checkboxes" = multi-option list,
  // "Single checkbox" = one yes/no consent toggle. The previous labels
  // ("Multi select" + "Checkbox") sent users straight into the wrong
  // type because "Checkbox" sounds like the multi-option one.
  single_select: {
    label: "Multiple choice",
    icon: CircleDot,
    blurb: "Pick one option (radio buttons)",
    accent: "text-violet-200/85",
  },
  multi_select: {
    label: "Checkboxes",
    icon: ListChecks,
    blurb: "Pick one or more from a list",
    accent: "text-violet-200/85",
  },
  checkbox: {
    label: "Single checkbox",
    icon: CheckSquare,
    blurb: "One yes/no consent toggle (no options)",
    accent: "text-violet-200/85",
  },
  rating: {
    label: "Rating",
    icon: Star,
    blurb: "Star rating 1-5",
    accent: "text-amber-200/85",
  },
  date: {
    label: "Date",
    icon: Calendar,
    blurb: "Calendar picker",
    accent: "text-emerald-200/85",
  },
};

const SUPPORTS_OPTIONS = (t: FieldType) =>
  t === "single_select" || t === "multi_select";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function keyForOrder(order: number, label: string): string {
  const base = slugify(label || `question_${order + 1}`);
  if (base.length >= 2 && /^[a-z]/.test(base)) return base;
  return `question_${order + 1}`;
}

function fromServerField(f: {
  id: string;
  type: FieldType;
  key: string;
  label: string;
  required: boolean;
  order: number;
  config: unknown;
}): EditableField {
  const config =
    f.config && typeof f.config === "object"
      ? (f.config as {
          options?: unknown;
          placeholder?: unknown;
          helpText?: unknown;
          ratingMax?: unknown;
          pageBreak?: unknown;
          pageLabel?: unknown;
          showIf?: unknown;
        })
      : {};
  const options = Array.isArray(config.options)
    ? config.options.filter((o): o is string => typeof o === "string")
    : [];
  // Clamp to [2,10] — same bounds as the server-side validator. Anything
  // outside the range (or a non-number) reverts to the 5-star default.
  const ratingMaxRaw =
    typeof config.ratingMax === "number" && Number.isFinite(config.ratingMax)
      ? Math.round(config.ratingMax)
      : 5;
  return {
    id: f.id,
    type: f.type,
    key: f.key,
    label: f.label,
    required: f.required,
    options,
    placeholder: typeof config.placeholder === "string" ? config.placeholder : "",
    helpText: typeof config.helpText === "string" ? config.helpText : "",
    ratingMax: Math.min(Math.max(ratingMaxRaw, 2), 10),
    pageBreak: config.pageBreak === true,
    pageLabel: typeof config.pageLabel === "string" ? config.pageLabel : "",
    showIf: parseShowIfFromConfig(config.showIf),
    expanded: false,
  };
}

// Defensive parser so we never crash on a malformed rule from older
// drafts. Returns null when any required piece is missing/invalid; the
// editor treats null as "always visible".
function parseShowIfFromConfig(raw: unknown): EditableField["showIf"] {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { fieldId?: unknown; op?: unknown; value?: unknown };
  if (typeof r.fieldId !== "string" || r.fieldId.length === 0) return null;
  const validOps = ["equals", "not_equals", "contains", "is_empty", "is_not_empty"] as const;
  const op = validOps.find((o) => o === r.op);
  if (!op) return null;
  // Stringify value for the editor's single-input UX. The server-side
  // evaluator handles string/number/boolean coercion, so this round-trips
  // cleanly even if the original value was a non-string primitive.
  let value = "";
  if (typeof r.value === "string") value = r.value;
  else if (typeof r.value === "number" || typeof r.value === "boolean") value = String(r.value);
  return { fieldId: r.fieldId, op, value };
}

function newField(order: number, type: FieldType = "short_text"): EditableField {
  const label = `${FIELD_TYPE_META[type].label} ${order + 1}`;
  return {
    type,
    key: keyForOrder(order, label),
    label,
    required: false,
    options:
      type === "single_select" || type === "multi_select"
        ? ["Option 1", "Option 2"]
        : [],
    placeholder: "",
    helpText: "",
    ratingMax: 5,
    pageBreak: false,
    pageLabel: "",
    showIf: null,
    expanded: true,
  };
}

function relativeTime(date: Date | null): string {
  if (!date) return "never";
  const diff = Math.max(0, Date.now() - date.getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const STATUS_TONE: Record<
  FormStatus,
  { label: string; pill: string; dot: string }
> = {
  published: {
    label: "Live",
    pill: "border-emerald-300/35 bg-emerald-300/10 text-emerald-200",
    dot: "bg-emerald-300",
  },
  draft: {
    label: "Draft",
    pill: "border-amber-300/35 bg-amber-300/10 text-amber-200",
    dot: "bg-amber-300",
  },
  unpublished: {
    label: "Paused",
    pill: "border-stone-300/30 bg-stone-100/5 text-stone-300",
    dot: "bg-stone-400",
  },
  archived: {
    label: "Archived",
    pill: "border-stone-300/25 bg-stone-950/40 text-stone-400",
    dot: "bg-stone-500",
  },
};

export default function EditFormPage() {
  const params = useParams<{ formId: string }>();
  const formId = typeof params?.formId === "string" ? params.formId : "";
  const router = useRouter();

  const [isHydrated, setIsHydrated] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  // form-level state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [visibility, setVisibility] = useState<FormVisibility>("unlisted");
  const [status, setStatus] = useState<FormStatus>("draft");
  const [isTemplate, setIsTemplate] = useState(false);
  const [responseLimit, setResponseLimit] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  // null = "no theme" (falls back to default Spice Sand on the public renderer).
  // Empty string would clash with the "" sentinel some HTML <select> elements
  // emit when nothing is picked, so we use null throughout.
  const [themeId, setThemeId] = useState<string | null>(null);
  const [fields, setFields] = useState<EditableField[]>([]);
  const [selectedFieldIndex, setSelectedFieldIndex] = useState<number | null>(null);

  // tracking dirty state
  const [pristineHash, setPristineHash] = useState<string>("");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [, forceTick] = useState(0); // for "X ago" updates

  // tick once a minute to keep "saved 2m ago" fresh
  useEffect(() => {
    const t = setInterval(() => forceTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setHasSession(!!window.localStorage.getItem(DEMO_USER_STORAGE_KEY));
    setIsHydrated(true);
  }, []);

  const formQuery = trpc.forms.getMineById.useQuery(
    { formId },
    { enabled: isHydrated && hasSession && formId.length > 0 },
  );

  // hydrate local state from server once
  useEffect(() => {
    if (!formQuery.data) return;
    setTitle(formQuery.data.title);
    setDescription(formQuery.data.description ?? "");
    setSlug(formQuery.data.slug);
    setVisibility(formQuery.data.visibility);
    setStatus(formQuery.data.status);
    setIsTemplate(formQuery.data.isTemplate);
    setResponseLimit(
      formQuery.data.responseLimit != null ? String(formQuery.data.responseLimit) : "",
    );
    setExpiresAt(
      formQuery.data.expiresAt
        ? new Date(formQuery.data.expiresAt).toISOString().slice(0, 10)
        : "",
    );
    setThemeId(formQuery.data.themeId ?? null);
    const editableFields = formQuery.data.fields.map((f) =>
      fromServerField(f as never),
    );
    setFields(editableFields);
    setPristineHash(
      JSON.stringify({
        title: formQuery.data.title,
        description: formQuery.data.description,
        slug: formQuery.data.slug,
        visibility: formQuery.data.visibility,
        status: formQuery.data.status,
        isTemplate: formQuery.data.isTemplate,
        responseLimit: formQuery.data.responseLimit,
        expiresAt: formQuery.data.expiresAt,
        themeId: formQuery.data.themeId ?? null,
        fields: editableFields.map((f) => ({ ...f, expanded: false })),
      }),
    );
  }, [formQuery.data]);

  // Same useUtils pattern as /dashboard/new — without invalidating
  // the dashboard's list query, edits made here (title rename,
  // status change, etc.) won't reflect on the dashboard cards
  // until the user does a hard refresh.
  const utils = trpc.useUtils();

  const updateMutation = trpc.forms.update.useMutation({
    onSuccess() {
      const now = new Date();
      setLastSavedAt(now);
      setPristineHash(currentHash);
      formQuery.refetch();
      // Fire-and-forget — the user is still in the editor, the
      // dashboard list will refetch on next mount. Catching the
      // promise rejection silently because a failed invalidation
      // is harmless (worst case the list shows stale data, which
      // is what the user already had before this fix).
      utils.forms.listMineWithStats.invalidate().catch(() => undefined);
      utils.forms.listMine.invalidate().catch(() => undefined);
    },
  });

  const currentHash = useMemo(
    () =>
      JSON.stringify({
        title,
        description: description.trim().length > 0 ? description : null,
        slug,
        visibility,
        status,
        isTemplate,
        responseLimit:
          responseLimit.trim().length > 0 ? Number(responseLimit) : null,
        expiresAt: expiresAt.trim().length > 0 ? expiresAt : null,
        themeId: themeId ?? null,
        fields: fields.map((f) => ({ ...f, expanded: false })),
      }),
    [
      title,
      description,
      slug,
      visibility,
      status,
      isTemplate,
      responseLimit,
      expiresAt,
      themeId,
      fields,
    ],
  );
  const dirty = pristineHash.length > 0 && currentHash !== pristineHash;

  const responseCount = formQuery.data?.fields ? undefined : 0;
  void responseCount;

  // ── handlers
  const addField = (type: FieldType) => {
    setFields((prev) => {
      const next = [...prev, newField(prev.length, type)];
      setSelectedFieldIndex(next.length - 1);
      return next;
    });
  };

  const updateField = (index: number, patch: Partial<EditableField>) => {
    setFields((prev) =>
      prev.map((f, i) => {
        if (i !== index) return f;
        const merged = { ...f, ...patch };
        // auto-derive key from label when key wasn't manually overridden
        if (patch.label !== undefined && merged.key === f.key) {
          const auto = keyForOrder(i, patch.label);
          if (f.key === keyForOrder(i, f.label)) merged.key = auto;
        }
        return merged;
      }),
    );
  };

  const deleteField = (index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
    setSelectedFieldIndex((curr) =>
      curr === null ? null : curr === index ? null : curr > index ? curr - 1 : curr,
    );
  };

  const moveField = (index: number, dir: -1 | 1) => {
    setFields((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      const tmp = next[index]!;
      next[index] = next[target]!;
      next[target] = tmp;
      return next;
    });
    setSelectedFieldIndex((curr) =>
      curr === null ? null : curr === index ? index + dir : curr === index + dir ? index : curr,
    );
  };

  const save = (publishOverride?: FormStatus) => {
    if (!formId) return;
    const nextStatus: FormStatus = publishOverride ?? status;
    updateMutation.mutate({
      formId,
      title,
      // `null` (not `undefined`) so an empty editor field actually clears the
      // value on the server. With `undefined`, the previous value would persist.
      description: description.trim().length > 0 ? description : null,
      slug,
      visibility,
      status: nextStatus,
      isTemplate,
      responseLimit:
        responseLimit.trim().length > 0 ? Number(responseLimit) : null,
      expiresAt:
        expiresAt.trim().length > 0
          ? new Date(`${expiresAt}T00:00:00.000Z`)
          : null,
      // null clears the theme, uuid sets it; undefined would leave it untouched
      // but here we always send the user's intent explicitly.
      themeId: themeId ?? null,
      fields: fields.map((f, i) => ({
        id: f.id,
        type: f.type,
        key: f.key,
        label: f.label,
        required: f.required,
        order: i,
        config: {
          options: SUPPORTS_OPTIONS(f.type) ? f.options : [],
          placeholder:
            f.placeholder.trim().length > 0 ? f.placeholder : undefined,
          helpText: f.helpText.trim().length > 0 ? f.helpText : undefined,
          // Only meaningful for rating fields. Sending it for other types is
          // harmless (server validator ignores it) but adds noise to the
          // wire — keep it scoped.
          ratingMax: f.type === "rating" ? f.ratingMax : undefined,
          // Multi-page: only send pageBreak/pageLabel when the creator
          // actually wants a break here. The first field's pageBreak is
          // implicit (every form has at least one page).
          pageBreak: f.pageBreak ? true : undefined,
          pageLabel:
            f.pageBreak && f.pageLabel.trim().length > 0
              ? f.pageLabel
              : undefined,
          // Only emit a showIf rule when it has a real target field. The
          // editor lets users half-configure the rule; we silently drop
          // it instead of erroring, since an incomplete rule means
          // "always visible" anyway.
          showIf:
            f.showIf && f.showIf.fieldId
              ? {
                  fieldId: f.showIf.fieldId,
                  op: f.showIf.op,
                  // is_empty / is_not_empty ignore value; for the rest
                  // we send an empty string when nothing was entered so
                  // the equality compares against "" — predictable.
                  value:
                    f.showIf.op === "is_empty" || f.showIf.op === "is_not_empty"
                      ? undefined
                      : f.showIf.value,
                }
              : undefined,
          validation: { blockedDomains: [] },
        },
      })),
    });
    if (publishOverride) setStatus(publishOverride);
  };

  const togglePublish = () => {
    const next: FormStatus = status === "published" ? "unpublished" : "published";
    save(next);
  };

  const statusTone = STATUS_TONE[status] ?? STATUS_TONE.draft;

  // ── unauth / loading states
  if (!isHydrated) {
    return (
      <GalacticShell eyebrow="Schema editor" title="Form builder">
        <div className="askly-card-glass h-96 animate-pulse" />
      </GalacticShell>
    );
  }
  if (!hasSession) {
    return (
      <GalacticShell eyebrow="Schema editor" title="Form builder">
        <div className="askly-card-glass p-8 text-center">
          <p className="text-stone-200">
            You need a creator session to edit forms.
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
  if (formQuery.isLoading || !formQuery.data) {
    return (
      <GalacticShell eyebrow="Schema editor" title="Loading form…">
        <div className="space-y-4">
          <div className="askly-card-glass h-32 animate-pulse" />
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="askly-card-glass h-96 animate-pulse" />
            <div className="askly-card-glass h-96 animate-pulse" />
          </div>
        </div>
      </GalacticShell>
    );
  }

  return (
    <GalacticShell
      eyebrow="Schema editor"
      title={title || "Untitled form"}
      subtitle={`${fields.length} field${fields.length === 1 ? "" : "s"} · /forms/${slug}`}
      actions={
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push("/dashboard")}
            className="border-stone-300/25 bg-stone-100/5 text-stone-200 hover:bg-stone-100/10"
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
          <BuilderTab href={`/dashboard/forms/${formId}/responses`} icon={Inbox}>
            Responses
          </BuilderTab>
          <BuilderTab href={`/dashboard/analytics/${formId}`} icon={BarChart3}>
            Analytics
          </BuilderTab>
          <SaveIndicator
            dirty={dirty}
            saving={updateMutation.isPending}
            lastSavedAt={lastSavedAt}
            error={updateMutation.error?.message ?? null}
          />
          <Button
            size="sm"
            onClick={() => save()}
            disabled={updateMutation.isPending || !dirty}
            className={cn(
              "border border-stone-300/25 bg-stone-100/8 text-stone-100 hover:bg-stone-100/15",
              !dirty && "opacity-60",
            )}
          >
            {updateMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save
          </Button>
          <Button
            size="sm"
            onClick={togglePublish}
            disabled={updateMutation.isPending}
            className={
              status === "published"
                ? "border border-stone-300/30 bg-stone-100/8 text-stone-100 hover:bg-stone-100/15"
                : "askly-cta-glow bg-amber-100 text-stone-900 hover:bg-amber-50"
            }
          >
            {status === "published" ? (
              <>
                <EyeOff className="size-4" />
                Unpublish
              </>
            ) : (
              <>
                <Eye className="size-4" />
                Publish
              </>
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Form metadata strip — inline-editable title + slug + status pill */}
        <MetadataStrip
          title={title}
          slug={slug}
          description={description}
          status={status}
          visibility={visibility}
          onTitleChange={setTitle}
          onSlugChange={setSlug}
          onDescriptionChange={setDescription}
        />

        {/* Shareable public link — the actual handoff to respondents. */}
        <ShareLinkBanner
          slug={slug}
          isPublished={status === "published"}
          isPublic={visibility === "public"}
        />

        {/* Main 2-column area: canvas + live preview */}
        <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
          {/* CANVAS COLUMN */}
          <div className="space-y-4">
            <FieldTypePalette onAdd={addField} />

            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {fields.map((field, index) => (
                  <FieldCard
                    key={field.id ?? `new-${index}`}
                    field={field}
                    index={index}
                    selected={selectedFieldIndex === index}
                    onSelect={() => setSelectedFieldIndex(index)}
                    onChange={(patch) => updateField(index, patch)}
                    onDelete={() => deleteField(index)}
                    onMoveUp={() => moveField(index, -1)}
                    onMoveDown={() => moveField(index, 1)}
                    canMoveUp={index > 0}
                    canMoveDown={index < fields.length - 1}
                    // Only show fields ABOVE this one as conditional
                    // targets — otherwise the rule depends on an answer
                    // the user hasn't seen yet, which would be confusing
                    // (and create cycles when both reference each other).
                    precedingFields={fields.slice(0, index).flatMap((f) =>
                      f.id ? [{ id: f.id, label: f.label || f.key }] : [],
                    )}
                  />
                ))}
              </AnimatePresence>

              {fields.length === 0 ? <EmptyCanvas onAdd={addField} /> : null}

              {fields.length > 0 ? (
                // Promote to a proper primary CTA (was a dashed-border
                // pseudo-button that users overlooked). The field
                // palette at the top adds the SAME type for both
                // routes — this is just the "I want one more, like the
                // last one" shortcut.
                <Button
                  type="button"
                  onClick={() => addField("short_text")}
                  className="w-full gap-2"
                  variant="secondary"
                  size="lg"
                >
                  <Plus className="size-4" />
                  Add another question
                </Button>
              ) : null}
            </div>
          </div>

          {/* PREVIEW COLUMN */}
          <div className="lg:sticky lg:top-4 lg:self-start">
            <LivePreview
              title={title}
              description={description}
              fields={fields}
              status={status}
            />
          </div>
        </div>

        {/* Advanced settings — collapsible */}
        <AdvancedSettings
          visibility={visibility}
          status={status}
          responseLimit={responseLimit}
          expiresAt={expiresAt}
          isTemplate={isTemplate}
          themeId={themeId}
          statusTone={statusTone}
          onVisibilityChange={setVisibility}
          onStatusChange={setStatus}
          onResponseLimitChange={setResponseLimit}
          onExpiresAtChange={setExpiresAt}
          onIsTemplateChange={setIsTemplate}
          onThemeChange={setThemeId}
        />
      </div>
    </GalacticShell>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Subcomponents
// ──────────────────────────────────────────────────────────────────────────

function BuilderTab({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: typeof Inbox;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md border border-stone-300/20 bg-stone-100/3 px-2.5 py-1.5 text-xs text-stone-200 transition hover:border-amber-200/35 hover:bg-amber-100/6 hover:text-amber-100"
    >
      <Icon className="size-3.5" />
      {children}
    </Link>
  );
}

function SaveIndicator({
  dirty,
  saving,
  lastSavedAt,
  error,
}: {
  dirty: boolean;
  saving: boolean;
  lastSavedAt: Date | null;
  error: string | null;
}) {
  if (error) {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-rose-300/30 bg-rose-300/10 px-2.5 py-1.5 text-xs text-rose-200">
        Save failed: {error}
      </span>
    );
  }
  if (saving) {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-stone-300/20 bg-stone-100/5 px-2.5 py-1.5 text-xs text-stone-200">
        <Loader2 className="size-3.5 animate-spin" />
        Saving…
      </span>
    );
  }
  if (dirty) {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-amber-300/30 bg-amber-300/10 px-2.5 py-1.5 text-xs text-amber-200">
        <span className="size-1.5 rounded-full bg-amber-300" />
        Unsaved changes
      </span>
    );
  }
  if (lastSavedAt) {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-emerald-300/25 bg-emerald-300/8 px-2.5 py-1.5 text-xs text-emerald-200">
        <span className="size-1.5 rounded-full bg-emerald-300" />
        Saved {relativeTime(lastSavedAt)}
      </span>
    );
  }
  return null;
}

function MetadataStrip({
  title,
  slug,
  description,
  status,
  visibility,
  onTitleChange,
  onSlugChange,
  onDescriptionChange,
}: {
  title: string;
  slug: string;
  description: string;
  status: FormStatus;
  visibility: FormVisibility;
  onTitleChange: (v: string) => void;
  onSlugChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
}) {
  const statusTone = STATUS_TONE[status] ?? STATUS_TONE.draft;

  return (
    <div className="askly-card-glass relative overflow-hidden p-5">
      <div className="askly-scan-line opacity-20" aria-hidden />
      <div className="relative grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]",
                statusTone.pill,
              )}
            >
              <motion.span
                className={cn("size-1 rounded-full", statusTone.dot)}
                animate={
                  status === "published"
                    ? { opacity: [0.5, 1, 0.5], scale: [1, 1.4, 1] }
                    : undefined
                }
                transition={
                  status === "published"
                    ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
                    : undefined
                }
              />
              {statusTone.label}
            </span>
            <span className="rounded-full border border-stone-300/20 bg-stone-100/4 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-stone-300/70">
              {visibility === "public" ? "Public" : "Unlisted"}
            </span>
          </div>

          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Untitled form"
            className="w-full bg-transparent text-2xl font-semibold tracking-tight text-stone-50 placeholder:text-stone-500 focus:outline-none"
          />

          <div className="flex items-center gap-2 text-xs text-stone-400/80">
            <span className="font-mono text-stone-400/70">/forms/</span>
            <input
              value={slug}
              onChange={(e) =>
                onSlugChange(
                  e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                )
              }
              className="bg-transparent font-mono text-amber-100/85 focus:outline-none"
            />
          </div>

          <textarea
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Short description for respondents (optional)…"
            rows={2}
            className="w-full resize-none bg-transparent text-sm text-stone-300/85 placeholder:text-stone-500/70 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

function FieldTypePalette({ onAdd }: { onAdd: (t: FieldType) => void }) {
  const types: FieldType[] = [
    "short_text",
    "long_text",
    "email",
    "number",
    "single_select",
    "multi_select",
    "checkbox",
    "rating",
    "date",
  ];

  return (
    <div className="askly-card-glass p-3">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="size-3.5 text-amber-200/80" />
        <p className="text-[10px] uppercase tracking-[0.18em] text-stone-300/65">
          Insert field
        </p>
      </div>
      {/* flex-wrap, NOT a fixed 9-col grid. The fixed grid (was
          `md:grid-cols-9`) gave each cell ~67px on a typical canvas
          width, which truncated longer labels like "Multiple choice"
          to "Multipl…" — making the buttons unreadable. Intrinsic-
          width buttons with wrapping let every label show in full
          and naturally form a second row on narrow viewports. */}
      <div className="flex flex-wrap gap-1.5">
        {types.map((type) => {
          const meta = FIELD_TYPE_META[type];
          const Icon = meta.icon;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onAdd(type)}
              title={`${meta.label} — ${meta.blurb}`}
              className="group inline-flex items-center gap-1.5 rounded-md border border-stone-300/12 bg-stone-100/3 px-2.5 py-1.5 text-xs text-stone-300/85 transition hover:border-amber-200/35 hover:bg-amber-100/6 hover:text-amber-100"
            >
              <Icon className={cn("size-3.5 transition", meta.accent, "group-hover:text-amber-100")} />
              <span>{meta.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FieldCard({
  field,
  index,
  selected,
  onSelect,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  precedingFields,
}: {
  field: EditableField;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<EditableField>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  // Fields above this one in the form, eligible as conditional-logic
  // targets. Only fields that have been saved (have an `id`) are
  // included — unsaved fields don't have a stable identifier yet.
  precedingFields: Array<{ id: string; label: string }>;
}) {
  const meta = FIELD_TYPE_META[field.type];
  const Icon = meta.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      onClick={onSelect}
      className={cn(
        "askly-card-glass group relative overflow-hidden p-4 transition",
        selected ? "border-amber-200/45 ring-1 ring-amber-200/25" : "hover:border-stone-300/30",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Number + drag handle */}
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <span className="grid size-7 place-items-center rounded-md border border-stone-300/20 bg-stone-950/40 font-mono text-[11px] text-stone-300">
            {String(index + 1).padStart(2, "0")}
          </span>
          <Icon className={cn("size-3.5", meta.accent)} />
        </div>

        {/* Main editor */}
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex items-start gap-2">
            <input
              value={field.label}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder="Question label"
              onClick={(e) => e.stopPropagation()}
              className="flex-1 bg-transparent text-base font-medium text-stone-50 placeholder:text-stone-500 focus:outline-none"
            />

            {/* Type selector — shadcn Select instead of raw <select>
                so it picks up the rest of the app's styling (portal-
                rendered menu, hover/focus rings, themed colors). The
                value is the FieldType enum; we render the friendly
                label inside each item. */}
            <div onClick={(e) => e.stopPropagation()}>
              <Select
                value={field.type}
                onValueChange={(v) => {
                  const nextType = v as FieldType;
                  onChange({
                    type: nextType,
                    options:
                      SUPPORTS_OPTIONS(nextType) && field.options.length === 0
                        ? ["Option 1", "Option 2"]
                        : field.options,
                  });
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="font-mono text-[11px] uppercase tracking-wide"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FIELD_TYPE_META).map(([t, m]) => {
                    const Icon = m.icon;
                    return (
                      <SelectItem key={t} value={t}>
                        <Icon className={cn("size-3.5", m.accent)} />
                        <span>{m.label}</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Compact row: required toggle, placeholder, helptext */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* shadcn Checkbox in a chip wrapper. The chip color still
                tracks `required` state (amber on, neutral off) so the
                affordance is visible at a glance — the checkbox alone
                is small and easy to miss. */}
            <label
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 transition",
                field.required
                  ? "border-amber-200/35 bg-amber-100/8 text-amber-100"
                  : "border-stone-300/20 bg-stone-100/3 text-stone-300/85 hover:border-stone-300/35",
              )}
            >
              <Checkbox
                checked={field.required}
                onCheckedChange={(checked) =>
                  onChange({ required: checked === true })
                }
                className="size-3.5"
              />
              Required
            </label>

            <Input
              value={field.placeholder}
              onChange={(e) => onChange({ placeholder: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              placeholder="Placeholder hint…"
              className="h-8 flex-1 min-w-[140px] text-xs"
            />
            <Input
              value={field.helpText}
              onChange={(e) => onChange({ helpText: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              placeholder="Help text below input…"
              className="h-8 flex-1 min-w-[140px] text-xs"
            />
          </div>

          {/* Options editor for select types */}
          {SUPPORTS_OPTIONS(field.type) ? (
            <OptionsEditor
              options={field.options}
              onChange={(options) => onChange({ options })}
            />
          ) : null}

          {/* Rating scale picker — only meaningful for rating fields. */}
          {field.type === "rating" ? (
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 text-xs text-stone-300"
            >
              <label className="text-stone-400/75">Scale</label>
              <Select
                value={String(field.ratingMax)}
                onValueChange={(v) => onChange({ ratingMax: Number(v) })}
              >
                <SelectTrigger size="sm" className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 5, 7, 10].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      1 – {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-[10px] text-stone-400/65">stars</span>
            </div>
          ) : null}

          {/* Multi-page break — start a new page before this field. The
              very first field is implicitly the first page, so toggling
              this on field index 0 is a no-op visually. */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex flex-wrap items-center gap-2 text-xs text-stone-300"
          >
            <label className="inline-flex items-center gap-1.5">
              <Checkbox
                checked={field.pageBreak}
                onCheckedChange={(checked) =>
                  onChange({ pageBreak: checked === true })
                }
                className="size-3.5"
              />
              <span className="text-stone-300">Start new page before this field</span>
            </label>
            {field.pageBreak ? (
              <Input
                type="text"
                value={field.pageLabel}
                onChange={(e) => onChange({ pageLabel: e.target.value.slice(0, 80) })}
                placeholder="Page label (optional)"
                className="h-8 w-auto text-xs"
              />
            ) : null}
          </div>

          {/* Conditional logic — show this field only when another
              field's answer matches. Targets are restricted to fields
              ABOVE this one. If there are no eligible targets yet
              (first field, or above fields haven't been saved), we
              render a helper hint instead of a broken picker. */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex flex-wrap items-center gap-2 text-xs text-stone-300"
          >
            <label className="inline-flex items-center gap-1.5">
              <Checkbox
                checked={field.showIf !== null}
                disabled={precedingFields.length === 0}
                onCheckedChange={(checked) =>
                  onChange({
                    showIf:
                      checked === true
                        ? {
                            fieldId: precedingFields[0]?.id ?? "",
                            op: "equals",
                            value: "",
                          }
                        : null,
                  })
                }
                className="size-3.5"
              />
              <span
                className={cn(
                  "text-stone-300",
                  precedingFields.length === 0 && "text-stone-500",
                )}
              >
                Only show when…
              </span>
            </label>
            {precedingFields.length === 0 && !field.showIf ? (
              <span className="text-[10px] text-stone-500/65">
                (add fields above first)
              </span>
            ) : null}
            {field.showIf ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <Select
                  value={field.showIf.fieldId}
                  onValueChange={(v) =>
                    onChange({
                      showIf: { ...field.showIf!, fieldId: v },
                    })
                  }
                >
                  <SelectTrigger size="sm" className="min-w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {precedingFields.map((pf) => (
                      <SelectItem key={pf.id} value={pf.id}>
                        {pf.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={field.showIf.op}
                  onValueChange={(v) =>
                    onChange({
                      showIf: {
                        ...field.showIf!,
                        op: v as NonNullable<EditableField["showIf"]>["op"],
                      },
                    })
                  }
                >
                  <SelectTrigger size="sm" className="min-w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">equals</SelectItem>
                    <SelectItem value="not_equals">does not equal</SelectItem>
                    <SelectItem value="contains">contains</SelectItem>
                    <SelectItem value="is_empty">is empty</SelectItem>
                    <SelectItem value="is_not_empty">is not empty</SelectItem>
                  </SelectContent>
                </Select>
                {field.showIf.op !== "is_empty" && field.showIf.op !== "is_not_empty" ? (
                  <Input
                    type="text"
                    value={field.showIf.value}
                    onChange={(e) =>
                      onChange({
                        showIf: { ...field.showIf!, value: e.target.value },
                      })
                    }
                    placeholder="value"
                    className="h-8 w-32 text-xs"
                  />
                ) : null}
              </div>
            ) : null}
          </div>

          {/* key (advanced) */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 text-[10px] text-stone-400/65"
          >
            <span className="font-mono uppercase tracking-wider">key</span>
            <input
              value={field.key}
              onChange={(e) =>
                onChange({
                  key: e.target.value.replace(/[^a-zA-Z0-9_]/g, ""),
                })
              }
              className="bg-transparent font-mono text-stone-300 focus:outline-none"
            />
          </div>
        </div>

        {/* Right side: action cluster */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex shrink-0 flex-col items-center gap-1 opacity-60 transition group-hover:opacity-100"
        >
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            title="Move up"
            className="grid size-7 place-items-center rounded-md border border-stone-300/15 bg-stone-100/3 text-stone-300/85 transition hover:border-stone-300/35 hover:text-stone-50 disabled:opacity-30"
          >
            <ArrowUp className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            title="Move down"
            className="grid size-7 place-items-center rounded-md border border-stone-300/15 bg-stone-100/3 text-stone-300/85 transition hover:border-stone-300/35 hover:text-stone-50 disabled:opacity-30"
          >
            <ArrowDown className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Delete field"
            className="grid size-7 place-items-center rounded-md border border-stone-300/15 bg-stone-100/3 text-stone-300/85 transition hover:border-rose-300/40 hover:text-rose-200"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="rounded-md border border-stone-300/12 bg-stone-950/30 p-2.5"
    >
      <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-stone-400/75">
        Options
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {options.map((opt, i) => (
          <span
            key={`${opt}-${i}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-violet-200/25 bg-violet-200/8 px-2 py-1 text-xs text-violet-100"
          >
            <input
              value={opt}
              onChange={(e) => {
                const next = [...options];
                next[i] = e.target.value;
                onChange(next);
              }}
              className="w-auto bg-transparent text-violet-100 focus:outline-none"
              style={{ width: `${Math.max(4, opt.length)}ch` }}
            />
            <button
              type="button"
              onClick={() => onChange(options.filter((_, idx) => idx !== i))}
              className="text-violet-200/70 hover:text-rose-300"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}

        <div className="flex items-center gap-1">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                e.preventDefault();
                onChange([...options, draft.trim()]);
                setDraft("");
              }
            }}
            placeholder="add option, press Enter"
            className="h-8 w-48 border-dashed text-xs"
          />
          {draft.trim() ? (
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              onClick={() => {
                onChange([...options, draft.trim()]);
                setDraft("");
              }}
            >
              <Plus className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EmptyCanvas({ onAdd }: { onAdd: (t: FieldType) => void }) {
  return (
    <div className="askly-card-glass relative grid place-items-center overflow-hidden px-6 py-14">
      <div className="absolute inset-0 askly-orbit-mini opacity-25" aria-hidden />
      <div className="relative max-w-sm text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full border border-amber-200/30 bg-amber-100/8 text-amber-100">
          <Plus className="size-5" />
        </div>
        <h3 className="mt-3 text-lg font-semibold text-stone-50">
          A blank schema.
        </h3>
        <p className="mt-1.5 text-sm text-stone-300/80">
          Start with a question. The most common opener is a short text — name,
          email, or what they&apos;re here to tell you.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button
            size="sm"
            onClick={() => onAdd("short_text")}
            className="askly-cta-glow bg-amber-100 text-stone-900 hover:bg-amber-50"
          >
            <Type className="size-4" />
            Short text
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAdd("email")}
            className="border-stone-300/30 bg-stone-100/5 text-stone-100 hover:bg-stone-100/10"
          >
            <AtSign className="size-4" />
            Email
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAdd("rating")}
            className="border-stone-300/30 bg-stone-100/5 text-stone-100 hover:bg-stone-100/10"
          >
            <Star className="size-4" />
            Rating
          </Button>
        </div>
      </div>
    </div>
  );
}

function LivePreview({
  title,
  description,
  fields,
  status,
}: {
  title: string;
  description: string;
  fields: EditableField[];
  status: FormStatus;
}) {
  return (
    <div className="askly-card-glass relative overflow-hidden">
      {/* Browser chrome */}
      <div className="flex items-center justify-between border-b border-stone-300/12 bg-stone-950/40 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-rose-400/70" />
          <span className="size-2.5 rounded-full bg-amber-300/70" />
          <span className="size-2.5 rounded-full bg-emerald-300/70" />
        </div>
        <p className="font-mono text-[10px] text-stone-400/75">
          askly.dev / forms / preview
        </p>
        <span
          className={cn(
            "rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em]",
            STATUS_TONE[status].pill,
          )}
        >
          {STATUS_TONE[status].label}
        </span>
      </div>

      <div className="space-y-4 p-5 max-h-[640px] overflow-y-auto">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-stone-50">
            {title || "Untitled form"}
          </h2>
          {description ? (
            <p className="text-sm text-stone-300/80">{description}</p>
          ) : (
            <p className="text-xs italic text-stone-500/65">
              Add a description to give respondents context.
            </p>
          )}
        </div>

        {fields.length === 0 ? (
          <div className="rounded-md border border-dashed border-stone-300/15 bg-stone-100/2 p-6 text-center text-sm text-stone-400/75">
            Preview will appear here as you add fields.
          </div>
        ) : (
          <div className="space-y-4">
            {fields.map((field, i) => (
              <PreviewField key={field.id ?? `prev-${i}`} field={field} />
            ))}

            {/* Preview submit — INTENTIONALLY a div (not a button) so
                there's no clickable element here. Multiple users have
                tried clicking the preview's submit and concluded the
                editor was broken. Making this look obviously static
                (lock icon + low-contrast stone tones + "preview only"
                label embedded in the affordance itself) is the
                cheapest fix. The real way to test is "Open public form"
                from the share-link bar above. */}
            <div
              aria-disabled="true"
              className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-stone-300/15 bg-stone-100/3 px-4 py-2.5 text-sm font-medium text-stone-500/70"
            >
              <Lock className="size-3.5" />
              Submit (preview only)
            </div>
            <p className="text-center text-[10px] text-stone-500/70">
              This is a static preview. Publish + open the public form to test submissions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewField({ field }: { field: EditableField }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-stone-100">
          {field.label || "Question"}
          {field.required ? <span className="ml-1 text-rose-300">*</span> : null}
        </label>
      </div>

      <PreviewControl field={field} />

      {field.helpText ? (
        <p className="text-[11px] text-stone-400/75">{field.helpText}</p>
      ) : null}
    </div>
  );
}

function PreviewControl({ field }: { field: EditableField }) {
  const baseInput =
    "w-full rounded-md border border-stone-300/20 bg-stone-950/40 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-500/70 focus:outline-none";

  switch (field.type) {
    case "short_text":
    case "email":
    case "number":
      return (
        <input
          disabled
          type={field.type === "number" ? "number" : field.type === "email" ? "email" : "text"}
          placeholder={field.placeholder || "Your answer"}
          className={baseInput}
        />
      );
    case "long_text":
      return (
        <textarea
          disabled
          rows={3}
          placeholder={field.placeholder || "Your detailed answer"}
          className={cn(baseInput, "resize-none")}
        />
      );
    case "date":
      return <input disabled type="date" className={baseInput} />;
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-sm text-stone-200">
          <input disabled type="checkbox" className="size-4 accent-amber-200" />
          {field.placeholder || "Yes"}
        </label>
      );
    case "rating":
      return (
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={cn(
                "size-5",
                n <= 3 ? "fill-amber-200/85 text-amber-200/85" : "text-stone-500/70",
              )}
            />
          ))}
        </div>
      );
    case "single_select":
      return (
        <div className="space-y-1.5">
          {(field.options.length > 0 ? field.options : ["Option 1"]).map((opt) => (
            <label
              key={opt}
              className="flex cursor-default items-center gap-2 rounded-md border border-stone-300/15 bg-stone-100/3 px-2.5 py-1.5 text-sm text-stone-200"
            >
              <input disabled type="radio" name={field.key} className="accent-amber-200" />
              {opt}
            </label>
          ))}
        </div>
      );
    case "multi_select":
      return (
        <div className="space-y-1.5">
          {(field.options.length > 0 ? field.options : ["Option 1"]).map((opt) => (
            <label
              key={opt}
              className="flex cursor-default items-center gap-2 rounded-md border border-stone-300/15 bg-stone-100/3 px-2.5 py-1.5 text-sm text-stone-200"
            >
              <input disabled type="checkbox" className="size-3.5 accent-amber-200" />
              {opt}
            </label>
          ))}
        </div>
      );
    default:
      return <input disabled className={baseInput} />;
  }
}

function AdvancedSettings({
  visibility,
  status,
  responseLimit,
  expiresAt,
  isTemplate,
  themeId,
  statusTone,
  onVisibilityChange,
  onStatusChange,
  onResponseLimitChange,
  onExpiresAtChange,
  onIsTemplateChange,
  onThemeChange,
}: {
  visibility: FormVisibility;
  status: FormStatus;
  responseLimit: string;
  expiresAt: string;
  isTemplate: boolean;
  themeId: string | null;
  statusTone: (typeof STATUS_TONE)[FormStatus];
  onVisibilityChange: (v: FormVisibility) => void;
  onStatusChange: (s: FormStatus) => void;
  onResponseLimitChange: (v: string) => void;
  onExpiresAtChange: (v: string) => void;
  onIsTemplateChange: (v: boolean) => void;
  onThemeChange: (v: string | null) => void;
}) {
  void statusTone;
  // Themes are catalog data — fetched once and reused. Cache long; data
  // doesn't change between edits, no need for refetchOnFocus.
  const themesQuery = trpc.themes.list.useQuery(undefined, {
    staleTime: 10 * 60_000,
  });
  const themes = themesQuery.data ?? [];
  return (
    <details className="askly-card-glass group/details p-5 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          <p className="askly-section-eyebrow">Mission parameters</p>
          <span className="text-[11px] text-stone-400/65">
            visibility · status · limits · template
          </span>
        </div>
        <span className="text-xs text-stone-300/65 transition group-open/details:rotate-180">
          ▾
        </span>
      </summary>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SettingBlock label="Visibility">
          <Select
            value={visibility}
            onValueChange={(v) => onVisibilityChange(v as FormVisibility)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unlisted">Unlisted</SelectItem>
              <SelectItem value="public">Public</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-1 text-[10px] text-stone-400/70">
            Public forms appear on /explore.
          </p>
        </SettingBlock>

        <SettingBlock label="Status">
          <Select
            value={status}
            onValueChange={(v) => onStatusChange(v as FormStatus)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="unpublished">Paused</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-1 text-[10px] text-stone-400/70">
            Only Published forms receive responses.
          </p>
        </SettingBlock>

        <SettingBlock label="Response cap">
          <Input
            type="number"
            value={responseLimit}
            onChange={(e) => onResponseLimitChange(e.target.value)}
            placeholder="Unlimited"
            className="w-full"
          />
          <p className="mt-1 text-[10px] text-stone-400/70">
            Hard limit, server-enforced.
          </p>
        </SettingBlock>

        <SettingBlock label="Expires on">
          <Input
            type="date"
            value={expiresAt}
            onChange={(e) => onExpiresAtChange(e.target.value)}
            className="w-full"
          />
          <p className="mt-1 text-[10px] text-stone-400/70">
            Closes submissions after this date.
          </p>
        </SettingBlock>

        <SettingBlock label="Theme">
          {/* Empty-string sentinel means "default theme". shadcn Select
              treats `""` as "no value" and won't render it, so we use
              "__default__" as the sentinel in the trigger and translate
              both directions. */}
          <Select
            value={themeId ?? "__default__"}
            onValueChange={(v) =>
              onThemeChange(v === "__default__" ? null : v)
            }
            disabled={themesQuery.isLoading}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">Default (Spice Sand)</SelectItem>
              {themes.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-[10px] text-stone-400/70">
            Applies accent + palette to the public form page.
          </p>
        </SettingBlock>

        <label className="col-span-full inline-flex items-center gap-2.5 rounded-md border border-stone-300/15 bg-stone-100/3 px-3 py-2 text-sm text-stone-200">
          <Checkbox
            checked={isTemplate}
            onCheckedChange={(checked) => onIsTemplateChange(checked === true)}
          />
          Mark as reusable template
        </label>
      </div>
    </details>
  );
}

function SettingBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-stone-300/65">
        {label}
      </p>
      {children}
    </div>
  );
}
