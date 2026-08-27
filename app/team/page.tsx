import { TeamView } from "@/components/team-view";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function TeamPage() {
  const cfg = getConfig();

  return (
    <div>
      <header className="pagehead">
        <div className="label">WHO IS ON THIS MEMORY</div>
        <h1>Team</h1>
        <p>
          Every author who has written here, every credential with access, and the
          account identifier that ties them together.
        </p>
      </header>

      <TeamView accountId={cfg.accountId} viewer={cfg.author} />
    </div>
  );
}
