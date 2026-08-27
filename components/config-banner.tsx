import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { MissingVar } from "@/lib/types";

/**
 * Section 7 — one notice per missing variable, in the layout, above everything,
 * on every route. Never a single combined message.
 *
 * Every route still renders. Any control that cannot work is disabled with a
 * one-line reason beside it, never hidden.
 */
export function ConfigBanner({
  missing,
  notices,
}: {
  missing: MissingVar[];
  notices: string[];
}) {
  if (missing.length === 0 && notices.length === 0) return null;

  return (
    <div className="flex flex-col gap-[var(--s-3)] border-b-[2px] border-[var(--ink)] p-[var(--s-5)]">
      {missing.map((m) => (
        <Alert key={m.name} tone="signal">
          <AlertTitle>MISSING&nbsp;&nbsp;{m.name}</AlertTitle>
          <AlertDescription>
            <p>{m.enables}</p>
            <p>{m.remedy}</p>
          </AlertDescription>
        </Alert>
      ))}

      {notices.map((n) => (
        <Alert key={n} tone="muted">
          <AlertTitle>NOTE</AlertTitle>
          <AlertDescription>
            <p>{n}</p>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

/**
 * The degraded-mode banner, shown by pages that discovered a failure at load
 * time. Names what failed and keeps the last-loaded data on screen.
 */
export function DegradedBanner({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <Alert tone="signal" className="mb-[var(--s-5)]">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{detail}</p>
      </AlertDescription>
    </Alert>
  );
}
