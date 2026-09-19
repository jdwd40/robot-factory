import {
  BREAKDOWN_CONFIG,
  BREAKDOWN_WEIGHTS,
  BUYOUTABLE_EVENTS,
  DEFAULT_MATERIAL,
  EMERGENCY_COOL_COST,
  EMERGENCY_COOL_MIN_HEAT,
  EVENT_CONFIG,
  EVENT_COOLDOWN_JITTER,
  EVENT_COOLDOWN_MIN,
  EVENT_EFFECT,
  EVENT_FIRST_DELAY,
  EVENT_TRIGGER_CHANCE,
  EVENT_WEIGHTS,
  HEAT_CAP,
  HEAT_COOL_RATE,
  MACHINE_CONFIG,
  MACHINE_ORDER,
  MATERIAL_CONFIG,
  MATERIAL_ORDER,
  MAX_LOG_ENTRIES,
  MAX_ORDER_QUEUE,
  MAX_UPGRADE_LEVEL,
  OVERCLOCK_HEAT_MULT,
  OVERCLOCK_SPEED_MULT,
  ROBOT_CONFIG,
  RATE_TAU,
  SALVAGE_FRACTION,
  SAVE_VERSION,
  STARTING_CREDITS,
  UPGRADE_TRACKS,
  UTILISATION_TAU,
} from './config';
import {
  breakdownRepairTime,
  capacityFor,
  materialMet,
  orderCost,
  processFailureRisk,
  saleValueFor,
  speedMultiplier,
  stageDuration,
  upgradeCost,
} from './economy';
import { activeModifiers } from './modifiers';
import { chance, ema, pickWeighted } from './random';
import type { Rng } from './random';
import type {
  ActionResult,
  FactoryState,
  Job,
  LogKind,
  MachineId,
  MachineState,
  MachineStateType,
  MaterialId,
  RobotId,
  UpgradeTrack,
} from './types';

/* ---------- Construction ---------- */

function initialMachine(id: MachineId): MachineState {
  return {
    id,
    upgrades: { speed: 1, reliability: 1, special: 1 },
    state: 'idle',
    progress: 0,
    currentJob: null,
    inputBuffer: [],
    overclock: false,
    breakdownType: null,
    repairTimeLeft: 0,
    heat: 0,
    totalActiveSeconds: 0,
    totalJobsCompleted: 0,
    totalBreakdowns: 0,
    totalRepairCost: 0,
    totalUpgradeSpend: 0,
    activeEma: 0,
    queueEma: 0,
  };
}

function initialStats(): FactoryState['stats'] {
  return {
    robotsShipped: 0,
    byType: { worker: 0, explorer: 0, combat: 0 },
    byTypeRevenue: { worker: 0, explorer: 0, combat: 0 },
    byTypeProfit: { worker: 0, explorer: 0, combat: 0 },
    byMaterial: { chrome: 0, alloy: 0, carbon: 0 },
    revenue: 0,
    profit: 0,
    costPaid: 0,
    repairCost: 0,
    repairCount: 0,
    refundsReceived: 0,
    coolSpend: 0,
    buyoutSpend: 0,
    upgradeSpend: 0,
    upgradeCount: 0,
    breakdowns: 0,
    eventsTriggered: 0,
    eventsFulfilled: 0,
    avgBuildTime: 0,
    buildSamples: 0,
    rateEma: 0,
    lastShipElapsed: 0,
    lastShipValue: 0,
  };
}

/** Single source of truth for a fresh factory. */
export function createInitialState(opts: { wallTime?: number } = {}): FactoryState {
  return {
    version: SAVE_VERSION,
    elapsed: 0,
    credits: STARTING_CREDITS,
    nextJobId: 1,
    nextEventId: 1,
    lastLogId: 1,
    nextSerial: { worker: 1, explorer: 1, combat: 1 },
    nextEventIn: EVENT_FIRST_DELAY,
    startedAtWall: opts.wallTime ?? Date.now(),
    orders: [],
    machines: {
      fabricator: initialMachine('fabricator'),
      assembler: initialMachine('assembler'),
      finisher: initialMachine('finisher'),
    },
    events: [],
    stats: initialStats(),
    log: [{ id: 0, elapsed: 0, kind: 'info', message: 'Factory online' }],
    settings: { gameSpeed: 1, paused: false, material: DEFAULT_MATERIAL, sound: true },
  };
}

