import { CREDITS_PER_ROBOT, MACHINE_CONFIG, MACHINE_ORDER, STARTING_CREDITS } from './config';
import { detectBottleneck, detectBottlenecks, lineThroughput, throughput, upgradeCost } from './throughput';
import type { FactoryState, MachineId, MachineState, UpgradeResult } from './types';

function initialMachine(id: MachineId): MachineState {
  return { id, level: 1, progress: 0, active: false };
}

/** Single source of truth for the starting factory. */
export function createInitialState(): FactoryState {
  return {
    credits: STARTING_CREDITS,
    rawConsumed: 0,
    components: 0,
    unfinishedRobots: 0,
    robotsShipped: 0,
    machines: {
      fabricator: initialMachine('fabricator'),
      assembler: initialMachine('assembler'),
      finisher: initialMachine('finisher'),
    },
  };
}

/**
 * Reset returns a fresh initial state (same values as createInitialState).
 * The incoming state is intentionally ignored; the parameter exists so
 * resetState can be used directly as a React setState updater, which always
 * passes the previous state.
 */
export function resetState(_state: FactoryState): FactoryState {
  return createInitialState();
}

/**
 * Advance the factory by dtSeconds. Pure and deterministic: same state + same dt
 * always yields the same result. No timers, no randomness, no React.
 *
 * Each stage consumes only what its input buffer held at the START of the tick,
 * so a slow upstream machine genuinely starves the stages below it and work
 * visibly flows down the line one stage per tick.
 */
export function tick(state: FactoryState, dtSeconds: number): FactoryState {
  const dt = Math.max(0, dtSeconds);
  const next: FactoryState = {
    ...state,
    rawConsumed: state.rawConsumed,
    components: state.components,
    unfinishedRobots: state.unfinishedRobots,
    robotsShipped: state.robotsShipped,
    credits: state.credits,
    machines: { ...state.machines },
  };

  // Snapshot inputs available at the start of the tick.
  let componentsAvailable = state.components;
  let unfinishedAvailable = state.unfinishedRobots;

  for (const id of MACHINE_ORDER) {
    const cfg = MACHINE_CONFIG[id];
    const machine = state.machines[id];
    const rate = cfg.baseRate * machine.level; // units per second
    const produced = rate * dt;

    // Animation phase for the machine pulse (0..1), independent of buffers.
    const progress = (machine.progress + produced) % 1;

    let moved = 0;
    switch (cfg.output) {
      case 'components':
        // Raw materials are unlimited.
        moved = produced;
        next.components += moved;
        next.rawConsumed += moved * cfg.inputPerOutput;
        break;
      case 'unfinishedRobots': {
        const affordable = componentsAvailable / cfg.inputPerOutput;
        moved = Math.min(produced, affordable);
        next.components -= moved * cfg.inputPerOutput;
        componentsAvailable -= moved * cfg.inputPerOutput;
        next.unfinishedRobots += moved;
        break;
      }
      case 'shipped': {
        const affordable = unfinishedAvailable / cfg.inputPerOutput;
        moved = Math.min(produced, affordable);
        next.unfinishedRobots -= moved * cfg.inputPerOutput;
        unfinishedAvailable -= moved * cfg.inputPerOutput;
        next.robotsShipped += moved;
        next.credits += moved * CREDITS_PER_ROBOT;
        break;
      }
    }

    next.machines[id] = { ...machine, progress, active: moved > 0 };
  }

  return next;
}

/**
 * Buy the next upgrade for a machine. Enforced in the core: if credits are
 * insufficient the state is returned unchanged with ok=false.
 */
export function upgrade(state: FactoryState, id: MachineId): UpgradeResult {
  const cost = upgradeCost(state, id);
  if (state.credits < cost) {
    return { state, ok: false, reason: 'insufficient-credits' };
  }
  const machine = state.machines[id];
  return {
    ok: true,
    state: {
      ...state,
      credits: state.credits - cost,
      machines: {
        ...state.machines,
        [id]: { ...machine, level: machine.level + 1 },
      },
    },
  };
}

/** Re-export so UI and tests have one import site for the pure core. */
export { detectBottleneck, detectBottlenecks, lineThroughput, throughput, upgradeCost };
