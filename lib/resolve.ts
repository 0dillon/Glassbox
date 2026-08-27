import { parseHeader } from "@/lib/header";
import type { MemoryBlobId } from "@/lib/ids";
import type { MemoryRecord, Scope } from "@/lib/types";
import type { RecallRow } from "@/lib/memwal";

/**
 * Section 2, component F — the record resolver.
 *
 * Takes raw memories, parses headers, computes supersession links, detects
 * contested pairs, applies scope filtering, and produces the single record type
 * the whole UI renders.
 *
 * `supersededBy` and `contestedWith` are computed on every resolve pass and
 * NEVER written back to storage.
 */

/** Parse one recall row into a record. A parse failure is expected, not exceptional. */
export function toRecord(row: RecallRow): MemoryRecord {
  const parsed = parseHeader(row.text);

  if (!parsed.headerOk || !parsed.fields) {
    // Section 5.2 — the whole raw string becomes the body. Never discarded,
    // never partially parsed, never guessed at.
    return {
      memoryBlobId: row.memoryBlobId,
      body: parsed.body,
      raw: row.text,
      scope: "unscoped",
      author: "unknown",
      writtenAt: null,
      namespace: row.namespace,
      supersedes: null,
      supersededBy: null,
      contestedWith: [],
      attachmentBlobId: null,
      memoryId: null,
      sizeBytes: null,
      status: "unknown",
      endEpoch: null,
      expiresAt: null,
      headerOk: false,
      source: "recall",
    };
  }

  return {
    memoryBlobId: row.memoryBlobId,
    body: parsed.body,
    raw: row.text,
    scope: parsed.fields.scope,
    author: parsed.fields.author,
    writtenAt: parsed.fields.ts,
    namespace: row.namespace,
    supersedes: parsed.fields.supersedes ?? null,
    supersededBy: null,
    contestedWith: [],
    attachmentBlobId: parsed.fields.src ?? null,
    memoryId: null,
    sizeBytes: null,
    status: "unknown",
    endEpoch: null,
    expiresAt: null,
    headerOk: true,
    source: "recall",
  };
}

/** The reason shown on an UNSCOPED tile. */
export function unscopedReason(record: MemoryRecord): string {
  if (record.headerOk) return "";
  return parseHeader(record.raw).reason ?? "No Glassbox header.";
}

/**
 * Compute supersession links across the whole record set.
 *
 * A newer memory overrides an older one ONLY when it explicitly names it.
 * Recency alone never wins.
 */
export function linkSupersessions(records: MemoryRecord[]): MemoryRecord[] {
  const byId = new Map<string, MemoryRecord>();
  for (const r of records) byId.set(r.memoryBlobId, { ...r, supersededBy: null });

  for (const r of byId.values()) {
    if (!r.supersedes) continue;
    const target = byId.get(r.supersedes);
    if (!target) continue;
    // A memory cannot supersede itself.
    if (target.memoryBlobId === r.memoryBlobId) continue;
    // If two replacements name the same target, the newer one wins the link.
    // Both remain live and visible; only the arrow points at one.
    if (target.supersededBy) {
      const incumbent = byId.get(target.supersededBy);
      const incumbentAt = incumbent?.writtenAt ? Date.parse(incumbent.writtenAt) : 0;
      const challengerAt = r.writtenAt ? Date.parse(r.writtenAt) : 0;
      if (challengerAt <= incumbentAt) continue;
    }
    target.supersededBy = r.memoryBlobId;
  }

  return [...byId.values()];
}

