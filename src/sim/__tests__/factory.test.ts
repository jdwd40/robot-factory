import { describe, expect, it } from 'vitest';
import { CREDITS_PER_ROBOT, MACHINE_CONFIG, MACHINE_ORDER } from '../config';
import {
  createInitialState,
  detectBottleneck,
  resetState,
  tick,
  throughput,
  upgrade,
  upgradeCost,
} from '../factory';
import { robotEquivalentRate } from '../throughput';
import type { FactoryState, MachineId } from '../types';

/** Run `tick` n times with a fixed dt from an initial state. */
function run(initial = createInitialState(), seconds: number, dt = 0.1) {
  let state = initial;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    state = tick(state, dt);
  }
  return state;
}

/** Craft a state with specific machine levels (bypasses upgrade costs). */
function withLevels(levels: Record<MachineId, number>): FactoryState {
  const state = createInitialState();
  const machines = { ...state.machines };
  for (const id of MACHINE_ORDER) {
    machines[id] = { ...machines[id], level: levels[id] };
  }
  return { ...state, machines };
}

/**
 * MEASURED production: robots shipped during a 60s window after a 60s warm-up
 * at dt=1/60 (same protocol QA used). Anchors tests to the simulation's real
 * behaviour rather than to any formula.
 */
function measuredWindowShipped(initial: FactoryState): number {
  const warm = run(initial, 60, 1 / 60);
  return run(warm, 60, 1 / 60).robotsShipped - warm.robotsShipped;
}

/** Measured robots/min during the window for each machine at +1 level. */
function measuredUpgradeGains(initial: FactoryState): Record<MachineId, number> {
  const base = measuredWindowShipped(initial);
  const gains = {} as Record<MachineId, number>;
  for (const id of MACHINE_ORDER) {
    const boosted = withLevels({
      fabricator: initial.machines.fabricator.level,
      assembler: initial.machines.assembler.level,
      finisher: initial.machines.finisher.level,
      [id]: initial.machines[id].level + 1,
    });
    gains[id] = measuredWindowShipped(boosted) - base;
  }
  return gains;
}

