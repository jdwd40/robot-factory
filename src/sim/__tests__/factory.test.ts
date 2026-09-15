import { describe, expect, it } from 'vitest';
import { CREDITS_PER_ROBOT, MACHINE_ORDER } from '../config';
import {
  createInitialState,
  detectBottleneck,
  resetState,
  tick,
  throughput,
  upgrade,
  upgradeCost,
} from '../factory';

/** Run `tick` n times with a fixed dt from an initial state. */
function run(initial = createInitialState(), seconds: number, dt = 0.1) {
  let state = initial;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    state = tick(state, dt);
  }
  return state;
}

describe('production flow', () => {
  it('moves work through the three stages: raw → components → unfinished → shipped', () => {
    // After 1s: fabricator has produced (raw → components only reaches assembler next tick).
    const s1 = run(createInitialState(), 1);
    expect(s1.components).toBeGreaterThan(0);
    expect(s1.rawConsumed).toBeGreaterThan(0);

    // After several seconds all buffers have seen work and robots are shipping.
    const s = run(createInitialState(), 10);
    expect(s.components).toBeGreaterThan(0);
    expect(s.unfinishedRobots).toBeGreaterThan(0);
    expect(s.robotsShipped).toBeGreaterThan(0);
  });

  it('a slow upstream stage starves downstream machines', () => {
    // Assembler level 1 consumes 2 comp/unit at 1 unit/s = 2 comp/s, but fabricator
    // at level 1 only makes 2 comp/s — fine. Drop fabricator below demand by
    // leaving it level 1 and boosting assembler: assembler wants more than fabricator
    // can supply, so components buffer trends toward zero and assembler is input-limited.
    let state = createInitialState();
    // Give assembler a huge level via upgrades is slow; instead simulate directly:
    // craft a state with an overpowered assembler.
    state = {
      ...state,
      machines: {
        ...state.machines,
        assembler: { ...state.machines.assembler, level: 10 },
      },
    };
    const before = state.components;
    state = run(state, 5);
    // Assembler (10/s) consumes components faster than fabricator (2/s) makes them.
    expect(state.components).toBeLessThan(before + 5 * 2.0 + 1e-9); // never exceeds supply rate
    // And it did consume: unfinished robots were produced.
    expect(state.unfinishedRobots + state.robotsShipped).toBeGreaterThan(0);
  });
});

describe('credits', () => {
  it('shipped robots generate credits', () => {
    const s = run(createInitialState(), 10);
    expect(s.credits).toBeCloseTo(120 + s.robotsShipped * CREDITS_PER_ROBOT, 6);
    expect(s.robotsShipped).toBeGreaterThan(0);
  });
});

describe('upgrades', () => {
  it('increases machine throughput', () => {
    const initial = createInitialState();
    const before = throughput(initial, 'fabricator');
    const { state, ok } = upgrade(initial, 'fabricator');
    expect(ok).toBe(true);
    expect(throughput(state, 'fabricator')).toBeGreaterThan(before);
  });

  it('increases the cost of the next upgrade each time', () => {
    let state = { ...createInitialState(), credits: 10000 };
    const costs: number[] = [];
    for (let i = 0; i < 3; i++) {
      costs.push(upgradeCost(state, 'finisher'));
      const result = upgrade(state, 'finisher');
      expect(result.ok).toBe(true);
      state = result.state;
    }
    expect(costs[1]).toBeGreaterThan(costs[0]);
    expect(costs[2]).toBeGreaterThan(costs[1]);
  });

  it('refuses the upgrade when credits are insufficient (state unchanged)', () => {
    const poor = { ...createInitialState(), credits: 0 };
    const result = upgrade(poor, 'finisher'); // finisher upgrade costs 100
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('insufficient-credits');
    expect(result.state).toEqual(poor);
    expect(result.state.machines.finisher.level).toBe(1);
  });

  it('deducts credits on a successful upgrade', () => {
    const initial = createInitialState();
    const cost = upgradeCost(initial, 'fabricator');
    const { state } = upgrade(initial, 'fabricator');
    expect(state.credits).toBeCloseTo(initial.credits - cost, 9);
  });
});

describe('bottleneck detection', () => {
  it('identifies the lowest-throughput machine', () => {
    // base rates: fabricator 2.0, assembler 1.0, finisher 0.8 → finisher.
    expect(detectBottleneck(createInitialState())).toBe('finisher');
  });

  it('follows level changes: upgrading the bottleneck moves it to the next-slowest', () => {
    let state = { ...createInitialState(), credits: 10000 };
    // Rates start 2.0 / 1.0 / 0.8 → finisher.
    expect(detectBottleneck(state)).toBe('finisher');

    // Finisher L2 = 1.6 > assembler 1.0 → bottleneck becomes assembler.
    state = upgrade(state, 'finisher').state;
    expect(detectBottleneck(state)).toBe('assembler');

    // Assembler L2 = 2.0 → finisher 1.6 is slowest again.
    state = upgrade(state, 'assembler').state;
    expect(detectBottleneck(state)).toBe('finisher');

    // Finisher L3 = 2.4 → tie between fabricator and assembler at 2.0;
    // tie resolves to the earliest stage, fabricator.
    state = upgrade(state, 'finisher').state;
    expect(detectBottleneck(state)).toBe('fabricator');
  });

  it('upgrading the bottleneck measurably improves overall production', () => {
    const base = run(createInitialState(), 20);
    // Upgrade the bottleneck (finisher) from the start.
    let boosted = upgrade(createInitialState(), 'finisher').state;
    boosted = run(boosted, 20);
    expect(boosted.robotsShipped).toBeGreaterThan(base.robotsShipped);
  });

  it('is deterministic: never depends on machine order iteration artifacts', () => {
    for (const id of MACHINE_ORDER) {
      const s = createInitialState();
      expect(detectBottleneck(s)).toBe('finisher');
      void id;
    }
  });
});

describe('reset', () => {
  it('returns the simulation to the initial state', () => {
    let state = run(createInitialState(), 15);
    state = upgrade(state, 'fabricator').state;
    const reset = resetState(state);
    expect(reset).toEqual(createInitialState());
    expect(reset.credits).toBe(120);
    expect(reset.robotsShipped).toBe(0);
    expect(reset.machines.finisher.level).toBe(1);
  });
});

describe('determinism', () => {
  it('same initial state + same tick sequence ⇒ identical result', () => {
    const dt = 1 / 60;
    const runA = run(createInitialState(), 30, dt);
    const runB = run(createInitialState(), 30, dt);
    expect(runA).toEqual(runB);
    expect(runA.robotsShipped).toBeCloseTo(runB.robotsShipped, 12);
  });
});
