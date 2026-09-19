import { describe, expect, it } from 'vitest';
import { repair, tick } from '../factory';
import { BREAKDOWN_CONFIG } from '../config';
import { richState, run, withUpgrades } from './helpers';
import { makeJob } from './helpers';
import type { Rng } from '../random';

/** Deterministic scripted rng: consumes the listed values in order, then stays on the last. */
function seq(...values: number[]): Rng {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

/** Put a machine mid-job with max heat so a guaranteed breakdown fires. */
function overheatedJobMachine(id: 'fabricator' | 'assembler' | 'finisher', heat = 1.2) {
  const s = richState();
  const next = structuredClone(s);
  const job = makeJob('worker', { id: 5001 });
  next.machines[id] = { ...next.machines[id], currentJob: job, progress: 0, state: 'processing', heat };
  return next;
}

describe('breakdowns', () => {
  it('a machine working hot rolls toward breakdown deterministically', () => {
    // failureRate = 0.0022 * 1 * 1.8 = 0.00396/s. Chance draw 0.001 passes;
    // type draw 0.5 lands in the jam band [0.3, 0.6).
    let s = overheatedJobMachine('fabricator');
    s = tick(s, 1, seq(0.001, 0.5));
    const m = s.machines.fabricator;
    expect(m.state).toBe('broken');
    expect(m.breakdownType).toBe('jam');
    expect(m.totalBreakdowns).toBe(1);
    expect(s.stats.breakdowns).toBe(1);
    expect(s.log.some((e) => e.kind === 'warning')).toBe(true);
  });

  it('overheating breakdown shows the overheated state and refuses to progress', () => {
    // failureRate = 0.0016 * 1 * 1.8 = 0.00288/s. Chance draw 0.002 passes (0.002 < 0.00288);
    // type draw 0.1 lands in the overheating band [0, 0.3).
    let s = overheatedJobMachine('assembler');
    s = tick(s, 1, seq(0.002, 0.1));
    const m = s.machines.assembler;
    expect(m.state).toBe('overheated');
    expect(m.breakdownType).toBe('overheating');
    const progress = m.progress;
    const after = tick(s, 1, seq(0.99, 0.99));
    expect(after.machines.assembler.progress).toBe(progress); // no progress while down
  });

  it('reliability upgrades measurably reduce real failure chance', () => {
    const low = heatedFabricatorState(1); // reliability L1
    const high = heatedFabricatorState(3); // reliability L3
    const runLow = tick(tick(low, 1, () => 0.003), 1, () => 0.003);
    const runHigh = tick(tick(high, 1, () => 0.003), 1, () => 0.003);
    expect(runLow.machines.fabricator.state).not.toBe('processing');
    expect(runHigh.machines.fabricator.state).toBe('processing');
  });

  it('repair has a cost, sets the repairing state, and recovers the machine', () => {
    let s = overheatedJobMachine('fabricator');
    s = tick(s, 1, () => 0.003); // overheating (cost 20)
    const broken = s;
    const cost = BREAKDOWN_CONFIG[broken.machines.fabricator.breakdownType ?? 'jam'].repairCost;
    const before = broken.credits;
    const r = repair(broken, 'fabricator');
    expect(r.ok).toBe(true);
    const repairing = r.state;
    expect(repairing.machines.fabricator.state).toBe('repairing');
    expect(repairing.credits).toBe(before - cost);
    expect(repairing.stats.repairCost).toBe(cost);
    expect(repairing.stats.repairCount).toBe(1);
    expect(repairing.log.some((e) => e.kind === 'repair')).toBe(true);

    const recovered = tick(repairing, BREAKDOWN_CONFIG[broken.machines.fabricator.breakdownType ?? 'jam'].repairTime + 1, () => 0.99);
    expect(recovered.machines.fabricator.state).not.toBe('repairing');
    expect(recovered.machines.fabricator.breakdownType).toBeNull();
    expect(recovered.log.some((e) => e.message === 'Fabricator is back online')).toBe(true);
  });

  it('repair requires credits and is rejected on a healthy machine', () => {
    let s = overheatedJobMachine('fabricator');
    s = tick(s, 1, () => 0.003);
    s = { ...s, credits: 0 };
    const r = repair(s, 'fabricator');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('insufficient-credits');

    const healthy = richState();
    const rr = repair(healthy, 'finisher');
    expect(rr.ok).toBe(false);
    expect(rr.reason).toBe('not-broken');
  });

  it('maintenance discount applies to repair costs', () => {
    let s = overheatedJobMachine('assembler');
    s = tick(s, 1, seq(0.002, 0.1)); // overheating cost 20
    s.events.push({ id: 99, type: 'maintenance-discount', remaining: 10, startedAt: 0, data: [] });
    const r = repair(s, 'assembler');
    expect(r.ok).toBe(true);
    expect(r.state.stats.repairCost).toBe(Math.round(20 * 0.7));
  });

  it('breakdowns do not cancel the stuck job; progress is preserved', () => {
    let s = overheatedJobMachine('fabricator');
    s = tick(s, 1, () => 0.003); // breaks; job stays put with its progress
    const progress = s.machines.fabricator.progress;
    expect(progress).toBeGreaterThan(0);
    const s2 = run(s, 10);
    expect(s2.machines.fabricator.progress).toBe(progress);
    expect(s2.machines.fabricator.currentJob).not.toBeNull();
  });
});

/** A fabricator mid-job with high heat at a given reliability level. */
function heatedFabricatorState(reliabilityLevel: number) {
  let s = withUpgrades(richState(), 'fabricator', { reliability: reliabilityLevel });
  s = structuredClone(s);
  s.machines.fabricator.currentJob = makeJob('worker', { id: 6001 });
  s.machines.fabricator.state = 'processing';
  s.machines.fabricator.heat = 1.2;
  return s;
}