/** Walk the chain from any member, oldest to newest. */
export function supersessionChain(
  record: MemoryRecord,
  all: MemoryRecord[]
): MemoryRecord[] {
  const byId = new Map(all.map((r) => [r.memoryBlobId as string, r]));

  // Walk backwards to the oldest.
  let head = record;
  const guard = new Set<string>([record.memoryBlobId]);
  while (head.supersedes) {
    const prev = byId.get(head.supersedes);
    if (!prev || guard.has(prev.memoryBlobId)) break;
    guard.add(prev.memoryBlobId);
    head = prev;
  }

  // Walk forwards, collecting.
  const chain: MemoryRecord[] = [head];
  const seen = new Set<string>([head.memoryBlobId]);
  let cursor = head;
  while (cursor.supersededBy) {
    const next = byId.get(cursor.supersededBy);
    if (!next || seen.has(next.memoryBlobId)) break;
    seen.add(next.memoryBlobId);
    chain.push(next);
    cursor = next;
  }

  return chain;
}

/** Sort newest first. Unscoped memories have no timestamp and sort last. */
export function sortNewestFirst(records: MemoryRecord[]): MemoryRecord[] {
  return [...records].sort((a, b) => {
    const at = a.writtenAt ? Date.parse(a.writtenAt) : Number.NEGATIVE_INFINITY;
    const bt = b.writtenAt ? Date.parse(b.writtenAt) : Number.NEGATIVE_INFINITY;
    if (bt !== at) return bt - at;
    return a.memoryBlobId.localeCompare(b.memoryBlobId);
  });
}

/* ------------------------------------------------------------------ *
 * Contested detection (Section 5.5)
 * ------------------------------------------------------------------ */

/** One pair, as found by the sweep. Symmetric — recorded on both records. */
export interface ContestedPair {
  a: MemoryBlobId;
  b: MemoryBlobId;
}

/** How many memories get a contested check per pass. Keeps the sweep in budget. */
export const CONTESTED_BATCH = 8;
/** Reduced batch when the sweep is being rate limited (Section 8). */
export const CONTESTED_BATCH_REDUCED = 2;

/**
 * Which memories to check this pass: team-scoped, not superseded, not already
 * marked contested — newest first, capped.
 */
export function contestedCandidates(
  records: MemoryRecord[],
  cap: number = CONTESTED_BATCH
): MemoryRecord[] {
  return sortNewestFirst(
    records.filter(
      (r) =>
        r.scope === "team" &&
        r.headerOk &&
        !r.supersededBy &&
        r.contestedWith.length === 0
    )
  ).slice(0, cap);
}

/**
 * Decide whether a recall hit contests the memory it was found for.
 *
 * A hit contests when it is a different memory, close enough, by a DIFFERENT
 * author, with no supersession link in either direction.
 */
export function isContesting(
  subject: MemoryRecord,
  candidate: MemoryRecord | undefined,
  distance: number,
  maxDistance: number
): boolean {
  if (!candidate) return false;
  if (candidate.memoryBlobId === subject.memoryBlobId) return false;
  if (!(distance < maxDistance)) return false;
  if (candidate.author === subject.author) return false;
  if (!candidate.headerOk || candidate.scope !== "team") return false;
  // No supersession link in either direction.
  if (subject.supersedes === candidate.memoryBlobId) return false;
  if (candidate.supersedes === subject.memoryBlobId) return false;
  if (subject.supersededBy === candidate.memoryBlobId) return false;
  if (candidate.supersededBy === subject.memoryBlobId) return false;
  return true;
}

/** Record a set of pairs onto both sides. */
export function applyContested(
  records: MemoryRecord[],
  pairs: ContestedPair[]
): MemoryRecord[] {
  if (pairs.length === 0) return records;

  const byId = new Map(
    records.map((r) => [r.memoryBlobId as string, { ...r, contestedWith: [...r.contestedWith] }])
  );

  for (const { a, b } of pairs) {
    const ra = byId.get(a);
    const rb = byId.get(b);
    if (!ra || !rb) continue;
    if (!ra.contestedWith.includes(b)) ra.contestedWith.push(b);
    if (!rb.contestedWith.includes(a)) rb.contestedWith.push(a);
  }

  return [...byId.values()];
}