/** The machine whose gain is maximal; ties resolve to the earliest stage. */
function argmaxEarliest(gains: Record<MachineId, number>): MachineId {
  let best: MachineId = MACHINE_ORDER[0];
  for (const id of MACHINE_ORDER) {
    if (gains[id] > gains[best]) best = id;
  }
  return best;
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
  it('identifies the stage with the lowest robot-equivalent rate', () => {
    // Robot-equivalent rates at the initial state (each stage's output
    // converted to shipped-robot-equivalents via the downstream
    // input-per-output chain; computed here independently from config):
    //   fabricator 2.0 comp/s ÷ 2 (assembler eats 2 comp/robot) = 1.00/s
    //   assembler  1.0/s        ÷ 1                            = 1.00/s
    //   finisher   0.8/s        ÷ 1                            = 0.80/s ← lowest
    const state = createInitialState();
    const downstream = (id: MachineId) => {
      const idx = MACHINE_ORDER.indexOf(id);
      let factor = 1;
      for (let i = idx + 1; i < MACHINE_ORDER.length; i++) {
        factor *= MACHINE_CONFIG[MACHINE_ORDER[i]].inputPerOutput;
      }
      return factor;
    };
    for (const id of MACHINE_ORDER) {
      const level = state.machines[id].level;
      expect(robotEquivalentRate(state, id)).toBeCloseTo(
        (MACHINE_CONFIG[id].baseRate * level) / downstream(id),
        9,
      );
    }
    expect(robotEquivalentRate(state, 'finisher')).toBeLessThan(
      robotEquivalentRate(state, 'fabricator'),
    );
    expect(detectBottleneck(state)).toBe('finisher');
  });

  it('follows level changes: the bottleneck tracks the lowest robot-equivalent rate', () => {
    // Rates are robot-equivalents/s: fabricator ÷2, assembler ÷1, finisher ÷1.
    // 1/1/1 → 1.00 / 1.00 / 0.80 → finisher.
    expect(detectBottleneck(withLevels({ fabricator: 1, assembler: 1, finisher: 1 }))).toBe(
      'finisher',
    );
    // Finisher L2 = 1.60 leaves fabricator and assembler tied at 1.00;
    // ties resolve to the earliest stage → fabricator.
    expect(detectBottleneck(withLevels({ fabricator: 1, assembler: 1, finisher: 2 }))).toBe(
      'fabricator',
    );
    // Fabricator L2 = 2.00 equiv → assembler 1.00 is lowest.
    expect(detectBottleneck(withLevels({ fabricator: 2, assembler: 1, finisher: 2 }))).toBe(
      'assembler',
    );
    // Assembler L2 = 2.00 equiv → finisher 1.60 is lowest.
    expect(detectBottleneck(withLevels({ fabricator: 2, assembler: 2, finisher: 2 }))).toBe(
      'finisher',
    );
  });

  it('flags the fabricator at fabricator=1 assembler=2 finisher=2 — the unit-bug trap', () => {
    // Raw rates here are 2.0 / 2.0 / 1.6, so the old implementation flagged
    // the finisher — yet upgrading the finisher adds ZERO production while
    // upgrading the fabricator adds +36/min (QA section C). Robot-equivalent
    // rates are 1.0 / 2.0 / 1.6 → fabricator. This test fails against the
    // old implementation and passes against the fixed one.
    const state = withLevels({ fabricator: 1, assembler: 2, finisher: 2 });
    expect(detectBottleneck(state)).toBe('fabricator');

    const gains = measuredUpgradeGains(state);
    expect(gains.fabricator).toBeGreaterThan(gains.assembler + 1);
    expect(gains.fabricator).toBeGreaterThan(gains.finisher + 1);
    expect(gains.fabricator).toBeGreaterThan(30); // measured ≈ +36 robots in the window
    expect(gains.assembler).toBeLessThan(1); // starved upstream: no gain
    expect(gains.finisher).toBeLessThan(1); // starved upstream: no gain
  });

  it('agrees with MEASURED production across a range of level combinations', () => {
    // For each combination: the machine detectBottleneck reports must be the
    // one whose +1 upgrade maximally increases robotsShipped over a fixed
    // 60s warm-up + 60s window at dt=1/60 — the behaviour the UI promises.
    const combos: Array<Record<MachineId, number>> = [
      { fabricator: 1, assembler: 1, finisher: 1 }, // finisher helps (+12/min)
      { fabricator: 2, assembler: 1, finisher: 1 }, // finisher helps (+12/min)
      { fabricator: 3, assembler: 2, finisher: 2 }, // finisher helps (+24/min)
      { fabricator: 1, assembler: 3, finisher: 2 }, // fabricator helps (+36/min)
      { fabricator: 1, assembler: 2, finisher: 2 }, // fabricator helps (+36/min)
      { fabricator: 2, assembler: 3, finisher: 4 }, // fabricator helps (+60/min)
    ];
    for (const levels of combos) {
      const state = withLevels(levels);
      const gains = measuredUpgradeGains(state);
      // The reported bottleneck must be the measured best upgrade target,
      // and it must actually help — the game must never steer you to a
      // purchase that adds nothing.
      expect(argmaxEarliest(gains)).toBe(detectBottleneck(state));
      expect(gains[detectBottleneck(state)]).toBeGreaterThan(1);
    }
  });

  it('upgrading the bottleneck measurably improves overall production', () => {
    const base = run(createInitialState(), 20);
    // Upgrade the bottleneck (finisher) from the start.
    let boosted = upgrade(createInitialState(), 'finisher').state;
    boosted = run(boosted, 20);
    expect(boosted.robotsShipped).toBeGreaterThan(base.robotsShipped);
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
