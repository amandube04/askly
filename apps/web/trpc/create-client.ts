import { httpLink, httpBatchStreamLink } from "@repo/trpc/client";
import { env } from "~/env.js";

interface CreateTRPCHttpBatchClientClientOpts {
  enableStreaming?: boolean;
}

const DEFAULT_TRPC_URL = "http://localhost:8000/trpc";
const SESSION_TOKEN_STORAGE_KEY = "askly.sessionToken";
const CSRF_TOKEN_STORAGE_KEY = "askly.csrfToken";
const REFRESH_TOKEN_STORAGE_KEY = "askly.refreshToken";

const getApiBaseUrl = () => {
  const trpcUrl = env.NEXT_PUBLIC_API_URL ?? DEFAULT_TRPC_URL;
  return trpcUrl.endsWith("/trpc") ? trpcUrl.slice(0, -"/trpc".length) : trpcUrl;
};

const getDevAuthHeaders = () => {
  if (typeof window === "undefined") return {};

  const sessionToken = window.localStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
  const csrfToken = window.localStorage.getItem(CSRF_TOKEN_STORAGE_KEY);
  const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  const headers: Record<string, string> = {};
  if (sessionToken) {
    headers.authorization = `Bearer ${sessionToken}`;
  }
  if (csrfToken) {
    headers["x-csrf-token"] = csrfToken;
  }
  if (refreshToken) {
    headers["x-refresh-token"] = refreshToken;
  }
  return headers;
};

const tryRefreshSession = async () => {
  if (typeof window === "undefined") return false;
  // Attempt refresh even when no LS refresh token is present: the HttpOnly
  // refresh cookie set by the API on login/OAuth is sent automatically with
  // credentials: "include", and the server reads it from cookies when no
  // x-refresh-token header is supplied. This keeps OAuth users working after
  // their access token expires without exposing the refresh token in the URL.
  const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (refreshToken) {
    headers["x-refresh-token"] = refreshToken;
  }

  const response = await fetch(`${getApiBaseUrl()}/api/authentication/refresh`, {
    method: "POST",
    credentials: "include",
    headers,
    body: "{}",
  });

  if (!response.ok) return false;
  const payload = (await response.json()) as {
    success: boolean;
    sessionToken?: string;
    refreshToken?: string;
    csrfToken?: string;
  };
  if (!payload.success || !payload.sessionToken || !payload.refreshToken || !payload.csrfToken) return false;

  // Only refresh the LS sessionToken/refreshToken if they were already
  // there. The refresh endpoint also rotates the HttpOnly cookies on
  // the API origin (via Set-Cookie), so OAuth-cookie users don't need
  // a localStorage shadow — keeping their access tokens out of LS is
  // exactly the point of the cookie-based flow we moved to in Bug 3.
  // The CSRF token IS always written because we need it to attach as
  // an `x-csrf-token` header on cross-origin mutations (where JS on the
  // web origin can't read the API origin's CSRF cookie). The CSRF token
  // is double-submit, not a credential on its own — leaking it from LS
  // gains an attacker nothing without also stealing the session cookie.
  if (window.localStorage.getItem(SESSION_TOKEN_STORAGE_KEY)) {
    window.localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, payload.sessionToken);
  }
  if (window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)) {
    window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, payload.refreshToken);
  }
  window.localStorage.setItem(CSRF_TOKEN_STORAGE_KEY, payload.csrfToken);
  return true;
};

export const createTRPCHttpBatchClientClient = (opts?: CreateTRPCHttpBatchClientClientOpts) => {
  const c = opts?.enableStreaming ? httpBatchStreamLink : httpLink;
  return c({
    url: env.NEXT_PUBLIC_API_URL ?? DEFAULT_TRPC_URL,
    async fetch(url, options) {
      const headers = new Headers(options?.headers);
      const authHeaders = getDevAuthHeaders();
      Object.entries(authHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });
      // "include" so the browser ships back the CSRF cookie that the server
      // sets on login/refresh. The CSRF middleware uses double-submit: header
      // value must match cookie value, and cookies only travel with credentials.
      const requestInit: RequestInit = {
        ...options,
        credentials: "include",
        headers,
      };

      const response = await fetch(url, requestInit);
      if (response.status !== 401) return response;

      const refreshed = await tryRefreshSession();
      if (!refreshed) return response;

      const retryHeaders = new Headers(options?.headers);
      const retryAuthHeaders = getDevAuthHeaders();
      Object.entries(retryAuthHeaders).forEach(([key, value]) => {
        retryHeaders.set(key, value);
      });

      return fetch(url, {
        ...options,
        credentials: "include",
        headers: retryHeaders,
      });
    },
  });
};
