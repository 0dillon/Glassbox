"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { pollMemories } from "@/app/actions";
import { CaptureBox } from "@/components/capture-box";
import { JoinedNotice } from "@/components/joined-notice";
import { MemoryTile } from "@/components/memory-tile";
import { ScopeFilter } from "@/components/scope-filter";
import { StatStrip } from "@/components/stat-strip";
import { Skeleton } from "@/components/ui/skeleton";
import { setMode } from "@/lib/mode-store";
import {
  applyAuthorFilter,
  applyScopeFilter,
  type ScopeFilter as ScopeFilterValue,
} from "@/lib/resolve";
import { parseHeader } from "@/lib/header";
import type { FeedPayload, MemoryRecord } from "@/lib/types";

/** Section 2 — the client polls every 6 seconds. That is how another machine's write arrives. */
const POLL_MS = 6000;
/** How long a newly arrived tile carries its --signal left bar. */
const FRESH_MS = 6000;

export function Feed({
  namespaces,
  defaultScope,
  defaultScopeFromEnv,
  canWrite,
  canReadText,
  viewer,
  accountId,
  disabledReason,
}: {
  namespaces: string[];
  defaultScope: "mine" | "team";
  defaultScopeFromEnv: boolean;
  canWrite: boolean;
  canReadText: boolean;
  viewer: string | null;
  accountId: string | null;
  disabledReason: string | null;
}) {
  const [payload, setPayload] = useState<FeedPayload | null>(null);
  const [optimistic, setOptimistic] = useState<MemoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [scope, setScope] = useState<ScopeFilterValue>("all");
  const [author, setAuthor] = useState<string | null>(null);
  const [showSuperseded, setShowSuperseded] = useState(false);

  // Client clock, so relative times do not drift against a server render.
  const [now, setNow] = useState(() => Date.now());

  const seenIds = useRef<Set<string> | null>(null);
  /** True while a sweep is in flight, so ticks cannot overlap. */
  const inFlight = useRef(false);
  // Freshness is state rather than a ref, so the render pass reads it purely
  // and a tile stops being "fresh" on the next clock update rather than
  // whenever React happens to re-render.
  const [freshIds, setFreshIds] = useState<Record<string, number>>({});

  const tick = useCallback(async () => {
    // A sweep against the live relayer takes seconds, sometimes longer than the
    // poll interval. Without this guard the passes stack up, each one adding
    // load at exactly the moment the service is already slow.
    if (inFlight.current) return;
    inFlight.current = true;

    let next: FeedPayload;
    try {
      next = await pollMemories();
    } finally {
      inFlight.current = false;
    }

    const at = Date.now();

    setPayload(next);
    setLoading(false);
    setNow(at);

    setMode({
      mode: next.mode,
      reason: next.modeReason,
      lastGoodAt: next.records.length > 0 || next.mode === "FULL" ? next.fetchedAt : null,
    });

    // First load establishes the baseline; nothing animates as "new".
    if (seenIds.current === null) {
      seenIds.current = new Set(next.records.map((r) => r.memoryBlobId as string));
    } else {
      const arrived: Record<string, number> = {};
      for (const r of next.records) {
        if (!seenIds.current.has(r.memoryBlobId)) {
          seenIds.current.add(r.memoryBlobId);
          arrived[r.memoryBlobId] = at;
        }
      }
      if (Object.keys(arrived).length > 0) {
        setFreshIds((prev) => ({ ...prev, ...arrived }));
      }
    }

    // Drop optimistic tiles that the sweep has now confirmed.
    setOptimistic((prev) =>
      prev.filter((o) => !next.records.some((r) => r.memoryBlobId === o.memoryBlobId))
    );
  }, []);

  useEffect(() => {
    if (!canReadText) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    let cancelled = false;

    const run = () => {
      if (cancelled) return;
      void tick();
    };

    // Deferred so the first sweep is not a synchronous state update in an effect.
    queueMicrotask(run);
    const id = window.setInterval(run, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [canReadText, tick]);

  const records = useMemo(() => {
    const base = payload?.records ?? [];
    // Optimistic tiles sit on top so the interface never appears to hang.
    return [...optimistic, ...base];
  }, [payload, optimistic]);

  const visible = useMemo(() => {
    let out = applyScopeFilter(records, scope, viewer);
    out = applyAuthorFilter(out, author);
    if (!showSuperseded) out = out.filter((r) => !r.supersededBy);
    return out;
  }, [records, scope, author, showSuperseded, viewer]);

  const byId = useMemo(
    () => new Map(records.map((r) => [r.memoryBlobId as string, r])),
    [records]
  );

  const otherAuthors = useMemo(() => {
    const others = new Set(
      records.filter((r) => r.author !== viewer && r.author !== "unknown").map((r) => r.author)
    );
    return others;
  }, [records, viewer]);

  const othersCount = useMemo(
    () => records.filter((r) => r.author !== viewer && r.author !== "unknown").length,
    [records, viewer]
  );

  function onRecorded(memoryBlobId: string, stored: string, namespace: string) {
    // Insert an optimistic tile immediately. It is replaced by the real record
    // on the next sweep, matched by memory blob id.
    const parsed = parseHeader(stored);
    setOptimistic((prev) => [
      {
        memoryBlobId: memoryBlobId as MemoryRecord["memoryBlobId"],
        body: parsed.body,
        raw: stored,
        scope: parsed.fields?.scope ?? "unscoped",
        author: parsed.fields?.author ?? "unknown",
        writtenAt: parsed.fields?.ts ?? null,
        namespace,
        supersedes: parsed.fields?.supersedes ?? null,
        supersededBy: null,
        contestedWith: [],
        attachmentBlobId: parsed.fields?.src ?? null,
        memoryId: null,
        sizeBytes: null,
        status: "unknown",
        endEpoch: null,
        expiresAt: null,
        headerOk: parsed.headerOk,
        source: "optimistic",
      },
      ...prev,
    ]);
    seenIds.current?.add(memoryBlobId);
    setFreshIds((prev) => ({ ...prev, [memoryBlobId]: Date.now() }));
  }

  const isFresh = (id: string) => {
    const at = freshIds[id];
    return typeof at === "number" && now - at < FRESH_MS;
  };

  return (
    <>
      <CaptureBox
        namespaces={namespaces}
        defaultScope={defaultScope}
        defaultScopeFromEnv={defaultScopeFromEnv}
        canWrite={canWrite}
        disabledReason={disabledReason}
        onRecorded={onRecorded}
      />

      {othersCount > 0 && otherAuthors.size > 0 ? (
        <JoinedNotice
          accountId={accountId}
          memories={othersCount}
          people={otherAuthors.size}
        />
      ) : null}

      <StatStrip
        memories={records.length}
        authors={payload?.authors.length ?? 0}
        contested={payload?.contestedCount ?? 0}
        superseded={payload?.supersededCount ?? 0}
      />

      <ScopeFilter
        scope={scope}
        onScopeChange={setScope}
        author={author}
        onAuthorChange={setAuthor}
        authors={payload?.authors ?? []}
        showSuperseded={showSuperseded}
        onShowSupersededChange={setShowSuperseded}
        supersededCount={payload?.supersededCount ?? 0}
      />

      {payload?.modeReason && payload.mode !== "FULL" ? (
        <p className="mb-[var(--s-5)] border-l-[6px] border-[var(--signal)] pl-[var(--s-4)] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--ink)]">
          {payload.modeReason}
        </p>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-[var(--s-4)]">
          <Skeleton className="h-[120px] w-full" />
          <Skeleton className="h-[120px] w-full" />
          <Skeleton className="h-[120px] w-full" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          canReadText={canReadText}
          hasAny={records.length > 0}
          canWrite={canWrite}
        />
      ) : (
        <div className="flex flex-col gap-[var(--s-4)]">
          {visible.map((r) => {
            const replacement = r.supersededBy ? byId.get(r.supersededBy) : undefined;
            return (
              <MemoryTile
                key={r.memoryBlobId}
                record={r}
                now={now}
                fresh={isFresh(r.memoryBlobId)}
                unscopedReason={
                  r.scope === "unscoped"
                    ? (parseHeader(r.raw).reason ?? undefined)
                    : undefined
                }
                supersededByAuthor={
                  replacement
                    ? { author: replacement.author, writtenAt: replacement.writtenAt }
                    : null
                }
              />
            );
          })}
        </div>
      )}
    </>
  );
}

/** Plain language, not a spinner and not an error. */
function EmptyState({
  canReadText,
  hasAny,
  canWrite,
}: {
  canReadText: boolean;
  hasAny: boolean;
  canWrite: boolean;
}) {
  if (!canReadText) {
    return (
      <div className="panel-recessed p-[var(--s-6)]">
        <p className="text-[var(--t-base)] text-[var(--ink)]">
          This machine has no credential configured, so there is nothing to read
          yet. The notice at the top of the page names exactly what to add and
          where.
        </p>
      </div>
    );
  }

  if (hasAny) {
    return (
      <div className="panel-recessed p-[var(--s-6)]">
        <p className="text-[var(--t-base)] text-[var(--ink)]">
          Nothing matches this filter. Widen the scope or author filter above.
        </p>
      </div>
    );
  }

  return (
    <div className="panel-recessed p-[var(--s-6)]">
      <p className="text-[var(--t-base)] text-[var(--ink)]">
        Nothing recorded yet.
      </p>
      <p className="mt-[var(--s-3)] max-w-[64ch] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-700)]">
        {canWrite
          ? "Record the first decision above — the choice and the reason behind it. Memories your teammates' assistants record will arrive here too, within about ten seconds, with no coordination between your machines."
          : "Recording is disabled on this machine, but memories your teammates record will appear here as soon as they exist."}
      </p>
    </div>
  );
}
