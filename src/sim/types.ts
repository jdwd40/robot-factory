export type MachineId = 'fabricator' | 'assembler' | 'finisher';

export type MachineStatus = 'RUNNING' | 'WAITING' | 'BOTTLENECK';

export interface MachineState {
  id: MachineId;
  level: number;
  /** Fractional work accumulator for this stage's current unit of output. */
  progress: number;
  /** Whether the machine produced at least one unit during the last tick. */
  active: boolean;
}

export interface FactoryState {
  credits: number;
  /** Unbounded raw material supply; tracked for display only. */
  rawConsumed: number;
  components: number;
  unfinishedRobots: number;
  robotsShipped: number;
  machines: Record<MachineId, MachineState>;
}

export interface UpgradeResult {
  state: FactoryState;
  ok: boolean;
  reason?: 'insufficient-credits';
}
