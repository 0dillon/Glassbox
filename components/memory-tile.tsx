"use client";

import Link from "next/link";

import { MemoryGlyph } from "@/components/memory-glyph";
import { ScopeBadge } from "@/components/scope-badge";
import { Badge } from "@/components/ui/badge";
import { relativeTime, shortId } from "@/lib/format";
import type { MemoryRecord } from "@/lib/types";

/**
 * Section 10 — one memory in the feed. Hand-written, not a shadcn card.
 *
 * Scope is legible at a glance from tile STRUCTURE, not from a colour or an
 * icon (Section 5.3):
 *
 *   TEAM      solid 2px --ink border, --paper ground        -> reads as public
 *   MINE      2px border, recessed --off ground, 6px slab   -> reads as personal
 *   UNSCOPED  2px dashed border, --paper ground             -> reads as provisional
 */
export function MemoryTile({
  record,
  fresh = false,
  now,
  unscopedReason,
  supersededByAuthor,
  children,
}: {
  record: MemoryRecord;
  /** Newly arrived: carries a --signal left bar that transitions to --ink. */
  fresh?: boolean;
  /** The client clock, passed in so nothing impure is called during render. */
  now: number;
  unscopedReason?: string;
  supersededByAuthor?: { author: string; writtenAt: string | null } | null;
  children?: React.ReactNode;
}) {
  const superseded = Boolean(record.supersededBy);
  const contested = record.contestedWith.length > 0;

  const scopeClasses =
    record.scope === "team"
      ? "border-[2px] border-[var(--ink)] bg-[var(--paper)]"
      : record.scope === "mine"
        ? "border-[2px] border-[var(--ink)] bg-[var(--off)]"
        : "border-[2px] border-dashed border-[var(--ink)] bg-[var(--paper)]";

  // The left edge is set inline so the three rules that compete for it cannot
  // land in an ambiguous order: MINE carries a 6px slab, a freshly arrived tile
  // carries a 2px --signal bar instead for the duration of the animation, and
  // everything else keeps the 2px scope border.
  const leftEdge: React.CSSProperties = fresh
    ? { borderLeftWidth: "var(--b-rule)", borderLeftColor: "var(--signal)" }
    : record.scope === "mine"
      ? { borderLeftWidth: "var(--b-slab)", borderLeftColor: "var(--ink)" }
      : {};

  return (
    <article
      data-scope={record.scope}
      data-superseded={superseded ? "true" : undefined}
      style={leftEdge}
      className={[
        scopeClasses,
        fresh ? "gb-fresh" : "gb-arrive",
        superseded ? "opacity-60" : "",
        "p-[var(--s-4)]",
      ].join(" ")}
    >
      <div className="flex gap-[var(--s-4)]">
        <MemoryGlyph memoryBlobId={record.memoryBlobId} size={48} />

        <div className="min-w-0 flex-1">
          <div className="mb-[var(--s-3)] flex flex-wrap items-start justify-between gap-[var(--s-2)]">
            <div className="flex flex-wrap items-center gap-[var(--s-2)]">
              <ScopeBadge scope={record.scope} reason={unscopedReason} />
              {contested ? (
                <Badge variant="signal">
                  CONTESTED {record.contestedWith.length}
                </Badge>
              ) : null}
              {superseded ? <Badge variant="secondary">REPLACED</Badge> : null}
              {record.source === "optimistic" ? (
                <Badge variant="muted">RECORDING</Badge>
              ) : null}
            </div>
          </div>

          <Link
            href={`/memory/${encodeURIComponent(record.memoryBlobId)}`}
            className="block hover:underline"
          >
            <p
              className={[
                "text-[var(--t-base)] leading-[var(--lh-base)] text-[var(--ink)]",
                superseded ? "gb-struck" : "",
              ].join(" ")}
            >
              {record.body}
            </p>
          </Link>

          {record.scope === "unscoped" && unscopedReason ? (
            <p className="mt-[var(--s-2)] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-500)]">
              {unscopedReason}
            </p>
          ) : null}

          {superseded ? (
            <p className="mt-[var(--s-3)] text-[var(--t-sm)]">
              <Link
                href={`/memory/${encodeURIComponent(record.supersededBy!)}`}
                className="mono tracking-[0.06em] uppercase underline"
              >
                Replaced by {shortId(record.supersededBy)}
              </Link>
              {supersededByAuthor ? (
                <span className="text-[var(--grey-500)]">
                  {" "}
                  — {supersededByAuthor.author},{" "}
                  {relativeTime(supersededByAuthor.writtenAt, now)}
                </span>
              ) : null}
            </p>
          ) : null}

          {record.supersedes ? (
            <p className="mt-[var(--s-2)] text-[var(--t-sm)]">
              <Link
                href={`/memory/${encodeURIComponent(record.supersedes)}`}
                className="mono tracking-[0.06em] uppercase underline"
              >
                Replaces {shortId(record.supersedes)}
              </Link>
            </p>
          ) : null}

          <div className="label mt-[var(--s-3)] flex flex-wrap items-center gap-x-[var(--s-3)] gap-y-[var(--s-1)]">
            <span className="text-[var(--ink)]">{record.author}</span>
            <span aria-hidden>/</span>
            <span>{relativeTime(record.writtenAt, now)}</span>
            <span aria-hidden>/</span>
            <span>{record.namespace}</span>
            <span aria-hidden>/</span>
            <span>{shortId(record.memoryBlobId)}</span>
          </div>

          {children}
        </div>
      </div>
    </article>
  );
}
