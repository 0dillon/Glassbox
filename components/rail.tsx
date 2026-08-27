"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ModeIndicator } from "@/components/mode-indicator";

const ROUTES: Array<{ href: string; label: string }> = [
  { href: "/", label: "FEED" },
  { href: "/contested", label: "CONTESTED" },
  { href: "/timeline", label: "TIMELINE" },
  { href: "/team", label: "TEAM" },
  { href: "/storage", label: "STORAGE" },
  { href: "/doctor", label: "DOCTOR" },
];

/**
 * Section 9 — a fixed 220px left rail with a 2px right border.
 *
 * The truncated account id sits under the wordmark as a persistent reminder
 * that this memory is shared, so the app never reads as local storage.
 */
export function Rail({
  accountLabel,
  accountId,
}: {
  accountLabel: string;
  accountId: string | null;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Glassbox sections"
      className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r-[2px] border-[var(--ink)] bg-[var(--paper)] md:flex"
    >
      <div className="p-[var(--s-5)]">
        <Link
          href="/"
          className="block text-[var(--t-lg)] leading-none font-black tracking-[-0.02em] uppercase"
        >
          Glassbox
        </Link>
        <div
          className="label mt-[var(--s-2)] break-all"
          title={accountId ?? "No account id configured"}
        >
          {accountLabel}
        </div>
      </div>

      <ul className="flex flex-col border-t-[2px] border-[var(--ink)]">
        {ROUTES.map((route) => {
          const active =
            route.href === "/"
              ? pathname === "/"
              : pathname.startsWith(route.href);
          return (
            <li key={route.href}>
              <Link
                href={route.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "block border-b-[1px] border-[var(--grey-100)]",
                  "px-[var(--s-5)] py-[var(--s-3)]",
                  "font-mono text-[var(--t-xs)] tracking-[0.08em] uppercase",
                  active
                    ? "border-l-[6px] border-l-[var(--ink)] bg-[var(--off)] font-bold text-[var(--ink)]"
                    : "border-l-[6px] border-l-transparent text-[var(--grey-500)] hover:bg-[var(--off)] hover:text-[var(--ink)]",
                ].join(" ")}
              >
                {route.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto border-t-[2px] border-[var(--ink)] p-[var(--s-4)]">
        <ModeIndicator />
      </div>
    </nav>
  );
}
