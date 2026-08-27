import "server-only";

import { MemWal } from "@mysten-incubation/memwal";

import { getConfig, setResolvedOwner } from "@/lib/config";
import { asMemoryBlobId } from "@/lib/ids";
import type { MemoryBlobId } from "@/lib/ids";
import { Err, Ok, type Result } from "@/lib/types";
import { noteFallback } from "@/lib/fallbacks";

/**
 * Section 2, component C — the SDK adapter. Owns memory TEXT.
 * This is the component the demo depends on.
 *
 * Every function returns a Result. Nothing here throws into a render.
 */

/** Section 8 — the feed sweep threshold. Under 0.25 is near-duplicate, 0.7+ unrelated. */
export const FEED_MAX_DISTANCE = 0.7;
/** Section 5.5 — contested detection is a tighter net. */
export const CONTESTED_MAX_DISTANCE = 0.35;

/**
 * A deliberately broad net across the memory types in Section 5A.
 * There is no cross-namespace search, so this runs once per namespace.
 */
export const FEED_QUERY = "decision constraint convention promise correction";

export interface RecallRow {
  memoryBlobId: MemoryBlobId;
  text: string;
  distance: number;
  namespace: string;
}

export interface WriteOutcome {
  memoryBlobId: MemoryBlobId;
  owner: string | null;
  namespace: string;
}

let client: MemWal | null = null;
let clientError: string | null = null;

function getClient(): Result<MemWal> {
  const cfg = getConfig();
  if (!cfg.canReadText) {
    return Err(
      "NO_CREDENTIALS",
      "MEMWAL_ACCOUNT_ID and MEMWAL_PRIVATE_KEY are required before anything can be read or recorded."
    );
  }
  if (client) return Ok(client);
  if (clientError) return Err("CLIENT_INIT", clientError);

  try {
    client = MemWal.create({
      key: process.env.MEMWAL_PRIVATE_KEY!,
      accountId: process.env.MEMWAL_ACCOUNT_ID!,
      serverUrl: cfg.serverUrl,
      namespace: cfg.namespaces[0] ?? "default",
    });
    return Ok(client);
  } catch (e) {
    clientError = e instanceof Error ? e.message : String(e);
    return Err("CLIENT_INIT", `The memory client could not be created: ${clientError}`);
  }
}

/* ------------------------------------------------------------------ *
 * Section 8 — probe the client rather than assuming a method exists.
 * ------------------------------------------------------------------ */

export interface SdkCapabilities {
  rememberAndWait: boolean;
  remember: boolean;
  waitForRememberJob: boolean;
  recall: boolean;
  restore: boolean;
  health: boolean;
  compatibility: boolean;
  /** Which write strategy the adapter will actually use. */
  writeStrategy: "rememberAndWait" | "remember+wait" | "remember+poll" | "none";
}

let capabilities: SdkCapabilities | null = null;

export function probeSdk(): SdkCapabilities {
  if (capabilities) return capabilities;

  const c = getClient();
  const obj = c.ok ? (c.value as unknown as Record<string, unknown>) : null;
  const has = (name: string) => Boolean(obj && typeof obj[name] === "function");

  const rememberAndWait = has("rememberAndWait");
  const remember = has("remember");
  const waitForRememberJob = has("waitForRememberJob");
  const recall = has("recall");

  let writeStrategy: SdkCapabilities["writeStrategy"] = "none";
  if (rememberAndWait) writeStrategy = "rememberAndWait";
  else if (remember && waitForRememberJob) writeStrategy = "remember+wait";
  else if (remember && recall) writeStrategy = "remember+poll";

  if (writeStrategy !== "rememberAndWait") {
    noteFallback(
      "SDK write method",
      `rememberAndWait is not a function on the MemWal client; using the "${writeStrategy}" strategy instead.`,
      writeStrategy === "none"
        ? "Recording is disabled. Reading is unaffected."
        : "Nothing is lost; writes take the documented alternate path."
    );
  }

  capabilities = {
    rememberAndWait,
    remember,
    waitForRememberJob,
    recall,
    restore: has("restore"),
    health: has("health"),
    compatibility: has("compatibility"),
    writeStrategy,
  };
  return capabilities;
}

