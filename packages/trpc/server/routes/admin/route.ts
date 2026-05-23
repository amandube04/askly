import { and, db, desc, eq, gte, sql } from "@repo/database";
import {
  formsTable,
  responsesTable,
  usersTable,
} from "@repo/database/schema";
import { z } from "@repo/validators";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

const TAGS = ["Admin"];
const getPath = generatePath("/admin");

/**
 * Admin router — restricted to users with `role = 'admin'`. Surfaces
 * platform-wide metrics (user count, form count, response count, recent
 * signups, top creators by form count) plus a soft-moderation flow for
 * forcibly unpublishing forms that shouldn't be live. Every procedure
 * runs through `adminProcedure`, which re-checks the user's role on every
 * request so demotion takes effect immediately.
 */
export const adminRouter = router({
  // High-level metrics for the /admin dashboard hero cards.
  getOverview: adminProcedure
    .meta({ openapi: { method: "GET", path: getPath("/overview"), tags: TAGS } })
    .input(z.undefined())
    .output(
      z.object({
        totals: z.object({
          users: z.number().int().nonnegative(),
          forms: z.number().int().nonnegative(),
          publishedForms: z.number().int().nonnegative(),
          responses: z.number().int().nonnegative(),
          // "Recent" = last 7 days. Defines a heartbeat for the platform
          // without needing to render a full time series here.
          responsesLast7Days: z.number().int().nonnegative(),
          newUsersLast7Days: z.number().int().nonnegative(),
        }),
        // Top 10 creators by form count — light-touch leaderboard for
        // spotting power users and noisy accounts in one glance.
        topCreators: z.array(
          z.object({
            userId: z.string().uuid(),
            fullName: z.string(),
            email: z.string(),
            role: z.string(),
            formCount: z.number().int().nonnegative(),
          }),
        ),
      }),
    )
    .query(async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const [
        [userCount],
        [formCount],
        [publishedCount],
        [responseCount],
        [recentResponseCount],
        [recentUserCount],
      ] = await Promise.all([
        db.select({ c: sql<number>`cast(count(*) as int)` }).from(usersTable),
        db.select({ c: sql<number>`cast(count(*) as int)` }).from(formsTable),
        db
          .select({ c: sql<number>`cast(count(*) as int)` })
          .from(formsTable)
          .where(eq(formsTable.status, "published")),
        db
          .select({ c: sql<number>`cast(count(*) as int)` })
          .from(responsesTable),
        db
          .select({ c: sql<number>`cast(count(*) as int)` })
          .from(responsesTable)
          .where(gte(responsesTable.submittedAt, sevenDaysAgo)),
        db
          .select({ c: sql<number>`cast(count(*) as int)` })
          .from(usersTable)
          .where(gte(usersTable.createdAt, sevenDaysAgo)),
      ]);

      const topCreators = await db
        .select({
          userId: usersTable.id,
          fullName: usersTable.fullName,
          email: usersTable.email,
          role: usersTable.role,
          formCount: sql<number>`cast(count(${formsTable.id}) as int)`,
        })
        .from(usersTable)
        .leftJoin(formsTable, eq(formsTable.creatorId, usersTable.id))
        .groupBy(usersTable.id, usersTable.fullName, usersTable.email, usersTable.role)
        .orderBy(desc(sql`count(${formsTable.id})`))
        .limit(10);

      return {
        totals: {
          users: userCount?.c ?? 0,
          forms: formCount?.c ?? 0,
          publishedForms: publishedCount?.c ?? 0,
          responses: responseCount?.c ?? 0,
          responsesLast7Days: recentResponseCount?.c ?? 0,
          newUsersLast7Days: recentUserCount?.c ?? 0,
        },
        topCreators,
      };
    }),

  // Paginated list of every form on the platform with the creator
  // attached. Used for the "Recent forms" table on the admin page.
  listForms: adminProcedure
    .meta({ openapi: { method: "GET", path: getPath("/forms"), tags: TAGS } })
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(50).default(20),
      }),
    )
    .output(
      z.object({
        items: z.array(
          z.object({
            id: z.string().uuid(),
            title: z.string(),
            slug: z.string(),
            status: z.string(),
            visibility: z.string(),
            creatorName: z.string(),
            creatorEmail: z.string(),
            updatedAt: z.date(),
            responseCount: z.number().int().nonnegative(),
          }),
        ),
        total: z.number().int().nonnegative(),
        page: z.number().int().nonnegative(),
        pageSize: z.number().int().nonnegative(),
        hasMore: z.boolean(),
      }),
    )
    .query(async ({ input }) => {
      const offset = (input.page - 1) * input.pageSize;
      const [count] = await db
        .select({ c: sql<number>`cast(count(*) as int)` })
        .from(formsTable);

      const items = await db
        .select({
          id: formsTable.id,
          title: formsTable.title,
          slug: formsTable.slug,
          status: formsTable.status,
          visibility: formsTable.visibility,
          creatorName: usersTable.fullName,
          creatorEmail: usersTable.email,
          updatedAt: formsTable.updatedAt,
          responseCount: sql<number>`cast((select count(*) from ${responsesTable} where ${responsesTable.formId} = ${formsTable.id}) as int)`,
        })
        .from(formsTable)
        .innerJoin(usersTable, eq(usersTable.id, formsTable.creatorId))
        .orderBy(desc(formsTable.updatedAt))
        .limit(input.pageSize)
        .offset(offset);

      const total = count?.c ?? 0;
      return {
        items,
        total,
        page: input.page,
        pageSize: input.pageSize,
        hasMore: input.page * input.pageSize < total,
      };
    }),

  // Force a form back to draft. Useful for moderation: a creator's
  // form goes viral with abuse and the admin needs to pull it offline
  // without nuking the data. Idempotent — if the form is already
  // unpublished this is a no-op.
  forceUnpublish: adminProcedure
    .meta({ openapi: { method: "POST", path: getPath("/forms/{formId}/unpublish"), tags: TAGS } })
    .input(z.object({ formId: z.string().uuid() }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ input }) => {
      const [updated] = await db
        .update(formsTable)
        .set({ status: "draft" })
        .where(and(eq(formsTable.id, input.formId)))
        .returning({ id: formsTable.id });
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Form not found." });
      }
      return { ok: true };
    }),
});
