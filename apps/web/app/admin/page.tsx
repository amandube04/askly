"use client";

// Force dynamic rendering. This page reads localStorage for the session
// token and calls admin-only tRPC procedures — both are inherently
// per-user, so prerendering offers no benefit and would also throw on
// any client-only hooks.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  EyeOff,
  Loader2,
  Shield,
  ShieldAlert,
  TrendingUp,
  Users,
  FileText,
  Inbox,
} from "lucide-react";
import { GalacticShell } from "~/components/layout/galactic-shell";
import { Button } from "~/components/ui/button";
import { RelativeTime } from "~/components/ui/time";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

export default function AdminPage() {
  const utils = trpc.useUtils();
  const sessionQuery = trpc.auth.getSession.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  });
  const overviewQuery = trpc.admin.getOverview.useQuery(undefined, {
    enabled: sessionQuery.data?.role === "admin",
    staleTime: 30_000,
  });
  const [page, setPage] = useState(1);
  const formsQuery = trpc.admin.listForms.useQuery(
    { page, pageSize: 15 },
    { enabled: sessionQuery.data?.role === "admin", staleTime: 30_000 },
  );

  const unpublishMutation = trpc.admin.forceUnpublish.useMutation({
    onSuccess: () => {
      utils.admin.listForms.invalidate().catch(() => undefined);
      utils.admin.getOverview.invalidate().catch(() => undefined);
    },
  });

  // Three states the page can be in: not signed in, signed in but not admin,
  // signed in as admin. Render each as a focused message rather than
  // leaking a broken half-loaded admin UI. Admin status is verified again
  // server-side on every tRPC call, so this is a UX gate only.
  const isLoadingSession = sessionQuery.isLoading;
  const notSignedIn = !sessionQuery.data && !isLoadingSession;
  const notAdmin =
    sessionQuery.data && sessionQuery.data.role !== "admin";

  return (
    <GalacticShell
      title="Admin console"
      eyebrow="Platform ops"
      subtitle="User counts, form moderation, and signal across every creator on Askly."
    >
      {isLoadingSession ? (
        <LoadingShell label="Verifying admin access…" />
      ) : notSignedIn ? (
        <AccessDenied
          icon={Shield}
          title="Sign in required"
          body="The admin console is only available to authenticated users with the admin role."
          ctaHref="/dashboard"
          ctaLabel="Go to sign-in"
        />
      ) : notAdmin ? (
        <AccessDenied
          icon={ShieldAlert}
          title="Admin role required"
          body={`You're signed in as ${sessionQuery.data?.email ?? "a creator"}, but this dashboard is reserved for users with the admin role. If you believe this is in error, contact your platform administrator.`}
          ctaHref="/dashboard"
          ctaLabel="Back to dashboard"
        />
      ) : (
        <div className="space-y-6">
          <OverviewGrid
            data={overviewQuery.data}
            isLoading={overviewQuery.isLoading}
            error={overviewQuery.error ? { message: overviewQuery.error.message } : null}
          />

          <section className="askly-card-glass overflow-hidden">
            <header className="flex items-center justify-between border-b border-stone-300/12 px-5 py-3">
              <div>
                <p className="askly-section-eyebrow">Top creators</p>
                <h2 className="mt-1 text-base font-semibold text-stone-100">
                  Most active by form count
                </h2>
              </div>
            </header>
            <TopCreatorsTable
              data={overviewQuery.data}
              isLoading={overviewQuery.isLoading}
            />
          </section>

          <section className="askly-card-glass overflow-hidden">
            <header className="flex items-center justify-between border-b border-stone-300/12 px-5 py-3">
              <div>
                <p className="askly-section-eyebrow">Recent forms</p>
                <h2 className="mt-1 text-base font-semibold text-stone-100">
                  All forms across the platform
                </h2>
              </div>
              <p className="text-xs text-stone-400/75">
                Showing {(page - 1) * 15 + 1}–
                {Math.min(page * 15, formsQuery.data?.total ?? 0)} of{" "}
                {formsQuery.data?.total ?? 0}
              </p>
            </header>
            <AllFormsTable
              data={formsQuery.data}
              isLoading={formsQuery.isLoading}
              error={formsQuery.error ? { message: formsQuery.error.message } : null}
              onUnpublish={(formId) => {
                if (
                  window.confirm(
                    "Force this form back to draft? It will stop accepting responses immediately. The creator can republish it.",
                  )
                ) {
                  unpublishMutation.mutate({ formId });
                }
              }}
              unpublishingId={
                unpublishMutation.isPending
                  ? unpublishMutation.variables?.formId ?? null
                  : null
              }
            />
            <footer className="flex items-center justify-between border-t border-stone-300/12 px-5 py-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <span className="text-xs text-stone-400/85 font-mono">
                Page {page}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => p + 1)}
                disabled={!formsQuery.data?.hasMore}
              >
                Next
              </Button>
            </footer>
          </section>
        </div>
      )}
    </GalacticShell>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Subcomponents
