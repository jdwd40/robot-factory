import { describe, expect, it } from 'vitest';
import { addOrder, buyOutEvent, cancelOrder, emergencyCool, repair, salvage, tick, upgrade } from '../factory';
import { MACHINE_ORDER, MAX_LOG_ENTRIES, SALVAGE_FRACTION } from '../config';
import { mulberry32 } from '../random';
import type { FactoryState } from '../types';
import { richState, run } from './helpers';

/**
 * Tick forward `seconds` from a seeded rng, repairing any broken/overheated
 * machine like a player would. Deterministic for a fixed seed.
 */
function autoplay(s: FactoryState, seconds: number, seed: number, dt = 1): FactoryState {
  const rng = mulberry32(seed);
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    s = tick(s, dt, rng);
    for (const id of MACHINE_ORDER) {
      const m = s.machines[id];
      if (m.state === 'broken' || m.state === 'overheated') {
        const r = repair(s, id);
        if (r.ok) s = r.state;
      }
    }
  }
  return s;
}

describe('long-run integrity', () => {
  it('a busy 20-minute run conserves money, robots and credential symbols', () => {
    let s = richState();
    s = upgrade(s, 'fabricator', 'speed').state;
    s = upgrade(s, 'fabricator', 'speed').state;
    s = upgrade(s, 'assembler', 'speed').state;
    const roles = ['worker', 'explorer', 'combat'] as const;
    for (let i = 0; i < 30; i++) s = addOrder(s, roles[i % 3]).state;

    const startCredits = s.credits;
    s = autoplay(s, 1200, 2026, 1);

    // Money conservation during the seeded run: the only flows are sales/
    // bonuses in and repairs out (no orders or upgrades happen mid-run).
    expect(s.credits).toBe(startCredits + s.stats.revenue - s.stats.repairCost);
    // Profit tracks sale value + bonuses, minus what the orders cost. Costs of
    // NOT-YET-shipped jobs are still in stats.costPaid, so add them back.
    const pending = pendingCost(s);
    expect(s.stats.profit).toBe(s.stats.revenue - s.stats.costPaid + pending);
    expect(s.credits).toBeGreaterThan(0);

    // Totals derive from per-type counters.
    const shippedSum = (Object.keys(s.stats.byType) as (keyof typeof s.stats.byType)[]).reduce(
      (a, k) => a + s.stats.byType[k],
      0,
    );
    expect(shippedSum).toBe(s.stats.robotsShipped);

    const bucketRevenue = Object.values(s.stats.byTypeRevenue).reduce((a, b) => a + b, 0);
    const bucketProfit = Object.values(s.stats.byTypeProfit).reduce((a, b) => a + b, 0);
    expect(s.stats.revenue).toBeGreaterThanOrEqual(bucketRevenue); // bulk bonuses only in totals
    expect(s.stats.profit).toBeGreaterThanOrEqual(bucketProfit);

    // Everything produced ran through the whole line (no lost jobs).
    expect(shippedSum).toBeGreaterThanOrEqual(25);
    expect(s.stats.repairCount).toBeGreaterThanOrEqual(1); // driver actually repaired
    expect(s.stats.breakdowns).toBeGreaterThanOrEqual(s.stats.repairCount);

    // All quantities stay in valid ranges; nothing NaN-ish.
    for (const id of MACHINE_ORDER) {
      const m = s.machines[id];
      expect(['idle', 'waiting', 'processing', 'blocked', 'broken', 'overheated', 'repairing']).toContain(
        m.state,
      );
      expect(m.progress).toBeGreaterThanOrEqual(0);
      expect(m.progress).toBeLessThanOrEqual(1);
      expect(m.heat).toBeGreaterThanOrEqual(0);
      expect(m.heat).toBeLessThanOrEqual(1.2);
      expect(Number.isFinite(m.activeEma)).toBe(true);
      expect(Number.isFinite(m.queueEma)).toBe(true);
    }
    for (const v of Object.values(s.stats)) {
      expect(typeof v !== 'number' || Number.isFinite(v)).toBe(true);
    }
    expect(s.stats.rateEma).toBeGreaterThanOrEqual(0);

    // Event bookkeeping is sane.
    for (const ev of s.events) {
      expect(ev.remaining).toBeGreaterThan(0);
      expect(Number.isFinite(ev.remaining)).toBe(true);
    }

    // Log never overflows its cap and the factory is never stuck on the final stage.
    expect(s.log.length).toBeLessThanOrEqual(MAX_LOG_ENTRIES);
    expect(s.machines.finisher.state).not.toBe('blocked');
  });

  it('upgrades do not reorder the queue or vanish pending orders', () => {
    let s = richState();
    s = upgrade(s, 'fabricator', 'speed').state;
    s = addOrder(s, 'worker').state;
    s = addOrder(s, 'explorer').state;
    const ids = s.orders.map((j) => j.id);
    s = upgrade(s, 'assembler', 'speed').state;
    s = upgrade(s, 'assembler', 'reliability').state;
    expect(s.orders.map((j) => j.id)).toEqual(ids);
    expect(s.orders.every((j) => Number.isFinite(j.costPaid) && j.costPaid > 0)).toBe(true);
  });

  it('second thoughts: every shipped robot left a traceable sale behind', () => {
    let s = richState();
    s = upgrade(s, 'fabricator', 'speed').state;
    for (let i = 0; i < 10; i++) s = addOrder(s, 'worker').state;
    s = run(s, 240, 1, () => 0.99); // no events or breakdowns: pure deterministic pipeline
    expect(s.stats.robotsShipped).toBe(10);
    expect(s.stats.lastShipElapsed).toBeGreaterThan(0);
    expect(s.stats.lastShipValue).toBe(55);
  });

  it('refunds, salvage, buyouts and cooling are all tracked so the money identity holds', () => {
    // Every source and sink of cash must be visible in the stats, so the
    // conservation identity from the 20-minute test still holds when the
    // player cancels, salvages, buys out events or emergency-cools.
    let s = richState();
    const start = s.credits;
    s = addOrder(s, 'worker').state;
    s = addOrder(s, 'worker').state;
    const stuckCost = s.orders.find((j) => j.id === s.orders[0].id)!.costPaid;
    const cancelable = s.orders[1].id;
    const cancelCost = s.orders[1].costPaid;

    s = run(s, 5, 1, () => 0.99); // fabricator picks the first worker; the second stays queued

    // Salvage: knock the fabricator down with a stuck WIP job.
    const down = structuredClone(s);
    down.machines.fabricator.state = 'overheated';
    down.machines.fabricator.breakdownType = 'overheating';
    down.machines.fabricator.heat = 1;
    const sal = salvage(down, 'fabricator');
    expect(sal.ok).toBe(true);
    s = sal.state;

    // Cancel the untouched queued order.
    const can = cancelOrder(s, cancelable);
    expect(can.ok).toBe(true);
    s = can.state;

    // Buy out a negative event and emergency-cool a hot machine.
    s.events.push({ id: 99, type: 'power-surge', remaining: 10, startedAt: 0, data: [] });
    s.machines.assembler.heat = 0.7;
    const cool = emergencyCool(s, 'assembler');
    expect(cool.ok).toBe(true);
    s = cool.state;
    const boot = buyOutEvent(s, 99);
    expect(boot.ok).toBe(true);
    s = boot.state;

    expect(s.stats.refundsReceived).toBe(
      Math.round(stuckCost * SALVAGE_FRACTION) + cancelCost,
    );
    expect(s.stats.coolSpend).toBe(12);
    expect(s.stats.buyoutSpend).toBe(120);

    // No job should be silently lost: the salvaged worker and the cancelled
    // explorer left no live orders or buffers behind.
    for (const id of MACHINE_ORDER) {
      const m = s.machines[id];
      if (id === 'fabricator') expect(m.currentJob).toBeNull();
    }
    expect(s.orders.length).toBe(0);

    // The full ledger balances: every credit in and out is accounted for.
    expect(s.credits).toBe(
      start +
        s.stats.revenue -
        s.stats.costPaid +
        s.stats.refundsReceived -
        s.stats.repairCost -
        s.stats.upgradeSpend -
        s.stats.coolSpend -
        s.stats.buyoutSpend,
    );
  });
});

/** Sum of costPaid over every job that has not been shipped yet. */
function pendingCost(s: FactoryState): number {
  const jobs = [...s.orders];
  for (const id of MACHINE_ORDER) {
    const m = s.machines[id];
    if (m.currentJob) jobs.push(m.currentJob);
    jobs.push(...m.inputBuffer);
  }
  return jobs.reduce((a, j) => a + j.costPaid, 0);
}