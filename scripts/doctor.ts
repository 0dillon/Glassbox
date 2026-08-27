/**
 * Command-line environment and connectivity check.
 *
 *   pnpm run doctor
 *
 * Confirms the delegate key works and prints its address, without starting the
 * app. Never throws — every failure is reported as a line, so a missing key
 * reads as a instruction rather than a stack trace.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const DEFAULT_SERVER_URL = "https://relayer.memory.walrus.xyz";
const DEFAULT_PUBLISHER = "https://publisher.walrus-testnet.walrus.space";
const DEFAULT_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";

const AUTHOR_RE = /^[a-z0-9-]{1,32}$/;

let problems = 0;

function line(state: "OK" | "NO" | "--", label: string, detail = "") {
  if (state === "NO") problems++;
  console.log(`  ${state.padEnd(3)} ${label}${detail ? ` — ${detail}` : ""}`);
}

function env(name: string): string | null {
  const v = process.env[name];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

async function main() {
  console.log("\nGLASSBOX DOCTOR\n");
  console.log("ENVIRONMENT");

  const accountId = env("MEMWAL_ACCOUNT_ID");
  const privateKey = env("MEMWAL_PRIVATE_KEY");
  const author = env("GLASSBOX_AUTHOR");
  const serverUrl = env("MEMWAL_SERVER_URL") ?? DEFAULT_SERVER_URL;

  line(
    accountId ? "OK" : "NO",
    "MEMWAL_ACCOUNT_ID",
    accountId
      ? `${accountId.slice(0, 8)}…${accountId.slice(-4)}`
      : "Add it to .env.local. Get it from memory.walrus.xyz. It starts with 0x and is not a secret."
  );

  line(
    privateKey ? "OK" : "NO",
    "MEMWAL_PRIVATE_KEY",
    privateKey
      ? `${privateKey.length} characters (never printed)`
      : "Add it to .env.local. It is your own delegate key. Never reuse someone else's."
  );

  if (author && !AUTHOR_RE.test(author)) {
    line(
      "NO",
      "GLASSBOX_AUTHOR",
      "must be lowercase letters, numbers and hyphens only, for example maria-mbp"
    );
  } else {
    line(
      author ? "OK" : "NO",
      "GLASSBOX_AUTHOR",
      author ?? "Add it to .env.local. Writing is disabled without it; reading still works."
    );
  }

  line("--", "MEMWAL_SERVER_URL", serverUrl);
  line("--", "GLASSBOX_NAMESPACES", env("GLASSBOX_NAMESPACES") ?? "default,team (default)");
  line("--", "GLASSBOX_DEFAULT_SCOPE", env("GLASSBOX_DEFAULT_SCOPE") ?? "mine (default)");
  line("--", "WALRUS_PUBLISHER", env("WALRUS_PUBLISHER") ?? DEFAULT_PUBLISHER);
  line("--", "WALRUS_AGGREGATOR", env("WALRUS_AGGREGATOR") ?? DEFAULT_AGGREGATOR);

  console.log("\nCONNECTIVITY");

  // The health endpoint is public and needs no signing.
  try {
    const res = await fetch(`${serverUrl}/health`, { cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as Record<string, unknown>;
      line(
        "OK",
        "Relayer reachable",
        `${body.status ?? "ok"}${body.version ? ` version ${body.version}` : ""}`
      );
    } else {
      line("NO", "Relayer reachable", `returned ${res.status}`);
    }
  } catch (e) {
    line("NO", "Relayer reachable", e instanceof Error ? e.message : String(e));
  }

  if (!accountId || !privateKey) {
    console.log(
      "\nSkipping the credential check — the account id and delegate key are both required for it.\n"
    );
    process.exit(problems > 0 ? 1 : 0);
  }

  // Derive the delegate address. This is local and proves the key parses.
  try {
    const { delegateKeyToSuiAddress } = await import("@mysten-incubation/memwal");
    const address = await delegateKeyToSuiAddress(privateKey);
    line("OK", "Delegate key parses", address);
  } catch (e) {
    line("NO", "Delegate key parses", e instanceof Error ? e.message : String(e));
  }

  // A real signed round trip. This is the check that proves the key WORKS —
  // the health endpoint above proves nothing about credentials.
  try {
    const { MemWal } = await import("@mysten-incubation/memwal");
    const memwal = MemWal.create({ key: privateKey, accountId, serverUrl });

    const namespaces = (env("GLASSBOX_NAMESPACES") ?? "default,team")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);

    const result = await memwal.recall({
      query: "decision constraint convention promise correction",
      namespace: namespaces[0],
      limit: 5,
      maxDistance: 0.7,
    });

    line(
      "OK",
      "Credential accepted",
      `recall in "${namespaces[0]}" returned ${result.results?.length ?? 0} of ${result.total ?? 0}`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    line(
      "NO",
      "Credential accepted",
      /401|unauthor|signed in|not registered|memwal_login/i.test(msg)
        ? "the relayer rejected this delegate key. It may need renewing at memory.walrus.xyz, or the account id may not match."
        : msg
    );
  }

  console.log(
    problems === 0
      ? "\nEverything checks out. Run pnpm dev.\n"
      : `\n${problems} problem(s) above. Each line says what to add and where.\n`
  );
  process.exit(problems > 0 ? 1 : 0);
}

void main();
