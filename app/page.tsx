import { getConfig } from "@/lib/config";
import { Feed } from "@/components/feed";

export const dynamic = "force-dynamic";

/**
 * The daily surface and the demo. The capture box and a live feed.
 *
 * Every route renders whatever is missing from the environment; controls that
 * cannot work are disabled with a reason beside them, never hidden.
 */
export default function HomePage() {
  const cfg = getConfig();

  const disabledReason = !cfg.canReadText
    ? "No credential configured. See the notice above."
    : !cfg.author
      ? "GLASSBOX_AUTHOR is not set, so recording is disabled. Reading still works."
      : null;

  return (
    <div>
      <header className="pagehead">
        <div className="label">SHARED MEMORY</div>
        <h1>Feed</h1>
        <p>
          Decisions, constraints and commitments recorded once — by a person here,
          or by a teammate&apos;s assistant on another machine. Everything below is
          stored on the shared account, not in this browser.
        </p>
      </header>

      <Feed
        namespaces={cfg.namespaces}
        defaultScope={cfg.defaultScope}
        defaultScopeFromEnv={cfg.defaultScope === "team"}
        canWrite={cfg.canWrite}
        canReadText={cfg.canReadText}
        viewer={cfg.author}
        accountId={cfg.accountId}
        disabledReason={disabledReason}
      />
    </div>
  );
}
