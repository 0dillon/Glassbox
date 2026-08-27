import { sha256 } from "@noble/hashes/sha2.js";

/**
 * Section 10 — deterministic identity.
 *
 * Each memory gets a glyph derived from its own memory blob id, so the same
 * memory always looks identical and two memories are distinguishable at a
 * glance. Pure function, no I/O.
 *
 * The glyph never encodes scope. Scope is carried by tile structure so that
 * identity and visibility stay independently readable: a memory re-scoped from
 * TEAM to MINE is a different memory with a different glyph, and the glyph must
 * not be the thing that changed.
 */

export interface Glyph {
  /** 36 entries, a 6x6 grid, row-major. */
  cells: boolean[];
  /** One of four monochrome hex values. */
  ink: string;
  borderWidth: 1 | 2;
  fallback: boolean;
}

const ID_RE = /^[A-Za-z0-9_-]{8,}$/;

const INKS = ["#0A0A0A", "#4A4947", "#8A8986", "#C4C3C0"] as const;

/** An unidentifiable memory must look unidentifiable. Never a random stand-in. */
export const FALLBACK_GLYPH: Glyph = {
  cells: new Array<boolean>(36).fill(false),
  ink: "#C4C3C0",
  borderWidth: 2,
  fallback: true,
};

export function deriveGlyph(memoryBlobId: string | null | undefined): Glyph {
  if (!memoryBlobId || !ID_RE.test(memoryBlobId)) {
    return FALLBACK_GLYPH;
  }

  const digest = sha256(new TextEncoder().encode(memoryBlobId));

  // Bytes 0..17 — 18 bytes, 144 bits. We consume the first 18 bits to fill the
  // left three columns of a 6x6 grid, reading most-significant-bit first within
  // each byte.
  const bitAt = (index: number): boolean => {
    const byte = digest[index >> 3];
    const shift = 7 - (index & 7);
    return ((byte >> shift) & 1) === 1;
  };

  const cells = new Array<boolean>(36).fill(false);
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 3; c++) {
      const on = bitAt(r * 3 + c);
      cells[r * 6 + c] = on;
      // Mirror horizontally. Vertical symmetry is what makes a random bit field
      // read as a mark rather than noise.
      cells[r * 6 + (5 - c)] = on;
    }
  }

  const ink = INKS[digest[18] % 4];
  const borderWidth: 1 | 2 = digest[19] % 2 === 0 ? 1 : 2;

  return { cells, ink, borderWidth, fallback: false };
}
