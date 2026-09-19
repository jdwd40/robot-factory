import type {
  BreakdownType,
  EventType,
  MachineId,
  MaterialId,
  RobotId,
  RobotRequirement,
  UpgradeTrack,
} from './types';

export const MACHINE_ORDER: readonly MachineId[] = ['fabricator', 'assembler', 'finisher'];

export const ROBOT_ORDER: readonly RobotId[] = ['worker', 'explorer', 'combat'];

export const MATERIAL_ORDER: readonly MaterialId[] = ['chrome', 'alloy', 'carbon'];

export const UPGRADE_TRACKS_ORDER: readonly UpgradeTrack[] = ['speed', 'reliability', 'special'];

export const JOB_STAGES = ['queued', 'fabricating', 'assembling', 'finishing', 'shipped'] as const;

export const MACHINE_STATES = [
  'idle',
  'processing',
  'waiting',
  'blocked',
  'overheated',
  'broken',
  'repairing',
] as const;

export const BREAKDOWN_TYPES = ['overheating', 'jam', 'component-failure', 'power-issue'] as const;

export const EVENT_TYPES = [
  'power-surge',
  'bulk-order',
  'perfect-assembly',
  'maintenance-discount',
  'material-shortage',
] as const;

export const LOG_KINDS = [
  'info',
  'production',
  'economy',
  'upgrade',
  'repair',
  'warning',
  'error',
  'success',
  'event',
] as const;

export const STARTING_CREDITS = 200;
export const SAVE_VERSION = 1;
export const MAX_LOG_ENTRIES = 140;
export const MAX_UPGRADE_LEVEL = 8;
/** Hard cap on queued (not-yet-fabricated) orders, in the player's queue. */
export const MAX_ORDER_QUEUE = 60;
/** Fraction of an order's costPaid refunded when salvaging a stuck WIP job. */
export const SALVAGE_FRACTION = 0.5;
/** Cost of an emergency-cool (vent heat on demand). */
export const EMERGENCY_COOL_COST = 12;
/** Machines hotter than this can be emergency-cooled. */
export const EMERGENCY_COOL_MIN_HEAT = 0.6;

/* ---------- Chassis materials ---------- */

export interface MaterialConfig {
  id: MaterialId;
  name: string;
  color: string;
  blurb: string;
  /** Order cost multiplier. */
  costMult: number;
  /** Build-time multiplier applied to every machine stage. */
  timeMult: number;
  /** Sale-price multiplier. */
  saleMult: number;
  /** Machine upgrades required before this material can be selected. */
  requires: RobotRequirement[];
}

export const MATERIAL_CONFIG: Record<MaterialId, MaterialConfig> = {
  chrome: {
    id: 'chrome',
    name: 'Chrome',
    color: '#9fb4c7',
    blurb: 'Standard chassis. No frills.',
    costMult: 1,
    timeMult: 1,
    saleMult: 1,
    requires: [],
  },
  alloy: {
    id: 'alloy',
    name: 'Alloy',
    color: '#d8a24a',
    blurb: 'Reinforced frame, +25% sale value.',
    costMult: 1.5,
    timeMult: 1.3,
    saleMult: 1.25,
    requires: [{ machine: 'fabricator', track: 'reliability', level: 2 }],
  },
  carbon: {
    id: 'carbon',
    name: 'Carbon',
    color: '#c28ff0',
    blurb: 'Ultra-light weave, near-luxury resale.',
    costMult: 2,
    timeMult: 1.7,
    saleMult: 1.6,
    requires: [
      { machine: 'fabricator', track: 'speed', level: 4 },
      { machine: 'assembler', track: 'speed', level: 3 },
    ],
  },
};

export const DEFAULT_MATERIAL: MaterialId = 'chrome';

/* ---------- Robot models ---------- */

export interface RobotConfig {
  id: RobotId;
  name: string;
  tagline: string;
  /** Accent colour used for tokens/icons. */
  color: string;
  /** Seconds the machine takes at speed level 1. */
  fabricateTime: number;
  assembleTime: number;
  finishTime: number;
  /** Portion of order cost spent on raw material (affected by efficiency). */
  materialCost: number;
  /** Portion of order cost that is fixed labour. */
  laborCost: number;
  /** Base sale value at human finisher, before quality tuning. */
  salePrice: number;
  /** Machine upgrades required before this model can be ordered. */
  requires: RobotRequirement[];
}

