/** Format an integer-abbreviation for game displays (no trailing noise). */
export function formatNumber(n: number, fractionDigits = 0): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: fractionDigits });
}

/** Credits with a light "+/-" sign used in revenue/pop feedback. */
export function formatSigned(n: number): string {
  const sign = n >= 0 ? '+' : '−';
  return `${sign}${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
}

/** Wall clock from epoch ms (e.g. "21:42"). */
export function formatClock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** "12s", "1m 05s", "2h 03m" style countdown/duration. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

export function formatPercent(frac: number, digits = 0): string {
  return `${(frac * 100).toFixed(digits)}%`;
}