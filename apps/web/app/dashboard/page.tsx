"use client";

// Force dynamic rendering. The dashboard page uses `useSearchParams()` to
// process the Google OAuth callback (`?oauth=success&sessionToken=...`),
// and Next 16 refuses to statically prerender any page that reads search
// params without an enclosing <Suspense>. This page is inherently dynamic
// (per-user data, OAuth handoff, auth tokens) so prerendering buys nothing.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Copy,
  EyeOff,
  FilePlus,
  Globe,
  Inbox,
  Lock,
  PencilLine,
  PlayCircle,
  Radio,
  Send,
  Signal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { AUTH_CHANGED_EVENT, GalacticShell } from "~/components/layout/galactic-shell";
import { ShareLinkBar } from "~/components/forms/share-link";
import { InsightsRail } from "~/components/dashboard/insights-rail";
import { Button } from "~/components/ui/button";
import { RelativeTime } from "~/components/ui/time";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

type FormStatus = "draft" | "published" | "unpublished" | "archived";
type FormVisibility = "public" | "unlisted";

const DEMO_USER_STORAGE_KEY = "askly.userId";
const SESSION_TOKEN_STORAGE_KEY = "askly.sessionToken";
const CSRF_TOKEN_STORAGE_KEY = "askly.csrfToken";
const REFRESH_TOKEN_STORAGE_KEY = "askly.refreshToken";

const STATUS_TONE: Record<
  FormStatus,
  { label: string; dot: string; pill: string; border: string }
> = {
  published: {
    label: "Live",
    dot: "bg-emerald-300",
    pill: "border-emerald-300/35 bg-emerald-300/10 text-emerald-200",
    border: "border-emerald-300/25",
  },
  draft: {
    label: "Draft",
    dot: "bg-amber-300",
    pill: "border-amber-300/35 bg-amber-300/10 text-amber-200",
    border: "border-stone-300/15",
  },
  unpublished: {
    label: "Paused",
    dot: "bg-stone-400",
    pill: "border-stone-300/30 bg-stone-100/5 text-stone-300",
    border: "border-stone-300/15",
  },
  archived: {
    label: "Archived",
    dot: "bg-stone-500",
    pill: "border-stone-300/25 bg-stone-950/40 text-stone-400",
    border: "border-stone-300/10",
  },
};

/**
 * Suspense wrapper around the real page body. Next 16 requires every
 * component that calls `useSearchParams()` to be enclosed by a Suspense
 * boundary so the parent layout can finish prerendering while the search-
 * param-dependent subtree streams in. Without this wrapper the build
 * refuses to prerender the dashboard, even with `force-dynamic`.
 */
export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoadingFallback />}>
      <DashboardInner />
    </Suspense>
  );
}

function DashboardLoadingFallback() {
  // Minimal skeleton — the real page hydrates instantly on the client. This
  // exists only so the prerender pass has SOMETHING to emit while the
  // search-params-dependent inner tree boots.
  return (
    <div className="askly-landing min-h-screen">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="askly-card-glass h-40 animate-pulse" />
      </div>
    </div>
  );
}

function DashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isHydrated, setIsHydrated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  useEffect(() => {
    const oauthStatus = searchParams.get("oauth");
    const oauthReason = searchParams.get("reason");

    if (oauthStatus === "error") {
      setOauthError(oauthReason ?? "oauth_failed");
    }

    // Trust "is logged in" presence hints in this order:
    //   1. DEMO_USER_STORAGE_KEY — written by demo login AND by the
    //      OAuth bootstrap effect below.
    //   2. SESSION_TOKEN_STORAGE_KEY — only set by demo login. OAuth
    //      users have NO sessionToken in localStorage because the API
    //      no longer puts it in the URL (HttpOnly cookie does the work).
    //
    // If only #2 is present without #1, we treat it as a stale demo
    // remnant and wipe it (matches the prior behavior). If only #1 is
    // present, we assume cookie-based OAuth and let getSession() in
    // GalacticShell + formsQuery be the source of truth — they wipe on
    // 401 if cookies turn out to be gone too.
    const existingUserId = window.localStorage.getItem(DEMO_USER_STORAGE_KEY);
    const existingSessionToken = window.localStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
    if (existingSessionToken && !existingUserId) {
      window.localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    }
    setUserId(existingUserId);

    setIsHydrated(true);
  }, [searchParams]);

  // OAuth bootstrap: fetch the session via cookies (no URL tokens to read
  // anymore — the API only puts `?oauth=success` in the redirect). The
  // browser ships back the HttpOnly session cookie the API set on the
  // callback, getSession() validates it, and we cache the userId + CSRF
  // token in localStorage so mutations can attach the CSRF header even
  // on cross-origin deployments where JS can't read the API's cookies
  // directly. Only enabled right after the OAuth redirect; demo-login
  // already writes localStorage from its mutation response.
  const oauthSuccess = searchParams.get("oauth") === "success";
  const oauthBootstrapQuery = trpc.auth.getSession.useQuery(undefined, {
    enabled: oauthSuccess && !userId && isHydrated,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!oauthSuccess) return;
    const data = oauthBootstrapQuery.data;
    if (!data) return;

    window.localStorage.setItem(DEMO_USER_STORAGE_KEY, data.userId);
    if (data.csrfToken) {
      window.localStorage.setItem(CSRF_TOKEN_STORAGE_KEY, data.csrfToken);
    }
    setUserId(data.userId);
    // Tell the shell (and any other auth-aware consumers) that tokens
    // just changed. Without this the sidebar stays on "Sign in" because
    // router.replace doesn't change pathname, so its auth effect won't
    // re-run on its own.
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
    router.replace("/dashboard");
  }, [oauthSuccess, oauthBootstrapQuery.data, router]);

  useEffect(() => {
    if (!oauthSuccess) return;
    if (!oauthBootstrapQuery.error) return;
    // Cookies didn't make it (third-party-cookie blocker, SameSite=None
    // missing on a truly cross-site deploy, etc.). Surface a clear error
    // so the user can retry instead of silently sitting on a broken
    // session that never authenticates.
    setOauthError("oauth_session_handoff_failed");
    router.replace("/dashboard");
  }, [oauthSuccess, oauthBootstrapQuery.error, router]);

  const loginAsDemoMutation = trpc.auth.loginAsDemo.useMutation({
    onSuccess(data) {
      window.localStorage.setItem(DEMO_USER_STORAGE_KEY, data.userId);
      window.localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, data.sessionToken);
      window.localStorage.setItem(CSRF_TOKEN_STORAGE_KEY, data.csrfToken);
      window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, data.refreshToken);
      setUserId(data.userId);
      window.location.reload();
    },
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    // Best-effort: clear local tokens whether or not the server call succeeds.
    onSettled() {
      window.localStorage.removeItem(DEMO_USER_STORAGE_KEY);
      window.localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(CSRF_TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
      setUserId(null);
      window.location.reload();
    },
  });

  const formsQuery = trpc.forms.listMineWithStats.useQuery(undefined, {
    enabled: !!userId,
  });

  const authProvidersQuery = trpc.auth.getSupportedAuthenticationProviders.useQuery(
    undefined,
    { enabled: isHydrated && !userId },
  );

  const updateStatusMutation = trpc.forms.updateStatus.useMutation({
    onSuccess: () => formsQuery.refetch(),
  });

  const updateVisibilityMutation = trpc.forms.updateVisibility.useMutation({
    onSuccess: () => formsQuery.refetch(),
  });

  // Clone navigates straight into the editor so the creator can rename/tweak
  // the duplicate before publishing. Refetch the list too so the new card
  // appears if they come back.
  const cloneFormMutation = trpc.forms.clone.useMutation({
    onSuccess: (created) => {
      formsQuery.refetch();
      router.push(`/dashboard/forms/${created.id}`);
    },
  });

  // Hard-delete. Server enforces "must be archived" so this should only
  // ever succeed from the dashboard card's delete button (which is also
  // gated client-side on `isArchived`). On success, the form is gone —
  // refetch the list to remove the card.
  const deleteFormMutation = trpc.forms.delete.useMutation({
    onSuccess: () => formsQuery.refetch(),
    onError: (err) => {
      // Surface server-side errors to the user so they're not left
      // wondering why nothing happened. `alert` is intentionally
      // primitive — a toast system would be better but would mean
      // wiring up an entire notification framework for one error path.
      if (typeof window !== "undefined") {
        window.alert(`Couldn't delete form: ${err.message}`);
      }
    },
  });

  const isMutating =
    updateStatusMutation.isPending ||
    updateVisibilityMutation.isPending ||
    cloneFormMutation.isPending ||
    deleteFormMutation.isPending ||
    loginAsDemoMutation.isPending ||
    logoutMutation.isPending;

  const forms = useMemo(
    () =>
      (formsQuery.data ?? []).map((f) => ({
        ...f,
        updatedAt: new Date(f.updatedAt),
        lastResponseAt: f.lastResponseAt ? new Date(f.lastResponseAt) : null,
      })),
    [formsQuery.data],
  );
  const hasForms = forms.length > 0;

  const stats = useMemo(() => {
    const totalResponses = forms.reduce((acc, f) => acc + f.responseCount, 0);
    const published = forms.filter((f) => f.status === "published").length;
    const drafts = forms.filter((f) => f.status === "draft").length;
    const publicForms = forms.filter((f) => f.visibility === "public").length;
    const mostRecentResponseAt = forms.reduce<Date | null>((acc, f) => {
      if (!f.lastResponseAt) return acc;
      if (!acc) return f.lastResponseAt;
      return f.lastResponseAt.getTime() > acc.getTime() ? f.lastResponseAt : acc;
    }, null);
    return {
      totalForms: forms.length,
      published,
      drafts,
      publicForms,
      totalResponses,
      mostRecentResponseAt,
    };
  }, [forms]);

  const googleAuthProvider = useMemo(
    () => authProvidersQuery.data?.find((provider) => provider.provider === "GOOGLE_OAUTH"),
    [authProvidersQuery.data],
  );

  const togglePublish = (formId: string, status: FormStatus) => {
    const nextStatus: FormStatus = status === "published" ? "unpublished" : "published";
    updateStatusMutation.mutate({ formId, status: nextStatus });
  };

  const toggleVisibility = (formId: string, visibility: FormVisibility) => {
    const nextVisibility: FormVisibility = visibility === "public" ? "unlisted" : "public";
    updateVisibilityMutation.mutate({ formId, visibility: nextVisibility });
  };

  // Archive / unarchive — archived forms are hidden from the active deck
  // but still preserved in the DB. Unarchiving sends the form back to
  // "draft" so the creator can decide whether to re-publish (or edit first).
  // Confirmation prompt because archive is destructive-feeling even though
  // it's reversible — keeps fast-finger accidents at bay during demos.
  const archiveForm = (formId: string, currentStatus: FormStatus) => {
    if (currentStatus === "archived") {
      updateStatusMutation.mutate({ formId, status: "draft" });
      return;
    }
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Archive this form? Existing responses are kept, but the form will be hidden from your active deck. You can restore it from the editor later.",
      );
      if (!confirmed) return;
    }
    updateStatusMutation.mutate({ formId, status: "archived" });
  };

  // Hard-delete. Gated on the form already being archived so this is
  // the EXPLICIT second step of the "I really mean it" flow:
  //   live form  →  Archive (reversible)  →  Permanently delete (final)
  // The server enforces the same precondition, so a misbehaving client
  // can't skip the archive step. Confirmation includes the response
  // count so users see exactly what data they're about to destroy.
  const deleteForm = (
    formId: string,
    title: string,
    responseCount: number,
  ) => {
    if (typeof window === "undefined") return;
    const dataLossSummary =
      responseCount > 0
        ? `${responseCount} response${responseCount === 1 ? "" : "s"} will be permanently lost.`
        : "No responses will be lost (this form never collected any).";
    const confirmed = window.confirm(
      `Permanently delete "${title}"?\n\n${dataLossSummary}\n\nThis cannot be undone.`,
    );
    if (!confirmed) return;
    deleteFormMutation.mutate({ formId });
  };

  return (
    <GalacticShell
      eyebrow="Mission deck"
      title="Your forms"
      subtitle="Manage what you've built. Each card is a live mission — publish it to start receiving signal."
      // Right rail: real aggregate insights when the user is authed.
      // Always render — InsightsRail handles its own unauthed/loading states
      // internally. Passing `null` would let GalacticShell fall back to its
      // default Signal card, which is the OLD layout we're replacing.
      rightPanel={<InsightsRail hasSession={isHydrated && !!userId} />}
      actions={
        isHydrated && userId ? (
          <Button
            asChild
            size="sm"
            className="askly-cta-glow bg-amber-100 text-stone-900 hover:bg-amber-50"
          >
            <Link href="/dashboard/new">
              <FilePlus className="size-4" />
              New form
            </Link>
          </Button>
        ) : null
      }
    >
      {!isHydrated ? (
        <DashboardSkeleton />
      ) : !userId ? (
        <AuthPane
          oauthError={oauthError}
          googleAuthUrl={googleAuthProvider?.authUrl ?? null}
          authProvidersLoaded={authProvidersQuery.isSuccess}
          onDemoLogin={() => loginAsDemoMutation.mutate({})}
          demoPending={loginAsDemoMutation.isPending}
          demoError={loginAsDemoMutation.error?.message ?? null}
        />
      ) : (
        <div className="space-y-6">
          <StatStrip stats={stats} loading={formsQuery.isLoading} />

          <div className="askly-card-glass relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-stone-300/12 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Radio className="size-4 text-amber-200/80" />
                <p className="text-sm font-medium text-stone-100">Your missions</p>
                <span className="rounded-full border border-stone-300/20 bg-stone-100/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-stone-300/70">
                  {stats.totalForms} total
                </span>
              </div>
              <Link
                href="/explore"
                className="flex items-center gap-1 text-xs text-stone-300/75 transition hover:text-amber-100"
              >
                Browse public forms
                <ArrowRight className="size-3.5" />
              </Link>
            </div>

            {formsQuery.isLoading ? (
              <div className="grid gap-4 p-5 md:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <FormCardSkeleton key={i} />
                ))}
              </div>
            ) : !hasForms ? (
              <EmptyState />
            ) : (
              <div className="grid gap-4 p-5 md:grid-cols-2">
                {forms.map((form, index) => (
                  <FormCard
                    key={form.id}
                    form={form}
                    index={index}
                    disabled={isMutating}
                    onTogglePublish={() => togglePublish(form.id, form.status as FormStatus)}
                    onToggleVisibility={() =>
                      toggleVisibility(form.id, form.visibility as FormVisibility)
                    }
                    onDelete={() =>
                      deleteForm(form.id, form.title, form.responseCount)
                    }
                    onArchive={() =>
                      archiveForm(form.id, form.status as FormStatus)
                    }
                    onClone={() => cloneFormMutation.mutate({ formId: form.id })}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </GalacticShell>
  );
}

interface StatStripProps {
  stats: {
    totalForms: number;
    published: number;
    drafts: number;
    publicForms: number;
    totalResponses: number;
    mostRecentResponseAt: Date | null;
  };
  loading: boolean;
}

type StatTone = "amber" | "emerald" | "sky" | "violet" | "stone";

// Centralized tone palette so the badge background, border, and icon color
// stay in sync — and so adding a new tile is a one-line change.
const STAT_TONE_CLASSES: Record<StatTone, { badge: string; icon: string }> = {
  amber: {
    badge: "border-amber-300/35 bg-amber-300/10",
    icon: "text-amber-200",
  },
  emerald: {
    badge: "border-emerald-300/35 bg-emerald-300/10",
    icon: "text-emerald-200",
  },
  sky: {
    badge: "border-sky-300/35 bg-sky-300/10",
    icon: "text-sky-200",
  },
  violet: {
    badge: "border-violet-300/35 bg-violet-300/10",
    icon: "text-violet-200",
  },
  stone: {
    badge: "border-stone-300/25 bg-stone-300/8",
    icon: "text-stone-300",
  },
};

function StatStrip({ stats, loading }: StatStripProps) {
  const cards: Array<{
    label: string;
    value: number;
    caption: React.ReactNode;
    icon: typeof Sparkles;
    tone: StatTone;
  }> = [
    {
      label: "Total forms",
      value: stats.totalForms,
      caption: `${stats.published} live · ${stats.drafts} draft`,
      icon: Sparkles,
      tone: "amber",
    },
    {
      label: "Live missions",
      value: stats.published,
      caption: stats.published > 0 ? "Receiving signal" : "Nothing published yet",
      icon: Signal,
      tone: stats.published > 0 ? "emerald" : "stone",
    },
    {
      label: "Total responses",
      value: stats.totalResponses,
      caption: stats.mostRecentResponseAt ? (
        <>
          Last signal <RelativeTime date={stats.mostRecentResponseAt} />
        </>
      ) : (
        "Awaiting first response"
      ),
      icon: Inbox,
      tone: stats.totalResponses > 0 ? "amber" : "stone",
    },
    {
      label: "Public visibility",
      value: stats.publicForms,
      caption: `${stats.publicForms} listed on /explore`,
      icon: Globe,
      tone: "violet",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, index) => {
        const Icon = card.icon;
        const toneClasses = STAT_TONE_CLASSES[card.tone];
        return (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
            className="askly-card-glass relative overflow-hidden p-4"
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-full border",
                  toneClasses.badge,
                )}
              >
                <Icon className={cn("size-4", toneClasses.icon)} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="askly-section-eyebrow">{card.label}</p>
                <p
                  className={cn(
                    "mt-1 font-semibold tracking-tight tabular-nums",
                    loading ? "text-stone-400/40" : "text-stone-50",
                    "text-2xl",
                  )}
                >
                  {loading ? "—" : card.value.toLocaleString()}
                </p>
                <p className="mt-0.5 truncate text-xs text-stone-300/65">{card.caption}</p>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

interface FormCardProps {
  form: {
    id: string;
    title: string;
    slug: string;
    status: string;
    visibility: string;
    updatedAt: Date;
    responseCount: number;
    lastResponseAt: Date | null;
  };
  index: number;
  disabled: boolean;
  onTogglePublish: () => void;
  onToggleVisibility: () => void;
  onArchive: () => void;
  onClone: () => void;
  // Hard-delete. Parent gates whether this is actually invocable
  // (server enforces "must be archived"); the card just shows the
  // button when the form's status is `archived`.
  onDelete: () => void;
}

function FormCard({
  form,
  index,
  disabled,
  onTogglePublish,
  onToggleVisibility,
  onArchive,
  onClone,
  onDelete,
}: FormCardProps) {
  const statusTone = STATUS_TONE[form.status as FormStatus] ?? STATUS_TONE.draft;
  const isPublished = form.status === "published";
  const isPublic = form.visibility === "public";
  const isArchived = form.status === "archived";

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: 0.15 + index * 0.05,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={cn(
        "askly-card-glass group relative overflow-hidden border p-5 transition",
        statusTone.border,
        "hover:border-amber-200/40",
      )}
    >
      {/* Status corner accent */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-px",
          isPublished ? "bg-emerald-300/40" : "bg-stone-300/15",
        )}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]",
                statusTone.pill,
              )}
            >
              <motion.span
                className={cn("size-1 rounded-full", statusTone.dot)}
                animate={
                  isPublished ? { opacity: [0.5, 1, 0.5], scale: [1, 1.4, 1] } : undefined
                }
                transition={
                  isPublished
                    ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
                    : undefined
                }
              />
              {statusTone.label}
            </span>
            <span className="rounded-full border border-stone-300/20 bg-stone-100/4 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-stone-300/70">
              {isPublic ? "Public" : "Unlisted"}
            </span>
          </div>

          <h3 className="mt-2.5 truncate text-lg font-semibold text-stone-50">
            {form.title}
          </h3>
          <p className="truncate font-mono text-xs text-stone-400/70">
            /forms/{form.slug}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[10px] uppercase tracking-[0.18em] text-stone-300/60">
            Responses
          </p>
          <p className="font-semibold tabular-nums text-stone-50 text-2xl">
            {form.responseCount.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs text-stone-400/75">
        <span className="flex items-center gap-1.5">
          <Send className="size-3" />
          Last signal{" "}
          <RelativeTime
            date={form.lastResponseAt}
            placeholder="—"
          />
        </span>
        <span className="text-stone-500/60">·</span>
        <span>
          Updated <RelativeTime date={form.updatedAt} />
        </span>
      </div>

      {/* Share link — primary CTA for any published form. */}
      {isPublished ? (
        <div className="mt-3">
          <ShareLinkBar slug={form.slug} />
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-dashed border-stone-300/15 bg-stone-100/2 px-2 py-1.5 text-[11px] text-stone-400/70">
          Publish this form to generate a shareable link.
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-stone-300/10 pt-3">
        <ActionLink href={`/dashboard/forms/${form.id}`} icon={PencilLine}>
          Edit
        </ActionLink>
        <ActionLink href={`/dashboard/forms/${form.id}/responses`} icon={Inbox}>
          Responses
        </ActionLink>
        <ActionLink href={`/dashboard/analytics/${form.id}`} icon={BarChart3}>
          Analytics
        </ActionLink>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Clone always available (even on archived forms) — the clone
              is a fresh draft so it's a recovery path too. */}
          <ActionButton
            onClick={onClone}
            disabled={disabled}
            icon={Copy}
            title="Duplicate this form (creates a new draft)"
          />
          <ActionButton
            onClick={onToggleVisibility}
            disabled={disabled || isArchived}
            icon={isPublic ? Lock : Globe}
            title={
              isArchived
                ? "Restore the form before changing visibility"
                : isPublic
                  ? "Make unlisted"
                  : "Make public"
            }
          />
          {/* Archive / restore — archived forms get an "ArchiveRestore" icon
              that re-opens them as drafts; live forms get a plain "Archive"
              icon. Same button, two modes — keeps the action density low. */}
          <ActionButton
            onClick={onArchive}
            disabled={disabled}
            icon={isArchived ? ArchiveRestore : Archive}
            title={isArchived ? "Restore to draft" : "Archive form"}
          />
          {isArchived ? (
            // Hard-delete only surfaces AFTER the form is archived.
            // This is the "two-step destroy" pattern (GitHub-style) —
            // accidentally clicking Archive is reversible; you have to
            // intentionally come back and delete to lose data. Red
            // tint + Trash2 icon to signal "this is the dangerous one,
            // not the friendly archive."
            <ActionButton
              onClick={onDelete}
              disabled={disabled}
              icon={Trash2}
              title="Permanently delete (cannot be undone)"
              destructive
            />
          ) : (
            <ActionButton
              onClick={onTogglePublish}
              disabled={disabled}
              icon={isPublished ? EyeOff : PlayCircle}
              accent={!isPublished}
              label={isPublished ? "Unpublish" : "Publish"}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
}

interface ActionLinkProps {
  href: string;
  icon: typeof PencilLine;
  children: React.ReactNode;
  accent?: boolean;
}

function ActionLink({ href, icon: Icon, children, accent = false }: ActionLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition",
        accent
          ? "border-amber-200/30 bg-amber-100/8 text-amber-100 hover:bg-amber-100/15"
          : "border-stone-300/15 bg-stone-100/3 text-stone-200/85 hover:border-stone-300/30 hover:text-stone-50",
      )}
    >
      <Icon className="size-3.5" />
      {children}
    </Link>
  );
}

interface ActionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  icon: typeof PencilLine;
  title?: string;
  label?: string;
  accent?: boolean;
  // Red-tinted variant for destructive actions (hard delete). Visually
  // distinct from `accent` (amber, primary) so users don't confuse
  // "publish" with "delete forever."
  destructive?: boolean;
}

function ActionButton({
  onClick,
  disabled,
  icon: Icon,
  title,
  label,
  accent = false,
  destructive = false,
}: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-50",
        destructive
          ? "border-rose-300/30 bg-rose-300/8 text-rose-200 hover:border-rose-300/55 hover:bg-rose-300/15 hover:text-rose-100"
          : accent
            ? "border-amber-200/30 bg-amber-100/8 text-amber-100 hover:bg-amber-100/15"
            : "border-stone-300/15 bg-stone-100/3 text-stone-200/85 hover:border-stone-300/30 hover:text-stone-50",
      )}
    >
      <Icon className="size-3.5" />
      {label ? <span>{label}</span> : null}
    </button>
  );
}