/**
 * Reset returns a fresh initial state. The incoming state is intentionally
 * ignored; the parameter exists so resetState can be used as a React setState
 * updater, which always passes the previous state.
 */
export function resetState(_state: FactoryState, opts?: { wallTime?: number }): FactoryState {
  return createInitialState(opts);
}

/* ---------- Logging ---------- */

function pushLog(state: FactoryState, kind: LogKind, message: string): void {
  state.log.push({ id: state.lastLogId++, elapsed: state.elapsed, kind, message });
  if (state.log.length > MAX_LOG_ENTRIES) {
    state.log.splice(0, state.log.length - MAX_LOG_ENTRIES);
  }
}

/* ---------- Tick ---------- */

function progressStep(m: MachineState, dt: number, flags: ReturnType<typeof activeModifiers>): number {
  const job = m.currentJob;
  if (!job) return 0;
  let time = stageDuration(m.id, job.type, job.material);
  const speed =
    speedMultiplier(m.upgrades.speed) * flags.speedFactor * (m.overclock ? OVERCLOCK_SPEED_MULT : 1);
  if (m.id === 'fabricator' && flags.materialShortage) time *= flags.fabricationFactor;
  return (dt * speed) / time;
}

function pushInto(next: FactoryState, fromId: MachineId, toId: MachineId): boolean {
  const down = next.machines[toId];
  const cap = capacityFor(toId, down.upgrades.special);
  if (cap !== null && down.inputBuffer.length >= cap) return false;
  const job = next.machines[fromId].currentJob;
  if (!job) return true;
  job.stage = toId === 'assembler' ? 'assembling' : 'finishing';
  down.inputBuffer.push(job);
  return true;
}

function shipRobot(
  next: FactoryState,
  m: MachineState,
  flags: ReturnType<typeof activeModifiers>,
): void {
  const job = m.currentJob;
  if (!job) return;
  const s = next.stats;
  const qualityLevel = next.machines.finisher.upgrades.special;
  let value = saleValueFor(job.type, qualityLevel, job.material);
  if (flags.perfectAssembly) value = Math.round(value * flags.assemblyBonus);

  next.credits += value;
  s.robotsShipped += 1;
  s.byType[job.type] += 1;
  s.byMaterial[job.material] += 1;
  s.revenue += value;
  s.byTypeRevenue[job.type] += value;
  const profit = value - job.costPaid;
  s.profit += profit;
  s.byTypeProfit[job.type] += profit;
  s.lastShipElapsed = next.elapsed;
  s.lastShipValue = value;

  const build = Math.max(0, next.elapsed - job.placedAt);
  s.avgBuildTime =
    s.buildSamples === 0 ? build : (s.avgBuildTime * s.buildSamples + build) / (s.buildSamples + 1);
  s.buildSamples += 1;

  pushLog(next, 'success', `${ROBOT_CONFIG[job.type].name} #${job.serial} (${MATERIAL_CONFIG[job.material].name}) shipped — +${value} cr`);

  for (const ev of next.events) {
    if (ev.type === 'bulk-order') {
      ev.data[1] += 1;
      ev.data[2] = (ev.data[2] ?? 0) + value;
      if (ev.data[1] >= ev.data[0]) {
        const bonus = Math.round(ev.data[2] * EVENT_EFFECT.bulkBonusFraction);
        next.credits += bonus;
        s.revenue += bonus;
        s.profit += bonus;
        s.eventsFulfilled += 1;
        pushLog(next, 'success', `Bulk Order complete — bonus +${bonus} cr`);
        ev.remaining = 0;
      }
    }
  }
}

function tryPush(
  next: FactoryState,
  id: MachineId,
  flags: ReturnType<typeof activeModifiers>,
): boolean {
  const m = next.machines[id];
  if (!m.currentJob) return true;
  if (id === 'fabricator') return pushInto(next, 'fabricator', 'assembler');
  if (id === 'assembler') return pushInto(next, 'assembler', 'finisher');
  shipRobot(next, m, flags);
  return true;
}

