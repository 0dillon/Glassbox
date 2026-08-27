"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { attachFile, pollMemories, recordComposed } from "@/app/actions";
import { CopyField, Field } from "@/components/field";
import { MemoryGlyph } from "@/components/memory-glyph";
import { ProofLink } from "@/components/proof-link";
import { RescopeDialog } from "@/components/rescope-dialog";
import { ScopeBadge, ScopeDisclaimer } from "@/components/scope-badge";
import { SupersedeDialog, type SupersedeMode } from "@/components/supersede-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { absoluteTime, bytes, relativeTime, shortId } from "@/lib/format";
import { parseHeader } from "@/lib/header";
import { setMode } from "@/lib/mode-store";
import { supersessionChain } from "@/lib/resolve";
import type { FeedPayload } from "@/lib/types";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function MemoryDetail({
  memoryBlobId,
  canWrite,
  canAttach,
}: {
  memoryBlobId: string;
  canWrite: boolean;
  canAttach: boolean;
}) {
  const [payload, setPayload] = useState<FeedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<SupersedeMode | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const next = await pollMemories();
    setPayload(next);
    setLoading(false);
    setMode({ mode: next.mode, reason: next.modeReason, lastGoodAt: next.fetchedAt });
  }, []);

  useEffect(() => {
    let cancelled = false;
    pollMemories().then((next) => {
      if (cancelled) return;
      setPayload(next);
      setLoading(false);
      setMode({ mode: next.mode, reason: next.modeReason, lastGoodAt: next.fetchedAt });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const records = useMemo(() => payload?.records ?? [], [payload]);
  const record = useMemo(
    () => records.find((r) => r.memoryBlobId === memoryBlobId),
    [records, memoryBlobId]
  );

  const chain = useMemo(
    () => (record ? supersessionChain(record, records) : []),
    [record, records]
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-[var(--s-4)]">
        <Skeleton className="h-[180px] w-full" />
        <Skeleton className="h-[220px] w-full" />
      </div>
    );
  }

  if (!record) {
    return (
      <div className="panel-recessed p-[var(--s-6)]">
        <p className="text-[var(--t-base)]">
          This memory is not in the current recall set.
        </p>
        <p className="mt-[var(--s-3)] max-w-[64ch] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-700)]">
          Recall returns what is closest to a broad query, not everything that
          exists, so an older memory can fall outside the sweep. It has not been
          deleted — nothing in Glassbox ever is.
        </p>
        <p className="mono mt-[var(--s-4)] text-[var(--t-sm)] break-all">
          {memoryBlobId}
        </p>
        <Link href="/" className="mt-[var(--s-4)] inline-block">
          <Button variant="outline">BACK TO THE FEED</Button>
        </Link>
      </div>
    );
  }

  const superseded = Boolean(record.supersededBy);
  const parsed = parseHeader(record.raw);
  const replacement = record.supersededBy
    ? records.find((r) => r.memoryBlobId === record.supersededBy)
    : undefined;

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !record) return;

    setAttachError(null);

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachError("Attachments are limited to 10 MB.");
      return;
    }

    setAttaching(true);
    try {
      const buffer = await file.arrayBuffer();
      let binary = "";
      const view = new Uint8Array(buffer);
      for (let i = 0; i < view.length; i += 0x8000) {
        binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
      }
      const base64 = btoa(binary);

      const up = await attachFile(file.name, base64);
      if (!up.ok) {
        setAttachError(up.message);
        return;
      }

      // An attachment cannot be added to an existing memory — storage is
      // append-only. It is recorded as a replacement carrying the reference.
      const { composeAttachment } = await import("@/app/actions");
      const composed = await composeAttachment(
        record.memoryBlobId,
        up.value.attachmentBlobId
      );
      if (!composed.ok) {
        setAttachError(composed.message);
        return;
      }

      const written = await recordComposed(composed.value, record.namespace);
      if (!written.ok) {
        setAttachError(written.message);
        return;
      }
      await load();
    } catch (err) {
      setAttachError(
        err instanceof Error ? err.message : "The file could not be read."
      );
    } finally {
      setAttaching(false);
    }
  }

  return (
    <>
      {/* ---------------- The memory itself ---------------- */}
      <section className="panel mb-[var(--s-7)] p-[var(--s-5)]">
        <div className="flex flex-wrap gap-[var(--s-5)]">
          <MemoryGlyph memoryBlobId={record.memoryBlobId} size={96} />

          <div className="min-w-[280px] flex-1">
            <div className="mb-[var(--s-4)] flex flex-wrap items-center gap-[var(--s-2)]">
              <ScopeBadge
                scope={record.scope}
                reason={record.headerOk ? undefined : (parsed.reason ?? undefined)}
              />
              {record.contestedWith.length > 0 ? (
                <Badge variant="signal">
                  CONTESTED {record.contestedWith.length}
                </Badge>
              ) : null}
              {superseded ? <Badge variant="secondary">REPLACED</Badge> : null}
            </div>

            <p
              className={[
                "text-[var(--t-base)] leading-[var(--lh-base)]",
                superseded ? "gb-struck" : "",
              ].join(" ")}
            >
              {record.body}
            </p>

            {!record.headerOk ? (
              <p className="mt-[var(--s-3)] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-500)]">
                {parsed.reason}
              </p>
            ) : null}

            <div className="mt-[var(--s-5)] grid grid-cols-2 gap-[var(--s-4)] sm:grid-cols-4">
              <Field label="AUTHOR" value={record.author} />
              <Field
                label="WRITTEN"
                value={
                  record.writtenAt
                    ? `${relativeTime(record.writtenAt)}`
                    : "unknown"
                }
              />
              <Field label="NAMESPACE" value={record.namespace} />
              <Field label="SCOPE" value={record.scope.toUpperCase()} />
            </div>
          </div>
        </div>

        <div className="mt-[var(--s-5)] flex flex-wrap gap-[var(--s-3)] border-t-[2px] border-[var(--ink)] pt-[var(--s-4)]">
          {record.headerOk ? (
            <>
              <Button
                onClick={() => setDialog("supersede")}
                disabled={!canWrite || superseded}
              >
                SUPERSEDE
              </Button>
              <Button
                variant="outline"
                onClick={() => setDialog("rescope")}
                disabled={!canWrite || superseded}
              >
                CHANGE SCOPE
              </Button>
            </>
          ) : (
            <Button onClick={() => setDialog("repair")} disabled={!canWrite || superseded}>
              REPAIR
            </Button>
          )}

          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={!canWrite || !canAttach || attaching || superseded}
          >
            {attaching ? "UPLOADING…" : "ATTACH A FILE"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={onPickFile}
          />

          {!canWrite ? (
            <span className="self-center text-[var(--t-sm)] text-[var(--grey-700)]">
              Recording is disabled on this machine, so nothing here can be
              changed.
            </span>
          ) : superseded ? (
            <span className="self-center text-[var(--t-sm)] text-[var(--grey-700)]">
              This memory has already been replaced. Act on its replacement
              instead.
            </span>
          ) : !canAttach ? (
            <span className="self-center text-[var(--t-sm)] text-[var(--grey-700)]">
              Attachment storage unreachable.
            </span>
          ) : null}
        </div>

        {attachError ? (
          <p
            role="alert"
            className="mt-[var(--s-4)] border-l-[6px] border-[var(--signal)] pl-[var(--s-4)] text-[var(--t-sm)] leading-[var(--lh-sm)]"
          >
            {attachError}
          </p>
        ) : null}
      </section>

      {/* ---------------- Supersession chain ---------------- */}
      {chain.length > 1 ? (
        <section className="mb-[var(--s-7)]">
          <h2 className="subhead mb-[var(--s-4)]">CHAIN</h2>
          <p className="mb-[var(--s-4)] max-w-[70ch] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-700)]">
            Oldest to newest. Nothing here was deleted — the record of what the
            team used to believe, and when it changed, is the point.
          </p>
          <ol className="relative flex flex-col gap-[var(--s-4)] border-l-[2px] border-[var(--ink)] pl-[var(--s-5)]">
            {chain.map((link) => (
              <li key={link.memoryBlobId}>
                <Link
                  href={`/memory/${encodeURIComponent(link.memoryBlobId)}`}
                  className="flex gap-[var(--s-3)] hover:underline"
                >
                  <MemoryGlyph memoryBlobId={link.memoryBlobId} size={48} />
                  <div className="min-w-0">
                    <p
                      className={[
                        "text-[var(--t-sm)] leading-[var(--lh-sm)]",
                        link.supersededBy ? "text-[var(--grey-500)]" : "text-[var(--ink)]",
                      ].join(" ")}
                    >
                      {link.body}
                    </p>
                    <div className="label mt-[var(--s-1)]">
                      {link.author} / {absoluteTime(link.writtenAt)} /{" "}
                      {shortId(link.memoryBlobId)}
                      {link.memoryBlobId === record.memoryBlobId ? " / THIS ONE" : ""}
                      {!link.supersededBy ? " / CURRENT" : ""}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {replacement ? (
        <section className="mb-[var(--s-7)]">
          <p className="text-[var(--t-sm)]">
            <Link
              href={`/memory/${encodeURIComponent(replacement.memoryBlobId)}`}
              className="mono tracking-[0.06em] uppercase underline"
            >
              Replaced by {shortId(replacement.memoryBlobId)}
            </Link>
            <span className="text-[var(--grey-500)]">
              {" "}
              — {replacement.author}, {absoluteTime(replacement.writtenAt)}
            </span>
          </p>
        </section>
      ) : null}

      {/* ---------------- Contested ---------------- */}
      {record.contestedWith.length > 0 ? (
        <section className="mb-[var(--s-7)] border-[2px] border-[var(--signal)] p-[var(--s-5)]">
          <h2 className="subhead mb-[var(--s-3)]">CONTESTED</h2>
          <p className="mb-[var(--s-4)] max-w-[70ch] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-700)]">
            Another memory says something different and neither has replaced the
            other. Nothing is wrong yet — someone needs to decide.
          </p>
          <ul className="flex flex-col gap-[var(--s-2)]">
            {record.contestedWith.map((id) => (
              <li key={id}>
                <Link
                  href={`/memory/${encodeURIComponent(id)}`}
                  className="mono text-[var(--t-sm)] underline"
                >
                  {shortId(id, 16)}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/contested" className="mt-[var(--s-4)] inline-block">
            <Button variant="destructive">RESOLVE ON /CONTESTED</Button>
          </Link>
        </section>
      ) : null}

      {/* ---------------- Attachment ---------------- */}
      {record.attachmentBlobId ? (
        <section className="panel mb-[var(--s-7)] p-[var(--s-5)]">
          <h2 className="subhead mb-[var(--s-3)]">ATTACHMENT</h2>
          <p className="mb-[var(--s-4)] max-w-[70ch] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-700)]">
            Loaded directly from Walrus. This request does not touch
            Glassbox&apos;s server and requires no credential.
          </p>
          <AttachmentPanel attachmentBlobId={record.attachmentBlobId} />
        </section>
      ) : null}

      {/* ---------------- Proof ---------------- */}
      <section className="panel mb-[var(--s-7)] p-[var(--s-5)]">
        <h2 className="subhead mb-[var(--s-4)]">PROOF</h2>

        <div className="flex flex-col gap-[var(--s-5)]">
          <CopyField label="MEMORY BLOB ID" value={record.memoryBlobId} />
          <p className="text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-700)]">
            Content-derived: the same bytes always produce the same identifier,
            so it cannot be swapped for different content.
          </p>

          <div>
            <div className="label">STORED BYTES</div>
            <pre className="mono mt-[var(--s-2)] overflow-x-auto border-[2px] border-[var(--grey-300)] bg-[var(--off)] p-[var(--s-3)] text-[var(--t-sm)] leading-[var(--lh-sm)] whitespace-pre-wrap">
              {record.raw}
            </pre>
            <p className="mt-[var(--s-2)] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-700)]">
              Exactly what is stored, header included. This is the one place the
              header is shown, so the scope and author can be confirmed as
              recorded rather than inferred by this interface.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-[var(--s-4)] sm:grid-cols-3">
            <Field
              label="MEMORY ID"
              value={record.memoryId}
              unavailable={record.memoryId === null}
            />
            <Field
              label="SIZE"
              value={bytes(record.sizeBytes)}
              unavailable={record.sizeBytes === null}
            />
            <Field
              label="STATUS"
              value={record.status.toUpperCase()}
              unavailable={record.status === "unknown"}
            />
            <Field
              label="END EPOCH"
              value={record.endEpoch}
              unavailable={record.endEpoch === null}
            />
            <Field
              label="EXPIRES"
              value={record.expiresAt ? absoluteTime(record.expiresAt) : null}
              unavailable={record.expiresAt === null}
            />
            <Field label="SOURCE" value={record.source} />
          </div>

          <a
            href="https://memory.walrus.xyz"
            target="_blank"
            rel="noreferrer"
            className="mono text-[var(--t-sm)] tracking-[0.06em] uppercase underline"
          >
            View in Walrus Memory dashboard
          </a>
        </div>
      </section>

      <ScopeDisclaimer />

      {dialog === "rescope" ? (
        <RescopeDialog
          record={record}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          onDone={() => void load()}
        />
      ) : dialog ? (
        <SupersedeDialog
          mode={dialog}
          record={record}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          onDone={() => void load()}
        />
      ) : null}
    </>
  );
}

/** Renders the aggregator URL verbatim, plus the file itself once it resolves. */
function AttachmentPanel({ attachmentBlobId }: { attachmentBlobId: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { attachmentUrl } = await import("@/app/actions");
      const u = await attachmentUrl(attachmentBlobId);
      if (!cancelled) setUrl(u);
    })();
    return () => {
      cancelled = true;
    };
  }, [attachmentBlobId]);

  if (!url) return <Skeleton className="h-[64px] w-full" />;

  return <ProofLink attachmentBlobId={attachmentBlobId} url={url} />;
}
