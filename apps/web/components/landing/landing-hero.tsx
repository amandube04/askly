"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BarChart3, Lock, Sparkles, Zap } from "lucide-react";
import { Button } from "~/components/ui/button";

interface LandingHeroProps {
  backendHealthy: boolean;
  publicFormCount: number;
}

const HEADLINE_TEXT = "The form stack that actually ships.";

const TRANSMISSION_LOG = [
  { id: "trx_8421", label: "form.submission.received", meta: "node • us-east-1" },
  { id: "trx_8420", label: "form.view.tracked", meta: "node • eu-west-2" },
  { id: "trx_8419", label: "analytics.funnel.updated", meta: "rate 87%" },
  { id: "trx_8418", label: "schema.validator.compiled", meta: "fields 12" },
  { id: "trx_8417", label: "form.submission.received", meta: "node • ap-south-1" },
  { id: "trx_8416", label: "email.queue.processed", meta: "batch 240" },
  { id: "trx_8415", label: "form.publish.broadcast", meta: "visibility public" },
];

export function LandingHero({ backendHealthy, publicFormCount }: LandingHeroProps) {
  const shouldReduceMotion = useReducedMotion();
  const words = HEADLINE_TEXT.split(" ");
  const [feedOffset, setFeedOffset] = useState(0);

  useEffect(() => {
    if (shouldReduceMotion) return;
    const handle = setInterval(() => {
      setFeedOffset((prev) => (prev + 1) % TRANSMISSION_LOG.length);
    }, 2400);
    return () => clearInterval(handle);
  }, [shouldReduceMotion]);

  const visibleFeed = Array.from({ length: 4 }, (_, i) => {
    const index = (feedOffset + i) % TRANSMISSION_LOG.length;
    return { ...TRANSMISSION_LOG[index]!, key: `${feedOffset}-${i}` };
  });

  const fadeUp = (delay = 0) => ({
    initial: shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] as const },
  });

  return (
    <section className="relative mx-auto max-w-6xl px-5 pt-20 pb-16 sm:pt-28 sm:pb-24">
      <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-7">
          <motion.div {...fadeUp(0)} className="flex flex-wrap items-center gap-2">
            <motion.span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] ${
                backendHealthy
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                  : "border-amber-400/30 bg-amber-400/10 text-amber-200"
              }`}
              animate={
                shouldReduceMotion
                  ? undefined
                  : { boxShadow: ["0 0 0 0 rgba(110, 231, 183, 0)", "0 0 0 6px rgba(110, 231, 183, 0)"] }
              }
              transition={
                shouldReduceMotion
                  ? undefined
                  : { duration: 2.4, repeat: Infinity, ease: "easeOut" }
              }
            >
              <motion.span
                className={`size-1.5 rounded-full ${
                  backendHealthy ? "bg-emerald-300" : "bg-amber-300"
                }`}
                animate={
                  shouldReduceMotion
                    ? undefined
                    : { opacity: [0.6, 1, 0.6], scale: [1, 1.25, 1] }
                }
                transition={
                  shouldReduceMotion
                    ? undefined
                    : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
                }
              />
              {backendHealthy ? "Backend online" : "Backend warming up"}
            </motion.span>
          </motion.div>

          <h1 className="text-balance text-5xl font-semibold leading-[1.05] sm:text-6xl lg:text-7xl">
            {words.map((word, index) => (
              <motion.span
                key={`${word}-${index}`}
                className="askly-headline-shimmer mr-[0.25em] inline-block"
                initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.7,
                  delay: 0.15 + index * 0.08,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {word}
              </motion.span>
            ))}
          </h1>

          <motion.p
            {...fadeUp(0.15 + words.length * 0.08 + 0.05)}
            className="max-w-xl text-lg text-stone-300/85 sm:text-xl"
          >
            Askly is a typeform-grade form builder with a schema-driven dynamic engine,
            tRPC end-to-end types, baked-in analytics, and a publishing flow you can
            demo in 60 seconds.
          </motion.p>

          <motion.div
            {...fadeUp(0.15 + words.length * 0.08 + 0.15)}
            className="flex flex-wrap items-center gap-3"
          >
            <Button
              asChild
              size="lg"
              className="askly-cta-glow bg-amber-100 text-stone-900 hover:bg-amber-50"
            >
              <Link href="/dashboard">
                Launch Dashboard
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-stone-300/30 bg-stone-100/5 text-stone-100 hover:bg-stone-100/10 hover:text-stone-50"
            >
              <Link href="/explore">Browse public forms</Link>
            </Button>
          </motion.div>

          <motion.div
            {...fadeUp(0.15 + words.length * 0.08 + 0.25)}
            className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2 text-xs text-stone-300/70"
          >
            <span className="flex items-center gap-2">
              <Zap className="size-3.5 text-amber-200/90" />
              tRPC end-to-end types
            </span>
            <span className="flex items-center gap-2">
              <BarChart3 className="size-3.5 text-amber-200/90" />
              Funnel + drop-off analytics
            </span>
            <span className="flex items-center gap-2">
              <Lock className="size-3.5 text-amber-200/90" />
              Honeypot + rate limit defenses
            </span>
            {publicFormCount > 0 ? (
              <span className="flex items-center gap-2">
                <Sparkles className="size-3.5 text-amber-200/90" />
                {publicFormCount} live demo form{publicFormCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </motion.div>
        </div>

        <motion.div
          className="relative"
          initial={shouldReduceMotion ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="askly-card-glass askly-breathe relative w-full overflow-hidden p-6">
            <div className="absolute inset-0 askly-orbit-mini opacity-40" aria-hidden />
            <div className="askly-scan-line" aria-hidden />

            <div className="relative space-y-5">
              <div className="flex items-center justify-between">
                <p className="askly-section-eyebrow">Live Telemetry</p>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-emerald-200">
                  <motion.span
                    className="size-1.5 rounded-full bg-emerald-300"
                    animate={shouldReduceMotion ? undefined : { opacity: [0.5, 1, 0.5], scale: [1, 1.3, 1] }}
                    transition={shouldReduceMotion ? undefined : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                  />
                  Streaming
                </span>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-stone-50">
                  Real submissions, hitting the API
                </h3>
                <p className="mt-1.5 text-sm text-stone-300/75">
                  Every event below is the shape your tRPC routers actually emit.
                </p>
              </div>

              <div className="rounded-lg border border-stone-300/15 bg-stone-950/50 p-3">
                <div className="flex items-center justify-between border-b border-stone-300/10 pb-2 text-[10px] uppercase tracking-[0.16em] text-stone-300/55">
                  <span>event_id</span>
                  <span>signal</span>
                </div>

                <ul className="mt-2 space-y-1.5 font-mono text-[11px]">
                  {visibleFeed.map((entry, index) => (
                    <motion.li
                      key={entry.key}
                      className="flex items-center justify-between gap-3"
                      initial={shouldReduceMotion ? { opacity: 1, x: 0 } : { opacity: 0, y: -6 }}
                      animate={{ opacity: 1 - index * 0.18, y: 0 }}
                      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span className="inline-block size-1.5 shrink-0 rounded-full bg-amber-200" />
                        <span className="truncate text-amber-100/85">{entry.id}</span>
                        <span className="truncate text-stone-300/65">{entry.label}</span>
                      </span>
                      <span className="shrink-0 text-stone-400/60">{entry.meta}</span>
                    </motion.li>
                  ))}
                </ul>

                <div className="mt-2 flex items-center justify-between border-t border-stone-300/10 pt-2 text-[10px] uppercase tracking-[0.16em] text-stone-300/45">
                  <span className="askly-blink-cursor">live</span>
                  <span>v1.0 · drizzle + trpc</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
