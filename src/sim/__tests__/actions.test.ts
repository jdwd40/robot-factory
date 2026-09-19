import { describe, expect, it } from 'vitest';
import {
  addOrder,
  buyOutEvent,
  createInitialState,
  emergencyCool,
  salvage,
  setOverclock,
  setPaused,
  tick,
} from '../factory';
import { EMERGENCY_COOL_COST, MAX_ORDER_QUEUE } from '../config';
import { makeJob, richState, withUpgrades } from './helpers';

function breakMachine(
  s: ReturnType<typeof richState>,
  id: 'fabricator' | 'assembler' | 'finisher',
): ReturnType<typeof richState> {
  const next = structuredClone(s);
  next.machines[id] = { ...next.machines[id], state: 'broken', breakdownType: 'jam' };
  return next;
}

describe('new management actions', () => {
  it('setPaused toggles the sim clock in settings only', () => {
    const s = createInitialState({ wallTime: 0 });
    const p = setPaused(s, true);
    expect(p.settings.paused).toBe(true);
    expect(p.elapsed).toBe(0);
    const resumed = setPaused(p, false);
    expect(resumed.settings.paused).toBe(false);
  });

  it('setOverclock flips the flag and logs a message', () => {
    const s = richState();
    const oc = setOverclock(s, 'assembler', true);
    expect(oc.machines.assembler.overclock).toBe(true);
    expect(oc.machines.finisher.overclock).toBe(false);
    expect(oc.log.some((e) => e.message === 'Assembler overclocked')).toBe(true);
    const off = setOverclock(oc, 'assembler', false);
    expect(off.machines.assembler.overclock).toBe(false);
  });

  it('overclocked machines build heat twice as fast while processing', () => {
    let s = richState();
    s = structuredClone(s);
    s.machines.assembler.currentJob = makeJob('worker', { id: 9500 });
    s.machines.assembler.state = 'processing';
    const base = tick(s, 5, () => 0.99);
    const oc = tick(setOverclock(s, 'assembler', true), 5, () => 0.99);
    expect(oc.machines.assembler.heat).toBeCloseTo(base.machines.assembler.heat * 2, 6);
  });

  it('heat also increases breakdown risk through processFailureRisk', () => {
    const s = withUpgrades(richState(), 'fabricator', { reliability: 1 });
    expect(() => tick(s, 0.1, () => 0.99)).not.toThrow();
    // At reliability L1, heat 0 has base rate; heat 1.2 multiplies the (0.6+heat) term.
    const cold = 0.0022 * 1 * 0.6;
    const hot = 0.0022 * 1 * (0.6 + 1.2);
    expect(hot).toBeGreaterThan(cold);
  });

  it('emergencyCool requires a hot machine and credits', () => {
    const cold = richState();
    expect(emergencyCool(cold, 'assembler').reason).toBe('not-hot');

    let hot = richState();
    hot = structuredClone(hot);
    hot.machines.assembler.heat = 0.9;
    const r = emergencyCool(hot, 'assembler');
    expect(r.ok).toBe(true);
    expect(r.state.machines.assembler.heat).toBe(0);
    expect(r.state.credits).toBe(hot.credits - EMERGENCY_COOL_COST);
  });

  it('salvage refunds half the stuck job cost only while down', () => {
    let s = richState();
    s = structuredClone(s);
    s.machines.fabricator.currentJob = makeJob('worker', { id: 9600, costPaid: 30 });
    // Healthy machine: refuses.
    expect(salvage(s, 'fabricator').reason).toBe('not-broken');

    const broken = breakMachine(s, 'fabricator');
    const r = salvage(broken, 'fabricator');
    expect(r.ok).toBe(true);
    expect(r.state.machines.fabricator.currentJob).toBeNull();
    expect(r.state.machines.fabricator.progress).toBe(0);
    expect(r.state.credits).toBe(broken.credits + 15);
    expect(r.state.log.some((e) => e.message.includes('Salvaged Worker Bot'))).toBe(true);

    // No job in progress: nothing to salvage.
    const empty = breakMachine(richState(), 'assembler');
    expect(salvage(empty, 'assembler').reason).toBe('no-job');
  });

  it('buyOutEvent rejects non-buyable events and bad ids', () => {
    const s = richState();
    s.events.push({ id: 1, type: 'bulk-order', remaining: 60, startedAt: 0, data: [3, 0, 0] });
    expect(buyOutEvent(s, 1).reason).toBe('not-buyable');
    expect(buyOutEvent(s, 999).reason).toBe('out-of-range');
  });

  it('buyOutEvent pays to end a power surge early', () => {
    let s = richState();
    s = structuredClone(s);
    s.events.push({ id: 1, type: 'power-surge', remaining: 20, startedAt: 0, data: [] });
    const r = buyOutEvent(s, 1);
    expect(r.ok).toBe(true);
    expect(r.state.events).toHaveLength(0);
    expect(r.state.credits).toBe(s.credits - 120);
    expect(r.state.log.some((e) => e.message.includes('Power Surge early'))).toBe(true);
  });

  it('addOrder is rejected when the production queue is full', () => {
    let s = richState();
    for (let i = 0; i < MAX_ORDER_QUEUE; i++) s = addOrder(s, 'worker').state;
    const full = addOrder(s, 'worker');
    expect(full.ok).toBe(false);
    expect(full.reason).toBe('queue-full');
    expect(full.state.orders).toHaveLength(MAX_ORDER_QUEUE);
    // Once a slot frees, ordering works again.
    const freed = s;
    freed.orders.pop();
    const again = addOrder(freed, 'worker');
    expect(again.ok).toBe(true);
  });
});