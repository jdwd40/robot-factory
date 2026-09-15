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
 * The machine that limits overall production: the lowest
 * shipped-robot-equivalent rate. Ties resolve to the earliest stage in the
 * line. Never random. Pure.
 */
export function detectBottleneck(state: FactoryState): MachineId {
  let lowest: MachineId = MACHINE_ORDER[0];
  let lowestRate = Infinity;
  for (const id of MACHINE_ORDER) {
    const rate = robotEquivalentRate(state, id);
    if (rate < lowestRate) {
      lowestRate = rate;
      lowest = id;
    }
  }
  return lowest;
}

/**
 * Derived display status: the bottleneck machine is always flagged; otherwise a
 * machine is RUNNING if it moved units on the last tick, WAITING if starved.
 */
export function machineStatus(state: FactoryState, id: MachineId): MachineStatus {
  if (detectBottleneck(state) === id) return 'BOTTLENECK';
  return state.machines[id].active ? 'RUNNING' : 'WAITING';
}
