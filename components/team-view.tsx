"use client";

import { useEffect, useState } from "react";

import { credentials, ensureOwner, pollMemories } from "@/app/actions";
import { CopyField } from "@/components/field";
import { ScopeDisclaimer } from "@/components/scope-badge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { midTruncate } from "@/lib/format";
import { setMode } from "@/lib/mode-store";
import type { AgentMeta, FeedPayload } from "@/lib/types";

/**
 * Section 11 — /team.
 *
 * Authors come from memory headers and work without the metadata API.
 * Credentials come from the signed /agents endpoint and are the part that is
 * lost in TEXT-ONLY mode.
 */
export function TeamView({
  accountId,
  viewer,
}: {
  accountId: string | null;
  viewer: string | null;
}) {
  const [payload, setPayload] = useState<FeedPayload | null>(null);
  const [agents, setAgents] = useState<AgentMeta[] | null>(null);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await pollMemories();
      if (cancelled) return;
      setPayload(next);
      setLoading(false);
      setMode({ mode: next.mode, reason: next.modeReason, lastGoodAt: next.fetchedAt });

      await ensureOwner();
      const list = await credentials();
      if (cancelled) return;
      if (list.ok) {
        setAgents(list.value);
        setAgentsError(null);
      } else {
        setAgents(null);
        setAgentsError(list.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const authors = payload?.authors ?? [];

  return (
    <>
      <section className="panel mb-[var(--s-7)] p-[var(--s-5)]">
        <CopyField label="SHARED ACCOUNT ID" value={accountId ?? "Not configured"} />
        <p className="mt-[var(--s-4)] max-w-[74ch] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-700)]">
          Access is scoped to the account, not to the application or the person.
          Every credential listed here reads the same memories. That is why an
          assistant on another laptop and this browser page show the same thing
          with no connection between them. Scope labels are a convention between
          Glassbox clients — they are not a security boundary.
        </p>
      </section>

      <section className="mb-[var(--s-8)]">
        <h2 className="subhead mb-[var(--s-4)]">AUTHORS</h2>
        {loading ? (
          <Skeleton className="h-[140px] w-full" />
        ) : authors.length === 0 ? (
          <div className="panel-recessed p-[var(--s-5)]">
            <p className="text-[var(--t-sm)]">
              Nobody has written to this memory yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="gb-table">
              <thead>
                <tr>
                  <th>Author</th>
                  <th className="num">Memories</th>
                  <th>Who</th>
                </tr>
              </thead>
              <tbody>
                {authors.map((a) => (
                  <tr key={a.author}>
                    <td className="mono">{a.author}</td>
                    <td className="num">{a.count}</td>
                    <td>
                      {a.author === viewer ? (
                        <Badge variant="default">THIS MACHINE</Badge>
                      ) : a.author === "unknown" ? (
                        <Badge variant="muted">NO HEADER</Badge>
                      ) : (
                        <Badge variant="outline">TEAMMATE</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-[var(--s-8)]">
        <h2 className="subhead mb-[var(--s-4)]">CREDENTIALS WITH ACCESS</h2>
        <p className="mb-[var(--s-4)] max-w-[74ch] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-700)]">
          One delegate key per person, per machine. An account holds a maximum of
          twenty. Issuing and revoking happens at memory.walrus.xyz, not here.
        </p>

        {agents === null ? (
          <div className="panel-recessed p-[var(--s-5)]">
            <p className="text-[var(--t-sm)] text-[var(--grey-700)]">
              {agentsError ??
                "Requires the metadata API, which is unavailable in this session."}
            </p>
            <p className="mt-[var(--s-2)] text-[var(--t-sm)] text-[var(--grey-700)]">
              The authors list above does not need it — it is read from the
              memories themselves.
            </p>
          </div>
        ) : agents.length === 0 ? (
          <div className="panel-recessed p-[var(--s-5)]">
            <p className="text-[var(--t-sm)]">
              No delegate keys are registered on this account.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="gb-table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Delegate address</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.suiAddress}>
                    <td className="mono">{a.label}</td>
                    <td className="mono" title={a.suiAddress}>
                      {midTruncate(a.suiAddress, 14, 8)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ScopeDisclaimer />
    </>
  );
}
