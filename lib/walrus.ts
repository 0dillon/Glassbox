import "server-only";

import { getConfig } from "@/lib/config";
import { noteFallback } from "@/lib/fallbacks";
import { asAttachmentBlobId, type AttachmentBlobId } from "@/lib/ids";
import { Err, Ok, type LinkProbe, type Result } from "@/lib/types";

/**
 * Section 2, component G — the attachment store. No credentials involved.
 *
 * Uploads bytes to a Walrus publisher over HTTP, reads them back from a Walrus
 * aggregator, and liveness-checks proof links.
 */

/** Public endpoints cap request bodies at 10 MiB. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * Section 11 — attachments are stored for the maximum purchasable period.
 * 53 is the maximum a Walrus blob can be bought for. A dead link is worse than
 * no link, so we never buy less.
 */
export const STORAGE_EPOCHS = 53;

/** Liveness probes are cached for 10 minutes per identifier. */
const PROBE_TTL_MS = 10 * 60 * 1000;
const probeCache = new Map<string, { at: number; probe: LinkProbe }>();

export class BlobKindError extends Error {}

/**
 * Section 5.7 — the runtime check that catches a mix-up.
 *
 * Compile-time branding does not survive a string parsed out of a header, so
 * this runs before EVERY aggregator fetch and before rendering EVERY attachment
 * URL.
 *
 * The behavioural signature matters: an attachment blob fetches successfully
 * from a public aggregator with no credentials; a memory blob does not. A
 * memory blob id in an aggregator URL therefore fails in a way that looks like
 * an expired attachment — which is exactly the silent wrong-link this guard
 * exists to catch.
 */
export function assertNotMemoryBlob(id: string, knownMemoryBlobIds: Set<string>): void {
  if (knownMemoryBlobIds.has(id)) {
    throw new BlobKindError(
      "LINK ERROR — this points at a memory, not an attachment. Report this."
    );
  }
}

export function aggregatorUrl(attachmentBlobId: AttachmentBlobId | string): string {
  return `${getConfig().aggregator}/v1/blobs/${attachmentBlobId}`;
}

/* ------------------------------------------------------------------ *
 * Upload
 * ------------------------------------------------------------------ */

interface PublisherResponse {
  newlyCreated?: {
    blobObject?: {
      blobId?: unknown;
      size?: unknown;
      storage?: { endEpoch?: unknown };
    };
  };
  alreadyCertified?: {
    blobId?: unknown;
    endEpoch?: unknown;
  };
}

/**
 * Upload one file.
 *
 * The response comes back in one of two shapes and both are handled.
 * `alreadyCertified` arrives when identical bytes were already stored for long
 * enough — and because blob ids are content-derived, duplicates are common.
 * Code handling only `newlyCreated` breaks on the first repeated upload.
 */
export async function uploadAttachment(
  fileName: string,
  bytesBase64: string
): Promise<Result<{ attachmentBlobId: string; sizeBytes: number; endEpoch: number | null }>> {
  const cfg = getConfig();

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(bytesBase64, "base64"));
  } catch {
    return Err("DECODE", `Could not read the bytes of ${fileName}.`);
  }

  if (bytes.byteLength === 0) {
    return Err("EMPTY", "That file is empty.");
  }
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    return Err("TOO_LARGE", "Attachments are limited to 10 MB.");
  }

  const url = `${cfg.publisher}/v1/blobs?epochs=${STORAGE_EPOCHS}&deletable=true`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "PUT",
      body: bytes as unknown as BodyInit,
      cache: "no-store",
    });
  } catch (e) {
    noteFallback(
      "Attachment upload",
      `The Walrus publisher could not be reached: ${e instanceof Error ? e.message : String(e)}`,
      "Attachments are disabled. Every other feature is unaffected; attachments are never on the demo path."
    );
    return Err("OFFLINE", "Attachment storage unreachable.");
  }

  if (!res.ok) {
    return Err("HTTP", `The Walrus publisher returned ${res.status}.`);
  }

  let body: PublisherResponse;
  try {
    body = (await res.json()) as PublisherResponse;
  } catch {
    return Err("PARSE", "The Walrus publisher returned a body that is not JSON.");
  }

  const created = body.newlyCreated?.blobObject;
  const certified = body.alreadyCertified;

  const rawId =
    typeof created?.blobId === "string"
      ? created.blobId
      : typeof certified?.blobId === "string"
        ? certified.blobId
        : null;

  if (!rawId) {
    return Err(
      "SHAPE",
      "The Walrus publisher response carried neither newlyCreated nor alreadyCertified."
    );
  }

  const endEpoch =
    typeof created?.storage?.endEpoch === "number"
      ? created.storage.endEpoch
      : typeof certified?.endEpoch === "number"
        ? certified.endEpoch
        : null;

  return Ok({
    attachmentBlobId: asAttachmentBlobId(rawId),
    sizeBytes:
      typeof created?.size === "number" ? created.size : bytes.byteLength,
    endEpoch,
  });
}

