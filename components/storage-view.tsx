"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  namespaceTotals,
  pollMemories,
  rebuildIndex,
  relayerHealth,
} from "@/app/actions";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { absoluteTime, bytes, midTruncate } from "@/lib/format";
import { setMode } from "@/lib/mode-store";
import type { FeedPayload, NamespaceMeta } from "@/lib/types";

interface RestoreOutcome {
  namespace: string;
  restored: number;
  skipped: number;
  total: number;
}

interface HealthShape {
  status: string;
  version: string | null;
  relayerVersion: string | null;
  apiVersion: string | null;
  minSupportedSdk: string | null;
}

export function StorageView({
  namespaces,
  canReadText,
}: {
  namespaces: string[];
  canReadText: boolean;
}) {
  const [payload, setPayload] = useState<FeedPayload | null>(null);
  const [totals, setTotals] = useState<NamespaceMeta[] | null>(null);
  const [health, setHealth] = useState<HealthShape | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<RestoreOutcome | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next = await pollMemories();
    setPayload(next);
    setLoading(false);
    setMode({ mode: next.mode, reason: next.modeReason, lastGoodAt: next.fetchedAt });

    const t = await namespaceTotals();
    setTotals(t.ok ? t.value : null);

    const h = await relayerHealth();
    if (h.ok) {
      setHealth(h.value);
      setHealthError(null);
    } else {
      setHealth(null);
      setHealthError(h.message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!canReadText) {
      // Nothing to fetch. Deferred so the effect never sets state synchronously.
      queueMicrotask(() => {
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const next = await pollMemories();
      if (cancelled) return;
      setPayload(next);
      setLoading(false);
      setMode({ mode: next.mode, reason: next.modeReason, lastGoodAt: next.fetchedAt });

      const t = await namespaceTotals();
      if (cancelled) return;
      setTotals(t.ok ? t.value : null);

      const h = await relayerHealth();
      if (cancelled) return;
      if (h.ok) {
        setHealth(h.value);
        setHealthError(null);
      } else {
        setHealth(null);
        setHealthError(h.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canReadText]);

  const records = useMemo(() => payload?.records ?? [], [payload]);

  const perNamespace = useMemo(() => {
    const map = new Map<string, number>();
    for (const ns of namespaces) map.set(ns, 0);
    for (const r of records) map.set(r.namespace, (map.get(r.namespace) ?? 0) + 1);
    return [...map.entries()].map(([namespace, count]) => ({ namespace, count }));
  }, [records, namespaces]);

  async function onRebuild(namespace: string) {
    setBusy(namespace);
    setRestoreError(null);
    setOutcome(null);
    const res = await rebuildIndex(namespace);
    setBusy(null);
    if (!res.ok) {
      setRestoreError(res.message);
      return;
    }
    setOutcome({ namespace, ...res.value });
    void load();
  }

  if (!canReadText) {
    return (
      <div className="panel-recessed p-[var(--s-6)]">
        <p className="text-[var(--t-base)]">
          No credential is configured, so nothing can be inspected here.
        </p>
        <p className="mt-[var(--s-3)] text-[var(--t-sm)] text-[var(--grey-700)]">
          The notice at the top of the page names exactly what to add and where.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* ---------------- Rebuild ---------------- */}
      <section className="panel mb-[var(--s-7)] p-[var(--s-5)]">
        <h2 className="subhead mb-[var(--s-3)]">REBUILD INDEX</h2>
        <p className="mb-[var(--s-4)] max-w-[74ch] text-[var(--t-base)] leading-[var(--lh-base)]">
          Walrus holds the encrypted blobs and is the source of truth. The search
          index is a cache and can be rebuilt from them. This button rebuilds it.
        </p>

        <div className="flex flex-wrap gap-[var(--s-3)]">
          {namespaces.map((ns) => (
            <Button
              key={ns}
              variant="outline"
              onClick={() => void onRebuild(ns)}
              disabled={busy !== null}
            >
              {busy === ns ? "REBUILDING…" : `REBUILD ${ns}`}
            </Button>
          ))}
        </div>

        {outcome ? (
          <div className="mt-[var(--s-5)] grid grid-cols-3 gap-[var(--s-4)] border-t-[2px] border-[var(--ink)] pt-[var(--s-4)]">
            <Stat label="RESTORED" value={outcome.restored} />
            <Stat label="ALREADY INDEXED" value={outcome.skipped} />
            <Stat label="TOTAL SEEN" value={outcome.total} />
          </div>
        ) : null}

        {restoreError ? (
          <p
            role="alert"
            className="mt-[var(--s-4)] border-l-[6px] border-[var(--signal)] pl-[var(--s-4)] text-[var(--t-sm)] leading-[var(--lh-sm)]"
          >
            {restoreError}
          </p>
        ) : null}

        <p className="mt-[var(--s-4)] max-w-[74ch] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-700)]">
          Restore inspects the most recent entries only, with no pagination, so
          the number is a floor rather than a complete census.
        </p>
      </section>

      {/* ---------------- Namespaces ---------------- */}
      <section className="mb-[var(--s-8)]">
        <h2 className="subhead mb-[var(--s-4)]">NAMESPACES</h2>
        <p className="mb-[var(--s-4)] max-w-[74ch] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-700)]">
          Flat, opaque and exact-match. Slashes carry no hierarchy, and there is
          no search across namespaces — the feed sweeps each one separately.
        </p>

        {loading ? (
          <Skeleton className="h-[140px] w-full" />
        ) : (
          <div className="overflow-x-auto">
            <table className="gb-table">
              <thead>
                <tr>
                  <th>Namespace</th>
                  <th className="num">In the sweep</th>
                  <th className="num">Total on the account</th>
                  <th className="num">Storage used</th>
                </tr>
              </thead>
              <tbody>
                {perNamespace.map((n) => {
                  const meta = totals?.find((t) => t.id === n.namespace);
                  return (
                    <tr key={n.namespace}>
                      <td className="mono">{n.namespace}</td>
                      <td className="num">{n.count}</td>
                      <td className="num">
                        {meta ? meta.memoryCount : <Unavailable />}
                      </td>
                      <td className="num">
                        {meta ? bytes(meta.storageUsed) : <Unavailable />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------------- Blobs ---------------- */}
      <section className="mb-[var(--s-8)]">
        <h2 className="subhead mb-[var(--s-4)]">MEMORY BLOBS</h2>
        {loading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : records.length === 0 ? (
          <div className="panel-recessed p-[var(--s-5)]">
            <p className="text-[var(--t-sm)]">Nothing stored yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="gb-table">
              <thead>
                <tr>
                  <th>Memory blob id</th>
                  <th>Author</th>
                  <th>Namespace</th>
                  <th className="num">Size</th>
                  <th>Status</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.memoryBlobId}>
                    <td className="mono">
                      <Link
                        href={`/memory/${encodeURIComponent(r.memoryBlobId)}`}
                        className="underline"
                        title={r.memoryBlobId}
                      >
                        {midTruncate(r.memoryBlobId, 12, 6)}
                      </Link>
                    </td>
                    <td className="mono">{r.author}</td>
                    <td className="mono">{r.namespace}</td>
                    <td className="num">
                      {r.sizeBytes === null ? <Unavailable /> : bytes(r.sizeBytes)}
                    </td>
                    <td className="mono">
                      {r.status === "unknown" ? (
                        <Unavailable />
                      ) : (
                        r.status.toUpperCase()
                      )}
                    </td>
                    <td className="mono">
                      {r.expiresAt === null ? (
                        <Unavailable />
                      ) : (
                        absoluteTime(r.expiresAt)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------------- Health ---------------- */}
      <section>
        <h2 className="subhead mb-[var(--s-4)]">RELAYER HEALTH</h2>
        {health ? (
          <div className="panel grid grid-cols-2 gap-[var(--s-4)] p-[var(--s-5)] sm:grid-cols-4">
            <Field label="STATUS" value={health.status.toUpperCase()} />
            <Field
              label="VERSION"
              value={health.version}
              unavailable={health.version === null}
              unavailableReason="The relayer did not report a version."
            />
            <Field
              label="RELAYER"
              value={health.relayerVersion}
              unavailable={health.relayerVersion === null}
              unavailableReason="The relayer did not report a build version."
            />
            <Field
              label="API"
              value={health.apiVersion}
              unavailable={health.apiVersion === null}
              unavailableReason="The relayer did not report an API version."
            />
          </div>
        ) : (
          <div className="panel-recessed p-[var(--s-5)]">
            <p className="text-[var(--t-sm)] text-[var(--grey-700)]">
              {healthError ?? "Checking…"}
            </p>
          </div>
        )}
        <p className="mt-[var(--s-4)] max-w-[74ch] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-700)]">
          This endpoint is unauthenticated, so it passing proves the relayer is
          reachable but says nothing about whether this machine&apos;s credential
          works. The doctor page checks that separately.
        </p>
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="numeral mt-[var(--s-1)] text-[var(--t-2xl)] leading-[var(--lh-2xl)]">
        {value}
      </div>
    </div>
  );
}

function Unavailable() {
  return (
    <span
      className="text-[var(--grey-500)]"
      title="Requires the metadata API, which is unavailable in this session."
    >
      —
    </span>
  );
}
