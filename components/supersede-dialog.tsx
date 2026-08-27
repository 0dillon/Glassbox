"use client";

import { useState, useTransition } from "react";

import { composeSupersede, recordComposed } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RETRACTION_WARNING, needsRetractionWarning } from "@/lib/supersede";
import type { MemoryRecord, Scope } from "@/lib/types";

export type SupersedeMode = "supersede" | "rescope" | "repair";

const COPY: Record<SupersedeMode, { title: string; blurb: string; cta: string }> = {
  supersede: {
    title: "Supersede",
    blurb:
      "Storage is append-only, so nothing is edited or deleted. This records a new memory that replaces the one below. Restate the whole fact — search works by meaning, so a bare correction will not surface on a query about the original and the stale memory will keep winning.",
    cta: "RECORD REPLACEMENT",
  },
  rescope: {
    title: "Change scope",
    blurb:
      "A scope cannot be edited. This records a new memory with the same words and the new scope, replacing the original.",
    cta: "RECORD RESCOPED COPY",
  },
  repair: {
    title: "Repair",
    blurb:
      "This memory has no Glassbox header, so its scope, author and time are unknown. Repairing records a correctly-headed copy that replaces it. The original is retained and marked superseded, exactly like any other replacement.",
    cta: "RECORD REPAIRED COPY",
  },
};

/**
 * Section 5.4 rule 6 — a two-step confirm. The exact final stored string,
 * header included, is shown before the confirm.
 */
export function SupersedeDialog({
  mode,
  record,
  open,
  onOpenChange,
  onDone,
}: {
  mode: SupersedeMode;
  record: MemoryRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  // The replacement textarea is pre-filled with the original body so the user
  // edits rather than starts blank.
  const [body, setBody] = useState(record.body);
  const [scope, setScope] = useState<Exclude<Scope, "unscoped">>(
    record.scope === "team" ? "team" : record.scope === "mine" ? "mine" : "team"
  );
  const [step, setStep] = useState<"compose" | "confirm">("compose");
  const [stored, setStored] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // No reset-on-close effect is needed: every caller unmounts this dialog when
  // it closes, so the next open starts from fresh state.

  const warn = needsRetractionWarning(record.scope, scope);

  function review() {
    setError(null);
    startTransition(async () => {
      // For a rescope or a repair the body is carried through unchanged; only
      // supersede lets the user edit it.
      const res = await composeSupersede(
        mode === "supersede" ? body : record.body,
        scope,
        record.memoryBlobId
      );
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setStored(res.value);
      setStep("confirm");
    });
  }

  function confirm() {
    if (!stored) return;
    setError(null);
    startTransition(async () => {
      const res = await recordComposed(stored, record.namespace);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      onOpenChange(false);
      onDone();
    });
  }

  const copy = COPY[mode];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent destructive={warn}>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.blurb}</DialogDescription>
        </DialogHeader>

        <div className="border-l-[6px] border-[var(--grey-300)] pl-[var(--s-4)]">
          <div className="label">REPLACING</div>
          <p className="mt-[var(--s-1)] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-700)]">
            {record.body}
          </p>
        </div>

        {step === "compose" ? (
          <>
            {mode === "supersede" ? (
              <div>
                <label htmlFor="replacement" className="label label-ink">
                  REPLACEMENT
                </label>
                <Textarea
                  id="replacement"
                  className="mt-[var(--s-2)]"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>
            ) : null}

            <div className="flex items-center gap-[var(--s-3)]">
              <span className="label">SCOPE</span>
              <ToggleGroup
                type="single"
                value={scope}
                onValueChange={(v) => {
                  if (v === "mine" || v === "team") setScope(v);
                }}
                aria-label="Scope"
              >
                <ToggleGroupItem value="mine">MINE</ToggleGroupItem>
                <ToggleGroupItem value="team">TEAM</ToggleGroupItem>
              </ToggleGroup>
            </div>

            {warn ? (
              <p className="border-l-[6px] border-[var(--signal)] pl-[var(--s-4)] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--ink)]">
                {RETRACTION_WARNING}
              </p>
            ) : null}
          </>
        ) : (
          <div>
            <div className="label label-ink">THIS EXACT TEXT WILL BE STORED</div>
            <pre className="mono mt-[var(--s-2)] max-h-[240px] overflow-auto border-[2px] border-[var(--ink)] bg-[var(--off)] p-[var(--s-3)] text-[var(--t-sm)] leading-[var(--lh-sm)] whitespace-pre-wrap">
              {stored}
            </pre>
            <p className="mt-[var(--s-3)] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-700)]">
              Storage is permanent — there is no delete. A wrong memory stays.
            </p>
          </div>
        )}

        {error ? (
          <p
            role="alert"
            className="border-l-[6px] border-[var(--signal)] pl-[var(--s-4)] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--ink)]"
          >
            {error}
          </p>
        ) : null}

        <DialogFooter>
          {step === "confirm" ? (
            <Button variant="outline" onClick={() => setStep("compose")} disabled={pending}>
              BACK
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              CANCEL
            </Button>
          )}
          {step === "compose" ? (
            <Button onClick={review} disabled={pending}>
              {pending ? "CHECKING…" : "REVIEW"}
            </Button>
          ) : (
            <Button onClick={confirm} disabled={pending} className="shadow-hard">
              {pending ? "RECORDING…" : copy.cta}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
