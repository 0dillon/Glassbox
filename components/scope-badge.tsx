import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Scope } from "@/lib/types";

/**
 * Section 5.3 — the badge half of the scope treatment.
 *
 * TEAM     filled black, --paper text
 * MINE     outlined, --paper ground, 2px --ink border
 * UNSCOPED outlined in --grey-500
 *
 * The tile carries the other half: border, ground and left slab. Both are
 * distinguishable in greyscale with the labels unreadable.
 */

const EXPLAIN: Record<Scope, string> = {
  team: "Recorded for everyone on this memory.",
  mine: "Recorded for its author alone. This is a visibility convention, not a security boundary — every credential on this account can still read it.",
  unscoped:
    "No Glassbox header, so scope, author and time are unknown. Shown to everyone rather than hidden, because hiding it would falsely imply the content was protected.",
};

export function ScopeBadge({ scope, reason }: { scope: Scope; reason?: string }) {
  const variant = scope === "team" ? "default" : scope === "mine" ? "outline" : "muted";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={variant} tabIndex={0} className="cursor-help">
          {scope.toUpperCase()}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{reason ?? EXPLAIN[scope]}</TooltipContent>
    </Tooltip>
  );
}

/** Section 5.3 — stated in the interface, not only in the documentation. */
export const SCOPE_DISCLAIMER =
  "Scope is a visibility convention between Glassbox clients. It is not a security boundary. Anyone holding a delegate key on this account can read every memory on it, including memories scoped MINE, by querying the service directly. Use MINE to keep working notes out of your teammates' way — never to keep a secret from them.";

export function ScopeDisclaimer({ className = "" }: { className?: string }) {
  return (
    <p
      className={[
        "border-l-[6px] border-[var(--grey-300)] pl-[var(--s-4)]",
        "text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-700)]",
        className,
      ].join(" ")}
    >
      {SCOPE_DISCLAIMER}
    </p>
  );
}