/* ------------------------------------------------------------------ *
 * Error shaping
 * ------------------------------------------------------------------ */

function shape(e: unknown, what: string): { code: string; message: string } {
  const raw = e instanceof Error ? e.message : String(e);
  const lower = raw.toLowerCase();

  if (
    lower.includes("401") ||
    lower.includes("unauthor") ||
    lower.includes("forbidden") ||
    // The relayer phrases an unregistered or expired delegate key as a
    // sign-in prompt rather than a status code.
    lower.includes("signed in") ||
    lower.includes("not registered") ||
    lower.includes("memwal_login")
  ) {
    return {
      code: "AUTH",
      message:
        "The relayer rejected this machine's credential. Check that MEMWAL_ACCOUNT_ID matches your team's account, and that your delegate key is still registered on it at memory.walrus.xyz.",
    };
  }
  if (lower.includes("429") || lower.includes("rate limit")) {
    return { code: "RATE_LIMIT", message: "Rate limited by the relayer." };
  }
  if (lower.includes("abort") || lower.includes("timeout") || lower.includes("timed out")) {
    return { code: "TIMEOUT", message: `${what} timed out.` };
  }
  if (
    lower.includes("fetch failed") ||
    lower.includes("enotfound") ||
    lower.includes("econnrefused") ||
    lower.includes("network")
  ) {
    return { code: "OFFLINE", message: `${what} could not reach the relayer.` };
  }
  return { code: "SDK", message: `${what} failed: ${raw}` };
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

/**
 * Store one memory and wait for its blob id.
 *
 * A timeout is reported as TIMEOUT and is NOT retried — the relayer keeps
 * processing after the client stops waiting, so a retry would create a
 * permanent duplicate (Section 5.4).
 */
export async function rememberAndWait(
  stored: string,
  namespace: string,
  timeoutMs = 30000
): Promise<Result<WriteOutcome>> {
  const c = getClient();
  if (!c.ok) return c;

  const caps = probeSdk();
  if (caps.writeStrategy === "none") {
    return Err(
      "NO_WRITE_METHOD",
      "SDK write method unavailable in this version. Reading still works."
    );
  }

  const memwal = c.value;

  try {
    if (caps.writeStrategy === "rememberAndWait") {
      const r = await memwal.rememberAndWait(stored, namespace, { timeoutMs });
      return Ok({
        memoryBlobId: asMemoryBlobId(r.blob_id),
        owner: r.owner ?? null,
        namespace: r.namespace ?? namespace,
      });
    }

    if (caps.writeStrategy === "remember+wait") {
      const accepted = await memwal.remember(stored, namespace);
      const r = await memwal.waitForRememberJob(accepted.job_id, {
        pollIntervalMs: 750,
        timeoutMs,
      });
      return Ok({
        memoryBlobId: asMemoryBlobId(r.blob_id),
        owner: r.owner ?? null,
        namespace: r.namespace ?? namespace,
      });
    }

    // remember + poll recall for the returned blob id, up to 15s.
    await memwal.remember(stored, namespace);
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1000));
      const hits = await memwal.recall({
        query: stored.slice(0, 200),
        namespace,
        limit: 20,
        maxDistance: FEED_MAX_DISTANCE,
      });
      const found = hits.results.find((h) => h.text === stored);
      if (found) {
        return Ok({
          memoryBlobId: asMemoryBlobId(found.blob_id),
          owner: null,
          namespace,
        });
      }
    }
    return Err(
      "TIMEOUT",
      "Write may still be in progress. It will appear in the feed if it succeeded."
    );
  } catch (e) {
    const s = shape(e, "Recording the memory");
    return Err(s.code, s.message);
  }
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/**
 * One recall pass in one namespace. `maxDistance` is always passed — recall has
 * no default relevance threshold.
 */
