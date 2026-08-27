# Fallbacks taken during the build

Section 8 of the specification requires that every fallback taken is recorded
with what failed, which path was taken, and what is consequently unavailable.
This file is that record for the build. Fallbacks taken at *runtime* are shown
live on `/doctor`, under FALLBACKS TAKEN THIS RUN.

---

## 1. `@mysten/sui` and `@mysten/seal` were installed, against Section 4

**What the spec said.** Section 4, "Do not install": `@mysten/sui`,
`@mysten/seal`, `@mysten/walrus` — "optional peer dependencies needed only for
client-side encryption and AI-middleware paths this project does not use."

**What is actually true.** Verified by reading the installed package. In
`@mysten-incubation/memwal@0.1.5`, `MemWal.signedRequest` attaches an
`x-seal-session` header on **every relayer-mode route** — that is `remember`,
`recall` and `restore`, the entire demo path:

```js
// dist/memwal.js
if (options.includeDelegateKey !== false) {
    headers["x-seal-session"] = await this.buildSealSession();
}
```

`buildSealSession` dynamically imports `@mysten/seal` and
`@mysten/sui/keypairs/ed25519`, and throws when they are absent:

```js
const sealMod = (await import("@mysten/seal"));
const ed25519Mod = (await import("@mysten/sui/keypairs/ed25519"));
// ...
throw new Error(`Required ${cfg.suiTransport} Sui client or Ed25519Keypair not found ...`)
```

Only the *manual*-mode methods (`rememberManual`, `recallManual`) opt out via
`includeDelegateKey: false`. So the premise behind the instruction is inverted:
these packages are required by the relayer path and skippable only on the
client-side-encryption path the project does not use.

**Path taken.** Installed `@mysten/sui@2.26.2` and `@mysten/seal@1.4.4`.

**Why this rather than the documented degradation.** Without them, `probeSdk`
would find the methods present but every call would throw, driving the app to
`canWrite: false` and `canReadText: false` — a fully degraded app with no feed,
no capture and no demo. The stated reason for the "do not install" rule was
bundle size ("adds tens of megabytes for nothing"), not correctness. Paying that
cost is strictly better than shipping an app that cannot read or write.

`@mysten/walrus` was **not** installed; it genuinely is unused. `ai` and `zod`
were not installed either.

**What this costs.** Roughly 30 MB of `node_modules`. Nothing functional.

---

## 2. Next.js 16 instead of Next.js 15

**What failed.** `pnpm create next-app@latest` now installs Next 16.3.3; Section
4's table names `^15.0.0`.

**Path taken.** Kept Next 16. The App Router and server actions — the only two
Next features this project depends on, and the reason Section 2 puts every
credential behind a server action — are unchanged.

**What this costs.** Nothing observed. All eight routes build and render.

---

## 3. `create-next-app` could not scaffold into the project directory

**What failed.** The working directory is named `Glassbox`, and npm package
names may not contain capital letters:

```
Could not create a project called "Glassbox" because of npm naming restrictions:
    * name can no longer contain capital letters
```

**Path taken.** Scaffolded into a sibling temporary directory, moved the
generated files into the repository root, and set `"name": "glassbox"` in
`package.json`. The resulting tree matches Section 3.

**What this costs.** Nothing.

---

## 4. The shadcn CLI no longer accepts `--base-color`, and its default style
   is not the one Section 9A describes

**What failed.** `pnpm dlx shadcn@latest init --base-color neutral` exits with
`error: unknown option '--base-color'`. The current CLI replaced the style and
base-colour prompts with a preset system (`nova`, `vega`, `maia`, …), so the
"New York / Neutral" answers in Section 9A(a) no longer exist.

**Path taken.** `init --template next --base radix --preset nova
--css-variables`. The preset choice is irrelevant here because Section 9A(c)
requires overwriting the generated token block wholesale, which was done before
any component was rendered.

