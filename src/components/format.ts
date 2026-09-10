/**
 * Timestamps are rendered on the server and shipped as strings: a locale- or
 * timezone-dependent format would differ between the server and the browser
 * and break hydration, so everything is UTC and fixed-width.
 */
export function formatTimestamp(value: Date): string {
  return value.toISOString().replace('T', ' ').slice(0, 16) + 'Z';
}

/** Case ids are UUID-shaped; operators read the tail, not the whole thing. */
export function caseReference(id: string): string {
  return `CASE-${id.slice(-6).toUpperCase()}`;
}

/** How long a request has been waiting, coarse enough to stay readable. */
export function formatDuration(from: Date, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function formatAmount(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