function nextDownstream(id: MachineId): MachineId | null {
  const idx = MACHINE_ORDER.indexOf(id);
  return idx >= 0 && idx < MACHINE_ORDER.length - 1 ? MACHINE_ORDER[idx + 1] : null;
}

function tryStartWork(next: FactoryState, id: MachineId): MachineStateType {
  const m = next.machines[id];
  let job: Job | null = null;
  if (id === 'fabricator') {
    if (next.orders.length > 0) job = next.orders.shift()!;
  } else if (m.inputBuffer.length > 0) {
    job = m.inputBuffer.shift()!;
  }
  if (job) {
    m.currentJob = job;
    m.progress = 0;
    job.stage = id === 'fabricator' ? 'fabricating' : id === 'assembler' ? 'assembling' : 'finishing';
    if (id === 'fabricator') {
      pushLog(next, 'production', `${ROBOT_CONFIG[job.type].name} #${job.serial} entered fabrication`);
    }
    if (id === 'finisher') {
      pushLog(next, 'production', `${ROBOT_CONFIG[job.type].name} #${job.serial} entered finishing`);
    }
    return 'processing';
  }
  const hasAnyWork =
    next.orders.length > 0 ||
    next.machines.assembler.inputBuffer.length > 0 ||
    next.machines.assembler.currentJob !== null ||
    next.machines.finisher.inputBuffer.length > 0 ||
    next.machines.finisher.currentJob !== null;
  return hasAnyWork ? 'waiting' : 'idle';
}

function triggerBreakdown(next: FactoryState, m: MachineState, rng: Rng): void {
  const type = pickWeighted(rng, BREAKDOWN_WEIGHTS);
  m.breakdownType = type;
  m.totalBreakdowns += 1;
  m.state = type === 'overheating' ? 'overheated' : 'broken';
  if (type === 'overheating') m.heat = 1;
  next.stats.breakdowns += 1;
  pushLog(next, 'warning', `${MACHINE_CONFIG[m.id].name} ${BREAKDOWN_CONFIG[type].verb} — needs maintenance`);
}

function scheduleEvents(next: FactoryState, dt: number, rng: Rng): void {
  next.nextEventIn -= dt;
  if (next.nextEventIn > 0) return;
  next.nextEventIn = EVENT_COOLDOWN_MIN + rng() * EVENT_COOLDOWN_JITTER;
  if (!chance(rng, EVENT_TRIGGER_CHANCE)) return;
  const type = pickWeighted(rng, EVENT_WEIGHTS);
  const cfg = EVENT_CONFIG[type];
  const data: number[] =
    type === 'bulk-order' ? [3 + Math.floor(rng() * 4), 0, 0] : [];
  next.events.push({
    id: next.nextEventId++,
    type,
    remaining: cfg.duration,
    startedAt: next.elapsed,
    data,
  });
  next.stats.eventsTriggered += 1;
  pushLog(next, 'event', `EVENT: ${cfg.label} — ${cfg.blurb}`);
}

function expireEvents(next: FactoryState, dt: number): void {
  for (let i = next.events.length - 1; i >= 0; i--) {
    const ev = next.events[i];
    ev.remaining -= dt;
    if (ev.remaining <= 0) {
      const cfg = EVENT_CONFIG[ev.type];
      if (ev.type === 'bulk-order' && ev.data[1] < ev.data[0]) {
        pushLog(next, 'info', `${cfg.label} expired — target not met`);
      } else if (ev.type !== 'bulk-order') {
        pushLog(next, 'info', `${cfg.label} has passed`);
      }
      next.events.splice(i, 1);
    }
  }
}

