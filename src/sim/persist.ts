import {
  BREAKDOWN_TYPES,
  DEFAULT_MATERIAL,
  JOB_STAGES,
  LOG_KINDS,
  MACHINE_ORDER,
  MATERIAL_ORDER,
  MAX_LOG_ENTRIES,
  MAX_UPGRADE_LEVEL,
  ROBOT_ORDER,
  SAVE_VERSION,
  EVENT_TYPES,
} from './config';
import { createInitialState } from './factory';
import type {
  ActiveEvent,
  FactoryState,
  Job,
  LogEntry,
  MachineState,
  MaterialId,
  RobotId,
} from './types';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const KEY = 'robot-factory-save-v1';

function defaultStorage(): StorageLike | null {
  try {
    if (typeof globalThis.localStorage !== 'undefined') return globalThis.localStorage;
  } catch {
    /* localStorage unavailable (private mode / non-browser) */
  }
  return null;
}

export function saveState(state: FactoryState, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota exceeded or serialisation failure — save is best-effort */
  }
}

export function clearSave(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function loadState(storage: StorageLike | null = defaultStorage()): FactoryState {
  if (!storage) return createInitialState();
  let raw: unknown;
  try {
    const text = storage.getItem(KEY);
    if (!text) return createInitialState();
    raw = JSON.parse(text);
  } catch {
    return createInitialState();
  }
  return migrateState(raw);
}

function num(v: unknown, fallback: number, min = 0): number {
  return Number.isFinite(typeof v === 'number' ? v : Number(v)) ? Math.max(min, Number(v)) : fallback;
}

function inSet<T>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

function normJob(raw: unknown): Job | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!ROBOT_ORDER.includes(o.type as RobotId)) return null;
  const type = o.type as RobotId;
  const job: Job = {
    id: Math.abs(num(o.id, 1, 1)),
    type,
    serial: Math.abs(num(o.serial, 1, 1)),
    stage: inSet(o.stage, JOB_STAGES, 'queued'),
    placedAt: num(o.placedAt, 0),
    costPaid: num(o.costPaid, 0, 1),
    material: inSet(o.material as MaterialId, MATERIAL_ORDER, DEFAULT_MATERIAL),
  };
  return job;
}

function normJobs(raw: unknown): Job[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const jobs: Job[] = [];
  for (const j of raw) {
    const job = normJob(j);
    if (job && !seen.has(job.id)) {
      seen.add(job.id);
      jobs.push(job);
    }
  }
  return jobs;
}

function normEvent(raw: unknown): ActiveEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!EVENT_TYPES.includes(o.type as ActiveEvent['type'])) return null;
  const data = Array.isArray(o.data) ? o.data.map((d) => num(d, 0)) : [];
  return {
    id: Math.abs(num(o.id, 1, 1)),
    type: o.type as ActiveEvent['type'],
    remaining: num(o.remaining, 0),
    startedAt: num(o.startedAt, 0),
    data,
  };
}

function normLog(raw: unknown): LogEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const log: LogEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (typeof o.message !== 'string') continue;
    const id = Math.abs(num(o.id, 0));
    if (seen.has(id)) continue;
    seen.add(id);
    log.push({
      id,
      elapsed: num(o.elapsed, 0),
      kind: inSet(o.kind, LOG_KINDS, 'info'),
      message: o.message,
    });
  }
  return log.slice(-MAX_LOG_ENTRIES);
}

function normMachine(raw: unknown, id: MachineState['id']): MachineState {
  const base = createInitialState().machines[id];
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  const upgradesRaw = (o.upgrades ?? {}) as Record<string, unknown>;
  const track = (k: 'speed' | 'reliability' | 'special', fb: number) =>
    Math.min(MAX_UPGRADE_LEVEL, Math.max(1, Math.round(num(upgradesRaw[k], fb, 1))));
  const btRaw = o.breakdownType;
  const breakdownType =
    btRaw === null || btRaw === undefined
      ? null
      : BREAKDOWN_TYPES.includes(btRaw as never)
        ? (btRaw as MachineState['breakdownType'])
        : null;
  return {
    id,
    upgrades: {
      speed: track('speed', 1),
      reliability: track('reliability', 1),
      special: track('special', 1),
    },
    state: inSet(
      o.state,
      ['idle', 'processing', 'waiting', 'blocked', 'overheated', 'broken', 'repairing'] as const,
      'idle',
    ),
    progress: Math.min(1, Math.max(0, num(o.progress, 0))),
    currentJob: normJob(o.currentJob),
    inputBuffer: normJobs(o.inputBuffer),
    overclock: o.overclock === true,
    breakdownType,
    repairTimeLeft: num(o.repairTimeLeft, 0),
    heat: Math.min(1.2, Math.max(0, num(o.heat, 0))),
    totalActiveSeconds: num(o.totalActiveSeconds, 0),
    totalJobsCompleted: num(o.totalJobsCompleted, 0),
    totalBreakdowns: num(o.totalBreakdowns, 0),
    totalRepairCost: num(o.totalRepairCost, 0),
    totalUpgradeSpend: num(o.totalUpgradeSpend, 0),
    activeEma: Math.min(1, Math.max(0, num(o.activeEma, 0))),
    queueEma: num(o.queueEma, 0),
  };
}

