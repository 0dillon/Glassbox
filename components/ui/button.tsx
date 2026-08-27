import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Rewritten to Section 9. Square, hard-bordered, monochrome.
 * No radius, no blurred shadow, no colour outside the palette.
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-[var(--s-2)]",
    "border-[2px] whitespace-nowrap select-none",
    "font-medium uppercase tracking-[0.06em]",
    "transition-colors duration-100",
    "outline-none focus-visible:outline-[3px] focus-visible:outline-solid",
    "focus-visible:outline-[var(--ink)] focus-visible:outline-offset-2",
    "disabled:pointer-events-none disabled:border-[var(--grey-300)]",
    "disabled:text-[var(--grey-300)] disabled:bg-[var(--paper)]",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)] hover:bg-[var(--grey-700)] hover:border-[var(--grey-700)]",
        outline:
          "bg-[var(--paper)] text-[var(--ink)] border-[var(--ink)] hover:bg-[var(--off)]",
        secondary:
          "bg-[var(--off)] text-[var(--ink)] border-[var(--ink)] hover:bg-[var(--grey-100)]",
        ghost:
          "bg-transparent text-[var(--ink)] border-transparent hover:bg-[var(--off)]",
        destructive:
          "bg-[var(--paper)] text-[var(--signal)] border-[var(--signal)] hover:bg-[var(--signal)] hover:text-[var(--paper)]",
        link: "bg-transparent border-transparent text-[var(--ink)] underline underline-offset-[3px] normal-case tracking-normal hover:text-[var(--grey-700)]",
      },
      size: {
        default: "h-[36px] px-[var(--s-4)] text-[var(--t-sm)]",
        sm: "h-[28px] px-[var(--s-3)] text-[var(--t-xs)]",
        lg: "h-[44px] px-[var(--s-5)] text-[var(--t-base)] font-bold",
        icon: "h-[36px] w-[36px] px-0",
        "icon-sm": "h-[28px] w-[28px] px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