export async function recallNamespace(
  namespace: string,
  opts: { query?: string; limit?: number; maxDistance?: number } = {}
): Promise<Result<RecallRow[]>> {
  const c = getClient();
  if (!c.ok) return c;

  try {
    const res = await c.value.recall({
      query: opts.query ?? FEED_QUERY,
      namespace,
      limit: opts.limit ?? 100,
      maxDistance: opts.maxDistance ?? FEED_MAX_DISTANCE,
    });

    const rows: RecallRow[] = (res.results ?? []).map((r) => ({
      memoryBlobId: asMemoryBlobId(r.blob_id),
      text: r.text,
      distance: typeof r.distance === "number" ? r.distance : Number.NaN,
      namespace,
    }));
    return Ok(rows);
  } catch (e) {
    const s = shape(e, `Recall in namespace "${namespace}"`);
    return Err(s.code, s.message);
  }
}

export interface SweepResult {
  rows: RecallRow[];
  /** Namespaces whose recall failed this pass. The others still returned. */
  degraded: Array<{ namespace: string; code: string; message: string }>;
}

/**
 * The feed sweep. One recall per namespace, merged by memory blob id.
 *
 * If a namespace errors, the others are kept and that one is marked degraded,
 * rather than failing the whole sweep.
 */
export async function sweep(namespaces: string[]): Promise<Result<SweepResult>> {
  const c = getClient();
  if (!c.ok) return c;

  const settled = await Promise.all(
    namespaces.map(async (ns) => ({ ns, res: await recallNamespace(ns) }))
  );

  const seen = new Map<string, RecallRow>();
  const degraded: SweepResult["degraded"] = [];

  for (const { ns, res } of settled) {
    if (!res.ok) {
      degraded.push({ namespace: ns, code: res.code, message: res.message });
      continue;
    }
    for (const row of res.value) {
      // Merge across namespaces by memory blob id. First writer wins; a blob
      // belongs to exactly one namespace.
      if (!seen.has(row.memoryBlobId)) seen.set(row.memoryBlobId, row);
    }
  }

  // Every namespace failed and there is nothing to show — that is a real error.
  if (degraded.length === namespaces.length && namespaces.length > 0) {
    return Err(degraded[0].code, degraded[0].message);
  }

  return Ok({ rows: [...seen.values()], degraded });
}

/** A tighter recall used only by contested detection (Section 5.5). */
export async function recallNear(
  body: string,
  namespace: string,
  limit = 5
): Promise<Result<RecallRow[]>> {
  return recallNamespace(namespace, {
    query: body,
    limit,
    maxDistance: CONTESTED_MAX_DISTANCE,
  });
}

/* ------------------------------------------------------------------ *
 * Proof and health
 * ------------------------------------------------------------------ */

export interface RestoreOutcome {
  restored: number;
  skipped: number;
  total: number;
  namespace: string;
  owner: string | null;
}

/**
 * Ask the relayer to re-read blobs from Walrus and rebuild missing index
 * entries. This is the proof the record survives independently of the search
 * index (Section 11).
 */
export async function restore(
  namespace: string,
  limit = 50
): Promise<Result<RestoreOutcome>> {
  const c = getClient();
  if (!c.ok) return c;

  if (!probeSdk().restore) {
    return Err("NO_RESTORE", "The installed SDK has no restore method.");
  }

  try {
    const r = await c.value.restore(namespace, limit);
    if (r.owner) setResolvedOwner(r.owner);
    return Ok({
      restored: r.restored ?? 0,
      skipped: r.skipped ?? 0,
      total: r.total ?? 0,
      namespace: r.namespace ?? namespace,
      owner: r.owner ?? null,
    });
  } catch (e) {
    const s = shape(e, "Rebuilding the index");
    return Err(s.code, s.message);
  }
}

export interface HealthOutcome {
  status: string;
  version: string | null;
  relayerVersion: string | null;
  apiVersion: string | null;
  minSupportedSdk: string | null;
}

