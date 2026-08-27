"use server";

import { getConfig, getResolvedOwner, shortAccount } from "@/lib/config";
import { encodeHeader, nowTs } from "@/lib/header";
import { canWrite as gateWrite, TIMEOUT_NOTICE } from "@/lib/guards";
import { asMemoryBlobId, type MemoryBlobId } from "@/lib/ids";
import {
  CONTESTED_MAX_DISTANCE,
  health as sdkHealth,
  probeSdk,
  recallNear,
  rememberAndWait,
  resolveOwner,
  restore as sdkRestore,
  sweep,
  delegateAddress,
} from "@/lib/memwal";
import {
  applyContested,
  authorCounts,
  contestedCandidates,
  contestedPairs,
  isContesting,
  linkSupersessions,
  sortNewestFirst,
  toRecord,
  type ContestedPair,
} from "@/lib/resolve";
import { listAgents, listMemories, listNamespaces, metadataMode } from "@/lib/readapi";
import {
  aggregatorUrl,
  assertNotMemoryBlob,
  probeAttachment,
  uploadAttachment,
} from "@/lib/walrus";
import type {
  AgentMeta,
  AppMode,
  FeedPayload,
  LinkProbe,
  MemoryRecord,
  NamespaceMeta,
  Result,
  Scope,
} from "@/lib/types";
import { Err, Ok } from "@/lib/types";

/**
 * Section 2, component B — every outbound call happens here. This is the only
 * place credentials exist. Nothing below is ever imported by a client component.
 */

/* ------------------------------------------------------------------ *
 * Sweep cadence and back-off (Section 8)
 * ------------------------------------------------------------------ */

const BASE_SWEEP_MS = 6000;
const MAX_SWEEP_MS = 60000;

let sweepIntervalMs = BASE_SWEEP_MS;
let consecutiveSweepOk = 0;

/** Contested results cached by memory blob id for 10 minutes. */
const CONTESTED_TTL_MS = 10 * 60 * 1000;
const contestedCache = new Map<string, { at: number; partners: MemoryBlobId[] }>();

/** The last successful resolve, kept so a failed poll can still render something. */
let lastGood: { records: MemoryRecord[]; at: string } | null = null;

/* ------------------------------------------------------------------ *
 * Reading the feed
 * ------------------------------------------------------------------ */

/**
 * One poll tick. Runs the recall sweep, parses headers, links supersessions,
 * detects contested pairs, and merges supplementary metadata when it is
 * available.
 *
 * Never throws. On total failure it returns the last good data with mode
 * OFFLINE, so the screen keeps what it had.
 */