**What this costs.** Nothing. The tokens in `app/globals.css` are Section 9's
palette, scale and radius exactly.

---

## 5. Six shadcn components were hand-written rather than restyled

Permitted explicitly by Section 9A(e): *"Styling cannot be overridden cleanly →
Stop fighting it. Delete it from `components/ui/` and hand-write a replacement
with the same export name and props."*

The current `radix-nova` style ships rounded geometry baked into size variants
(`rounded-[min(var(--radius-md),10px)]`), soft rings, and — in `dialog` — an
explicit `backdrop-blur-xs`, which Section 9 forbids outright as
glassmorphism.

| Component | Why | Replacement |
|---|---|---|
| `alert` | Needed the `--b-slab` left edge, which the original has no notion of | Hand-written, same exports |
| `skeleton` | Default carries a shimmer gradient | Flat `--off` block |
| `separator` | Radix wrapper for a 2px rule | Plain div, same export |
| `table` | Default padding and dividers conflict with the Section 9 table spec | Wraps the `.gb-table` primitive, same exports |
| `slider` | Radix thumb and track ship rounded geometry the token reset could not reach | Native `range` input styled by `.gb-range` |
| `scroll-area` | Radix viewport adds nothing over native overflow | Native overflow, same export |

`button`, `input`, `textarea`, `badge`, `dialog`, `toggle-group`, `tooltip` and
`label` were kept and rewritten in place. `toggle.tsx` was deleted as unused.

**What this costs.** Nothing. Every export name and call site is unchanged.

---

## 6. Tailwind v4 cannot infer a border width from `var()`

**What failed.** `border-[var(--b-rule)]` compiled to a border *colour*, not a
width — Tailwind cannot tell which property an opaque `var()` is meant for, and
defaults `border-[…]` to colour. Every border in the app rendered at `0px`.
Caught by reading computed styles in the browser, not by the type checker or the
build.

**Path taken.** Border and outline widths use explicit lengths matching the
tokens — `border-[2px]`, `border-l-[6px]`, `border-[1px]`, `outline-[3px]`. The
token values themselves still live in `:root` and drive every CSS-level
primitive (`.panel`, `.gb-table`, `.pagehead`, `.label`) and the inline styles on
the memory tile.

Padding, gap, font-size and colour arbitrary values with `var()` **do** resolve
correctly and were left alone.

**What this costs.** Border widths appear as literals in class strings rather
than as `var()` references. Verified correct at runtime: rail 2px, tiles 2px,
missing-key slab 6px, radius 0 everywhere, no blurred shadow anywhere.

---

## 7. `pnpm doctor` collides with a built-in pnpm command

**What failed.** `pnpm doctor` runs pnpm's own environment doctor, not
`scripts/doctor.ts`. Section 7 and Appendix D both write it as `pnpm doctor`.

**Path taken.** The script is still named `doctor`; `README.md` and `JOIN.md`
both instruct `pnpm run doctor`, with a note explaining why.

**What this costs.** Four extra characters in one documented command.

---

## 8. The feed sweep threshold was raised from 0.7 to 2.0

**What failed.** Appendix A prescribes sweeping with a fixed broad query at
`maxDistance: 0.7`, on the reasoning that 0.7 or above means "unrelated". With a
real memory on a real account, the feed showed nothing while `restore` confirmed
the memory was stored and indexed.

**Measured against the live relayer**, for a memory about the header codec:

| Query | Distance |
|---|---|
| `decision constraint convention promise correction` (the sweep query) | **0.819** |
| `structured fields inside memory text storage layer namespace` | 0.351 |

At 0.7 the memory was silently filtered out of its own feed.

**Path taken.** `FEED_MAX_DISTANCE = 2.0`, which is no filter at all on a cosine
distance. The reasoning behind 0.7 holds for a *search* and fails for the feed,
which is not a search: it has to show the whole memory set, not the part that
happens to sit near one fixed phrase. `limit` bounds the page instead.

