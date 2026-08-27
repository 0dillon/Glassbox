"use client";

import Link from "next/link";
import { useState } from "react";

import { MemoryGlyph } from "@/components/memory-glyph";
import { ScopeBadge } from "@/components/scope-badge";
import { SupersedeDialog } from "@/components/supersede-dialog";
import { Button } from "@/components/ui/button";
import { absoluteTime, shortId } from "@/lib/format";
import type { MemoryRecord } from "@/lib/types";

/**
 * Section 5.5 — two contradicting memories, side by side, with resolution.
 *
 * Resolution is always a write, never a delete. Each control opens the
 * supersession flow pre-filled appropriately.
 */
export function ContestedPairCard({
  left,
  right,
  canWrite,
  onResolved,
}: {
  left: MemoryRecord;
  right: MemoryRecord;
  canWrite: boolean;
  onResolved: () => void;
}) {
  // Which memory the supersession will REPLACE. Keeping the left means writing
  // a replacement over the right, and vice versa.
  const [target, setTarget] = useState<MemoryRecord | null>(null);
  const [seed, setSeed] = useState<string>("");

  function keep(winner: MemoryRecord, loser: MemoryRecord) {
    setSeed(winner.body);
    setTarget(loser);
  }

  function writeNew() {
    setSeed("");
    setTarget(left);
  }

  return (
    <article className="mb-[var(--s-6)] border-[2px] border-[var(--signal)]">
      <div className="grid grid-cols-1 md:grid-cols-2">
        <Side record={left} className="border-b-[2px] border-[var(--ink)] md:border-b-0 md:border-r-[2px]" />
        <Side record={right} />
      </div>

      <div className="flex flex-wrap gap-[var(--s-3)] border-t-[2px] border-[var(--ink)] bg-[var(--off)] p-[var(--s-4)]">
        <Button
          variant="outline"
          onClick={() => keep(left, right)}
          disabled={!canWrite}
        >
          KEEP LEFT
        </Button>
        <Button
          variant="outline"
          onClick={() => keep(right, left)}
          disabled={!canWrite}
        >
          KEEP RIGHT
        </Button>
        <Button onClick={writeNew} disabled={!canWrite}>
          WRITE A NEW ONE
        </Button>
        {!canWrite ? (
          <span className="self-center text-[var(--t-sm)] text-[var(--grey-700)]">
            Recording is disabled on this machine, so this cannot be resolved
            here.
          </span>
        ) : null}
      </div>

      {target ? (
        <SupersedeDialog
          mode="supersede"
          record={seed ? { ...target, body: seed } : target}
          open
          onOpenChange={(o) => !o && setTarget(null)}
          onDone={onResolved}
        />
      ) : null}
    </article>
  );
}

function Side({
  record,
  className = "",
}: {
  record: MemoryRecord;
  className?: string;
}) {
  return (
    <div className={`p-[var(--s-4)] ${className}`}>
      <div className="flex gap-[var(--s-3)]">
        <MemoryGlyph memoryBlobId={record.memoryBlobId} size={48} />
        <div className="min-w-0">
          <ScopeBadge scope={record.scope} />
          <Link
            href={`/memory/${encodeURIComponent(record.memoryBlobId)}`}
            className="mt-[var(--s-3)] block hover:underline"
          >
            <p className="text-[var(--t-sm)] leading-[var(--lh-sm)]">
              {record.body}
            </p>
          </Link>
          <div className="label mt-[var(--s-3)]">
            {record.author} / {absoluteTime(record.writtenAt)} /{" "}
            {shortId(record.memoryBlobId)}
          </div>
        </div>
      </div>
    </div>
  );
}
