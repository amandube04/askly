"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Check,
  CircleHelp,
  FileText,
  Globe,
  Inbox,
  LayoutDashboard,
  Mail,
  Minus,
  Palette,
  Rocket,
  Send,
  Shield,
  Sparkles,
  Star,
  Zap,
} from "lucide-react";
import { LandingFooter } from "~/components/landing/landing-footer";
import { LandingNav } from "~/components/landing/landing-nav";
import { ScrollProgress } from "~/components/landing/scroll-progress";
import { Starfield } from "~/components/landing/starfield";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type TierId = "free" | "pro" | "studio";

const TIERS: Array<{
  id: TierId;
  name: string;
  tagline: string;
  price: string;
  cadence: string;
  cta: { label: string; href: string };
  featured?: boolean;
  badge?: string;
  features: Array<{ icon: typeof Send; label: string }>;
}> = [
  // NOTE: tier "limits" (form count, response cap, retention windows) are
  // illustrative — none are enforced in the API today. The disclaimer banner
  // above the tier cards makes this explicit. Removed claims that have NO
  // implementation (password forms, custom domain, SSO, seats/roles, webhooks)
  // to stop the pricing page from lying about features that don't exist.
  {
    id: "free",
    name: "Scout",
    tagline: "Test the waters. Forever free for hobby projects.",
    price: "₹0",
    cadence: "free, no card required",
    cta: { label: "Start free", href: "/dashboard" },
    features: [
      { icon: FileText, label: "All 9 field types" },
      { icon: Send, label: "Public + unlisted visibility" },
      { icon: Palette, label: "Theme gallery" },
      { icon: Inbox, label: "CSV export" },
      { icon: Mail, label: "Email notifications" },
    ],
  },
  {
    id: "pro",
    name: "Operator",
    tagline: "For consultants, indie hackers, and small teams shipping forms weekly.",
    price: "₹499",
    cadence: "per creator / month",
    cta: { label: "Start demo session", href: "/dashboard" },
    featured: true,
    badge: "Most popular",
    features: [
      { icon: FileText, label: "Everything in Scout" },
      { icon: BarChart3, label: "Funnel analytics + 7-day trend" },
      { icon: Palette, label: "Custom slugs" },
      { icon: Inbox, label: "Response detail + paginated inbox" },
      { icon: Shield, label: "Rate-limit + honeypot anti-spam" },
    ],
  },
  {
    id: "studio",
    name: "Studio",
    tagline: "For teams running surveys at volume — same engine, larger workloads.",
    price: "₹1,999",
    cadence: "per workspace / month",
    cta: { label: "Try the product", href: "/dashboard" },
    features: [
      { icon: FileText, label: "Everything in Operator" },
      { icon: Inbox, label: "Higher response throughput" },
      { icon: BarChart3, label: "Full historical analytics" },
      { icon: Globe, label: "Public explore listings" },
      { icon: Star, label: "Priority support (on roadmap)" },
    ],
  },
];

const COMPARISON: Array<{
  group: string;
  rows: Array<{ label: string; values: Record<TierId, string | true | false> }>;
}> = [
  // Each row below maps to a feature that EXISTS in the codebase today.
  // Anything that was marketing-only (password forms, custom domain, SSO,
  // multi-seat, webhooks, retention rotation) has been removed from this
  // table. Don't reintroduce a row without wiring the actual implementation.
  {
    group: "Build",
    rows: [
      {
        label: "All 9 field types (text, email, number, select, rating, date…)",
        values: { free: true, pro: true, studio: true },
      },
      {
        label: "Required / optional + per-field validation",
        values: { free: true, pro: true, studio: true },
      },
      {
        label: "Live preview & multi-step flow",
        values: { free: true, pro: true, studio: true },
      },
      {
        label: "Form templates (starter gallery)",
        values: { free: true, pro: true, studio: true },
      },
      {
        label: "Theme gallery (built-in themes)",
        values: { free: true, pro: true, studio: true },
      },
      {
        label: "Custom slugs",
        values: { free: false, pro: true, studio: true },
      },
    ],
  },
  {
    group: "Collect",
    rows: [
      {
        label: "Public + unlisted visibility",
        values: { free: true, pro: true, studio: true },
      },
      {
        label: "Anonymous + email-tagged responses",
        values: { free: true, pro: true, studio: true },
      },
      {
        label: "Rate-limit + honeypot anti-spam",
        values: { free: true, pro: true, studio: true },
      },
      {
        label: "Email notifications (Resend)",
        values: { free: true, pro: true, studio: true },
      },
      {
        label: "Form expiry + response limit",
        values: { free: true, pro: true, studio: true },
      },
    ],
  },
  {
    group: "Measure",
    rows: [
      {
        label: "View → Start → Submit funnel",
        values: { free: true, pro: true, studio: true },
      },
      {
        label: "7-day daily trend chart",
        values: { free: true, pro: true, studio: true },
      },
      {
        label: "Per-response detail view",
        values: { free: true, pro: true, studio: true },
      },
      {
        label: "Response filtering + pagination",
        values: { free: true, pro: true, studio: true },
      },
      {
        label: "CSV export of full answers",
        values: { free: true, pro: true, studio: true },
      },
    ],
  },
  {
    group: "Operate",
    rows: [
      {
        label: "Google OAuth + demo session",
        values: { free: true, pro: true, studio: true },
      },
      {
        label: "Public REST + tRPC APIs (Scalar docs)",
        values: { free: true, pro: true, studio: true },
      },
    ],
  },
];

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Do I need a credit card to try Askly?",
    a: "No. The Scout tier is free forever and the Operator tier ships a 14-day trial with no card. Hit Start demo session on the dashboard to spin up a creator account in one click.",
  },
  {
    q: "Is this a real product or a hackathon submission?",
    a: "Askly was built for the ChaiForms hackathon. The pricing here reflects how this would be packaged as a real SaaS — payment integration is intentionally not wired (see hackathon rules).",
  },
  {
    q: "Can I export my responses?",
    a: "Yes, on every tier. Open any form's Responses inbox and click Export CSV — the file is built server-side from your real data.",
  },
  {
    q: "How does the analytics funnel work?",
    a: "We track three public events: view (form opened), start (first field touched), submit (response posted). The Analytics tab visualises the conversion between each stage plus a 7-day trend.",
  },
  {
    q: "What's the tech stack?",
    a: "Turborepo + Next.js (frontend), Express + tRPC + trpc-to-openapi + Scalar (API), Drizzle ORM on Postgres (data), Zod across the boundary. See README on GitHub.",
  },
];

