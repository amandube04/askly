import Link from "next/link";
import { ArrowRight, Github, Mail } from "lucide-react";
import { Button } from "~/components/ui/button";
import { AsklyLogoMark } from "~/components/branding/askly-logo";

const PRODUCT_LINKS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Pricing", href: "/pricing" },
  { label: "Explore forms", href: "/explore" },
  { label: "New form", href: "/dashboard/new" },
  { label: "Features", href: "#features" },
];

const RESOURCE_LINKS = [
  { label: "API docs", href: "http://localhost:8000/docs", external: true },
  { label: "OpenAPI schema", href: "http://localhost:8000/openapi.json", external: true },
  { label: "GitHub", href: "https://github.com", external: true },
  { label: "Contact", href: "mailto:hello@askly.dev", external: true },
];

const TECH_STACK = [
  "Next.js 16",
  "tRPC 11",
  "Drizzle ORM",
  "Postgres",
  "Tailwind 4",
  "shadcn/ui",
  "Framer Motion",
  "Zod",
  "Google OAuth",
];

export function LandingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative mx-auto max-w-6xl px-5 pb-12 pt-10">
      {/* Top CTA card */}
      <div className="askly-card-glass relative overflow-hidden p-8 sm:p-12">
        <div className="askly-scan-line opacity-50" aria-hidden />
        <div className="relative grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-3">
            <p className="askly-section-eyebrow">Ship it</p>
            <h2 className="text-3xl font-semibold text-stone-50 sm:text-4xl">
              Build your first form in under two minutes.
            </h2>
            <p className="max-w-xl text-stone-300/80">
              Demo login is one click. The full backend pipeline — auth, schema,
              submission, analytics — is already running.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
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
              className="border-stone-300/30 bg-stone-100/5 text-stone-100 hover:bg-stone-100/10"
            >
              <Link href="/explore">Browse forms</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Main footer grid */}
      <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <AsklyLogoMark size={36} />
            <span className="text-base font-semibold tracking-tight text-stone-50">
              Askly
            </span>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-stone-300/70">
            A type-safe form stack. Build dynamic forms, publish them, and watch
            the signal come back in real time — without stitching three SaaS
            tools together.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="grid size-8 place-items-center rounded-md border border-stone-300/15 bg-stone-100/3 text-stone-300 transition hover:border-amber-200/40 hover:text-amber-100"
              aria-label="GitHub"
            >
              <Github className="size-3.5" />
            </a>
            <a
              href="mailto:hello@askly.dev"
              className="grid size-8 place-items-center rounded-md border border-stone-300/15 bg-stone-100/3 text-stone-300 transition hover:border-amber-200/40 hover:text-amber-100"
              aria-label="Contact"
            >
              <Mail className="size-3.5" />
            </a>
          </div>
        </div>

        <div className="space-y-3">
          <p className="askly-section-eyebrow">Product</p>
          <ul className="space-y-2 text-sm">
            {PRODUCT_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-stone-300/80 transition hover:text-amber-100"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <p className="askly-section-eyebrow">Resources</p>
          <ul className="space-y-2 text-sm">
            {RESOURCE_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  target={link.external ? "_blank" : undefined}
                  rel={link.external ? "noreferrer" : undefined}
                  className="text-stone-300/80 transition hover:text-amber-100"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <p className="askly-section-eyebrow">Built with</p>
          <div className="flex flex-wrap gap-1.5">
            {TECH_STACK.map((tech) => (
              <span
                key={tech}
                className="rounded-md border border-stone-300/15 bg-stone-100/3 px-2 py-0.5 text-[11px] text-stone-300/85"
              >
                {tech}
              </span>
            ))}
          </div>
          <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-emerald-300/20 bg-emerald-300/5 px-2 py-1 text-[11px] text-emerald-200">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-300" />
            All systems operational
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="askly-divider mt-10" />

      {/* Bottom row */}
      <div className="mt-5 flex flex-col items-center justify-between gap-3 text-xs text-stone-400/70 sm:flex-row">
        <div>© {year} Askly. Built for shipping, not for slides.</div>
        <div className="flex items-center gap-4">
          <span>v1.0.0</span>
          <Link href="/" className="hover:text-stone-200">
            Privacy
          </Link>
          <Link href="/" className="hover:text-stone-200">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
