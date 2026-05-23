import { and, asc, db, desc, eq, ilike, inArray, sql } from "@repo/database";
import { answersTable, formFieldsTable, formsTable, responsesTable, usersTable } from "@repo/database/schema";
import { canAcceptResponse } from "@repo/utils";
import {
  evaluateShowIf,
  formFieldConfigSchema,
  listFormResponsesInputSchema,
  submitFormResponseInputSchema,
  z,
} from "@repo/validators";
import { TRPCError } from "@trpc/server";
import { enqueueFormResponseEmails } from "../../jobs/email-queue";
import {
  checkSubmissionRateLimit,
  recordSubmittedFingerprint,
  wasRecentlySubmitted,
} from "../../security/submission-guard";
import { protectedProcedure, publicProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

const TAGS = ["Responses"];
const getPath = generatePath("/responses");

const emailValueSchema = z.string().email();
const textValueSchema = z.string();
const numberValueSchema = z.number();
const singleSelectSchema = z.string();
const multiSelectSchema = z.array(z.string());
const checkboxSchema = z.boolean();
// Rating max comes from per-field config; this is just the absolute floor +
// ceiling for safety. Per-field bound is applied dynamically below.
const RATING_MIN = 1;
const RATING_HARD_CEILING = 10;
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const isEmptyAnswer = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim().length === 0) ||
  (Array.isArray(value) && value.length === 0);

function validateAnswerValue(
  field: {
    id: string;
    type: string;
    label: string;
    required: boolean;
    configJson: unknown;
  },
  value: unknown,
) {
  if (isEmptyAnswer(value)) {
    if (field.required) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Field "${field.label}" is required.`,
      });
    }
    return;
  }

  const parsedConfig = formFieldConfigSchema.safeParse(field.configJson);
  // When config is missing/malformed, fall back to a fully-defaulted config
  // (parse({}) applies every default from the schema). This keeps the
  // inferred type consistent across both branches — previously the fallback
  // literal `{ options: [], validation: { blockedDomains: [] } }` narrowed
  // arrays to `never[]` and broke type-checking after `ratingMax` was added.
  const config = parsedConfig.success ? parsedConfig.data : formFieldConfigSchema.parse({});

  switch (field.type) {
    case "short_text":
    case "long_text": {
      const parsed = textValueSchema.safeParse(value);
      if (!parsed.success) break;
      if (typeof config.validation.min === "number" && parsed.data.length < config.validation.min) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Field "${field.label}" is shorter than minimum length.`,
        });
      }
      if (typeof config.validation.max === "number" && parsed.data.length > config.validation.max) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Field "${field.label}" exceeds maximum length.`,
        });
      }
      if (config.validation.regex) {
        const pattern = new RegExp(config.validation.regex);
        if (!pattern.test(parsed.data)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Field "${field.label}" failed format validation.`,
          });
        }
      }
      return;
    }
    case "email": {
      const parsed = emailValueSchema.safeParse(value);
      if (!parsed.success) break;
      const blocked = new Set((config.validation.blockedDomains ?? []).map((item) => item.toLowerCase()));
      const domain = parsed.data.split("@")[1]?.toLowerCase();
      if (domain && blocked.has(domain)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Email domain is not allowed for "${field.label}".`,
        });
      }
      return;
    }
    case "number": {
      const parsed = numberValueSchema.safeParse(value);
      if (!parsed.success) break;
      if (typeof config.validation.min === "number" && parsed.data < config.validation.min) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Field "${field.label}" is lower than minimum value.`,
        });
      }
      if (typeof config.validation.max === "number" && parsed.data > config.validation.max) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Field "${field.label}" exceeds maximum value.`,
        });
      }
      return;
    }
    case "single_select": {
      const parsed = singleSelectSchema.safeParse(value);
      if (!parsed.success) break;
      if (config.options.length > 0 && !config.options.includes(parsed.data)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid option selected for "${field.label}".`,
        });
      }
      return;
    }
    case "multi_select": {
      const parsed = multiSelectSchema.safeParse(value);
      if (!parsed.success) break;
      if (
        config.options.length > 0 &&
        parsed.data.some((selectedOption) => !config.options.includes(selectedOption))
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `One or more selected options are invalid for "${field.label}".`,
        });
      }
      return;
    }
    case "checkbox": {
      const parsed = checkboxSchema.safeParse(value);
      if (!parsed.success) break;
      return;
    }
    case "rating": {
      // Dynamic per-field rating max (defaults to 5) — keeps server, UI, and
      // CSV all aligned to whatever scale the creator picked. Without this
      // the server accepted 1–10 while the UI only rendered 1–5, making
      // values 6–10 silently submit-only via API.
      const config = formFieldConfigSchema.safeParse(field.configJson);
      const max = Math.min(
        config.success ? config.data.ratingMax : 5,
        RATING_HARD_CEILING,
      );
      const parsed = z.number().int().min(RATING_MIN).max(max).safeParse(value);
      if (!parsed.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Rating for "${field.label}" must be between ${RATING_MIN} and ${max}.`,
        });
      }
      return;
    }
    case "date": {
      const parsed = dateSchema.safeParse(value);
      if (!parsed.success) break;
      return;
    }
    default:
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Unsupported field type for "${field.label}".`,
      });
  }

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `Invalid answer value for "${field.label}".`,
  });
}

