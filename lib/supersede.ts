import { encodeHeader, nowTs } from "@/lib/header";
import type { MemoryBlobId } from "@/lib/ids";
import { MIN_REPLACEMENT_BODY, detectCredential, credentialRefusal } from "@/lib/guards";
import { MAX_BODY } from "@/lib/guards";
import type { MemoryRecord, Scope } from "@/lib/types";

/**
 * Section 5.5 — supersession, enforced in code.
 *
 * A newer memory overrides an older one only when it explicitly names it.
 * Nothing is ever deleted; the overridden memory stays visible, struck through,
 * linked to its replacement.
 */

export type SupersedeCheck =
  | { ok: true; stored: string }
  | { ok: false; reason: string };

export interface SupersedeInput {
  body: string;
  scope: Exclude<Scope, "unscoped">;
  author: string;
  target: MemoryBlobId;
  /** The full loaded record set, for target validation. */
  records: MemoryRecord[];
  /** Carried through when the original had an attachment. */
  attachment?: MemoryRecord["attachmentBlobId"];
}

/**
 * Validate a replacement and produce the exact string that will be stored.
 *
 * The caller shows that string to the user and requires a second confirmation
 * before writing (Section 5.4 rule 6).
 */
export function prepareSupersede(input: SupersedeInput): SupersedeCheck {
  const body = input.body.trim();
  const byId = new Map(input.records.map((r) => [r.memoryBlobId as string, r]));
  const target = byId.get(input.target);

  // A replacement must restate the whole fact, not just the change.
  //
  // The rule is mechanical, not stylistic: search is by meaning, so a bare
  // "actually it's SQLite now" is not semantically near a memory about
  // Postgres. It will not surface on a query about the database, and the stale
  // memory keeps winning.
  if (body.length < MIN_REPLACEMENT_BODY) {
    return {
      ok: false,
      reason: "A replacement must restate the whole fact, not just the change.",
    };
  }
  if (body.length > MAX_BODY) {
    return {
      ok: false,
      reason: `Too long. A memory is at most ${MAX_BODY} characters; this one is ${body.length}.`,
    };
  }

  const credential = detectCredential(body);
  if (credential) {
    return { ok: false, reason: credentialRefusal(credential) };
  }

  if (!target) {
    return { ok: false, reason: "Cannot supersede a memory that is not loaded." };
  }

  if (target.supersededBy) {
    return {
      ok: false,
      reason: "That memory has already been replaced. Supersede the current one instead.",
    };
  }

  // A self-reference cannot arise from the dialog, but a hand-composed call
  // could produce one and it must be refused rather than written.
  if (target.supersedes === input.target) {
    return { ok: false, reason: "A memory cannot supersede itself." };
  }

  let stored: string;
  try {
    stored = encodeHeader(
      {
        scope: input.scope,
        author: input.author,
        ts: nowTs(),
        supersedes: input.target,
        ...(input.attachment ? { src: input.attachment } : {}),
      },
      body
    );
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "The header could not be encoded.",
    };
  }

  return { ok: true, stored };
}

/**
 * Section 5.3 — re-scoping. Storage is append-only, so a scope cannot be
 * edited: a re-scope is a supersession carrying the same body and a new scope.
 */
export function prepareRescope(
  record: MemoryRecord,
  newScope: Exclude<Scope, "unscoped">,
  author: string,
  records: MemoryRecord[]
): SupersedeCheck {
  return prepareSupersede({
    body: record.body,
    scope: newScope,
    author,
    target: record.memoryBlobId,
    records,
    attachment: record.attachmentBlobId,
  });
}

/**
 * Section 5.2 — repair. An unscoped memory is adopted into the system by
 * writing a correctly-headed copy that supersedes it. The original is retained
 * and marked superseded, exactly like any other replacement.
 */
export function prepareRepair(
  record: MemoryRecord,
  scope: Exclude<Scope, "unscoped">,
  author: string,
  records: MemoryRecord[]
): SupersedeCheck {
  return prepareSupersede({
    body: record.body,
    scope,
    author,
    target: record.memoryBlobId,
    records,
  });
}

/**
 * The verbatim warning shown before a TEAM to MINE re-scope (Section 5.3).
 * Promoting MINE to TEAM needs no warning: the new copy is shared and the
 * original was always readable anyway.
 */
export const RETRACTION_WARNING =
  "This does not retract the original. The earlier memory is still stored and still readable by everyone with access to this account. Re-scoping records that it should now be treated as private — it does not make it private. To remove the original permanently, use the Delete panel at memory.walrus.xyz.";

export function needsRetractionWarning(
  from: Scope,
  to: Exclude<Scope, "unscoped">
): boolean {
  return from === "team" && to === "mine";
}
