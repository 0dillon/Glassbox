# Glassbox

A shared memory for a team that keeps losing its own decisions.

Someone picks up a repo, asks why the ingest service uses SQLite, and either
interrupts a colleague or re-litigates a choice made three weeks ago in a
terminal nobody else saw. Glassbox is the place that answer lives. Decisions,
constraints and commitments are recorded once — by a person in a browser, or by
an AI assistant during a coding session — and every teammate's assistant can
recall them afterwards, on a different laptop, in a fresh session, with no
shared local state and no handoff conversation.

It is built on **Walrus Memory**, which stores memories as encrypted files on
**Walrus** and records ownership on **Sui**. You do not need to understand
blockchains to run it or to use it.

---

## Setup

Requires Node.js 20 or later and pnpm. If pnpm is missing: `npm install -g pnpm`.

```bash
pnpm install
```

```bash
cp .env.example .env.local
```

Go to `https://memory.walrus.xyz`, sign in with a wallet, and copy two things
into `.env.local`:

- the **account ID** (starts `0x`) — public, not a secret, shared by the team
- a **delegate private key** (64 hexadecimal characters — the private one, not
  the public one) — yours alone, never shared

Add an author slug for this machine, lowercase with hyphens:

```
MEMWAL_ACCOUNT_ID=0x…
MEMWAL_PRIVATE_KEY=…
GLASSBOX_AUTHOR=maria-mbp
```

Check it:

```bash
pnpm run doctor
```

> `pnpm run doctor`, not `pnpm doctor` — pnpm has a built-in command by that
> name.

Run it:

```bash
pnpm dev
```

Open `http://localhost:3000`.

**Nothing here crashes on a missing key.** Every route renders, the missing
variable is named on screen with the exact file to add it to, and any control
that cannot work is disabled with a reason beside it. `/doctor` is the full
report.

The person who does the setup above is the account owner. Everyone else joins
per **[JOIN.md](JOIN.md)**.

---

## The demo walkthrough

1. **Open `http://localhost:3000`.** With no memories yet you get a plain
   sentence saying so, not a spinner and not an error.
2. **Type a decision, choose TEAM, press RECORD.** It appears at the top of the
   feed within about ten seconds, with a generated glyph, your author slug, the
   scope and a relative time.
3. **Record a second one scoped MINE.** It renders differently — recessed
   ground, heavy left slab — distinguishable at a glance with the labels
   covered.
4. **Use the scope filter.** Switch to TEAM and the private one disappears.
5. **Leave the browser open** and have a teammate's assistant record something.
   It arrives in the feed within about ten seconds without you touching
   anything. No machine ever contacts another machine; they meet in the shared
   memory and polling is how that is observed.
6. **Click a memory.** The detail page shows the full text, author, scope,
   timestamp, namespace, the memory blob id in full, and the verification panel.
7. **Press SUPERSEDE.** Write a replacement that restates the whole fact and
   confirm. The original re-renders struck through with a `REPLACED BY` link,
   and the replacement carries a `REPLACES` link back. Nothing is deleted.
8. **Record something that contradicts an existing memory without superseding
   it.** Both get flagged `CONTESTED`, with a control on `/contested` to decide.
9. **Open `/timeline`** and drag backwards. The memory set becomes what was
   known on that date, with supersessions applied only if they had happened by
   then.
10. **Open `/team`.** Every author who has written here, their memory counts,
    and the shared account id with a copy control.
11. **Follow `JOIN.md` on a second machine** — different laptop, different
    assistant tool, none of the first machine's files. That machine's assistant
    recalls a decision recorded on the first.
12. **Open `/storage`, press REBUILD INDEX.** It returns counts for rebuilt,
    already-indexed and total, read back from Walrus itself.

---

## How the sharing model works — read this twice

Access in Walrus Memory is scoped to an **account**, not to an application or a
person. An account has one account ID and up to **twenty delegate keys**
registered against it. Every delegate key resolves to the same account, so every
holder reads and writes the same memories.

- **One shared account.** Its account ID is the team identifier. It is public and
  safe to put in a README.
- **One delegate key per person, per machine.** Private, held only by that
  machine, never shared, individually revocable.
- Recall is scoped by **account plus namespace**. A memory recorded by Maria's
  laptop is visible to Dan's assistant because both credentials sit on the same
  account — not because of any connection between their machines.

### Scope is a convention, not an access control layer

> Scope is a visibility convention between Glassbox clients. It is not a
> security boundary. Anyone holding a delegate key on this account can read
> every memory on it, including memories scoped MINE, by querying the service
> directly. Use MINE to keep working notes out of your teammates' way — never to
> keep a secret from them.

The platform's access control is account-level: a delegate key grants full read
and write across the whole account, and there is no per-memory or per-namespace
permission. Building real per-memory access control would need on-chain contract
changes, wallet-signed transactions from every participant, and a key-management
flow — all of which would break the property that a teammate joins in two
minutes with no wallet. The honest convention, clearly labelled, is the
behaviour Glassbox ships.

### The default scope is MINE

Deliberately. Storage is append-only, so defaulting to TEAM means an accidental
submission publishes something to colleagues that cannot be unpublished.
Defaulting to MINE means at worst a teammate cannot see something until its
author re-scopes it, which is recoverable. Set `GLASSBOX_DEFAULT_SCOPE=team` if
your team wants shared-by-default.

---

## The rules the app actually enforces

These are in code, not in advice.

**Provenance is not correctness.** Knowing where a claim came from does not make
it true. So a newer memory overrides an older one **only when it explicitly
names it**. Recency alone never wins — that is what stops a teammate's stale
note from quietly overwriting a considered decision. Two memories that
contradict each other without a supersession link are both live and both flagged
`CONTESTED`, for a person to decide.

