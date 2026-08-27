import "server-only";

import { isValidAuthor } from "@/lib/header";
import type { CapabilityReport, MissingVar } from "@/lib/types";

/**
 * Section 7 — the environment gate.
 *
 * The app never crashes and never fails silently on a missing key. This module
 * reads the environment once and hands the UI a structured report, so a missing
 * variable renders as a notice instead of an exception.
 */

export const DEFAULT_SERVER_URL = "https://relayer.memory.walrus.xyz";
export const DEFAULT_PUBLISHER = "https://publisher.walrus-testnet.walrus.space";
export const DEFAULT_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";
export const DEFAULT_NAMESPACES = ["default", "team"];

const ENV_FILE = ".env.local in the project root";

function read(name: string): string | null {
  const v = process.env[name];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

let cached: CapabilityReport | null = null;

/**
 * The owner address, resolved once per process by Section 8's ordered probe and
 * written back here. Held separately from the cached report so resolution can
 * happen after the first read.
 */
let resolvedOwner: string | null = null;
let ownerResolutionAttempted = false;

export function setResolvedOwner(owner: string | null) {
  resolvedOwner = owner;
  ownerResolutionAttempted = true;
  cached = null;
}

export function getResolvedOwner(): string | null {
  return resolvedOwner ?? read("MEMWAL_OWNER_ADDRESS");
}

export function ownerProbeAttempted(): boolean {
  return ownerResolutionAttempted;
}

export function getConfig(): CapabilityReport {
  if (cached) return cached;

  const missing: MissingVar[] = [];
  const notices: string[] = [];

  const accountId = read("MEMWAL_ACCOUNT_ID");
  const privateKey = read("MEMWAL_PRIVATE_KEY");
  const rawAuthor = read("GLASSBOX_AUTHOR");

  if (!accountId) {
    missing.push({
      name: "MEMWAL_ACCOUNT_ID",
      enables: "All memory features are disabled. Nothing can be read or recorded.",
      remedy: `Add MEMWAL_ACCOUNT_ID to ${ENV_FILE}, then restart the server. Find it at memory.walrus.xyz — it starts with 0x and is not a secret.`,
    });
  }

  if (!privateKey) {
    missing.push({
      name: "MEMWAL_PRIVATE_KEY",
      enables: "All memory features are disabled. Nothing can be read or recorded.",
      remedy: `Add MEMWAL_PRIVATE_KEY to ${ENV_FILE}, then restart the server. It is your own 64-character delegate key from memory.walrus.xyz. Never reuse someone else's.`,
    });
  }

  // GLASSBOX_AUTHOR set but invalid is treated as missing, and says why.
  let author: string | null = null;
  if (!rawAuthor) {
    missing.push({
      name: "GLASSBOX_AUTHOR",
      enables: "Recording memories is disabled. Reading still works.",
      remedy: `Add GLASSBOX_AUTHOR to ${ENV_FILE}, then restart the server. Use lowercase letters, numbers and hyphens, for example maria-mbp.`,
    });
  } else if (!isValidAuthor(rawAuthor)) {
    missing.push({
      name: "GLASSBOX_AUTHOR",
      enables: "Recording memories is disabled. Reading still works.",
      remedy: `GLASSBOX_AUTHOR must be lowercase letters, numbers and hyphens only. "${rawAuthor}" is not valid. Fix it in ${ENV_FILE}, then restart the server. Use the form firstname-machine, for example maria-mbp.`,
    });
  } else {
    author = rawAuthor;
  }

  const serverUrl = read("MEMWAL_SERVER_URL") ?? DEFAULT_SERVER_URL;
  const publisher = read("WALRUS_PUBLISHER") ?? DEFAULT_PUBLISHER;
  const aggregator = read("WALRUS_AGGREGATOR") ?? DEFAULT_AGGREGATOR;

  const rawNamespaces = read("GLASSBOX_NAMESPACES");
  let namespaces: string[];
  if (rawNamespaces) {
    // Namespaces are exact-match and case-sensitive. Split and trim only —
    // no lowercasing, no normalisation.
    namespaces = rawNamespaces
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    if (namespaces.length === 0) namespaces = [...DEFAULT_NAMESPACES];
  } else {
    namespaces = [...DEFAULT_NAMESPACES];
    notices.push(
      `GLASSBOX_NAMESPACES is not set, so the feed sweeps "${DEFAULT_NAMESPACES.join('" and "')}". Namespaces are exact-match and case-sensitive.`
    );
  }

  const rawScope = read("GLASSBOX_DEFAULT_SCOPE");
  const defaultScope: "mine" | "team" = rawScope === "team" ? "team" : "mine";
  if (rawScope && rawScope !== "team" && rawScope !== "mine") {
    notices.push(
      `GLASSBOX_DEFAULT_SCOPE is "${rawScope}", which is not a scope. Falling back to the safe default, MINE.`
    );
  }

  const canReadText = Boolean(accountId && privateKey);
  const canWrite = canReadText && Boolean(author);

  const owner = getResolvedOwner();
  const canReadMetadata = canReadText && Boolean(owner);

  if (canReadText && !owner && ownerResolutionAttempted) {
    missing.push({
      name: "MEMWAL_OWNER_ADDRESS",
      enables:
        "Supplementary metadata is unavailable: byte sizes, expiry dates, storage status and the credential list. All memory features work.",
      remedy: `Add your account owner address to ${ENV_FILE} to enable supplementary metadata. Find it at memory.walrus.xyz.`,
    });
  }

  cached = {
    canWrite,
    canReadText,
    canReadMetadata,
    // Attachment endpoints need no credential. Reachability is probed at use
    // time by lib/walrus.ts, which flips this off on a failed upload.
    canAttach: true,
    namespaces,
    defaultScope,
    author,
    accountId,
    serverUrl,
    publisher,
    aggregator,
    missing,
    notices,
  };

  return cached;
}

/** Credentials never leave the server. This is what the client is allowed to see. */
export type PublicConfig = Omit<CapabilityReport, never>;

export function getPublicConfig(): PublicConfig {
  const c = getConfig();
  return {
    ...c,
    // The account id is a public object identifier and is safe to show — the
    // rail displays it as a persistent reminder that this memory is shared.
    accountId: c.accountId,
  };
}

/** Truncate the account id for the rail. */
export function shortAccount(accountId: string | null): string {
  if (!accountId) return "NO ACCOUNT";
  if (accountId.length <= 14) return accountId;
  return `${accountId.slice(0, 6)}…${accountId.slice(-4)}`;
}

/** Invalidate the memoised report. Used by the doctor page and after owner probes. */
export function resetConfigCache() {
  cached = null;
}
