export const EVENT_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const known = new Map(Intl.supportedValuesOf("timeZone").map(z => [z.toLowerCase(), z]));
export function normalizeTimeZone(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > 100 || value !== value.trim()) return null;
  let resolved: string;
  try { resolved = new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone; } catch { return null; }
  if (/^[+-]/.test(resolved) || /^(UTC|GMT)[+-]/.test(resolved)) return null;
  const listed = known.get(value.toLowerCase());
  if (listed) return listed;
  if (resolved.toLowerCase() === value.toLowerCase()) return resolved;
  return /^[A-Z][A-Za-z0-9_+-]*(\/[A-Z0-9][A-Za-z0-9_+-]*)*$/.test(value) ? value : null;
}
export const validTimeZone = (value: unknown): value is string => normalizeTimeZone(value) !== null;
