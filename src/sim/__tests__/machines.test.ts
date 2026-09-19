import { describe, expect, it } from 'vitest';
import { addOrder, createInitialState, tick, upgrade } from '../factory';
import { detectBottleneck, jobEta, machineRate, machineSpeedFactor } from '../throughput';
import { makeJob, richState, run, withUpgrades } from './helpers';
import type { FactoryState, MachineId } from '../types';

describe('machine simulation', () => {
  it('starts in the idle state with no work anywhere', () => {
    const s = createInitialState({ wallTime: 0 });
    expect(s.machines.fabricator.state).toBe('idle');
    expect(s.machines.assembler.state).toBe('idle');
    expect(s.machines.finisher.state).toBe('idle');
  });

  it('machine states reflect the line: fabricator working, downstream idle until fed', () => {
    let s = addOrder(createInitialState({ wallTime: 0 }), 'worker').state;
    s = tick(s, 0.05, () => 0.99); // first tick starts the job
    expect(s.machines.fabricator.state).toBe('processing');
    s = tick(s, 0.05, () => 0.99); // processing accrues progress
    expect(s.machines.fabricator.progress).toBeGreaterThan(0);
    expect(s.machines.assembler.state).toBe('idle'); // nothing queued for it yet
    expect(s.machines.finisher.state).toBe('idle');
  });

  it('moves a job through stages: queued → fabricating → assembling → finishing → shipped', () => {
    let s = addOrder(richState(), 'worker').state;
    const jobId = s.orders[0].id;
    expect(s.orders[0].stage).toBe('queued');

    const stagesSeen = new Set<string>();
    for (let i = 0; i < 2000 && s.stats.robotsShipped < 1; i++) {
      s = tick(s, 0.1, () => 0.99);
      const m = s.machines;
      const candidates = [
        m.fabricator.currentJob,
        ...m.assembler.inputBuffer,
        m.assembler.currentJob,
        ...m.finisher.inputBuffer,
        m.finisher.currentJob,
      ];
      const j = candidates.find((j2) => j2?.id === jobId);
      if (j) stagesSeen.add(j.stage);
    }
    expect(s.stats.robotsShipped).toBe(1);
    for (const st of ['fabricating', 'assembling', 'finishing']) {
      expect(stagesSeen.has(st)).toBe(true);
    }
  });

  it('fabricator faster than assembler: assembler input buffer genuinely grows', () => {
    let s = richState();
    s = upgrade(s, 'fabricator', 'speed').state;
    s = upgrade(s, 'fabricator', 'speed').state; // L3 = 2.0× → 4s/unit vs assembler 7s
    for (let i = 0; i < 30; i++) s = addOrder(s, 'worker').state;
    s = run(s, 30);
    expect(s.machines.assembler.inputBuffer.length).toBeGreaterThanOrEqual(2);
    expect(s.machines.fabricator.state).not.toBe('blocked'); // still feeding, bay not full yet
  });

  it('blocks a machine when its downstream bay is full (real backpressure)', () => {
    const s = craftBacklogState('assembler');
    expect(s.machines.assembler.inputBuffer).toHaveLength(6); // bay full
    const after = tick(s, 0.5, () => 0.99);
    expect(after.machines.fabricator.state).toBe('blocked');
    expect(after.machines.fabricator.progress).toBe(1);
    expect(after.machines.fabricator.currentJob).not.toBeNull();
    expect(after.log.some((e) => e.message === 'Fabricator blocked — Assembler bay is full')).toBe(true);
  });

  it('unblocks automatically once the downstream bay frees a slot', () => {
    let s = craftBacklogState('assembler');
    let sawBlocked = false;
    for (let i = 0; i < 200; i++) {
      s = tick(s, 0.5, () => 0.99);
      if (s.machines.fabricator.state === 'blocked') sawBlocked = true;
      if (sawBlocked && s.machines.fabricator.state !== 'blocked') break;
    }
    expect(sawBlocked).toBe(true);
    expect(s.machines.fabricator.state).not.toBe('blocked');
  });

  it('parallel bays upgrade raises the assembler buffer capacity', () => {
    let s2 = withUpgrades(richState(), 'assembler', { special: 2 }); // cap 8
    s2 = withUpgrades(s2, 'fabricator', { speed: 2 });
    const job = makeJob('worker', { id: 9000 });
    s2 = structuredClone(s2);
    s2.machines.assembler = { ...s2.machines.assembler, currentJob: job };
    for (let i = 0; i < 7; i++) {
      s2.machines.assembler.inputBuffer.push(makeJob('worker', { id: 9100 + i }));
    }
    s2.machines.fabricator.currentJob = makeJob('worker', { id: 8999 });
    s2.machines.fabricator.progress = 0.999;
    s2 = tick(s2, 0.5, () => 0.99);
    expect(s2.machines.fabricator.state).not.toBe('blocked'); // 7 waiters fit in cap 8
  });
});