/* ------------------------------------------------------------------ *
 * Liveness (Section 11)
 * ------------------------------------------------------------------ */

/**
 * Every proof link is liveness-checked before it is presented. A dead link
 * renders as EXPIRED with the reason, never as a live link.
 *
 * When an aggregator fetch 404s, `assertNotMemoryBlob` runs again before
 * reporting EXPIRED, so a mix-up is reported as a mix-up rather than as expiry.
 */
export async function probeAttachment(
  attachmentBlobId: string,
  knownMemoryBlobIds: Set<string>
): Promise<LinkProbe> {
  try {
    assertNotMemoryBlob(attachmentBlobId, knownMemoryBlobIds);
  } catch (e) {
    return {
      status: "LINK ERROR",
      sizeBytes: null,
      detail:
        e instanceof BlobKindError
          ? "This points at a memory, not an attachment. Report this."
          : "This identifier is not an attachment.",
    };
  }

  const cached = probeCache.get(attachmentBlobId);
  if (cached && Date.now() - cached.at < PROBE_TTL_MS) {
    return cached.probe;
  }

  const url = aggregatorUrl(attachmentBlobId);

  const record = (probe: LinkProbe): LinkProbe => {
    probeCache.set(attachmentBlobId, { at: Date.now(), probe });
    return probe;
  };

  // Immediately after upload, an aggregator behind a CDN can briefly serve a
  // cached 404 from before the blob propagated. Retry a first read with backoff
  // rather than treating the 404 as truth.
  const delays = [0, 1000, 3000];

  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) {
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        cache: "no-store",
      });
    } catch {
      if (attempt === delays.length - 1) {
        return record({
          status: "UNREACHABLE",
          sizeBytes: null,
          detail: "Could not verify. The aggregator did not respond.",
        });
      }
      continue;
    }

    if (res.status === 404) {
      if (attempt < delays.length - 1) continue;
      // Re-run the guard so a mix-up is reported as a mix-up, not as expiry.
      try {
        assertNotMemoryBlob(attachmentBlobId, knownMemoryBlobIds);
      } catch {
        return record({
          status: "LINK ERROR",
          sizeBytes: null,
          detail: "This points at a memory, not an attachment. Report this.",
        });
      }
      return record({
        status: "EXPIRED",
        sizeBytes: null,
        detail: "Storage period ended. This file is no longer on Walrus.",
      });
    }

    if (res.ok || res.status === 206) {
      // A Range request answers with Content-Range: bytes 0-0/<total>.
      const contentRange = res.headers.get("content-range");
      const total = contentRange?.split("/")[1];
      const parsedTotal = total ? Number(total) : Number.NaN;
      const contentLength = Number(res.headers.get("content-length"));

      const sizeBytes = Number.isFinite(parsedTotal)
        ? parsedTotal
        : res.status === 200 && Number.isFinite(contentLength)
          ? contentLength
          : null;

      return record({ status: "RESOLVES", sizeBytes, detail: null });
    }

    if (attempt === delays.length - 1) {
      return record({
        status: "UNREACHABLE",
        sizeBytes: null,
        detail: `Could not verify. The aggregator returned ${res.status}.`,
      });
    }
  }

  return record({
    status: "UNREACHABLE",
    sizeBytes: null,
    detail: "Could not verify. The aggregator did not respond.",
  });
}
