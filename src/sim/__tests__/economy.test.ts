import { describe, expect, it } from 'vitest';
import { MACHINE_ORDER } from '../config';
import {
  breakdownCost,
  breakdownRepairTime,
  capacityFor,
  expectedProfit,
  materialEfficiencyFactor,
  orderCost,
  qualityMultiplier,
  reliabilityFactor,
  robotBuildTime,
  robotCost,
  robotSalePrice,
  speedMultiplier,
  upgradeCost,
} from '../economy';
import { ROBOT_CONFIG, ROBOT_ORDER } from '../config';

describe('robot economy', () => {
  it('sale price exceeds order cost for every model (always profitable)', () => {
    for (const r of ROBOT_ORDER) {
      expect(robotSalePrice(r)).toBeGreaterThan(robotCost(r));
    }
  });

  it('profitability increases with the model tier', () => {
    const profits = ROBOT_ORDER.map((r) => expectedProfit(r, 1, 1));
    expect(profits).toEqual([profits[0], profits[1], profits[2]].sort((a, b) => a - b));
    expect(expectedProfit('worker', 1, 1)).toBeLessThan(expectedProfit('explorer', 1, 1));
    expect(expectedProfit('explorer', 1, 1)).toBeLessThan(expectedProfit('combat', 1, 1));
  });

  it('build times differ between models and are positive', () => {
    const times = ROBOT_ORDER.map(robotBuildTime);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    for (const t of times) expect(t).toBeGreaterThan(0);
  });

  it('each model has distinct stats (not reskins of one another)', () => {
    const worker = ROBOT_CONFIG.worker;
    for (const r of ['explorer', 'combat'] as const) {
      const c = ROBOT_CONFIG[r];
      expect(c.fabricateTime).not.toBe(worker.fabricateTime);
      expect(c.salePrice).not.toBe(worker.salePrice);
      expect(c.materialCost).not.toBe(worker.materialCost);
    }
    expect(ROBOT_CONFIG.explorer.requires.length).toBeGreaterThan(0);
    expect(ROBOT_CONFIG.combat.requires.length).toBeGreaterThan(ROBOT_CONFIG.explorer.requires.length);
  });
});

describe('upgrade economies', () => {
  it('speed multiplier grows with level', () => {
    expect(speedMultiplier(1)).toBe(1);
    expect(speedMultiplier(2)).toBeGreaterThan(speedMultiplier(1));
    expect(speedMultiplier(3)).toBeGreaterThan(speedMultiplier(2));
  });

  it('reliability reduces failure chance with level', () => {
    expect(reliabilityFactor(1)).toBeCloseTo(1, 9);
    expect(reliabilityFactor(3)).toBeLessThan(reliabilityFactor(2));
    expect(reliabilityFactor(2)).toBeLessThan(reliabilityFactor(1));
  });

  it('material efficiency and quality tuning improve their economics', () => {
    expect(materialEfficiencyFactor(1)).toBeCloseTo(1, 9);
    expect(materialEfficiencyFactor(3)).toBeLessThan(materialEfficiencyFactor(2));
    expect(orderCost('worker', 3)).toBeLessThan(orderCost('worker', 1));
    expect(qualityMultiplier(2)).toBeGreaterThan(qualityMultiplier(1));
  });

  it('upgrade cost strictly increases per level on every track', () => {
    for (const id of MACHINE_ORDER) {
      for (const track of ['speed', 'reliability', 'special'] as const) {
        expect(upgradeCost(id, track, 2)).toBeGreaterThan(upgradeCost(id, track, 1));
        expect(upgradeCost(id, track, 3)).toBeGreaterThan(upgradeCost(id, track, 2));
      }
    }
  });

  it('buffer capacity grows with assembler Parallel Bays, fixed for finisher, null for fabricator', () => {
    expect(capacityFor('fabricator', 1)).toBeNull();
    expect(capacityFor('assembler', 1)).toBe(6);
    expect(capacityFor('assembler', 3)).toBeGreaterThan(capacityFor('assembler', 1) ?? 0);
    expect(capacityFor('finisher', 5)).toBe(8);
  });

  it('breakdown repair time/cost exist for every breakdown type', () => {
    for (const t of ['overheating', 'jam', 'component-failure', 'power-issue'] as const) {
      expect(breakdownCost(t)).toBeGreaterThan(0);
      expect(breakdownRepairTime(t)).toBeGreaterThan(0);
    }
  });
});