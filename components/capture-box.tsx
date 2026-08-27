"use client";

import { useState, useTransition } from "react";

import { recordMemory } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  MAX_BODY,
  MIN_BODY,
  credentialRefusal,
  detectCredential,
} from "@/lib/guards";
import type { Scope } from "@/lib/types";

/**
 * Section 5.4 — the capture box.
 *
 * The never-store gate runs here first, so blocked text is never sent anywhere,
 * including to the server action. `canWrite` runs again server-side; this pass
 * exists so the user sees the refusal without the text leaving the browser.
 */
export function CaptureBox({
  namespaces,
  defaultScope,
  defaultScopeFromEnv,
  canWrite,
  disabledReason,
  onRecorded,
}: {
  namespaces: string[];
  defaultScope: "mine" | "team";
  /** True when GLASSBOX_DEFAULT_SCOPE is explicitly set to team. */
  defaultScopeFromEnv: boolean;
  canWrite: boolean;
  disabledReason: string | null;
  onRecorded: (memoryBlobId: string, stored: string, namespace: string) => void;
}) {
  const [body, setBody] = useState("");
  const [scope, setScope] = useState<Exclude<Scope, "unscoped">>(defaultScope);
  const [namespace, setNamespace] = useState(namespaces[0] ?? "default");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const trimmed = body.trim();
  const remaining = MAX_BODY - trimmed.length;

  function submit() {
    setError(null);
    setNotice(null);

    // The never-store gate, before the text leaves the browser.
    const credential = detectCredential(trimmed);
    if (credential) {
      setError(credentialRefusal(credential));
      return;
    }

    if (trimmed.length < MIN_BODY) {
      setError(
        `Too short. A memory needs at least ${MIN_BODY} characters — a fragment that cannot be understood without the conversation around it is worthless six weeks later.`
      );
      return;
    }

    startTransition(async () => {
      const res = await recordMemory(trimmed, scope, namespace);
      if (!res.ok) {
        // A timeout is a notice, not an error: the relayer keeps processing
        // after we stop waiting, so this must never invite a retry.
        if (res.code === "TIMEOUT") {
          setNotice(res.message);
          setBody("");
          return;
        }
        setError(res.message);
        return;
      }
      onRecorded(res.value.memoryBlobId, res.value.stored, namespace);
      setBody("");
    });
  }

  return (
    <section className="panel mb-[var(--s-7)] p-[var(--s-5)]">
      <div className="mb-[var(--s-3)] flex flex-wrap items-center justify-between gap-[var(--s-3)]">
        <label htmlFor="capture" className="label label-ink">
          RECORD A DECISION
        </label>

        <div className="flex items-center gap-[var(--s-2)]">
          <label htmlFor="namespace" className="label">
            NAMESPACE
          </label>
          <select
            id="namespace"
            value={namespace}
            onChange={(e) => setNamespace(e.target.value)}
            disabled={!canWrite}
            className={[
              "mono h-[28px] border-[2px] border-[var(--ink)]",
              "bg-[var(--paper)] px-[var(--s-2)] text-[var(--t-xs)] uppercase",
              "disabled:border-[var(--grey-300)] disabled:text-[var(--grey-500)]",
            ].join(" ")}
          >
            {namespaces.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Textarea
        id="capture"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={!canWrite}
        maxLength={MAX_BODY}
        placeholder="We moved ingest from Postgres to SQLite because write volume never justified a server."
        aria-describedby="capture-help"
      />

      <p id="capture-help" className="label mt-[var(--s-2)] normal-case tracking-normal">
        Record the decision and the reason behind it. The reason is the part that
        matters — a decision without one gets re-litigated.
        {trimmed.length > 0 ? (
          <span className="mono"> {remaining} characters left.</span>
        ) : null}
      </p>

      <div className="mt-[var(--s-4)] flex flex-wrap items-center justify-between gap-[var(--s-4)]">
        {/* The scope control sits immediately left of RECORD so it cannot be
            missed, and is never hidden behind a menu. */}
        <div className="flex items-center gap-[var(--s-3)]">
          <span className="label">SCOPE</span>
          <ToggleGroup
            type="single"
            value={scope}
            onValueChange={(v) => {
              if (v === "mine" || v === "team") setScope(v);
            }}
            disabled={!canWrite}
            aria-label="Scope"
          >
            <ToggleGroupItem value="mine" aria-label="Scope: mine">
              MINE
            </ToggleGroupItem>
            <ToggleGroupItem value="team" aria-label="Scope: team">
              TEAM
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex items-center gap-[var(--s-3)]">
          {!canWrite && disabledReason ? (
            <span className="text-[var(--t-sm)] text-[var(--grey-700)]">
              {disabledReason}
            </span>
          ) : null}
          <Button
            type="button"
            size="lg"
            className="shadow-hard"
            onClick={submit}
            disabled={!canWrite || pending || trimmed.length === 0}
          >
            {pending ? "RECORDING…" : "RECORD"}
          </Button>
        </div>
      </div>

      {defaultScopeFromEnv ? (
        <p className="label mt-[var(--s-3)] normal-case tracking-normal">
          Default scope is TEAM for this workspace.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-[var(--s-4)] border-l-[6px] border-[var(--signal)] pl-[var(--s-3)] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--ink)]"
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="mt-[var(--s-4)] border-l-[6px] border-[var(--grey-300)] pl-[var(--s-3)] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-700)]"
        >
          {notice}
        </p>
      ) : null}
    </section>
  );
}