export default function PricingPage() {
  return (
    <main className="askly-landing min-h-screen">
      <ScrollProgress />
      <div className="askly-landing-grain" aria-hidden />
      <div className="askly-aurora" aria-hidden />
      <Starfield />

      <div className="relative z-10">
        <LandingNav />

        {/* ── Hero ── */}
        <section className="mx-auto max-w-6xl px-5 pb-12 pt-20 text-center sm:pt-28">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-amber-200/30 bg-amber-100/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-amber-100"
          >
            <Sparkles className="size-3" />
            Pricing · No card to start
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            className="mt-5 text-balance text-4xl font-semibold tracking-tight text-stone-50 sm:text-6xl"
          >
            Pay only when forms{" "}
            <span className="askly-headline-shimmer">earn their keep.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="mx-auto mt-4 max-w-2xl text-balance text-base text-stone-300/85 sm:text-lg"
          >
            Three tiers. Real limits. No hidden seat math, no surprise overages.
            Start free, upgrade when the inbox fills up.
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-5 flex items-center justify-center gap-3 text-xs text-stone-400/80"
          >
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-3 text-emerald-300" />
              No card required
            </span>
            <span className="text-stone-500/50">·</span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-3 text-emerald-300" />
              Cancel anytime
            </span>
            <span className="text-stone-500/50">·</span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-3 text-emerald-300" />
              Migrate your data freely
            </span>
          </motion.div>
        </section>

        {/* ── Honesty disclaimer ──
            The tier cards exist for the SaaS-shape experience the spec asks
            for, but quotas (form counts, response caps, retention windows)
            are NOT enforced in the API today. Saying so up-front is more
            credible than silently shipping the limits as decoration. */}
        <section className="mx-auto max-w-3xl px-5 pb-6">
          <div className="rounded-md border border-amber-200/25 bg-amber-100/4 px-4 py-3 text-center text-xs text-amber-100/85">
            <strong className="font-semibold text-amber-100">Hackathon MVP:</strong>{" "}
            tier <em className="not-italic text-amber-200">limits</em> (form counts,
            response throughput) are illustrative — every feature listed below is
            available to all demo users. Pricing wiring is intentionally out of scope.
          </div>
        </section>

        {/* ── Tier cards ── */}
        <section className="mx-auto max-w-6xl px-5 pb-16">
          <div className="grid gap-5 md:grid-cols-3">
            {TIERS.map((tier, i) => (
              <motion.div
                key={tier.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className={cn(
                  "askly-card-glass relative flex h-full flex-col overflow-hidden p-6",
                  tier.featured && "ring-1 ring-amber-200/40",
                )}
              >
                {tier.featured ? (
                  <>
                    <div className="askly-scan-line opacity-30" aria-hidden />
                    <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-amber-200/60 to-transparent" />
                  </>
                ) : null}

                {tier.badge ? (
                  <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full border border-amber-200/40 bg-amber-100/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-amber-100">
                    <Star className="size-2.5" />
                    {tier.badge}
                  </span>
                ) : null}

                <div className="relative">
                  <p className="askly-section-eyebrow">{tier.name}</p>
                  <p className="mt-3 text-sm text-stone-300/80">{tier.tagline}</p>

                  <div className="mt-6 flex items-baseline gap-2">
                    <span className="text-5xl font-semibold tracking-tight text-stone-50">
                      {tier.price}
                    </span>
                    {tier.id === "free" ? null : (
                      <span className="text-xs text-stone-400/70">/ mo</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-stone-400/70">{tier.cadence}</p>

                  <Button
                    asChild
                    className={cn(
                      "mt-6 w-full justify-center gap-2",
                      tier.featured
                        ? "askly-cta-glow bg-amber-100 text-stone-900 hover:bg-amber-50"
                        : "border border-stone-300/30 bg-stone-100/4 text-stone-100 hover:bg-stone-100/10",
                    )}
                  >
                    <Link href={tier.cta.href}>
                      {tier.cta.label}
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>

                  <div className="my-5 h-px bg-stone-300/10" />

                  <ul className="space-y-2.5 text-sm text-stone-200/90">
                    {tier.features.map((f) => (
                      <li key={f.label} className="flex items-start gap-2.5">
                        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border border-emerald-300/25 bg-emerald-300/8 text-emerald-200">
                          <Check className="size-3" />
                        </span>
                        <span>{f.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            ))}
          </div>

          <p className="mt-6 text-center text-xs text-stone-400/65">
            Prices in INR. USD pricing on request.{" "}
            <Link href="/dashboard" className="text-amber-200/85 underline-offset-2 hover:underline">
              Try the product first
            </Link>{" "}
            — sign-in is one click.
          </p>
        </section>

        {/* ── Comparison table ── */}
        <section className="mx-auto max-w-6xl px-5 pb-20">
          <div className="askly-card-glass overflow-hidden">
            <div className="border-b border-stone-300/10 px-5 py-3">
              <p className="askly-section-eyebrow">Compare what&apos;s included</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-300/10 text-[10px] uppercase tracking-[0.16em] text-stone-400/70">
                    <th className="px-5 py-3 font-medium">Feature</th>
                    {TIERS.map((t) => (
                      <th
                        key={t.id}
                        className={cn(
                          "px-5 py-3 text-center font-medium",
                          t.featured && "text-amber-200",
                        )}
                      >
                        {t.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((group) => (
                    <ComparisonGroup key={group.group} group={group} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="mx-auto max-w-3xl px-5 pb-20">
          <div className="mb-6 flex items-center justify-center gap-2">
            <CircleHelp className="size-4 text-amber-200/85" />
            <p className="askly-section-eyebrow">Frequently asked</p>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <motion.details
                key={faq.q}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.35, delay: i * 0.04 }}
                className="askly-card-glass group p-4 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-stone-100">
                  {faq.q}
                  <span className="grid size-6 shrink-0 place-items-center rounded-full border border-stone-300/20 bg-stone-100/4 text-stone-300 transition group-open:rotate-180">
                    <ArrowRight className="size-3 rotate-90" />
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-stone-300/80">
                  {faq.a}
                </p>
              </motion.details>
            ))}
          </div>
        </section>

        {/* ── Final CTA strip ── */}
        <section className="mx-auto max-w-6xl px-5 pb-20">
          <div className="askly-card-glass relative overflow-hidden p-8 text-center sm:p-12">
            <div className="askly-scan-line opacity-25" aria-hidden />
            <div className="relative">
              <div className="mx-auto grid size-14 place-items-center rounded-full border border-amber-200/30 bg-amber-100/8 text-amber-100">
                <Rocket className="size-6" />
              </div>
              <h2 className="mt-5 text-balance text-3xl font-semibold tracking-tight text-stone-50 sm:text-4xl">
                Skip the pricing page. Just try the product.
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm text-stone-300/80">
                One-click demo session. Real backend, seeded data, real funnel.
                Decide later.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Button
                  asChild
                  size="lg"
                  className="askly-cta-glow gap-2 bg-amber-100 text-stone-900 hover:bg-amber-50"
                >
                  <Link href="/dashboard">
                    <LayoutDashboard className="size-4" />
                    Start demo session
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="gap-2 border-stone-300/30 bg-stone-100/4 text-stone-100 hover:bg-stone-100/10"
                >
                  <Link href="/explore">
                    <Zap className="size-4" />
                    See live forms
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <LandingFooter />
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────

function ComparisonGroup({
  group,
}: {
  group: (typeof COMPARISON)[number];
}) {
  return (
    <>
      <tr className="bg-stone-100/2">
        <td
          colSpan={4}
          className="px-5 py-2.5 text-[10px] uppercase tracking-[0.16em] text-stone-400/85"
        >
          {group.group}
        </td>
      </tr>
      {group.rows.map((row, i) => (
        <tr
          key={row.label}
          className={cn(
            i % 2 === 0 ? "bg-transparent" : "bg-stone-100/2",
            "border-t border-stone-300/8",
          )}
        >
          <td className="px-5 py-3 text-stone-200">{row.label}</td>
          {(["free", "pro", "studio"] as const).map((tierId) => {
            const value = row.values[tierId];
            return (
              <td
                key={tierId}
                className={cn(
                  "px-5 py-3 text-center",
                  tierId === "pro" && "bg-amber-100/3",
                )}
              >
                {value === true ? (
                  <Check className="mx-auto size-4 text-emerald-300" />
                ) : value === false ? (
                  <Minus className="mx-auto size-4 text-stone-500/60" />
                ) : (
                  <span className="font-mono text-xs text-stone-100/90 tabular-nums">
                    {value}
                  </span>
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
