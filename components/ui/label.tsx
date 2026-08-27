import * as React from "react"

import { cn } from "@/lib/utils"

/** Hand-written to Section 9 (9A.e). A mono uppercase field label. */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("label label-ink block", className)}
      {...props}
    />
  )
}

export { Label }
