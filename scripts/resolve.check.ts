/**
 * Checks the pure resolution layer: supersession linking, contested detection,
 * scope filtering, the timeline snapshot, and glyph derivation.
 *
 *   pnpm run check:resolve
 *
 * These are the rules Section 5.5 requires to be enforced in code rather than
 * offered as advice, so they are exercised directly rather than only through
 * the interface.
 */
import { deriveGlyph } from "@/lib/glyph";
import { encodeHeader } from "@/lib/header";
import { parsedMemoryBlobId } from "@/lib/ids";
import type { RecallRow } from "@/lib/memwal";
import {
  applyContested,
  applyScopeFilter,
  asOf,
  authorCounts,
  contestedCandidates,
  contestedPairs,
  isContesting,
  linkSupersessions,
  sortNewestFirst,
  supersessionChain,
  timeBounds,
  toRecord,
} from "@/lib/resolve";
import { prepareSupersede } from "@/lib/supersede";
import type { Scope } from "@/lib/types";

let failures = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function row(
  id: string,
  opts: {
    scope?: Exclude<Scope, "unscoped">;
    author?: string;
    ts?: string;
    body?: string;
    supersedes?: string;
    namespace?: string;
    raw?: string;
  } = {}
): RecallRow {
  const text =
    opts.raw ??
    encodeHeader(
      {
        scope: opts.scope ?? "team",
        author: opts.author ?? "maria-mbp",
        ts: opts.ts ?? "2026-08-01T10:00:00Z",
        ...(opts.supersedes ? { supersedes: parsedMemoryBlobId(opts.supersedes) } : {}),
      },
      opts.body ?? "Ingest runs on Postgres for now."
    );

  return {
    memoryBlobId: parsedMemoryBlobId(id) as RecallRow["memoryBlobId"],
    text,
    distance: 0.2,
    namespace: opts.namespace ?? "team",
  };
}

console.log("\nRESOLVER CHECK\n");

/* ------------------------------------------------------------------ *
 * Supersession
 * ------------------------------------------------------------------ */
console.log("SUPERSESSION");

{
  const records = linkSupersessions(
    [
      row("AAAAAAAA", { ts: "2026-08-01T10:00:00Z", body: "Ingest runs on Postgres." }),
      row("BBBBBBBB", {
        ts: "2026-08-05T10:00:00Z",
        body: "SQLite handles ingest, not Postgres. Replaces the earlier note.",
        supersedes: "AAAAAAAA",
      }),
    ].map(toRecord)
  );

  const a = records.find((r) => r.memoryBlobId === "AAAAAAAA")!;
  const b = records.find((r) => r.memoryBlobId === "BBBBBBBB")!;

  check("an explicit supersedes marks the target replaced", a.supersededBy === "BBBBBBBB");
  check("the replacement links back", b.supersedes === "AAAAAAAA");
  check("the replacement is itself live", b.supersededBy === null);
  check("the superseded memory is retained, never dropped", records.length === 2);

  const chain = supersessionChain(a, records);
  check("the chain runs oldest to newest", chain.length === 2 && chain[0].memoryBlobId === "AAAAAAAA");
}

{
  // Recency alone must never win.
  const records = linkSupersessions(
    [
      row("AAAAAAAA", { ts: "2026-08-01T10:00:00Z", body: "Ingest runs on Postgres." }),
      row("CCCCCCCC", {
        ts: "2026-08-09T10:00:00Z",
        author: "dan-x1",
        body: "Ingest runs on SQLite.",
      }),
    ].map(toRecord)
  );
  const a = records.find((r) => r.memoryBlobId === "AAAAAAAA")!;
  check("a newer memory that names nothing does NOT supersede", a.supersededBy === null);
}

/* ------------------------------------------------------------------ *
 * Supersession composition rules
 * ------------------------------------------------------------------ */
console.log("\nCOMPOSITION RULES");

