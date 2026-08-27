import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Hand-written to Section 9 (9A.e). Same export names as the shadcn original.
 * A hard-bordered block with a slab left edge. `signal` is the missing-key /
 * degraded-mode treatment, one of the five permitted uses of --signal.
 */

function Alert({
  className,
  tone = "signal",
  ...props
}: React.ComponentProps<"div"> & { tone?: "signal" | "ink" | "muted" }) {
  const slab =
    tone === "signal"
      ? "border-l-[var(--signal)]"
      : tone === "ink"
        ? "border-l-[var(--ink)]"
        : "border-l-[var(--grey-300)]"

  return (
    <div
      data-slot="alert"
      role="status"
      className={cn(
        "w-full border-[2px] border-[var(--ink)] border-l-[6px]",
        "bg-[var(--paper)] px-[var(--s-4)] py-[var(--s-3)]",
        slab,
        className
      )}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "font-mono text-[var(--t-xs)] leading-[var(--lh-xs)]",
        "tracking-[0.08em] uppercase text-[var(--ink)]",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "mt-[var(--s-2)] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-700)]",
        "[&>*+*]:mt-[var(--s-1)]",
        className
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
