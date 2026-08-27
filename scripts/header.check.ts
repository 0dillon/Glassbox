/**
 * Step 3 check. Round-trips the five cases named in Section 6.
 * Run with: pnpm exec tsx scripts/header.check.ts
 */
import { encodeHeader, parseHeader } from "@/lib/header";
import { parsedAttachmentBlobId, parsedMemoryBlobId } from "@/lib/ids";

let failures = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\nHEADER CODEC CHECK\n");

// 1. A full header.
const one = encodeHeader(
  { scope: "team", author: "maria-mbp", ts: "2026-08-27T10:14:02Z" },
  "We moved ingest from Postgres to SQLite because write volume never justified a server."
);
const p1 = parseHeader(one);
check("1. full header encodes", one.startsWith("[gb1 scope=team author=maria-mbp ts="), one);
check("1. full header parses", p1.headerOk && p1.fields?.scope === "team");
check("1. author survives", p1.fields?.author === "maria-mbp");
check("1. body is stripped of the header", p1.body.startsWith("We moved ingest"));
check("1. body carries no bracket", !p1.body.includes("[gb1"));

// 2. A header with supersedes and src.
const two = encodeHeader(
  {
    scope: "mine",
    author: "dan-x1",
    ts: "2026-08-27T11:02:41Z",
    supersedes: parsedMemoryBlobId("Ab3fK9x2"),
    src: parsedAttachmentBlobId("Xy9mQ7aa"),
  },
  "SQLite handles ingest, not Postgres."
);
const p2 = parseHeader(two);
check("2. supersedes + src encode", two.includes("supersedes=Ab3fK9x2") && two.includes("src=blob:Xy9mQ7aa"), two);
check("2. parses fully", p2.headerOk);
check("2. supersedes survives", p2.fields?.supersedes === "Ab3fK9x2");
check("2. src survives without the blob: prefix", p2.fields?.src === "Xy9mQ7aa");

// 3. A string with no header.
const three = "Postgres is still the ingest store.";
const p3 = parseHeader(three);
check("3. no header -> headerOk false", p3.headerOk === false);
check("3. no header -> whole string becomes the body", p3.body === three);
check("3. no header -> fields null", p3.fields === null);
check("3. no header -> a reason is given", typeof p3.reason === "string" && p3.reason.length > 0);

// 4. A malformed header.
const four = "[gb1 scope=team author=maria-mbp Unterminated because there is no bracket";
const p4 = parseHeader(four);
check("4. malformed -> headerOk false", p4.headerOk === false);
check("4. malformed -> whole string becomes the body", p4.body === four);

const fourB = "[gb1 scope=team author=maria-mbp] missing ts";
const p4b = parseHeader(fourB);
check("4b. missing required ts -> headerOk false", p4b.headerOk === false);
check("4b. missing required ts -> whole string becomes the body", p4b.body === fourB);

// 5. A header with an unknown extra key.
const five =
  "[gb1 scope=team author=dan-x1 ts=2026-08-27T11:02:41Z priority=high] Unknown keys are ignored.";
const p5 = parseHeader(five);
check("5. unknown key -> still parses", p5.headerOk === true);
check("5. unknown key -> known fields intact", p5.fields?.author === "dan-x1" && p5.fields?.scope === "team");
check("5. unknown key -> body clean", p5.body === "Unknown keys are ignored.");

// Encode-time rejection of an unencodable value (Section 5.4 rule 4).
let threw = false;
try {
  encodeHeader({ scope: "team", author: "Maria MBP", ts: "2026-08-27T10:14:02Z" }, "x");
} catch {
  threw = true;
}
check("6. invalid author is rejected at encode time", threw);

// A gb2 header must be ignored safely, not mangled.
const gb2 = "[gb2 scope=team author=x ts=2026-08-27T10:14:02Z] Future format.";
const p6 = parseHeader(gb2);
check("7. gb2 -> headerOk false, body preserved whole", p6.headerOk === false && p6.body === gb2);

console.log(
  failures === 0
    ? "\nAll header checks passed.\n"
    : `\n${failures} header check(s) FAILED.\n`
);
process.exit(failures === 0 ? 0 : 1);