function FormCardSkeleton() {
  return (
    <div className="askly-card-glass animate-pulse space-y-3 p-5">
      <div className="flex gap-2">
        <div className="h-4 w-16 rounded-full bg-stone-100/10" />
        <div className="h-4 w-14 rounded-full bg-stone-100/10" />
      </div>
      <div className="h-5 w-3/4 rounded bg-stone-100/10" />
      <div className="h-3 w-1/2 rounded bg-stone-100/10" />
      <div className="h-3 w-2/3 rounded bg-stone-100/5" />
      <div className="flex gap-2 pt-2">
        <div className="h-6 w-14 rounded bg-stone-100/10" />
        <div className="h-6 w-20 rounded bg-stone-100/10" />
        <div className="h-6 w-16 rounded bg-stone-100/10" />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="askly-card-glass h-24 animate-pulse" />
        ))}
      </div>
      <div className="askly-card-glass h-48 animate-pulse" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="relative grid place-items-center px-6 py-20">
      <div className="absolute inset-0 askly-orbit-mini opacity-30" aria-hidden />
      <div className="relative flex max-w-md flex-col items-center text-center">
        <div className="grid size-14 place-items-center rounded-full border border-amber-200/30 bg-amber-100/8 text-amber-100">
          <FilePlus className="size-6" />
        </div>
        <h3 className="mt-4 text-xl font-semibold text-stone-50">
          Launch your first mission
        </h3>
        <p className="mt-2 text-sm text-stone-300/80">
          A form is the broadcast — once you publish, every response lands here in
          real time. Start with a one-question form to see the full pipeline run.
        </p>
        <Button
          asChild
          className="askly-cta-glow mt-5 bg-amber-100 text-stone-900 hover:bg-amber-50"
        >
          <Link href="/dashboard/new">
            Create your first form
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

