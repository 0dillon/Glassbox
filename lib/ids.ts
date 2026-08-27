/**
 * Section 5.7 — two kinds of stored object, kept apart by the type system.
 *
 * A MEMORY blob is created by the relayer when a memory is stored. It holds one
 * encrypted memory and is readable only by the relayer, with a credential.
 *
 * An ATTACHMENT blob is created by us, via the Walrus publisher. It holds one
 * file and is readable by anyone from any aggregator, with no credential.
 *
 * Mixing them produces links that silently point at the wrong thing, so they
 * are branded. Passing one where the other is expected fails to compile.
 *
 * A bare identifier called `blobId` must not exist anywhere in this codebase.
 */

export type MemoryBlobId = string & { readonly __kind: "MemoryBlobId" };
export type AttachmentBlobId = string & { readonly __kind: "AttachmentBlobId" };

/**
 * Only `lib/memwal.ts` and `lib/readapi.ts` may call this — they are the two
 * boundaries where the relayer hands us a memory blob id.
 */
export const asMemoryBlobId = (s: string): MemoryBlobId => s as MemoryBlobId;

/**
 * Only `lib/walrus.ts` may call this — it is the one boundary where the Walrus
 * publisher hands us an attachment blob id.
 */
export const asAttachmentBlobId = (s: string): AttachmentBlobId =>
  s as AttachmentBlobId;

/**
 * `lib/header.ts` parses a `src=blob:<id>` token out of stored text, where the
 * branding cannot survive. This is the single sanctioned re-brand of a parsed
 * attachment reference; every consumer still runs `assertNotMemoryBlob` before
 * fetching or rendering it (Section 5.7).
 */
export const parsedAttachmentBlobId = (s: string): AttachmentBlobId =>
  s as AttachmentBlobId;

/** Same, for a `supersedes=<id>` token parsed out of stored text. */
export const parsedMemoryBlobId = (s: string): MemoryBlobId => s as MemoryBlobId;