// ──────────────────────────────────────────────────────────────────────

function LoadingShell({ label }: { label: string }) {
  return (
    <div className="askly-card-glass flex items-center justify-center gap-2 p-10 text-stone-300/85">
      <Loader2 className="size-4 animate-spin text-amber-200" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

function AccessDenied({
  icon: Icon,
  title,
  body,
  ctaHref,
  ctaLabel,
}: {
  icon: typeof Shield;
  title: string;
  body: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="askly-card-glass mx-auto max-w-xl p-8 text-center"
    >
      <div className="mx-auto mb-4 grid size-12 place-items-center rounded-md border border-amber-200/30 bg-amber-100/6">
        <Icon className="size-5 text-amber-200" />
      </div>
      <h2 className="text-xl font-semibold text-stone-50">{title}</h2>
      <p className="mt-2 text-sm text-stone-300/85">{body}</p>
      <Link
        href={ctaHref}
        className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-amber-200/30 bg-amber-100/8 px-3 py-1.5 text-xs text-amber-100 transition hover:bg-amber-100/12"
      >
        {ctaLabel}
        <ArrowRight className="size-3" />
      </Link>
    </motion.div>
  );
}

// Strongly-typed extraction of the admin router output shapes from the
// shared tRPC client. Using inferRouterOutputs (the official tRPC helper)
// avoids relying on `ReturnType<typeof useQuery>` which doesn't resolve
// to a useful type when the hook isn't actually called in scope.
type AdminOverview = {
  totals: {
    users: number;
    forms: number;
    publishedForms: number;
    responses: number;
    responsesLast7Days: number;
    newUsersLast7Days: number;
  };
  topCreators: Array<{
    userId: string;
    fullName: string;
    email: string;
    role: string;
    formCount: number;
  }>;
};

type AdminFormsList = {
  items: Array<{
    id: string;
    title: string;
    slug: string;
    status: string;
    visibility: string;
    creatorName: string;
    creatorEmail: string;
    // tRPC's JSON transport serializes Date → string on the wire even
    // though the server returned a Date. RelativeTime accepts either.
    updatedAt: string | Date;
    responseCount: number;
  }>;
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

function OverviewGrid({
  data,
  isLoading,
  error,
}: {
  data: AdminOverview | undefined;
  isLoading: boolean;
  error: { message: string } | null;
}) {
  if (isLoading) return <LoadingShell label="Loading platform metrics…" />;
  if (error)
    return (
      <div className="askly-card-glass border-rose-300/30 bg-rose-300/4 p-4 text-sm text-rose-200">
        Failed to load metrics: {error.message}
      </div>
    );
  if (!data) return null;

  const cards: Array<{
    label: string;
    value: string;
    sub: string;
    icon: typeof Users;
    tone: string;
  }> = [
    {
      label: "Total users",
      value: String(data.totals.users),
      sub: `${data.totals.newUsersLast7Days} new in last 7d`,
      icon: Users,
      tone: "text-sky-200",
    },
    {
      label: "Total forms",
      value: String(data.totals.forms),
      sub: `${data.totals.publishedForms} published`,
      icon: FileText,
      tone: "text-amber-200",
    },
    {
      label: "Total responses",
      value: String(data.totals.responses),
      sub: `${data.totals.responsesLast7Days} in last 7d`,
      icon: Inbox,
      tone: "text-emerald-200",
    },
    {
      label: "Weekly activity",
      value: `${data.totals.responsesLast7Days}`,
      sub: "responses this week",
      icon: TrendingUp,
      tone: "text-violet-200",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.label}
            className="askly-card-glass flex items-start gap-3 p-4"
          >
            <div className="grid size-9 place-items-center rounded-md border border-stone-300/15 bg-stone-100/3">
              <Icon className={cn("size-4", c.tone)} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.16em] text-stone-400/75">
                {c.label}
              </p>
              <p className="mt-0.5 text-2xl font-semibold text-stone-50 tabular-nums">
                {c.value}
              </p>
              <p className="text-[11px] text-stone-400/75">{c.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TopCreatorsTable({
  data,
  isLoading,
}: {
  data: AdminOverview | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="p-6 text-center text-sm text-stone-400/85">Loading…</div>
    );
  }
  if (!data || data.topCreators.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-stone-400/85">
        No creators yet.
      </div>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[10px] uppercase tracking-[0.16em] text-stone-400/75">
          <th className="px-5 py-2 text-left">Creator</th>
          <th className="px-5 py-2 text-left">Email</th>
          <th className="px-5 py-2 text-left">Role</th>
          <th className="px-5 py-2 text-right">Forms</th>
        </tr>
      </thead>
      <tbody>
        {data.topCreators.map((c) => (
          <tr
            key={c.userId}
            className="border-t border-stone-300/8 text-stone-200"
          >
            <td className="px-5 py-2.5">{c.fullName}</td>
            <td className="px-5 py-2.5 text-stone-300/85">{c.email}</td>
            <td className="px-5 py-2.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]",
                  c.role === "admin"
                    ? "border-amber-200/35 bg-amber-200/10 text-amber-100"
                    : "border-stone-300/25 bg-stone-100/4 text-stone-300",
                )}
              >
                {c.role}
              </span>
            </td>
            <td className="px-5 py-2.5 text-right font-mono text-stone-100 tabular-nums">
              {c.formCount}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AllFormsTable({
  data,
  isLoading,
  error,
  onUnpublish,
  unpublishingId,
}: {
  data: AdminFormsList | undefined;
  isLoading: boolean;
  error: { message: string } | null;
  onUnpublish: (formId: string) => void;
  unpublishingId: string | null;
}) {
  if (isLoading) {
    return (
      <div className="p-6 text-center text-sm text-stone-400/85">Loading…</div>
    );
  }
  if (error) {
    return (
      <div className="p-6 text-center text-sm text-rose-200">
        Failed to load forms: {error.message}
      </div>
    );
  }
  if (!data || data.items.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-stone-400/85">
        No forms yet.
      </div>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[10px] uppercase tracking-[0.16em] text-stone-400/75">
          <th className="px-5 py-2 text-left">Form</th>
          <th className="px-5 py-2 text-left">Creator</th>
          <th className="px-5 py-2 text-left">Status</th>
          <th className="px-5 py-2 text-left">Visibility</th>
          <th className="px-5 py-2 text-right">Responses</th>
          <th className="px-5 py-2 text-right">Updated</th>
          <th className="px-5 py-2 text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {data.items.map((f) => (
          <tr
            key={f.id}
            className="border-t border-stone-300/8 text-stone-200"
          >
            <td className="px-5 py-2.5">
              <div className="flex items-center gap-2">
                <span className="font-medium">{f.title}</span>
                <Link
                  href={`/forms/${f.slug}`}
                  target="_blank"
                  className="text-stone-400/65 hover:text-amber-100"
                  title="Open public form"
                >
                  <ExternalLink className="size-3" />
                </Link>
              </div>
              <p className="font-mono text-[10px] text-stone-400/65">{f.slug}</p>
            </td>
            <td className="px-5 py-2.5">
              <p>{f.creatorName}</p>
              <p className="text-[10px] text-stone-400/65">{f.creatorEmail}</p>
            </td>
            <td className="px-5 py-2.5">
              <StatusPill status={f.status} />
            </td>
            <td className="px-5 py-2.5 text-stone-300/85">{f.visibility}</td>
            <td className="px-5 py-2.5 text-right font-mono tabular-nums">
              {f.responseCount}
            </td>
            <td className="px-5 py-2.5 text-right text-xs text-stone-400/75">
              <RelativeTime date={f.updatedAt} />
            </td>
            <td className="px-5 py-2.5 text-right">
              {f.status === "published" ? (
                <button
                  type="button"
                  onClick={() => onUnpublish(f.id)}
                  disabled={unpublishingId === f.id}
                  title="Force back to draft"
                  className="inline-flex items-center gap-1 rounded-md border border-rose-300/30 bg-rose-300/8 px-2 py-1 text-[10px] uppercase tracking-wider text-rose-200 transition hover:bg-rose-300/14 disabled:opacity-50"
                >
                  {unpublishingId === f.id ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <EyeOff className="size-3" />
                  )}
                  Unpublish
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md border border-stone-300/15 bg-stone-100/3 px-2 py-1 text-[10px] uppercase tracking-wider text-stone-500">
                  <AlertTriangle className="size-3" />
                  N/A
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "published"
      ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-200"
      : status === "draft"
        ? "border-amber-300/35 bg-amber-300/10 text-amber-200"
        : status === "archived"
          ? "border-stone-300/25 bg-stone-950/40 text-stone-400"
          : "border-stone-300/30 bg-stone-100/5 text-stone-300";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]",
        tone,
      )}
    >
      {status}
    </span>
  );
}