export async function pollMemories(): Promise<FeedPayload> {
  const cfg = getConfig();
  const fetchedAt = new Date().toISOString();

  if (!cfg.canReadText) {
    return {
      records: [],
      mode: "OFFLINE",
      degradedNamespaces: [],
      modeReason:
        "MEMWAL_ACCOUNT_ID and MEMWAL_PRIVATE_KEY are required before anything can be read.",
      fetchedAt,
      authors: [],
      contestedCount: 0,
      supersededCount: 0,
    };
  }

  const swept = await sweep(cfg.namespaces);

  if (!swept.ok) {
    if (swept.code === "RATE_LIMIT") {
      sweepIntervalMs = Math.min(sweepIntervalMs * 2, MAX_SWEEP_MS);
      consecutiveSweepOk = 0;
    }
    // Keep the last successfully rendered data on screen.
    return {
      records: lastGood?.records ?? [],
      mode: swept.code === "RATE_LIMIT" ? "RATE LIMITED" : "OFFLINE",
      degradedNamespaces: cfg.namespaces,
      modeReason: swept.message,
      fetchedAt: lastGood?.at ?? fetchedAt,
      authors: authorCounts(lastGood?.records ?? []),
      contestedCount: contestedPairs(lastGood?.records ?? []).length,
      supersededCount: (lastGood?.records ?? []).filter((r) => r.supersededBy).length,
    };
  }

  // A successful sweep walks the interval back down.
  consecutiveSweepOk++;
  if (consecutiveSweepOk >= 2 && sweepIntervalMs > BASE_SWEEP_MS) {
    sweepIntervalMs = Math.max(BASE_SWEEP_MS, Math.floor(sweepIntervalMs / 2));
  }

  let records = linkSupersessions(swept.value.rows.map(toRecord));

  // Re-apply cached contested pairs so a tile does not flicker between passes.
  const cachedPairs: ContestedPair[] = [];
  for (const r of records) {
    const hit = contestedCache.get(r.memoryBlobId);
    if (hit && Date.now() - hit.at < CONTESTED_TTL_MS) {
      for (const partner of hit.partners) {
        cachedPairs.push({ a: r.memoryBlobId, b: partner });
      }
    }
  }
  records = applyContested(records, cachedPairs);

  // Contested detection for anything not already checked.
  const rateLimited = sweepIntervalMs > BASE_SWEEP_MS;
  const found = await detectContested(records, rateLimited);
  records = applyContested(records, found);

  // Supplementary metadata, when the signed API is available.
  let mode: AppMode = "FULL";
  let modeReason: string | null = null;

  // The metadata API is addressed by the account OWNER address, which is not the
  // delegate address and is not in the environment by default. Resolve it once
  // per process here, or the feed can never leave TEXT-ONLY mode however
  // healthy the signed API is.
  if (!getResolvedOwner()) {
    await resolveOwner();
  }

  const meta = await listMemories();
  if (meta.ok) {
    const byBlob = new Map(meta.value.map((m) => [m.memoryBlobId as string, m]));
    records = records.map((r) => {
      const m = byBlob.get(r.memoryBlobId);
      if (!m) return r;
      return {
        ...r,
        memoryId: m.memoryId,
        sizeBytes: m.sizeBytes,
        status: m.status,
        endEpoch: m.endEpoch,
        expiresAt: m.expiresAt,
        source: "recall+metadata" as const,
      };
    });
  } else {
    mode = "TEXT-ONLY";
    modeReason =
      "TEXT-ONLY MODE — supplementary metadata unavailable. All memory features work.";
  }

  if (swept.value.degraded.length > 0) {
    mode = "DEGRADED";
    modeReason = `Recall failed in ${swept.value.degraded
      .map((d) => d.namespace)
      .join(", ")}: ${swept.value.degraded[0].message}`;
  } else if (rateLimited) {
    mode = "RATE LIMITED";
    modeReason = `Rate limited. The sweep has slowed to every ${Math.round(
      sweepIntervalMs / 1000
    )} seconds. Nothing has been lost.`;
  }

  const sorted = sortNewestFirst(records);
  lastGood = { records: sorted, at: fetchedAt };

  return {
    records: sorted,
    mode,
    degradedNamespaces: swept.value.degraded.map((d) => d.namespace),
    modeReason,
    fetchedAt,
    authors: authorCounts(sorted),
    contestedCount: contestedPairs(sorted).length,
    supersededCount: sorted.filter((r) => r.supersededBy).length,
  };
}

/** How long the client should wait before the next tick. */
export async function currentSweepInterval(): Promise<number> {
  return sweepIntervalMs;
}

/**
 * Section 5.5 — contested detection, for concurrent and cross-machine
 * contradictions.
 */
/**
 * Contested detection is the expensive half of a pass: one extra recall per
 * candidate, each a second or more against the live relayer. This budget keeps
 * a pass from outrunning the poll interval; leftover candidates are simply
 * picked up on a later tick, since nothing here is time-critical.
 */
const CONTESTED_BUDGET_MS = 4000;

