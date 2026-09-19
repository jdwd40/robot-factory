import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addOrder as coreAddOrder,
  buyOutEvent as coreBuyOutEvent,
  cancelOrder as coreCancelOrder,
  emergencyCool as coreEmergencyCool,
  reorderOrder as coreReorderOrder,
  repair as coreRepair,
  resetState,
  salvage as coreSalvage,
  setGameSpeed,
  setMaterial as coreSetMaterial,
  setOverclock as coreSetOverclock,
  setPaused as coreSetPaused,
  setSound as coreSetSound,
  tick,
  upgrade as coreUpgrade,
} from '../sim/factory';
import { clearSave, loadState, saveState } from '../sim/persist';
import type { FactoryState, MachineId, MaterialId, RobotId, UpgradeTrack } from '../sim/types';
import { playCue } from '../utils/audio';

export interface FactoryApi {
  state: FactoryState;
  addOrder: (type: RobotId) => void;
  cancelOrder: (id: number) => void;
  reorderOrder: (id: number, dir: -1 | 1) => void;
  upgrade: (machine: MachineId, track: UpgradeTrack) => void;
  repair: (machine: MachineId) => void;
  setOverclock: (machine: MachineId, on: boolean) => void;
  emergencyCool: (machine: MachineId) => void;
  salvage: (machine: MachineId) => void;
  buyOutEvent: (eventId: number) => void;
  setSpeed: (speed: 1 | 2 | 3) => void;
  setPaused: (paused: boolean) => void;
  setMaterial: (material: MaterialId) => void;
  setSound: (on: boolean) => void;
  reset: () => void;
}

/**
 * The only impure part of the app: a requestAnimationFrame loop advancing the
 * pure simulation core with real elapsed time, plus browser-side persistence.
 * All rules live in src/sim; this hook only wires them to the DOM.
 */
export function useFactory(): FactoryApi {
  const [state, setState] = useState<FactoryState>(() => loadState());

  const stateRef = useRef(state);
  // Keep the ref pointing at the latest committed state without touching it
  // during render (the React-Compiler-safe way to track a live value).
  useEffect(() => {
    stateRef.current = state;
  });

  // Persistence: debounced autosave + save on tab hide/unload.
  useEffect(() => {
    const save = () => saveState(stateRef.current);
    const id = window.setInterval(save, 2000);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') save();
    };
    window.addEventListener('beforeunload', save);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('beforeunload', save);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Simulation loop. game speed scales dt; randomness is injected per tick.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.25); // clamp tab-switch jumps
      last = now;
      setState((prev) => {
        if (prev.settings.paused) return prev; // paused: freeze the clock entirely
        return tick(prev, dt * prev.settings.gameSpeed, Math.random);
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // UI cue sounds, derived from the pure sim's counters.
  const lastCounts = useRef({ shipped: 0, breakdowns: 0, repairCount: 0, events: 0, costPaid: 0 });
  useEffect(() => {
    const prev = lastCounts.current;
    const s = state.stats;
    if (!state.settings.sound) {
      lastCounts.current = { shipped: s.robotsShipped, breakdowns: s.breakdowns, repairCount: s.repairCount, events: s.eventsTriggered, costPaid: s.costPaid };
      return;
    }
    if (s.robotsShipped > prev.shipped) playCue('ship');
    if (s.breakdowns > prev.breakdowns) playCue('breakdown');
    if (s.repairCount > prev.repairCount) playCue('repair');
    if (s.eventsTriggered > prev.events) playCue('event');
    if (s.costPaid > prev.costPaid) playCue('order');
    lastCounts.current = { shipped: s.robotsShipped, breakdowns: s.breakdowns, repairCount: s.repairCount, events: s.eventsTriggered, costPaid: s.costPaid };
  }, [state]);

  const addOrder = useCallback((type: RobotId) => {
    setState((prev) => {
      const r = coreAddOrder(prev, type);
      return r.ok ? r.state : prev;
    });
  }, []);

  const cancelOrder = useCallback((id: number) => {
    setState((prev) => {
      const r = coreCancelOrder(prev, id);
      return r.ok ? r.state : prev;
    });
  }, []);

  const reorderOrder = useCallback((id: number, dir: -1 | 1) => {
    setState((prev) => {
      const r = coreReorderOrder(prev, id, dir);
      return r.ok ? r.state : prev;
    });
  }, []);

  const upgrade = useCallback((machine: MachineId, track: UpgradeTrack) => {
    setState((prev) => {
      const r = coreUpgrade(prev, machine, track);
      return r.ok ? r.state : prev;
    });
  }, []);

  const repair = useCallback((machine: MachineId) => {
    setState((prev) => {
      const r = coreRepair(prev, machine);
      return r.ok ? r.state : prev;
    });
  }, []);

  const setOverclock = useCallback((machine: MachineId, on: boolean) => {
    setState((prev) => coreSetOverclock(prev, machine, on));
  }, []);

  const emergencyCool = useCallback((machine: MachineId) => {
    setState((prev) => {
      const r = coreEmergencyCool(prev, machine);
      return r.ok ? r.state : prev;
    });
  }, []);

  const salvage = useCallback((machine: MachineId) => {
    setState((prev) => {
      const r = coreSalvage(prev, machine);
      return r.ok ? r.state : prev;
    });
  }, []);

  const buyOutEvent = useCallback((eventId: number) => {
    setState((prev) => {
      const r = coreBuyOutEvent(prev, eventId);
      return r.ok ? r.state : prev;
    });
  }, []);

  const setSpeed = useCallback((speed: 1 | 2 | 3) => {
    setState((prev) => setGameSpeed(prev, speed));
  }, []);

  const setPaused = useCallback((paused: boolean) => {
    setState((prev) => coreSetPaused(prev, paused));
  }, []);

  const setMaterial = useCallback((material: MaterialId) => {
    setState((prev) => coreSetMaterial(prev, material));
  }, []);

  const setSound = useCallback((on: boolean) => {
    setState((prev) => coreSetSound(prev, on));
  }, []);

  const reset = useCallback(() => {
    clearSave();
    setState(resetState(stateRef.current));
  }, []);

  return {
    state,
    addOrder,
    cancelOrder,
    reorderOrder,
    upgrade,
    repair,
    setOverclock,
    emergencyCool,
    salvage,
    buyOutEvent,
    setSpeed,
    setPaused,
    setMaterial,
    setSound,
    reset,
  };
}