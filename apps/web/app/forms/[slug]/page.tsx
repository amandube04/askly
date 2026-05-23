"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  CircleAlert,
  Home,
  Loader2,
  Lock,
  Send,
  Sparkles,
  Star,
} from "lucide-react";
import Link from "next/link";
import { AsklyLogo } from "~/components/branding/askly-logo";
import { Starfield } from "~/components/landing/starfield";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";
import { evaluateShowIf, type ShowIfRule } from "@repo/validators";

type AnswerValue = string | number | boolean | string[] | null;
const VISITOR_ID_STORAGE_PREFIX = "askly.formVisitorId.";

function normalizeFieldConfig(config: unknown): {
  options: string[];
  placeholder?: string;
  helpText?: string;
} {
  if (!config || typeof config !== "object") return { options: [] };
  const maybe = config as { options?: unknown; placeholder?: unknown; helpText?: unknown };
  return {
    options: Array.isArray(maybe.options) ? maybe.options.filter((i) => typeof i === "string") : [],
    placeholder: typeof maybe.placeholder === "string" ? maybe.placeholder : undefined,
    helpText: typeof maybe.helpText === "string" ? maybe.helpText : undefined,
  };
}

function isEmptyAnswer(value: AnswerValue | undefined): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim().length === 0) ||
    (Array.isArray(value) && value.length === 0)
  );
}

// Pulls a `showIf` rule out of a field's loose-typed config (server returns
// it as `unknown`) and evaluates it against the live answer map. Defensive:
// any malformed rule degrades to "always visible" rather than throwing.
function isFieldVisible(
  field: { config?: unknown },
  answers: Record<string, AnswerValue>,
): boolean {
  const config =
    field.config && typeof field.config === "object"
      ? (field.config as { showIf?: unknown })
      : {};
  const raw = config.showIf;
  if (!raw || typeof raw !== "object") return true;
  const r = raw as { fieldId?: unknown; op?: unknown; value?: unknown };
  if (typeof r.fieldId !== "string") return true;
  const validOps = ["equals", "not_equals", "contains", "is_empty", "is_not_empty"] as const;
  const op = validOps.find((o) => o === r.op);
  if (!op) return true;
  // `value` is optional and stringified — the editor only emits strings.
  const value =
    typeof r.value === "string" || typeof r.value === "number" || typeof r.value === "boolean"
      ? r.value
      : undefined;
  const rule: ShowIfRule = { fieldId: r.fieldId, op, value };
  // Cast `answers` to the loose record evaluateShowIf expects.
  return evaluateShowIf(rule, answers as Record<string, unknown>);
}

