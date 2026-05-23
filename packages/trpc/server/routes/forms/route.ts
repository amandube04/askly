import { and, asc, db, desc, eq, inArray, ne, sql } from "@repo/database";
import { formFieldsTable, formsTable, responsesTable, themesTable } from "@repo/database/schema";
import { canAccessViaDirectLink, isPubliclyListed } from "@repo/utils";
import {
  createFormInputSchema,
  getFormByIdInputSchema,
  getPublicFormBySlugInputSchema,
  listPublicFormsInputSchema,
  updateFormInputSchema,
  updateFormStatusInputSchema,
  updateFormVisibilityInputSchema,
  z,
} from "@repo/validators";
import { TRPCError } from "@trpc/server";
import { protectedMutationProcedure, protectedProcedure, publicProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

const TAGS = ["Forms"];
const getPath = generatePath("/forms");

const formSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  slug: z.string(),
  visibility: z.enum(["public", "unlisted"]),
  status: z.enum(["draft", "published", "unpublished", "archived"]),
  updatedAt: z.date(),
});

const formSummaryWithStatsSchema = formSummarySchema.extend({
  responseCount: z.number().int().nonnegative(),
  lastResponseAt: z.date().nullable(),
});

const formFieldOutputSchema = z.object({
  id: z.string().uuid(),
  type: z.enum([
    "short_text",
    "long_text",
    "email",
    "number",
    "single_select",
    "multi_select",
    "checkbox",
    "rating",
    "date",
  ]),
  key: z.string(),
  label: z.string(),
  required: z.boolean(),
  order: z.number(),
  config: z.unknown(),
});

const formDetailSchema = formSummarySchema.extend({
  description: z.string().nullable(),
  isTemplate: z.boolean(),
  responseLimit: z.number().nullable(),
  expiresAt: z.date().nullable(),
  publishedAt: z.date().nullable(),
  // FK to themesTable. Null when no theme selected; the public renderer
  // falls back to the default Spice Sand palette in that case.
  themeId: z.string().uuid().nullable(),
  fields: z.array(formFieldOutputSchema),
});

