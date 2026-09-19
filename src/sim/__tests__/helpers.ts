import { createInitialState, tick } from '../factory';
import { DEFAULT_MATERIAL } from '../config';
import { mulberry32 } from '../random';
import type { Rng } from '../random';
import type { FactoryState, Job, MachineId, RobotId } from '../types';

/** Run the simulation forward `seconds` at fixed dt. Deterministic. */
export function run(
  state: FactoryState,
  seconds: number,
  dt = 0.25,
  rng: Rng = () => 0.99,
): FactoryState {
  let s = state;
  const steps = Math.max(1, Math.round(seconds / dt));
  for (let i = 0; i < steps; i++) s = tick(s, dt, rng);
  return s;
}

/** A factory with effectively unlimited credits for behaviour tests. */
export function richState(overrides: { credits?: number; wallTime?: number } = {}): FactoryState {
  const s = createInitialState({ wallTime: overrides.wallTime ?? 0 });
  return { ...s, credits: overrides.credits ?? 1_000_000 };
}

/** Craft a Job without touching the factory's serial counters. */
let jobCounter = 0;
export function makeJob(type: RobotId, opts: Partial<Job> = {}): Job {
  jobCounter += 1;
  return {
    id: opts.id ?? jobCounter,
    type,
    serial: opts.serial ?? jobCounter,
    stage: opts.stage ?? 'fabricating',
    placedAt: opts.placedAt ?? 0,
    costPaid: opts.costPaid ?? 1,
    material: opts.material ?? DEFAULT_MATERIAL,
  };
}

/** Force a machine into the middle of a job (bypasses ordering the queue). */
export function machineMidJob(
  state: FactoryState,
  id: MachineId,
  job: Job,
  progress = 0.5,
): FactoryState {
  const m = state.machines[id];
  const next = structuredClone(state);
  next.machines[id] = { ...m, currentJob: job, progress, state: 'processing' };
  return next;
}

/** Set machine upgrades directly (bypasses costs). */
export function withUpgrades(
  state: FactoryState,
  id: MachineId,
  upgrades: { speed?: number; reliability?: number; special?: number },
): FactoryState {
  const next = structuredClone(state);
  const m = next.machines[id];
  next.machines[id] = {
    ...m,
    upgrades: {
      speed: upgrades.speed ?? m.upgrades.speed,
      reliability: upgrades.reliability ?? m.upgrades.reliability,
      special: upgrades.special ?? m.upgrades.special,
    },
  };
  return next;
}

/** Deterministic seedable runs for determinism tests. */
export function seededRun(
  state: FactoryState,
  seconds: number,
  seed: number,
  dt = 0.5,
): FactoryState {
  return run(state, seconds, dt, mulberry32(seed));
}

export type { FactoryState };
export { createInitialState };