import { and, db, desc, eq, sql } from "@repo/database";
import { answersTable, formEventsTable, formFieldsTable, formsTable, responsesTable } from "@repo/database/schema";
import { trackFormEventInputSchema } from "@repo/validators";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "../../trpc";
import { z } from "../../schema";
import { generatePath } from "../../utils/path-generator";

const TAGS = ["Analytics"];
const getPath = generatePath("/analytics");

export const analyticsRouter = router({
  getCreatorOverview: protectedProcedure
    .meta({ openapi: { method: "GET", path: getPath("/creator-overview"), tags: TAGS } })
    .input(z.undefined())
    .output(
      z.object({
        totalForms: z.number().int().nonnegative(),
        totalViews: z.number().int().nonnegative(),
        totalStarts: z.number().int().nonnegative(),
        totalSubmits: z.number().int().nonnegative(),
        // null when totalViews === 0 — no signal yet, don't display 0%
        completionRatePercent: z.number().nullable(),
        responsesThisWeek: z.number().int().nonnegative(),
        responsesLastWeek: z.number().int().nonnegative(),
        // null when responsesLastWeek === 0 — no baseline for delta
        weeklyTrendPercent: z.number().nullable(),
        topForm: z
          .object({
            id: z.string().uuid(),
            title: z.string(),
            slug: z.string(),
            responseCount: z.number().int().nonnegative(),
          })
          .nullable(),
      }),
    )
    .query(async ({ ctx }) => {
      // Aggregates funnel + response data across every form owned by the
      // creator. Used by the dashboard right-rail Insights card so we don't
      // need to fan out per-form analytics on the client.
      const [eventCountsRow] = await db
        .select({
          views: sql<number>`cast(count(*) filter (where ${formEventsTable.eventType} = 'view') as int)`,
          starts: sql<number>`cast(count(*) filter (where ${formEventsTable.eventType} = 'start') as int)`,
          submits: sql<number>`cast(count(*) filter (where ${formEventsTable.eventType} = 'submit') as int)`,
        })
        .from(formEventsTable)
        .innerJoin(formsTable, eq(formsTable.id, formEventsTable.formId))
        .where(eq(formsTable.creatorId, ctx.userId));

      const [responseWindowRow] = await db
        .select({
          thisWeek: sql<number>`cast(count(*) filter (where ${responsesTable.submittedAt} >= now() - interval '7 days') as int)`,
          lastWeek: sql<number>`cast(count(*) filter (where ${responsesTable.submittedAt} >= now() - interval '14 days' and ${responsesTable.submittedAt} < now() - interval '7 days') as int)`,
        })
        .from(responsesTable)
        .innerJoin(formsTable, eq(formsTable.id, responsesTable.formId))
        .where(eq(formsTable.creatorId, ctx.userId));

      const [formCountRow] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(formsTable)
        .where(eq(formsTable.creatorId, ctx.userId));

      // Top form by response volume; tie-broken by most-recent update so an
      // active draft outranks a stale form with the same count.
      const [topFormRow] = await db
        .select({
          id: formsTable.id,
          title: formsTable.title,
          slug: formsTable.slug,
          responseCount: sql<number>`cast(count(${responsesTable.id}) as int)`,
        })
        .from(formsTable)
        .leftJoin(responsesTable, eq(responsesTable.formId, formsTable.id))
        .where(eq(formsTable.creatorId, ctx.userId))
        .groupBy(formsTable.id)
        .orderBy(desc(sql<number>`count(${responsesTable.id})`), desc(formsTable.updatedAt))
        .limit(1);

      const totalViews = eventCountsRow?.views ?? 0;
      const totalStarts = eventCountsRow?.starts ?? 0;
      const totalSubmits = eventCountsRow?.submits ?? 0;
      const thisWeek = responseWindowRow?.thisWeek ?? 0;
      const lastWeek = responseWindowRow?.lastWeek ?? 0;

      const completionRatePercent =
        totalViews > 0 ? Number(((totalSubmits / totalViews) * 100).toFixed(1)) : null;

      // Avoid divide-by-zero and avoid presenting infinite/NaN growth.
      const weeklyTrendPercent =
        lastWeek > 0 ? Number((((thisWeek - lastWeek) / lastWeek) * 100).toFixed(1)) : null;

      return {
        totalForms: formCountRow?.count ?? 0,
        totalViews,
        totalStarts,
        totalSubmits,
        completionRatePercent,
        responsesThisWeek: thisWeek,
        responsesLastWeek: lastWeek,
        weeklyTrendPercent,
        topForm:
          topFormRow && topFormRow.responseCount > 0
            ? {
                id: topFormRow.id,
                title: topFormRow.title,
                slug: topFormRow.slug,
                responseCount: topFormRow.responseCount,
              }
            : null,
      };
    }),


  trackEvent: publicProcedure
    .meta({ openapi: { method: "POST", path: getPath("/event"), tags: TAGS } })
    .input(trackFormEventInputSchema)
    .output(z.object({ success: z.literal(true) }))
    .mutation(async ({ input }) => {
      // Pull status alongside the id so we can reject events for forms
      // that aren't actually live. Without this gate, anyone could POST to
      // /analytics.trackEvent with any slug and pollute the analytics of
      // a draft/archived/unpublished form they don't own — a creator
      // looking at their drop-off chart would see ghost "views" they
      // never received. Same NOT_FOUND code for non-existent AND
      // non-published forms so we don't leak the existence of unpublished
      // drafts via probing.
      const [form] = await db
        .select({ id: formsTable.id, status: formsTable.status })
        .from(formsTable)
        .where(eq(formsTable.slug, input.slug))
        .limit(1);
      if (!form || form.status !== "published") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Form not found.",
        });
      }

      await db.insert(formEventsTable).values({
        formId: form.id,
        eventType: input.eventType,
        visitorId: input.visitorId,
      });

      return { success: true };
    }),

  getOverview: protectedProcedure
    .meta({ openapi: { method: "GET", path: getPath("/overview/{formId}"), tags: TAGS } })
    .input(z.object({ formId: z.string().uuid() }))
    .output(
      z.object({
        formId: z.string().uuid(),
        title: z.string(),
        totalResponses: z.number(),
        todayResponses: z.number(),
        last7DaysResponses: z.number(),
        uniqueRespondents: z.number(),
        totalViews: z.number(),
        totalStarts: z.number(),
        totalSubmits: z.number(),
        totalFields: z.number(),
        requiredFields: z.number(),
        averageAnswersPerResponse: z.number(),
        completionRateEstimate: z.number().nullable(),
        dropOffRateEstimate: z.number().nullable(),
        published: z.boolean(),
        responseLimit: z.number().nullable(),
        remainingResponses: z.number().nullable(),
        dailyTrend: z.array(
          z.object({
            date: z.string(),
            count: z.number(),
          }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [form] = await db
        .select({
          id: formsTable.id,
          title: formsTable.title,
          status: formsTable.status,
          responseLimit: formsTable.responseLimit,
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

      const [responseCountRow] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(responsesTable)
        .where(eq(responsesTable.formId, form.id));

      const [viewCountRow] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(formEventsTable)
        .where(and(eq(formEventsTable.formId, form.id), eq(formEventsTable.eventType, "view")));

      const [startCountRow] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(formEventsTable)
        .where(and(eq(formEventsTable.formId, form.id), eq(formEventsTable.eventType, "start")));

      const [submitCountRow] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(formEventsTable)
        .where(and(eq(formEventsTable.formId, form.id), eq(formEventsTable.eventType, "submit")));

      // Single round-trip for total + required field counts. The previous
      // version ran two queries AND had a redundant `totalFields` alias on
      // the required-only query that looked (to readers) like a bug where
      // totalFields was being filtered to required-only. It wasn't (the
      // unused column was just dropped silently), but the intent is much
      // clearer when both counts come from one query with a `filter` clause.
      const [fieldCountsRow] = await db
        .select({
          totalFields: sql<number>`cast(count(*) as int)`,
          requiredFields: sql<number>`cast(count(*) filter (where ${formFieldsTable.required} = true) as int)`,
        })
        .from(formFieldsTable)
        .where(eq(formFieldsTable.formId, form.id));

      const [answerCountRow] = await db
        .select({
          totalAnswers: sql<number>`cast(count(*) as int)`,
        })
        .from(answersTable)
        .innerJoin(responsesTable, eq(answersTable.responseId, responsesTable.id))
        .where(eq(responsesTable.formId, form.id));

      const [todayCountRow] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(responsesTable)
        .where(
          and(
            eq(responsesTable.formId, form.id),
            sql`${responsesTable.submittedAt} >= current_date`,
            sql`${responsesTable.submittedAt} < current_date + interval '1 day'`,
          ),
        );

      const [last7DaysCountRow] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(responsesTable)
        .where(
          and(eq(responsesTable.formId, form.id), sql`${responsesTable.submittedAt} >= now() - interval '7 days'`),
        );

      const [uniqueRespondentsRow] = await db
        .select({
          count: sql<number>`cast(count(distinct ${responsesTable.respondentEmail}) as int)`,
        })
        .from(responsesTable)
        .where(
          and(eq(responsesTable.formId, form.id), sql`${responsesTable.respondentEmail} is not null`),
        );

      const trendRows = await db
        .select({
          date: sql<string>`to_char(date_trunc('day', ${responsesTable.submittedAt}), 'YYYY-MM-DD')`,
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(responsesTable)
        .where(
          and(eq(responsesTable.formId, form.id), sql`${responsesTable.submittedAt} >= now() - interval '7 days'`),
        )
        .groupBy(sql`date_trunc('day', ${responsesTable.submittedAt})`)
        .orderBy(sql`date_trunc('day', ${responsesTable.submittedAt})`);

      const totalResponses = responseCountRow?.count ?? 0;
      const totalViews = viewCountRow?.count ?? 0;
      const totalStarts = startCountRow?.count ?? 0;
      const totalSubmits = submitCountRow?.count ?? 0;
      const totalFields = fieldCountsRow?.totalFields ?? 0;
      const requiredFields = fieldCountsRow?.requiredFields ?? 0;
      const totalAnswers = answerCountRow?.totalAnswers ?? 0;
      const averageAnswersPerResponse =
        totalResponses === 0 ? 0 : Number((totalAnswers / totalResponses).toFixed(2));
      const fallbackCompletionRate =
        requiredFields === 0 ? null : Math.min(100, Number(((averageAnswersPerResponse / requiredFields) * 100).toFixed(2)));
      const completionRateEstimate =
        totalViews > 0 ? Number(((totalSubmits / totalViews) * 100).toFixed(2)) : fallbackCompletionRate;
      const dropOffRateEstimate =
        totalStarts > 0
          ? Number((100 - (totalSubmits / totalStarts) * 100).toFixed(2))
          : completionRateEstimate === null
            ? null
            : Number((100 - completionRateEstimate).toFixed(2));
      const responseLimit = form.responseLimit ?? null;
      const remainingResponses = responseLimit === null ? null : Math.max(responseLimit - totalResponses, 0);

      return {
        formId: form.id,
        title: form.title,
        totalResponses,
        todayResponses: todayCountRow?.count ?? 0,
        last7DaysResponses: last7DaysCountRow?.count ?? 0,
        uniqueRespondents: uniqueRespondentsRow?.count ?? 0,
        totalViews,
        totalStarts,
        totalSubmits,
        totalFields,
        requiredFields,
        averageAnswersPerResponse,
        completionRateEstimate,
        dropOffRateEstimate,
        published: form.status === "published",
        responseLimit,
        remainingResponses,
        dailyTrend: trendRows.map((item) => ({
          date: item.date,
          count: item.count,
        })),
      };
    }),
});
