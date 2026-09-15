import { MACHINE_CONFIG, MACHINE_ORDER } from './config';
import type { FactoryState, MachineId, MachineStatus } from './types';

/** Units per second a machine currently produces: baseRate * level. */
export function throughput(state: FactoryState, id: MachineId): number {
  const machine = state.machines[id];
  return MACHINE_CONFIG[id].baseRate * machine.level;
}

/** Credits required for the machine's next upgrade. Strictly increases with level. */
export function upgradeCost(state: FactoryState, id: MachineId): number {
  const cfg = MACHINE_CONFIG[id];
  const level = state.machines[id].level;
  return Math.round(cfg.baseUpgradeCost * Math.pow(cfg.costGrowth, level - 1));
}

/**
 * Cumulative downstream input-per-output product from the stage AFTER `id`
 * through to shipped robots. Converts a stage's output rate into
 * shipped-robot-equivalents per second so rates are commensurable.
 */
function downstreamFactor(id: MachineId): number {
  const idx = MACHINE_ORDER.indexOf(id);
  let factor = 1;
  for (let i = idx + 1; i < MACHINE_ORDER.length; i++) {
    factor *= MACHINE_CONFIG[MACHINE_ORDER[i]].inputPerOutput;
  }
  return factor;
}

/**
 * A stage's rate normalised into shipped-robot-equivalents per second:
 * raw throughput divided by the cumulative input-per-output product of all
 * downstream stages. Fabricator level 1 = 2.0 comp/s = 1.0 robot-equiv/s
 * (assembler consumes 2 components per robot).
 */
export function robotEquivalentRate(state: FactoryState, id: MachineId): number {
  return throughput(state, id) / downstreamFactor(id);
}

/**
 * All stages whose robot-equivalent rate equals the line minimum — the
 * co-limiting set. When several stages tie (e.g. fabricator and assembler
 * both at 1.00 robot-equiv/s), NO single upgrade increases production: the
 * UI must flag every tied stage so the player sees that the stages must be
 * upgraded together. Ties resolve to MACHINE_ORDER order. Pure, deterministic.
 */
export function detectBottlenecks(state: FactoryState): MachineId[] {
  const lowestRate = lineThroughput(state);
  return MACHINE_ORDER.filter(
    (id) => robotEquivalentRate(state, id) <= lowestRate + 1e-9,
  );
}

/**
 * The single machine that limits overall production: the earliest stage in
 * MACHINE_ORDER at the lowest robot-equivalent rate. Where several stages
 * tie, this returns only the first — use `detectBottlenecks` when the UI
 * needs the full co-limiting set. Never random. Pure.
 */
export function detectBottleneck(state: FactoryState): MachineId {
  return detectBottlenecks(state)[0];
}

/**
 * What the line actually ships, in robots per second: the minimum
 * robot-equivalent rate across all stages. This — not any single machine's
 * raw throughput — is the honest "production" number for the UI.
 */
export function lineThroughput(state: FactoryState): number {
  return Math.min(...MACHINE_ORDER.map((id) => robotEquivalentRate(state, id)));
}

/**
 * Derived display status: every co-limiting machine is flagged BOTTLENECK;
 * otherwise a machine is RUNNING if it moved units on the last tick, WAITING
 * if starved.
 */
export function machineStatus(state: FactoryState, id: MachineId): MachineStatus {
  if (detectBottlenecks(state).includes(id)) return 'BOTTLENECK';
  return state.machines[id].active ? 'RUNNING' : 'WAITING';
}

/**
 * Normalized 0..1 pressure on the input buffer feeding `stageId`: buffer
 * stock relative to the stage's current input demand. 1 = fully fed. The
 * first stage draws from unlimited raw material, so it always reports 1.
 */
export function bufferPressure(state: FactoryState, stageId: MachineId): number {
  const idx = MACHINE_ORDER.indexOf(stageId);
  if (idx <= 0) return 1;
  const cfg = MACHINE_CONFIG[stageId];
  const upstreamOutput = MACHINE_CONFIG[MACHINE_ORDER[idx - 1]].output;
  const buffer =
    upstreamOutput === 'components' ? state.components : state.unfinishedRobots;
  const demand = throughput(state, stageId) * cfg.inputPerOutput;
  return Math.min(1, buffer / Math.max(demand, 1));
}
