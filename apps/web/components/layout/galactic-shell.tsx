"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  BarChart3,
  BookOpen,
  Compass,
  LayoutDashboard,
  LogIn,
  LogOut,
  PlusCircle,
  Shield,
  User2,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { AsklyLogo, AsklyLogoMark } from "~/components/branding/askly-logo";
import { Starfield } from "~/components/landing/starfield";
import { trpc } from "~/trpc/client";

const DEMO_USER_STORAGE_KEY = "askly.userId";
const SESSION_TOKEN_STORAGE_KEY = "askly.sessionToken";
const CSRF_TOKEN_STORAGE_KEY = "askly.csrfToken";
const REFRESH_TOKEN_STORAGE_KEY = "askly.refreshToken";

// Keep aligned with apps/api/src/server.ts OAuth provider key.
const GOOGLE_OAUTH_PROVIDER = "GOOGLE_OAUTH";

// Custom event any component can fire after writing/removing auth tokens
// to keep every auth-aware consumer (sidebar, header pills, etc.) in sync
// without forcing a full page reload. Cross-tab sync comes for free via the
// built-in `storage` event; this one handles the same-tab case where `storage`
// doesn't fire.
export const AUTH_CHANGED_EVENT = "askly:auth-changed";

interface GalacticShellProps {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  rightPanel?: ReactNode;
}

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  external?: boolean;
  // When true, the item only lights up on an EXACT pathname match
  // and ignores prefix matches. Used for `/dashboard`, which would
  // otherwise prefix-match every sub-route (/dashboard/forms/*,
  // /dashboard/forms/X/responses, etc.) and falsely claim the user
  // is "on the dashboard" while they're actually deep in the editor.
  exactOnly?: boolean;
};

// `external: true` opens in a new tab and skips client-side routing — used for
// the OpenAPI docs served by the API, not a Next route. The /admin entry is
// injected at render time when the signed-in user has role=admin.
const BASE_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exactOnly: true },
  { href: "/dashboard/new", label: "New form", icon: PlusCircle },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "http://localhost:8000/docs", label: "API docs", icon: BookOpen, external: true },
];

