"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { pollMemories } from "@/app/actions";
import { ContestedPairCard } from "@/components/contested-pair";
import { Skeleton } from "@/components/ui/skeleton";
import { setMode } from "@/lib/mode-store";
import { contestedPairs } from "@/lib/resolve";
import type { FeedPayload } from "@/lib/types";

export function ContestedList({ canWrite }: { canWrite: boolean }) {
  const [payload, setPayload] = useState<FeedPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    pollMemories().then((next) => {
      if (cancelled) return;
      setPayload(next);
      setLoading(false);
      setMode({ mode: next.mode, reason: next.modeReason, lastGoodAt: next.fetchedAt });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Re-read after a resolution is written, so the pair disappears. */
  const refresh = useCallback(async () => {
    const next = await pollMemories();
    setPayload(next);
    setMode({ mode: next.mode, reason: next.modeReason, lastGoodAt: next.fetchedAt });
  }, []);

  const records = useMemo(() => payload?.records ?? [], [payload]);
  const byId = useMemo(
    () => new Map(records.map((r) => [r.memoryBlobId as string, r])),
    [records]
  );
  const pairs = useMemo(() => contestedPairs(records), [records]);

  if (loading) {
    return (
      <div className="flex flex-col gap-[var(--s-4)]">
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }

  if (pairs.length === 0) {
    return (
      <div className="panel-recessed p-[var(--s-6)]">
        <p className="text-[var(--t-base)]">Nothing is contested right now.</p>
        <p className="mt-[var(--s-3)] max-w-[68ch] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-700)]">
          A pair is flagged when two team-scoped memories written by different
          people come back semantically close and neither names the other as
          superseded. A newer memory never wins on recency alone — that is what
          stops a teammate&apos;s stale note from quietly overwriting a considered
          decision.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="label mb-[var(--s-5)] normal-case tracking-normal">
        {pairs.length} {pairs.length === 1 ? "pair" : "pairs"} awaiting a
        decision. Resolving always writes a new memory; nothing is ever deleted.
      </p>

      {pairs.map(({ a, b }) => {
        const left = byId.get(a);
        const right = byId.get(b);
        if (!left || !right) return null;
        return (
          <ContestedPairCard
            key={`${a}::${b}`}
            left={left}
            right={right}
            canWrite={canWrite}
            onResolved={() => void refresh()}
          />
        );
      })}
    </>
  );
}