export const ROBOT_CONFIG: Record<RobotId, RobotConfig> = {
  worker: {
    id: 'worker',
    name: 'Worker Bot',
    tagline: 'Steady general-purpose labourer',
    color: '#6fbf73',
    fabricateTime: 8,
    assembleTime: 7,
    finishTime: 6,
    materialCost: 22,
    laborCost: 8,
    salePrice: 55,
    requires: [],
  },
  explorer: {
    id: 'explorer',
    name: 'Explorer Bot',
    tagline: 'Long-range recon & surveying',
    color: '#5aa8e0',
    fabricateTime: 10,
    assembleTime: 9,
    finishTime: 7,
    materialCost: 40,
    laborCost: 15,
    salePrice: 115,
    requires: [{ machine: 'fabricator', track: 'speed', level: 2 }],
  },
  combat: {
    id: 'combat',
    name: 'Combat Bot',
    tagline: 'Heavy-frame tactical model',
    color: '#e0645a',
    fabricateTime: 13,
    assembleTime: 11,
    finishTime: 9,
    materialCost: 70,
    laborCost: 25,
    salePrice: 205,
    requires: [
      { machine: 'fabricator', track: 'speed', level: 2 },
      { machine: 'assembler', track: 'speed', level: 2 },
    ],
  },
};

/* ---------- Machines ---------- */

export interface MachineConfig {
  id: MachineId;
  name: string;
  role: string;
  /** Base failure attempts per second of processing at reliability L1. */
  breakdownRate: number;
  /** Heat added per second of processing. */
  heatRate: number;
  /** Input buffer capacity; null = unbounded (player-managed queue). */
  baseCapacity: number | null;
}

export const MACHINE_CONFIG: Record<MachineId, MachineConfig> = {
  fabricator: {
    id: 'fabricator',
    name: 'Fabricator',
    role: 'Prints components from raw stock',
    breakdownRate: 0.0022,
    heatRate: 0.01,
    baseCapacity: null,
  },
  assembler: {
    id: 'assembler',
    name: 'Assembler',
    role: 'Fits components into a chassis',
    breakdownRate: 0.0016,
    heatRate: 0.008,
    baseCapacity: 6,
  },
  finisher: {
    id: 'finisher',
    name: 'Finisher',
    role: 'Calibrates, packs & ships',
    breakdownRate: 0.0012,
    heatRate: 0.006,
    baseCapacity: 8,
  },
};

/* ---------- Upgrade tracks ---------- */

export interface UpgradeTrackConfig {
  track: UpgradeTrack;
  name: string;
  blurb: string;
  baseCost: number;
  /** Next cost = round(baseCost * grow^(level-1)). */
  grow: number;
}

export const UPGRADE_TRACKS: Record<MachineId, Record<UpgradeTrack, UpgradeTrackConfig>> = {
  fabricator: {
    speed: {
      track: 'speed',
      name: 'Speed',
      blurb: '+50% fabrication speed per level',
      baseCost: 45,
      grow: 1.9,
    },
    reliability: {
      track: 'reliability',
      name: 'Reliability',
      blurb: '≈40% fewer failures per level',
      baseCost: 60,
      grow: 1.8,
    },
    special: {
      track: 'special',
      name: 'Material Efficiency',
      blurb: 'Orders consume 7% less material per level',
      baseCost: 55,
      grow: 1.85,
    },
  },
  assembler: {
    speed: {
      track: 'speed',
      name: 'Speed',
      blurb: '+50% assembly speed per level',
      baseCost: 55,
      grow: 1.9,
    },
    reliability: {
      track: 'reliability',
      name: 'Reliability',
      blurb: '≈40% fewer failures per level',
      baseCost: 70,
      grow: 1.8,
    },
    special: {
      track: 'special',
      name: 'Parallel Bays',
      blurb: '+2 input slots per level',
      baseCost: 65,
      grow: 1.85,
    },
  },
  finisher: {
    speed: {
      track: 'speed',
      name: 'Speed',
      blurb: '+50% finishing speed per level',
      baseCost: 65,
      grow: 1.9,
    },
    reliability: {
      track: 'reliability',
      name: 'Reliability',
      blurb: '≈40% fewer failures per level',
      baseCost: 80,
      grow: 1.8,
    },
    special: {
      track: 'special',
      name: 'Quality Tuning',
      blurb: 'Robots sell for +4% per level',
      baseCost: 70,
      grow: 1.85,
    },
  },
};

/* ---------- Breakdowns ---------- */

export interface BreakdownConfig {
  type: BreakdownType;
  label: string;
  /** Log verb, e.g. "jam — needs maintenance". */
  verb: string;
  repairCost: number;
  repairTime: number;
  weight: number;
}

