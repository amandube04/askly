import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Server-side gate for protected dashboard sub-routes.
 *
 * Honest scope notes (please read before changing):
 *   - The real authorization boundary is the tRPC API: every protected
 *     procedure validates the bearer session token + CSRF token. This
 *     middleware does NOT authorize anything by itself; it only prevents
 *     server-rendering protected dashboard sub-pages to unauthenticated
 *     visitors so they don't see a flash of authenticated UI before the
 *     client-side gate redirects them.
 *   - In a same-origin deployment the API sets an HttpOnly `askly_session`
 *     cookie which is real (not forgeable from client JS). We accept it
 *     here as the strongest signal.
 *   - In a cross-origin deployment (web on :3001, API on :8000) the API's
 *     cookie is scoped to the API origin and middleware can't see it. We
 *     fall back to a `askly_present=1` hint cookie that the dashboard
 *     writes from JS after a successful sign-in. This hint cookie is
 *     trivially forgeable by anyone with DevTools — but a forger gains
 *     access to nothing the API hasn't already authorized them for.
 *
 *  Bare `/dashboard` is intentionally always allowed:
 *    - It renders the sign-in pane for unauthenticated visitors.
 *    - The Google OAuth callback redirects to `/dashboard?oauth=success&...`
 *      with tokens in the URL that the page needs to hydrate before any
 *      protected route is reachable.
 */

// Cookie set by the API on its own origin when a session is issued. Real
// auth signal but only visible to middleware in same-origin deployments.
const SESSION_COOKIE = "askly_session";
// JS-readable hint cookie set by the dashboard auth-state effect. Mirrors
// the existence of a session in localStorage for cross-origin setups.
// NOT a security boundary — see file header.
const PRESENCE_HINT_COOKIE = "askly_present";

// Anything under /dashboard EXCEPT the bare /dashboard route, plus
// /admin (admin role-check is server-side in tRPC). Listing explicit
// sub-prefixes (instead of a single broad `/dashboard/*` matcher) keeps
// the OAuth callback landing page reachable.
const PROTECTED_PREFIXES = [
  "/dashboard/forms",
  "/dashboard/new",
  "/dashboard/analytics",
  "/admin",
];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const hasSessionCookie = request.cookies.has(SESSION_COOKIE);
  const hasPresenceHint = request.cookies.has(PRESENCE_HINT_COOKIE);

  if (hasSessionCookie || hasPresenceHint) {
    return NextResponse.next();
  }

  // Redirect to the dashboard root so the user lands on the sign-in pane.
  // `?reason=auth_required` is a hook for surfacing a toast on the dashboard
  // page; if the dashboard ignores it the URL is still harmless.
  const url = request.nextUrl.clone();
  url.pathname = "/dashboard";
  url.search = "?reason=auth_required";
  return NextResponse.redirect(url);
}

export const config = {
  // Skip static assets, API routes, and the Next internals. Matching the
  // protected prefixes explicitly is a single source of truth with the
  // PROTECTED_PREFIXES check inside the handler — but Next still requires
  // the `matcher` to know which requests to call middleware for.
  matcher: [
    "/dashboard/forms/:path*",
    "/dashboard/new",
    "/dashboard/analytics/:path*",
    "/admin/:path*",
    "/admin",
  ],
};
