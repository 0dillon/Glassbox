"use client";

import { useState } from "react";
import { XIcon } from "lucide-react";

import { shortAccountClient } from "@/lib/short-account";

/**
 * Section 11 — what a brand-new joiner sees on first recall.
 *
 * Dismissible, at the top of the feed, so the memory never reads as local.
 */
export function JoinedNotice({
  accountId,
  memories,
  people,
}: {
  accountId: string | null;
  memories: number;
  people: number;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="relative mb-[var(--s-6)] border-[2px] border-[var(--ink)] border-l-[6px] bg-[var(--off)] p-[var(--s-5)]">
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="absolute top-[var(--s-3)] right-[var(--s-3)] flex h-[24px] w-[24px] items-center justify-center border-[2px] border-transparent hover:border-[var(--ink)]"
      >
        <XIcon size={14} strokeWidth={2.5} />
      </button>

      <div className="label label-ink">JOINED SHARED MEMORY</div>
      <p className="mono mt-[var(--s-2)] text-[var(--t-sm)]">
        Account {shortAccountClient(accountId)}
      </p>
      <p className="mt-[var(--s-2)] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--ink)]">
        {memories} {memories === 1 ? "memory" : "memories"} recorded by {people}{" "}
        {people === 1 ? "other person" : "other people"} before you joined.
      </p>
      <p className="mt-[var(--s-1)] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-700)]">
        Everything below was written by your team, not by this browser.
      </p>
    </div>
  );
}
