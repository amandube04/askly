import Link from "next/link";
import { Compass, LayoutDashboard } from "lucide-react";
import { Button } from "~/components/ui/button";
import { AsklyLogo } from "~/components/branding/askly-logo";

export function LandingNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-stone-300/10 bg-[#0b0d14]/70 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link href="/" className="text-stone-100">
          <AsklyLogo />
        </Link>

        <div className="hidden items-center gap-1 text-sm text-stone-300/85 md:flex">
          {/* Absolute path + hash so these work from any page (explore, pricing,
              etc.). Plain "#features" only scrolls within the current page —
              which silently no-ops on /explore where that section doesn't exist. */}
          <Link href="/#features" className="rounded-md px-3 py-1.5 hover:text-stone-100">
            Features
          </Link>
          <Link href="/#preview" className="rounded-md px-3 py-1.5 hover:text-stone-100">
            Preview
          </Link>
          <Link href="/pricing" className="rounded-md px-3 py-1.5 hover:text-stone-100">
            Pricing
          </Link>
          <Link href="/explore" className="rounded-md px-3 py-1.5 hover:text-stone-100">
            Explore
          </Link>
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noreferrer"
            className="rounded-md px-3 py-1.5 hover:text-stone-100"
          >
            API Docs
          </a>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" className="hidden text-stone-200 hover:text-stone-50 sm:inline-flex">
            <Link href="/explore">
              <Compass className="size-4" />
              Explore
            </Link>
          </Button>
          <Button asChild className="bg-amber-100 text-stone-900 hover:bg-amber-50">
            <Link href="/dashboard">
              <LayoutDashboard className="size-4" />
              Open Dashboard
            </Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}
