import { describe, expect, it } from 'vitest';
import { addOrder, createInitialState, setGameSpeed, tick, upgrade } from '../factory';
import { richState, run } from './helpers';
import { makeJob } from './helpers';

function withEvent(
  s: ReturnType<typeof richState>,
  type: 'power-surge' | 'bulk-order' | 'perfect-assembly' | 'maintenance-discount' | 'material-shortage',
  remaining: number,
  data: number[] = [],
) {
  const next = structuredClone(s);
  next.events.push({ id: 77, type, remaining, startedAt: next.elapsed, data });
  return next;
}

describe('factory events', () => {
  it('schedules an event once the initial delay lapses and then enters cooldown', () => {
    const s0 = createInitialState({ wallTime: 0 });
    let s = { ...s0, nextEventIn: 0.1 };
    s = tick(s, 0.1, () => 0.5); // rolls 0.65-chance (0.5 passes) → picks perfect-assembly
    expect(s.events.length).toBe(1);
    expect(s.events[0].type).toBe('perfect-assembly');
    expect(s.events[0].remaining).toBeGreaterThan(30); // not expired inside this small tick
    expect(s.stats.eventsTriggered).toBe(1);
    expect(s.log.some((e) => e.message.startsWith('EVENT:'))).toBe(true);
    expect(s.nextEventIn).toBeGreaterThan(50); // cooldown prevents spam
  });

  it('does not trigger when the cooldown has not elapsed', () => {
    const s = createInitialState({ wallTime: 0 });
    const after = tick(s, 10, () => 0.5);
    expect(after.events).toHaveLength(0);
  });

  it('power surge halves machine speed', () => {
    let s = richState();
    s = structuredClone(s);
    s.machines.assembler.currentJob = makeJob('worker', { id: 9000 });
    s.machines.assembler.progress = 0;
    s.machines.assembler.state = 'processing';
    s = withEvent(s, 'power-surge', 10);
    const after = tick(s, 7, () => 0.99);
    // normal: 7/7 = done; surge: 7/14 = 0.5
    expect(after.machines.assembler.progress).toBeCloseTo(0.5, 6);
    expect(after.machines.assembler.state).toBe('processing');
  });

  it('perfect assembly sells shipped robots for 50% more', () => {
    let s = richState();
    s = structuredClone(s);
    s.machines.finisher.currentJob = makeJob('worker', { id: 88, serial: 9, costPaid: 30, placedAt: 0 });
    s.machines.finisher.state = 'processing';
    s.machines.finisher.progress = 0.999;
    s = withEvent(s, 'perfect-assembly', 5);
    const before = s.credits;
    const after = tick(s, 1, () => 0.99);
    const gain = after.credits - before;
    expect(gain).toBe(Math.round(55 * 1.5)); // 83
    expect(after.stats.revenue).toBe(83);
    expect(after.stats.profit).toBe(53);
  });

  it('bulk order pays a bonus when the target is met and then expires', () => {
    let s = richState();
    for (let i = 0; i < 3; i++) s = addOrder(s, 'worker').state;
    s = withEvent(s, 'bulk-order', 120, [3, 0, 0]);
    const before = s.credits;
    s = run(s, 120);
    const creditsGained = s.credits - before;
    const sales = 3 * 55; // 165
    const bonus = Math.round(165 * 0.25); // 41 — shipped-value-backed bonus
    expect(s.stats.robotsShipped).toBe(3);
    expect(creditsGained).toBe(sales + bonus);
    expect(s.events.some((e) => e.type === 'bulk-order')).toBe(false);
    expect(s.log.some((e) => e.message === `Bulk Order complete — bonus +${bonus} cr`)).toBe(true);
  });

  it('bulk order expires with a log entry when the target is missed', () => {
    const s = withEvent(richState(), 'bulk-order', 2, [5, 0]);
    const after = tick(s, 3, () => 0.99);
    expect(after.events.some((e) => e.type === 'bulk-order')).toBe(false);
    expect(after.log.some((e) => e.message.includes('Bulk Order expired'))).toBe(true);
  });

  it('maintenance discount lowers upgrade spend', () => {
    const s = withEvent(richState(), 'maintenance-discount', 10);
    const r = upgrade(s, 'fabricator', 'speed');
    const expectedCost = Math.round(45 * 0.7); // 45*0.7 rounds to 31 (fp)
    expect(r.ok).toBe(true);
    expect(r.state.machines.fabricator.upgrades.speed).toBe(2);
    expect(r.state.stats.upgradeSpend).toBe(expectedCost);
    expect(r.state.log.some((e) => e.message.includes(`${expectedCost} cr`))).toBe(true);
  });

  it('material shortage slows only fabrication', () => {
    let s = richState();
    s = structuredClone(s);
    s.machines.fabricator.currentJob = makeJob('worker', { id: 9001 });
    s.machines.fabricator.state = 'processing';
    s = withEvent(s, 'material-shortage', 10);
    const after = tick(s, 8, () => 0.99);
    expect(after.machines.fabricator.progress).toBeCloseTo(8 / (8 * 1.6), 6);
  });

  it('events expire cleanly and are removed from the active set', () => {
    let s = withEvent(richState(), 'power-surge', 1.5);
    s = tick(s, 2, () => 0.99);
    expect(s.events).toHaveLength(0);
    expect(s.log.some((e) => e.message === 'Power Surge has passed')).toBe(true);
  });

  it('setGameSpeed stores the setting without touching simulation state', () => {
    const s = createInitialState({ wallTime: 0 });
    const fast = setGameSpeed(s, 2);
    expect(fast.settings.gameSpeed).toBe(2);
    expect(fast.credits).toBe(s.credits);
    expect(fast.elapsed).toBe(s.elapsed);
  });
});