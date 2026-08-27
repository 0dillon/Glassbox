import Link from "next/link";

import { MemoryDetail } from "@/components/memory-detail";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * One memory: detail, supersede, rescope, repair, attach.
 *
 * The route segment is `memoryBlobId`, never a bare `blobId` (Section 5.7).
 */
export default async function MemoryPage({
  params,
}: {
  params: Promise<{ memoryBlobId: string }>;
}) {
  const { memoryBlobId } = await params;
  const decoded = decodeURIComponent(memoryBlobId);
  const cfg = getConfig();

  return (
    <div>
      <header className="pagehead">
        <div className="label">
          <Link href="/" className="underline">
            FEED
          </Link>{" "}
          / MEMORY
        </div>
        <h1>Memory</h1>
        <p>
          One recorded fact, what replaced it or was replaced by it, and where it
          physically lives.
        </p>
      </header>

      <MemoryDetail
        memoryBlobId={decoded}
        canWrite={cfg.canWrite}
        canAttach={cfg.canAttach}
      />
    </div>
  );
}
