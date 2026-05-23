"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Hash,
  Inbox,
  Loader2,
  Mail,
  PencilLine,
  RefreshCw,
  Search,
  Send,
  X,
} from "lucide-react";
import { GalacticShell } from "~/components/layout/galactic-shell";
import { Button } from "~/components/ui/button";
import { AbsoluteTime, RelativeTime } from "~/components/ui/time";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

// Auth presence hint — see /dashboard/new for the full rationale. OAuth
// users no longer have a session token in localStorage (HttpOnly cookie
// does the auth), so we key off the userId hint instead. The real
// authoritative check happens server-side on the next tRPC call.
const DEMO_USER_STORAGE_KEY = "askly.userId";
const PAGE_SIZE = 20;

export default function ResponsesPage() {
  const params = useParams<{ formId: string }>();
  const router = useRouter();
  const formId = typeof params?.formId === "string" ? params.formId : "";

  const [isHydrated, setIsHydrated] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  // Which response row is currently expanded in the detail drawer. `null`
  // means closed. Drawer mounts only when set, so we don't pay for a query
  // we're not using.
  const [detailResponseId, setDetailResponseId] = useState<string | null>(null);

  useEffect(() => {
    setHasSession(!!window.localStorage.getItem(DEMO_USER_STORAGE_KEY));
    setIsHydrated(true);
  }, []);

  // Debounce search input → query
  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const formQuery = trpc.forms.getMineById.useQuery(
    { formId },
    { enabled: isHydrated && hasSession && formId.length > 0 },
  );

  const responsesQuery = trpc.responses.listByForm.useQuery(
    {
      formId,
      page,
      pageSize: PAGE_SIZE,
      respondentEmailQuery: searchQuery.length > 0 ? searchQuery : undefined,
    },
    {
      enabled: isHydrated && hasSession && formId.length > 0,
      refetchInterval: 20_000,
      placeholderData: (prev) => prev,
    },
  );

  const trpcUtils = trpc.useUtils();

  const onExport = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const result = await trpcUtils.responses.exportCsv.fetch({ formId });
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const items = responsesQuery.data?.items ?? [];
  const total = responsesQuery.data?.total ?? 0;
  const hasMore = responsesQuery.data?.hasMore ?? false;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rangeStart = useMemo(() => (total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1), [page, total]);
  const rangeEnd = useMemo(() => Math.min(page * PAGE_SIZE, total), [page, total]);

  // ── unauth / loading
  if (!isHydrated) {
    return (
      <GalacticShell eyebrow="Inbox" title="Loading…">
        <div className="askly-card-glass h-96 animate-pulse" />
      </GalacticShell>
    );
  }
  if (!hasSession) {
    return (
      <GalacticShell eyebrow="Inbox" title="Authenticate to view responses">
        <div className="askly-card-glass p-8 text-center">
          <p className="text-stone-200">
            You need a creator session to view responses.
          </p>
          <Button
            asChild
            className="askly-cta-glow mt-4 bg-amber-100 text-stone-900 hover:bg-amber-50"
          >
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </GalacticShell>
    );
  }

  const title = formQuery.data?.title ?? "Responses";
  const slug = formQuery.data?.slug;

  return (
    <GalacticShell
      eyebrow="Inbox"
      title={title}
      subtitle={`Incoming responses · auto-refreshes every 20s${slug ? ` · /forms/${slug}` : ""}`}
      actions={
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push("/dashboard")}
            className="border-stone-300/25 bg-stone-100/5 text-stone-200 hover:bg-stone-100/10"
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
          <BuilderTab href={`/dashboard/forms/${formId}`} icon={PencilLine}>
            Editor
          </BuilderTab>
          <BuilderTab href={`/dashboard/analytics/${formId}`} icon={BarChart3}>
            Analytics
          </BuilderTab>
          <Button
            size="sm"
            variant="outline"
            onClick={() => responsesQuery.refetch()}
            disabled={responsesQuery.isFetching}
            className="border-stone-300/25 bg-stone-100/5 text-stone-200 hover:bg-stone-100/10"
          >
            <RefreshCw
              className={cn(
                "size-4",
                responsesQuery.isFetching && "animate-spin",
              )}
            />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={onExport}
            disabled={isExporting || total === 0}
            className="askly-cta-glow gap-1.5 bg-amber-100 text-stone-900 hover:bg-amber-50 disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Exporting…
              </>
            ) : (
              <>
                <Download className="size-4" />
                Export CSV
              </>
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* ── Stats strip ── */}
        <div className="grid gap-3 md:grid-cols-3">
          <StatTile
            label="Total responses"
            value={total}
            icon={Send}
            accent="text-amber-200"
            hint={total === 0 ? "No submissions yet" : `Across all time`}
          />
          <StatTile
            label="On this page"
            value={items.length}
            icon={Inbox}
            accent="text-sky-200"
            hint={
              total === 0
                ? "—"
                : `Showing ${rangeStart}–${rangeEnd} of ${total}`
            }
          />
          <StatTile
            label="Latest"
            value={items[0] ? <RelativeTime date={items[0].submittedAt} /> : "—"}
            icon={Clock}
            accent="text-emerald-200"
            hint={items[0]?.respondentEmail ?? (items[0] ? "Anonymous" : "Waiting on first response")}
          />
        </div>

        {/* ── Search ── */}
        <div className="askly-card-glass flex flex-wrap items-center gap-3 p-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-stone-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Filter by respondent email…"
              className="w-full rounded-md border border-stone-300/15 bg-stone-100/3 py-2 pl-9 pr-9 text-sm text-stone-100 placeholder:text-stone-500 focus:border-amber-200/40 focus:outline-none"
            />
            {searchInput.length > 0 ? (
              <button
                onClick={() => setSearchInput("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-stone-400 hover:bg-stone-100/5 hover:text-stone-200"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
          {searchQuery.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-300/30 bg-amber-300/8 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-amber-200">
              Filtered: {searchQuery}
            </span>
          ) : null}
        </div>

        {/* ── Table ── */}
        <div className="askly-card-glass overflow-hidden">
          {exportError ? (
            <div className="border-b border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">
              {exportError}
            </div>
          ) : null}

          {responsesQuery.isLoading ? (
            <div className="divide-y divide-stone-300/8">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse bg-stone-100/2" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyResponses
              hasFilter={searchQuery.length > 0}
              onClear={() => setSearchInput("")}
              formSlug={slug ?? null}
            />
          ) : (
            <div role="table" className="divide-y divide-stone-300/8">
              {/* Header row */}
              <div
                role="row"
                className="grid grid-cols-[1.6fr_1.4fr_1fr_auto] items-center gap-3 bg-stone-100/2 px-4 py-2.5 text-[10px] uppercase tracking-[0.16em] text-stone-400/75"
              >
                <span>Respondent</span>
                <span>Submitted</span>
                <span>ID</span>
                <span className="text-right">Open</span>
              </div>

              <AnimatePresence initial={false}>
                {items.map((item, i) => (
                  <motion.div
                    key={item.id}
                    role="row"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.2) }}
                    className="group grid grid-cols-[1.6fr_1.4fr_1fr_auto] items-center gap-3 px-4 py-3 transition hover:bg-stone-100/3"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      {item.respondentEmail ? (
                        <>
                          <span className="grid size-7 shrink-0 place-items-center rounded-full border border-amber-200/30 bg-amber-100/8 text-[10px] font-semibold text-amber-100">
                            {item.respondentEmail.charAt(0).toUpperCase()}
                          </span>
                          <span className="truncate text-sm text-stone-100">
                            {item.respondentEmail}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="grid size-7 shrink-0 place-items-center rounded-full border border-stone-300/20 bg-stone-100/4 text-stone-400">
                            <Mail className="size-3" />
                          </span>
                          <span className="truncate text-sm italic text-stone-400/85">
                            Anonymous
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex flex-col text-xs">
                      <RelativeTime
                        date={item.submittedAt}
                        className="text-stone-200"
                      />
                      <AbsoluteTime
                        date={item.submittedAt}
                        className="text-stone-400/65"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 truncate font-mono text-xs text-stone-400/75">
                      <Hash className="size-3 shrink-0" />
                      <span className="truncate">
                        {item.id.slice(0, 8)}
                      </span>
                    </div>

                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => setDetailResponseId(item.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-amber-200/30 bg-amber-100/6 px-2 py-1 text-[10px] uppercase tracking-wider text-amber-100 transition hover:bg-amber-100/12"
                      >
                        View
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {detailResponseId ? (
          <ResponseDetailDrawer
            responseId={detailResponseId}
            onClose={() => setDetailResponseId(null)}
          />
        ) : null}

        {/* ── Pagination ── */}
        {total > PAGE_SIZE ? (
          <div className="flex items-center justify-between text-xs text-stone-400/80">
            <span>
              Showing <span className="text-stone-100">{rangeStart}–{rangeEnd}</span> of{" "}
              <span className="text-stone-100">{total}</span>
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || responsesQuery.isFetching}
                className="border-stone-300/25 bg-stone-100/3 text-stone-200 hover:bg-stone-100/10 disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
                Prev
              </Button>
              <span className="px-2 font-mono tabular-nums text-stone-300">
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasMore || responsesQuery.isFetching}
                className="border-stone-300/25 bg-stone-100/3 text-stone-200 hover:bg-stone-100/10 disabled:opacity-40"
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </GalacticShell>
  );
}

// ──────────────────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  icon: Icon,
  accent,
  hint,
}: {
  label: string;
  value: string | number | React.ReactNode;
  icon: typeof Send;
  accent: string;
  hint: string;
}) {
  return (
    <div className="askly-card-glass p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="askly-section-eyebrow">{label}</p>
        <Icon className={cn("size-4", accent)} />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-stone-50">
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-stone-400/75">{hint}</p>
    </div>
  );
}

function EmptyResponses({
  hasFilter,
  onClear,
  formSlug,
}: {
  hasFilter: boolean;
  onClear: () => void;
  formSlug: string | null;
}) {
  if (hasFilter) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-stone-300">No responses match that filter.</p>
        <Button
          size="sm"
          variant="outline"
          onClick={onClear}
          className="mt-3 border-stone-300/25 bg-stone-100/5 text-stone-200 hover:bg-stone-100/10"
        >
          Clear filter
        </Button>
      </div>
    );
  }
  return (
    <div className="relative grid place-items-center px-6 py-12 text-center">
      <div className="absolute inset-0 askly-orbit-mini opacity-25" aria-hidden />
      <div className="relative max-w-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-full border border-amber-200/30 bg-amber-100/8 text-amber-100">
          <Inbox className="size-5" />
        </div>
        <h3 className="mt-3 text-lg font-semibold text-stone-50">
          Inbox is empty.
        </h3>
        <p className="mt-1.5 text-sm text-stone-400/85">
          When someone submits the form, their response will land here. This
          page auto-refreshes every 20s.
        </p>
        {formSlug ? (
          <Button
            asChild
            size="sm"
            className="askly-cta-glow mt-4 gap-1.5 bg-amber-100 text-stone-900 hover:bg-amber-50"
          >
            <a href={`/forms/${formSlug}`} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              Open the form
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function BuilderTab({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: typeof Inbox;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md border border-stone-300/20 bg-stone-100/3 px-2.5 py-1.5 text-xs text-stone-200 transition hover:border-amber-200/35 hover:bg-amber-100/6 hover:text-amber-100"
    >
      <Icon className="size-3.5" />
      {children}
    </Link>
  );
}

// ──────────────────────────────────────────────────────────────────────────

/**
 * Slide-over drawer that shows a single response's metadata + every answer.
 * Reads the response via `responses.getById`; the form's owner is verified
 * server-side, so opening another creator's response UUID just 404s.
 */
function ResponseDetailDrawer({
  responseId,
  onClose,
}: {
  responseId: string;
  onClose: () => void;
}) {
  const detailQuery = trpc.responses.getById.useQuery(
    { responseId },
    { staleTime: 30_000 },
  );

  // Close on Esc — drawer is modal-ish, the user expects keyboard escape.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const data = detailQuery.data;

  return (
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-stone-950/70 backdrop-blur-sm"
        aria-hidden
      />
      <motion.aside
        key="drawer"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 280 }}
        role="dialog"
        aria-modal="true"
        aria-label="Response detail"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-stone-300/15 bg-[#0b0d14] shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-stone-300/10 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400/65">
              Response detail
            </p>
            <p className="mt-0.5 truncate font-mono text-xs text-stone-300">
              {responseId.slice(0, 8)}…
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail"
            className="grid size-8 place-items-center rounded-md border border-stone-300/15 bg-stone-100/3 text-stone-300 transition hover:border-rose-300/35 hover:text-rose-200"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {detailQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-stone-400">
              <Loader2 className="size-4 animate-spin" />
              Loading response…
            </div>
          ) : detailQuery.error ? (
            <div className="rounded-md border border-rose-300/25 bg-rose-300/5 p-3 text-sm text-rose-200">
              {detailQuery.error.message}
            </div>
          ) : !data ? (
            <p className="text-sm text-stone-400">No response data.</p>
          ) : (
            <div className="space-y-5">
              <section className="space-y-1.5 rounded-md border border-stone-300/15 bg-stone-100/3 p-4">
                <p className="text-[10px] uppercase tracking-[0.16em] text-stone-400/70">
                  Submitted to
                </p>
                <p className="truncate text-sm font-medium text-stone-50">
                  {data.formTitle}
                </p>
                <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                  <div>
                    <p className="text-stone-400/70">Email</p>
                    <p className="mt-0.5 truncate text-stone-100">
                      {data.respondentEmail ?? (
                        <span className="italic text-stone-400/85">Anonymous</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-stone-400/70">Submitted</p>
                    <p className="mt-0.5 text-stone-100">
                      <RelativeTime date={data.submittedAt} />
                    </p>
                    <p className="mt-0.5 text-[10px] text-stone-400/65">
                      <AbsoluteTime date={data.submittedAt} />
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400/70">
                  Answers ({data.answers.length})
                </p>
                <div className="space-y-2">
                  {data.answers.map((answer) => (
                    <AnswerRow key={answer.fieldId} answer={answer} />
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}

function AnswerRow({
  answer,
}: {
  // `value` is z.unknown() which infers to `unknown | undefined` — the
  // server may omit answers entirely for skipped optional fields (in that
  // case AnswerValue's empty-state branch renders "— not answered —").
  answer: {
    fieldId: string;
    fieldKey: string;
    label: string;
    type: string;
    required: boolean;
    value?: unknown;
  };
}) {
  return (
    <div className="rounded-md border border-stone-300/12 bg-stone-100/2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-stone-100">
            {answer.label}
          </p>
          <p className="mt-0.5 truncate font-mono text-[10px] text-stone-400/65">
            {answer.fieldKey} · {answer.type}
            {answer.required ? " · required" : ""}
          </p>
        </div>
      </div>
      <div className="mt-2 text-sm text-stone-200">
        <AnswerValue value={answer.value} type={answer.type} />
      </div>
    </div>
  );
}

function AnswerValue({ value, type }: { value: unknown; type: string }) {
  if (value === null || value === undefined || value === "") {
    return <span className="italic text-stone-500">— not answered —</span>;
  }
  // Multi-select / checkbox arrays as bullet list for readability.
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="italic text-stone-500">— empty —</span>;
    }
    return (
      <ul className="ml-4 list-disc space-y-0.5">
        {value.map((v, i) => (
          <li key={i} className="text-stone-100">
            {String(v)}
          </li>
        ))}
      </ul>
    );
  }
  if (type === "rating" && typeof value === "number") {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="font-mono tabular-nums text-stone-50">{value}</span>
        <span className="text-xs text-stone-400/70">/ rating</span>
      </span>
    );
  }
  if (typeof value === "boolean") {
    return (
      <span className={cn(value ? "text-emerald-200" : "text-stone-400")}>
        {value ? "Yes" : "No"}
      </span>
    );
  }
  // Fallback for unknown shapes — stringify so we never render an object literal.
  const display = typeof value === "object" ? JSON.stringify(value) : String(value);
  return <span className="whitespace-pre-wrap break-words text-stone-100">{display}</span>;
}
