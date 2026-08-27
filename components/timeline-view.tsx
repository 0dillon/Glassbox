"use client";

import { useEffect, useMemo, useState } from "react";

import { pollMemories } from "@/app/actions";
import { MemoryTile } from "@/components/memory-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { absoluteTime, dateOnly } from "@/lib/format";
import { setMode } from "@/lib/mode-store";
import { asOf, sortNewestFirst, timeBounds } from "@/lib/resolve";
import type { FeedPayload } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Section 6, Step 8 — a date slider over the range of header timestamps,
 * filtering entirely client-side. No network request fires while dragging.
 */
export function TimelineView() {
  const [payload, setPayload] = useState<FeedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [position, setPosition] = useState<number | null>(null);

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

  const records = useMemo(() => payload?.records ?? [], [payload]);
  const bounds = useMemo(() => timeBounds(records), [records]);

  // The slider works in whole days so dragging lands on legible dates.
  const steps = useMemo(() => {
    if (!bounds) return 0;
    return Math.max(1, Math.ceil((bounds.max - bounds.min) / DAY_MS));
  }, [bounds]);

  // Default to the present: everything, with every supersession applied.
  const value = position ?? steps;

  const atMs = useMemo(() => {
    // Unused when bounds is null: the component early-returns in that case.
    if (!bounds) return 0;
    if (value >= steps) return bounds.max;
    // End of the selected day, so a memory written that day is included.
    return bounds.min + value * DAY_MS + (DAY_MS - 1);
  }, [bounds, value, steps]);

  const visible = useMemo(() => {
    const snapshot = asOf(records, atMs);
    // The default view hides what had already been replaced by that date.
    return sortNewestFirst(snapshot.filter((r) => !r.supersededBy));
  }, [records, atMs]);

  const supersededThen = useMemo(
    () => asOf(records, atMs).filter((r) => r.supersededBy).length,
    [records, atMs]
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-[var(--s-4)]">
        <Skeleton className="h-[80px] w-full" />
        <Skeleton className="h-[120px] w-full" />
      </div>
    );
  }

  if (!bounds) {
    return (
      <div className="panel-recessed p-[var(--s-6)]">
        <p className="text-[var(--t-base)]">
          Nothing with a readable timestamp yet.
        </p>
        <p className="mt-[var(--s-3)] max-w-[68ch] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-700)]">
          The timeline reads the header timestamp, which is written by the client
          that recorded the memory. Memories with no Glassbox header carry no
          time and cannot be placed on it.
        </p>
      </div>
    );
  }

  const atPresent = value >= steps;

  return (
    <>
      <section className="panel mb-[var(--s-7)] p-[var(--s-5)]">
        <div className="mb-[var(--s-4)] flex flex-wrap items-end justify-between gap-[var(--s-4)]">
          <div>
            <div className="label">SHOWING WHAT WAS KNOWN ON</div>
            <div className="numeral mt-[var(--s-1)] text-[var(--t-2xl)] leading-[var(--lh-2xl)]">
              {atPresent ? "NOW" : dateOnly(new Date(atMs).toISOString())}
            </div>
          </div>
          <div className="text-right">
            <div className="label">LIVE THEN</div>
            <div className="numeral mt-[var(--s-1)] text-[var(--t-2xl)] leading-[var(--lh-2xl)]">
              {visible.length}
            </div>
          </div>
        </div>

        <Slider
          value={value}
          min={0}
          max={steps}
          step={1}
          onValueChange={setPosition}
          aria-label="Date"
        />

        <div className="label mt-[var(--s-3)] flex justify-between">
          <span>{dateOnly(new Date(bounds.min).toISOString())}</span>
          <span>NOW</span>
        </div>

        <p className="mt-[var(--s-4)] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-700)]">
          {supersededThen === 0
            ? "Nothing had been replaced by this date."
            : `${supersededThen} ${
                supersededThen === 1 ? "memory had" : "memories had"
              } already been replaced by this date and ${
                supersededThen === 1 ? "is" : "are"
              } hidden.`}{" "}
          Filtering happens entirely in the browser — dragging fires no network
          request.
        </p>
      </section>

      {visible.length === 0 ? (
        <div className="panel-recessed p-[var(--s-6)]">
          <p className="text-[var(--t-base)]">
            Nothing had been recorded by{" "}
            {dateOnly(new Date(atMs).toISOString())}.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-[var(--s-4)]">
          {visible.map((r) => (
            <MemoryTile key={r.memoryBlobId} record={r} now={atMs} />
          ))}
        </div>
      )}

      <p className="label mt-[var(--s-5)] normal-case tracking-normal">
        Times come from the header written by the recording client, not from the
        relayer&apos;s receipt time. That is what every machine sees, whether or not
        the metadata API is reachable. Earliest recorded:{" "}
        {absoluteTime(new Date(bounds.min).toISOString())}.
      </p>
    </>
  );
}
