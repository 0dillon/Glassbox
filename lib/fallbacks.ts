import "server-only";

/**
 * Section 8 — surface the path taken.
 *
 * Every fallback taken during a run is recorded here with what failed, which
 * path was taken, and what is consequently unavailable. The doctor page renders
 * the list, and `FALLBACKS.md` documents the ones taken during the build.
 *
 * In-process only. This is a record of THIS run, not a persisted log.
 */

export interface FallbackNote {
  at: string;
  what: string;
  failure: string;
  consequence: string;
}

const notes: FallbackNote[] = [];
const seen = new Set<string>();

/** Recorded once per distinct (what, failure) pair, so a poll cannot flood it. */
export function noteFallback(what: string, failure: string, consequence: string) {
  const key = `${what}::${failure}`;
  if (seen.has(key)) return;
  seen.add(key);
  notes.push({ at: new Date().toISOString(), what, failure, consequence });
}

export function listFallbacks(): FallbackNote[] {
  return [...notes];
}
