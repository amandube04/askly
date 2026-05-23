"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Compass,
  FileText,
  Inbox,
  Search,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { LandingFooter } from "~/components/landing/landing-footer";
import { LandingNav } from "~/components/landing/landing-nav";
import { ScrollProgress } from "~/components/landing/scroll-progress";
import { Starfield } from "~/components/landing/starfield";
import { Button } from "~/components/ui/button";
import { RelativeTime } from "~/components/ui/time";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

const ACCENTS = ["amber", "emerald", "sky", "violet", "rose", "cyan"] as const;
type Accent = (typeof ACCENTS)[number];
function accentForSlug(slug: string): Accent {
  let sum = 0;
  for (let i = 0; i < slug.length; i++) sum += slug.charCodeAt(i);
  return ACCENTS[sum % ACCENTS.length] as Accent;
}

const ACCENT_CLASSES: Record<Accent, { ring: string; bar: string; pill: string }> = {
  amber: {
    ring: "from-amber-300/35 via-transparent to-transparent",
    bar: "from-amber-200/70 via-amber-300/40 to-transparent",
    pill: "border-amber-300/30 bg-amber-300/8 text-amber-100",
  },
  emerald: {
    ring: "from-emerald-300/35 via-transparent to-transparent",
    bar: "from-emerald-200/70 via-emerald-300/40 to-transparent",
    pill: "border-emerald-300/30 bg-emerald-300/8 text-emerald-100",
  },
  sky: {
    ring: "from-sky-300/35 via-transparent to-transparent",
    bar: "from-sky-200/70 via-sky-300/40 to-transparent",
    pill: "border-sky-300/30 bg-sky-300/8 text-sky-100",
  },
  violet: {
    ring: "from-violet-300/35 via-transparent to-transparent",
    bar: "from-violet-200/70 via-violet-300/40 to-transparent",
    pill: "border-violet-300/30 bg-violet-300/8 text-violet-100",
  },
  rose: {
    ring: "from-rose-300/35 via-transparent to-transparent",
    bar: "from-rose-200/70 via-rose-300/40 to-transparent",
    pill: "border-rose-300/30 bg-rose-300/8 text-rose-100",
  },
  cyan: {
    ring: "from-cyan-300/35 via-transparent to-transparent",
    bar: "from-cyan-200/70 via-cyan-300/40 to-transparent",
    pill: "border-cyan-300/30 bg-cyan-300/8 text-cyan-100",
  },
};

export default function ExplorePage() {
  const [search, setSearch] = useState("");
  const query = trpc.forms.listPublicWithStats.useQuery({ limit: 50 });
  // Coerce serialized date strings back into Date instances on the client.
  const forms = useMemo(
    () =>
      (query.data ?? []).map((f) => ({
        ...f,
        // tRPC over HTTP serializes Date as ISO string on the client.
        updatedAt: new Date(f.updatedAt as unknown as string),
        publishedAt: f.publishedAt ? new Date(f.publishedAt as unknown as string) : null,
      })),
    [query.data],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return forms;
    return forms.filter(
      (f) =>
        f.title.toLowerCase().includes(q) ||
        f.slug.toLowerCase().includes(q) ||
        (f.description?.toLowerCase().includes(q) ?? false),
    );
  }, [forms, search]);

  const totals = useMemo(() => {
    return forms.reduce(
      (acc, f) => {
        acc.responses += f.responseCount;
        acc.fields += f.fieldCount;
        return acc;
      },
      { responses: 0, fields: 0 },
    );
  }, [forms]);

  return (
    <main className="askly-landing min-h-screen">
      <ScrollProgress />
      <div className="askly-landing-grain" aria-hidden />
      <div className="askly-aurora" aria-hidden />
      <Starfield />

      <div className="relative z-10">
        <LandingNav />

        {/* Hero */}
        <section className="mx-auto max-w-6xl px-5 pb-10 pt-16 text-center sm:pt-24">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 rounded-full border border-amber-200/30 bg-amber-100/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-amber-100"
          >
            <Compass className="size-3" />
            Public form gallery
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mt-5 text-balance text-4xl font-semibold tracking-tight text-stone-50 sm:text-6xl"
          >
            Explore live{" "}
            <span className="askly-headline-shimmer">missions</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mx-auto mt-4 max-w-2xl text-balance text-base text-stone-300/85 sm:text-lg"
          >
            Every form here is real, live, and accepting responses. Open one,
            submit a response, and see what the funnel does on the creator
            side.
          </motion.p>

          {/* Stats strip */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="mx-auto mt-6 inline-flex flex-wrap items-center justify-center gap-4 rounded-full border border-stone-300/15 bg-stone-100/2 px-4 py-2 text-xs text-stone-300/85"
          >
            <span className="inline-flex items-center gap-1.5">
              <FileText className="size-3.5 text-amber-200/85" />
              <span className="font-mono tabular-nums text-stone-100">{forms.length}</span>
              live forms
            </span>
            <span className="text-stone-500/50">·</span>
            <span className="inline-flex items-center gap-1.5">
              <Inbox className="size-3.5 text-emerald-200/85" />
              <span className="font-mono tabular-nums text-stone-100">{totals.responses}</span>
              total responses
            </span>
            <span className="text-stone-500/50">·</span>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-sky-200/85" />
              <span className="font-mono tabular-nums text-stone-100">{totals.fields}</span>
              fields collected
            </span>
          </motion.div>
        </section>

        {/* Search */}
        <section className="mx-auto max-w-3xl px-5 pb-6">
          <div className="askly-card-glass flex items-center gap-3 p-2.5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title, slug, or description…"
                className="w-full rounded-md bg-transparent py-2 pl-9 pr-9 text-sm text-stone-50 placeholder:text-stone-500 focus:outline-none"
              />
              {search.length > 0 ? (
                <button
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-stone-400 hover:bg-stone-100/5 hover:text-stone-200"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
          </div>
        </section>

        {/* Grid */}
        <section className="mx-auto max-w-6xl px-5 pb-20">
          {query.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="askly-card-glass h-52 animate-pulse" />
              ))}
            </div>
          ) : query.error ? (
            <div className="askly-card-glass p-6 text-center">
              <p className="text-sm text-rose-300">{query.error.message}</p>
            </div>
          ) : filtered.length === 0 && search.length > 0 ? (
            <div className="askly-card-glass p-10 text-center">
              <p className="text-sm text-stone-300">
                No public forms match &ldquo;{search}&rdquo;.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearch("")}
                className="mt-3 border-stone-300/30 bg-stone-100/4 text-stone-100 hover:bg-stone-100/10"
              >
                Clear search
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyExplore />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((form, i) => (
                <FormCard key={form.id} form={form} index={i} />
              ))}
            </div>
          )}
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-5 pb-20">
          <div className="askly-card-glass relative overflow-hidden p-8 text-center sm:p-12">
            <div className="askly-scan-line opacity-25" aria-hidden />
            <div className="relative">
              <p className="askly-section-eyebrow">Your turn</p>
              <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-stone-50 sm:text-4xl">
                Got a question for the world? Ship it in five minutes.
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm text-stone-300/80">
                Start from a template, publish a public link, and your form
                shows up right here on the explore page.
              </p>
              <Button
                asChild
                size="lg"
                className="askly-cta-glow mt-6 gap-2 bg-amber-100 text-stone-900 hover:bg-amber-50"
              >
                <Link href="/dashboard/new">
                  <Sparkles className="size-4" />
                  Build a public form
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <LandingFooter />
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────

