# Joining an existing Glassbox memory

You are reading this because someone on your team already set up a shared
memory and wants you on it. You need none of their files — only the account id,
a delegate key of your own, and this repository.

## What you need

- **The account ID** — a `0x…` string. Ask whoever set up the memory.
  **It is not a secret** and can sit in a README or a chat message.
- **A delegate key of your own** — 64 hexadecimal characters. The account owner
  creates one for you. **Never reuse someone else's.**
- Node.js 20 or later, and this repository.

## Step 1 — The owner issues you a key

The person who owns the account does this once, per person, per machine:

1. Sign in at `https://memory.walrus.xyz` with the wallet that owns the account.
2. Create a delegate key, labelled for the machine it is for — `maria-mbp`,
   `dan-x1`. The label appears on `/team`, so a vague one is a key nobody can
   safely revoke later.
3. Copy the private key. **It is shown once.**
4. Send it over a channel that is not group chat and not email — a password
   manager share, or in person.

An account holds a **maximum of 20 delegate keys**. Revoking is the same screen,
and it takes effect for that machine only.

## Step 2 — Configure Glassbox on your machine

```bash
pnpm install
```

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```
MEMWAL_ACCOUNT_ID=0x…            # the shared account id
MEMWAL_PRIVATE_KEY=…             # your delegate key, yours alone
GLASSBOX_AUTHOR=dan-x1           # lowercase, numbers, hyphens
GLASSBOX_NAMESPACES=default,team
```

Then confirm the key works and print its address:

```bash
pnpm run doctor
```

> Use `pnpm run doctor`, not `pnpm doctor` — pnpm has a built-in command by that
> name and would run its own instead of this project's.

```bash
pnpm dev
```

You should see memories your teammates recorded, each attributed to its author,
and a `JOINED SHARED MEMORY` block at the top of the feed. If anything is
missing, `http://localhost:3000/doctor` names the exact variable and file.

## Step 3 — Connect your assistant

**This works with any assistant tool that speaks the Model Context Protocol and
can send request headers — the memory is not tied to one client.** Add this
server to your tool's MCP configuration:

```json
{
  "mcpServers": {
    "memwal": {
      "url": "https://relayer.memory.walrus.xyz/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_DELEGATE_PRIVATE_KEY",
        "x-memwal-account-id": "THE_SHARED_ACCOUNT_ID"
      }
    }
  }
}
```

Config file locations: Cursor `~/.cursor/mcp.json`; Claude Desktop (macOS)
`~/Library/Application Support/Claude/claude_desktop_config.json`; Codex
`~/.codex/config.toml`. For Claude Code run:

```bash
claude mcp add --transport http memwal https://relayer.memory.walrus.xyz/api/mcp
```

then add the two headers to the generated entry by editing the file.

**Never commit an MCP config containing a real `Authorization` header.** The
bearer token is your delegate private key and is equivalent to an API key.

Restart your tool. Ask it what memory tools it has — you should see
`memwal_recall`, `memwal_remember` and others.

**If your tool cannot attach custom headers**, use Glassbox in the browser
instead. You get full read and write; you only lose the assistant integration.
This is a supported way to work, not a failure.

## Step 4 — Give your assistant the rules

Merge `GLASSBOX.md` from this repository into your assistant's instruction file
— for Claude Code that is `~/.claude/CLAUDE.md`, between
`<!-- glassbox:start -->` and `<!-- glassbox:end -->`. Set the author slug
inside it to match your `GLASSBOX_AUTHOR`. Restart the tool.

Without this, your assistant will write to its own local memory file instead of
the shared memory, because its built-in memory instructions outrank tool
descriptions.

## Step 5 — Confirm you are on the shared memory

Ask your assistant a question about something a teammate recorded. It should
answer and name the author. In the browser, `/team` should list more than one
author.

If it answers from general knowledge, or `/team` lists only you, your account id
does not match theirs. Check it character by character before changing anything
else.

## What everyone on this memory can see

Every credential on this account can read **every** memory on it, including
memories scoped `MINE`. Scope is a convention between Glassbox clients that
keeps working notes out of your teammates' way. **It is not a security
boundary.** Never record a credential, a key, or anything you would not show the
whole team.

Glassbox blocks obvious credentials before they are sent anywhere — hex keys,
PEM blocks, `sk-`/`ghp_`/`AKIA` tokens, card numbers and labelled secrets — but
that gate catches shapes, not judgement. Assume anything you record is readable
by everyone on the account, forever, because it is.
