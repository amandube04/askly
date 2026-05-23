import express from "express";
import { logger } from "@repo/logger";
import cors from "cors";

import * as trpcExpress from "@trpc/server/adapters/express";
import { generateOpenApiDocument, createOpenApiExpressMiddleware } from "trpc-to-openapi";
import { apiReference } from "@scalar/express-api-reference";

import { serverRouter, createContext } from "@repo/trpc/server";
import {
  ASKLY_CSRF_COOKIE,
  ASKLY_REFRESH_COOKIE,
  ASKLY_SESSION_COOKIE,
  issueSession,
} from "@repo/trpc/server/auth/session-store";
import { processPendingEmailJobs } from "@repo/trpc/server/jobs/email-queue";
import { userService } from "@repo/trpc/server/services";

import { env } from "./env";

export const app = express();
const openApiDocument = generateOpenApiDocument(serverRouter, {
  title: "Askly OpenAPI",
  version: "1.0.0",
  baseUrl: env.BASE_URL.concat("/api"),
});

// CORS must be wired in BOTH dev and prod — credentialed cross-origin requests
// from the web app can't reach the API without it, and skipping it in prod
// breaks every cross-origin deployment.
if (env.NODE_ENV === "prod") {
  // Prod: only the configured web origin is allowed. Anything else is rejected.
  const allowedOrigin = new URL(env.APP_BASE_URL).origin;
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow same-origin/non-browser requests (no Origin header).
        if (!origin) return callback(null, true);
        if (origin === allowedOrigin) return callback(null, true);
        return callback(new Error(`CORS: origin ${origin} not allowed`));
      },
      credentials: true,
    }),
  );
} else {
  // Dev: reflect the request origin and allow credentials so the browser
  // round-trips the CSRF cookie set by /trpc auth.* mutations. Wildcard origin
  // is incompatible with credentialed requests, so we cannot use "*" here.
  app.use(
    cors({
      origin: (origin, callback) => callback(null, origin ?? true),
      credentials: true,
    }),
  );
}

setInterval(() => {
  processPendingEmailJobs().catch((error) => {
    logger.error(`Email queue worker iteration failed`, { error });
  });
}, 5000);

app.use(express.json());

app.get("/", (req, res) => {
  return res.json({ message: "Askly is up and running..." });
});

app.get("/health", (req, res) => {
  return res.json({ message: "Askly server is healthy", healthy: true });
});

app.get("/auth/google/callback", async (req, res) => {
  const redirectUrl = new URL("/dashboard", env.APP_BASE_URL);

  const oauthError = typeof req.query.error === "string" ? req.query.error : null;
  if (oauthError) {
    redirectUrl.searchParams.set("oauth", "error");
    redirectUrl.searchParams.set("reason", oauthError);
    return res.redirect(302, redirectUrl.toString());
  }

  const code = typeof req.query.code === "string" ? req.query.code : null;
  if (!code) {
    redirectUrl.searchParams.set("oauth", "error");
    redirectUrl.searchParams.set("reason", "missing_code");
    return res.redirect(302, redirectUrl.toString());
  }

  try {
    const user = await userService.loginOrCreateWithGoogleAuthorizationCode(code);
    const issuedSession = await issueSession({
      userId: user.id,
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });

    res.setHeader("Set-Cookie", [
      `${ASKLY_SESSION_COOKIE}=${encodeURIComponent(issuedSession.sessionToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800`,
      `${ASKLY_REFRESH_COOKIE}=${encodeURIComponent(issuedSession.refreshToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1209600`,
      `${ASKLY_CSRF_COOKIE}=${encodeURIComponent(issuedSession.csrfToken)}; Path=/; SameSite=Lax; Max-Age=1800`,
    ]);

    // SECURITY: do NOT put any session/refresh/csrf tokens in the redirect
    // URL. Earlier versions stashed them in query params so the SPA could
    // copy them into localStorage on cross-origin deployments where JS
    // can't read the API's cookies directly. That leaked the credentials
    // via:
    //   • the browser's Referer header on the very next outbound link
    //     click (sent to ANY third-party host)
    //   • browser history (visible in history.back(), DevTools, browser
    //     sync to other devices)
    //   • any access log / reverse-proxy log along the redirect path
    //
    // The dashboard now bootstraps by calling auth.getSession() instead.
    // The HttpOnly session/refresh cookies set above flow back to the API
    // on that call via `credentials: "include"`, the API echoes the CSRF
    // token in the response body (the value is identical to the CSRF
    // cookie it just set, so this doesn't widen the attack surface), and
    // the dashboard caches the userId+CSRF token in localStorage from
    // there. The only thing in the URL now is `oauth=success` — a
    // non-secret status flag.
    redirectUrl.searchParams.set("oauth", "success");
    return res.redirect(302, redirectUrl.toString());
  } catch (error) {
    logger.error(`Google OAuth callback failed`, { error });
    redirectUrl.searchParams.set("oauth", "error");
    redirectUrl.searchParams.set("reason", "oauth_callback_failed");
    return res.redirect(302, redirectUrl.toString());
  }
});

logger.debug(`openapi.json: ${env.BASE_URL}/openapi.json`);
app.get("/openapi.json", (req, res) => {
  return res.json(openApiDocument);
});

logger.debug(`docs: ${env.BASE_URL}/docs`);
app.use("/docs", apiReference({ url: "/openapi.json" }));

app.use(
  "/api",
  createOpenApiExpressMiddleware({
    router: serverRouter,
    createContext,
  }),
);

app.use(
  "/trpc",
  trpcExpress.createExpressMiddleware({
    router: serverRouter,
    createContext,
  }),
);

export default app;
