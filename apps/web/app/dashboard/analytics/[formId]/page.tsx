"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BarChart3,
  CircleHelp,
  Clock,
  Eye,
  ExternalLink,
  Inbox,
  Layers,
  MailCheck,
  PencilLine,
  Send,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { GalacticShell } from "~/components/layout/galactic-shell";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

// Auth presence hint — see /dashboard/new for the full rationale. OAuth
// users no longer have a session token in localStorage (HttpOnly cookie
// does the auth), so we key off the userId hint instead. The real
// authoritative check happens server-side on the next tRPC call.
const DEMO_USER_STORAGE_KEY = "askly.userId";

export default function AnalyticsPage() {
  const params = useParams<{ formId: string }>();
  const formId = typeof params?.formId === "string" ? params.formId : "";

  const [isHydrated, setIsHydrated] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    setHasSession(!!window.localStorage.getItem(DEMO_USER_STORAGE_KEY));
    setIsHydrated(true);
  }, []);

  const analyticsQuery = trpc.analytics.getOverview.useQuery(
    { formId },
    {
      enabled: isHydrated && hasSession && formId.length > 0,
      refetchInterval: 15_000,
    },
  );

  const formQuery = trpc.forms.getMineById.useQuery(
    { formId },
    { enabled: isHydrated && hasSession && formId.length > 0 },
  );

  const data = analyticsQuery.data;
  const maxTrend = useMemo(
    () => (data?.dailyTrend ?? []).reduce((m, d) => Math.max(m, d.count), 0),
    [data?.dailyTrend],
  );

  // ── unauth / loading
  if (!isHydrated) {
    return (
      <GalacticShell eyebrow="Observatory" title="Loading…">
        <div className="askly-card-glass h-96 animate-pulse" />
      </GalacticShell>
    );
  }
  if (!hasSession) {
    return (
      <GalacticShell eyebrow="Observatory" title="Authenticate to view analytics">
        <div className="askly-card-glass p-8 text-center">
          <p className="text-stone-200">
            You need a creator session to view analytics.
          </p>
          <Button
            asChild
            className="askly-cta-glow mt-4 bg-amber-100 text-stone-900 hover:bg-amber-50"
          >
            <a href="/dashboard">Go to dashboard</a>
          </Button>
        </div>
      </GalacticShell>
    );
  }
  if (analyticsQuery.isLoading || !data) {
    return (
      <GalacticShell eyebrow="Observatory" title="Loading analytics…">
        <div className="space-y-4">
          <div className="askly-card-glass h-28 animate-pulse" />
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="askly-card-glass h-32 animate-pulse" />
            ))}
          </div>
        </div>
      </GalacticShell>
    );
  }

  const slug = formQuery.data?.slug;
  const conversion = data.completionRateEstimate ?? 0;
  const dropOff = data.dropOffRateEstimate ?? 0;

  return (
    <GalacticShell
      eyebrow="Observatory"
      title={data.title}
      subtitle={`Live telemetry · refreshes every 15s${slug ? ` · /forms/${slug}` : ""}`}
      actions={
        <>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="border-stone-300/25 bg-stone-100/5 text-stone-200 hover:bg-stone-100/10"
          >
            <Link href="/dashboard">
              <ArrowLeft className="size-4" />
              Back
            </Link>
          </Button>
          <BuilderTab href={`/dashboard/forms/${formId}`} icon={PencilLine}>
            Editor
          </BuilderTab>
          <BuilderTab href={`/dashboard/forms/${formId}/responses`} icon={Inbox}>
            Responses
          </BuilderTab>
          {slug ? (
            <Button
              asChild
              size="sm"
              className="askly-cta-glow gap-1.5 bg-amber-100 text-stone-900 hover:bg-amber-50"
            >
              <a href={`/forms/${slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
                Open form
              </a>
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-5">
        {/* ── Status strip ── */}
        <StatusStrip
          published={data.published}
          totalResponses={data.totalResponses}
          todayResponses={data.todayResponses}
          last7DaysResponses={data.last7DaysResponses}
          uniqueRespondents={data.uniqueRespondents}
          responseLimit={data.responseLimit}
          remainingResponses={data.remainingResponses}
        />

        {/* ── Funnel — the headline viz ── */}
        <FunnelCard
          views={data.totalViews}
          starts={data.totalStarts}
          submits={data.totalSubmits}
          conversion={conversion}
          dropOff={dropOff}
        />

        {/* ── Trend + Field health side by side ── */}
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <TrendCard trend={data.dailyTrend} max={maxTrend} />
          <FormHealthCard
            totalFields={data.totalFields}
            requiredFields={data.requiredFields}
            averageAnswersPerResponse={data.averageAnswersPerResponse}
            completionRateEstimate={data.completionRateEstimate}
          />
        </div>

        {/* ── Empty signal hint, only when no data ── */}
        {data.totalViews === 0 && data.totalResponses === 0 ? (
          <NoSignalNudge formSlug={slug ?? null} formId={formId} />
        ) : null}
      </div>
    </GalacticShell>
  );
}

// ──────────────────────────────────────────────────────────────────────────

function StatusStrip({
  published,
  totalResponses,
  todayResponses,
  last7DaysResponses,
  uniqueRespondents,
  responseLimit,
  remainingResponses,
}: {
  published: boolean;
  totalResponses: number;
  todayResponses: number;
  last7DaysResponses: number;
  uniqueRespondents: number;
  responseLimit: number | null;
  remainingResponses: number | null;
}) {
  const tiles = [
    {
      label: "Total responses",
      value: totalResponses,
      hint: `${uniqueRespondents} unique with email`,
      icon: Send,
      accent: "text-amber-200",
    },
    {
      label: "Today",
      value: todayResponses,
      hint: todayResponses === 0 ? "Quiet day so far" : "Live activity",
      icon: Clock,
      accent: "text-emerald-200",
    },
    {
      label: "Last 7 days",
      value: last7DaysResponses,
      hint: last7DaysResponses === 0 ? "No recent signal" : "Rolling week",
      icon: TrendingUp,
      accent: "text-sky-200",
    },
    {
      label: "Capacity left",
      value: responseLimit === null ? "∞" : (remainingResponses ?? 0),
      hint: responseLimit === null ? "No cap configured" : `Cap: ${responseLimit}`,
      icon: Layers,
      accent: "text-violet-200",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]",
            published
              ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-200"
              : "border-amber-300/35 bg-amber-300/10 text-amber-200",
          )}
        >
          <motion.span
            className={cn(
              "size-1 rounded-full",
              published ? "bg-emerald-300" : "bg-amber-300",
            )}
            animate={
              published
                ? { opacity: [0.5, 1, 0.5], scale: [1, 1.4, 1] }
                : undefined
            }
            transition={
              published
                ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
                : undefined
            }
          />
          {published ? "Live · accepting responses" : "Draft · not collecting"}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile, i) => (
          <motion.div
            key={tile.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.04 }}
            className="askly-card-glass p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="askly-section-eyebrow">{tile.label}</p>
              <tile.icon className={cn("size-4", tile.accent)} />
            </div>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-stone-50">
              {tile.value}
            </p>
            <p className="mt-1 text-xs text-stone-400/75">{tile.hint}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function FunnelCard({
  views,
  starts,
  submits,
  conversion,
  dropOff,
}: {
  views: number;
  starts: number;
  submits: number;
  conversion: number;
  dropOff: number;
}) {
  const hasAny = views + starts + submits > 0;
  const showRealFunnelPills = views > 0;
  const safeMax = Math.max(views, starts, submits, 1);
  const stages = [
    {
      key: "view",
      label: "Viewed",
      value: views,
      pct: 100,
      icon: Eye,
      tone: "from-sky-300/30 to-sky-400/10",
      dot: "bg-sky-300",
    },
    {
      key: "start",
      label: "Started",
      value: starts,
      pct: views > 0 ? Math.round((starts / views) * 100) : 0,
      icon: Sparkles,
      tone: "from-amber-300/30 to-amber-400/10",
      dot: "bg-amber-300",
    },
    {
      key: "submit",
      label: "Submitted",
      value: submits,
      pct: views > 0 ? Math.round((submits / views) * 100) : 0,
      icon: MailCheck,
      tone: "from-emerald-300/30 to-emerald-400/10",
      dot: "bg-emerald-300",
    },
  ];

  return (
    <div className="askly-card-glass relative overflow-hidden p-5">
      <div className="askly-scan-line opacity-20" aria-hidden />

      <div className="relative space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-amber-200/80" />
            <p className="askly-section-eyebrow">Conversion funnel</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {showRealFunnelPills ? (
              <>
                <ConversionPill
                  icon={TrendingUp}
                  label="View → Submit"
                  value={conversion}
                  tone="emerald"
                />
                <ConversionPill
                  icon={TrendingDown}
                  label="Drop-off"
                  value={dropOff}
                  tone="rose"
                />
              </>
            ) : (
              <ConversionPill
                icon={TrendingUp}
                label="Field completion (est.)"
                value={conversion}
                tone="emerald"
              />
            )}
          </div>
        </div>

        {!hasAny ? (
          <div className="rounded-md border border-dashed border-stone-300/15 bg-stone-100/2 p-6 text-center text-sm text-stone-400/75">
            No funnel events yet. Open the form and submit a test response to populate this.
          </div>
        ) : (
          <div className="space-y-2.5">
            {stages.map((stage, i) => {
              const widthPct =
                safeMax === 0 ? 0 : Math.max(6, Math.round((stage.value / safeMax) * 100));
              const Icon = stage.icon;
              return (
                <motion.div
                  key={stage.key}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.08 }}
                  className="space-y-1"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-stone-200">
                      <Icon className="size-3.5" />
                      {stage.label}
                    </span>
                    <span className="flex items-center gap-2 font-mono text-stone-300/85">
                      <span className="text-stone-50">{stage.value}</span>
                      <span className="text-[10px] text-stone-400/65">
                        {stage.pct}%
                      </span>
                    </span>
                  </div>
                  <div className="relative h-7 overflow-hidden rounded-md border border-stone-300/12 bg-stone-950/40">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${widthPct}%` }}
                      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                      className={cn(
                        "relative h-full bg-linear-to-r",
                        stage.tone,
                      )}
                    >
                      <span
                        className={cn(
                          "absolute right-2 top-1/2 size-1.5 -translate-y-1/2 rounded-full",
                          stage.dot,
                        )}
                      />
                    </motion.div>
                  </div>
                </motion.div>
              );
            })}

            {/* Step-to-step conversion arrows */}
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-stone-300/10 pt-3 text-xs">
              <StepConversion
                fromLabel="View"
                toLabel="Start"
                from={views}
                to={starts}
              />
              <StepConversion
                fromLabel="Start"
                toLabel="Submit"
                from={starts}
                to={submits}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ConversionPill({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: number;
  tone: "emerald" | "rose";
}) {
  const cls =
    tone === "emerald"
      ? "border-emerald-300/30 bg-emerald-300/8 text-emerald-200"
      : "border-rose-300/25 bg-rose-300/8 text-rose-200";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1",
        cls,
      )}
    >
      <Icon className="size-3" />
      <span className="text-[10px] uppercase tracking-[0.16em] opacity-80">
        {label}
      </span>
      <span className="font-mono tabular-nums">{value.toFixed(1)}%</span>
    </span>
  );
}

