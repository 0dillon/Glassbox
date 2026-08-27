import {
  DEFAULT_AGGREGATOR,
  DEFAULT_NAMESPACES,
  DEFAULT_PUBLISHER,
  DEFAULT_SERVER_URL,
  getConfig,
  getResolvedOwner,
} from "@/lib/config";
import { listFallbacks } from "@/lib/fallbacks";
import { checkConnectivity } from "@/app/actions";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

/**
 * Section 6, Step 2 — /doctor always renders regardless of what is missing.
 * Every variable is listed as PRESENT or MISSING with its exact remedy.
 */

interface VarRow {
  name: string;
  required: string;
  fallback: string;
  present: boolean;
  remedy: string;
}

export default async function DoctorPage() {
  const cfg = getConfig();

  const has = (n: string) => Boolean(process.env[n]?.trim());

  const rows: VarRow[] = [
    {
      name: "MEMWAL_ACCOUNT_ID",
      required: "Everything",
      fallback: "none",
      present: has("MEMWAL_ACCOUNT_ID"),
      remedy:
        "Add it to .env.local in the project root, then restart the server. Get it from memory.walrus.xyz. It starts with 0x and is not a secret.",
    },
    {
      name: "MEMWAL_PRIVATE_KEY",
      required: "Everything",
      fallback: "none",
      present: has("MEMWAL_PRIVATE_KEY"),
      remedy:
        "Add it to .env.local in the project root, then restart the server. It is your own 64-character delegate key. Never reuse someone else's.",
    },
    {
      name: "GLASSBOX_AUTHOR",
      required: "Writing",
      fallback: "none",
      present: Boolean(cfg.author),
      remedy:
        "Add it to .env.local in the project root, then restart the server. Lowercase letters, numbers and hyphens only, for example maria-mbp.",
    },
    {
      name: "MEMWAL_SERVER_URL",
      required: "Everything",
      fallback: DEFAULT_SERVER_URL,
      present: has("MEMWAL_SERVER_URL"),
      remedy: "Optional. The default relayer is used when it is not set.",
    },
    {
      name: "GLASSBOX_NAMESPACES",
      required: "The recall sweep",
      fallback: DEFAULT_NAMESPACES.join(","),
      present: has("GLASSBOX_NAMESPACES"),
      remedy:
        "Optional. Comma-separated. Namespaces are exact-match and case-sensitive — team and Team are two permanently separate memories.",
    },
    {
      name: "GLASSBOX_DEFAULT_SCOPE",
      required: "Capture default",
      fallback: "mine",
      present: has("GLASSBOX_DEFAULT_SCOPE"),
      remedy:
        "Optional. Set to team for a shared-by-default workspace. The shipped default is mine, which is the safe one: storage is append-only, so an accidental TEAM write cannot be unpublished.",
    },
    {
      name: "WALRUS_PUBLISHER",
      required: "Attachments",
      fallback: DEFAULT_PUBLISHER,
      present: has("WALRUS_PUBLISHER"),
      remedy: "Optional. The default public testnet publisher is used when it is not set.",
    },
    {
      name: "WALRUS_AGGREGATOR",
      required: "Attachments",
      fallback: DEFAULT_AGGREGATOR,
      present: has("WALRUS_AGGREGATOR"),
      remedy: "Optional. The default public testnet aggregator is used when it is not set.",
    },
    {
      name: "MEMWAL_OWNER_ADDRESS",
      required: "Metadata API only",
      fallback: "resolved at runtime",
      present: has("MEMWAL_OWNER_ADDRESS"),
      remedy:
        "Only needed if owner discovery fails. Find your account owner address at memory.walrus.xyz.",
    },
  ];

  const connectivity = await checkConnectivity();
  const fallbacks = listFallbacks();

  return (
    <div>
      <header className="pagehead">
        <div className="label">DIAGNOSTICS</div>
        <h1>Doctor</h1>
        <p>
          What this machine has, what it can reach, and exactly what to add if
          something is missing. This page always renders, whatever is
          unconfigured.
        </p>
      </header>

      <section className="mb-[var(--s-8)]">
        <h2 className="subhead mb-[var(--s-4)]">CAPABILITIES</h2>
        <div className="grid grid-cols-2 gap-[var(--s-4)] sm:grid-cols-4">
          <Capability label="READ TEXT" on={cfg.canReadText} />
          <Capability label="WRITE" on={cfg.canWrite} />
          <Capability label="METADATA" on={cfg.canReadMetadata} />
          <Capability label="ATTACHMENTS" on={cfg.canAttach} />
        </div>
      </section>

      <section className="mb-[var(--s-8)]">
        <h2 className="subhead mb-[var(--s-4)]">ENVIRONMENT</h2>
        <div className="overflow-x-auto">
          <table className="gb-table">
            <thead>
              <tr>
                <th>Variable</th>
                <th>State</th>
                <th>Required for</th>
                <th>Default</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td className="mono whitespace-nowrap">{r.name}</td>
                  <td>
                    <Badge variant={r.present ? "default" : "muted"}>
                      {r.present ? "PRESENT" : "MISSING"}
                    </Badge>
                    {!r.present ? (
                      <div className="mt-[var(--s-2)] max-w-[52ch] text-[var(--t-sm)] leading-[var(--lh-sm)] text-[var(--grey-700)]">
                        {r.remedy}
                      </div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap">{r.required}</td>
                  <td className="mono break-all text-[var(--grey-500)]">{r.fallback}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-[var(--s-8)]">
        <h2 className="subhead mb-[var(--s-4)]">CONNECTIVITY</h2>
        <div className="overflow-x-auto">
          <table className="gb-table">
            <thead>
              <tr>
                <th>Check</th>
                <th>Result</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {connectivity.map((c) => (
                <tr key={c.name}>
                  <td className="whitespace-nowrap">{c.name}</td>
                  <td>
                    <Badge variant={c.ok ? "default" : "muted"}>
                      {c.ok ? "OK" : "NO"}
                    </Badge>
                  </td>
                  <td className="max-w-[60ch] break-words text-[var(--grey-700)]">
                    {c.detail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="subhead mb-[var(--s-4)]">FALLBACKS TAKEN THIS RUN</h2>
        {fallbacks.length === 0 ? (
          <p className="text-[var(--t-sm)] text-[var(--grey-700)]">
            None. Every component took its primary path.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="gb-table">
              <thead>
                <tr>
                  <th>What</th>
                  <th>Failure</th>
                  <th>Consequence</th>
                </tr>
              </thead>
              <tbody>
                {fallbacks.map((f) => (
                  <tr key={`${f.what}-${f.at}`}>
                    <td className="whitespace-nowrap">{f.what}</td>
                    <td className="max-w-[44ch] break-words">{f.failure}</td>
                    <td className="max-w-[44ch] break-words text-[var(--grey-700)]">
                      {f.consequence}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {getResolvedOwner() ? (
          <p className="label mt-[var(--s-4)] break-all normal-case tracking-normal">
            Owner address resolved: {getResolvedOwner()}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function Capability({ label, on }: { label: string; on: boolean }) {
  return (
    <div
      className={[
        "border-[2px] p-[var(--s-4)]",
        on
          ? "border-[var(--ink)] bg-[var(--paper)]"
          : "border-[var(--grey-300)] bg-[var(--off)]",
      ].join(" ")}
    >
      <div className="label">{label}</div>
      <div
        className={[
          "numeral mt-[var(--s-2)] text-[var(--t-lg)]",
          on ? "text-[var(--ink)]" : "text-[var(--grey-500)]",
        ].join(" ")}
      >
        {on ? "YES" : "NO"}
      </div>
    </div>
  );
}
