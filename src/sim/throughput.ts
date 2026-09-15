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
 * The machine that limits overall production: the lowest-throughput stage.
 * Ties resolve to the earliest stage in the line. Never random.
 */
export function detectBottleneck(state: FactoryState): MachineId {
  let lowest: MachineId = MACHINE_ORDER[0];
  let lowestRate = Infinity;
  for (const id of MACHINE_ORDER) {
    const rate = throughput(state, id);
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