/**
 * Rebuild a valid FactoryState from any JSON payload. Missing, malformed and
 * out-of-range fields fall back to defaults; list items that fail validation
 * are dropped; enum values are coerced. Never throws.
 */
export function migrateState(raw: unknown): FactoryState {
  if (!raw || typeof raw !== 'object') return createInitialState();
  const o = raw as Record<string, unknown>;
  const base = createInitialState();

  const machines = { ...base.machines };
  const machinesRaw = (o.machines ?? {}) as Record<string, unknown>;
  for (const id of MACHINE_ORDER) {
    machines[id] = normMachine(machinesRaw[id], id);
  }

  const byType = (rb: unknown, fb: Record<RobotId, number>): Record<RobotId, number> => {
    const out = { ...fb } as Record<RobotId, number>;
    if (rb && typeof rb === 'object') {
      for (const r of ROBOT_ORDER) {
        const v = (rb as Record<string, unknown>)[r];
        if (Number.isFinite(typeof v === 'number' ? v : Number(v))) out[r] = num(v, fb[r]);
      }
    }
    return out;
  };
  const byMaterial = (rb: unknown, fb: Record<MaterialId, number>): Record<MaterialId, number> => {
    const out = { ...fb } as Record<MaterialId, number>;
    if (rb && typeof rb === 'object') {
      for (const r of MATERIAL_ORDER) {
        const v = (rb as Record<string, unknown>)[r];
        if (Number.isFinite(typeof v === 'number' ? v : Number(v))) out[r] = num(v, fb[r]);
      }
    }
    return out;
  };
  const statsRaw = (o.stats ?? {}) as Record<string, unknown>;
  const stats: FactoryState['stats'] = {
    robotsShipped: num(statsRaw.robotsShipped, 0),
    byType: byType(statsRaw.byType, base.stats.byType),
    byTypeRevenue: byType(statsRaw.byTypeRevenue, base.stats.byTypeRevenue),
    byTypeProfit: byType(statsRaw.byTypeProfit, base.stats.byTypeProfit),
    byMaterial: byMaterial(statsRaw.byMaterial, base.stats.byMaterial),
    revenue: num(statsRaw.revenue, 0),
    profit: num(statsRaw.profit, 0),
    costPaid: num(statsRaw.costPaid, 0),
    repairCost: num(statsRaw.repairCost, 0),
    repairCount: num(statsRaw.repairCount, 0),
    refundsReceived: num(statsRaw.refundsReceived, 0),
    coolSpend: num(statsRaw.coolSpend, 0),
    buyoutSpend: num(statsRaw.buyoutSpend, 0),
    upgradeSpend: num(statsRaw.upgradeSpend, 0),
    upgradeCount: num(statsRaw.upgradeCount, 0),
    breakdowns: num(statsRaw.breakdowns, 0),
    eventsTriggered: num(statsRaw.eventsTriggered, 0),
    eventsFulfilled: num(statsRaw.eventsFulfilled, 0),
    avgBuildTime: Math.max(0, num(statsRaw.avgBuildTime, 0)),
    buildSamples: num(statsRaw.buildSamples, 0),
    rateEma: Math.max(0, num(statsRaw.rateEma, 0)),
    lastShipElapsed: num(statsRaw.lastShipElapsed, 0),
    lastShipValue: num(statsRaw.lastShipValue, 0),
  };

  // Ignore stale machines that claim to be broken without a valid type.
  for (const id of MACHINE_ORDER) {
    const m = machines[id];
    if (m.state === 'broken' || m.state === 'overheated' || m.state === 'repairing') {
      if (!m.breakdownType) {
        m.state = 'idle';
        m.repairTimeLeft = 0;
      }
    }
  }

  const speed = inSet(
    (o.settings as Record<string, unknown> | undefined)?.gameSpeed,
    [1, 2, 3] as const,
    1,
  );

  const settingsRaw = (o.settings ?? {}) as Record<string, unknown>;
  const material = inSet(settingsRaw.material as MaterialId, MATERIAL_ORDER, DEFAULT_MATERIAL);
  const sound = typeof settingsRaw.sound === 'boolean' ? settingsRaw.sound : true;
  const paused = settingsRaw.paused === true;

  const nextSerial = byType(o.nextSerial, { worker: 1, explorer: 1, combat: 1 });

  return {
    version: SAVE_VERSION,
    elapsed: num(o.elapsed, 0),
    credits: num(o.credits, base.credits),
    nextJobId: Math.max(1, Math.abs(num(o.nextJobId, 1, 1))),
    nextEventId: Math.max(1, Math.abs(num(o.nextEventId, 1, 1))),
    lastLogId: Math.max(1, Math.abs(num(o.lastLogId, 1, 1))),
    nextSerial,
    nextEventIn: num(o.nextEventIn, base.nextEventIn),
    startedAtWall: num(o.startedAtWall, base.startedAtWall),
    orders: normJobs(o.orders),
    machines,
    events: (Array.isArray(o.events) ? o.events.map(normEvent).filter((e): e is ActiveEvent => e !== null) : []).filter(
      (e) => e.remaining > 0,
    ),
    stats,
    log: normLog(o.log),
    settings: { gameSpeed: speed, paused, material, sound },
  };
}