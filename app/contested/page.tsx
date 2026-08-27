import { ContestedList } from "@/components/contested-list";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function ContestedPage() {
  const cfg = getConfig();

  return (
    <div>
      <header className="pagehead">
        <div className="label">DISAGREEMENTS</div>
        <h1>Contested</h1>
        <p>
          Contested means two memories say different things and neither has
          replaced the other. Nothing is wrong yet — someone needs to decide.
        </p>
      </header>

      <ContestedList canWrite={cfg.canWrite} />
    </div>
  );
}
