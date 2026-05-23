import { db, eq } from "@repo/database";
import { usersTable } from "@repo/database/schema";
import { TRPCError } from "@trpc/server";
import {
  ASKLY_CSRF_COOKIE,
  ASKLY_REFRESH_COOKIE,
  ASKLY_SESSION_COOKIE,
  issueSession,
  revokeSessionToken,
  rotateAccessTokenFromRefreshToken,
} from "../../auth/session-store";
import { z, zodUndefinedModel } from "../../schema";
import { userService } from "../../services";
import { getAuthenticationMethodOutputSchema } from "@repo/services/user/model";
import { protectedMutationProcedure, protectedProcedure, publicProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

const TAGS = ["Authentication"];
const getPath = generatePath("/authentication");

function extractOriginSafely(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function setAuthCookies(
  setCookie: ((cookieValue: string) => void) | null,
  values: { sessionToken: string; refreshToken?: string; csrfToken: string },
) {
  setCookie?.(
    `${ASKLY_SESSION_COOKIE}=${encodeURIComponent(values.sessionToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800`,
  );
  if (values.refreshToken) {
    setCookie?.(
      `${ASKLY_REFRESH_COOKIE}=${encodeURIComponent(values.refreshToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1209600`,
    );
  }
  setCookie?.(
    `${ASKLY_CSRF_COOKIE}=${encodeURIComponent(values.csrfToken)}; Path=/; SameSite=Lax; Max-Age=1800`,
  );
}

export const authRouter = router({
  getSupportedAuthenticationProviders: publicProcedure
    .meta({ openapi: { method: "GET", path: getPath("/supported-providers"), tags: TAGS } })
    .input(zodUndefinedModel)
    .output(z.readonly(z.array(getAuthenticationMethodOutputSchema)))
    .query(async () => {
      const supportedMethods = await userService.getAuthenticationMethods();
      return supportedMethods;
    }),

  loginAsDemo: publicProcedure
    .meta({ openapi: { method: "POST", path: getPath("/demo-login"), tags: TAGS } })
    .input(z.object({}).optional())
    .output(
      z.object({
        userId: z.string().uuid(),
        email: z.string().email(),
        fullName: z.string(),
        sessionToken: z.string(),
        refreshToken: z.string(),
        csrfToken: z.string(),
      }),
    )
    .mutation(async ({ ctx }) => {
      const demoEmail = "demo@askly.dev";
      const [existingUser] = await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          fullName: usersTable.fullName,
        })
        .from(usersTable)
        .where(eq(usersTable.email, demoEmail))
        .limit(1);

      if (existingUser) {
        const issuedSession = await issueSession({
          userId: existingUser.id,
          ipAddress: ctx.ipAddress,
          userAgent: null,
        });
        setAuthCookies(ctx.setCookie, issuedSession);

        return {
          userId: existingUser.id,
          email: existingUser.email,
          fullName: existingUser.fullName,
          sessionToken: issuedSession.sessionToken,
          refreshToken: issuedSession.refreshToken,
          csrfToken: issuedSession.csrfToken,
        };
      }

      const [createdUser] = await db
        .insert(usersTable)
        .values({
          fullName: "Askly Demo Creator",
          email: demoEmail,
          passwordHash: "demo-password-hash",
          role: "creator",
          emailVerified: true,
        })
        .returning({
          id: usersTable.id,
          email: usersTable.email,
          fullName: usersTable.fullName,
        });
      if (!createdUser) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create demo creator account.",
        });
      }
      const issuedSession = await issueSession({
        userId: createdUser.id,
        ipAddress: ctx.ipAddress,
        userAgent: null,
      });
      setAuthCookies(ctx.setCookie, issuedSession);

      return {
        userId: createdUser.id,
        email: createdUser.email,
        fullName: createdUser.fullName,
        sessionToken: issuedSession.sessionToken,
        refreshToken: issuedSession.refreshToken,
        csrfToken: issuedSession.csrfToken,
      };
    }),

  refreshSession: publicProcedure
    .meta({ openapi: { method: "POST", path: getPath("/refresh"), tags: TAGS } })
    .input(z.object({}).optional())
    .output(
      z.object({
        success: z.boolean(),
        sessionToken: z.string().optional(),
        refreshToken: z.string().optional(),
        csrfToken: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx }) => {
      if (ctx.requestOrigin && process.env.APP_BASE_URL) {
        const requestOrigin = extractOriginSafely(ctx.requestOrigin);
        const trustedOrigin = extractOriginSafely(process.env.APP_BASE_URL);
        if (!requestOrigin || !trustedOrigin || requestOrigin !== trustedOrigin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Origin is not allowed.",
          });
        }
      }

      const rotated = await rotateAccessTokenFromRefreshToken(ctx.refreshToken, {
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
      if (!rotated) {
        return {
          success: false,
        };
      }

      setAuthCookies(ctx.setCookie, {
        sessionToken: rotated.sessionToken,
        refreshToken: rotated.refreshToken,
        csrfToken: rotated.csrfToken,
      });

      return {
        success: true,
        sessionToken: rotated.sessionToken,
        refreshToken: rotated.refreshToken,
        csrfToken: rotated.csrfToken,
      };
    }),

  getSession: protectedProcedure
    .meta({ openapi: { method: "GET", path: getPath("/session"), tags: TAGS } })
    .input(zodUndefinedModel)
    .output(
      z.object({
        userId: z.string().uuid(),
        email: z.string().email(),
        fullName: z.string(),
        // Google OAuth users get a profile image; demo/email users don't.
        profileImageUrl: z.string().nullable(),
        // "creator" | "admin" — the client uses this to decide whether
        // to show the /admin link in the nav. Server-side access checks
        // re-validate the role on every admin tRPC call, so this is a
        // UX hint only.
        role: z.enum(["creator", "admin"]),
        // CSRF token echoed from the cookie the server set on login. We
        // surface it here so the OAuth bootstrap flow can stash it in
        // localStorage WITHOUT the server putting credentials in the
        // redirect URL (which previously leaked via Referer headers,
        // browser history, and access logs). The browser already sends
        // the CSRF cookie back via `credentials: "include"` — this just
        // makes it visible to JS on cross-origin web hosts where the
        // cookie itself isn't reachable from `document.cookie`. The
        // value matches the cookie verbatim, so this changes nothing
        // about the existing double-submit CSRF guarantee. Nullable
        // because non-cookie auth flows (Bearer-only API clients)
        // legitimately have no CSRF cookie in their context.
        csrfToken: z.string().nullable(),
      }),
    )
    .query(async ({ ctx }) => {
      const [user] = await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          fullName: usersTable.fullName,
          profileImageUrl: usersTable.profileImageUrl,
          role: usersTable.role,
        })
        .from(usersTable)
        .where(eq(usersTable.id, ctx.userId))
        .limit(1);

      if (!user) {
        // Session points at a userId that no longer exists in the DB — the
        // session token outlived the user record. Surface explicitly so the
        // client can wipe local tokens instead of looping on broken state.
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      return {
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        profileImageUrl: user.profileImageUrl,
        role: user.role,
        csrfToken: ctx.csrfCookieToken,
      };
    }),

  logout: protectedMutationProcedure
    .meta({ openapi: { method: "POST", path: getPath("/logout"), tags: TAGS } })
    .input(zodUndefinedModel)
    .output(z.object({ success: z.literal(true) }))
    .mutation(async ({ ctx }) => {
      await revokeSessionToken(ctx.sessionToken);
      ctx.setCookie?.(`${ASKLY_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
      ctx.setCookie?.(`${ASKLY_REFRESH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
      ctx.setCookie?.(`${ASKLY_CSRF_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0`);

      return { success: true };
    }),
});