export default function PublicFormPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : "";

  const [respondentEmail, setRespondentEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitted, setSubmitted] = useState(false);
  const [visitorId, setVisitorId] = useState("");
  const [hasTrackedStart, setHasTrackedStart] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  // Honeypot value — humans never see/touch this field, but most form-scraping
  // bots fill every visible input including hidden ones with plausible data.
  // The server rejects any non-empty honeypot. Was previously hardcoded to
  // "" on the client which meant the honeypot deflected nothing.
  const [honeypotValue, setHoneypotValue] = useState("");

  const formQuery = trpc.forms.getBySlug.useQuery({ slug }, { enabled: slug.length > 0 });
  const trackEventMutation = trpc.analytics.trackEvent.useMutation();
  const submitMutation = trpc.responses.submit.useMutation({
    onSuccess: () => {
      if (visitorId && formQuery.data?.slug) {
        trackEventMutation.mutate({
          slug: formQuery.data.slug,
          eventType: "submit",
          visitorId,
        });
      }
      setSubmitted(true);
    },
  });

  useEffect(() => {
    if (!slug) return;
    const storageKey = `${VISITOR_ID_STORAGE_PREFIX}${slug}`;
    const existing = window.localStorage.getItem(storageKey);
    if (existing) {
      setVisitorId(existing);
      return;
    }
    const generated =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(storageKey, generated);
    setVisitorId(generated);
  }, [slug]);

  useEffect(() => {
    if (!formQuery.data?.slug || !visitorId) return;
    trackEventMutation.mutate({
      slug: formQuery.data.slug,
      eventType: "view",
      visitorId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formQuery.data?.slug, visitorId]);

  const sortedFields = useMemo(() => {
    const fields = formQuery.data?.fields ?? [];
    return [...fields].sort((a, b) => a.order - b.order);
  }, [formQuery.data?.fields]);

  // Group fields into pages for the multi-page renderer. A new page starts
  // at the very first field AND at every field whose `config.pageBreak` is
  // truthy. Pages with no fields are impossible by construction. When NO
  // field has pageBreak set, this collapses to a single page containing
  // every field (Google-Forms-style single-page rendering); the per-field
  // step model is replaced by per-page stepping.
  const pages = useMemo(() => {
    type Page = { label: string | null; fields: typeof sortedFields };
    const groups: Page[] = [];
    for (const field of sortedFields) {
      const config =
        field.config && typeof field.config === "object"
          ? (field.config as { pageBreak?: unknown; pageLabel?: unknown })
          : {};
      const isBreak = config.pageBreak === true;
      const label =
        typeof config.pageLabel === "string" && config.pageLabel.length > 0
          ? config.pageLabel
          : null;
      if (groups.length === 0 || isBreak) {
        groups.push({ label, fields: [] });
      }
      groups[groups.length - 1]!.fields.push(field);
    }
    return groups;
  }, [sortedFields]);

  // Theme styling is best-effort: if the form has no theme or the theme's
  // configJson is malformed, fall back to the Spice Sand defaults. Renderer
  // never crashes on bad theme data.
  const theme = useMemo(() => {
    const raw = formQuery.data?.theme;
    if (!raw) return null;
    const config =
      raw.configJson && typeof raw.configJson === "object"
        ? (raw.configJson as Record<string, unknown>)
        : {};
    const accent =
      typeof config.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(config.accent)
        ? config.accent
        : "#fcd34d"; // Spice Sand amber-200 fallback
    return { name: raw.name, accent };
  }, [formQuery.data?.theme]);

  // Step 0 = email pane, then one step PER PAGE (a page is 1+ fields).
  // For forms with no pageBreaks set, pages.length === 1 and the whole form
  // shows on a single screen — Google-Forms-style. With breaks, each section
  // gets its own screen.
  const totalSteps = pages.length + 1;
  const progressPercent = Math.max(8, Math.round(((currentStep + 1) / Math.max(totalSteps, 1)) * 100));

  useEffect(() => {
    setCurrentStep(0);
    setValidationMessage(null);
  }, [formQuery.data?.slug]);

  const markFormStart = () => {
    if (hasTrackedStart || !visitorId || !formQuery.data?.slug) return;
    trackEventMutation.mutate({
      slug: formQuery.data.slug,
      eventType: "start",
      visitorId,
    });
    setHasTrackedStart(true);
  };

  const setAnswerValue = (fieldId: string, value: AnswerValue) => {
    markFormStart();
    setAnswers((p) => ({ ...p, [fieldId]: value }));
    setValidationMessage(null);
  };

  // currentPage is the group of fields the user is on, or null when they're
  // on the email pane (step 0). When the form is completely empty, this is
  // also null.
  const currentPage = currentStep > 0 ? pages[currentStep - 1] ?? null : null;

  // Block forward navigation until every required AND visible field on the
  // CURRENT page has a non-empty answer. Fields hidden by their `showIf`
  // rule are skipped entirely — both for rendering AND for the
  // required-check, so creators can't accidentally trap respondents.
  const missingRequiredInCurrentPage = () => {
    if (!currentPage) return null;
    return (
      currentPage.fields.find(
        (f) =>
          f.required &&
          isFieldVisible(f, answers) &&
          isEmptyAnswer(answers[f.id]),
      ) ?? null
    );
  };

  const canMoveForward = () => missingRequiredInCurrentPage() === null;

  const moveToNextStep = () => {
    const missing = missingRequiredInCurrentPage();
    if (missing) {
      setValidationMessage(`"${missing.label}" is required to continue.`);
      return;
    }
    setValidationMessage(null);
    setCurrentStep((p) => Math.min(p + 1, totalSteps - 1));
  };

  const moveToPreviousStep = () => {
    setValidationMessage(null);
    setCurrentStep((p) => Math.max(p - 1, 0));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formQuery.data) return;

    // Skip required-checks for fields the user never saw because of a
    // failing `showIf` rule. The server applies the same filter, so this
    // keeps client and server in lockstep.
    const missing = sortedFields.find(
      (f) =>
        f.required &&
        isFieldVisible(f, answers) &&
        isEmptyAnswer(answers[f.id]),
    );
    if (missing) {
      setValidationMessage(`"${missing.label}" is required before submission.`);
      // Hop the user back to the page that contains the missing field so
      // they can see what to fix. Otherwise the error message would point
      // at a field that isn't visible on the current page.
      const pageIndex = pages.findIndex((p) =>
        p.fields.some((f) => f.id === missing.id),
      );
      if (pageIndex >= 0) setCurrentStep(pageIndex + 1);
      return;
    }

    // Only ship visible-and-filled answers. Hidden fields get scrubbed
    // both client-side (here) and server-side (defense in depth).
    const payloadAnswers = sortedFields
      .filter((f) => isFieldVisible(f, answers))
      .map((f) => ({ fieldId: f.id, value: answers[f.id] }))
      .filter((item) => !isEmptyAnswer(item.value))
      .map((item) => ({ fieldId: item.fieldId, value: item.value }));

    submitMutation.mutate({
      slug: formQuery.data.slug,
      respondentEmail: respondentEmail.trim().length > 0 ? respondentEmail.trim() : undefined,
      // Real bots typically auto-fill all input fields — including ones marked
      // hidden via CSS. If this is non-empty, it's a bot; the server will reject.
      honeypot: honeypotValue,
      answers: payloadAnswers,
    });
  };

  // ── Shell ──────────────────────────────────────────────────────────────
  return (
    <main className="askly-landing min-h-screen">
      <div className="askly-landing-grain" aria-hidden />
      <div className="askly-aurora" aria-hidden />
      <Starfield />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col px-5 py-6 sm:py-10">
        {/*
          Honeypot — invisible to users but visible to bots that auto-fill
          every input on a page. Three layers of hiding:
            1. `sr-only` (clip-path + absolute positioning) hides it from
               sighted users without using `display:none` (which some bots
               skip).
            2. `tabIndex={-1}` keeps it out of keyboard navigation.
            3. `autoComplete="off"` + `aria-hidden` prevent browser autofill
               and screen readers from announcing it.
          The name `website` is intentionally generic — bots fill it readily.
        */}
        <input
          type="text"
          name="website"
          value={honeypotValue}
          onChange={(e) => setHoneypotValue(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="sr-only"
        />

        {/* Top brand bar */}
        <div className="flex items-center justify-between">
          <Link href="/" className="text-stone-100">
            <AsklyLogo />
          </Link>
          <Link
            href="/explore"
            className="text-xs text-stone-400/80 transition hover:text-amber-100"
          >
            Browse public forms
          </Link>
        </div>

        <div className="flex flex-1 items-center">
          <div className="w-full">
            {formQuery.isLoading ? (
              <LoadingState />
            ) : formQuery.error ? (
              <ErrorState message={formQuery.error.message} />
            ) : !formQuery.data ? (
              <ErrorState message="This form was not found or is no longer available." />
            ) : submitted ? (
              <ThankYouState
                formTitle={formQuery.data.title}
                formSlug={formQuery.data.slug}
              />
            ) : (
              <FormSurface
                title={formQuery.data.title}
                description={formQuery.data.description ?? null}
                progressPercent={progressPercent}
                currentStep={currentStep}
                totalSteps={totalSteps}
                onSubmit={onSubmit}
                respondentEmail={respondentEmail}
                onEmailChange={(v) => {
                  markFormStart();
                  setRespondentEmail(v);
                }}
                currentPage={currentPage}
                answers={answers}
                setAnswerValue={setAnswerValue}
                validationMessage={validationMessage}
                submitError={submitMutation.error?.message ?? null}
                isSubmitting={submitMutation.isPending}
                onPrev={moveToPreviousStep}
                onNext={moveToNextStep}
                canMoveForward={canMoveForward()}
                isLastStep={currentStep >= totalSteps - 1}
                theme={theme}
              />
            )}
          </div>
        </div>

        <p className="mt-8 text-center text-[10px] uppercase tracking-[0.18em] text-stone-500/65">
          Powered by Askly · responses are encrypted in transit
        </p>
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Surfaces
// ──────────────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="askly-card-glass relative overflow-hidden p-10 text-center">
      <div className="askly-scan-line opacity-30" aria-hidden />
      <Loader2 className="mx-auto size-6 animate-spin text-amber-200/80" />
      <p className="mt-3 text-sm text-stone-300/80">Opening secure channel…</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="askly-card-glass p-10 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-full border border-rose-300/30 bg-rose-300/8 text-rose-200">
        <CircleAlert className="size-5" />
      </div>
      <h1 className="mt-4 text-2xl font-semibold text-stone-50">Form unavailable</h1>
      <p className="mt-2 text-sm text-stone-300/80">{message}</p>
      <Button
        asChild
        className="askly-cta-glow mt-5 gap-2 bg-amber-100 text-stone-900 hover:bg-amber-50"
      >
        <Link href="/explore">
          <Sparkles className="size-4" />
          Browse public forms
        </Link>
      </Button>
    </div>
  );
}

type RendererField = {
  id: string;
  type: string;
  label: string;
  required: boolean;
  config?: unknown;
};

function FormSurface(props: {
  title: string;
  description: string | null;
  progressPercent: number;
  currentStep: number;
  totalSteps: number;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  respondentEmail: string;
  onEmailChange: (value: string) => void;
  // Current page = a group of 1+ fields rendered together. Null on the
  // email pane (step 0) and on empty forms. Replaces the old single-field
  // `currentField` model now that the renderer supports multi-page forms.
  currentPage: { label: string | null; fields: RendererField[] } | null;
  answers: Record<string, AnswerValue>;
  setAnswerValue: (fieldId: string, value: AnswerValue) => void;
  validationMessage: string | null;
  submitError: string | null;
  isSubmitting: boolean;
  onPrev: () => void;
  onNext: () => void;
  canMoveForward: boolean;
  isLastStep: boolean;
  // Null when the form has no theme assigned — the renderer falls back to
  // the default Spice Sand amber accent.
  theme: { name: string; accent: string } | null;
}) {
  // Inline styles let us tint Tailwind-styled elements with the theme's
  // accent color without generating a full set of dynamic classes. The
  // accent feeds the progress bar gradient and the primary CTA background.
  const accent = props.theme?.accent ?? "#fcd34d";
  return (
    <div className="space-y-4">
      <div className="askly-card-glass relative overflow-hidden">
        <div className="askly-scan-line opacity-20" aria-hidden />

        {/* Header */}
        <div className="relative px-6 pt-6">
          <div className="flex items-center gap-2">
            <p className="askly-section-eyebrow">Live form</p>
            {props.theme ? (
              <span
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]"
                style={{
                  borderColor: `${accent}55`,
                  backgroundColor: `${accent}11`,
                  color: accent,
                }}
              >
                <span
                  className="inline-block size-1.5 rounded-full"
                  style={{ backgroundColor: accent }}
                />
                {props.theme.name}
              </span>
            ) : null}
          </div>
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-stone-50 sm:text-4xl">
            {props.title}
          </h1>
          {props.description ? (
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-stone-300/85">
              {props.description}
            </p>
          ) : null}

          <div className="mt-5 flex items-center gap-3 text-xs text-stone-400/85">
            <span className="font-mono tabular-nums">
              Step {props.currentStep + 1} of {props.totalSteps}
            </span>
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-stone-900/70">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  backgroundImage: `linear-gradient(to right, ${accent}, ${accent}aa)`,
                }}
                initial={false}
                animate={{ width: `${props.progressPercent}%` }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        </div>

        {/* Step body */}
        <form onSubmit={props.onSubmit} className="relative px-6 pb-6 pt-6">
          <div className="relative min-h-[280px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={props.currentStep}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
              >
                {props.currentStep === 0 ? (
                  <EmailStep
                    value={props.respondentEmail}
                    onChange={props.onEmailChange}
                  />
                ) : props.currentPage ? (
                  <PageStep
                    page={props.currentPage}
                    answers={props.answers}
                    setAnswerValue={props.setAnswerValue}
                  />
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>

          {props.validationMessage ? (
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-rose-300">
              <CircleAlert className="size-3" />
              {props.validationMessage}
            </p>
          ) : null}
          {props.submitError ? (
            <p className="mt-4 rounded-md border border-rose-300/30 bg-rose-300/8 p-2.5 text-xs text-rose-200">
              {props.submitError}
            </p>
          ) : null}

          {/* Footer actions */}
          <div className="mt-6 flex items-center justify-between gap-2 border-t border-stone-300/10 pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={props.onPrev}
              disabled={props.currentStep <= 0}
              className="border-stone-300/25 bg-stone-100/4 text-stone-200 hover:bg-stone-100/10 disabled:opacity-40"
            >
              <ArrowLeft className="size-4" />
              Back
            </Button>

            {!props.isLastStep ? (
              <Button
                type="button"
                onClick={props.onNext}
                size="sm"
                className={cn(
                  "askly-cta-glow gap-2 text-stone-900",
                  !props.canMoveForward && "opacity-60",
                )}
                // Inline tint overrides the default amber so the CTA
                // matches whatever theme the creator picked.
                style={{ backgroundColor: accent }}
              >
                Next
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="sm"
                disabled={props.isSubmitting}
                className="askly-cta-glow gap-2 text-stone-900"
                style={{ backgroundColor: accent }}
              >
                {props.isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <Send className="size-4" />
                    Submit response
                  </>
                )}
              </Button>
            )}
          </div>
        </form>
      </div>

      <p className="px-2 text-center text-[10px] text-stone-500/65">
        <Lock className="mr-1 inline-block size-2.5" />
        Anti-spam: rate-limit + honeypot + duplicate-submission guard active
      </p>
    </div>
  );
}

function EmailStep({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="askly-section-eyebrow">Your email</label>
      <p className="text-xl font-semibold text-stone-50">
        How should we follow up? <span className="text-stone-500">(optional)</span>
      </p>
      <p className="text-sm text-stone-300/85">
        Skip to stay anonymous. If you provide an email, we&apos;ll send you a
        copy of your response.
      </p>
      <input
        type="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="you@example.com"
        className="mt-2 w-full rounded-md border border-stone-300/20 bg-stone-950/60 px-4 py-3 text-base text-stone-50 placeholder:text-stone-500 focus:border-amber-200/40 focus:outline-none focus:ring-1 focus:ring-amber-200/30"
        autoFocus
      />
    </div>
  );
}

// Renders a single page of fields stacked on one screen. When a page has
// exactly one field this mirrors the original Typeform-style "one question
// per screen" UX; when it has multiple fields the user sees a Google-Forms
// style section. The component is intentionally dumb — it doesn't know
// about validation, navigation, or the page's index. All wiring stays in
// the parent.
function PageStep({
  page,
  answers,
  setAnswerValue,
}: {
  page: { label: string | null; fields: RendererField[] };
  answers: Record<string, AnswerValue>;
  setAnswerValue: (fieldId: string, value: AnswerValue) => void;
}) {
  // Apply conditional logic at render time so the visible field set reacts
  // to live answer changes. Hidden fields collapse out of the page; the
  // user never sees them and the required-check skips them too.
  const visibleFields = page.fields.filter((f) => isFieldVisible(f, answers));
  return (
    <div className="space-y-6">
      {page.label ? (
        <div className="border-b border-stone-300/10 pb-2">
          <p className="askly-section-eyebrow">Section</p>
          <h2 className="mt-1 text-balance text-xl font-semibold text-stone-50">
            {page.label}
          </h2>
        </div>
      ) : null}
      {visibleFields.length === 0 ? (
        <p className="rounded-md border border-stone-300/12 bg-stone-100/3 p-4 text-center text-xs text-stone-400/70">
          No questions on this page yet — based on your earlier answers, this
          section was skipped automatically.
        </p>
      ) : null}
      {visibleFields.map((field, idx) => (
        <div
          key={field.id}
          className={cn(
            idx > 0 && "border-t border-stone-300/8 pt-6",
          )}
        >
          <FieldStep
            field={field}
            value={answers[field.id]}
            onChange={(v) => setAnswerValue(field.id, v)}
          />
        </div>
      ))}
    </div>
  );
}

function FieldStep({
  field,
  value,
  onChange,
}: {
  field: { id: string; type: string; label: string; required: boolean; config?: unknown };
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
}) {
  const config = normalizeFieldConfig(field.config);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="askly-section-eyebrow">Question</p>
        {field.required ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-300/30 bg-rose-300/8 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em] text-rose-200">
            Required
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-stone-300/20 bg-stone-100/4 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em] text-stone-400">
            Optional
          </span>
        )}
      </div>

      <h2 className="text-balance text-2xl font-semibold text-stone-50 sm:text-3xl">
        {field.label}
      </h2>
      {config.helpText ? (
        <p className="text-sm text-stone-300/85">{config.helpText}</p>
      ) : null}

      <div className="pt-3">
        <FieldInput field={field} config={config} value={value} onChange={onChange} />
      </div>
    </div>
  );
}

