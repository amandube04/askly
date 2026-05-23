"use client";

import { useEffect, useState } from "react";

/**
 * Render a human "X minutes ago" / "5d ago" / "May 22" string.
 *
 * Renders a stable placeholder (default "…") during SSR + first client render,
 * then swaps to the real value on the next tick. This avoids Next.js hydration
 * mismatch warnings caused by `Date.now()` returning slightly different values
 * on the server and client — e.g. server says "59m ago" and client says "1h
 * ago" 500ms later during hydration.
 */
export function RelativeTime({
  date,
  placeholder = "…",
  className,
}: {
  date: Date | string | null | undefined;
  placeholder?: string;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <span className={className}>{placeholder}</span>;
  return <span className={className}>{formatRelative(date)}</span>;
}

/**
 * Same defer-to-client pattern for absolute timestamps that depend on the
 * user's locale (which the server can't know).
 */
export function AbsoluteTime({
  date,
  placeholder = "…",
  className,
  options,
}: {
  date: Date | string | null | undefined;
  placeholder?: string;
  className?: string;
  options?: Intl.DateTimeFormatOptions;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !date) return <span className={className}>{placeholder}</span>;
  const d = date instanceof Date ? date : new Date(date);
  return (
    <span className={className}>
      {d.toLocaleString(undefined, options ?? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
    </span>
  );
}

export function formatRelative(input: Date | string | null | undefined): string {
  if (!input) return "—";
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "—";

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