export const BREAKDOWN_CONFIG: Record<BreakdownType, BreakdownConfig> = {
  overheating: {
    type: 'overheating',
    label: 'Overheating',
    verb: 'overheated',
    repairCost: 20,
    repairTime: 8,
    weight: 0.3,
  },
  jam: {
    type: 'jam',
    label: 'Mechanical Jam',
    verb: 'jammed up',
    repairCost: 48,
    repairTime: 16,
    weight: 0.3,
  },
  'component-failure': {
    type: 'component-failure',
    label: 'Component Failure',
    verb: 'lost a critical component',
    repairCost: 90,
    repairTime: 26,
    weight: 0.2,
  },
  'power-issue': {
    type: 'power-issue',
    label: 'Power Issue',
    verb: 'dipped on power supply',
    repairCost: 70,
    repairTime: 14,
    weight: 0.2,
  },
};

export const BREAKDOWN_WEIGHTS: ReadonlyArray<readonly [BreakdownType, number]> = [
  ['overheating', 0.3],
  ['jam', 0.3],
  ['component-failure', 0.2],
  ['power-issue', 0.2],
];

/* ---------- Random factory events ---------- */

export interface EventConfig {
  type: EventType;
  label: string;
  blurb: string;
  duration: number;
  weight: number;
}

export const EVENT_CONFIG: Record<EventType, EventConfig> = {
  'power-surge': {
    type: 'power-surge',
    label: 'Power Surge',
    blurb: 'Machine speeds halved',
    duration: 20,
    weight: 0.22,
  },
  'bulk-order': {
    type: 'bulk-order',
    label: 'Bulk Order',
    blurb: 'Ship the target robots in time for a bonus',
    duration: 60,
    weight: 0.24,
  },
  'perfect-assembly': {
    type: 'perfect-assembly',
    label: 'Perfect Assembly',
    blurb: 'Shipped robots sell for 50% more',
    duration: 35,
    weight: 0.18,
  },
  'maintenance-discount': {
    type: 'maintenance-discount',
    label: 'Maintenance Discount',
    blurb: 'Upgrades and repairs 30% cheaper',
    duration: 45,
    weight: 0.18,
  },
  'material-shortage': {
    type: 'material-shortage',
    label: 'Material Shortage',
    blurb: 'Fabrication runs 60% slower',
    duration: 30,
    weight: 0.18,
  },
};

export const EVENT_WEIGHTS: ReadonlyArray<readonly [EventType, number]> = [
  ['power-surge', 0.22],
  ['bulk-order', 0.24],
  ['perfect-assembly', 0.18],
  ['maintenance-discount', 0.18],
  ['material-shortage', 0.18],
];

/* ---------- Events / modifiers ---------- */

export const EVENT_FIRST_DELAY = 70;
export const EVENT_COOLDOWN_MIN = 55;
export const EVENT_COOLDOWN_JITTER = 60;
export const EVENT_TRIGGER_CHANCE = 0.65;

/**
 * The numeric effect of each event, centralised so the sim and the UI can
 * never drift apart. Booleans live in modifiers.ts; the magnitudes here.
 */
export const EVENT_EFFECT = {
  /** Power surge multiplier on machine speed (< 1 slows). */
  powerSurgeSpeed: 0.5,
  /** Material shortage multiplier on fabrication stage length (> 1 slower). */
  materialShortageFactor: 1.6,
  /** Perfect assembly sale bonus (>= 1). */
  perfectAssemblyBonus: 1.5,
  /** Maintenance discount multiplier on upgrade/repair cost (< 1 cheaper). */
  maintenanceDiscount: 0.7,
  /** Bulk-order bonus = fraction of the sale value shipped during the event. */
  bulkBonusFraction: 0.25,
  /** Cost to buy out a negative event early. */
  buyoutCost: 120,
} as const;

/** Negative events a player may pay to end immediately. */
export const BUYOUTABLE_EVENTS: readonly EventType[] = ['power-surge', 'material-shortage'];

/* ---------- Heat & overclocking ---------- */

export const HEAT_CAP = 1.2;
export const HEAT_COOL_RATE = 0.03;
/** Overclock: +25% processing speed, double heat build-up. */
export const OVERCLOCK_SPEED_MULT = 1.25;
export const OVERCLOCK_HEAT_MULT = 2;
/** UI heat thresholds (also drive the threat flag at 0.85). */
export const HEAT_WARM_AT = 0.55;
export const HEAT_HOT_AT = 0.9;
export const HEAT_THREAT_AT = 0.85;

/** EMA smoothing time constants (seconds). */
export const UTILISATION_TAU = 45;
export const RATE_TAU = 25;