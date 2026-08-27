"use client";

import { useEffect, useState } from "react";

import { probeLink } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { bytes } from "@/lib/format";
import type { LinkProbe } from "@/lib/types";

/**
 * Section 11 — a dead link is worse than no link.
 *
 * This never renders a bare anchor. The URL is shown as monospace text plus a
 * status badge, resolved by an actual fetch before it is presented. EXPIRED and
 * LINK ERROR are NOT links.
 */
export function ProofLink({
  attachmentBlobId,
  url,
}: {
  attachmentBlobId: string;
  url: string;
}) {
  const [probe, setProbe] = useState<LinkProbe>({
    status: "CHECKING",
    sizeBytes: null,
    detail: null,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await probeLink(attachmentBlobId);
      if (!cancelled) setProbe(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [attachmentBlobId]);

  const badge =
    probe.status === "RESOLVES" ? (
      <Badge variant="default">RESOLVES</Badge>
    ) : probe.status === "CHECKING" ? (
      <Badge variant="muted">CHECKING</Badge>
    ) : probe.status === "LINK ERROR" ? (
      <Badge variant="signal">LINK ERROR</Badge>
    ) : (
      <Badge variant="muted">{probe.status}</Badge>
    );

  const isLink = probe.status === "RESOLVES";
  const struck = probe.status === "EXPIRED" || probe.status === "LINK ERROR";

  return (
    <div
      className={
        probe.status === "LINK ERROR"
          ? "border-[2px] border-[var(--signal)] p-[var(--s-3)]"
          : ""
      }
    >
      <div className="flex flex-wrap items-center gap-[var(--s-2)]">
        {badge}
        {probe.status === "RESOLVES" && probe.sizeBytes !== null ? (
          <span className="label">{bytes(probe.sizeBytes)}</span>
        ) : null}
      </div>

      <div className="mt-[var(--s-2)]">
        {isLink ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mono break-all text-[var(--t-sm)] text-[var(--ink)] underline"
          >
            {url}
          </a>
        ) : (
          <span
            className={[
              "mono break-all text-[var(--t-sm)]",
              struck
                ? "text-[var(--grey-300)] line-through"
                : "text-[var(--grey-500)]",
            ].join(" ")}
          >
            {url}
          </span>
        )}
      </div>

      {probe.detail ? (
        <p className="mt-[var(--s-2)] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-700)]">
          {probe.detail}
        </p>
      ) : null}
    </div>
  );
}