export function GalacticShell({
  title,
  eyebrow = "Mission deck",
  subtitle,
  actions,
  children,
  rightPanel,
}: GalacticShellProps) {
  const pathname = usePathname();
  const healthQuery = trpc.health.getHealth.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  });

  const backendHealthy = healthQuery.data?.status === "healthy";
  const healthState = healthQuery.isLoading
    ? "checking"
    : backendHealthy
      ? "online"
      : "degraded";

  // Auth state — read from localStorage, surfaced as a sidebar pill.
  // Kept self-contained in the shell so every page gets the same affordance
  // without each having to pass auth props.
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const readAuth = () => {
      // After Bug 3 (no more session tokens in OAuth URL), there are two
      // valid "signed-in" shapes:
      //   • Demo flow: SESSION_TOKEN_STORAGE_KEY + DEMO_USER_STORAGE_KEY
      //     are both set (Bearer + cookies both work)
      //   • OAuth-cookie flow: only DEMO_USER_STORAGE_KEY is set
      //     (HttpOnly session cookie does the auth; LS holds CSRF only)
      //
      // So the presence-of-userId is the truthful signal now, not the
      // presence of the access token. A protected query will be the
      // source of truth — if cookies turn out to be gone, getSession
      // throws and we wipe in the effect below.
      const userIdHint = window.localStorage.getItem(DEMO_USER_STORAGE_KEY);
      if (userIdHint) {
        setUserId(userIdHint);
        // Set a non-HttpOnly "presence" cookie so the Next.js middleware
        // (apps/web/middleware.ts) can decide whether to serve protected
        // dashboard sub-routes server-side. The cookie carries NO secret —
        // it's a UX hint, not a security boundary (real auth happens at the
        // tRPC layer via the bearer/csrf tokens). The middleware redirects
        // unauthed users to /dashboard before any protected page renders,
        // eliminating the unauthenticated-flash before the client gate kicks
        // in. SameSite=Lax so cross-site nav (e.g. clicking a form link)
        // still includes the cookie.
        document.cookie = `askly_present=1; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`;
      } else {
        // No userId hint — wipe any stale access token left over from a
        // previous session and clear the presence cookie so middleware
        // starts blocking protected sub-routes.
        window.localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
        setUserId(null);
        document.cookie = "askly_present=; Path=/; SameSite=Lax; Max-Age=0";
      }
      setAuthReady(true);
    };

    readAuth();

    // Same-tab: dashboard page writes OAuth tokens to localStorage after the
    // Google callback redirect. Without this listener the shell stays stale
    // (the dashboard does `router.replace` which doesn't change pathname,
    // so the [pathname] dep wouldn't fire). This was the "still shows Sign in
    // after signing in" bug.
    window.addEventListener(AUTH_CHANGED_EVENT, readAuth);
    // Cross-tab: a sign-out in tab B should also update tab A's pill.
    window.addEventListener("storage", readAuth);

    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, readAuth);
      window.removeEventListener("storage", readAuth);
    };
  }, [pathname]);

  const wipeLocalAuth = () => {
    window.localStorage.removeItem(DEMO_USER_STORAGE_KEY);
    window.localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(CSRF_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    // Mirror the cookie clear so middleware blocks protected routes from the
    // very next navigation — otherwise a logged-out user could hit
    // /dashboard/forms briefly with cookie still set.
    document.cookie = "askly_present=; Path=/; SameSite=Lax; Max-Age=0";
    setUserId(null);
  };

  // Best-effort logout: always clear local tokens regardless of server response.
  // The server call might fail (e.g. CSRF rotated, network down) but the user
  // expects "Logout" to mean "I am logged out" — so we wipe locally either way.
  const logoutMutation = trpc.auth.logout.useMutation({
    onSettled() {
      wipeLocalAuth();
      window.location.assign("/dashboard");
    },
  });

  // Auth providers — only queried when the user is signed out, since signed-in
  // users have no reason to know what providers exist.
  const authProvidersQuery = trpc.auth.getSupportedAuthenticationProviders.useQuery(
    undefined,
    { enabled: authReady && !userId },
  );
  const googleAuthUrl =
    authProvidersQuery.data?.find((p) => p.provider === GOOGLE_OAUTH_PROVIDER)?.authUrl ?? null;

  // Demo login fallback: in envs where Google OAuth isn't configured, the
  // sidebar pill still has to do _something_ — otherwise clicking it is a
  // dead end (which was the original bug: pill linked to /dashboard while
  // already on /dashboard, so nothing happened).
  const loginAsDemoMutation = trpc.auth.loginAsDemo.useMutation({
    onSuccess(data) {
      window.localStorage.setItem(DEMO_USER_STORAGE_KEY, data.userId);
      window.localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, data.sessionToken);
      window.localStorage.setItem(CSRF_TOKEN_STORAGE_KEY, data.csrfToken);
      window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, data.refreshToken);
      setUserId(data.userId);
      // Reload so every query in the tree re-runs against the new session
      // instead of trying to merge mid-render state.
      window.location.reload();
    },
  });

  const handleSignIn = () => {
    if (googleAuthUrl) {
      window.location.assign(googleAuthUrl);
      return;
    }
    // No OAuth configured → spin up a demo session. This is fine for dev/local
    // and matches the behavior the dashboard's full AuthPane offers.
    loginAsDemoMutation.mutate(undefined);
  };

  const signInPending = loginAsDemoMutation.isPending;

  // Fetch the signed-in user's real profile (Google name / email / avatar).
  // Only runs when we know there's a session — otherwise it'd 401 on every
  // logged-out render. If the session is stale (user deleted server-side),
  // the NOT_FOUND response triggers a local logout below.
  const sessionQuery = trpc.auth.getSession.useQuery(undefined, {
    enabled: authReady && !!userId,
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    // Server says this session no longer maps to a real user — wipe locally
    // so we don't loop on a half-dead session. The mounted state update is
    // safe: tRPC errors only fire after the component is alive.
    if (sessionQuery.error && userId) {
      wipeLocalAuth();
    }
  }, [sessionQuery.error, userId]);

  const profile = sessionQuery.data;
  // Initial seed before the name has loaded: 8 chars of the userId so the
  // pill isn't blank during the first paint after sign-in.
  const fallbackId = userId ? `${userId.slice(0, 8)}…` : null;
  const displayName = profile?.fullName ?? fallbackId ?? "Signed in";
  const secondaryLine = profile?.email ?? (profile ? null : "loading profile…");

  // Add the /admin entry only for admin-role users. Keeping it client-side
  // is sufficient because the /admin page itself re-checks the role via
  // the adminProcedure-guarded tRPC calls — this is purely visual.
  const NAV_ITEMS: NavItem[] = profile?.role === "admin"
    ? [
        ...BASE_NAV_ITEMS,
        { href: "/admin", label: "Admin", icon: Shield },
      ]
    : BASE_NAV_ITEMS;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0b0d14] text-stone-100">
      {/* Ambient layers — matches landing */}
      <div className="askly-aurora" aria-hidden />
      <div className="askly-landing-grain" aria-hidden />
      <Starfield />

      {/* Layout width:
          - max-w-[1800px] fills 1920p / 1440p viewports edge-to-edge so the
            dashboard doesn't sit in a centered column with huge black gutters
            on either side. Capped (not full-bleed) so 3440px+ ultra-wide
            monitors don't stretch the center column into an unreadable smear. */}
      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-[1800px] gap-4 px-3 py-4 md:px-5 lg:grid-cols-[232px_minmax(0,1fr)] xl:grid-cols-[232px_minmax(0,1fr)_280px]">
        {/* Sidebar */}
        <aside className="askly-card-glass flex flex-col gap-1 p-3 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
          <Link
            href="/"
            className="mb-4 rounded-md border border-stone-300/15 bg-stone-100/3 px-3 py-2 transition hover:border-amber-200/30 hover:bg-stone-100/6"
          >
            <AsklyLogo />
          </Link>

          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              // Active-state is computed only for internal routes — external
              // links (API docs) never light up regardless of pathname.
              const isExact = !item.external && pathname === item.href;
              // Items marked `exactOnly` skip prefix matching entirely.
              // This is what stops "/dashboard" from claiming the
              // active state on /dashboard/forms/<id>, where the user
              // is clearly NOT on the dashboard but in the editor.
              const isPrefix =
                !item.external &&
                !item.exactOnly &&
                item.href !== "/" &&
                pathname.startsWith(`${item.href}/`);
              const matchedByMoreSpecific = NAV_ITEMS.some(
                (other) =>
                  !other.external &&
                  other.href !== item.href &&
                  other.href.length > item.href.length &&
                  (pathname === other.href || pathname.startsWith(`${other.href}/`)),
              );
              const active = (isExact || isPrefix) && !matchedByMoreSpecific;
              const classes = cn(
                "group relative flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition",
                active
                  ? "border-amber-200/30 bg-amber-100/6 text-amber-50"
                  : "border-transparent text-stone-300/85 hover:border-stone-300/20 hover:bg-stone-100/4 hover:text-stone-100",
              );
              const inner = (
                <>
                  <Icon
                    className={cn(
                      "size-4",
                      active ? "text-amber-200" : "text-stone-300/80 group-hover:text-stone-100",
                    )}
                  />
                  <span>{item.label}</span>
                  {active ? (
                    <span className="ml-auto size-1.5 rounded-full bg-amber-200" />
                  ) : null}
                </>
              );
              return item.external ? (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className={classes}
                >
                  {inner}
                </a>
              ) : (
                <Link key={item.href} href={item.href} className={classes}>
                  {inner}
                </Link>
              );
            })}
          </nav>

          {/* Auth pill */}
          <div className="mt-auto space-y-2">
            {!authReady ? (
              <div className="h-[58px] animate-pulse rounded-md border border-stone-300/10 bg-stone-100/3" />
            ) : userId ? (
              <div className="rounded-md border border-emerald-300/20 bg-emerald-300/4 p-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="relative size-8 shrink-0">
                    {profile?.profileImageUrl ? (
                      // Next/Image would be ideal, but Google's profile CDN
                      // requires `images.remotePatterns` config and we want
                      // this to render even without that config. Plain <img>
                      // is fine for an 8x8 avatar.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profile.profileImageUrl}
                        alt={profile.fullName}
                        className="size-8 rounded-full border border-emerald-300/30 object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="grid size-8 place-items-center rounded-full border border-emerald-300/30 bg-emerald-300/10 text-emerald-200">
                        <User2 className="size-3.5" />
                      </div>
                    )}
                    <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-[#0b0d14] bg-emerald-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-stone-50">
                      {displayName}
                    </p>
                    {secondaryLine ? (
                      <p className="truncate text-[10px] text-stone-400/70">
                        {secondaryLine}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => logoutMutation.mutate(undefined)}
                    disabled={logoutMutation.isPending}
                    title="Log out"
                    className="grid size-7 shrink-0 place-items-center rounded-md border border-stone-300/15 bg-stone-100/3 text-stone-300/85 transition hover:border-rose-300/40 hover:text-rose-200 disabled:opacity-50"
                  >
                    <LogOut className="size-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSignIn}
                disabled={signInPending}
                className="flex w-full items-center justify-between gap-2 rounded-md border border-amber-200/30 bg-amber-100/6 px-3 py-2.5 text-sm text-amber-100 transition hover:bg-amber-100/10 disabled:cursor-wait disabled:opacity-70"
              >
                <span className="flex items-center gap-2">
                  <LogIn className="size-4" />
                  {signInPending ? "Signing in…" : "Sign in"}
                </span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-amber-200/75">
                  {googleAuthUrl ? "Google" : "demo"}
                </span>
              </button>
            )}
            {loginAsDemoMutation.error ? (
              <p className="px-1 text-[11px] text-rose-300/85">
                {loginAsDemoMutation.error.message}
              </p>
            ) : null}
          </div>

          {/* System status pill — single-line layout matches the mockup.
              The label + dot are real: dot color is driven by the health
              query, so "degraded" actually shows yellow during outage. */}
          <div className="rounded-md border border-stone-300/15 bg-stone-950/40 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-stone-300/55">
              System status
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <motion.span
                className={cn(
                  "size-1.5 rounded-full",
                  healthState === "online" && "bg-emerald-300",
                  healthState === "checking" && "bg-stone-300",
                  healthState === "degraded" && "bg-amber-300",
                )}
                animate={
                  healthState === "online"
                    ? { opacity: [0.5, 1, 0.5], scale: [1, 1.3, 1] }
                    : undefined
                }
                transition={
                  healthState === "online"
                    ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
                    : undefined
                }
              />
              <span className="text-xs text-stone-100">
                {healthState === "online" && "All systems operational"}
                {healthState === "checking" && "Checking…"}
                {healthState === "degraded" && "Degraded"}
              </span>
            </div>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-h-0 flex-col gap-4">
          <header className="askly-card-glass relative overflow-hidden p-6 sm:p-7">
            <div className="askly-scan-line opacity-30" aria-hidden />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1.5">
                <p className="askly-section-eyebrow">{eyebrow}</p>
                <h1 className="text-2xl font-semibold tracking-tight text-stone-50 sm:text-3xl">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="max-w-2xl text-sm text-stone-300/80">{subtitle}</p>
                ) : null}
              </div>
              {actions ? (
                <div className="flex flex-wrap items-center gap-2">{actions}</div>
              ) : null}
            </div>
          </header>

          <section className="min-h-0 flex-1">{children}</section>
        </div>

        {/* Right rail.
            When a `rightPanel` is provided we render it bare — the consumer
            owns its own card structure (e.g. stacking multiple `askly-card-glass`
            blocks). Wrapping it here would nest cards and collapse multi-card
            rails into one bordered blob, which broke the dashboard rail. */}
        {rightPanel ? (
          <aside className="hidden xl:block">
            <div className="sticky top-4">{rightPanel}</div>
          </aside>
        ) : (
          <aside className="hidden xl:block">
            <div className="askly-card-glass sticky top-4 space-y-4 p-4">
              <div className="flex items-center gap-2">
                <AsklyLogoMark size={28} isStatic />
                <p className="text-xs uppercase tracking-[0.18em] text-stone-300/60">
                  Signal
                </p>
              </div>
              <p className="text-xs leading-relaxed text-stone-300/75">
                Build concise forms. Keep important questions early. Drop-off
                spikes mid-form; analytics tells you where to cut.
              </p>
              <div className="rounded-md border border-stone-300/15 bg-stone-950/40 p-3 font-mono text-[11px] text-stone-300/70">
                <p className="text-stone-400/60">{"// pro tip"}</p>
                <p className="mt-1">
                  Shorter forms{" "}
                  <span className="text-amber-100">≈ 2.4×</span> higher
                  completion than 10+ field forms.
                </p>
              </div>
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