/** Distinct contested pairs across the set, for /contested and the stat strip. */
export function contestedPairs(records: MemoryRecord[]): ContestedPair[] {
  const out: ContestedPair[] = [];
  const seen = new Set<string>();
  for (const r of records) {
    for (const other of r.contestedWith) {
      const key = [r.memoryBlobId, other].sort().join("::");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a: r.memoryBlobId, b: other });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Filtering
 * ------------------------------------------------------------------ */

export type ScopeFilter = "all" | "team" | "mine" | "unscoped";

/**
 * Section 5.2 — an unscoped memory is shown to everyone, because scope is a
 * convention and hiding it would falsely imply the content was protected. It is
 * excluded from the team and mine filters and appears only under ALL or
 * UNSCOPED.
 *
 * MINE is scoped to the viewing author. A teammate's `mine` memory is still
 * readable (Section 5.3) but belongs in their column, not this one.
 */
export function applyScopeFilter(
  records: MemoryRecord[],
  filter: ScopeFilter,
  viewer: string | null
): MemoryRecord[] {
  if (filter === "all") return records;
  if (filter === "unscoped") return records.filter((r) => r.scope === "unscoped");
  if (filter === "team") return records.filter((r) => r.scope === "team");
  return records.filter(
    (r) => r.scope === "mine" && (viewer === null || r.author === viewer)
  );
}

export function applyAuthorFilter(
  records: MemoryRecord[],
  author: string | null
): MemoryRecord[] {
  if (!author) return records;
  return records.filter((r) => r.author === author);
}

export function applyNamespaceFilter(
  records: MemoryRecord[],
  namespace: string | null
): MemoryRecord[] {
  if (!namespace) return records;
  return records.filter((r) => r.namespace === namespace);
}

/** Author roll-up for /team and the stat strip. */
export function authorCounts(
  records: MemoryRecord[]
): Array<{ author: string; count: number }> {
  const map = new Map<string, number>();
  for (const r of records) {
    map.set(r.author, (map.get(r.author) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([author, count]) => ({ author, count }))
    .sort((a, b) => b.count - a.count || a.author.localeCompare(b.author));
}

/* ------------------------------------------------------------------ *
 * The timeline (Section 6, Step 8)
 * ------------------------------------------------------------------ */

/**
 * What was known at `atMs`: memories written by then, with supersessions
 * applied only if the replacement had itself been written by then.
 *
 * Uses the header timestamp, which is authoritative for display — it is what
 * every client sees whether or not the metadata API is available.
 */
export function asOf(records: MemoryRecord[], atMs: number): MemoryRecord[] {
  const present = records.filter((r) => {
    if (!r.writtenAt) return false;
    const t = Date.parse(r.writtenAt);
    return !Number.isNaN(t) && t <= atMs;
  });

  const presentIds = new Set(present.map((r) => r.memoryBlobId as string));

  return present.map((r) => ({
    ...r,
    // A supersession that had not happened yet must not be applied.
    supersededBy:
      r.supersededBy && presentIds.has(r.supersededBy) ? r.supersededBy : null,
    // A link to a memory that did not exist yet is dropped too.
    supersedes: r.supersedes && presentIds.has(r.supersedes) ? r.supersedes : null,
    contestedWith: r.contestedWith.filter((id) => presentIds.has(id)),
  }));
}

/** The full span of header timestamps, for the slider bounds. */
export function timeBounds(records: MemoryRecord[]): { min: number; max: number } | null {
  const stamps = records
    .map((r) => (r.writtenAt ? Date.parse(r.writtenAt) : Number.NaN))
    .filter((t) => !Number.isNaN(t));
  if (stamps.length === 0) return null;
  return { min: Math.min(...stamps), max: Math.max(...stamps) };
}

/** Scope treatment lookup, so tile and badge never disagree. */
export function scopeLabel(scope: Scope): string {
  return scope.toUpperCase();
}
