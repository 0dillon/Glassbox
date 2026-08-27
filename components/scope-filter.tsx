"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ScopeFilter as ScopeFilterValue } from "@/lib/resolve";

/** The feed filter, across scopes and authors. */
export function ScopeFilter({
  scope,
  onScopeChange,
  author,
  onAuthorChange,
  authors,
  showSuperseded,
  onShowSupersededChange,
  supersededCount,
}: {
  scope: ScopeFilterValue;
  onScopeChange: (v: ScopeFilterValue) => void;
  author: string | null;
  onAuthorChange: (v: string | null) => void;
  authors: Array<{ author: string; count: number }>;
  showSuperseded: boolean;
  onShowSupersededChange: (v: boolean) => void;
  supersededCount: number;
}) {
  return (
    <div className="mb-[var(--s-5)] flex flex-wrap items-center gap-x-[var(--s-5)] gap-y-[var(--s-3)] border-b-[2px] border-[var(--ink)] pb-[var(--s-4)]">
      <div className="flex items-center gap-[var(--s-3)]">
        <span className="label">SCOPE</span>
        <ToggleGroup
          type="single"
          value={scope}
          onValueChange={(v) => {
            if (v) onScopeChange(v as ScopeFilterValue);
          }}
          aria-label="Filter by scope"
        >
          <ToggleGroupItem value="all">ALL</ToggleGroupItem>
          <ToggleGroupItem value="team">TEAM</ToggleGroupItem>
          <ToggleGroupItem value="mine">MINE</ToggleGroupItem>
          <ToggleGroupItem value="unscoped">UNSCOPED</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex items-center gap-[var(--s-2)]">
        <label htmlFor="author-filter" className="label">
          AUTHOR
        </label>
        <select
          id="author-filter"
          value={author ?? ""}
          onChange={(e) => onAuthorChange(e.target.value || null)}
          className="mono h-[28px] border-[2px] border-[var(--ink)] bg-[var(--paper)] px-[var(--s-2)] text-[var(--t-xs)]"
        >
          <option value="">EVERYONE</option>
          {authors.map((a) => (
            <option key={a.author} value={a.author}>
              {a.author} ({a.count})
            </option>
          ))}
        </select>
      </div>

      {supersededCount > 0 ? (
        <button
          type="button"
          onClick={() => onShowSupersededChange(!showSuperseded)}
          aria-pressed={showSuperseded}
          className={[
            "h-[28px] border-[2px] border-[var(--ink)] px-[var(--s-3)]",
            "font-mono text-[var(--t-xs)] tracking-[0.08em] uppercase",
            showSuperseded
              ? "bg-[var(--ink)] text-[var(--paper)]"
              : "bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--off)]",
          ].join(" ")}
        >
          {showSuperseded ? "HIDE" : "SHOW"} {supersededCount} SUPERSEDED
        </button>
      ) : null}
    </div>
  );
}