{
  const records = linkSupersessions(
    [
      row("AAAAAAAA", { ts: "2026-08-01T10:00:00Z" }),
      row("BBBBBBBB", { ts: "2026-08-05T10:00:00Z", supersedes: "AAAAAAAA" }),
    ].map(toRecord)
  );

  const shortBody = prepareSupersede({
    body: "now sqlite",
    scope: "team",
    author: "dan-x1",
    target: parsedMemoryBlobId("BBBBBBBB"),
    records,
  });
  check(
    "a replacement under 15 characters is refused",
    !shortBody.ok &&
      shortBody.reason === "A replacement must restate the whole fact, not just the change."
  );

  const missing = prepareSupersede({
    body: "SQLite handles ingest, not Postgres.",
    scope: "team",
    author: "dan-x1",
    target: parsedMemoryBlobId("ZZZZZZZZ"),
    records,
  });
  check(
    "superseding a memory that is not loaded is refused",
    !missing.ok && missing.reason === "Cannot supersede a memory that is not loaded."
  );

  const already = prepareSupersede({
    body: "SQLite handles ingest, not Postgres.",
    scope: "team",
    author: "dan-x1",
    target: parsedMemoryBlobId("AAAAAAAA"),
    records,
  });
  check(
    "superseding an already-replaced memory is refused",
    !already.ok &&
      already.reason ===
        "That memory has already been replaced. Supersede the current one instead."
  );

  const credential = prepareSupersede({
    body: "the token is ghp_abcdefghijklmnopqrstuvwxyz01",
    scope: "team",
    author: "dan-x1",
    target: parsedMemoryBlobId("BBBBBBBB"),
    records,
  });
  check("a credential in a replacement is refused", !credential.ok);

  const good = prepareSupersede({
    body: "SQLite handles ingest, not Postgres. Replaces the earlier note that Postgres was still in use.",
    scope: "team",
    author: "dan-x1",
    target: parsedMemoryBlobId("BBBBBBBB"),
    records,
  });
  check("a valid replacement produces the stored string", good.ok);
  check(
    "the stored string names what it replaces",
    good.ok && good.stored.includes("supersedes=BBBBBBBB"),
    good.ok ? good.stored : undefined
  );
}

/* ------------------------------------------------------------------ *
 * Contested detection
 * ------------------------------------------------------------------ */
console.log("\nCONTESTED");

{
  const records = linkSupersessions(
    [
      row("AAAAAAAA", { author: "maria-mbp", body: "Ingest runs on Postgres." }),
      row("CCCCCCCC", { author: "dan-x1", body: "Ingest runs on SQLite." }),
      row("DDDDDDDD", { author: "maria-mbp", body: "Ingest runs on Postgres, still." }),
    ].map(toRecord)
  );

  const a = records.find((r) => r.memoryBlobId === "AAAAAAAA")!;
  const c = records.find((r) => r.memoryBlobId === "CCCCCCCC")!;
  const d = records.find((r) => r.memoryBlobId === "DDDDDDDD")!;

  check("a close hit by a different author contests", isContesting(a, c, 0.2, 0.35));
  check("the same author never contests themselves", !isContesting(a, d, 0.2, 0.35));
  check("a distant hit does not contest", !isContesting(a, c, 0.9, 0.35));
  check("a memory never contests itself", !isContesting(a, a, 0.0, 0.35));

  const linked = linkSupersessions(
    [
      row("AAAAAAAA", { author: "maria-mbp", body: "Ingest runs on Postgres." }),
      row("EEEEEEEE", {
        author: "dan-x1",
        body: "Ingest runs on SQLite now.",
        supersedes: "AAAAAAAA",
      }),
    ].map(toRecord)
  );
  const la = linked.find((r) => r.memoryBlobId === "AAAAAAAA")!;
  const le = linked.find((r) => r.memoryBlobId === "EEEEEEEE")!;
  check(
    "a supersession link in either direction suppresses contested",
    !isContesting(la, le, 0.1, 0.35) && !isContesting(le, la, 0.1, 0.35)
  );

  const marked = applyContested(records, [{ a: a.memoryBlobId, b: c.memoryBlobId }]);
  const ma = marked.find((r) => r.memoryBlobId === "AAAAAAAA")!;
  const mc = marked.find((r) => r.memoryBlobId === "CCCCCCCC")!;
  check("contested is recorded on both sides", ma.contestedWith.length === 1 && mc.contestedWith.length === 1);
  check("a pair is counted once, not twice", contestedPairs(marked).length === 1);

  check("the candidate sweep is capped at 8", contestedCandidates(records, 8).length <= 8);
  check(
    "only team-scoped, unsuperseded, unchecked memories are candidates",
    contestedCandidates(marked, 8).every(
      (r) => r.scope === "team" && !r.supersededBy && r.contestedWith.length === 0
    )
  );
}

/* ------------------------------------------------------------------ *
 * Scope
 * ------------------------------------------------------------------ */
console.log("\nSCOPE");

