"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Hand-written to Section 9 (9A.e). A native range input styled through the
 * .gb-range primitive in globals.css: a 2px ink rail with a square ink thumb.
 * The Radix slider was replaced rather than restyled because its thumb and
 * track ship rounded geometry that the token reset could not reach cleanly.
 *
 * The API is narrowed to the single-value case the timeline needs.
 */
function Slider({
  className,
  value,
  min = 0,
  max = 100,
  step = 1,
  onValueChange,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: number
  min?: number
  max?: number
  step?: number
  onValueChange?: (value: number) => void
}) {
  return (
    <input
      data-slot="slider"
      type="range"
      className={cn("gb-range", className)}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onValueChange?.(Number(e.currentTarget.value))}
      {...props}
    />
  )
}

export { Slider }