function FormCard({
  form,
  index,
}: {
  form: {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    updatedAt: Date;
    publishedAt: Date | null;
    fieldCount: number;
    responseCount: number;
  };
  index: number;
}) {
  const accent = accentForSlug(form.slug);
  const cls = ACCENT_CLASSES[accent];
  const isTrending = form.responseCount > 8;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.4) }}
      whileHover={{ y: -2 }}
      className="group askly-card-glass relative flex h-full flex-col overflow-hidden"
    >
      {/* Top accent bar */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-px bg-linear-to-r",
          cls.bar,
        )}
      />
      {/* Soft accent glow on hover */}
      <div
        className={cn(
          "pointer-events-none absolute -inset-px -z-10 bg-radial opacity-0 transition-opacity duration-300 group-hover:opacity-100",
          cls.ring,
        )}
        aria-hidden
      />

      <div className="flex flex-1 flex-col p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <p className="askly-section-eyebrow">Public</p>
          {isTrending ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/35 bg-emerald-300/8 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em] text-emerald-200">
              <TrendingUp className="size-2.5" />
              Trending
            </span>
          ) : null}
        </div>

        <h3 className="mt-2 line-clamp-2 text-lg font-semibold tracking-tight text-stone-50">
          {form.title}
        </h3>

        {form.description ? (
          <p className="mt-1.5 line-clamp-2 text-sm text-stone-300/80">
            {form.description}
          </p>
        ) : null}

        <div className="mt-3 flex items-center gap-1.5 font-mono text-[11px] text-stone-400/75">
          <span className="text-stone-500/65">/forms/</span>
          <span className="truncate">{form.slug}</span>
        </div>

        <div className="mt-auto pt-4">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 border-t border-stone-300/10 pt-3 text-center">
            <Stat icon={FileText} label="Fields" value={form.fieldCount} />
            <Stat icon={Inbox} label="Responses" value={form.responseCount} />
            <Stat
              icon={Sparkles}
              label="Updated"
              value={<RelativeTime date={form.updatedAt} />}
            />
          </div>

          {/* CTA */}
          <Button
            asChild
            size="sm"
            className={cn(
              "mt-4 w-full justify-between gap-2 border bg-stone-100/3 text-stone-100 transition-colors group-hover:text-stone-50",
              cls.pill,
            )}
          >
            <Link href={`/forms/${form.slug}`}>
              Open form
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText;
  label: string;
  value: string | number | React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-center gap-1 text-[10px] uppercase tracking-[0.14em] text-stone-400/70">
        <Icon className="size-2.5" />
        {label}
      </div>
      <p className="font-mono text-sm tabular-nums text-stone-100">{value}</p>
    </div>
  );
}

function EmptyExplore() {
  return (
    <div className="askly-card-glass relative overflow-hidden p-12 text-center">
      <div className="absolute inset-0 askly-orbit-mini opacity-30" aria-hidden />
      <div className="relative mx-auto max-w-md">
        <div className="mx-auto grid size-12 place-items-center rounded-full border border-amber-200/30 bg-amber-100/8 text-amber-100">
          <Compass className="size-5" />
        </div>
        <h3 className="mt-3 text-xl font-semibold text-stone-50">
          No public forms yet.
        </h3>
        <p className="mt-2 text-sm text-stone-300/80">
          When creators publish a form with public visibility, it lands here
          for everyone to discover.
        </p>
        <Button
          asChild
          className="askly-cta-glow mt-5 gap-2 bg-amber-100 text-stone-900 hover:bg-amber-50"
        >
          <Link href="/dashboard/new">
            <Sparkles className="size-4" />
            Build the first one
          </Link>
        </Button>
      </div>
    </div>
  );
}
