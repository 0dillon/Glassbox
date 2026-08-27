import { encodeHeader, nowTs } from "@/lib/header";
import type { MemoryRecord, Scope } from "@/lib/types";

/**
 * Sections 5.4 and 5.6 — enforced in code, not offered as advice.
 * Every write path calls `canWrite` first.
 */

export const MIN_BODY = 12;
export const MAX_BODY = 2000;
/** Section 5.5 — a replacement must restate the whole fact. */
export const MIN_REPLACEMENT_BODY = 15;

export type GateResult = { ok: true } | { ok: false; reason: string };

/**
 * Section 5.6 — what is deliberately never stored.
 *
 * Memories are encrypted at rest, but the relayer handles plaintext briefly
 * while embedding, and every teammate can read everything. These are blocked
 * outright. Never warned-and-allowed.
 */
const CREDENTIAL_PATTERNS: Array<{ re: RegExp; what: string }> = [
  { re: /0x[0-9a-fA-F]{64}/, what: "a 32-byte hex key" },
  { re: /\b[0-9a-fA-F]{64}\b/, what: "a bare 64-character hex string, the delegate key format" },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, what: "a PEM private key" },
  { re: /\bsk-[A-Za-z0-9]{16,}/, what: "an OpenAI-style secret key" },
  { re: /\bghp_[A-Za-z0-9]{20,}/, what: "a GitHub token" },
  { re: /\bAKIA[0-9A-Z]{16}\b/, what: "an AWS access key id" },
  { re: /\b(?:\d[ -]?){13,19}\b/, what: "a payment card number" },
  {
    re: /(password|passwd|api[ _-]?key|secret|token)\s*[:=]\s*\S+/i,
    what: "a labelled credential",
  },
];

/**
 * Returns the name of the matched pattern, or null.
 *
 * The blocked text itself is never returned, logged, or sent anywhere — only
 * the name of what matched.
 */
export function detectCredential(body: string): string | null {
  const trimmed = body.trim();
  for (const { re, what } of CREDENTIAL_PATTERNS) {
    if (re.test(trimmed)) return what;
  }
  return null;
}

export function credentialRefusal(what: string): string {
  return `Not stored. This looks like a credential — Glassbox will not put secrets into a shared memory. It matched ${what}.`;
}

export interface WriteContext {
  /** Records already loaded, used for the per-author duplicate check. */
  existing: MemoryRecord[];
  /** The author this write will be attributed to. */
  author: string;
}

/**
 * Section 5.4 — the write trigger.
 *
 * A memory is written only when all of these hold. On `ok: false` the caller
 * renders the reason inline beside the input and does NOT call the relayer.
 */
export function canWrite(
  body: string,
  scope: Scope,
  namespace: string,
  ctx: WriteContext,
  opts: { minBody?: number } = {}
): GateResult {
  const trimmed = body.trim();
  const min = opts.minBody ?? MIN_BODY;

  // 2. Length bounds.
  if (trimmed.length === 0) {
    return { ok: false, reason: "Nothing to record." };
  }
  if (trimmed.length < min) {
    return {
      ok: false,
      reason: `Too short. A memory needs at least ${min} characters — a fragment that cannot be understood without the conversation around it is worthless six weeks later.`,
    };
  }
  if (trimmed.length > MAX_BODY) {
    return {
      ok: false,
      reason: `Too long. A memory is at most ${MAX_BODY} characters; this one is ${trimmed.length}.`,
    };
  }

  // 3. The never-store gate.
  const credential = detectCredential(trimmed);
  if (credential) {
    return { ok: false, reason: credentialRefusal(credential) };
  }

  // Scope must be one the codec can encode.
  if (scope !== "team" && scope !== "mine") {
    return {
      ok: false,
      reason: "Pick a scope: MINE or TEAM.",
    };
  }

  if (!namespace || /\s/.test(namespace)) {
    return {
      ok: false,
      reason: "Pick a namespace. It cannot be empty or contain spaces.",
    };
  }

  // 4. The header must encode cleanly.
  try {
    encodeHeader({ scope, author: ctx.author, ts: nowTs() }, trimmed);
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "The header could not be encoded.",
    };
  }

  // 5. No byte-identical trimmed body from the same author in this namespace.
  //    Writing is append-only, so an identical write creates a second permanent
  //    copy that surfaces alongside the first forever.
  //
  //    Per-author by design, and it cannot be global: another machine may write
  //    identical text at the same moment and this client cannot see it in time.
  //    Section 5.5 covers what happens then.
  const duplicate = ctx.existing.some(
    (r) =>
      r.namespace === namespace &&
      r.author === ctx.author &&
      r.body.trim() === trimmed
  );
  if (duplicate) {
    return { ok: false, reason: "You already recorded this in this namespace." };
  }

  return { ok: true };
}

/**
 * Section 5.4 — a timeout does NOT mean the write failed. The relayer keeps
 * processing after the client stops waiting, so a retry creates a permanent
 * duplicate.
 */
export const TIMEOUT_NOTICE =
  "Write may still be in progress. It will appear in the feed if it succeeded.";
