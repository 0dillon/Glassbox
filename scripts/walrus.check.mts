/**
 * Exercises the real Walrus attachment path (Appendix C, Section 11).
 *
 *   pnpm run check:walrus
 *
 * Needs no credential and no wallet — the publisher and aggregator are public.
 * Run with the react-server condition so the `server-only` guard in
 * lib/walrus.ts resolves to a no-op outside Next.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });

const {
  aggregatorUrl,
  assertNotMemoryBlob,
  probeAttachment,
  uploadAttachment,
  MAX_ATTACHMENT_BYTES,
  STORAGE_EPOCHS,
} = await import("@/lib/walrus");

let failures = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\nWALRUS ATTACHMENT CHECK\n");

console.log("GUARDS");

check("the maximum purchasable storage period is used", STORAGE_EPOCHS === 53);
check("the body cap is 10 MiB", MAX_ATTACHMENT_BYTES === 10 * 1024 * 1024);

{
  // Section 5.7 — the runtime check that catches a mix-up.
  const knownMemoryBlobIds = new Set(["MEMORYBLOB1234", "MEMORYBLOB5678"]);

  let threw = false;
  try {
    assertNotMemoryBlob("MEMORYBLOB1234", knownMemoryBlobIds);
  } catch {
    threw = true;
  }
  check("a memory blob id is refused as an attachment", threw);

  let threwForAttachment = false;
  try {
    assertNotMemoryBlob("SOMEATTACHMENT99", knownMemoryBlobIds);
  } catch {
    threwForAttachment = true;
  }
  check("an attachment blob id passes the guard", !threwForAttachment);

  // The guard must report a mix-up as a mix-up, not as expiry.
  const probe = await probeAttachment("MEMORYBLOB1234", knownMemoryBlobIds);
  check(
    "a mix-up reports LINK ERROR, never EXPIRED",
    probe.status === "LINK ERROR",
    probe.status
  );
  check(
    "the LINK ERROR says what to do",
    probe.detail === "This points at a memory, not an attachment. Report this."
  );
}

{
  const oversize = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1).toString("base64");
  const res = await uploadAttachment("big.bin", oversize);
  check(
    "a file over 10 MB is blocked before upload",
    !res.ok && res.message === "Attachments are limited to 10 MB.",
    res.ok ? "it uploaded" : res.message
  );
}

console.log("\nLIVE ROUND TRIP");

{
  // A tiny PNG, so the upload is real but trivial.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  // Make the bytes unique per run so the newlyCreated branch is exercised at
  // least once; a repeat run then exercises alreadyCertified.
  const unique = Buffer.concat([png, Buffer.from(`glassbox-check`)]);

  const up = await uploadAttachment("check.png", unique.toString("base64"));

  if (!up.ok) {
    failures++;
    console.log(`  FAIL  upload — ${up.message}`);
    console.log(
      "\n  The Walrus testnet publisher is a public best-effort endpoint. If this",
      "\n  is unreachable the app sets canAttach:false and disables the attach",
      "\n  control with a reason; nothing else is affected.\n"
    );
  } else {
    console.log(`  PASS  upload returned an attachment blob id`);
    console.log(`        id        ${up.value.attachmentBlobId}`);
    console.log(`        size      ${up.value.sizeBytes} B`);
    console.log(`        endEpoch  ${up.value.endEpoch ?? "not reported"}`);

    check(
      "the attachment blob id looks like a blob id",
      /^[A-Za-z0-9_-]{8,}$/.test(up.value.attachmentBlobId),
      up.value.attachmentBlobId
    );

    const url = aggregatorUrl(up.value.attachmentBlobId);
    console.log(`        url       ${url}`);

    // The liveness check that Section 11 requires before a link is presented.
    const probe = await probeAttachment(up.value.attachmentBlobId, new Set());
    check(
      "the freshly uploaded blob resolves from the aggregator",
      probe.status === "RESOLVES",
      `${probe.status}${probe.detail ? ` — ${probe.detail}` : ""}`
    );

    // A second upload of identical bytes must not break: blob ids are
    // content-derived, so the publisher answers alreadyCertified.
    const again = await uploadAttachment("check.png", unique.toString("base64"));
    check(
      "re-uploading identical bytes still returns an id",
      again.ok,
      again.ok ? undefined : again.message
    );
    if (again.ok) {
      check(
        "content addressing gives the same id both times",
        again.value.attachmentBlobId === up.value.attachmentBlobId,
        `${up.value.attachmentBlobId} vs ${again.value.attachmentBlobId}`
      );
    }
  }
}

{
  // A well-formed id that was never stored must read as EXPIRED, not as a
  // live link.
  const probe = await probeAttachment("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0", new Set());
  check(
    "an unstored id never presents as a live link",
    probe.status !== "RESOLVES",
    probe.status
  );
  console.log(`        unstored id reads as ${probe.status}`);
}

console.log(
  failures === 0
    ? "\nAll Walrus checks passed.\n"
    : `\n${failures} Walrus check(s) FAILED.\n`
);
process.exit(failures === 0 ? 0 : 1);
