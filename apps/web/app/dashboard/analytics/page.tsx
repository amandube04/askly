"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  ExternalLink,
  Inbox,
  Loader2,
  PencilLine,
  Send,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { GalacticShell } from "~/components/layout/galactic-shell";
import { Button } from "~/components/ui/button";
import { RelativeTime } from "~/components/ui/time";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

// Auth presence hint — see /dashboard/new for the full rationale. OAuth
// users no longer have a session token in localStorage (HttpOnly cookie
// does the auth), so we key off the userId hint instead. The real
// authoritative check happens server-side on the next tRPC call.
const DEMO_USER_STORAGE_KEY = "askly.userId";

export default function AnalyticsIndexPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setAuthed(Boolean(window.localStorage.getItem(DEMO_USER_STORAGE_KEY)));
  }, []);

  const formsQuery = trpc.forms.listMineWithStats.useQuery(undefined, {
    enabled: authed === true,
    refetchOnWindowFocus: false,
  });

  const forms = useMemo(() => {
    return (formsQuery.data ?? []).map((f) => ({
      ...f,
      updatedAt: new Date(f.updatedAt as unknown as string),
      lastResponseAt: f.lastResponseAt
        ? new Date(f.lastResponseAt as unknown as string)
        : null,
    }));
  }, [formsQuery.data]);

  if (authed === false) {
    return (
      <GalacticShell eyebrow="Observatory" title="Sign in to view analytics">
        <div className="askly-card-glass p-6">
          <p className="text-sm text-stone-300/80">
            Analytics are per-form. Start a demo session from the dashboard to
            explore funnels, response trends, and field health for the seeded
            forms.
          </p>
          <Button
            asChild
            className="mt-4 askly-cta-glow gap-1.5 bg-amber-100 text-stone-900 hover:bg-amber-50"
          >
            <Link href="/dashboard">
              Go to dashboard
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </GalacticShell>
    );
  }

  const totalResponses = forms.reduce((acc, f) => acc + f.responseCount, 0);
  const published = forms.filter((f) => f.status === "published").length;

  return (
    <GalacticShell
      eyebrow="Observatory"
      title="Analytics overview"
      subtitle="Pick a form to dive into its funnel, daily trend, and field health."
    >
      <div className="space-y-5">
        {/* Aggregated stats */}
        <div className="grid gap-3 sm:grid-cols-3">
          <OverviewTile
            label="Total responses"
            value={totalResponses}
            icon={Send}
            accent="text-amber-200"
          />
          <OverviewTile
            label="Live forms"
            value={published}
            icon={Sparkles}
            accent="text-emerald-200"
          />
          <OverviewTile
            label="Tracked forms"
            value={forms.length}
            icon={TrendingUp}
            accent="text-sky-200"
          />
        </div>

        {/* Form list */}
        {formsQuery.isLoading || authed === null ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-stone-300/15 bg-stone-100/3 p-12 text-stone-400/80">
            <Loader2 className="size-4 animate-spin" />
            Loading forms…
          </div>
        ) : forms.length === 0 ? (
          <div className="askly-card-glass p-8 text-center">
            <p className="text-sm text-stone-300/80">
              No forms yet. Create your first form to start collecting
              analytics.
            </p>
            <Button
              asChild
              className="mt-4 askly-cta-glow gap-1.5 bg-amber-100 text-stone-900 hover:bg-amber-50"
            >
              <Link href="/dashboard/new">
                Launch your first form
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="askly-section-eyebrow">All forms</p>
            <div className="grid gap-2">
              {forms.map((form, i) => (
                <motion.div
                  key={form.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.25 }}
                >
                  <FormAnalyticsRow form={form} />
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </GalacticShell>
  );
}

function OverviewTile({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: typeof Send;
  accent: string;
}) {
  return (
    <div className="askly-card-glass relative overflow-hidden p-4">
      <div className="flex items-start justify-between">
        <p className="askly-section-eyebrow">{label}</p>
        <Icon className={cn("size-4", accent)} />
      </div>
      <p
        className={cn(
          "mt-2 text-3xl font-semibold tabular-nums",
          accent,
        )}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function FormAnalyticsRow({
  form,
}: {
  form: {
    id: string;
    slug: string;
    title: string;
    status: string;
    responseCount: number;
    lastResponseAt: Date | null;
    updatedAt: Date;
  };
}) {
  const isPublished = form.status === "published";
  return (
    <div
      className={cn(
        "askly-card-glass group flex flex-wrap items-center gap-3 p-3 transition-colors",
        "hover:border-amber-200/30",
      )}
    >
      {/* Status pill */}
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]",
          isPublished
            ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
            : "border-stone-300/20 bg-stone-100/4 text-stone-300/70",
        )}
      >
        <span
          className={cn(
            "size-1 rounded-full",
            isPublished ? "bg-emerald-300" : "bg-stone-400/60",
          )}
        />
        {isPublished ? "Live" : "Draft"}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-stone-100">
          {form.title || "Untitled form"}
        </p>
        <p className="truncate font-mono text-[11px] text-stone-400/70">
          /forms/{form.slug}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-4 text-xs text-stone-300/85">
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400/70">
            Responses
          </p>
          <p className="font-semibold tabular-nums text-stone-50">
            {form.responseCount.toLocaleString()}
          </p>
        </div>
        <div className="hidden text-right sm:block">
          <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400/70">
            Last signal
          </p>
          <p className="font-mono text-[11px] text-stone-300/85">
            <RelativeTime date={form.lastResponseAt} placeholder="—" />
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Link
          href={`/dashboard/forms/${form.id}`}
          className="inline-flex items-center gap-1 rounded-md border border-stone-300/15 bg-stone-100/4 px-2 py-1 text-[11px] text-stone-300/85 transition-colors hover:bg-stone-100/8"
          title="Edit"
        >
          <PencilLine className="size-3" />
          Edit
        </Link>
        <Link
          href={`/dashboard/forms/${form.id}/responses`}
          className="inline-flex items-center gap-1 rounded-md border border-stone-300/15 bg-stone-100/4 px-2 py-1 text-[11px] text-stone-300/85 transition-colors hover:bg-stone-100/8"
          title="Responses"
        >
          <Inbox className="size-3" />
          Inbox
        </Link>
        <Link
          href={`/dashboard/analytics/${form.id}`}
          className="askly-cta-glow inline-flex items-center gap-1 rounded-md border border-amber-300/40 bg-amber-300/10 px-2.5 py-1 text-[11px] font-medium text-amber-100 transition-colors hover:bg-amber-200/20"
        >
          <BarChart3 className="size-3" />
          Open analytics
        </Link>
        {isPublished ? (
          <Link
            href={`/forms/${form.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-stone-300/15 bg-stone-100/4 px-2 py-1 text-[11px] text-stone-300/85 transition-colors hover:bg-stone-100/8"
            title="Open public form"
          >
            <ExternalLink className="size-3" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