/**
 * The health endpoint is unauthenticated. Passing proves the relayer is
 * reachable but says nothing about whether this machine's credentials work.
 */
export async function health(): Promise<Result<HealthOutcome>> {
  const c = getClient();
  if (!c.ok) return c;

  if (!probeSdk().health) {
    return Err("NO_HEALTH", "The installed SDK has no health method.");
  }

  try {
    const h = await c.value.health();
    const asRecord = h as unknown as Record<string, unknown>;
    const str = (k: string) =>
      typeof asRecord[k] === "string" ? (asRecord[k] as string) : null;
    return Ok({
      status: str("status") ?? "unknown",
      version: str("version"),
      relayerVersion: str("relayerVersion"),
      apiVersion: str("apiVersion"),
      minSupportedSdk:
        typeof asRecord["minSupportedSdk"] === "string"
          ? (asRecord["minSupportedSdk"] as string)
          : asRecord["minSupportedSdk"]
            ? JSON.stringify(asRecord["minSupportedSdk"])
            : null,
    });
  } catch (e) {
    const s = shape(e, "Health check");
    return Err(s.code, s.message);
  }
}

/* ------------------------------------------------------------------ *
 * Section 8 — owner address resolution, in the documented order.
 * Never guess an owner address; never send the delegate address instead.
 * ------------------------------------------------------------------ */

let ownerProbeRan = false;

export async function resolveOwner(): Promise<string | null> {
  const cfg = getConfig();
  if (!cfg.canReadText) return null;

  // 1. restore(firstNamespace, 1) and read `owner` from the response.
  const first = cfg.namespaces[0] ?? "default";
  const r = await restore(first, 1);
  if (r.ok && r.value.owner) {
    setResolvedOwner(r.value.owner);
    return r.value.owner;
  }

  // 2. A single probe write, at most once per process.
  if (!ownerProbeRan) {
    ownerProbeRan = true;
    const { encodeHeader, nowTs } = await import("@/lib/header");
    try {
      const stored = encodeHeader(
        { scope: "mine", author: "system", ts: nowTs() },
        "Glassbox owner probe."
      );
      const w = await rememberAndWait(stored, "glassbox-probe", 30000);
      if (w.ok && w.value.owner) {
        noteFallback(
          "Owner address resolution",
          "restore() did not return an owner, so a single probe memory was written to the glassbox-probe namespace to read it.",
          "Nothing lost. One probe memory now exists in the glassbox-probe namespace, which the feed does not sweep."
        );
        setResolvedOwner(w.value.owner);
        return w.value.owner;
      }
    } catch {
      // Fall through to the environment variable.
    }
  }

  // 3. The environment variable.
  const fromEnv = process.env.MEMWAL_OWNER_ADDRESS?.trim();
  if (fromEnv) {
    setResolvedOwner(fromEnv);
    return fromEnv;
  }

  // 4. TEXT-ONLY MODE plus a config notice.
  setResolvedOwner(null);
  noteFallback(
    "Owner address resolution",
    "The account owner address could not be resolved from restore(), from a probe write, or from MEMWAL_OWNER_ADDRESS.",
    "TEXT-ONLY MODE: byte sizes, expiry dates, storage status and the credential list are unavailable. All memory features work."
  );
  return null;
}

/** This credential's own Sui address, for the doctor page. */
export async function delegateAddress(): Promise<Result<string>> {
  const cfg = getConfig();
  if (!cfg.canReadText) {
    return Err("NO_CREDENTIALS", "No delegate key is configured.");
  }
  try {
    const { delegateKeyToSuiAddress } = await import("@mysten-incubation/memwal");
    const address = await delegateKeyToSuiAddress(process.env.MEMWAL_PRIVATE_KEY!);
    return Ok(address);
  } catch (e) {
    const s = shape(e, "Deriving the delegate address");
    return Err(s.code, s.message);
  }
}
