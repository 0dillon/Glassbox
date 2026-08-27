import { cn } from "@/lib/utils"

/** Hand-written to Section 9 (9A.e). Flat --off block, square, no shimmer gradient. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("animate-pulse bg-[var(--off)]", className)}
      {...props}
    />
  )
}

export { Skeleton }
