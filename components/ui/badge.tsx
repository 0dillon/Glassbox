import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Rewritten to Section 9. Square, mono, uppercase, monochrome.
 * `signal` is reserved for CONTESTED, per the five permitted uses of --signal.
 */
const badgeVariants = cva(
  [
    "inline-flex h-[20px] w-fit shrink-0 items-center justify-center gap-[var(--s-1)]",
    "border-[2px] px-[var(--s-2)] whitespace-nowrap",
    "font-mono text-[var(--t-xs)] leading-none tracking-[0.08em] uppercase",
    "[&>svg]:size-3",
  ].join(" "),
  {
    variants: {
      variant: {
        /** Filled. Reads as public / affirmed. */
        default: "bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]",
        /** Outlined. Reads as personal / scoped. */
        outline: "bg-[var(--paper)] text-[var(--ink)] border-[var(--ink)]",
        /** Muted outline. Reads as provisional / unknown. */
        muted: "bg-[var(--paper)] text-[var(--grey-500)] border-[var(--grey-300)]",
        /** Recessed. Neutral metadata. */
        secondary: "bg-[var(--off)] text-[var(--grey-700)] border-[var(--grey-300)]",
        /** The single permitted --signal badge: CONTESTED. */
        signal: "bg-[var(--paper)] text-[var(--signal)] border-[var(--signal)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
