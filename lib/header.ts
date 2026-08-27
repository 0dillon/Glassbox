import { parsedAttachmentBlobId, parsedMemoryBlobId } from "@/lib/ids";
import type { HeaderFields } from "@/lib/types";

/**
 * Section 5.2 — the in-text structured header.
 *
 * The storage layer accepts a text string and a namespace. There is no metadata
 * field, no tags, no attributes. So the structured fields are encoded into the
 * text itself, as a single leading bracketed group:
 *
 *   [gb1 scope=team author=maria-mbp ts=2026-08-27T10:14:02Z] The fact.
 *
 * Pure module. No I/O. Everything else in the app depends on it.
 */

/** Format version sentinel. A future format uses gb2 and this parser ignores it safely. */
export const HEADER_VERSION = "gb1";

const HEADER_RE = /^\[gb1((?: [a-z]+=[^\s\]]+)+)\]\s*/;

const AUTHOR_RE = /^[a-z0-9-]{1,32}$/;
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
/** Blob ids are opaque; this only rejects shapes that could not be one. */
const BLOB_RE = /^[A-Za-z0-9_-]{4,}$/;

export interface ParseResult {
  fields: HeaderFields | null;
  body: string;
  headerOk: boolean;
  /** Why parsing failed, for the UNSCOPED tile. Null when it succeeded. */
  reason: string | null;
}

export class HeaderEncodeError extends Error {}

/** A header value must never contain a space or a `]`. */
export function isEncodableValue(v: string): boolean {
  return v.length > 0 && !/[\s\]]/.test(v);
}

export function isValidAuthor(author: string): boolean {
  return AUTHOR_RE.test(author);
}

/**
 * Build the exact string that will be stored. Throws rather than emitting a
 * header that cannot be parsed back — Section 5.4 rule 4 depends on this.
 */
export function encodeHeader(fields: HeaderFields, body: string): string {
  if (fields.scope !== "team" && fields.scope !== "mine") {
    throw new HeaderEncodeError(`Scope must be team or mine, got "${fields.scope}".`);
  }
  if (!isValidAuthor(fields.author)) {
    throw new HeaderEncodeError(
      "Author must be lowercase letters, numbers and hyphens only, at most 32 characters."
    );
  }
  if (!TS_RE.test(fields.ts)) {
    throw new HeaderEncodeError(
      "Timestamp must be ISO 8601 UTC with a Z suffix, for example 2026-08-27T10:14:02Z."
    );
  }

  const tokens = [
    HEADER_VERSION,
    `scope=${fields.scope}`,
    `author=${fields.author}`,
    `ts=${fields.ts}`,
  ];

  if (fields.supersedes) {
    if (!isEncodableValue(fields.supersedes)) {
      throw new HeaderEncodeError(
        "The superseded memory blob id contains a space or a bracket and cannot be encoded."
      );
    }
    tokens.push(`supersedes=${fields.supersedes}`);
  }

  if (fields.src) {
    const value = `blob:${fields.src}`;
    if (!isEncodableValue(value)) {
      throw new HeaderEncodeError(
        "The attachment blob id contains a space or a bracket and cannot be encoded."
      );
    }
    tokens.push(`src=${value}`);
  }

  return `[${tokens.join(" ")}] ${body.trim()}`;
}

/**
 * Section 5.2, parse failure — the defined failure mode.
 *
 * On any failure the ENTIRE raw string becomes the body. The memory is never
 * discarded and never partially parsed. `resolve.ts` turns headerOk:false into
 * the UNSCOPED treatment, and the detail page offers REPAIR.
 */
export function parseHeader(raw: string): ParseResult {
  const fail = (reason: string): ParseResult => ({
    fields: null,
    body: raw,
    headerOk: false,
    reason,
  });

  if (typeof raw !== "string" || raw.length === 0) {
    return fail("Memory text was empty.");
  }

  if (!raw.startsWith("[gb1 ")) {
    // A gb2+ header is a future format this parser must ignore safely, not
    // mangle. Both cases land in the same visible UNSCOPED treatment.
    if (/^\[gb\d+ /.test(raw)) {
      return fail(
        "Written in a newer Glassbox header format that this version cannot read."
      );
    }
    return fail(
      "No Glassbox header — recorded by a tool that does not use this format."
    );
  }

  const match = HEADER_RE.exec(raw);
  if (!match) {
    return fail(
      "The Glassbox header is malformed — the bracketed group is unterminated or a token is invalid."
    );
  }

  const body = raw.slice(match[0].length);
  const tokens = match[1].trim().split(" ").filter(Boolean);

  const kv = new Map<string, string>();
  for (const token of tokens) {
    const eq = token.indexOf("=");
    if (eq <= 0) {
      return fail(`The header token "${token}" is not a key=value pair.`);
    }
    // Unknown keys are ignored, not treated as errors. That is what makes the
    // format forward-compatible.
    kv.set(token.slice(0, eq), token.slice(eq + 1));
  }

  const scope = kv.get("scope");
  if (scope !== "team" && scope !== "mine") {
    return fail(
      scope === undefined
        ? "The header is missing the required scope field."
        : `The header carries an unrecognised scope "${scope}".`
    );
  }

  const author = kv.get("author");
  if (author === undefined) {
    return fail("The header is missing the required author field.");
  }
  if (!AUTHOR_RE.test(author)) {
    return fail(`The header author "${author}" is not a valid author slug.`);
  }

  const ts = kv.get("ts");
  if (ts === undefined) {
    return fail("The header is missing the required timestamp field.");
  }
  if (!TS_RE.test(ts) || Number.isNaN(Date.parse(ts))) {
    return fail(`The header timestamp "${ts}" is not ISO 8601 UTC.`);
  }

  const fields: HeaderFields = { scope, author, ts };

  const supersedes = kv.get("supersedes");
  if (supersedes !== undefined) {
    if (!BLOB_RE.test(supersedes)) {
      return fail(`The header supersedes value "${supersedes}" is not a blob id.`);
    }
    fields.supersedes = parsedMemoryBlobId(supersedes);
  }

  const src = kv.get("src");
  if (src !== undefined) {
    if (!src.startsWith("blob:")) {
      return fail(`The header src value "${src}" is not a blob reference.`);
    }
    const attachment = src.slice("blob:".length);
    if (!BLOB_RE.test(attachment)) {
      return fail(`The header src value "${src}" is not a blob reference.`);
    }
    fields.src = parsedAttachmentBlobId(attachment);
  }

  return { fields, body, headerOk: true, reason: null };
}

/** Current UTC time in the exact shape the header requires. */
export function nowTs(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, "Z");
}
