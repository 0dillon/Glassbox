import type { AttachmentBlobId, MemoryBlobId } from "@/lib/ids";

/** Section 5.1 — the one record type the whole UI renders. */

export type Scope = "team" | "mine" | "unscoped";
export type RecordSource = "recall" | "recall+metadata" | "optimistic";

export interface MemoryRecord {
  /** Join key and identity. Never a bare `blobId`. */
  memoryBlobId: MemoryBlobId;
  /** Human-readable text, header stripped. Never shown with the header. */
  body: string;
  /** Exactly what is stored, header included. Shown only in the proof panel. */
  raw: string;

  /** From the header. "unscoped" means the header was absent or unparseable. */
  scope: Scope;
  /** From the header. "unknown" when unscoped. */
  author: string;
  /** ISO 8601 from the header. Null when unscoped. */
  writtenAt: string | null;
  /** Which memory space. Exact-match, case-sensitive. */
  namespace: string;

  /** From the header. */
  supersedes: MemoryBlobId | null;
  /** Computed by resolve.ts on every pass. Never stored. */
  supersededBy: MemoryBlobId | null;
  /** Computed by resolve.ts on every pass. Never stored. */
  contestedWith: MemoryBlobId[];

  /** From the header. A different kind of blob. See Section 5.7. */
  attachmentBlobId: AttachmentBlobId | null;

  /** Metadata API only. Null without it. */
  memoryId: string | null;
  /** Metadata API only. */
  sizeBytes: number | null;
  status: "active" | "expired" | "unknown";
  /** Metadata API only. */
  endEpoch: number | null;
  /** Metadata API only. */
  expiresAt: string | null;

  /** False when parsing failed. Drives the UNSCOPED treatment. */
  headerOk: boolean;
  /** Which data path produced this. Surfaced in the UI. */
  source: RecordSource;
}

/** Section 5.2 — the fields carried by the in-text header. */
export interface HeaderFields {
  scope: Exclude<Scope, "unscoped">;
  author: string;
  ts: string;
  supersedes?: MemoryBlobId;
  src?: AttachmentBlobId;
}

/**
 * Section 8 — every adapter function returns this. A network failure never
 * throws into a render.
 */
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string };

export const Ok = <T,>(value: T): Result<T> => ({ ok: true, value });
export const Err = <T,>(code: string, message: string): Result<T> => ({
  ok: false,
  code,
  message,
});

/** Section 7 — what lib/config.ts hands the UI. */
export interface MissingVar {
  name: string;
  enables: string;
  remedy: string;
}

export interface CapabilityReport {
  /** account id, private key and a valid author all present */
  canWrite: boolean;
  /** account id and private key present */
  canReadText: boolean;
  /** the above, plus an owner address resolved */
  canReadMetadata: boolean;
  /** publisher and aggregator reachable */
  canAttach: boolean;
  namespaces: string[];
  defaultScope: "mine" | "team";
  author: string | null;
  accountId: string | null;
  serverUrl: string;
  publisher: string;
  aggregator: string;
  missing: MissingVar[];
  notices: string[];
}

/** Section 8 — which data path is live. Shown in the rail. */
export type AppMode = "FULL" | "TEXT-ONLY" | "DEGRADED" | "OFFLINE" | "RATE LIMITED";

/** Section 11 — proof link liveness. */
export type LinkStatus =
  | "RESOLVES"
  | "CHECKING"
  | "EXPIRED"
  | "UNREACHABLE"
  | "LINK ERROR";

export interface LinkProbe {
  status: LinkStatus;
  sizeBytes: number | null;
  detail: string | null;
}

/** What the feed poll hands the client on every tick. */
export interface FeedPayload {
  records: MemoryRecord[];
  mode: AppMode;
  degradedNamespaces: string[];
  /** Human-readable reason when mode is not FULL. */
  modeReason: string | null;
  fetchedAt: string;
  authors: Array<{ author: string; count: number }>;
  contestedCount: number;
  supersededCount: number;
}

/** Supplementary metadata merged in by the signed REST API (Section 9 / Appendix B). */
export interface MemoryMeta {
  memoryId: string;
  memoryBlobId: MemoryBlobId;
  namespace: string;
  sizeBytes: number | null;
  status: "active" | "expired" | "unknown";
  endEpoch: number | null;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface NamespaceMeta {
  id: string;
  name: string;
  memoryCount: number;
  storageUsed: number | null;
  updatedAt: string | null;
}

export interface AgentMeta {
  label: string;
  suiAddress: string;
}
