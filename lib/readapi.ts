import "server-only";

import * as ed from "@noble/ed25519";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { getConfig, getResolvedOwner } from "@/lib/config";
import { noteFallback } from "@/lib/fallbacks";
import { asMemoryBlobId } from "@/lib/ids";
import {
  Err,
  Ok,
  type AgentMeta,
  type MemoryMeta,
  type NamespaceMeta,
  type Result,
} from "@/lib/types";

/**
 * Section 2, component D — the signed REST adapter (Appendix B).
 *
 * Owns SUPPLEMENTARY metadata: byte sizes, expiry dates, storage status,
 * namespace totals, and the list of credentials with access.
 *
 * OPTIONAL. The app is fully usable without it. If it never works the app loses
 * those fields and nothing else — scope, author and timestamp live in the
 * header, so the whole demo path is unaffected.
 */

/** SHA-256 of an empty byte string, per Appendix B. */
const EMPTY_BODY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/**
 * Once this session goes TEXT-ONLY it stays there. Section 8 is explicit:
 * do not retry 401 in a loop, and do not try alternative URL shapes.
 */
let textOnly = false;
let textOnlyReason: string | null = null;

/** 426 means x-nonce was omitted. Retried exactly once, then TEXT-ONLY. */
let retried426 = false;

/** 429 back-off, doubling to a 60s cap, reset after two consecutive successes. */
let backoffMs = 0;
let backoffUntil = 0;
let consecutiveOk = 0;

function goTextOnly(reason: string) {
  if (textOnly) return;
  textOnly = true;
  textOnlyReason = reason;
  noteFallback(
    "Metadata API",
    reason,
    "TEXT-ONLY MODE. Lost: byte sizes, expiry dates, storage status, memory ids, namespace totals and the credential list. The feed, capture, scopes, supersession, contested detection, the timeline and /team authors all still work."
  );
}

export async function metadataMode(): Promise<{ ok: boolean; reason: string | null }> {
  const cfg = getConfig();
  if (!cfg.canReadText) {
    return { ok: false, reason: "No credential is configured." };
  }
  if (textOnly) return { ok: false, reason: textOnlyReason };
  if (!getResolvedOwner()) {
    return {
      ok: false,
      reason:
        "The account owner address has not been resolved, so the metadata API cannot be addressed.",
    };
  }
  return { ok: true, reason: null };
}

/* ------------------------------------------------------------------ *
 * Request signing (Appendix B)
 * ------------------------------------------------------------------ */

/**
 * The canonical message is the UTF-8 bytes of:
 *   {timestamp}.{method}.{path_and_query}.{body_sha256}.{nonce}.{account_id}
 *
 * `path_and_query` must be byte-identical to what is sent. Any difference,
 * including a re-ordered or re-encoded parameter, invalidates the signature —
 * so the same string is used for both the signature and the URL.
 */