function updateMachine(
  next: FactoryState,
  id: MachineId,
  dt: number,
  rng: Rng,
  flags: ReturnType<typeof activeModifiers>,
): void {
  const m = next.machines[id];
  const cfg = MACHINE_CONFIG[id];

  if (m.state === 'processing') {
    const heatRate = cfg.heatRate * (m.overclock ? OVERCLOCK_HEAT_MULT : 1);
    m.heat = Math.min(HEAT_CAP, m.heat + heatRate * dt);
  } else {
    m.heat = Math.max(0, m.heat - HEAT_COOL_RATE * dt);
  }

  if (m.state === 'repairing') {
    m.repairTimeLeft -= dt;
    if (m.repairTimeLeft > 0) {
      finishStats(m, dt);
      return;
    }
    m.repairTimeLeft = 0;
    m.breakdownType = null;
    m.heat = 0;
    pushLog(next, 'info', `${cfg.name} is back online`);
    m.state = m.currentJob ? 'processing' : tryStartWork(next, id);
    finishStats(m, dt);
    return;
  }

  if (m.state === 'broken' || m.state === 'overheated') {
    finishStats(m, dt);
    return;
  }

  if (m.state === 'blocked') {
    if (tryPush(next, id, flags)) {
      m.currentJob = null;
      m.progress = 0;
      m.totalJobsCompleted += 1;
    } else {
      finishStats(m, dt);
      return;
    }
  }

  if (m.currentJob === null) {
    m.state = tryStartWork(next, id);
    finishStats(m, dt);
    return;
  }

  m.progress += progressStep(m, dt, flags);
  m.totalActiveSeconds += dt;

  if (m.progress >= 1) {
    if (!tryPush(next, id, flags)) {
      const down = nextDownstream(id);
      m.state = 'blocked';
      m.progress = 1;
      if (down) pushLog(next, 'warning', `${cfg.name} blocked — ${MACHINE_CONFIG[down].name} bay is full`);
      finishStats(m, dt);
      return;
    }
    m.currentJob = null;
    m.progress = 0;
    m.totalJobsCompleted += 1;
    m.state = tryStartWork(next, id);
    finishStats(m, dt);
    return;
  }

  const failureRate = processFailureRisk(cfg.breakdownRate, m.upgrades.reliability, m.heat);
  if (chance(rng, failureRate * dt)) triggerBreakdown(next, m, rng);
  finishStats(m, dt);
}

function finishStats(m: MachineState, dt: number): void {
  const backlog = m.inputBuffer.length + (m.currentJob ? 1 : 0);
  m.queueEma = ema(m.queueEma, backlog, dt, UTILISATION_TAU);
  m.activeEma = ema(m.activeEma, m.state === 'processing' ? 1 : 0, dt, UTILISATION_TAU);
}

/**
 * Advance the factory by dtSeconds. Pure and deterministic: same state, same
 * dt and same RNG sequence yield the same result. Randomness (breakdowns,
 * events) comes only from the injected Rng.
 */
export function tick(state: FactoryState, dtSeconds: number, rng: Rng = Math.random): FactoryState {
  const dt = Math.max(0, dtSeconds);
  if (dt === 0) return state;
  const next = structuredClone(state);
  next.elapsed += dt;

  const flags = activeModifiers(next);
  const prevShipped = next.stats.robotsShipped;

  scheduleEvents(next, dt, rng);
  for (const id of MACHINE_ORDER) {
    updateMachine(next, id, dt, rng, flags);
  }
  expireEvents(next, dt);

  const delta = next.stats.robotsShipped - prevShipped;
  const inst = delta / dt;
  next.stats.rateEma = ema(next.stats.rateEma, inst, dt, RATE_TAU);

  return next;
}

/* ---------- Actions (pure) ---------- */

export function addOrder(
  state: FactoryState,
  type: RobotId,
  material: MaterialId = state.settings.material,
): ActionResult {
  const cfg = ROBOT_CONFIG[type];
  for (const req of cfg.requires) {
    if (state.machines[req.machine].upgrades[req.track] < req.level) {
      return { state, ok: false, reason: 'requirement' };
    }
  }
  if (!materialMet(material, state.machines)) {
    return { state, ok: false, reason: 'requirement' };
  }
  if (state.orders.length >= MAX_ORDER_QUEUE) {
    return { state, ok: false, reason: 'queue-full' };
  }
  const cost = orderCost(type, state.machines.fabricator.upgrades.special, material);
  if (state.credits < cost) return { state, ok: false, reason: 'insufficient-credits' };
  const next = structuredClone(state);
  const job: Job = {
    id: next.nextJobId++,
    type,
    serial: next.nextSerial[type]++,
    stage: 'queued',
    placedAt: next.elapsed,
    costPaid: cost,
    material,
  };
  next.orders.push(job);
  next.credits -= cost;
  next.stats.costPaid += cost;
  pushLog(
    next,
    'economy',
    `Ordered ${cfg.name} #${job.serial} (${MATERIAL_CONFIG[material].name}) — ${cost} cr`,
  );
  return { ok: true, state: next };
}

