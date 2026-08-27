import { deriveGlyph } from "@/lib/glyph";

/**
 * Section 10 — the deterministic glyph renderer.
 *
 * Cells are a CSS grid of divs, not an image, so it stays crisp at any zoom and
 * needs no canvas. Square, zero radius, --paper ground, no rotation, no
 * gradient, no colour outside the four greys.
 *
 * The glyph never encodes scope.
 */
export function MemoryGlyph({
  memoryBlobId,
  size = 48,
}: {
  memoryBlobId: string | null | undefined;
  size?: 48 | 96;
}) {
  const glyph = deriveGlyph(memoryBlobId);

  if (glyph.fallback) {
    // An unidentifiable memory must look unidentifiable. Never a random glyph.
    return (
      <div
        aria-hidden
        className="flex shrink-0 items-center justify-center"
        style={{
          width: size,
          height: size,
          background: "var(--grey-300)",
          border: "2px solid var(--ink)",
        }}
      >
        <span
          className="mono font-bold text-[var(--ink)]"
          style={{ fontSize: size === 96 ? 32 : 18 }}
        >
          ?
        </span>
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className="grid shrink-0"
      style={{
        width: size,
        height: size,
        background: "var(--paper)",
        border: `${glyph.borderWidth}px solid var(--ink)`,
        gridTemplateColumns: "repeat(6, 1fr)",
        gridTemplateRows: "repeat(6, 1fr)",
      }}
    >
      {glyph.cells.map((on, i) => (
        <div key={i} style={{ background: on ? glyph.ink : "transparent" }} />
      ))}
    </div>
  );
}
