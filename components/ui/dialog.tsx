"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { XIcon } from "lucide-react"

/**
 * Rewritten to Section 9. No backdrop blur (glassmorphism is forbidden),
 * no radius, no soft shadow. The overlay is a flat ink wash.
 */

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--ink)_38%,transparent)]",
        "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  destructive = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  /** Uses the --signal border reserved for destructive confirmations. */
  destructive?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)]",
          "-translate-x-1/2 -translate-y-1/2 gap-[var(--s-4)]",
          "border-[2px] bg-[var(--paper)] p-[var(--s-5)]",
          "text-[var(--t-sm)] text-[var(--ink)] outline-none sm:max-w-[560px]",
          "max-h-[88vh] overflow-y-auto",
          destructive ? "border-[var(--signal)]" : "border-[var(--ink)]",
          "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            aria-label="Close"
            className={cn(
              "absolute top-[var(--s-3)] right-[var(--s-3)]",
              "flex h-[24px] w-[24px] items-center justify-center",
              "border-[2px] border-transparent text-[var(--ink)]",
              "hover:border-[var(--ink)] focus-visible:outline-[3px]",
              "focus-visible:outline-solid focus-visible:outline-[var(--ink)]"
            )}
          >
            <XIcon size={14} strokeWidth={2.5} />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-[var(--s-2)] pr-[var(--s-6)]", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-[var(--s-2)] border-t-[2px]",
        "border-[var(--ink)] pt-[var(--s-4)] sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "text-[var(--t-lg)] leading-[var(--lh-lg)] font-bold uppercase tracking-[-0.01em]",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-700)]",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