async function signedGet<T>(pathAndQuery: string): Promise<Result<T>> {
  const cfg = getConfig();

  if (!cfg.canReadText) {
    return Err("NO_CREDENTIALS", "No credential is configured.");
  }
  if (textOnly) {
    return Err("TEXT_ONLY", textOnlyReason ?? "The metadata API is unavailable.");
  }
  if (Date.now() < backoffUntil) {
    return Err("RATE_LIMIT", "Backing off after a rate limit from the metadata API.");
  }

  const accountId = process.env.MEMWAL_ACCOUNT_ID!.trim();
  const privateKeyHex = process.env.MEMWAL_PRIVATE_KEY!.trim();

  let signature: string;
  let publicKey: string;
  let timestamp: string;
  let nonce: string;

  try {
    const priv = hexToBytes(privateKeyHex);
    const pub = await ed.getPublicKeyAsync(priv);

    // Unix time in SECONDS, not milliseconds.
    timestamp = Math.floor(Date.now() / 1000).toString();
    // A fresh UUID v4 for every request, single use.
    nonce = crypto.randomUUID();

    const message = `${timestamp}.GET.${pathAndQuery}.${EMPTY_BODY_SHA256}.${nonce}.${accountId}`;
    const sig = await ed.signAsync(utf8ToBytes(message), priv);

    signature = bytesToHex(sig);
    publicKey = bytesToHex(pub);
  } catch (e) {
    goTextOnly(
      `The request could not be signed: ${e instanceof Error ? e.message : String(e)}`
    );
    return Err("SIGN", "The metadata request could not be signed.");
  }

  let res: Response;
  try {
    res = await fetch(`${cfg.serverUrl}${pathAndQuery}`, {
      method: "GET",
      headers: {
        "x-public-key": publicKey,
        "x-signature": signature,
        "x-timestamp": timestamp,
        "x-nonce": nonce,
        // Part of the signed message. Omitting it signs an empty string and
        // always fails.
        "x-account-id": accountId,
      },
      cache: "no-store",
    });
  } catch (e) {
    return Err(
      "OFFLINE",
      `The metadata API could not be reached: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after"));
    backoffMs = Math.min(backoffMs === 0 ? 2000 : backoffMs * 2, 60000);
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 60000;
    backoffUntil = Date.now() + Math.max(waitMs, backoffMs);
    consecutiveOk = 0;
    return Err("RATE_LIMIT", "Rate limited by the metadata API.");
  }

  if (res.status === 426) {
    // x-nonce was omitted. We always send one, so this is unexpected; retry once.
    if (!retried426) {
      retried426 = true;
      return signedGet<T>(pathAndQuery);
    }
    goTextOnly("The metadata API returned 426 twice, which requires a nonce we already send.");
    return Err("TEXT_ONLY", textOnlyReason!);
  }

  if (res.status === 401) {
    // Bare, no body, no detail. Do not retry in a loop, and do not guess at
    // alternative URL shapes or API versions.
    goTextOnly(
      "The metadata API returned 401. The signature, timestamp, nonce or credential registration was rejected."
    );
    return Err("TEXT_ONLY", textOnlyReason!);
  }

  if (res.status === 403) {
    goTextOnly(
      "The metadata API returned 403: the owner address does not match the authenticated identity."
    );
    return Err("TEXT_ONLY", textOnlyReason!);
  }

  if (res.status === 404) {
    // Treated exactly as 401. Do not try alternative URL shapes.
    goTextOnly("The metadata API returned 404 — the route does not exist on this relayer.");
    return Err("TEXT_ONLY", textOnlyReason!);
  }

  if (res.status === 503) {
    return Err("UNAVAILABLE", "The metadata API is temporarily unavailable upstream.");
  }

  if (!res.ok) {
    return Err("HTTP", `The metadata API returned ${res.status}.`);
  }

  consecutiveOk++;
  if (consecutiveOk >= 2) {
    backoffMs = 0;
    backoffUntil = 0;
  }

  try {
    return Ok((await res.json()) as T);
  } catch {
    return Err("PARSE", "The metadata API returned a body that is not JSON.");
  }
}

/* ------------------------------------------------------------------ *
 * Endpoints
 * ------------------------------------------------------------------ */

interface AgentsResponse {
  agents?: Array<{ label?: unknown; sui_address?: unknown }>;
}

/**
 * Implemented first, deliberately: no cursor, no pagination, so it isolates
 * signing from everything else.
 *
 * A live on-chain read of the account's registered credentials — the machines
 * with access. Weighs 2 against the rate budget; the others weigh 1.
 */
export async function listAgents(): Promise<Result<AgentMeta[]>> {
  const owner = getResolvedOwner();
  if (!owner) {
    return Err("NO_OWNER", "The account owner address has not been resolved.");
  }

  const res = await signedGet<AgentsResponse>(`/v1/owners/${owner}/agents`);
  if (!res.ok) return res;

  const agents = Array.isArray(res.value.agents) ? res.value.agents : [];
  return Ok(
    agents
      .map((a) => ({
        label: typeof a.label === "string" ? a.label : "unlabelled",
        suiAddress: typeof a.sui_address === "string" ? a.sui_address : "",
      }))
      .filter((a) => a.suiAddress.length > 0)
  );
}

interface MemoriesResponse {
  memories?: Array<Record<string, unknown>>;
  deleted?: unknown[];
  must_resync?: unknown;
  next_cursor?: unknown;
  has_more?: unknown;
}

/**
 * Walk every page of the memory metadata.
 *
 * End-of-data is determined ONLY from the `has_more` boolean. Never from page
 * length, because `limit` is silently clamped to 500, and never from
 * `next_cursor` being null.
 */
export async function listMemories(): Promise<Result<MemoryMeta[]>> {
  const owner = getResolvedOwner();
  if (!owner) {
    return Err("NO_OWNER", "The account owner address has not been resolved.");
  }

  const out: MemoryMeta[] = [];
  let cursor: string | null = null;
  // A hard stop, so a relayer that always answers has_more cannot spin forever.
  const MAX_PAGES = 25;

  for (let page = 0; page < MAX_PAGES; page++) {
    const query: string = cursor
      ? `?limit=100&updated_after=${encodeURIComponent(cursor)}`
      : "?limit=100";

    const res: Result<MemoriesResponse> = await signedGet<MemoriesResponse>(
      `/v1/owners/${owner}/memories${query}`
    );
    if (!res.ok) {
      // A partial walk is still useful — return what we have rather than nothing.
      return out.length > 0 ? Ok(out) : res;
    }

    const body: MemoriesResponse = res.value;

    if (body.must_resync === true) {
      // The cursor is too old. Discard it and restart the walk.
      noteFallback(
        "Metadata pagination",
        "The relayer reported must_resync, so the cursor was discarded and the walk restarted.",
        "Nothing lost. The next pass re-reads from the beginning."
      );
      out.length = 0;
      cursor = null;
      continue;
    }

    const rows = Array.isArray(body.memories) ? body.memories : null;
    if (!rows) {
      // Malformed page: discard it, keep the previous cursor, continue next tick.
      noteFallback(
        "Metadata pagination",
        "A memories page arrived without a memories array and was discarded.",
        "That page is skipped; the cursor is preserved and the walk resumes on the next pass."
      );
      break;
    }

    for (const row of rows) {
      const blob = row["blob_id"];
      if (typeof blob !== "string" || blob.length === 0) continue;
      const num = (k: string) =>
        typeof row[k] === "number" ? (row[k] as number) : null;
      const str = (k: string) =>
        typeof row[k] === "string" ? (row[k] as string) : null;
      const rawStatus = str("status");

      out.push({
        memoryId: str("memory_id") ?? blob,
        // This is a MEMORY blob id — merge into records by this key.
        memoryBlobId: asMemoryBlobId(blob),
        namespace: str("namespace_id") ?? "",
        sizeBytes: num("size"),
        status:
          rawStatus === "active" || rawStatus === "expired" ? rawStatus : "unknown",
        endEpoch: num("end_epoch"),
        expiresAt: str("expires_at"),
        // The relayer's receipt time. The header ts stays authoritative for
        // display and for the timeline.
        createdAt: str("created_at"),
        updatedAt: str("updated_at"),
      });
    }

    // Continue ONLY while has_more is true.
    if (body.has_more !== true) break;

    const next: unknown = body.next_cursor;
    if (typeof next !== "string" || next.length === 0) break;
    cursor = next;
  }

  return Ok(out);
}

interface NamespacesResponse {
  namespaces?: Array<Record<string, unknown>>;
  next_cursor?: unknown;
  has_more?: unknown;
}

export async function listNamespaces(): Promise<Result<NamespaceMeta[]>> {
  const owner = getResolvedOwner();
  if (!owner) {
    return Err("NO_OWNER", "The account owner address has not been resolved.");
  }

  const out: NamespaceMeta[] = [];
  let cursor: string | null = null;
  const MAX_PAGES = 25;

  for (let page = 0; page < MAX_PAGES; page++) {
    const query: string = cursor
      ? `?limit=100&updated_after=${encodeURIComponent(cursor)}`
      : "?limit=100";

    const res: Result<NamespacesResponse> = await signedGet<NamespacesResponse>(
      `/v1/owners/${owner}/namespaces${query}`
    );
    if (!res.ok) return out.length > 0 ? Ok(out) : res;

    const rows = Array.isArray(res.value.namespaces) ? res.value.namespaces : null;
    if (!rows) break;

    for (const row of rows) {
      const id = typeof row["id"] === "string" ? (row["id"] as string) : null;
      if (!id) continue;
      out.push({
        id,
        name: typeof row["name"] === "string" ? (row["name"] as string) : id,
        memoryCount:
          typeof row["memory_count"] === "number" ? (row["memory_count"] as number) : 0,
        storageUsed:
          typeof row["storage_used"] === "number" ? (row["storage_used"] as number) : null,
        updatedAt:
          typeof row["updated_at"] === "string" ? (row["updated_at"] as string) : null,
      });
    }

    if (res.value.has_more !== true) break;
    const next: unknown = res.value.next_cursor;
    if (typeof next !== "string" || next.length === 0) break;
    cursor = next;
  }

  return Ok(out);
}
