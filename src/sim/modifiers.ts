import { EVENT_EFFECT } from './config';
import type { EventType, FactoryState } from './types';

/** Current modifiers derived from the active event set. Pure; testable. */
export interface ActiveModifiers {
  powerSurge: boolean;
  perfectAssembly: boolean;
  maintenanceDiscount: boolean;
  materialShortage: boolean;
  /** Speed multiplier applied while a power surge is active. */
  speedFactor: number;
  /** Fabrication stage-length multiplier while a material shortage is active. */
  fabricationFactor: number;
  /** Sale multiplier while a perfect-assembly bonus is active. */
  assemblyBonus: number;
  /** Upgrade/repair cost multiplier while a maintenance discount is active. */
  maintenanceFactor: number;
}

export function activeModifiers(state: FactoryState): ActiveModifiers {
  const has = (t: EventType) => state.events.some((e) => e.type === t);
  const powerSurge = has('power-surge');
  const perfectAssembly = has('perfect-assembly');
  const maintenanceDiscount = has('maintenance-discount');
  const materialShortage = has('material-shortage');
  return {
    powerSurge,
    perfectAssembly,
    maintenanceDiscount,
    materialShortage,
    speedFactor: powerSurge ? EVENT_EFFECT.powerSurgeSpeed : 1,
    fabricationFactor: materialShortage ? EVENT_EFFECT.materialShortageFactor : 1,
    assemblyBonus: perfectAssembly ? EVENT_EFFECT.perfectAssemblyBonus : 1,
    maintenanceFactor: maintenanceDiscount ? EVENT_EFFECT.maintenanceDiscount : 1,
  };
}