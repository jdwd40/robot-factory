import type { MachineId } from './types';

export interface MachineConfig {
  id: MachineId;
  name: string;
  /** Units produced per second at level 1. */
  baseRate: number;
  /** Credits needed for the level 1 → 2 upgrade. */
  baseUpgradeCost: number;
  /** Next cost = round(baseUpgradeCost * costGrowth ** level). */
  costGrowth: number;
  /** Input units consumed per unit of output (from the previous buffer). */
  inputPerOutput: number;
  /** Buffer this machine outputs into. */
  output: 'components' | 'unfinishedRobots' | 'shipped';
}

export const MACHINE_ORDER: readonly MachineId[] = ['fabricator', 'assembler', 'finisher'];

export const MACHINE_CONFIG: Record<MachineId, MachineConfig> = {
  fabricator: {
    id: 'fabricator',
    name: 'Fabricator',
    baseRate: 2.0,
    baseUpgradeCost: 50,
    costGrowth: 1.6,
    inputPerOutput: 2, // 2 raw units per component
    output: 'components',
  },
  assembler: {
    id: 'assembler',
    name: 'Assembler',
    baseRate: 1.0,
    baseUpgradeCost: 75,
    costGrowth: 1.6,
    inputPerOutput: 2, // 2 components per unfinished robot
    output: 'unfinishedRobots',
  },
  finisher: {
    id: 'finisher',
    name: 'Finisher',
    baseRate: 0.8,
    baseUpgradeCost: 100,
    costGrowth: 1.6,
    inputPerOutput: 1, // 1 unfinished robot per shipped robot
    output: 'shipped',
  },
};

export const CREDITS_PER_ROBOT = 10;
export const STARTING_CREDITS = 120;