export const responsesRouter = router({
  submit: publicProcedure
    .meta({ openapi: { method: "POST", path: getPath("/submit"), tags: TAGS } })
    .input(submitFormResponseInputSchema)
    .output(
      z.object({
        responseId: z.string().uuid(),
        submittedAt: z.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = `${ctx.ipAddress}:${input.slug}`;
      const rateLimitResult = checkSubmissionRateLimit(rateLimitKey);
      if (!rateLimitResult.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Too many submissions. Retry in ${rateLimitResult.retryAfterSeconds}s.`,
        });
      }

      if (input.honeypot.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Spam submission blocked." });
      }

      // Pre-flight fetch (NOT locked) — used only to get `form.id` for the
      // field-loading + validation pipeline below. The authoritative
      // limit/visibility/expiry check happens inside the transaction
      // further down where the row is locked via SELECT FOR UPDATE.
      // Doing validation under the lock would unnecessarily serialize
      // every submission's CPU work; the lock should be held for as
      // little wall-clock time as possible.
      const [form] = await db.select().from(formsTable).where(eq(formsTable.slug, input.slug)).limit(1);
      if (!form) throw new TRPCError({ code: "NOT_FOUND", message: "Form not found." });

      const fields = await db
        .select({
          id: formFieldsTable.id,
          type: formFieldsTable.type,
          label: formFieldsTable.label,
          formId: formFieldsTable.formId,
          required: formFieldsTable.required,
          configJson: formFieldsTable.configJson,
        })
        .from(formFieldsTable)
        .where(eq(formFieldsTable.formId, form.id));

      const fieldMap = new Map(fields.map((field) => [field.id, field]));

      // Build the visibility map from the SUBMITTED answers. This mirrors
      // what the renderer does on the client. A field hidden by `showIf`
      // is not required AND its answer (if any sneaks through) is dropped
      // before persistence so creators can't see ghost data.
      const answerMap: Record<string, unknown> = {};
      for (const answer of input.answers) answerMap[answer.fieldId] = answer.value;
      const isFieldVisible = (field: (typeof fields)[number]) => {
        const parsed = formFieldConfigSchema.safeParse(field.configJson);
        const rule = parsed.success ? parsed.data.showIf : undefined;
        return evaluateShowIf(rule ?? null, answerMap);
      };

      for (const answer of input.answers) {
        if (!fieldMap.has(answer.fieldId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid field id: ${answer.fieldId}`,
          });
        }
        const field = fieldMap.get(answer.fieldId);
        if (field && isFieldVisible(field)) {
          validateAnswerValue(field, answer.value);
        }
      }

      for (const field of fields) {
        if (!field.required) continue;
        if (!isFieldVisible(field)) continue; // hidden → don't enforce required
        const matchingAnswer = input.answers.find((answer) => answer.fieldId === field.id);
        const hasAnswer = !!matchingAnswer && !isEmptyAnswer(matchingAnswer.value);
        if (!hasAnswer) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Missing required field: ${field.label}`,
          });
        }
      }

      // Strip answers for hidden fields so the database never stores values
      // for questions the user didn't actually see. Important for trust:
      // hiding a "describe your experience" field after answering "no"
      // should not leak the now-irrelevant text into the analytics export.
      const visibleAnswers = input.answers.filter((answer) => {
        const field = fieldMap.get(answer.fieldId);
        return field ? isFieldVisible(field) : true;
      });

      // Build the dedupe fingerprint once and reuse it for the pre-insert
      // probe AND the post-insert record. Two-phase rather than fused so
      // that a failed insert doesn't lock a legitimate retry out for 20s.
      const dedupePayload = {
        slug: input.slug,
        respondentEmail: input.respondentEmail?.toLowerCase() ?? null,
        answers: [...visibleAnswers]
          .map((answer) => ({
            fieldId: answer.fieldId,
            value: answer.value,
          }))
          .sort((a, b) => a.fieldId.localeCompare(b.fieldId)),
      };

      if (wasRecentlySubmitted(dedupePayload)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Duplicate submission detected. Please wait before retrying.",
        });
      }

      // Atomic limit-enforced insert. Without this transaction, two
      // concurrent submits on a 100-cap form could both see count=99
      // and both insert — leaving the form at 101 responses, silently
      // breaking the creator's promised cap. Solution:
      //
      //   1. SELECT … FOR UPDATE on the form row inside a tx. Postgres
      //      serializes any concurrent submission for the same form
      //      behind this lock until the tx commits.
      //   2. Count current responses under the lock.
      //   3. Re-check canAcceptResponse with the locked, current values
      //      (status/visibility/expiry/limit can change between the
      //      pre-flight fetch and now — the locked read is the source
      //      of truth).
      //   4. Insert response + answers in the same tx so a rollback
      //      cleanly undoes everything if any step fails.
      //
      // The lock is held only for the count + insert (single-digit ms
      // in practice), so the throughput hit is negligible. The fix only
      // matters when responseLimit is set, but we lock unconditionally
      // because (a) Postgres row locks are cheap and (b) it also gives
      // a consistent read for status/expiry checks during the cap-less
      // case.
      const response = await db.transaction(async (tx) => {
        const [locked] = await tx
          .select()
          .from(formsTable)
          .where(eq(formsTable.id, form.id))
          .for("update")
          .limit(1);
        if (!locked) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Form not found." });
        }

        const [countRow] = await tx
          .select({ count: sql<number>`cast(count(*) as int)` })
          .from(responsesTable)
          .where(eq(responsesTable.formId, locked.id));

        const canSubmit = canAcceptResponse({
          visibility: locked.visibility,
          status: locked.status,
          expiresAt: locked.expiresAt,
          responseLimit: locked.responseLimit,
          responseCount: countRow?.count ?? 0,
        });

        if (!canSubmit) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This form is not accepting responses.",
          });
        }

        const [inserted] = await tx
          .insert(responsesTable)
          .values({
            formId: locked.id,
            respondentEmail: input.respondentEmail,
            metaJson: { source: "public-submit" },
          })
          .returning();
        if (!inserted) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to persist response.",
          });
        }

        if (visibleAnswers.length > 0) {
          await tx.insert(answersTable).values(
            visibleAnswers.map((answer) => ({
              responseId: inserted.id,
              fieldId: answer.fieldId,
              valueJson: answer.value,
            })),
          );
        }

        return inserted;
      });

      // Only record the fingerprint AFTER the transaction committed. If
      // anything inside threw, Postgres rolled back both the response
      // and its answers — we should NOT mark the user as "already
      // submitted" because nothing was persisted. They get to retry
      // immediately instead of being told they're a duplicate of a
      // submission that never actually landed.
      recordSubmittedFingerprint(dedupePayload);

      const [creator] = await db
        .select({
          email: usersTable.email,
        })
        .from(usersTable)
        .where(eq(usersTable.id, form.creatorId))
        .limit(1);
      if (creator?.email) {
        enqueueFormResponseEmails({
          formTitle: form.title,
          formSlug: form.slug,
          creatorEmail: creator.email,
          respondentEmail: input.respondentEmail,
          responseId: response.id,
        }).catch(() => undefined);
      }

      return {
        responseId: response.id,
        submittedAt: response.submittedAt,
      };
    }),

  listByForm: protectedProcedure
    .meta({ openapi: { method: "GET", path: getPath("/by-form/{formId}"), tags: TAGS } })
    .input(listFormResponsesInputSchema)
    .output(
      z.object({
        items: z.array(
          z.object({
            id: z.string().uuid(),
            formId: z.string().uuid(),
            respondentEmail: z.string().nullable(),
            submittedAt: z.date(),
          }),
        ),
        total: z.number(),
        page: z.number(),
        pageSize: z.number(),
        hasMore: z.boolean(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [form] = await db
        .select()
        .from(formsTable)
        .where(and(eq(formsTable.id, input.formId), eq(formsTable.creatorId, ctx.userId)))
        .limit(1);

      if (!form) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Form not found.",
        });
      }

      const page = input.page;
      const pageSize = input.pageSize;
      const offset = (page - 1) * pageSize;
      const whereClause = and(
        eq(responsesTable.formId, form.id),
        input.respondentEmailQuery
          ? ilike(responsesTable.respondentEmail, `%${input.respondentEmailQuery}%`)
          : undefined,
      );

      const [countRow] = await db
        .select({
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(responsesTable)
        .where(whereClause);

      const items = await db
        .select({
          id: responsesTable.id,
          formId: responsesTable.formId,
          respondentEmail: responsesTable.respondentEmail,
          submittedAt: responsesTable.submittedAt,
        })
        .from(responsesTable)
        .where(whereClause)
        .orderBy(desc(responsesTable.submittedAt))
        .limit(pageSize)
        .offset(offset);

      const total = countRow?.count ?? 0;
      return {
        items,
        total,
        page,
        pageSize,
        hasMore: page * pageSize < total,
      };
    }),

  getById: protectedProcedure
    .meta({ openapi: { method: "GET", path: getPath("/{responseId}"), tags: TAGS } })
    .input(z.object({ responseId: z.string().uuid() }))
    .output(
      z.object({
        id: z.string().uuid(),
        formId: z.string().uuid(),
        formTitle: z.string(),
        respondentEmail: z.string().nullable(),
        submittedAt: z.date(),
        // ipAddressHash is intentionally NOT exposed in the UI — it exists for
        // duplicate-submission detection and would leak nothing useful here.
        answers: z.array(
          z.object({
            fieldId: z.string().uuid(),
            fieldKey: z.string(),
            label: z.string(),
            type: z.string(),
            required: z.boolean(),
            order: z.number().int(),
            // Drizzle's JSON column comes back as `unknown`; the renderer
            // decides how to display each type.
            value: z.unknown(),
          }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Join the response to the form so we can both (a) authorize against the
      // creator and (b) return the form title for the detail view header in
      // one round-trip instead of a separate fetch from the client.
      const [response] = await db
        .select({
          id: responsesTable.id,
          formId: responsesTable.formId,
          formTitle: formsTable.title,
          formCreatorId: formsTable.creatorId,
          respondentEmail: responsesTable.respondentEmail,
          submittedAt: responsesTable.submittedAt,
        })
        .from(responsesTable)
        .innerJoin(formsTable, eq(formsTable.id, responsesTable.formId))
        .where(eq(responsesTable.id, input.responseId))
        .limit(1);

      if (!response) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Response not found." });
      }
      if (response.formCreatorId !== ctx.userId) {
        // 404 (not 403) so we don't leak the existence of responses owned by
        // other creators to anyone probing by UUID.
        throw new TRPCError({ code: "NOT_FOUND", message: "Response not found." });
      }

      // Pull all form fields (not just answered ones) so the detail view can
      // show "—" for skipped optional fields rather than silently omitting them.
      const fields = await db
        .select({
          id: formFieldsTable.id,
          fieldKey: formFieldsTable.fieldKey,
          label: formFieldsTable.label,
          type: formFieldsTable.type,
          required: formFieldsTable.required,
          order: formFieldsTable.order,
        })
        .from(formFieldsTable)
        .where(eq(formFieldsTable.formId, response.formId))
        .orderBy(asc(formFieldsTable.order));

      const answers = await db
        .select({
          fieldId: answersTable.fieldId,
          valueJson: answersTable.valueJson,
        })
        .from(answersTable)
        .where(eq(answersTable.responseId, response.id));

      const valueByFieldId = new Map(answers.map((a) => [a.fieldId, a.valueJson]));

      return {
        id: response.id,
        formId: response.formId,
        formTitle: response.formTitle,
        respondentEmail: response.respondentEmail,
        submittedAt: response.submittedAt,
        answers: fields.map((field) => ({
          fieldId: field.id,
          fieldKey: field.fieldKey,
          label: field.label,
          type: field.type,
          required: field.required,
          order: field.order,
          value: valueByFieldId.get(field.id) ?? null,
        })),
      };
    }),

  exportCsv: protectedProcedure
    .meta({ openapi: { method: "GET", path: getPath("/export/{formId}"), tags: TAGS } })
    .input(z.object({ formId: z.string().uuid() }))
    .output(
      z.object({
        fileName: z.string(),
        csv: z.string(),
        rowCount: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [form] = await db
        .select({
          id: formsTable.id,
          title: formsTable.title,
          slug: formsTable.slug,
        })
        .from(formsTable)
        .where(and(eq(formsTable.id, input.formId), eq(formsTable.creatorId, ctx.userId)))
        .limit(1);
      if (!form) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Form not found.",
        });
      }

      const fields = await db
        .select({
          id: formFieldsTable.id,
          key: formFieldsTable.fieldKey,
        })
        .from(formFieldsTable)
        .where(eq(formFieldsTable.formId, form.id))
        .orderBy(asc(formFieldsTable.order));

      const responses = await db
        .select({
          id: responsesTable.id,
          respondentEmail: responsesTable.respondentEmail,
          submittedAt: responsesTable.submittedAt,
        })
        .from(responsesTable)
        .where(eq(responsesTable.formId, form.id))
        .orderBy(desc(responsesTable.submittedAt));

      const responseIds = responses.map((item) => item.id);
      const answers =
        responseIds.length === 0
          ? []
          : await db
              .select({
                responseId: answersTable.responseId,
                fieldId: answersTable.fieldId,
                valueJson: answersTable.valueJson,
              })
              .from(answersTable)
              .where(inArray(answersTable.responseId, responseIds));

      const answerMap = new Map<string, Map<string, unknown>>();
      for (const answer of answers) {
        const existing = answerMap.get(answer.responseId) ?? new Map<string, unknown>();
        existing.set(answer.fieldId, answer.valueJson);
        answerMap.set(answer.responseId, existing);
      }

      const escapeCsv = (value: unknown): string => {
        const raw =
          value === null || value === undefined
            ? ""
            : typeof value === "string"
              ? value
              : JSON.stringify(value);
        const escaped = raw.replace(/"/g, "\"\"");
        return `"${escaped}"`;
      };

      const headers = ["response_id", "submitted_at", "respondent_email", ...fields.map((field) => field.key)];
      const rows = [headers.join(",")];

      for (const response of responses) {
        const fieldValues = fields.map((field) => answerMap.get(response.id)?.get(field.id));
        rows.push(
          [
            escapeCsv(response.id),
            escapeCsv(response.submittedAt.toISOString()),
            escapeCsv(response.respondentEmail ?? ""),
            ...fieldValues.map((value) => escapeCsv(value)),
          ].join(","),
        );
      }

      return {
        fileName: `${form.slug}-responses.csv`,
        csv: rows.join("\n"),
        rowCount: responses.length,
      };
    }),
});
