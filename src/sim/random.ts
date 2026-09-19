/** Stateless pseudo-random sequence so the simulation can be replayed in tests. */
export type Rng = () => number;

/** Mulberry32: tiny, fast, seedable, deterministic PRNG. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** True with probability p (clamped to [0,1]). Consumes one draw. */
export function chance(rng: Rng, p: number): boolean {
  const q = Math.max(0, Math.min(1, p));
  if (q === 0) return false;
  if (q === 1) return true;
  return rng() < q;
}

/** Pick a weighted random entry. Consumes one draw. */
export function pickWeighted<T>(
  rng: Rng,
  entries: ReadonlyArray<readonly [T, number]>,
): T {
  let total = 0;
  for (const [, w] of entries) total += w;
  let roll = rng() * total;
  for (const [value, w] of entries) {
    roll -= w;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

/** Low-pass filter: exponential moving average. Pure. */
export function ema(prev: number, target: number, dt: number, tau: number): number {
  return prev + (target - prev) * Math.min(1, Math.max(0, dt) / Math.max(tau, 1e-6));
}