export function cancelOrder(state: FactoryState, jobId: number): ActionResult {
  const idx = state.orders.findIndex((j) => j.id === jobId);
  if (idx < 0) return { state, ok: false, reason: 'not-queued' };
  const next = structuredClone(state);
  const [job] = next.orders.splice(idx, 1);
  next.credits += job.costPaid;
  next.stats.refundsReceived += job.costPaid;
  pushLog(next, 'economy', `Cancelled ${ROBOT_CONFIG[job.type].name} #${job.serial} — refunded ${job.costPaid} cr`);
  return { ok: true, state: next };
}

export function reorderOrder(state: FactoryState, jobId: number, dir: -1 | 1): ActionResult {
  const idx = state.orders.findIndex((j) => j.id === jobId);
  const target = idx + dir;
  if (idx < 0 || target < 0 || target >= state.orders.length) {
    return { state, ok: false, reason: 'out-of-range' };
  }
  const next = structuredClone(state);
  const arr = next.orders;
  [arr[idx], arr[target]] = [arr[target], arr[idx]];
  return { ok: true, state: next };
}

export function upgrade(state: FactoryState, machineId: MachineId, track: UpgradeTrack): ActionResult {
  const level = state.machines[machineId].upgrades[track];
  if (level >= MAX_UPGRADE_LEVEL) return { state, ok: false, reason: 'max-level' };
  const base = upgradeCost(machineId, track, level);
  const discount = activeModifiers(state).maintenanceFactor;
  const cost = Math.round(base * discount);
  if (state.credits < cost) return { state, ok: false, reason: 'insufficient-credits' };
  const next = structuredClone(state);
  next.credits -= cost;
  next.machines[machineId].upgrades[track] = level + 1;
  next.machines[machineId].totalUpgradeSpend += cost;
  next.stats.upgradeSpend += cost;
  next.stats.upgradeCount += 1;
  const label = `${MACHINE_CONFIG[machineId].name} ${UPGRADE_TRACKS[machineId][track].name}`;
  pushLog(next, 'upgrade', `${label} L${level}→L${level + 1} — ${cost} cr`);
  return { ok: true, state: next };
}

export function repair(state: FactoryState, machineId: MachineId): ActionResult {
  const m = state.machines[machineId];
  const type = m.breakdownType;
  if ((m.state !== 'broken' && m.state !== 'overheated') || !type) {
    return { state, ok: false, reason: 'not-broken' };
  }
  const cfg = BREAKDOWN_CONFIG[type];
  const discount = activeModifiers(state).maintenanceFactor;
  const cost = Math.round(cfg.repairCost * discount);
  if (state.credits < cost) return { state, ok: false, reason: 'insufficient-credits' };
  const next = structuredClone(state);
  next.credits -= cost;
  const mm = next.machines[machineId];
  mm.state = 'repairing';
  mm.repairTimeLeft = breakdownRepairTime(type);
  mm.totalRepairCost += cost;
  next.stats.repairCost += cost;
  next.stats.repairCount += 1;
  pushLog(next, 'repair', `Repairing ${MACHINE_CONFIG[machineId].name} (${cfg.label}) — ${cost} cr`);
  return { ok: true, state: next };
}

export function setGameSpeed(state: FactoryState, speed: 1 | 2 | 3): FactoryState {
  return { ...state, settings: { ...state.settings, gameSpeed: speed } };
}

/** Select the chassis material applied to future orders. */
export function setMaterial(state: FactoryState, material: MaterialId): FactoryState {
  if (!MATERIAL_ORDER.includes(material)) return state;
  return { ...state, settings: { ...state.settings, material } };
}

