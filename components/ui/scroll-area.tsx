import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Hand-written to Section 9 (9A.e). Native overflow rather than a Radix
 * viewport, so the scrollbar stays the platform one and nothing rounded is
 * introduced. Same export name as the shadcn original.
 */
function ScrollArea({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="scroll-area"
      className={cn("overflow-y-auto overflow-x-hidden", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export { ScrollArea }
