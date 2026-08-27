import * as React from "react"

import { cn } from "@/lib/utils"

/** Hand-written to Section 9 (9A.e). A 2px ink rule. */
function Separator({
  className,
  orientation = "horizontal",
  weight = "rule",
  ...props
}: React.ComponentProps<"div"> & {
  orientation?: "horizontal" | "vertical"
  weight?: "hair" | "rule"
}) {
  const thickness = weight === "hair" ? "1px" : "var(--b-rule)"
  const colour = weight === "hair" ? "var(--grey-100)" : "var(--ink)"

  return (
    <div
      data-slot="separator"
      role="separator"
      aria-orientation={orientation}
      className={cn(orientation === "horizontal" ? "w-full" : "self-stretch", className)}
      style={
        orientation === "horizontal"
          ? { height: thickness, background: colour }
          : { width: thickness, background: colour }
      }
      {...props}
    />
  )
}

export { Separator }
