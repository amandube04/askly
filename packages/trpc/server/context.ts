import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { ASKLY_CSRF_COOKIE, ASKLY_REFRESH_COOKIE, ASKLY_SESSION_COOKIE, resolveSessionUserId } from "./auth/session-store";

function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};

  return cookieHeader.split(";").reduce<Record<string, string>>((accumulator, pair) => {
    const [rawKey, ...rawValue] = pair.split("=");
    const key = rawKey?.trim();
    if (!key) return accumulator;

    const value = rawValue.join("=").trim();
    accumulator[key] = decodeURIComponent(value);
    return accumulator;
  }, {});
}

export async function createContext(opts?: CreateExpressContextOptions) {
  const authorizationHeader = opts?.req.headers.authorization;
  const bearerToken = authorizationHeader?.startsWith("Bearer ")
    ? authorizationHeader.slice("Bearer ".length).trim()
    : null;
  const cookies = parseCookies(opts?.req.headers.cookie);
  const sessionToken = cookies[ASKLY_SESSION_COOKIE] ?? bearerToken;
  const refreshHeaderToken =
    typeof opts?.req.headers["x-refresh-token"] === "string" ? opts.req.headers["x-refresh-token"] : null;
  const refreshToken = cookies[ASKLY_REFRESH_COOKIE] ?? refreshHeaderToken ?? null;
  const csrfCookieToken = cookies[ASKLY_CSRF_COOKIE] ?? null;
  const csrfHeaderToken = typeof opts?.req.headers["x-csrf-token"] === "string" ? opts.req.headers["x-csrf-token"] : null;
  const userIdFromSession = await resolveSessionUserId(sessionToken);
  const requestMethod = opts?.req.method ?? "GET";
  const requestOrigin = typeof opts?.req.headers.origin === "string" ? opts.req.headers.origin : null;
  const userAgent = typeof opts?.req.headers["user-agent"] === "string" ? opts.req.headers["user-agent"] : null;

  const forwardedForHeader = opts?.req.headers["x-forwarded-for"];
  const firstForwardedIp =
    typeof forwardedForHeader === "string" ? forwardedForHeader.split(",")[0]?.trim() : null;
  const ipAddress = firstForwardedIp || opts?.req.socket?.remoteAddress || "unknown";

  const userId = userIdFromSession;

  const setCookie = opts?.res
    ? (cookieValue: string) => {
        const existingCookieHeader = opts.res.getHeader("Set-Cookie");
        if (!existingCookieHeader) {
          opts.res.setHeader("Set-Cookie", cookieValue);
          return;
        }
        if (Array.isArray(existingCookieHeader)) {
          opts.res.setHeader("Set-Cookie", [...existingCookieHeader, cookieValue]);
          return;
        }
        opts.res.setHeader("Set-Cookie", [String(existingCookieHeader), cookieValue]);
      }
    : null;

  return {
    userId,
    ipAddress,
    sessionToken,
    refreshToken,
    csrfCookieToken,
    csrfHeaderToken,
    requestMethod,
    requestOrigin,
    userAgent,
    setCookie,
  };
}
export type Context = Awaited<ReturnType<typeof createContext>>;
