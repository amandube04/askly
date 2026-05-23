"use client";

import { Check, ExternalLink, Link2, Loader2, QrCode, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "qrcode";
import { cn } from "~/lib/utils";

/**
 * Generates a QR code data URL on demand. Stays null until first use so the
 * heavy QR rendering isn't paid for forms that no one ever shares via QR.
 * Returns a stable callback + the most-recent data URL.
 */
function useQrCode(url: string) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-render the QR if the URL changes after one was already generated —
  // otherwise the user could see a stale code after editing the slug.
  useEffect(() => {
    if (!dataUrl) return;
    let cancelled = false;
    QRCode.toDataURL(url, {
      width: 256,
      margin: 1,
      color: { dark: "#0c0a09", light: "#fafaf9" },
    })
      .then((next) => {
        if (!cancelled) setDataUrl(next);
      })
      .catch(() => {
        if (!cancelled) setError("Could not regenerate QR code.");
      });
    return () => {
      cancelled = true;
    };
    // dataUrl is intentionally excluded to avoid an infinite loop — we only
    // refresh when the URL changes, not when we just set the new dataUrl.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const generate = async () => {
    if (!url) return;
    setBusy(true);
    setError(null);
    try {
      const next = await QRCode.toDataURL(url, {
        width: 256,
        margin: 1,
        color: { dark: "#0c0a09", light: "#fafaf9" },
      });
      setDataUrl(next);
    } catch {
      setError("Could not generate QR code.");
    } finally {
      setBusy(false);
    }
  };

  return { dataUrl, busy, error, generate };
}

/**
 * Renders a download-able PNG QR code in a small popover anchored to a
 * trigger button. The popover is portalled to `document.body` so it can
 * escape ancestor `overflow-hidden` containers (e.g. the dashboard form
 * cards clip absolutely-positioned children, which previously cut the QR
 * image off below the card edge). Positioning is recomputed on scroll
 * and resize so it tracks the anchor as the page moves.
 */
function QrCodePopover({
  url,
  open,
  onClose,
  filename,
  anchorRef,
}: {
  url: string;
  open: boolean;
  onClose: () => void;
  filename: string;
  // Trigger element the popover should align with. We read its
  // `getBoundingClientRect()` to position the portalled popover.
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const { dataUrl, busy, error, generate } = useQrCode(url);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  // Avoid SSR mismatches: createPortal needs document to exist, so we
  // only render anything after mount on the client.
  const [mounted, setMounted] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Generate the first time the popover opens, not on every parent render.
  useEffect(() => {
    if (open && !dataUrl && !busy) {
      void generate();
    }
    // generate is stable enough; intentionally not in deps to avoid loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dataUrl]);

  // Compute position synchronously after the popover mounts so the first
  // paint already has the correct location (no flash at 0,0). Also
  // recompute on scroll + resize so the popover follows the trigger.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const POPOVER_WIDTH = 288; // matches w-72 below
      const GUTTER = 8; // breathing room from viewport edges
      // Default: align right edge of popover to right edge of trigger,
      // 8px below the trigger. Clamp to the viewport so a popover opened
      // near the right edge doesn't spill offscreen.
      let left = rect.right - POPOVER_WIDTH;
      if (left < GUTTER) left = GUTTER;
      const maxLeft = window.innerWidth - POPOVER_WIDTH - GUTTER;
      if (left > maxLeft) left = maxLeft;
      setPosition({
        top: rect.bottom + GUTTER,
        left,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchorRef]);

  // Click-outside to close. Bound only when open so we don't pay the
  // listener cost on every page. Mouse-down (not click) so the popover
  // can react before any outside button steals focus.
  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open, onClose, anchorRef]);

  if (!open || !mounted || !position) return null;

  const popover = (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="QR code"
      style={{ position: "fixed", top: position.top, left: position.left }}
      className="z-50 w-72 rounded-lg border border-stone-300/20 bg-stone-950/95 p-4 shadow-2xl backdrop-blur"
    >
      <div className="flex items-start justify-between gap-2">
        {/* min-w-0 is REQUIRED here. Flex items default to min-width:auto,
            which means they refuse to shrink below their content's
            intrinsic width — and `truncate` (overflow:hidden +
            text-overflow:ellipsis + nowrap) only kicks in when the
            element actually has a constrained width to overflow against.
            Without min-w-0, the URL just pushes the flex item wider than
            the popover and bleeds out the right edge. */}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400/75">
            Scan to open
          </p>
          <p
            className="mt-0.5 truncate font-mono text-[11px] text-stone-300"
            title={url}
          >
            {url}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close QR code"
          className="grid size-6 shrink-0 place-items-center rounded-md border border-stone-300/15 bg-stone-100/3 text-stone-300 hover:border-rose-300/30 hover:text-rose-200"
        >
          <X className="size-3" />
        </button>
      </div>
      <div className="mt-3 flex items-center justify-center rounded-md bg-stone-50 p-3">
        {busy && !dataUrl ? (
          <Loader2 className="size-6 animate-spin text-stone-700" />
        ) : error ? (
          <p className="text-xs text-rose-400">{error}</p>
        ) : dataUrl ? (
          // `next/image` can't help us here — the QR code is a generated
          // data: URL (base64 PNG) with no external host, no LCP impact,
          // and no bytes to fetch. Using <img> directly is correct and
          // strictly cheaper than routing through the image optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dataUrl}
            alt={`QR code for ${url}`}
            className="size-48 rounded"
          />
        ) : (
          <div className="size-48 animate-pulse rounded bg-stone-200" />
        )}
      </div>
      {dataUrl ? (
        <a
          href={dataUrl}
          download={`${filename}.png`}
          className="mt-3 block w-full rounded-md border border-amber-200/30 bg-amber-200/8 px-2 py-1.5 text-center text-[11px] font-medium text-amber-100 transition hover:bg-amber-200/15"
        >
          Download PNG
        </a>
      ) : null}
    </div>
  );

  // Portal to body so ancestor `overflow-hidden` (e.g. dashboard
  // form-card glass containers) can't clip the popover. Anything
  // ancestor-wise is irrelevant once we're at <body>.
  return createPortal(popover, document.body);
}

/**
 * Returns the public, shareable URL for a form slug, derived from the current
 * browser origin. Falls back to `NEXT_PUBLIC_APP_BASE_URL` and finally a
 * placeholder until the component mounts client-side.
 */
function useFormShareUrl(slug: string): string {
  const [origin, setOrigin] = useState<string>("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  return useMemo(() => {
    const base = origin || process.env.NEXT_PUBLIC_APP_BASE_URL || "";
    return `${base}/forms/${slug}`;
  }, [origin, slug]);
}

/**
 * Compact pill-style component used on dashboard cards. Shows the slug + a
 * copy icon, with a small "Open" anchor on the right. The copy button shows
 * a transient checkmark on success.
 */
export function ShareLinkBar({
  slug,
  disabled,
  className,
}: {
  slug: string;
  disabled?: boolean;
  className?: string;
}) {
  const url = useFormShareUrl(slug);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  // Ref for the QR button — the popover positions itself against the
  // button's bounding rect via getBoundingClientRect(). Needed because
  // the popover renders in a portal at <body> level, so it has no
  // DOM-tree relationship to this bar anymore.
  const qrButtonRef = useRef<HTMLButtonElement | null>(null);

  async function onCopy() {
    if (disabled || !url) return;
    try {
      setBusy(true);
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // fall through — leave silent so we don't break the UI
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-md border border-stone-300/15 bg-stone-100/3 px-2 py-1 text-[11px] text-stone-300/85",
        disabled && "opacity-40",
        className,
      )}
    >
      <Link2 className="size-3 shrink-0 text-amber-200/80" aria-hidden="true" />
      <span className="truncate font-mono text-[11px] text-stone-300/85">
        /forms/{slug}
      </span>

      <button
        type="button"
        onClick={onCopy}
        disabled={disabled}
        title={copied ? "Copied!" : "Copy link"}
        className={cn(
          "ml-1 inline-flex size-5 shrink-0 items-center justify-center rounded transition-colors",
          "hover:bg-amber-200/10 hover:text-amber-100",
          copied && "text-emerald-200",
        )}
      >
        {busy ? (
          <Loader2 className="size-3 animate-spin" />
        ) : copied ? (
          <Check className="size-3" />
        ) : (
          <Link2 className="size-3" />
        )}
        <span className="sr-only">Copy link</span>
      </button>

      <button
        ref={qrButtonRef}
        type="button"
        onClick={() => setQrOpen((open) => !open)}
        disabled={disabled || !url}
        title="Show QR code"
        aria-expanded={qrOpen}
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded text-stone-300/85 transition-colors",
          "hover:bg-amber-200/10 hover:text-amber-100",
          qrOpen && "bg-amber-200/10 text-amber-100",
          disabled && "pointer-events-none",
        )}
      >
        <QrCode className="size-3" />
        <span className="sr-only">Show QR code</span>
      </button>

      <Link
        href={`/forms/${slug}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={disabled}
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded text-stone-300/85 transition-colors",
          "hover:bg-amber-200/10 hover:text-amber-100",
          disabled && "pointer-events-none",
        )}
        title="Open public form in new tab"
      >
        <ExternalLink className="size-3" />
        <span className="sr-only">Open public form</span>
      </Link>

      <QrCodePopover
        url={url}
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        filename={`askly-${slug}-qr`}
        anchorRef={qrButtonRef}
      />
    </div>
  );
}

/**
 * Larger banner used at the top of the form builder when the form is
 * published. Shows the full URL, a prominent Copy button, and Open in new tab.
 */
export function ShareLinkBanner({
  slug,
  isPublished,
  isPublic,
}: {
  slug: string;
  isPublished: boolean;
  isPublic: boolean;
}) {
  const url = useFormShareUrl(slug);
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  // Anchor for the portalled QR popover — see ShareLinkBar for the same
  // pattern. The popover used to be a child of this banner and got
  // clipped by ancestor overflow-hidden; portalling to <body> and
  // positioning by getBoundingClientRect() of this ref escapes that.
  const qrButtonRef = useRef<HTMLButtonElement | null>(null);

  async function onCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // silent
    }
  }

  return (
    <div
      className={cn(
        "askly-card-glass flex flex-col gap-3 p-4 sm:flex-row sm:items-center",
        !isPublished && "opacity-60",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]",
              isPublished
                ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
                : "border-stone-300/20 bg-stone-100/4 text-stone-300/70",
            )}
          >
            <span
              className={cn(
                "size-1 rounded-full",
                isPublished ? "bg-emerald-300" : "bg-stone-400/60",
              )}
            />
            {isPublished ? "Live share link" : "Publish to enable link"}
          </span>
          <span className="rounded-full border border-stone-300/20 bg-stone-100/4 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-stone-300/70">
            {isPublic ? "Public" : "Unlisted"}
          </span>
        </div>

        <p className="mt-2 truncate font-mono text-sm text-stone-100">
          {url || "—"}
        </p>
        <p className="mt-0.5 text-[11px] text-stone-400/75">
          Send this link to respondents. They&apos;ll see your form without
          needing an account.
        </p>
      </div>

      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onCopy}
          disabled={!isPublished}
          className={cn(
            "inline-flex items-center gap-2 rounded-md border border-stone-300/20 bg-stone-100/4 px-3 py-1.5 text-xs font-medium text-stone-100 transition-colors",
            "hover:border-amber-200/40 hover:bg-amber-200/10 hover:text-amber-100",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-stone-100/4 disabled:hover:text-stone-100",
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            {copied ? (
              <motion.span
                key="copied"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                className="inline-flex items-center gap-1.5 text-emerald-200"
              >
                <Check className="size-3.5" />
                Copied
              </motion.span>
            ) : (
              <motion.span
                key="copy"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                className="inline-flex items-center gap-1.5"
              >
                <Link2 className="size-3.5" />
                Copy link
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        <button
          ref={qrButtonRef}
          type="button"
          onClick={() => setQrOpen((open) => !open)}
          disabled={!isPublished}
          aria-expanded={qrOpen}
          className={cn(
            "inline-flex items-center gap-2 rounded-md border border-stone-300/20 bg-stone-100/4 px-3 py-1.5 text-xs font-medium text-stone-100 transition-colors",
            "hover:border-amber-200/40 hover:bg-amber-200/10 hover:text-amber-100",
            qrOpen && "border-amber-200/40 bg-amber-200/10 text-amber-100",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <QrCode className="size-3.5" />
          QR code
        </button>

        <Link
          href={`/forms/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!isPublished}
          className={cn(
            "inline-flex items-center gap-2 rounded-md border border-amber-300/40 bg-amber-300/10 px-3 py-1.5 text-xs font-medium text-amber-100 transition-colors",
            "hover:border-amber-200/60 hover:bg-amber-200/20",
            !isPublished && "pointer-events-none opacity-40",
          )}
        >
          <ExternalLink className="size-3.5" />
          Open public form
        </Link>
      </div>

      <QrCodePopover
        url={url}
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        filename={`askly-${slug}-qr`}
        anchorRef={qrButtonRef}
      />
    </div>
  );
}
