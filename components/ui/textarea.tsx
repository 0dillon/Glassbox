import * as React from "react"

import { cn } from "@/lib/utils"

/** Rewritten to Section 9. Square, 2px ink border, no ring blur. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-[96px] w-full resize-y border-[2px] border-[var(--ink)]",
        "bg-[var(--paper)] px-[var(--s-3)] py-[var(--s-3)]",
        "text-[var(--t-base)] leading-[var(--lh-base)] text-[var(--ink)]",
        "outline-none transition-colors placeholder:text-[var(--grey-500)]",
        "focus-visible:outline-[3px] focus-visible:outline-solid",
        "focus-visible:outline-[var(--ink)] focus-visible:outline-offset-2",
        "disabled:border-[var(--grey-300)] disabled:bg-[var(--off)] disabled:text-[var(--grey-500)]",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
