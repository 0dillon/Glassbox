/** Display helpers. Pure, no I/O, safe on both client and server. */

/**
 * Relative time, terse. Renders the same on server and client for a given
 * `now`, so callers on the client pass their own clock to avoid hydration drift.
 */
export function relativeTime(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";

  const seconds = Math.round((now - then) / 1000);
  if (seconds < 0) {
    // A clock ahead of ours. Say so rather than rendering a negative age.
    return "just now";
  }
  if (seconds < 45) return "just now";
  if (seconds < 90) return "1 min ago";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;

  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks} wk ago`;

  const months = Math.round(days / 30);
  if (months < 12) return `${months} mo ago`;

  const years = Math.round(days / 365);
  return `${years} yr ago`;
}

/** Absolute UTC stamp, for detail pages and tooltips. */
export function absoluteTime(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
}

/** Date only, for the timeline readout. */
export function dateOnly(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toISOString().slice(0, 10);
}

/** Byte size. Binary units, because that is what the storage layer reports. */
export function bytes(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n < 1024) return `${n} B`;
  const kib = n / 1024;
  if (kib < 1024) return `${kib.toFixed(kib < 10 ? 1 : 0)} KiB`;
  const mib = kib / 1024;
  return `${mib.toFixed(mib < 10 ? 2 : 1)} MiB`;
}

/** First eight characters of an identifier, for tiles. */
export function shortId(id: string | null | undefined, n = 8): string {
  if (!id) return "—";
  return id.length <= n ? id : id.slice(0, n);
}

/** Middle-truncated identifier, for tables where the tail is worth keeping. */
export function midTruncate(id: string | null | undefined, head = 10, tail = 6): string {
  if (!id) return "—";
  if (id.length <= head + tail + 1) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

/** Terse plural for the stat strip. */
export function count(n: number, singular: string, plural = `${singular}S`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
