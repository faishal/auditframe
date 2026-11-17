const pad = (n: number, w = 2) => String(Math.abs(Math.trunc(n))).padStart(w, '0');

export type ZoneKind = 'utc' | 'local';

/**
 * Tiny token formatter. Tokens: YYYY MM DD HH mm ss SSS Z. Everything else is literal.
 * `Z` renders `Z` in UTC and `+HH:mm` in local time.
 * `tzOffsetMinutes` overrides the local offset (minutes east of UTC) for deterministic tests.
 */
export function formatTime(date: Date, format: string, zone: ZoneKind, tzOffsetMinutes?: number): string {
  const offset = zone === 'utc' ? 0 : tzOffsetMinutes ?? -date.getTimezoneOffset();
  const shifted = new Date(date.getTime() + offset * 60_000);
  const parts: Record<string, string> = {
    YYYY: pad(shifted.getUTCFullYear(), 4),
    MM: pad(shifted.getUTCMonth() + 1),
    DD: pad(shifted.getUTCDate()),
    HH: pad(shifted.getUTCHours()),
    mm: pad(shifted.getUTCMinutes()),
    ss: pad(shifted.getUTCSeconds()),
    SSS: pad(shifted.getUTCMilliseconds(), 3),
    Z:
      zone === 'utc'
        ? 'Z'
        : `${offset >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
  };
  return format.replace(/YYYY|MM|DD|HH|mm|ss|SSS|Z/g, (t) => parts[t]);
}

export function formatDrift(driftMs: number | null): string {
  if (driftMs === null) return 'unknown';
  const sign = driftMs >= 0 ? '+' : '-';
  const abs = Math.abs(driftMs);
  return abs >= 1000 ? `${sign}${(abs / 1000).toFixed(3)} s` : `${sign}${Math.round(abs)} ms`;
}
