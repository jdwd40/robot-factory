import { useCallback, useEffect, useState } from 'react';
import { createInitialState, resetState, tick, upgrade } from '../sim/factory';
import type { FactoryState, MachineId } from '../sim/types';

export interface FactoryApi {
  state: FactoryState;
  /** Attempt an upgrade. The core enforces affordability; no-ops if refused. */
  upgrade: (id: MachineId) => void;
  reset: () => void;
}

/**
 * The ONLY impure part of the app: a requestAnimationFrame loop that advances
 * the pure simulation core with real elapsed time. All rules live in src/sim.
 */
export function useFactory(): FactoryApi {
  const [state, setState] = useState<FactoryState>(createInitialState);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.25); // clamp tab-switch jumps
      last = now;
      setState((prev) => tick(prev, dt));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const upgradeMachine = useCallback((id: MachineId) => {
    setState((prev) => upgrade(prev, id).state);
  }, []);

  const reset = useCallback(() => {
    setState((prev) => resetState(prev));
  }, []);

  return { state, upgrade: upgradeMachine, reset };
}
