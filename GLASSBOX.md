# Glassbox memory protocol

Merge everything below into your assistant's instruction file, then restart the
tool. For Claude Code that file is `~/.claude/CLAUDE.md`, and the block belongs
between the two markers so it can be updated later without hunting for it.

Why this is necessary: an assistant's built-in memory sits in its system prompt
and outranks tool descriptions, so without an explicit instruction it will write
to its own local memory file instead of the shared one.

Set the author slug below to match your `GLASSBOX_AUTHOR`.

---

<!-- glassbox:start -->

**You have access to a shared team memory through the `memwal_*` tools. Follow these rules.**

**Namespace.** Every call passes an explicit `namespace`. Use the repository or project name in lowercase with hyphens, for example `ingest-service`. Namespaces are exact-match and case-sensitive — `ingest-service` and `Ingest-Service` are two permanently separate memories. Slashes carry no hierarchy. There is no search across namespaces.

**Header.** Every memory you write starts with this header, followed by a single space and then the fact:

```
[gb1 scope=<team|mine> author=<the author slug given below> ts=<current UTC time, ISO 8601, Z suffix>] <the fact>
```

Never omit the header. Never show it to the user in conversation.

**Your author slug is:** `CHANGE-ME` — set this to match the `GLASSBOX_AUTHOR` in your `.env.local`.

**Read at the start of every session.** Before answering the first substantive question in a session, and before any question beginning "why", call `memwal_recall` with a query describing the current task. Report what you found and who recorded it. If nothing comes back, say so rather than answering from general knowledge.

**Write these:**

- A **decision** and the reason behind it. The reason is the part that matters — a decision without one gets re-litigated.
- A **constraint** discovered the hard way. Something that does not work, and why.
- A **convention** the team has settled on.
- A **promise**: who owes what, to whom, by when.
- A **correction** of something already in memory. Follow the supersession rule below.
- A **discovery that cost more than fifteen minutes**. The fix, and the symptom that led to it.

**Never write these:**

- The current task, the file being edited, or anything about this session's state.
- Anything already recoverable from the repository — code, config, commit messages, the contents of a file.
- Credentials, keys, tokens, passwords, or personal data.
- Speculation, or a plan that has not been agreed.
- Small talk, or an acknowledgement.
- A restatement of something already in memory. Recall first.

**When to write.** At the moment the durable thing is stated, not at the end of the session. If several facts arrive together, use `memwal_remember_bulk` with up to 20 in one call.

**Confirm before writing.** Show the exact text you are about to store, including the header, and wait for agreement. Storage is permanent — there is no delete — so a wrong memory stays. When several are pending, batch the confirmations rather than interrupting each time.

**Scope.** `team` is visible to everyone on this memory. `mine` is a convention meaning it is your author's working note — it is **not** private, since everyone with access to this account can read everything. When it is not obvious which applies, ask. **If you get no answer, use `mine`.**

**Correcting something already stored.** Storage is append-only, so you cannot edit or delete. To correct a memory, write a new one that **restates the whole fact** and names the one it replaces:

```
[gb1 scope=team author=<you> ts=<now> supersedes=<the memory blob id>] SQLite handles ingest, not Postgres. Replaces the earlier note that Postgres was still in use.
```

Never write a bare correction such as "actually it's SQLite now". Search works by meaning, so a bare correction will not surface on a query about Postgres and the stale memory will keep winning. The memory blob id comes back as `blob_id` from the recall result you are correcting.

**When recall returns two memories that disagree** and neither supersedes the other, do not pick one. Report both, with their authors and dates, and ask which is current. Then write the supersession.

**When something fails.** If a memory tool returns an authentication error, tell the user their machine's credential may need renewing and continue without memory rather than stopping work. If recall returns nothing, say so plainly.

<!-- glassbox:end -->