{
  const records = [
    row("AAAAAAAA", { scope: "team", author: "maria-mbp" }),
    row("BBBBBBBB", { scope: "mine", author: "maria-mbp" }),
    row("CCCCCCCC", { scope: "mine", author: "dan-x1" }),
    // No header at all — an assistant that has not been given GLASSBOX.md.
    row("DDDDDDDD", { raw: "Ingest is on Postgres. Recorded by some other tool." }),
  ].map(toRecord);

  check("a headerless memory is unscoped", records[3].scope === "unscoped");
  check("an unscoped memory keeps its whole text as the body", records[3].body === records[3].raw);
  check("an unscoped memory has no invented author", records[3].author === "unknown");
  check("an unscoped memory has no invented timestamp", records[3].writtenAt === null);

  const team = applyScopeFilter(records, "team", "maria-mbp");
  check("the team filter shows only team", team.length === 1 && team[0].scope === "team");
  check("the team filter excludes unscoped", !team.some((r) => r.scope === "unscoped"));

  const mine = applyScopeFilter(records, "mine", "maria-mbp");
  check("the mine filter is scoped to the viewer", mine.length === 1 && mine[0].memoryBlobId === "BBBBBBBB");

  const unscoped = applyScopeFilter(records, "unscoped", "maria-mbp");
  check("unscoped memories are reachable, never hidden", unscoped.length === 1);

  check("all shows everything, including unscoped", applyScopeFilter(records, "all", "maria-mbp").length === 4);

  const counts = authorCounts(records);
  check(
    "author counts roll up correctly",
    counts.find((c) => c.author === "maria-mbp")?.count === 2 &&
      counts.find((c) => c.author === "unknown")?.count === 1
  );
}

/* ------------------------------------------------------------------ *
 * Timeline
 * ------------------------------------------------------------------ */
console.log("\nTIMELINE");

{
  const records = linkSupersessions(
    [
      row("AAAAAAAA", { ts: "2026-08-01T10:00:00Z", body: "Ingest runs on Postgres." }),
      row("BBBBBBBB", {
        ts: "2026-08-10T10:00:00Z",
        body: "SQLite handles ingest, not Postgres. Replaces the earlier note.",
        supersedes: "AAAAAAAA",
      }),
    ].map(toRecord)
  );

  const before = asOf(records, Date.parse("2026-08-05T00:00:00Z"));
  check("before the supersession, only the original exists", before.length === 1);
  check(
    "before the supersession, the original is NOT struck through",
    before[0].memoryBlobId === "AAAAAAAA" && before[0].supersededBy === null
  );

  const after = asOf(records, Date.parse("2026-08-15T00:00:00Z"));
  const afterA = after.find((r) => r.memoryBlobId === "AAAAAAAA")!;
  check("after the supersession, both exist", after.length === 2);
  check("after the supersession, the original IS struck through", afterA.supersededBy === "BBBBBBBB");

  const beforeAll = asOf(records, Date.parse("2026-07-01T00:00:00Z"));
  check("before anything was written, nothing shows", beforeAll.length === 0);

  const bounds = timeBounds(records);
  check(
    "the slider bounds span the header timestamps",
    bounds !== null &&
      bounds.min === Date.parse("2026-08-01T10:00:00Z") &&
      bounds.max === Date.parse("2026-08-10T10:00:00Z")
  );

  const sorted = sortNewestFirst(records);
  check("the feed sorts newest first", sorted[0].memoryBlobId === "BBBBBBBB");
}

/* ------------------------------------------------------------------ *
 * Glyphs
 * ------------------------------------------------------------------ */
console.log("\nGLYPHS");

{
  const g1 = deriveGlyph("Ab3fK9x2Qw7mZp1L");
  const g2 = deriveGlyph("Ab3fK9x2Qw7mZp1L");
  const g3 = deriveGlyph("Xy9mQ7aaBb2cDd4e");

  check("a glyph is deterministic", JSON.stringify(g1) === JSON.stringify(g2));
  check("two ids give different glyphs", JSON.stringify(g1) !== JSON.stringify(g3));
  check("a glyph is a 6x6 grid", g1.cells.length === 36);
  check(
    "a glyph is horizontally symmetric",
    g1.cells.every((on, i) => {
      const r = Math.floor(i / 6);
      const c = i % 6;
      return on === g1.cells[r * 6 + (5 - c)];
    })
  );
  check(
    "ink is one of the four monochrome values",
    ["#0A0A0A", "#4A4947", "#8A8986", "#C4C3C0"].includes(g1.ink)
  );
  check("border weight is 1 or 2", g1.borderWidth === 1 || g1.borderWidth === 2);

  for (const bad of [null, undefined, "", "short", "has space!"]) {
    const g = deriveGlyph(bad as string | null | undefined);
    if (!g.fallback) {
      failures++;
      console.log(`  FAIL  a malformed id (${JSON.stringify(bad)}) must give the fallback glyph`);
    }
  }
  check("malformed ids all give the fallback glyph", true);
  check("the fallback glyph is blank, not random", deriveGlyph(null).cells.every((c) => !c));

  // Distinctness across a realistic set.
  const seen = new Set<string>();
  for (let i = 0; i < 400; i++) {
    seen.add(JSON.stringify(deriveGlyph(`blob-${i}-abcdefgh`)));
  }
  check(`400 ids give ${seen.size} distinct glyphs`, seen.size > 390);
}

console.log(
  failures === 0
    ? "\nAll resolver checks passed.\n"
    : `\n${failures} resolver check(s) FAILED.\n`
);
process.exit(failures === 0 ? 0 : 1);
