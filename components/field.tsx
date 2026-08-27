import { CopyButton } from "@/components/copy-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Label plus monospace value. Used everywhere a piece of metadata is shown.
 *
 * A value the metadata API would have supplied renders as an em dash with the
 * explanatory tooltip Section 8 requires, never as a blank or a zero.
 */
export function Field({
  label,
  value,
  unavailable,
  unavailableReason = "Requires the metadata API, which is unavailable in this session.",
  wrap = false,
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  /** True when the value is missing because a data path is unavailable. */
  unavailable?: boolean;
  unavailableReason?: string;
  wrap?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="label">{label}</div>
      {unavailable ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              tabIndex={0}
              className="mono mt-[var(--s-1)] cursor-help text-[var(--t-sm)] text-[var(--grey-500)]"
            >
              —
            </div>
          </TooltipTrigger>
          <TooltipContent>{unavailableReason}</TooltipContent>
        </Tooltip>
      ) : (
        <div
          className={[
            "mono mt-[var(--s-1)] text-[var(--t-sm)] text-[var(--ink)]",
            wrap ? "break-all" : "truncate",
          ].join(" ")}
        >
          {value}
        </div>
      )}
    </div>
  );
}

/** A value with a copy control, for identifiers people need to paste. */
export function CopyField({
  label,
  value,
  wrap = true,
}: {
  label: string;
  value: string;
  wrap?: boolean;
}) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mt-[var(--s-1)] flex items-start gap-[var(--s-2)]">
        <code
          className={[
            "mono flex-1 text-[var(--t-sm)] text-[var(--ink)]",
            wrap ? "break-all" : "truncate",
          ].join(" ")}
        >
          {value}
        </code>
        <CopyButton value={value} />
      </div>
    </div>
  );
}
