import { z } from "zod";
import { fieldTypeValues, formStatusValues, formVisibilityValues } from "@repo/types";

export { z };

export const formVisibilitySchema = z.enum(formVisibilityValues);
export const formStatusSchema = z.enum(formStatusValues);
export const fieldTypeSchema = z.enum(fieldTypeValues);

export const fieldValidationConfigSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  regex: z.string().optional(),
  blockedDomains: z.array(z.string()).default([]),
});

export const formFieldConfigSchema = z.object({
  options: z.array(z.string()).default([]),
  placeholder: z.string().max(120).optional(),
  helpText: z.string().max(240).optional(),
  // Star count for rating fields. Defaults to 5 (matches the UI). Bounded
  // to 2–10 to keep the server validation, UI rendering, and CSV export
  // sane — anything outside this range never gets persisted.
  ratingMax: z.number().int().min(2).max(10).default(5),
  // Marks the start of a new page in the multi-page renderer. When false
  // (default), fields without a page break flow on the previous page. Set
  // on the FIRST field of each new section. Optional `pageLabel` shows
  // above the page (e.g. "Personal info", "Preferences").
  pageBreak: z.boolean().optional(),
  pageLabel: z.string().max(80).optional(),
  // Conditional logic: only render this field when ANOTHER field's answer
  // matches the rule. `fieldId` must reference a sibling field's UUID;
  // `op` defines the comparison; `value` is compared against the live
  // answer. Missing/null = always visible. The renderer enforces this on
  // the client AND the server-side validator skips required-checks for
  // hidden fields, so creators can't accidentally trap respondents.
  showIf: z
    .object({
      fieldId: z.string().uuid(),
      op: z.enum(["equals", "not_equals", "contains", "is_empty", "is_not_empty"]),
      value: z.union([z.string(), z.number(), z.boolean()]).optional(),
    })
    .optional(),
  validation: fieldValidationConfigSchema.default({ blockedDomains: [] }),
});

export const formFieldSchema = z.object({
  id: z.string().uuid().optional(),
  type: fieldTypeSchema,
  key: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/)
    .min(2)
    .max(64),
  label: z.string().min(1).max(120),
  required: z.boolean().default(false),
  order: z.number().int().nonnegative(),
  config: formFieldConfigSchema.default({
    options: [],
    ratingMax: 5,
    validation: { blockedDomains: [] },
  }),
});

export const createFormInputSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(500).optional(),
  slug: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  visibility: formVisibilitySchema.default("unlisted"),
  status: formStatusSchema.default("draft"),
  isTemplate: z.boolean().default(false),
  responseLimit: z.number().int().positive().optional(),
  expiresAt: z.coerce.date().optional(),
  // FK into the themes catalog. Omit/null → no theme; the public renderer
  // will use the default Spice Sand palette.
  themeId: z.string().uuid().nullish(),
  fields: z.array(formFieldSchema).default([]),
});

export const updateFormInputSchema = z.object({
  formId: z.string().uuid(),
  title: z.string().min(3).max(120),
  // `null` explicitly clears the value; `undefined` leaves it untouched.
  // Drizzle's set() skips undefined entries but writes null, so this lets the
  // editor remove a previously-set description without nuking unrelated fields.
  description: z.string().max(500).nullish(),
  slug: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  visibility: formVisibilitySchema,
  status: formStatusSchema,
  isTemplate: z.boolean().default(false),
  responseLimit: z.number().int().positive().nullish(),
  expiresAt: z.coerce.date().nullish(),
  // Same tri-state contract as description: undefined leaves alone, null
  // clears, uuid sets. Validated to UUID format upstream.
  themeId: z.string().uuid().nullish(),
  fields: z.array(formFieldSchema).default([]),
});

export const updateFormVisibilityInputSchema = z.object({
  formId: z.string().uuid(),
  visibility: formVisibilitySchema,
});

export const updateFormStatusInputSchema = z.object({
  formId: z.string().uuid(),
  status: formStatusSchema,
});

export const getPublicFormBySlugInputSchema = z.object({
  slug: z.string().min(3).max(80),
});

export const getFormByIdInputSchema = z.object({
  formId: z.string().uuid(),
});

export const listPublicFormsInputSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
});

export const trackFormEventInputSchema = z.object({
  slug: z.string().min(3).max(80),
  eventType: z.enum(["view", "start", "submit"]),
  visitorId: z.string().min(8).max(120),
});

export const submitFormResponseInputSchema = z.object({
  slug: z.string().min(3).max(80),
  respondentEmail: z.string().email().optional(),
  honeypot: z.string().max(0).default(""),
  answers: z.array(
    z.object({
      fieldId: z.string().uuid(),
      value: z.unknown(),
    }),
  ),
});

export const listFormResponsesInputSchema = z.object({
  formId: z.string().uuid(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  respondentEmailQuery: z.string().trim().min(1).max(255).optional(),
});

// ─── Conditional logic evaluator ──────────────────────────────────────
// Shared between the public form renderer and the server-side validator
// so visibility is computed identically in both places. Anything that's
// hidden by `showIf` should NOT be persisted AND should NOT block the
// "required" check. Treats missing/null answers as empty.
export type ShowIfRule = {
  fieldId: string;
  op: "equals" | "not_equals" | "contains" | "is_empty" | "is_not_empty";
  value?: string | number | boolean;
};

export function evaluateShowIf(
  rule: ShowIfRule | undefined | null,
  // Map of fieldId -> raw answer. The evaluator coerces values to strings
  // for `equals`/`not_equals`/`contains` so the editor can ship a single
  // <input> for the rule value without worrying about the target field's
  // type. `is_empty`/`is_not_empty` ignore `value`.
  answers: Record<string, unknown>,
): boolean {
  if (!rule) return true;
  const raw = answers[rule.fieldId];
  const isEmpty =
    raw === undefined ||
    raw === null ||
    raw === "" ||
    (Array.isArray(raw) && raw.length === 0);

  switch (rule.op) {
    case "is_empty":
      return isEmpty;
    case "is_not_empty":
      return !isEmpty;
    case "equals":
      if (isEmpty) return false;
      return String(raw) === String(rule.value ?? "");
    case "not_equals":
      if (isEmpty) return true;
      return String(raw) !== String(rule.value ?? "");
    case "contains": {
      if (isEmpty) return false;
      const needle = String(rule.value ?? "").toLowerCase();
      if (Array.isArray(raw)) {
        return raw.some((v) => String(v).toLowerCase().includes(needle));
      }
      return String(raw).toLowerCase().includes(needle);
    }
    default:
      return true;
  }
}