describe('bottleneck detection (workload-based)', () => {
  it('flags no bottleneck on an empty line', () => {
    const b = detectBottleneck(createInitialState({ wallTime: 0 }));
    expect(b.id).toBeNull();
  });

  it('flags the machine with real accumulated workload, not the slowest config', () => {
    let s = richState();
    // Fabricator maxed out, assembler overloaded with queued jobs.
    s = withUpgrades(s, 'assembler', { speed: 3 }); // fast assembler
    s = structuredClone(s);
    s.machines.assembler.currentJob = makeJob('worker', { id: 8001 });
    s.machines.assembler.activeEma = 0.9;
    for (let i = 0; i < 4; i++) s.machines.assembler.inputBuffer.push(makeJob('worker', { id: 8002 + i }));
    const b = detectBottleneck(s);
    expect(b.id).toBe('assembler');
    expect(b.inputQueue).toBe(5);
    expect(b.avgWait).toBeGreaterThan(0);
    expect(b.utilisation).toBeGreaterThan(0.8);
  });

  it('does not flag an idle machine holding backlog (util 0)', () => {
    let s = richState();
    s = structuredClone(s);
    for (let i = 0; i < 3; i++) s.machines.assembler.inputBuffer.push(makeJob('worker', { id: 8100 + i }));
    const b = detectBottleneck(s);
    expect(b.id).toBeNull();
  });
});

describe('machine pacing helpers', () => {
  it('jobEta reflects progress, speed upgrades and events', () => {
    let s = richState();
    s = withUpgrades(s, 'assembler', { speed: 2 });
    s = structuredClone(s);
    s.machines.assembler.currentJob = makeJob('worker', { id: 9000 });
    s.machines.assembler.progress = 0.5;
    expect(jobEta(s, 'assembler')).toBeCloseTo(7 / 1.5 * 0.5, 6);
    // Power surge halves machine speed → ETA doubles.
    s.events.push({ id: 1, type: 'power-surge', remaining: 5, startedAt: 0, data: [] });
    expect(jobEta(s, 'assembler')).toBeCloseTo(7 / 0.75 * 0.5, 6);
  });

  it('machineRate uses the current workload mix', () => {
    let s = richState();
    s = structuredClone(s);
    s.machines.assembler.currentJob = makeJob('worker', { id: 9000 });
    expect(machineRate(s, 'assembler')).toBeCloseTo(1 / 7, 6);
    s.machines.assembler.inputBuffer.push(makeJob('combat', { id: 9001 }));
    expect(machineRate(s, 'assembler')).toBeCloseTo(1 / 9, 6);
  });

  it('machineSpeedFactor reacts to shortages and surges', () => {
    const s = richState();
    expect(machineSpeedFactor(s, 'fabricator')).toBe(1);
    s.events.push({ id: 1, type: 'material-shortage', remaining: 5, startedAt: 0, data: [] });
    expect(machineSpeedFactor(s, 'fabricator')).toBeCloseTo(1 / 1.6, 6);
    expect(machineSpeedFactor(s, 'assembler')).toBe(1); // shortage only hits fabrication
  });
});

/** Fabricator is one tick away from finishing into a full assembler bay. */
function craftBacklogState(downstream: MachineId): FactoryState {
  const s = richState();
  const next = structuredClone(s);
  next.machines.fabricator.currentJob = makeJob('worker', { id: 7000, serial: 1 });
  next.machines.fabricator.progress = 0.999;
  next.machines.fabricator.state = 'processing';
  next.machines.assembler.currentJob = makeJob('worker', { id: 7001, serial: 2 });
  const cap = downstream === 'assembler' ? 6 : 8;
  for (let i = 0; i < cap; i++) {
    next.machines.assembler.inputBuffer.push(makeJob('worker', { id: 7100 + i, serial: 3 + i }));
  }
  return next;
}