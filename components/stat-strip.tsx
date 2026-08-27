import Link from "next/link";

/**
 * Counts across the top of the feed. Terse and functional:
 * 12 MEMORIES / 3 AUTHORS / 2 CONTESTED.
 */
export function StatStrip({
  memories,
  authors,
  contested,
  superseded,
}: {
  memories: number;
  authors: number;
  contested: number;
  superseded: number;
}) {
  return (
    <div className="mb-[var(--s-6)] flex flex-wrap items-end gap-x-[var(--s-8)] gap-y-[var(--s-4)] border-b-[2px] border-[var(--ink)] pb-[var(--s-4)]">
      <Stat value={memories} label="MEMORIES" primary />
      <Stat value={authors} label="AUTHORS" />
      {contested > 0 ? (
        <Link href="/contested" className="group">
          <Stat value={contested} label="CONTESTED" signal />
        </Link>
      ) : (
        <Stat value={contested} label="CONTESTED" />
      )}
      <Stat value={superseded} label="SUPERSEDED" />
    </div>
  );
}

function Stat({
  value,
  label,
  primary = false,
  signal = false,
}: {
  value: number;
  label: string;
  primary?: boolean;
  signal?: boolean;
}) {
  return (
    <div>
      <div
        className="numeral leading-none"
        style={{
          fontSize: primary ? "var(--t-3xl)" : "var(--t-2xl)",
          lineHeight: primary ? "var(--lh-3xl)" : "var(--lh-2xl)",
          color: signal && value > 0 ? "var(--signal)" : "var(--ink)",
        }}
      >
        {value}
      </div>
      <div className="label mt-[var(--s-1)]">{label}</div>
    </div>
  );
}
