"use client";

import type { AppMode } from "@/lib/types";

/**
 * Section 8 — the mode indicator sits in the rail, but the mode is discovered by
 * whichever page last talked to a service. This is a tiny client-side store so
 * the two can meet without prop-drilling through the layout.
 *
 * No network, no persistence. It reflects this tab, right now.
 */

export interface ModeState {
  mode: AppMode;
  reason: string | null;
  /** ISO of the last successful data load, for "Last updated ...". */
  lastGoodAt: string | null;
}

let state: ModeState = { mode: "FULL", reason: null, lastGoodAt: null };

const listeners = new Set<() => void>();

export function setMode(next: Partial<ModeState>) {
  const merged = { ...state, ...next };
  if (
    merged.mode === state.mode &&
    merged.reason === state.reason &&
    merged.lastGoodAt === state.lastGoodAt
  ) {
    return;
  }
  state = merged;
  for (const l of listeners) l();
}

export function subscribeMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getModeSnapshot(): ModeState {
  return state;
}

/** Stable server snapshot so useSyncExternalStore does not warn during SSR. */
const SERVER_SNAPSHOT: ModeState = {
  mode: "FULL",
  reason: null,
  lastGoodAt: null,
};

export function getModeServerSnapshot(): ModeState {
  return SERVER_SNAPSHOT;
}
