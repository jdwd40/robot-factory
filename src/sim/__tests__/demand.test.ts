import { describe, expect, it } from 'vitest';
import { DEMAND_AMPLITUDE, DEMAND_PHASE, DEMAND_PERIOD, ROBOT_ORDER } from '../config';
import { demandMultiplier, saleValueFor } from '../economy';
import { tick } from '../factory';
import { makeJob, machineMidJob, richState } from './helpers';

describe('market demand', () => {
  it('stays within ±amplitude of the base price for a full cycle', () => {
    for (const type of ROBOT_ORDER) {
      for (let t = 0; t <= DEMAND_PERIOD; t++) {
        const d = demandMultiplier(type, t);
        expect(d).toBeGreaterThanOrEqual(1 - DEMAND_AMPLITUDE);
        expect(d).toBeLessThanOrEqual(1 + DEMAND_AMPLITUDE);
      }
    }
  });

  it('repeats every period (deterministic cycle) from each phase offset', () => {
    for (const type of ROBOT_ORDER) {
      const open = 1 + DEMAND_AMPLITUDE * Math.sin(DEMAND_PHASE[type]);
      expect(demandMultiplier(type, 0)).toBeCloseTo(open, 12);
      expect(demandMultiplier(type, DEMAND_PERIOD)).toBeCloseTo(open, 12);
      expect(demandMultiplier(type, 2 * DEMAND_PERIOD)).toBeCloseTo(open, 12);
    }
  });

  it('peaks are phase-shifted so the hot model changes over time', () => {
    const peak = DEMAND_PERIOD / 4; // worker's maximum
    const w = demandMultiplier('worker', peak);
    expect(w).toBeCloseTo(1 + DEMAND_AMPLITUDE, 8);
    // At the worker's peak the other models are mid-swing, strictly below it.
    expect(demandMultiplier('explorer', peak)).toBeLessThan(w);
    expect(demandMultiplier('combat', peak)).toBeLessThan(w);
    // A quarter-cycle later the worker is at the neutral crossing again.
    expect(demandMultiplier('worker', DEMAND_PERIOD / 2)).toBeCloseTo(1, 12);
  });

  it('still turns a profit on every model even at the demand trough', () => {
    const trough = 1 - DEMAND_AMPLITUDE;
    const workerTroughSale = saleValueFor('worker', 1) * trough;
    const explorerTroughSale = saleValueFor('explorer', 1) * trough;
    const combatTroughSale = saleValueFor('combat', 1) * trough;
    // Costs: floor(salePrice × material × quality) would be higher; assert the
    // trough price clears each model's full base order cost (chrome, L1).
    expect(workerTroughSale).toBeGreaterThan(22 + 8);
    expect(explorerTroughSale).toBeGreaterThan(40 + 15);
    expect(combatTroughSale).toBeGreaterThan(70 + 25);
  });

  it('ships robots priced at the live demand for the exact shipment moment', () => {
    let s = richState();
    s = machineMidJob(s, 'finisher', makeJob('worker', { id: 5, serial: 2, costPaid: 30 }), 0.999);
    s = tick(s, 1, () => 0.99);
    expect(s.stats.robotsShipped).toBe(1);
    const expected = Math.round(saleValueFor('worker', 1) * demandMultiplier('worker', s.elapsed));
    expect(s.stats.revenue).toBe(expected);
    expect(s.stats.lastShipValue).toBe(expected);
  });
});