**A replacement must restate the whole fact.** Enforced at 15 characters
minimum, and the reason is mechanical rather than stylistic: search is by
meaning, so a bare "actually it's SQLite now" is not semantically near a memory
about Postgres. It will not surface on a query about the database, and the stale
memory keeps winning.

**Nothing is ever deleted.** Storage is append-only and the SDK exposes no
delete — but even where it did, the record of what the team used to believe and
when it changed is the product. Correction is supersession. Scope change is
supersession. Repair is supersession. Superseded memories stay visible, struck
through, linked to what replaced them.

**Credentials are blocked, not warned about.** Hex keys, PEM blocks,
`sk-`/`ghp_`/`AKIA` tokens, card numbers and labelled secrets are refused before
the text leaves your browser. Memories are encrypted at rest, but the relayer
handles plaintext briefly while embedding, and every teammate can read
everything.

**A memory needs at least 12 characters** and is never written on a timer, on
blur, on debounce, or on navigation — only on an explicit submission. A write
that times out is **never retried automatically**: the relayer keeps processing
after the client stops waiting, so a retry would create a permanent duplicate.

---

## Verification

Every memory blob id is content-derived — the same bytes always produce the same
identifier, so it cannot be swapped for different content. The detail page shows
it in full, along with `STORED BYTES`: the exact stored string, header included.
That is the one place the header is displayed, and it is how you confirm the
scope and author were recorded rather than inferred by the interface.

`/storage` has a **REBUILD INDEX** control. Walrus holds the encrypted blobs and
is the source of truth; the search index is a cache and can be rebuilt from
them. Restore inspects the most recent entries only, with no pagination, so its
number is a floor rather than a complete census.

### Attachment durability — stated plainly

Attachments go to **Walrus Testnet**, which needs no wallet and no tokens. An
epoch there is one day, and every upload buys `epochs=53`, the maximum a Walrus
blob can be bought for — so roughly 53 days. Testnet is additionally **wiped
periodically without warning**.

Memories themselves are stored on the production network by the relayer and are
the durable half of the system.

Walrus Mainnet has no public upload endpoint, because whoever runs one pays for
every file uploaded through it; moving attachments there needs a funded wallet
and is out of scope. Content addressing is identical on both, so the proof
property holds either way — only the lifetime differs.

Because a dead link is worse than no link, every proof link is liveness-checked
by an actual fetch before it is presented. An expired one renders struck
through with the reason, never as a live link.

**Scale path:** for many small files, Walrus supports *quilt* batching, which
packs them into one blob. Glassbox does not use it — one attachment per memory
is the shape here — but that is where to look if attachment volume grows.

---

## Two kinds of blob

There are two distinct kinds of stored object and confusing them produces links
that silently point at the wrong thing.

| | **Memory blob** | **Attachment blob** |
|---|---|---|
| Created by | The relayer, when a memory is stored | You, via the Walrus publisher |
| Holds | One encrypted memory | One file you uploaded |
| Readable by | The relayer only, with a credential | Anyone, from any aggregator, no credential |
| Called | `memoryBlobId` | `attachmentBlobId` |

A bare `blobId` does not exist anywhere in this codebase. The two are branded
TypeScript types, so passing one where the other is expected fails to compile,
and a runtime guard (`assertNotMemoryBlob`) runs before every aggregator fetch
and before every attachment URL is rendered. A mix-up is reported as
`LINK ERROR`, never as expiry.

---

## Layout

```
app/          routes; actions.ts holds every server action and every credential
components/   UI; components/ui is shadcn, retokenised and edited
lib/          adapters and pure logic
scripts/      verification scripts (plain tsx, no test framework)
```

- `lib/header.ts` — the versioned header encoded into memory text. Structured
  fields exist because the storage layer accepts text and a namespace and
  nothing else. Malformed memories render as `UNSCOPED` with a REPAIR action —
  never dropped, never guessed at.
- `lib/resolve.ts` — supersession links, contested detection, scope filtering.
  `supersededBy` and `contestedWith` are computed on every pass and never
  written back to storage.
- `lib/memwal.ts` — the SDK adapter. Owns memory text. The demo depends on this.
- `lib/readapi.ts` — the signed metadata API. Optional; the app is fully usable
  without it.
- `lib/config.ts` — the environment gate that turns missing keys into notices.

Four scripts verify the parts that are hard to eyeball:

| Command | What it proves |
|---|---|
| `pnpm run doctor` | The environment is complete and the delegate key is accepted by the relayer |
| `pnpm run check:header` | The header codec round-trips, and every parse failure degrades as specified |
| `pnpm run check:resolve` | Supersession, contested detection, scope filtering, the timeline snapshot and glyph derivation |
| `pnpm run check:walrus` | A live upload to Walrus, the aggregator read-back, and the memory-blob mix-up guard |

See **[FALLBACKS.md](FALLBACKS.md)** for the paths taken during the build and
what each one costs.

---

## What this deliberately is not

No database — Walrus Memory is the only store. No user accounts or login inside
Glassbox; identity is the delegate key on the machine plus `GLASSBOX_AUTHOR`. No
editing or deleting. No conflict-resolution machinery: `remember` is
append-only, so simultaneous writes from two machines both succeed and neither
is lost — the only conflict is semantic, and contested detection is how it
surfaces. No real-time transport between machines: no WebSockets, no SSE, no
peer connections. Machines meet only in the shared memory, and polling is how
that is observed. No chat interface — the assistant lives in its own window, and
that separation is the point.
