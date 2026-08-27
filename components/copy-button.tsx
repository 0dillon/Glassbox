"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";

/** A copy control for identifiers people need to paste elsewhere. */
export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard access can be refused. The value is on screen and selectable,
      // so this is not worth an error state.
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : label}
      className={[
        "inline-flex h-[24px] shrink-0 items-center gap-[var(--s-1)]",
        "border-[2px] border-[var(--ink)] px-[var(--s-2)]",
        "font-mono text-[var(--t-xs)] tracking-[0.08em] uppercase",
        "bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--off)]",
      ].join(" ")}
    >
      {copied ? <CheckIcon size={11} strokeWidth={2.5} /> : <CopyIcon size={11} strokeWidth={2} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
