import { StorageView } from "@/components/storage-view";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function StoragePage() {
  const cfg = getConfig();

  return (
    <div>
      <header className="pagehead">
        <div className="label">WHERE THIS LIVES</div>
        <h1>Storage</h1>
        <p>
          Namespaces, blob identifiers, expiry, and the control that proves the
          record survives independently of the search index.
        </p>
      </header>

      <StorageView namespaces={cfg.namespaces} canReadText={cfg.canReadText} />
    </div>
  );
}
