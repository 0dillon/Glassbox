"use client";

import { useSyncExternalStore } from "react";

import {
  getModeServerSnapshot,
  getModeSnapshot,
  subscribeMode,
} from "@/lib/mode-store";
import { relativeTime } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AppMode } from "@/lib/types";

/**
 * Section 8 — surface the path taken.
 *
 * FULL         everything, including supplementary metadata
 * TEXT-ONLY    the metadata API is unavailable; every memory feature works
 * DEGRADED     part of the sweep failed; the rest is live
 * RATE LIMITED backing off
 * OFFLINE      nothing reachable; the last loaded data is still on screen
 */
const EXPLAIN: Record<AppMode, string> = {
  FULL: "Memory text and supplementary metadata are both live.",
  "TEXT-ONLY":
    "Supplementary metadata is unavailable. All memory features work — byte sizes, expiry dates and the credential list are not shown.",
  DEGRADED: "Part of the last sweep failed. What is on screen is still real.",
  "RATE LIMITED":
    "Backing off after a rate limit. Polling has slowed; nothing has been lost.",
  OFFLINE:
    "Nothing could be reached on the last attempt. The data on screen is the last that loaded.",
};

function toneFor(mode: AppMode): string {
  if (mode === "FULL") return "border-[var(--ink)] text-[var(--ink)]";
  if (mode === "TEXT-ONLY" || mode === "DEGRADED" || mode === "RATE LIMITED") {
    return "border-[var(--grey-500)] text-[var(--grey-700)]";
  }
  return "border-[var(--signal)] text-[var(--signal)]";
}

export function ModeIndicator() {
  const state = useSyncExternalStore(
    subscribeMode,
    getModeSnapshot,
    getModeServerSnapshot
  );

  return (
    <div>
      <div className="label">MODE</div>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={[
              "mt-[var(--s-2)] inline-flex w-full items-center justify-center",
              "border-[2px] px-[var(--s-2)] py-[var(--s-1)]",
              "font-mono text-[var(--t-xs)] tracking-[0.08em] uppercase",
              toneFor(state.mode),
            ].join(" ")}
            tabIndex={0}
          >
            {state.mode}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          {state.reason ?? EXPLAIN[state.mode]}
        </TooltipContent>
      </Tooltip>

      {state.lastGoodAt && state.mode !== "FULL" ? (
        <div className="label mt-[var(--s-2)] normal-case tracking-normal">
          Last updated {relativeTime(state.lastGoodAt)}
        </div>
      ) : null}
    </div>
  );
}
