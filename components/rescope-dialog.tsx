"use client";

import { SupersedeDialog } from "@/components/supersede-dialog";
import type { MemoryRecord } from "@/lib/types";

/**
 * Section 5.3 — a two-step confirm for a scope change, carrying the retraction
 * warning when the change is TEAM to MINE.
 *
 * A re-scope IS a supersession: storage is append-only, so the scope cannot be
 * edited. The dialog shares the supersession flow rather than duplicating it,
 * which is what keeps the two from drifting apart.
 */
export function RescopeDialog({
  record,
  open,
  onOpenChange,
  onDone,
}: {
  record: MemoryRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  return (
    <SupersedeDialog
      mode="rescope"
      record={record}
      open={open}
      onOpenChange={onOpenChange}
      onDone={onDone}
    />
  );
}
