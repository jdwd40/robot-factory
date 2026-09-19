export type MachineId = 'fabricator' | 'assembler' | 'finisher';

export type RobotId = 'worker' | 'explorer' | 'combat';

export type MaterialId = 'chrome' | 'alloy' | 'carbon';

export type UpgradeTrack = 'speed' | 'reliability' | 'special';

export type MachineStateType =
  | 'idle'
  | 'processing'
  | 'waiting'
  | 'blocked'
  | 'overheated'
  | 'broken'
  | 'repairing';

export type BreakdownType = 'overheating' | 'jam' | 'component-failure' | 'power-issue';

export type EventType =
  | 'power-surge'
  | 'bulk-order'
  | 'perfect-assembly'
  | 'maintenance-discount'
  | 'material-shortage';

export type LogKind =
  | 'info'
  | 'production'
  | 'economy'
  | 'upgrade'
  | 'repair'
  | 'warning'
  | 'error'
  | 'success'
  | 'event';

export type JobStage = 'queued' | 'fabricating' | 'assembling' | 'finishing' | 'shipped';

/** The three upgrade tracks every machine carries; UI order fixed. */
export interface UpgradeLevels {
  speed: number;
  reliability: number;
  special: number;
}

/**
 * A discrete production unit with a robot type and serial. Owns its own cost
 * (locked when ordered, so later material-efficiency upgrades never rewrite
 * past orders) and travels the line job-by-job.
 */
export interface Job {
  id: number;
  type: RobotId;
  serial: number;
  stage: JobStage;
  /** In-game seconds when the order was placed. */
  placedAt: number;
  /** Credits actually paid when the order was placed. */
  costPaid: number;
  /** Chassis material chosen at order time; locked with the order. */
  material: MaterialId;
}

export interface RobotRequirement {
  machine: MachineId;
  track: UpgradeTrack;
  level: number;
}

/**
 * One machine on the floor. Every machine owns its own timer, progress, heat,
 * reliability, upgrade levels and input buffer, so genuine bottlenecks arise
 * from real workload imbalance.
 */
export interface MachineState {
  id: MachineId;
  upgrades: UpgradeLevels;
  state: MachineStateType;
  /** 0..1 progress into the current job. */
  progress: number;
  currentJob: Job | null;
  /** Jobs waiting for this machine. The Fabricator's source is state.orders. */
  inputBuffer: Job[];
  /** Overclocked: +25% speed but heat builds twice as fast. */
  overclock: boolean;
  breakdownType: BreakdownType | null;
  /** Seconds of repair work remaining. */
  repairTimeLeft: number;
  /** Accumulated heat 0..1.2; raises failure chance while processing. */
  heat: number;
  totalActiveSeconds: number;
  totalJobsCompleted: number;
  totalBreakdowns: number;
  totalRepairCost: number;
  totalUpgradeSpend: number;
  /** Exponential moving average of busy fraction (utilisation). */
  activeEma: number;
  /** EMA of pending input workload (buffer + current). */
  queueEma: number;
}

export interface ActiveEvent {
  id: number;
  type: EventType;
  /** Seconds remaining. */
  remaining: number;
  startedAt: number;
  /** Bulk orders use data[0] = target, data[1] = produced so far. */
  data: number[];
}

export interface FactoryStats {
  robotsShipped: number;
  byType: Record<RobotId, number>;
  byTypeRevenue: Record<RobotId, number>;
  byTypeProfit: Record<RobotId, number>;
  /** Shipped counts grouped by chassis material. */
  byMaterial: Record<MaterialId, number>;
  revenue: number;
  profit: number;
  /** Total credits spent placing orders. */
  costPaid: number;
  repairCost: number;
  repairCount: number;
  upgradeSpend: number;
  upgradeCount: number;
  breakdowns: number;
  eventsTriggered: number;
  eventsFulfilled: number;
  /** Running mean of ship time (order placed → shipped), seconds. */
  avgBuildTime: number;
  buildSamples: number;
  /** EMA of robots shipped per second (recent throughput). */
  rateEma: number;
  lastShipElapsed: number;
  lastShipValue: number;
}

export interface LogEntry {
  id: number;
  elapsed: number;
  kind: LogKind;
  message: string;
}

export interface Settings {
  /** Simulation speed multiplier: 1x, 2x or 3x. */
  gameSpeed: 1 | 2 | 3;
  /** True when the sim is halted (spaces key / pause button). */
  paused: boolean;
  /** Chassis material applied to the next orders. */
  material: MaterialId;
  /** UI cue sounds (WebAudio) enabled. */
  sound: boolean;
}

export interface FactoryState {
  version: number;
  /** Total in-game seconds simulated. */
  elapsed: number;
  credits: number;
  nextJobId: number;
  nextEventId: number;
  lastLogId: number;
  nextSerial: Record<RobotId, number>;
  /** Seconds until the logistics office next considers an event. */
  nextEventIn: number;
  /** Wall-clock epoch the run started at (display only). */
  startedAtWall: number;
  /** The player's production queue — the Fabricator's pending work. */
  orders: Job[];
  machines: Record<MachineId, MachineState>;
  events: ActiveEvent[];
  stats: FactoryStats;
  log: LogEntry[];
  settings: Settings;
}

export interface ActionResult {
  state: FactoryState;
  ok: boolean;
  reason?:
    | 'insufficient-credits'
    | 'requirement'
    | 'max-level'
    | 'not-broken'
    | 'not-queued'
    | 'out-of-range'
    | 'queue-full'
    | 'no-job'
    | 'not-hot'
    | 'not-buyable';
}