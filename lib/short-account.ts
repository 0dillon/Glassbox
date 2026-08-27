/**
 * Account id truncation, safe to import from a client component.
 *
 * `lib/config.ts` is server-only, so the same helper lives here for the client
 * rather than pulling the whole config module across the boundary.
 */
export function shortAccountClient(accountId: string | null): string {
  if (!accountId) return "NO ACCOUNT";
  if (accountId.length <= 14) return accountId;
  return `${accountId.slice(0, 6)}…${accountId.slice(-4)}`;
}