interface AuthPaneProps {
  oauthError: string | null;
  googleAuthUrl: string | null;
  authProvidersLoaded: boolean;
  onDemoLogin: () => void;
  demoPending: boolean;
  demoError: string | null;
}

function AuthPane({
  oauthError,
  googleAuthUrl,
  authProvidersLoaded,
  onDemoLogin,
  demoPending,
  demoError,
}: AuthPaneProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <div className="askly-card-glass relative overflow-hidden p-8">
        <div className="askly-scan-line opacity-40" aria-hidden />
        <div className="relative space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/30 bg-amber-100/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-amber-100">
            <Lock className="size-3" />
            Authentication required
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-stone-50">
            Authenticate to open the deck.
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-stone-300/80">
            Demo login spins up a creator session instantly — no setup, no
            credentials. Use it to walk the full flow. Google OAuth is wired for
            production sessions when env vars are set.
          </p>

          {oauthError ? (
            <div className="rounded-md border border-rose-300/30 bg-rose-300/8 p-3 text-sm text-rose-200">
              Google OAuth failed: <span className="font-mono">{oauthError}</span>
            </div>
          ) : null}

          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Button
              size="lg"
              onClick={onDemoLogin}
              disabled={demoPending}
              className="askly-cta-glow bg-amber-100 text-stone-900 hover:bg-amber-50"
            >
              <PlayCircle className="size-4" />
              {demoPending ? "Spinning up session…" : "Start demo session"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                if (!googleAuthUrl) return;
                window.location.assign(googleAuthUrl);
              }}
              disabled={!googleAuthUrl}
              className="border-stone-300/30 bg-stone-100/5 text-stone-100 hover:bg-stone-100/10"
            >
              Continue with Google
              <ArrowUpRight className="size-4" />
            </Button>
          </div>

          {demoError ? (
            <p className="text-xs text-rose-300/85">{demoError}</p>
          ) : null}

          {!googleAuthUrl && authProvidersLoaded ? (
            <p className="text-xs text-stone-400/70">
              Google OAuth isn&apos;t configured in this env. Set the Google client
              env vars to enable.
            </p>
          ) : null}
        </div>
      </div>

      <div className="askly-card-glass relative overflow-hidden p-6">
        <div className="absolute inset-0 askly-orbit-mini opacity-30" aria-hidden />
        <div className="relative space-y-4">
          <p className="askly-section-eyebrow">What demo login gives you</p>
          <ul className="space-y-3 text-sm text-stone-200/90">
            <AuthBullet icon={FilePlus}>
              A fresh creator account, ready to build forms
            </AuthBullet>
            <AuthBullet icon={Send}>
              Live publishing to the public <code>/forms/[slug]</code> route
            </AuthBullet>
            <AuthBullet icon={BarChart3}>
              Real funnel analytics — view, start, submit
            </AuthBullet>
            <AuthBullet icon={Inbox}>
              Response inbox with CSV export
            </AuthBullet>
          </ul>
          <div className="rounded-md border border-stone-300/15 bg-stone-950/40 p-3 font-mono text-[11px] text-stone-300/75">
            <p className="text-stone-400/60">{"// session"}</p>
            <p className="mt-1">
              <span className="text-amber-100">httpOnly</span> +{" "}
              <span className="text-amber-100">CSRF</span> tokens, refresh-rotated.
              Wiped on logout.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthBullet({
  icon: Icon,
  children,
}: {
  icon: typeof PencilLine;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-md border border-amber-200/25 bg-amber-100/5 text-amber-200">
        <Icon className="size-3" />
      </span>
      <span>{children}</span>
    </li>
  );
}
