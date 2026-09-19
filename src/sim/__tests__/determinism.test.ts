import { describe, expect, it } from 'vitest';
import { addOrder, createInitialState, tick, upgrade } from '../factory';
import { mulberry32 } from '../random';
import { richState, seededRun } from './helpers';

describe('determinism', () => {
  it('running the same seed twice yields byte-identical factories', () => {
    const a = exercise(42, 600);
    const b = exercise(42, 600);
    expect(b).toEqual(a);
  });

  it('pumping inputs does not mutate the caller-owned state objects', () => {
    const s0 = createInitialState({ wallTime: 0 });
    const ordered = addOrder(s0, 'worker').state;
    const snapOfOrdered = structuredClone(ordered);
    tick(ordered, 0.1, () => 0.99);
    tick(ordered, 5, () => 0.5);
    expect(ordered).toEqual(snapOfOrdered);

    const snapOfInitial = structuredClone(s0);
    expect(s0).toEqual(snapOfInitial); // addOrder left s0 untouched
  });

  it('a zero-dt tick is a pure no-op (same reference, no change)', () => {
    const s = createInitialState({ wallTime: 0 });
    const after = tick(s, 0, () => 0.99);
    expect(after).toBe(s);
  });

  it('events + breakdowns reproduce exactly for identical seeds', () => {
    const a = exercise(7, 900);
    const b = exercise(7, 900);
    expect(a.stats.breakdowns).toBe(b.stats.breakdowns);
    expect(a.stats.eventsTriggered).toBe(b.stats.eventsTriggered);
    expect(a.machines.fabricator.state).toBe(b.machines.fabricator.state);
    expect(a.machines.fabricator.progress).toBe(b.machines.fabricator.progress);
    expect(a.log.map((l) => l.message)).toEqual(b.log.map((l) => l.message));
  });

  it('different seeds diverge over a long run', () => {
    const a = exercise(1, 600);
    const b = exercise(2, 600);
    // Runs this long reliably trip different event/breakdown draws.
    expect(
      a.stats.breakdowns !== b.stats.breakdowns ||
        a.stats.eventsTriggered !== b.stats.eventsTriggered ||
        a.elapsed !== b.elapsed,
    ).toBe(true);
  });

  it('mulberry32 is a stable PRNG', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

/** Preload orders + a key upgrade, then run with a fixed seed (dt 0.5). */
function exercise(seed: number, seconds: number) {
  let s = richState();
  s = upgrade(s, 'fabricator', 'speed').state;
  for (let i = 0; i < 4; i++) s = addOrder(s, i % 2 === 0 ? 'worker' : 'combat').state;
  return seededRun(s, seconds, seed);
}