function FieldInput({
  field,
  config,
  value,
  onChange,
}: {
  field: { id: string; type: string; label: string };
  // ratingMax is optional in the inbound config (older forms predate the
  // field). Renderer defaults to 5 — matches the validator default.
  config: { options: string[]; placeholder?: string; ratingMax?: number };
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
}) {
  switch (field.type) {
    case "short_text":
    case "email":
      return (
        <input
          type={field.type === "email" ? "email" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={config.placeholder ?? "Type your answer…"}
          className="w-full rounded-md border border-stone-300/20 bg-stone-950/60 px-4 py-3 text-base text-stone-50 placeholder:text-stone-500 focus:border-amber-200/40 focus:outline-none focus:ring-1 focus:ring-amber-200/30"
          autoFocus
        />
      );

    case "long_text":
      return (
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={config.placeholder ?? "Take your time. Markdown is fine."}
          rows={4}
          className="w-full resize-none rounded-md border border-stone-300/20 bg-stone-950/60 px-4 py-3 text-base text-stone-50 placeholder:text-stone-500 focus:border-amber-200/40 focus:outline-none focus:ring-1 focus:ring-amber-200/30"
          autoFocus
        />
      );

    case "number":
      return (
        <input
          type="number"
          value={typeof value === "number" ? value : ""}
          onChange={(e) =>
            onChange(e.target.value.trim() === "" ? null : Number(e.target.value))
          }
          placeholder={config.placeholder ?? "0"}
          className="w-full rounded-md border border-stone-300/20 bg-stone-950/60 px-4 py-3 text-base font-mono text-stone-50 placeholder:text-stone-500 focus:border-amber-200/40 focus:outline-none focus:ring-1 focus:ring-amber-200/30"
          autoFocus
        />
      );

    case "single_select":
      return (
        <div className="grid gap-2">
          {config.options.map((option, i) => {
            const isSelected = value === option;
            return (
              <motion.button
                key={option}
                type="button"
                onClick={() => onChange(option)}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-left text-sm transition",
                  isSelected
                    ? "border-amber-200/50 bg-amber-100/8 text-stone-50"
                    : "border-stone-300/15 bg-stone-100/2 text-stone-200 hover:border-stone-300/30 hover:bg-stone-100/5",
                )}
              >
                <span className="flex items-center gap-3">
                  <span
                    className={cn(
                      "grid size-5 place-items-center rounded-full border",
                      isSelected
                        ? "border-amber-200 bg-amber-100/20"
                        : "border-stone-400/40",
                    )}
                  >
                    {isSelected ? <div className="size-2 rounded-full bg-amber-200" /> : null}
                  </span>
                  {option}
                </span>
                <span className="font-mono text-[10px] text-stone-500/65">
                  {String.fromCharCode(65 + i)}
                </span>
              </motion.button>
            );
          })}
        </div>
      );

    case "multi_select": {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div className="grid gap-2">
          <p className="text-[10px] uppercase tracking-[0.16em] text-stone-400/70">
            Select all that apply
          </p>
          <div className="flex flex-wrap gap-2">
            {config.options.map((option, i) => {
              const isSelected = selected.includes(option);
              return (
                <motion.button
                  key={option}
                  type="button"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2, delay: i * 0.03 }}
                  onClick={() => {
                    const next = new Set(selected);
                    if (isSelected) next.delete(option);
                    else next.add(option);
                    onChange(Array.from(next));
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition",
                    isSelected
                      ? "border-amber-200/50 bg-amber-100/10 text-amber-100"
                      : "border-stone-300/20 bg-stone-100/3 text-stone-200 hover:border-stone-300/35 hover:bg-stone-100/6",
                  )}
                >
                  {isSelected ? <Check className="size-3.5" /> : null}
                  {option}
                </motion.button>
              );
            })}
          </div>
          {selected.length > 0 ? (
            <p className="text-[10px] text-stone-400/65">
              {selected.length} selected
            </p>
          ) : null}
        </div>
      );
    }

    case "checkbox":
      return (
        <button
          type="button"
          onClick={() => onChange(value !== true)}
          className={cn(
            "flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left text-sm transition",
            value === true
              ? "border-emerald-300/40 bg-emerald-300/8 text-stone-50"
              : "border-stone-300/15 bg-stone-100/2 text-stone-200 hover:border-stone-300/30 hover:bg-stone-100/5",
          )}
        >
          <span
            className={cn(
              "grid size-5 place-items-center rounded border",
              value === true ? "border-emerald-300 bg-emerald-300/20" : "border-stone-400/40",
            )}
          >
            {value === true ? <Check className="size-3.5 text-emerald-200" /> : null}
          </span>
          <span>{value === true ? "Yes — confirmed" : "Tap to confirm"}</span>
        </button>
      );

    case "rating": {
      const rating = typeof value === "number" ? value : 0;
      // Clamp ratingMax to [2, 10] in case malformed config slipped through
      // somehow — server enforces this too, but be defensive at the edge.
      const ratingMax = Math.min(Math.max(config.ratingMax ?? 5, 2), 10);
      const stars = Array.from({ length: ratingMax }, (_, i) => i + 1);
      return (
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="flex flex-wrap justify-center gap-1.5">
            {stars.map((star) => {
              const isFilled = star <= rating;
              return (
                <motion.button
                  key={star}
                  type="button"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onChange(star)}
                  className="rounded-md p-1.5 transition"
                  aria-label={`Rate ${star} stars`}
                >
                  <Star
                    className={cn(
                      // 8-star scales get a slightly smaller star so the
                      // row doesn't run off the card.
                      ratingMax > 6 ? "size-7" : "size-8",
                      "transition",
                      isFilled
                        ? "fill-amber-200 text-amber-200 drop-shadow-[0_0_8px_rgba(252,211,77,0.4)]"
                        : "text-stone-500",
                    )}
                  />
                </motion.button>
              );
            })}
          </div>
          <p className="font-mono text-xs text-stone-400/85 tabular-nums">
            {rating > 0 ? `${rating} / ${ratingMax}` : "Tap a star"}
          </p>
        </div>
      );
    }

    case "date":
      return (
        <div className="relative">
          <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <input
            type="date"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-md border border-stone-300/20 bg-stone-950/60 py-3 pl-10 pr-4 text-base text-stone-50 focus:border-amber-200/40 focus:outline-none focus:ring-1 focus:ring-amber-200/30"
            autoFocus
          />
        </div>
      );

    default:
      return null;
  }
}

