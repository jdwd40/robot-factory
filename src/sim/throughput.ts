import { MACHINE_CONFIG, MACHINE_ORDER, ROBOT_CONFIG } from './config';
import { speedMultiplier, stageDuration } from './economy';
import { activeModifiers } from './modifiers';
import type { FactoryState, MachineId, MaterialId, RobotId } from './types';

export interface BottleneckInfo {
  id: MachineId | null;
  /** Jobs waiting right now (buffer + current). */
  inputQueue: number;
  /** Estimated seconds a fresh unit waits before this machine processes it. */
  avgWait: number;
  /** Recent busy fraction (EMA), 0..1. */
  utilisation: number;
}

/** Effective processing speed multiplier for a machine right now. */
export function machineSpeedFactor(state: FactoryState, id: MachineId): number {
  const m = state.machines[id];
  const mods = activeModifiers(state);
  const surge = mods.speedFactor;
  const shortage = id === 'fabricator' ? mods.fabricationFactor : 1;
  return speedMultiplier(m.upgrades.speed) * surge * (id === 'fabricator' ? 1 / shortage : 1);
}

/** Mean stage duration (seconds at L1) for whatever is waiting on a machine. */
export function meanStageTime(state: FactoryState, id: MachineId): number {
  const m = state.machines[id];
  const jobs: { type: RobotId; material: MaterialId }[] = [];
  if (m.currentJob) jobs.push(m.currentJob);
  jobs.push(...m.inputBuffer);
  if (jobs.length === 0) {
    // No work: report the machine's typical job length.
    const avg = (t: RobotId) =>
      (ROBOT_CONFIG[t].fabricateTime + ROBOT_CONFIG[t].assembleTime + ROBOT_CONFIG[t].finishTime) / 3;
    return (avg('worker') + avg('explorer') + avg('combat')) / 3;
  }
  const sum = jobs.reduce((acc, j) => acc + stageDuration(id, j.type, j.material), 0);
  return sum / jobs.length;
}

/** Estimated jobs per second this machine currently handles. */
export function machineRate(state: FactoryState, id: MachineId): number {
  const factor = machineSpeedFactor(state, id);
  return factor / Math.max(meanStageTime(state, id), 1e-6);
}

/** Estimated seconds until the machine's current job leaves it. */
export function jobEta(state: FactoryState, id: MachineId): number | null {
  const m = state.machines[id];
  if (!m.currentJob) return null;
  const time = stageDuration(id, m.currentJob.type, m.currentJob.material);
  const factor = machineSpeedFactor(state, id);
  return Math.max(0, ((1 - m.progress) * time) / factor);
}

/** Utilisation fraction over the run (lifetime), 0..1. */
export function lifetimeUptime(state: FactoryState, id: MachineId): number {
  const m = state.machines[id];
  if (state.elapsed <= 0) return 0;
  return m.totalActiveSeconds / state.elapsed;
}

/**
 * Real-workload bottleneck detection. Scores machines by the work actually
 * stacked in front of them (backlog × busy fraction) and estimates wait time
 * from their live processing rate — not from configured speeds. Idle or
 * starved machines are never flagged, so an empty line reports no bottleneck.
 */
export function detectBottleneck(state: FactoryState): BottleneckInfo {
  let best: BottleneckInfo = { id: null, inputQueue: 0, avgWait: 0, utilisation: 0 };
  let bestScore = 0;
  for (const id of MACHINE_ORDER) {
    const m = state.machines[id];
    // The Fabricator's backlog is the player's order queue (unbounded), not
    // its input buffer — include it so bottleneck detection sees real pressure.
    const waiting = id === 'fabricator' ? state.orders.length : m.inputBuffer.length;
    const inputQueue = waiting + (m.currentJob ? 1 : 0);
    const utilisation = m.activeEma;
    const rate = machineRate(state, id);
    const avgWait = inputQueue > 0 ? inputQueue / Math.max(rate, 1e-6) : 0;
    const score = inputQueue * Math.max(utilisation, 0.1);
    if (inputQueue > 0 && utilisation > 0.12 && score > bestScore) {
      bestScore = score;
      best = { id, inputQueue, avgWait, utilisation };
    }
  }
  return best;
}

/** Human-readable description of the active bottleneck for the stats panel. */
export function bottleneckLabel(state: FactoryState): string {
  const b = detectBottleneck(state);
  if (!b.id) return 'None';
  return `${MACHINE_CONFIG[b.id].name} · ${b.inputQueue} queued · ${Math.round(b.utilisation * 100)}% util`;
}