/** Toggle UI cue sounds. */
export function setSound(state: FactoryState, on: boolean): FactoryState {
  return { ...state, settings: { ...state.settings, sound: on } };
}

/** Pause/resume the simulation clock (space bar / pause button). */
export function setPaused(state: FactoryState, paused: boolean): FactoryState {
  return { ...state, settings: { ...state.settings, paused } };
}

/** Toggle a machine's overclock: +25% speed but heat builds twice as fast. */
export function setOverclock(state: FactoryState, machineId: MachineId, on: boolean): FactoryState {
  const m = state.machines[machineId];
  if (m.overclock === on) return state;
  const next = structuredClone(state);
  const mm = next.machines[machineId];
  mm.overclock = on;
  pushLog(next, 'info', `${MACHINE_CONFIG[machineId].name} ${on ? 'overclocked' : 'back to normal'}`);
  return next;
}

/**
 * Vent heat on demand for a small fee. Soft-lock insurance and active heat
 * management: fewer breakdowns when you're running long and hot.
 */
export function emergencyCool(state: FactoryState, machineId: MachineId): ActionResult {
  const m = state.machines[machineId];
  if (m.heat < EMERGENCY_COOL_MIN_HEAT) return { state, ok: false, reason: 'not-hot' };
  if (state.credits < EMERGENCY_COOL_COST) {
    return { state, ok: false, reason: 'insufficient-credits' };
  }
  const next = structuredClone(state);
  next.credits -= EMERGENCY_COOL_COST;
  next.stats.coolSpend += EMERGENCY_COOL_COST;
  const mm = next.machines[machineId];
  mm.heat = 0;
  pushLog(next, 'info', `${MACHINE_CONFIG[machineId].name} emergency-cooled — ${EMERGENCY_COOL_COST} cr`);
  return { ok: true, state: next };
}

/**
 * Salvage the work-in-progress on a downed machine, refunding a fraction of
 * its order cost. This is the soft-lock escape hatch: when a machine breaks
 * and you can't cover the repair, scrap the stuck job to raise credits.
 */
export function salvage(state: FactoryState, machineId: MachineId): ActionResult {
  const m = state.machines[machineId];
  const broken = m.state === 'broken' || m.state === 'overheated';
  if (!broken) return { state, ok: false, reason: 'not-broken' };
  if (!m.currentJob) return { state, ok: false, reason: 'no-job' };
  const next = structuredClone(state);
  const mm = next.machines[machineId];
  const job = mm.currentJob;
  if (!job) return { state, ok: false, reason: 'no-job' };
  const refund = Math.round(job.costPaid * SALVAGE_FRACTION);
  mm.currentJob = null;
  mm.progress = 0;
  next.credits += refund;
  next.stats.refundsReceived += refund;
  pushLog(
    next,
    'economy',
    `Salvaged ${ROBOT_CONFIG[job.type].name} #${job.serial} from ${MACHINE_CONFIG[machineId].name} — recovered ${refund} cr`,
  );
  return { ok: true, state: next };
}

/** Pay to end a negative event early (e.g. power surge, material shortage). */
export function buyOutEvent(state: FactoryState, eventId: number): ActionResult {
  const idx = state.events.findIndex((e) => e.id === eventId);
  if (idx < 0) return { state, ok: false, reason: 'out-of-range' };
  if (!BUYOUTABLE_EVENTS.includes(state.events[idx].type)) {
    return { state, ok: false, reason: 'not-buyable' };
  }
  if (state.credits < EVENT_EFFECT.buyoutCost) {
    return { state, ok: false, reason: 'insufficient-credits' };
  }
  const next = structuredClone(state);
  const [ev] = next.events.splice(idx, 1);
  next.credits -= EVENT_EFFECT.buyoutCost;
  next.stats.buyoutSpend += EVENT_EFFECT.buyoutCost;
  pushLog(
    next,
    'success',
    `Paid ${EVENT_EFFECT.buyoutCost} cr to end ${EVENT_CONFIG[ev.type].label} early`,
  );
  return { ok: true, state: next };
}