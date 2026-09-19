import { describe, expect, it } from 'vitest';
import { MATERIAL_CONFIG } from '../config';
import { materialMet, orderCost, saleValueFor, stageDuration } from '../economy';
import {
  addOrder,
  createInitialState,
  setMaterial,
  setSound,
  tick,
  upgrade,
} from '../factory';
import { migrateState } from '../persist';
import { makeJob, machineMidJob, richState, run } from './helpers';

describe('materials', () => {
  it('applies cost / build-time / sale multipliers per material', () => {
    expect(MATERIAL_CONFIG.chrome.costMult).toBe(1);
    expect(orderCost('worker', 1, 'chrome')).toBe(30);
    expect(orderCost('worker', 1, 'alloy')).toBe(Math.round(22 * 1.5) + 8); // 41
    expect(orderCost('worker', 1, 'carbon')).toBe(Math.round(22 * 2) + 8); // 52

    expect(saleValueFor('worker', 1, 'chrome')).toBe(55);
    expect(saleValueFor('worker', 1, 'alloy')).toBe(Math.round(55 * 1.25)); // 69
    expect(saleValueFor('worker', 1, 'carbon')).toBe(Math.round(55 * 1.6)); // 88

    expect(stageDuration('fabricator', 'worker', 'chrome')).toBe(8);
    expect(stageDuration('fabricator', 'worker', 'carbon')).toBeCloseTo(8 * 1.7);
  });

  it('locks alloy behind fabricator reliability and carbon behind speed+assembly', () => {
    const s = createInitialState();
    expect(materialMet('alloy', s.machines)).toBe(false);
    expect(materialMet('carbon', s.machines)).toBe(false);
    const unlocked = { ...s, machines: { ...s.machines } };
    const fab = { ...unlocked.machines.fabricator, upgrades: { speed: 4, reliability: 2, special: 1 } };
    const asm = { ...unlocked.machines.assembler, upgrades: { speed: 3, reliability: 1, special: 1 } };
    unlocked.machines = { ...unlocked.machines, fabricator: fab, assembler: asm };
    expect(materialMet('alloy', unlocked.machines)).toBe(true);
    expect(materialMet('carbon', unlocked.machines)).toBe(true);
  });

  it('addOrder defaults to settings.material and rejects locked materials', () => {
    const s = richState();
    expect(setMaterial(s, 'carbon').settings.material).toBe('carbon');

    let r = addOrder(s, 'worker'); // settings default = chrome
    expect(r.ok).toBe(true);
    expect(r.state.orders[0].material).toBe('chrome');

    const alloy = setMaterial(s, 'alloy'); // alloy locked at start
    r = addOrder(alloy, 'worker');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('requirement');

    let un = richState();
    un = {
      ...un,
      machines: {
        ...un.machines,
        fabricator: {
          ...un.machines.fabricator,
          upgrades: { speed: 1, reliability: 2, special: 1 },
        },
      },
    };
    r = addOrder(un, 'worker', 'alloy');
    expect(r.ok).toBe(true);
    expect(r.state.orders[0].material).toBe('alloy');
    expect(r.state.orders[0].costPaid).toBe(orderCost('worker', 1, 'alloy'));
  });

  it('material cost is locked on the job and survives later upgrades', () => {
    let s = richState();
    s = {
      ...s,
      machines: {
        ...s.machines,
        fabricator: {
          ...s.machines.fabricator,
          upgrades: { speed: 1, reliability: 2, special: 1 },
        },
      },
    };
    s = addOrder(s, 'worker', 'alloy').state;
    const paid = s.orders[0].costPaid;
    s = upgrade(s, 'fabricator', 'special').state; // now chrome orders would be cheaper
    expect(s.orders[0].costPaid).toBe(paid);
  });

  it('ships with the right sale value and tallies by material', () => {
    let s = richState();
    s = {
      ...s,
      machines: {
        ...s.machines,
        fabricator: {
          ...s.machines.fabricator,
          upgrades: { speed: 1, reliability: 2, special: 1 },
        },
      },
    };
    s = machineMidJob(s, 'finisher', makeJob('worker', { id: 7, serial: 3, costPaid: 41, material: 'alloy' }), 0.999);
    s = tick(s, 1, () => 0.99);
    expect(s.stats.revenue).toBe(69);
    expect(s.stats.byMaterial.alloy).toBe(1);
    expect(s.stats.byMaterial.chrome).toBe(0);
  });

  it('migrates old jobs without material to chrome and coerces bad values', () => {
    const s = migrateState({
      orders: [
        { id: 1, type: 'worker', serial: 1, stage: 'queued', placedAt: 0, costPaid: 30 },
        { id: 2, type: 'worker', serial: 2, stage: 'queued', placedAt: 0, costPaid: 99, material: 'plutonium' },
      ],
      settings: { gameSpeed: 3, material: 'carbon', sound: false },
    });
    expect(s.orders[0].material).toBe('chrome');
    expect(s.orders[1].material).toBe('chrome'); // unknown coerced
    expect(s.settings.material).toBe('carbon');
    expect(s.settings.sound).toBe(false);
  });

  it('setSound toggles the cue preference and preserves other settings', () => {
    const s = richState();
    expect(s.settings.sound).toBe(true);
    const muted = setSound(s, false);
    expect(muted.settings.sound).toBe(false);
    expect(muted.settings.gameSpeed).toBe(s.settings.gameSpeed);
    expect(muted.settings.material).toBe(s.settings.material);
  });

  it('a full alloy run still finishes with conservation intact', () => {
    let s = richState();
    s = setMaterial(s, 'alloy');
    s = {
      ...s,
      machines: {
        ...s.machines,
        fabricator: {
          ...s.machines.fabricator,
          upgrades: { speed: 1, reliability: 2, special: 1 },
        },
      },
    };
    for (let i = 0; i < 2; i++) s = addOrder(s, 'worker').state;
    const startCredits = s.credits;
    s = run(s, 60);
    expect(s.stats.robotsShipped).toBe(2);
    expect(s.stats.byMaterial.alloy).toBe(2);
    // Credits = start + alloy sale value × 2 (no breakdowns at rng 0.99).
    expect(s.credits).toBe(startCredits + 2 * saleValueFor('worker', 1, 'alloy'));
  });
});