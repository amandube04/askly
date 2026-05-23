import { initTRPC, TRPCError } from "@trpc/server";
import { OpenApiMeta } from "trpc-to-openapi";
import { db, eq } from "@repo/database";
import { usersTable } from "@repo/database/schema";
import { validateCsrfToken } from "./auth/session-store";

import { createContext } from "./context";

export const tRPCContext = initTRPC
  .meta<OpenApiMeta>()
  .context<typeof createContext>()
  .create({});

export const router = tRPCContext.router;

export const publicProcedure = tRPCContext.procedure;

function extractOriginSafely(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export const protectedProcedure = tRPCContext.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Creator authentication is required.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  });
});

// Admin gate: a procedure that requires the authenticated user's `role`
// column to be `admin`. Looked up fresh per request rather than cached on
// the session — keeps admin status revocable without forcing the user to
// re-login. Throws FORBIDDEN (not UNAUTHORIZED) so the client can
// distinguish "not signed in" from "signed in but not authorized".
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const [user] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, ctx.userId))
    .limit(1);
  if (!user || user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin role required.",
    });
  }
  return next();
});

export const protectedMutationProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const allowedOrigin = process.env.APP_BASE_URL;
  if (ctx.requestOrigin && allowedOrigin) {
    const requestOrigin = extractOriginSafely(ctx.requestOrigin);
    const trustedOrigin = extractOriginSafely(allowedOrigin);
    if (!requestOrigin || !trustedOrigin || requestOrigin !== trustedOrigin) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Origin is not allowed.",
      });
    }
  }

  const csrfHeader = ctx.csrfHeaderToken;
  const csrfCookie = ctx.csrfCookieToken;
  const sessionToken = ctx.sessionToken;

  if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "CSRF validation failed.",
    });
  }

  const isCsrfValid = await validateCsrfToken(sessionToken, csrfHeader);
  if (!isCsrfValid) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Invalid CSRF token.",
    });
  }

  return next();
});
