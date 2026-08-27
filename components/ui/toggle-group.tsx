"use client"

import * as React from "react"
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Rewritten to Section 9. A segmented control: the active state is filled
 * solid --ink with --paper text, the inactive state is --paper with a 2px
 * --ink border. Square, no radius, no shadow.
 */

function ToggleGroup({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn("inline-flex items-stretch", className)}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Root>
  )
}

function ToggleGroupItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        "inline-flex h-[36px] min-w-[64px] items-center justify-center",
        "border-[2px] border-[var(--ink)] px-[var(--s-3)]",
        "font-mono text-[var(--t-xs)] tracking-[0.08em] uppercase",
        "bg-[var(--paper)] text-[var(--ink)] transition-colors",
        "-ml-[2px] first:ml-0",
        "hover:bg-[var(--off)]",
        "data-[state=on]:bg-[var(--ink)] data-[state=on]:text-[var(--paper)]",
        "data-[state=on]:relative data-[state=on]:z-10",
        "focus-visible:relative focus-visible:z-20",
        "focus-visible:outline-[3px] focus-visible:outline-solid",
        "focus-visible:outline-[var(--ink)] focus-visible:outline-offset-2",
        "disabled:pointer-events-none disabled:border-[var(--grey-300)] disabled:text-[var(--grey-300)]",
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  )
}

export { ToggleGroup, ToggleGroupItem }