function StepConversion({
  fromLabel,
  toLabel,
  from,
  to,
}: {
  fromLabel: string;
  toLabel: string;
  from: number;
  to: number;
}) {
  const pct = from > 0 ? Math.round((to / from) * 100) : null;
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-stone-300/12 bg-stone-100/2 px-3 py-2">
      <span className="text-stone-300/85">
        {fromLabel} <span className="text-stone-500">→</span> {toLabel}
      </span>
      <span className="font-mono tabular-nums text-stone-100">
        {pct === null ? "—" : `${pct}%`}
      </span>
    </div>
  );
}

function TrendCard({
  trend,
  max,
}: {
  trend: { date: string; count: number }[];
  max: number;
}) {
  // Render last 7 days as a bar chart aligned by index.
  // Filler bars for missing days keep the visual width consistent.
  // `today` uses local time, so we defer the day-label calculation to the
  // client to avoid SSR/CSR hydration mismatches at day boundaries.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const days: { date: string; label: string; count: number }[] = [];
  if (mounted) {
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const match = trend.find((t) => t.date === iso);
      days.push({
        date: iso,
        label: d.toLocaleDateString(undefined, { weekday: "short" }),
        count: match?.count ?? 0,
      });
    }
  }

  return (
    <div className="askly-card-glass p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <p className="askly-section-eyebrow">7-day trend</p>
        <p className="text-xs text-stone-400/65">Responses per day</p>
      </div>

      {max === 0 ? (
        <div className="rounded-md border border-dashed border-stone-300/15 bg-stone-100/2 p-6 text-center text-sm text-stone-400/75">
          No responses in the last 7 days yet.
        </div>
      ) : (
        <div className="flex h-40 items-end gap-2">
          {days.map((day, i) => {
            const heightPct = max === 0 ? 0 : Math.max(4, (day.count / max) * 100);
            const isToday = i === days.length - 1;
            return (
              <div
                key={day.date}
                className="flex flex-1 flex-col items-center gap-1.5"
              >
                <span className="font-mono text-[10px] text-stone-300/75 tabular-nums">
                  {day.count}
                </span>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${heightPct}%` }}
                  transition={{ duration: 0.6, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    "w-full rounded-t-md border-x border-t",
                    isToday
                      ? "border-amber-200/40 bg-linear-to-t from-amber-300/40 to-amber-200/15"
                      : "border-stone-300/15 bg-linear-to-t from-stone-100/15 to-stone-100/5",
                  )}
                />
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-wider",
                    isToday ? "text-amber-200" : "text-stone-400/65",
                  )}
                >
                  {day.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FormHealthCard({
  totalFields,
  requiredFields,
  averageAnswersPerResponse,
  completionRateEstimate,
}: {
  totalFields: number;
  requiredFields: number;
  averageAnswersPerResponse: number;
  completionRateEstimate: number | null;
}) {
  return (
    <div className="askly-card-glass p-5">
      <div className="mb-4 flex items-center gap-2">
        <CircleHelp className="size-4 text-amber-200/80" />
        <p className="askly-section-eyebrow">Form health</p>
      </div>

      <div className="space-y-3 text-sm">
        <HealthRow
          label="Total fields"
          value={String(totalFields)}
          hint="Fields collected"
        />
        <HealthRow
          label="Required"
          value={`${requiredFields} / ${totalFields || 0}`}
          hint="Must be answered to submit"
        />
        <HealthRow
          label="Avg answers per response"
          value={averageAnswersPerResponse.toFixed(1)}
          hint="Across all responses"
        />

        <div className="rounded-md border border-stone-300/12 bg-stone-100/2 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-stone-300">Completion estimate</span>
            <span className="font-mono text-stone-50">
              {completionRateEstimate === null
                ? "—"
                : `${completionRateEstimate.toFixed(0)}%`}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-900">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${completionRateEstimate ?? 0}%` }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="h-full bg-linear-to-r from-amber-300 to-emerald-300"
            />
          </div>
          <p className="mt-1.5 text-[10px] text-stone-400/65">
            Calculated from views and submits, with a fallback to answer/required
            ratio when funnel events are sparse.
          </p>
        </div>
      </div>
    </div>
  );
}

function HealthRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-stone-200">{label}</p>
        <p className="truncate text-[10px] text-stone-400/65">{hint}</p>
      </div>
      <span className="font-mono text-base tabular-nums text-stone-50">
        {value}
      </span>
    </div>
  );
}

function NoSignalNudge({
  formSlug,
  formId,
}: {
  formSlug: string | null;
  formId: string;
}) {
  return (
    <div className="askly-card-glass relative grid place-items-center overflow-hidden px-6 py-10">
      <div className="absolute inset-0 askly-orbit-mini opacity-25" aria-hidden />
      <div className="relative max-w-md text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full border border-amber-200/30 bg-amber-100/8 text-amber-100">
          <Users className="size-5" />
        </div>
        <h3 className="mt-3 text-lg font-semibold text-stone-50">
          No signal yet.
        </h3>
        <p className="mt-1.5 text-sm text-stone-300/80">
          Once respondents view and submit your form, the funnel, trend, and
          health metrics above will fill in. The page auto-refreshes every 15
          seconds.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {formSlug ? (
            <Button
              asChild
              size="sm"
              className="askly-cta-glow gap-1.5 bg-amber-100 text-stone-900 hover:bg-amber-50"
            >
              <a href={`/forms/${formSlug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
                Open the form
              </a>
            </Button>
          ) : null}
          <Button
            asChild
            size="sm"
            variant="outline"
            className="border-stone-300/30 bg-stone-100/5 text-stone-100 hover:bg-stone-100/10"
          >
            <Link href={`/dashboard/forms/${formId}`}>
              <PencilLine className="size-4" />
              Back to editor
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function BuilderTab({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: typeof Inbox;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md border border-stone-300/20 bg-stone-100/3 px-2.5 py-1.5 text-xs text-stone-200 transition hover:border-amber-200/35 hover:bg-amber-100/6 hover:text-amber-100"
    >
      <Icon className="size-3.5" />
      {children}
    </Link>
  );
}