function ThankYouState({
  formTitle,
  formSlug,
}: {
  formTitle: string;
  formSlug: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="askly-card-glass relative overflow-hidden p-10 text-center"
    >
      <div className="askly-scan-line opacity-30" aria-hidden />
      <div className="absolute inset-0 askly-orbit-mini opacity-30" aria-hidden />

      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 15 }}
        className="relative mx-auto mb-5 grid size-20 place-items-center"
      >
        <div className="absolute inset-0 animate-ping rounded-full bg-emerald-300/20" />
        <div className="relative grid size-20 place-items-center rounded-full border-2 border-emerald-300/40 bg-emerald-300/10 text-emerald-200">
          <CheckCircle2 className="size-10" />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <p className="askly-section-eyebrow text-emerald-200">
          Response received
        </p>
        <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-stone-50 sm:text-4xl">
          Thanks for submitting{" "}
          <span className="askly-headline-shimmer">{formTitle}</span>.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-stone-300/85">
          Your response is safely in the creator&apos;s inbox. If you provided
          an email, you&apos;ll receive a copy shortly.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button
            asChild
            size="sm"
            className="askly-cta-glow gap-2 bg-amber-100 text-stone-900 hover:bg-amber-50"
          >
            <Link href="/explore">
              <Sparkles className="size-4" />
              Browse more forms
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="gap-2 border-stone-300/30 bg-stone-100/4 text-stone-100 hover:bg-stone-100/10"
          >
            <Link href="/">
              <Home className="size-4" />
              Back to home
            </Link>
          </Button>
        </div>

        <p className="mt-6 font-mono text-[10px] text-stone-500/70">
          /{formSlug}
        </p>
      </motion.div>
    </motion.div>
  );
}
