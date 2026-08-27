import { TimelineView } from "@/components/timeline-view";

export const dynamic = "force-dynamic";

export default function TimelinePage() {
  return (
    <div>
      <header className="pagehead">
        <div className="label">WHAT WAS KNOWN WHEN</div>
        <h1>Timeline</h1>
        <p>
          Drag backwards to see the memory set as it stood on a given day.
          Supersessions are applied only if they had already happened by then, so
          a memory that was later replaced shows as current.
        </p>
      </header>

      <TimelineView />
    </div>
  );
}