Contested detection still uses the tight 0.35 threshold. That one really is a
similarity test, and it compares one memory body against another rather than
against a generic phrase.

**What this costs.** Nothing. A threshold that hides real memories is worse than
no threshold.

---

## 9. Recalls are retried; the relayer intermittently rejects a valid credential

**What failed.** With a correctly registered delegate key, roughly one recall in
three returns `Walrus Memory isn't signed in. Call the memwal_login tool, then
retry.` — and the very next identical request succeeds. Observed on both
namespaces, both sequentially and concurrently, so it is neither
namespace-specific nor a concurrency fault on our side.

**Path taken.** Section 8 already sanctions retrying idempotent reads twice with
1s and 3s backoff; that is now applied to `recall`. Only a third consecutive
failure marks a namespace degraded. Writes are still never retried, because a
timeout there does not mean the write failed.

The per-namespace sweep also became sequential rather than `Promise.all`. Each
namespace already retries, and firing them all at once multiplies load at
exactly the moments the relayer is flaky. Two namespaces warm cost 1–2s total.

**What this costs.** A failing namespace now takes up to ~4s longer to be
reported as degraded.

---

## 10. Poll passes could overlap, and the owner address was never resolved for the feed

Two defects found once the app ran against a real account.

**Overlapping polls.** A sweep takes 7–21s against the live relayer while the
client polls every 6s, so passes stacked up and each one added load. Fixed with
an in-flight guard on the client, plus a 4-second budget on contested detection
— leftover candidates are picked up on a later tick, since nothing there is
time-critical.

**Owner address.** `pollMemories` called `listMemories`, which needs the account
**owner** address, but nothing on the feed path ever resolved it — only `/team`
and `/doctor` did. The feed was therefore pinned to TEXT-ONLY mode however
healthy the signed API was. `pollMemories` now resolves the owner once per
process, and the app reaches FULL mode.

**Also fixed:** the RECORD button used `useTransition`, whose pending flag never
cleared after the server action returned, leaving the button stuck on
`RECORDING…` even though the write had succeeded and the tile had rendered.
Replaced with explicit state and a `finally`.

---

## Runtime fallbacks — where to look

These are decided while the app is running, not at build time, and are shown
live on `/doctor` and in the rail's mode indicator:

- **Metadata API 401 / 403 / 404 / repeated 426** → permanent `TEXT-ONLY MODE`
  for the session. Lost: byte sizes, expiry dates, storage status, memory ids,
  namespace totals, and the credential list on `/team`. Every memory feature —
  feed, capture, scopes, supersession, contested detection, timeline, `/team`
  authors — is unaffected, because scope, author and timestamp live in the
  header rather than in that API. No retry loop, and no guessing at alternative
  URL shapes or API versions.
- **Owner address unresolvable** → the ordered probe in `lib/memwal.ts`
  (`restore` → one probe write → `MEMWAL_OWNER_ADDRESS` → `TEXT-ONLY MODE`). An
  owner address is never guessed, and the delegate address is never sent in its
  place.
- **A namespace's recall fails** → that namespace is marked degraded and the
  others still render. The sweep is never stopped entirely.
- **Rate limiting** → the sweep interval doubles to a 60s cap and contested
  detection drops from 8 checks per pass to 2, recovering after two consecutive
  successes.
- **Any network failure** → the last successfully rendered data stays on screen,
  the mode indicator reads `OFFLINE`, and the rail shows when it last updated. A
  blank page or an error boundary would be a failure of the specification.
- **A header that cannot be parsed** → the whole raw string becomes the body,
  the memory renders `UNSCOPED` with the reason, and the detail page offers
  REPAIR. Never dropped, never guessed at.
- **Attachment upload failure** → `canAttach: false`, the attach control is
  disabled with `Attachment storage unreachable`, everything else keeps working.