export const formsRouter = router({
  create: protectedMutationProcedure
    .meta({ openapi: { method: "POST", path: getPath("/create"), tags: TAGS } })
    .input(createFormInputSchema)
    .output(formSummarySchema)
    .mutation(async ({ ctx, input }) => {
      // Transaction so a failed field insert never leaves an orphan form row.
      const form = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(formsTable)
          .values({
            creatorId: ctx.userId,
            title: input.title,
            description: input.description,
            slug: input.slug,
            visibility: input.visibility,
            status: input.status,
            isTemplate: input.isTemplate,
            responseLimit: input.responseLimit,
            expiresAt: input.expiresAt,
            // Optional at create time — creator can pick a theme later in the
            // editor. `null` is the default in the DB schema.
            themeId: input.themeId,
            // Only stamp publishedAt when the form is born published.
            // Leaving it undefined lets the DB default (NULL) apply otherwise,
            // so a later first-publish writes the true publish date.
            publishedAt: input.status === "published" ? new Date() : undefined,
          })
          .returning();
        if (!created) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create form.",
          });
        }

        if (input.fields.length > 0) {
          await tx.insert(formFieldsTable).values(
            input.fields.map((field) => ({
              formId: created.id,
              type: field.type,
              fieldKey: field.key,
              label: field.label,
              required: field.required,
              order: field.order,
              configJson: field.config,
            })),
          );
        }

        return created;
      });

      return {
        id: form.id,
        title: form.title,
        slug: form.slug,
        visibility: form.visibility,
        status: form.status,
        updatedAt: form.updatedAt,
      };
    }),

  getMineById: protectedProcedure
    .meta({ openapi: { method: "GET", path: getPath("/mine/{formId}"), tags: TAGS } })
    .input(getFormByIdInputSchema)
    .output(formDetailSchema)
    .query(async ({ ctx, input }) => {
      const [form] = await db
        .select()
        .from(formsTable)
        .where(and(eq(formsTable.id, input.formId), eq(formsTable.creatorId, ctx.userId)))
        .limit(1);

      if (!form) throw new TRPCError({ code: "NOT_FOUND", message: "Form not found." });

      const fields = await db
        .select({
          id: formFieldsTable.id,
          type: formFieldsTable.type,
          key: formFieldsTable.fieldKey,
          label: formFieldsTable.label,
          required: formFieldsTable.required,
          order: formFieldsTable.order,
          config: formFieldsTable.configJson,
        })
        .from(formFieldsTable)
        .where(eq(formFieldsTable.formId, form.id))
        .orderBy(asc(formFieldsTable.order));

      return {
        id: form.id,
        title: form.title,
        slug: form.slug,
        visibility: form.visibility,
        status: form.status,
        updatedAt: form.updatedAt,
        description: form.description,
        isTemplate: form.isTemplate,
        responseLimit: form.responseLimit,
        expiresAt: form.expiresAt,
        publishedAt: form.publishedAt,
        themeId: form.themeId,
        fields,
      };
    }),

  update: protectedMutationProcedure
    .meta({ openapi: { method: "PUT", path: getPath("/update"), tags: TAGS } })
    .input(updateFormInputSchema)
    .output(formDetailSchema)
    .mutation(async ({ ctx, input }) => {
      const duplicateSlug = await db
        .select({ id: formsTable.id })
        .from(formsTable)
        .where(and(eq(formsTable.slug, input.slug), ne(formsTable.id, input.formId)))
        .limit(1);
      if (duplicateSlug.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Slug is already used by another form.",
        });
      }

      const result = await db.transaction(async (tx) => {
        // Read current status so we can apply publishedAt correctly: only
        // stamp it when transitioning *into* published from a non-published
        // state. Never clear it — the original publish timestamp is meaningful
        // even after the form is paused/archived.
        const [currentForm] = await tx
          .select({ status: formsTable.status, publishedAt: formsTable.publishedAt })
          .from(formsTable)
          .where(and(eq(formsTable.id, input.formId), eq(formsTable.creatorId, ctx.userId)))
          .limit(1);
        if (!currentForm) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Form not found." });
        }

        const shouldStampPublishedAt =
          input.status === "published" && currentForm.status !== "published";

        const [form] = await tx
          .update(formsTable)
          .set({
            title: input.title,
            description: input.description,
            slug: input.slug,
            visibility: input.visibility,
            status: input.status,
            isTemplate: input.isTemplate,
            responseLimit: input.responseLimit,
            expiresAt: input.expiresAt,
            // `undefined` → no change (input did not specify themeId).
            // `null` → explicitly clear the theme.
            // string → set the theme. Same tri-state contract as description.
            themeId: input.themeId,
            // undefined → drizzle skips the column, preserving the existing
            // publishedAt. Only stamp on a fresh publish transition.
            publishedAt: shouldStampPublishedAt ? new Date() : undefined,
            updatedAt: new Date(),
          })
          .where(and(eq(formsTable.id, input.formId), eq(formsTable.creatorId, ctx.userId)))
          .returning();

        if (!form) throw new TRPCError({ code: "NOT_FOUND", message: "Form not found." });

        // Replace the field schema atomically — a failed insert here rolls back
        // the delete so the form never ends up with zero fields.
        await tx.delete(formFieldsTable).where(eq(formFieldsTable.formId, form.id));
        if (input.fields.length > 0) {
          await tx.insert(formFieldsTable).values(
            input.fields.map((field) => ({
              formId: form.id,
              type: field.type,
              fieldKey: field.key,
              label: field.label,
              required: field.required,
              order: field.order,
              configJson: field.config,
            })),
          );
        }

        const fields = await tx
          .select({
            id: formFieldsTable.id,
            type: formFieldsTable.type,
            key: formFieldsTable.fieldKey,
            label: formFieldsTable.label,
            required: formFieldsTable.required,
            order: formFieldsTable.order,
            config: formFieldsTable.configJson,
          })
          .from(formFieldsTable)
          .where(eq(formFieldsTable.formId, form.id))
          .orderBy(asc(formFieldsTable.order));

        return { form, fields };
      });

      return {
        id: result.form.id,
        title: result.form.title,
        slug: result.form.slug,
        visibility: result.form.visibility,
        status: result.form.status,
        updatedAt: result.form.updatedAt,
        description: result.form.description,
        isTemplate: result.form.isTemplate,
        responseLimit: result.form.responseLimit,
        expiresAt: result.form.expiresAt,
        publishedAt: result.form.publishedAt,
        themeId: result.form.themeId,
        fields: result.fields,
      };
    }),

  listMine: protectedProcedure
    .meta({ openapi: { method: "GET", path: getPath("/mine"), tags: TAGS } })
    .input(z.undefined())
    .output(z.array(formSummarySchema))
    .query(async ({ ctx }) => {
      const forms = await db
        .select({
          id: formsTable.id,
          title: formsTable.title,
          slug: formsTable.slug,
          visibility: formsTable.visibility,
          status: formsTable.status,
          updatedAt: formsTable.updatedAt,
        })
        .from(formsTable)
        .where(eq(formsTable.creatorId, ctx.userId))
        .orderBy(desc(formsTable.updatedAt));

      return forms;
    }),

  listMineWithStats: protectedProcedure
    .meta({ openapi: { method: "GET", path: getPath("/mine/with-stats"), tags: TAGS } })
    .input(z.undefined())
    .output(z.array(formSummaryWithStatsSchema))
    .query(async ({ ctx }) => {
      const rows = await db
        .select({
          id: formsTable.id,
          title: formsTable.title,
          slug: formsTable.slug,
          visibility: formsTable.visibility,
          status: formsTable.status,
          updatedAt: formsTable.updatedAt,
          responseCount: sql<number>`cast(count(${responsesTable.id}) as int)`,
          lastResponseAt: sql<Date | null>`max(${responsesTable.submittedAt})`,
        })
        .from(formsTable)
        .leftJoin(responsesTable, eq(responsesTable.formId, formsTable.id))
        .where(eq(formsTable.creatorId, ctx.userId))
        .groupBy(formsTable.id)
        .orderBy(desc(formsTable.updatedAt));

      return rows.map((row) => ({
        ...row,
        responseCount: Number(row.responseCount ?? 0),
        // `max(timestamp)` from drizzle's sql tag comes back as a string from
        // the pg driver; coerce explicitly so the output schema accepts it.
        lastResponseAt: row.lastResponseAt ? new Date(row.lastResponseAt as unknown as string) : null,
      }));
    }),

  updateVisibility: protectedMutationProcedure
    .meta({ openapi: { method: "PATCH", path: getPath("/visibility"), tags: TAGS } })
    .input(updateFormVisibilityInputSchema)
    .output(formSummarySchema)
    .mutation(async ({ ctx, input }) => {
      const [form] = await db
        .update(formsTable)
        .set({ visibility: input.visibility, updatedAt: new Date() })
        .where(and(eq(formsTable.id, input.formId), eq(formsTable.creatorId, ctx.userId)))
        .returning();

      if (!form) throw new TRPCError({ code: "NOT_FOUND", message: "Form not found." });

      return {
        id: form.id,
        title: form.title,
        slug: form.slug,
        visibility: form.visibility,
        status: form.status,
        updatedAt: form.updatedAt,
      };
    }),

  updateStatus: protectedMutationProcedure
    .meta({ openapi: { method: "PATCH", path: getPath("/status"), tags: TAGS } })
    .input(updateFormStatusInputSchema)
    .output(formSummarySchema)
    .mutation(async ({ ctx, input }) => {
      // Same publishedAt rule as forms.update: only stamp on a fresh
      // non-published → published transition, never clear.
      const [currentForm] = await db
        .select({ status: formsTable.status })
        .from(formsTable)
        .where(and(eq(formsTable.id, input.formId), eq(formsTable.creatorId, ctx.userId)))
        .limit(1);
      if (!currentForm) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Form not found." });
      }

      const shouldStampPublishedAt =
        input.status === "published" && currentForm.status !== "published";

      const [form] = await db
        .update(formsTable)
        .set({
          status: input.status,
          publishedAt: shouldStampPublishedAt ? new Date() : undefined,
          updatedAt: new Date(),
        })
        .where(and(eq(formsTable.id, input.formId), eq(formsTable.creatorId, ctx.userId)))
        .returning();

      if (!form) throw new TRPCError({ code: "NOT_FOUND", message: "Form not found." });

      return {
        id: form.id,
        title: form.title,
        slug: form.slug,
        visibility: form.visibility,
        status: form.status,
        updatedAt: form.updatedAt,
      };
    }),

  // Hard-delete a form. Intentionally separate from `updateStatus`
  // (which toggles archived↔draft) — archived = "stash for later",
  // delete = "permanently destroy, including all responses."
  //
  // Cascades:
  //   • form_fields.formId → CASCADE (deletes all field defs)
  //   • responses.formId   → CASCADE (deletes all responses)
  //   • answers.responseId → CASCADE (deletes all answers transitively)
  //   • answers.fieldId    → CASCADE (defense in depth)
  //   • form_events.formId → CASCADE (deletes view/start/submit events)
  // So a single DELETE on forms takes everything with it. No txn needed
  // because Postgres CASCADE is atomic at the statement level.
  //
  // Guarded by:
  //   • creatorId match (creators can only delete their own forms)
  //   • status === "archived" (UI gates this; server enforces it
  //     too so a misbehaving client can't nuke a live form by hand)
  delete: protectedMutationProcedure
    .meta({ openapi: { method: "DELETE", path: getPath("/{formId}"), tags: TAGS } })
    .input(z.object({ formId: z.string().uuid() }))
    .output(z.object({ deletedId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Read status first so we can enforce "must be archived" without a
      // transaction. Race window: someone could un-archive between this
      // select and the delete below — acceptable because the delete still
      // checks creatorId and the worst case is "you tried to delete the
      // form you just restored, and it succeeds." Not a security hole.
      const [current] = await db
        .select({ status: formsTable.status })
        .from(formsTable)
        .where(
          and(eq(formsTable.id, input.formId), eq(formsTable.creatorId, ctx.userId)),
        )
        .limit(1);

      if (!current) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Form not found." });
      }

      if (current.status !== "archived") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Form must be archived before it can be permanently deleted. Archive it first, then delete.",
        });
      }

      const [deleted] = await db
        .delete(formsTable)
        .where(
          and(eq(formsTable.id, input.formId), eq(formsTable.creatorId, ctx.userId)),
        )
        .returning({ id: formsTable.id });

      if (!deleted) {
        // Should be impossible (we just saw the row), but defensive.
        throw new TRPCError({ code: "NOT_FOUND", message: "Form not found." });
      }

      return { deletedId: deleted.id };
    }),

  getBySlug: publicProcedure
    .meta({ openapi: { method: "GET", path: getPath("/{slug}"), tags: TAGS } })
    .input(getPublicFormBySlugInputSchema)
    .output(
      z.object({
        id: z.string().uuid(),
        title: z.string(),
        description: z.string().nullable(),
        slug: z.string(),
        visibility: z.enum(["public", "unlisted"]),
        status: z.enum(["draft", "published", "unpublished", "archived"]),
        listedInExplore: z.boolean(),
        responseCount: z.number(),
        fields: z.array(formFieldOutputSchema),
        // Theme metadata for the public renderer. `null` when the form has
        // no theme set — UI falls back to the default Spice Sand palette.
        // configJson is intentionally loose (`unknown`) because per-theme
        // shape evolves independently of this contract; the renderer
        // validates fields it cares about (accent, palette, font).
        theme: z
          .object({
            id: z.string().uuid(),
            name: z.string(),
            configJson: z.unknown(),
          })
          .nullable(),
      }),
    )
    .query(async ({ input }) => {
      // Single round-trip: form + (optional) theme via LEFT JOIN so we don't
      // pay for a second query when the form has no theme assigned.
      const [row] = await db
        .select({
          form: formsTable,
          theme: themesTable,
        })
        .from(formsTable)
        .leftJoin(themesTable, eq(themesTable.id, formsTable.themeId))
        .where(eq(formsTable.slug, input.slug))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Form not found." });
      const form = row.form;

      const [responseCountRow] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(responsesTable)
        .where(eq(responsesTable.formId, form.id));

      const isAccessible = canAccessViaDirectLink({
        visibility: form.visibility,
        status: form.status,
        expiresAt: form.expiresAt,
      });
      if (!isAccessible) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This form is not available." });
      }

      return {
        id: form.id,
        title: form.title,
        description: form.description,
        slug: form.slug,
        visibility: form.visibility,
        status: form.status,
        listedInExplore: isPubliclyListed(form.visibility),
        responseCount: responseCountRow?.count ?? 0,
        theme: row.theme
          ? {
              id: row.theme.id,
              name: row.theme.name,
              configJson: row.theme.configJson,
            }
          : null,
        fields: await db
          .select({
            id: formFieldsTable.id,
            type: formFieldsTable.type,
            key: formFieldsTable.fieldKey,
            label: formFieldsTable.label,
            required: formFieldsTable.required,
            order: formFieldsTable.order,
            config: formFieldsTable.configJson,
          })
          .from(formFieldsTable)
          .where(eq(formFieldsTable.formId, form.id))
          .orderBy(asc(formFieldsTable.order)),
      };
    }),

  /**
   * Lists every form marked as a template (`isTemplate=true`). Returns the
   * fields too because the new-form page renders previews + clones them into
   * a draft on selection. Capped at 50 since templates are a small curated
   * set — pagination would be overkill for the demo.
   *
   * Public on purpose: templates are demo content, anyone hitting /dashboard/new
   * (incl. unauthed visitors landing on the redirect) should see what's
   * available before signing in.
   */
  /**
   * Clones an existing form (owned by the caller) into a fresh draft.
   * Copies every field config, but resets status to draft, generates a new
   * slug (`<original>-copy-<6 digits>`), and prefixes the title with
   * "Copy of". Does NOT copy responses, analytics events, or themeId
   * reference (theme is preserved — that's part of the form's identity).
   *
   * If the original was a published form with a custom slug, the clone
   * doesn't inherit either — the creator gets a private draft they can
   * customise and publish independently.
   */
  clone: protectedMutationProcedure
    .meta({ openapi: { method: "POST", path: getPath("/clone"), tags: TAGS } })
    .input(z.object({ formId: z.string().uuid() }))
    .output(formSummarySchema)
    .mutation(async ({ ctx, input }) => {
      // Wrap the read + duplicate in a transaction so the original can't be
      // deleted out from under us mid-clone (Postgres serialisable would be
      // overkill; the default isolation is fine since the worst case is a
      // failed insert and an early rollback).
      const result = await db.transaction(async (tx) => {
        const [original] = await tx
          .select()
          .from(formsTable)
          .where(
            and(eq(formsTable.id, input.formId), eq(formsTable.creatorId, ctx.userId)),
          )
          .limit(1);
        if (!original) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Form not found." });
        }

        const originalFields = await tx
          .select()
          .from(formFieldsTable)
          .where(eq(formFieldsTable.formId, original.id))
          .orderBy(asc(formFieldsTable.order));

        // Slug needs to be unique — append a 6-digit time suffix to a
        // base derived from the original. Title prefix gives the creator
        // an obvious visual cue this is a copy.
        const suffix = Date.now().toString().slice(-6);
        const newSlug = `${original.slug.slice(0, 60)}-copy-${suffix}`.slice(
          0,
          80,
        );
        const newTitle = `Copy of ${original.title}`.slice(0, 120);

        const [created] = await tx
          .insert(formsTable)
          .values({
            creatorId: ctx.userId,
            title: newTitle,
            description: original.description,
            slug: newSlug,
            // Always reset to draft + unlisted — the creator should opt in
            // to making the clone public/published rather than inheriting
            // the original's posture and accidentally publishing twice.
            visibility: "unlisted",
            status: "draft",
            isTemplate: false,
            responseLimit: original.responseLimit,
            // Clone keeps the original's theme + expiry; both are stylistic
            // choices the creator made for the original and would likely
            // want preserved.
            expiresAt: original.expiresAt,
            themeId: original.themeId,
            publishedAt: null,
          })
          .returning();
        if (!created) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to clone form.",
          });
        }

        if (originalFields.length > 0) {
          await tx.insert(formFieldsTable).values(
            originalFields.map((f) => ({
              formId: created.id,
              type: f.type,
              fieldKey: f.fieldKey,
              label: f.label,
              required: f.required,
              order: f.order,
              configJson: f.configJson,
            })),
          );
        }

        return created;
      });

      return {
        id: result.id,
        title: result.title,
        slug: result.slug,
        visibility: result.visibility,
        status: result.status,
        updatedAt: result.updatedAt,
      };
    }),

  listTemplates: publicProcedure
    .meta({ openapi: { method: "GET", path: getPath("/templates"), tags: TAGS } })
    .input(z.undefined())
    .output(
      z.array(
        z.object({
          id: z.string().uuid(),
          slug: z.string(),
          title: z.string(),
          description: z.string().nullable(),
          fields: z.array(formFieldOutputSchema),
        }),
      ),
    )
    .query(async () => {
      const templates = await db
        .select({
          id: formsTable.id,
          slug: formsTable.slug,
          title: formsTable.title,
          description: formsTable.description,
        })
        .from(formsTable)
        .where(eq(formsTable.isTemplate, true))
        .orderBy(asc(formsTable.title))
        .limit(50);

      if (templates.length === 0) return [];

      // Fetch all template fields in one shot, then group by formId.
      // Avoids the N+1 query pattern of one-per-template.
      const templateIds = templates.map((t) => t.id);
      const allFields = await db
        .select({
          formId: formFieldsTable.formId,
          id: formFieldsTable.id,
          type: formFieldsTable.type,
          key: formFieldsTable.fieldKey,
          label: formFieldsTable.label,
          required: formFieldsTable.required,
          order: formFieldsTable.order,
          config: formFieldsTable.configJson,
        })
        .from(formFieldsTable)
        .where(inArray(formFieldsTable.formId, templateIds))
        .orderBy(asc(formFieldsTable.order));

      const fieldsByFormId = new Map<string, typeof allFields>();
      for (const field of allFields) {
        const existing = fieldsByFormId.get(field.formId) ?? [];
        existing.push(field);
        fieldsByFormId.set(field.formId, existing);
      }

      return templates.map((t) => ({
        id: t.id,
        slug: t.slug,
        title: t.title,
        description: t.description,
        // Drop formId from the output — the consumer only cares about field
        // shape, not which template they originated from.
        fields: (fieldsByFormId.get(t.id) ?? []).map(({ formId: _formId, ...rest }) => rest),
      }));
    }),

  listPublic: publicProcedure
    .meta({ openapi: { method: "GET", path: getPath("/public"), tags: TAGS } })
    .input(listPublicFormsInputSchema.optional())
    .output(z.array(formSummarySchema))
    .query(async ({ input }) => {
      const limit = input?.limit ?? 20;

      return db
        .select({
          id: formsTable.id,
          title: formsTable.title,
          slug: formsTable.slug,
          visibility: formsTable.visibility,
          status: formsTable.status,
          updatedAt: formsTable.updatedAt,
        })
        .from(formsTable)
        .where(and(eq(formsTable.visibility, "public"), eq(formsTable.status, "published")))
        .orderBy(desc(formsTable.updatedAt))
        .limit(limit);
    }),

  listPublicWithStats: publicProcedure
    .meta({ openapi: { method: "GET", path: getPath("/public-with-stats"), tags: TAGS } })
    .input(listPublicFormsInputSchema.optional())
    .output(
      z.array(
        z.object({
          id: z.string().uuid(),
          title: z.string(),
          slug: z.string(),
          description: z.string().nullable(),
          updatedAt: z.date(),
          publishedAt: z.date().nullable(),
          fieldCount: z.number().int().nonnegative(),
          responseCount: z.number().int().nonnegative(),
        }),
      ),
    )
    .query(async ({ input }) => {
      const limit = input?.limit ?? 24;

      const rows = await db
        .select({
          id: formsTable.id,
          title: formsTable.title,
          slug: formsTable.slug,
          description: formsTable.description,
          updatedAt: formsTable.updatedAt,
          publishedAt: formsTable.publishedAt,
          fieldCount: sql<number>`cast(coalesce((select count(*) from ${formFieldsTable} where ${formFieldsTable.formId} = ${formsTable.id}), 0) as int)`,
          responseCount: sql<number>`cast(coalesce((select count(*) from ${responsesTable} where ${responsesTable.formId} = ${formsTable.id}), 0) as int)`,
        })
        .from(formsTable)
        .where(and(eq(formsTable.visibility, "public"), eq(formsTable.status, "published")))
        .orderBy(desc(formsTable.updatedAt))
        .limit(limit);

      return rows.map((row) => ({
        ...row,
        description: row.description ?? null,
        publishedAt: row.publishedAt ? new Date(row.publishedAt) : null,
        updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
      }));
    }),
});
