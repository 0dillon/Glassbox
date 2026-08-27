import * as React from "react"

import { cn } from "@/lib/utils"

/** Rewritten to Section 9. Square, 2px ink border, no ring blur. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-[36px] w-full min-w-0 border-[2px] border-[var(--ink)]",
        "bg-[var(--paper)] px-[var(--s-3)] py-[var(--s-1)]",
        "text-[var(--t-sm)] text-[var(--ink)] outline-none transition-colors",
        "placeholder:text-[var(--grey-500)]",
        "focus-visible:border-[3px] focus-visible:outline-[3px]",
        "focus-visible:outline-solid focus-visible:outline-[var(--ink)] focus-visible:outline-offset-2",
        "disabled:border-[var(--grey-300)] disabled:bg-[var(--off)] disabled:text-[var(--grey-500)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
