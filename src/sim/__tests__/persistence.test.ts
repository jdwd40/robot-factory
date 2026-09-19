import { describe, expect, it } from 'vitest';
import { addOrder, cancelOrder, createInitialState, tick, upgrade } from '../factory';
import { clearSave, loadState, migrateState, saveState } from '../persist';
import type { StorageLike } from '../persist';
import { richState } from './helpers';

function makeStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

describe('persistence', () => {
  it('round-trips a busy factory through save → load unchanged', () => {
    const storage = makeStorage();
    let s = richState({ wallTime: 123456 });
    s = upgrade(s, 'fabricator', 'speed').state;
    s = upgrade(s, 'assembler', 'special').state;
    for (let i = 0; i < 4; i++) s = addOrder(s, i % 2 === 0 ? 'worker' : 'explorer').state;
    s = tick(s, 30, () => 0.99);
    s = setSpeed2(s);
    saveState(s, storage);
    const loaded = loadState(storage);
    expect(loaded).toEqual(s);
  });

  it('returns the initial state for empty storage, invalid JSON and garbage', () => {
    const empty = loadState(makeStorage());
    expect(empty).toEqual(createInitialState({ wallTime: empty.startedAtWall }));

    const raw = makeStorage();
    raw.setItem('robot-factory-save-v1', '{ not json');
    const fromBroke = loadState(raw);
    expect(fromBroke).toEqual(createInitialState({ wallTime: fromBroke.startedAtWall }));

    const migrated = migrateState({ arbitrary: true });
    expect(migrated.credits).toBe(200);
    expect(migrated.orders).toHaveLength(0);
  });

  it('merge partial/old data onto defaults without crashing', () => {
    const s = migrateState({ credits: 777, elapsed: 12 });
    expect(s.credits).toBe(777);
    expect(s.elapsed).toBe(12);
    expect(s.machines.fabricator.upgrades.speed).toBe(1);
    expect(s.machines.fabricator.state).toBe('idle');
    expect(s.stats.robotsShipped).toBe(0);
    expect(s.orders).toHaveLength(0);
    expect(s.settings.gameSpeed).toBe(1);
  });

  it('clamps hostile numeric inputs', () => {
    const s = migrateState({ credits: -50, machines: { fabricator: { totalBreakdowns: -3 } } });
    expect(s.credits).toBe(0);
    expect(s.machines.fabricator.totalBreakdowns).toBe(0);
    expect(s.machines.fabricator.upgrades.speed).toBe(1);
  });

  it('drops invalid orders, duplicates and unknown robot types', () => {
    const raw = {
      orders: [
        { id: 3, type: 'worker', serial: 1, stage: 'queued', placedAt: 0, costPaid: 30 },
        { id: 3, type: 'worker', serial: 2, stage: 'queued', placedAt: 0, costPaid: 30 }, // dup id
        { id: 4, type: 'warp-drive', serial: 3, stage: 'queued', placedAt: 0, costPaid: 1 }, // bad type
        null,
      ],
    };
    const s = migrateState(raw);
    expect(s.orders).toHaveLength(1);
    expect(s.orders[0].id).toBe(3);
  });

  it('coerces invalid enum values', () => {
    const s = migrateState({
      machines: { fabricator: { state: 'exploding', upgrades: { speed: 99 } } },
      log: [{ id: 1, kind: 'banana', elapsed: 0, message: 'x' }],
    });
    expect(s.machines.fabricator.state).toBe('idle');
    expect(s.machines.fabricator.upgrades.speed).toBe(8); // capped
    expect(s.log[0].kind).toBe('info');
  });

  it('clears a broken machine whose breakdownType is missing', () => {
    const s = migrateState({
      machines: { assembler: { state: 'broken', breakdownType: null } },
    });
    expect(s.machines.assembler.state).toBe('idle');
  });

  it('drops expired events on load', () => {
    const s = migrateState({
      events: [
        { id: 1, type: 'power-surge', remaining: -2, startedAt: 0, data: [] },
        { id: 2, type: 'bulk-order', remaining: 20, startedAt: 0, data: [3, 1] },
      ],
    });
    expect(s.events).toHaveLength(1);
    expect(s.events[0].type).toBe('bulk-order');
  });

  it('clearSave wipes the stored factory', () => {
    const storage = makeStorage();
    saveState(richState(), storage);
    expect(loadState(storage).credits).toBeGreaterThan(0);
    clearSave(storage);
    const fresh = loadState(storage);
    expect(fresh).toEqual(createInitialState({ wallTime: fresh.startedAtWall }));
  });

  it('reset + reload gives a pristine factory (no stale timers or data)', () => {
    const storage = makeStorage();
    let s = richState();
    for (let i = 0; i < 5; i++) s = addOrder(s, 'worker').state;
    s = cancelOrder(s, s.orders[0].id).state;
    saveState(s, storage);
    clearSave(storage);
    const fresh = loadState(storage);
    expect(fresh.credits).toBe(200);
    expect(fresh.orders).toHaveLength(0);
    expect(fresh.elapsed).toBe(0);
    expect(fresh.stats.robotsShipped).toBe(0);
    expect(fresh.events).toHaveLength(0);
  });
});

/** Local helper to flip game speed twice (mirrors UI toggle). */
function setSpeed2(s: ReturnType<typeof richState>) {
  return { ...s, settings: { ...s.settings, gameSpeed: 2 as const } };
}