async function detectContested(
  records: MemoryRecord[],
  rateLimited: boolean
): Promise<ContestedPair[]> {
  const candidates = contestedCandidates(records, rateLimited ? 2 : 8).filter(
    (r) => !contestedCache.has(r.memoryBlobId)
  );
  if (candidates.length === 0) return [];

  const byId = new Map(records.map((r) => [r.memoryBlobId as string, r]));
  const pairs: ContestedPair[] = [];
  const deadline = Date.now() + CONTESTED_BUDGET_MS;

  for (const subject of candidates) {
    if (Date.now() > deadline) break;
    const near = await recallNear(subject.body, subject.namespace, 5);
    if (!near.ok) {
      // A failed check is not a finding. Leave it uncached so it retries later.
      continue;
    }

    const partners: MemoryBlobId[] = [];
    for (const hit of near.value) {
      const candidate = byId.get(hit.memoryBlobId);
      if (isContesting(subject, candidate, hit.distance, CONTESTED_MAX_DISTANCE)) {
        partners.push(hit.memoryBlobId);
        pairs.push({ a: subject.memoryBlobId, b: hit.memoryBlobId });
      }
    }

    contestedCache.set(subject.memoryBlobId, { at: Date.now(), partners });
  }

  return pairs;
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

export interface RecordOutcome {
  memoryBlobId: string;
  stored: string;
}

/**
 * Compose the exact string that will be stored, without writing it.
 *
 * Section 5.4 rule 6: the user sees this before confirming any supersession,
 * re-scope or repair.
 */
export async function previewStored(
  body: string,
  scope: Exclude<Scope, "unscoped">,
  supersedes?: string
): Promise<Result<string>> {
  const cfg = getConfig();
  if (!cfg.author) {
    return Err("NO_AUTHOR", "GLASSBOX_AUTHOR is not set, so nothing can be composed.");
  }
  try {
    return Ok(
      encodeHeader(
        {
          scope,
          author: cfg.author,
          ts: nowTs(),
          ...(supersedes ? { supersedes: asMemoryBlobId(supersedes) } : {}),
        },
        body.trim()
      )
    );
  } catch (e) {
    return Err("ENCODE", e instanceof Error ? e.message : "Could not compose the header.");
  }
}

/**
 * Section 5.5 — validate a replacement and return the exact string that will be
 * stored, without writing it. The dialog shows this before the second confirm.
 */
export async function composeSupersede(
  body: string,
  scope: Exclude<Scope, "unscoped">,
  target: string
): Promise<Result<string>> {
  const cfg = getConfig();
  if (!cfg.canWrite) {
    return Err("NO_WRITE", "Recording is disabled on this machine.");
  }

  const records = lastGood?.records ?? [];
  const record = records.find((r) => r.memoryBlobId === target);

  const { prepareSupersede } = await import("@/lib/supersede");
  const prepared = prepareSupersede({
    body,
    scope,
    author: cfg.author!,
    target: asMemoryBlobId(target),
    records,
    attachment: record?.attachmentBlobId ?? undefined,
  });

  if (!prepared.ok) return Err("SUPERSEDE", prepared.reason);
  return Ok(prepared.stored);
}

/**
 * The primary write path. Runs the never-store gate and the write-trigger rules
 * before calling the relayer, and never retries automatically.
 */
export async function recordMemory(
  body: string,
  scope: Exclude<Scope, "unscoped">,
  namespace: string
): Promise<Result<RecordOutcome>> {
  const cfg = getConfig();

  if (!cfg.canWrite) {
    return Err(
      "NO_WRITE",
      cfg.canReadText
        ? "Recording is disabled because GLASSBOX_AUTHOR is not set. Reading still works."
        : "Recording is disabled because this machine has no credential configured."
    );
  }

  const gate = gateWrite(body, scope, namespace, {
    existing: lastGood?.records ?? [],
    author: cfg.author!,
  });
  if (!gate.ok) return Err("GATE", gate.reason);

  let stored: string;
  try {
    stored = encodeHeader({ scope, author: cfg.author!, ts: nowTs() }, body.trim());
  } catch (e) {
    return Err("ENCODE", e instanceof Error ? e.message : "Could not compose the header.");
  }

  const written = await rememberAndWait(stored, namespace);
  if (!written.ok) {
    // A timeout does NOT mean the write failed, and must never be retried.
    if (written.code === "TIMEOUT") {
      return Err("TIMEOUT", TIMEOUT_NOTICE);
    }
    return Err(written.code, written.message);
  }

  return Ok({ memoryBlobId: written.value.memoryBlobId, stored });
}

/**
 * Write a pre-composed string. Used by supersession, re-scope and repair, where
 * the exact stored bytes were already shown to the user and confirmed.
 *
 * The never-store gate still runs — a confirmation does not exempt a credential.
 */
export async function recordComposed(
  stored: string,
  namespace: string
): Promise<Result<RecordOutcome>> {
  const cfg = getConfig();
  if (!cfg.canWrite) {
    return Err("NO_WRITE", "Recording is disabled on this machine.");
  }

  const { detectCredential, credentialRefusal } = await import("@/lib/guards");
  const credential = detectCredential(stored);
  if (credential) return Err("GATE", credentialRefusal(credential));

  const written = await rememberAndWait(stored, namespace);
  if (!written.ok) {
    if (written.code === "TIMEOUT") return Err("TIMEOUT", TIMEOUT_NOTICE);
    return Err(written.code, written.message);
  }
  return Ok({ memoryBlobId: written.value.memoryBlobId, stored });
}

/* ------------------------------------------------------------------ *
 * Storage, team and proof
 * ------------------------------------------------------------------ */

export async function rebuildIndex(
  namespace: string
): Promise<Result<{ restored: number; skipped: number; total: number }>> {
  const r = await sdkRestore(namespace, 50);
  if (!r.ok) return r;
  return Ok({ restored: r.value.restored, skipped: r.value.skipped, total: r.value.total });
}

export async function relayerHealth() {
  return sdkHealth();
}

export async function namespaceTotals(): Promise<Result<NamespaceMeta[]>> {
  return listNamespaces();
}

export async function credentials(): Promise<Result<AgentMeta[]>> {
  return listAgents();
}

export async function metadataStatus(): Promise<{ ok: boolean; reason: string | null }> {
  return metadataMode();
}

export async function ensureOwner(): Promise<string | null> {
  const existing = getResolvedOwner();
  if (existing) return existing;
  return resolveOwner();
}

export async function probeLink(attachmentBlobId: string): Promise<LinkProbe> {
  const known = new Set((lastGood?.records ?? []).map((r) => r.memoryBlobId as string));
  return probeAttachment(attachmentBlobId, known);
}

export async function attachFile(
  fileName: string,
  bytesBase64: string
): Promise<Result<{ attachmentBlobId: string; sizeBytes: number; endEpoch: number | null }>> {
  return uploadAttachment(fileName, bytesBase64);
}

/**
 * The aggregator URL for an attachment, guarded by `assertNotMemoryBlob` before
 * it is ever rendered (Section 5.7).
 */
export async function attachmentUrl(attachmentBlobId: string): Promise<string> {
  const known = new Set((lastGood?.records ?? []).map((r) => r.memoryBlobId as string));
  try {
    assertNotMemoryBlob(attachmentBlobId, known);
  } catch {
    // Return a URL that will be reported as LINK ERROR by probeLink rather than
    // silently pointing somewhere wrong.
    return aggregatorUrl(attachmentBlobId);
  }
  return aggregatorUrl(attachmentBlobId);
}

/**
 * An attachment cannot be added to an existing memory — storage is append-only.
 * It is recorded as a replacement carrying the `src` reference.
 */
export async function composeAttachment(
  target: string,
  attachmentBlobId: string
): Promise<Result<string>> {
  const cfg = getConfig();
  if (!cfg.canWrite) {
    return Err("NO_WRITE", "Recording is disabled on this machine.");
  }

  const records = lastGood?.records ?? [];
  const record = records.find((r) => r.memoryBlobId === target);
  if (!record) {
    return Err("SUPERSEDE", "Cannot supersede a memory that is not loaded.");
  }

  const { prepareSupersede } = await import("@/lib/supersede");
  const { parsedAttachmentBlobId } = await import("@/lib/ids");

  const prepared = prepareSupersede({
    body: record.body,
    scope: record.scope === "team" ? "team" : "mine",
    author: cfg.author!,
    target: asMemoryBlobId(target),
    records,
    attachment: parsedAttachmentBlobId(attachmentBlobId),
  });

  if (!prepared.ok) return Err("SUPERSEDE", prepared.reason);
  return Ok(prepared.stored);
}

/* ------------------------------------------------------------------ *
 * Diagnostics
 * ------------------------------------------------------------------ */

export interface ConnectivityCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export async function checkConnectivity(): Promise<ConnectivityCheck[]> {
  const cfg = getConfig();
  const out: ConnectivityCheck[] = [];

  out.push({
    name: "Account",
    ok: Boolean(cfg.accountId),
    detail: cfg.accountId
      ? `${shortAccount(cfg.accountId)} — this is a public object identifier, safe to share.`
      : "MEMWAL_ACCOUNT_ID is not set.",
  });

  if (!cfg.canReadText) {
    out.push({
      name: "Relayer health",
      ok: false,
      detail: "Skipped. No credential is configured.",
    });
    return out;
  }

  const caps = probeSdk();
  out.push({
    name: "SDK write method",
    ok: caps.writeStrategy !== "none",
    detail:
      caps.writeStrategy === "none"
        ? "No usable write method was found on the installed SDK. Reading still works."
        : `Using the ${caps.writeStrategy} strategy.`,
  });

  const h = await sdkHealth();
  out.push({
    name: "Relayer health",
    ok: h.ok,
    detail: h.ok
      ? `${h.value.status}${h.value.version ? ` — version ${h.value.version}` : ""}. This endpoint is unauthenticated, so it proves the relayer is reachable but says nothing about whether this machine's credential works.`
      : h.message,
  });

  const addr = await delegateAddress();
  out.push({
    name: "Delegate address",
    ok: addr.ok,
    detail: addr.ok ? addr.value : addr.message,
  });

  const owner = await ensureOwner();
  out.push({
    name: "Account owner address",
    ok: Boolean(owner),
    detail: owner
      ? owner
      : "Could not be resolved. Supplementary metadata is unavailable; every memory feature still works.",
  });

  const md = await metadataMode();
  out.push({
    name: "Metadata API",
    ok: md.ok,
    detail: md.ok
      ? "Signed requests are accepted. Byte sizes, expiry and the credential list are available."
      : (md.reason ??
        "Unavailable. TEXT-ONLY MODE: all memory features work without it."),
  });

  return out;
}
