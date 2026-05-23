"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, Lightbulb, Loader2, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

/**
 * Right-rail content for /dashboard.
 *
 * Two stacked cards:
 *   1. Signal Tips — static editorial copy.
 *   2. Insights — real aggregate metrics from analytics.getCreatorOverview,
 *      with honest empty states (no fake numbers when there's no data).
 */
export function InsightsRail({ hasSession }: { hasSession: boolean }) {
  return (
    <div className="space-y-3">
      <SignalTipsCard />
      <InsightsCard hasSession={hasSession} />
    </div>
  );
}

function SignalTipsCard() {
  return (
    <div className="askly-card-glass space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Lightbulb className="size-3.5 text-amber-200/85" />
        <p className="text-[10px] uppercase tracking-[0.18em] text-stone-300/65">
          Signal tips
        </p>
      </div>
      <p className="text-xs leading-relaxed text-stone-300/80">
        Build concise forms. Keep important questions early. Drop-off spikes
        mid-form; analytics tells you where to cut.
      </p>
      <div className="rounded-md border border-stone-300/15 bg-stone-950/40 p-3 font-mono text-[11px] text-stone-300/75">
        <p className="text-stone-400/55">{"// pro tip"}</p>
        <p className="mt-1">
          Shorter forms <span className="text-amber-100">≈ 2.4×</span> higher
          completion than 10+ field forms.
        </p>
      </div>
    </div>
  );
}

function InsightsCard({ hasSession }: { hasSession: boolean }) {
  const overviewQuery = trpc.analytics.getCreatorOverview.useQuery(undefined, {
    enabled: hasSession,
    refetchInterval: 30_000,
  });

  return (
    <div className="askly-card-glass space-y-3 p-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="size-3.5 text-emerald-200/85" />
        <p className="text-[10px] uppercase tracking-[0.18em] text-stone-300/65">
          Insights
        </p>
      </div>

      {!hasSession ? (
        <p className="text-xs leading-relaxed text-stone-400/75">
          Sign in to see live insights across your forms.
        </p>
      ) : overviewQuery.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-stone-400/75">
          <Loader2 className="size-3 animate-spin" />
          Loading insights…
        </div>
      ) : !overviewQuery.data ? (
        <p className="text-xs text-rose-300/85">
          Couldn&apos;t load insights right now.
        </p>
      ) : overviewQuery.data.totalForms === 0 ? (
        <p className="text-xs leading-relaxed text-stone-400/75">
          Create your first form to start collecting signal.
        </p>
      ) : (
        <InsightsBody data={overviewQuery.data} />
      )}
    </div>
  );
}

interface OverviewData {
  totalViews: number;
  totalSubmits: number;
  completionRatePercent: number | null;
  responsesThisWeek: number;
  weeklyTrendPercent: number | null;
  topForm: { id: string; title: string; slug: string; responseCount: number } | null;
}

function InsightsBody({ data }: { data: OverviewData }) {
  return (
    <div className="space-y-3">
      <MetricRow
        label="Completion rate"
        value={
          data.completionRatePercent === null
            ? "—"
            : `${data.completionRatePercent.toFixed(1)}%`
        }
        hint={
          data.completionRatePercent === null
            ? "No views yet"
            : `${data.totalSubmits.toLocaleString()} of ${data.totalViews.toLocaleString()} views`
        }
      />

      <MetricRow
        label="Responses this week"
        value={data.responsesThisWeek.toLocaleString()}
        delta={data.weeklyTrendPercent}
        hint={
          data.weeklyTrendPercent === null
            ? "No prior-week baseline"
            : `vs last week`
        }
      />

      {data.topForm ? (
        <Link
          href={`/dashboard/analytics/${data.topForm.id}`}
          className="group flex items-center gap-2 rounded-md border border-stone-300/15 bg-stone-100/3 p-2.5 transition hover:border-amber-200/35 hover:bg-amber-100/6"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-md border border-amber-200/30 bg-amber-100/8 text-amber-100">
            <Sparkles className="size-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.16em] text-stone-400/65">
              Top form
            </p>
            <p className="truncate text-xs font-medium text-stone-100">
              {data.topForm.title}
            </p>
            <p className="truncate text-[10px] text-stone-400/65">
              {data.topForm.responseCount.toLocaleString()} responses
            </p>
          </div>
          <ArrowRight className="size-3.5 shrink-0 text-stone-400/70 transition group-hover:text-amber-100" />
        </Link>
      ) : null}
    </div>
  );
}

function MetricRow({
  label,
  value,
  hint,
  delta,
}: {
  label: string;
  value: string;
  hint: string;
  delta?: number | null;
}) {
  const showDelta = delta !== undefined && delta !== null;
  const isPositive = showDelta && (delta as number) >= 0;
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;

  return (
    <div className="rounded-md border border-stone-300/12 bg-stone-100/2 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.16em] text-stone-400/70">
          {label}
        </p>
        {showDelta ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono tabular-nums",
              isPositive
                ? "border border-emerald-300/25 bg-emerald-300/8 text-emerald-200"
                : "border border-rose-300/25 bg-rose-300/8 text-rose-200",
            )}
          >
            <TrendIcon className="size-2.5" />
            {isPositive ? "+" : ""}
            {(delta as number).toFixed(1)}%
          </span>
        ) : null}
      </div>
      <p className="mt-1 font-semibold tabular-nums text-stone-50 text-xl">{value}</p>
      <p className="mt-0.5 text-[10px] text-stone-400/65">{hint}</p>
    </div>
  );
}
