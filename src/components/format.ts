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

export function formatAmount(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
