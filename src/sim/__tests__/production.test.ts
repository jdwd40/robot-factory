import { describe, expect, it } from 'vitest';
import {
  addOrder,
  cancelOrder,
  createInitialState,
  reorderOrder,
  tick,
  upgrade,
} from '../factory';
import type { FactoryState, RobotId } from '../types';

describe('production queue', () => {
  it('places an order: deducts cost, adds to queue, assigns serial', () => {
    const s0 = createInitialState({ wallTime: 0 });
    const r = addOrder(s0, 'worker');
    expect(r.ok).toBe(true);
    const s = r.state;
    expect(s.credits).toBe(200 - 30);
    expect(s.orders).toHaveLength(1);
    expect(s.orders[0].type).toBe('worker');
    expect(s.orders[0].serial).toBe(1);
    expect(s.nextSerial.worker).toBe(2);
    expect(s.orders[0].stage).toBe('queued');
  });

  it('refuses an order it cannot afford and leaves state unchanged', () => {
    const s0 = { ...createInitialState({ wallTime: 0 }), credits: 10 };
    const r = addOrder(s0, 'worker'); // worker costs 30 > 10
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('insufficient-credits');
    expect(r.state).toEqual(s0);
  });

  it('enforces machine requirements per model', () => {
    const base = { ...createInitialState({ wallTime: 0 }), credits: 10_000 };
    expect(addOrder(base, 'explorer').ok).toBe(false); // needs Fabricator Speed L2

    const s = upgrade(base, 'fabricator', 'speed').state;
    expect(addOrder(s, 'explorer').ok).toBe(true);

    const s2 = upgrade(s, 'assembler', 'speed').state;
    expect(addOrder(s2, 'combat').ok).toBe(true); // needs both Fabricator+Assembler L2

    expect(addOrder(s, 'combat').ok).toBe(false); // Assembler L2 still missing
  });

  it('produces and ships robots automatically without further input', () => {
    let s = createInitialState({ wallTime: 0 });
    for (let i = 0; i < 3; i++) s = addOrder(s, 'worker').state;
    s = runLong(s);
    expect(s.stats.robotsShipped).toBe(3);
    expect(s.stats.byType.worker).toBe(3);
    expect(s.credits).toBe(200 - 90 + 3 * 55);
    expect(s.stats.profit).toBe(3 * (55 - 30));
  });

  it('ships models with distinct timings (combat takes longer than worker)', () => {
    const w = measuredShipTime('worker');
    const c = measuredShipTime('combat');
    expect(c).toBeGreaterThan(w);
  });

  it('cancel refunds an un-started queued order', () => {
    const s = addOrder(createInitialState({ wallTime: 0 }), 'worker').state;
    const r = cancelOrder(s, s.orders[0].id);
    expect(r.ok).toBe(true);
    expect(r.state.credits).toBe(200);
    expect(r.state.orders).toHaveLength(0);
  });

  it('reorders queued jobs', () => {
    let s = createInitialState({ wallTime: 0 });
    s = addOrder(s, 'worker').state;
    s = addOrder(s, 'worker').state;
    s = addOrder(s, 'worker').state;
    const [head, second, third] = s.orders;

    const r = reorderOrder(s, second.id, -1); // second jumped to front
    expect(r.ok).toBe(true);
    expect(r.state.orders.map((j) => j.id)).toEqual([second.id, head.id, third.id]);

    const up = reorderOrder(r.state, head.id, -1); // head moves up one → front
    expect(up.ok).toBe(true);
    expect(up.state.orders[0].id).toBe(head.id);

    const rr = reorderOrder(up.state, head.id, -1); // already at front
    expect(rr.ok).toBe(false);
    expect(rr.reason).toBe('out-of-range');
  });

  it('tracks average build time from actual elapsed simulation', () => {
    let s = createInitialState({ wallTime: 0 });
    s = addOrder(s, 'worker').state;
    s = runLong(s);
    expect(s.stats.buildSamples).toBe(1);
    expect(s.stats.avgBuildTime).toBeGreaterThan(15);
    expect(s.stats.avgBuildTime).toBeLessThan(40);
  });

  it('quality tuning raises the sale value and profit recorded', () => {
    let s = createInitialState({ wallTime: 0 });
    s = upgrade(s, 'finisher', 'special').state;
    s = addOrder(s, 'worker').state;
    const paid = s.orders[0].costPaid;
    s = runLong(s);
    expect(s.stats.robotsShipped).toBe(1);
    const expectedSale = Math.round(55 * 1.04);
    expect(s.stats.revenue).toBe(expectedSale);
    expect(s.stats.profit).toBe(expectedSale - paid);
  });
});

/** Ship exactly one pre-ordered robot and return elapsed at shipment. */
function measuredShipTime(type: RobotId): number {
  let s = addOrder(createInitialState({ wallTime: 0 }), type).state;
  const dt = 0.1;
  const started = s.elapsed;
  for (let i = 0; i < 6000; i++) {
    s = tick(s, dt, () => 0.99);
    if (s.stats.robotsShipped > 0) break;
  }
  return s.elapsed - started;
}

function runLong(s: FactoryState): FactoryState {
  for (let i = 0; i < 2000; i++) s = tick(s, 0.1, () => 0.99);
  return s;
}