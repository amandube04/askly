"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { Button } from "~/components/ui/button";

interface PublicFormSummary {
  id: string;
  title: string;
  slug: string;
}

interface LandingPublicFormsProps {
  forms: PublicFormSummary[];
}

export function LandingPublicForms({ forms }: LandingPublicFormsProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <section className="relative mx-auto max-w-6xl px-5 py-20">
      <motion.div
        className="mb-8 flex flex-wrap items-end justify-between gap-4"
        initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="max-w-2xl">
          <p className="askly-section-eyebrow">Live on the platform</p>
          <h2 className="mt-2 text-3xl font-semibold text-stone-50 sm:text-4xl">
            Real published forms — click to fill one.
          </h2>
          <p className="mt-3 text-stone-300/80">
            Below is whatever creators have published as public right now. Pick any
            form, fill it, and watch the response land in the dashboard.
          </p>
        </div>
        <Button
          asChild
          variant="outline"
          className="border-stone-300/25 bg-stone-100/5 text-stone-100 hover:bg-stone-100/10"
        >
          <Link href="/explore">
            See all
            <ArrowUpRight className="size-4" />
          </Link>
        </Button>
      </motion.div>

      {forms.length === 0 ? (
        <motion.div
          className="askly-card-glass p-8 text-center"
          initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="text-base font-medium text-stone-100">No public forms yet.</p>
          <p className="mt-2 text-sm text-stone-300/80">
            Start a demo session in the dashboard, build a form, and flip visibility
            to public — it will show up here automatically.
          </p>
          <Button
            asChild
            className="askly-cta-glow mt-5 bg-amber-100 text-stone-900 hover:bg-amber-50"
          >
            <Link href="/dashboard">Open Dashboard</Link>
          </Button>
        </motion.div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {forms.slice(0, 6).map((form, index) => (
            <motion.div
              key={form.id}
              initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{
                duration: 0.5,
                delay: (index % 3) * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <Link
                href={`/forms/${form.slug}`}
                className="askly-card-glass askly-card-glass-hover group flex h-full flex-col gap-3 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base font-semibold text-stone-50 group-hover:text-amber-50">
                    {form.title}
                  </p>
                  <ArrowUpRight className="size-4 shrink-0 text-stone-300/60 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-amber-200" />
                </div>
                <p className="text-xs text-stone-300/65">/forms/{form.slug}</p>
                <span className="mt-auto inline-flex w-fit items-center gap-1 rounded-full border border-emerald-300/25 bg-emerald-300/5 px-2 py-0.5 text-[11px] text-emerald-200">
                  <span className="size-1.5 rounded-full bg-emerald-300" />
                  Published
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}
