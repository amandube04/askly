"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BarChart3, Boxes, Database, Lock, Send, Shapes } from "lucide-react";
import { Card } from "~/components/ui/card";

const features = [
  {
    icon: Shapes,
    title: "Dynamic schema builder",
    body: "Drag-and-drop fields. Runtime Zod validators are generated from stored definitions, so every field is type-safe on the client, server, and database.",
  },
  {
    icon: Send,
    title: "Typeform-grade submission flow",
    body: "Stepped flow with progress, validation, honeypot protection, and a public/unlisted/unpublished visibility model enforced at the API layer.",
  },
  {
    icon: BarChart3,
    title: "Funnel + analytics, baked in",
    body: "Track view → start → submit per form. Drop-off, daily trend, completion rate — surfaced in the dashboard without a third-party tag.",
  },
  {
    icon: Boxes,
    title: "tRPC end-to-end types",
    body: "Routers expose `auth`, `forms`, `responses`, `analytics`. The Next.js app imports them directly — no codegen step, no drift between client and server.",
  },
  {
    icon: Lock,
    title: "Auth that actually works",
    body: "Demo login for fast judging, Google OAuth for production. HttpOnly session + CSRF cookies, refresh tokens, and protected procedures.",
  },
  {
    icon: Database,
    title: "Drizzle + Postgres",
    body: "Schema-first with migrations and seed scaffolding. Models for users, forms, fields, responses, answers, themes, sessions, events, and email jobs.",
  },
];

export function LandingFeatures() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <section id="features" className="relative mx-auto max-w-6xl px-5 py-20">
      <motion.div
        className="mb-10 max-w-2xl"
        initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="askly-section-eyebrow">What you get</p>
        <h2 className="mt-2 text-3xl font-semibold text-stone-50 sm:text-4xl">
          A complete form pipeline. Not just a UI.
        </h2>
        <p className="mt-3 text-stone-300/80">
          Most form-builder demos hand-wave the backend. Askly ships the whole stack —
          schema, validation, auth, analytics, OpenAPI docs — so the demo holds up
          when judges click around.
        </p>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <motion.div
              key={feature.title}
              initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{
                duration: 0.55,
                delay: (index % 3) * 0.1,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <Card className="askly-card-glass askly-card-glass-hover gap-3 border-0 bg-transparent p-5 shadow-none">
                <div className="flex size-9 items-center justify-center rounded-md border border-amber-200/25 bg-amber-100/5 text-amber-200">
                  <Icon className="size-4" />
                </div>
                <h3 className="text-base font-semibold text-stone-50">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-stone-300/80">{feature.body}</p>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
