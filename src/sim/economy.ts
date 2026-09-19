import {
  BREAKDOWN_CONFIG,
  DEFAULT_MATERIAL,
  MACHINE_CONFIG,
  MATERIAL_CONFIG,
  ROBOT_CONFIG,
  UPGRADE_TRACKS,
} from './config';
import type { BreakdownType, MachineId, MaterialId, RobotId, UpgradeTrack } from './types';

/** Full nominal order cost before material efficiency: material + labour. */
export function robotCost(type: RobotId): number {
  const cfg = ROBOT_CONFIG[type];
  return cfg.materialCost + cfg.laborCost;
}

/** Nominal sale price before quality tuning / events. */
export function robotSalePrice(type: RobotId): number {
  return ROBOT_CONFIG[type].salePrice;
}

/** Nominal total build time at speed level 1 (all three machines). */
export function robotBuildTime(type: RobotId): number {
  const cfg = ROBOT_CONFIG[type];
  return cfg.fabricateTime + cfg.assembleTime + cfg.finishTime;
}

/** Stage duration for a job at this machine at speed level 1. */
export function stageDuration(
  machineId: MachineId,
  type: RobotId,
  material: MaterialId = DEFAULT_MATERIAL,
): number {
  const cfg = ROBOT_CONFIG[type];
  const mult = MATERIAL_CONFIG[material].timeMult;
  return (
    (machineId === 'fabricator'
      ? cfg.fabricateTime
      : machineId === 'assembler'
        ? cfg.assembleTime
        : cfg.finishTime) * mult
  );
}

/** Effective speed multiplier from upgrades (+50% per speed level). */
export function speedMultiplier(speedLevel: number): number {
  return 1 + 0.5 * Math.max(0, speedLevel - 1);
}

/** Failure-rate multiplier from reliability upgrades (≈0.6× per level). */
export function reliabilityFactor(reliabilityLevel: number): number {
  return Math.pow(0.6, Math.max(0, reliabilityLevel - 1));
}

/**
 * Probability per second of a breakdown while processing at a given heat.
 * baseRate comes from MACHINE_CONFIG; heat scales the risk 0.6×..1.8×.
 */
export function processFailureRisk(baseRate: number, reliabilityLevel: number, heat: number): number {
  return baseRate * reliabilityFactor(reliabilityLevel) * (0.6 + Math.max(0, Math.min(1.2, heat)));
}

/** Material-cost multiplier from Material Efficiency (floor 0.5). */
export function materialEfficiencyFactor(specialLevel: number): number {
  return Math.max(0.5, 1 - 0.07 * Math.max(0, specialLevel - 1));
}

/** Sale-value multiplier from Quality Tuning (+4% per level). */
export function qualityMultiplier(specialLevel: number): number {
  return 1 + 0.04 * Math.max(0, specialLevel - 1);
}

/** Current cost to place an order for `type`, honouring material efficiency. */
export function orderCost(
  type: RobotId,
  materialEfficiencySpecialLevel: number,
  material: MaterialId = DEFAULT_MATERIAL,
): number {
  const cfg = ROBOT_CONFIG[type];
  const mat = Math.round(
    cfg.materialCost * materialEfficiencyFactor(materialEfficiencySpecialLevel) * MATERIAL_CONFIG[material].costMult,
  );
  return mat + cfg.laborCost;
}

/** Current sale value for a shipped robot, honouring quality tuning. */
export function saleValueFor(
  type: RobotId,
  finisherQualitySpecialLevel: number,
  material: MaterialId = DEFAULT_MATERIAL,
): number {
  return Math.round(
    ROBOT_CONFIG[type].salePrice * qualityMultiplier(finisherQualitySpecialLevel) * MATERIAL_CONFIG[material].saleMult,
  );
}

/** True when every upgrade gate for the material is met. */
export function materialMet(
  material: MaterialId,
  machines: Record<MachineId, { upgrades: Record<UpgradeTrack, number> }>,
): boolean {
  return MATERIAL_CONFIG[material].requires.every(
    (req) => machines[req.machine].upgrades[req.track] >= req.level,
  );
}

/** Materials still locked (unmet requirement), for UI hints. */
export function materialBlocks(
  material: MaterialId,
  machines: Record<MachineId, { upgrades: Record<UpgradeTrack, number> }>,
): { machine: MachineId; track: UpgradeTrack; level: number } | null {
  return (
    MATERIAL_CONFIG[material].requires.find(
      (req) => machines[req.machine].upgrades[req.track] < req.level,
    ) ?? null
  );
}

/** Current profit for a robot ordered under given efficiency and quality levels. */
export function expectedProfit(
  type: RobotId,
  materialSpecialLevel: number,
  finisherQualitySpecialLevel: number,
): number {
  return saleValueFor(type, finisherQualitySpecialLevel) - orderCost(type, materialSpecialLevel);
}

/**
 * Input buffer capacity for a machine, honouring its special (Parallel Bays).
 * The Fabricator's queue is player-managed and unbounded (null).
 */
export function capacityFor(machineId: MachineId, specialLevel: number): number | null {
  const base = MACHINE_CONFIG[machineId].baseCapacity;
  if (base === null) return null;
  if (machineId === 'assembler') return base + 2 * Math.max(0, specialLevel - 1);
  return base;
}

/** Next upgrade cost for a track at its current level (strictly increasing). */
export function upgradeCost(
  machineId: MachineId,
  track: UpgradeTrack,
  currentLevel: number,
): number {
  const cfg = UPGRADE_TRACKS[machineId][track];
  return Math.round(cfg.baseCost * Math.pow(cfg.grow, currentLevel - 1));
}

/** Nominal repair cost/time for a breakdown type. */
export function breakdownCost(type: BreakdownType): number {
  return BREAKDOWN_CONFIG[type].repairCost;
}

export function breakdownRepairTime(type: BreakdownType): number {
  return BREAKDOWN_CONFIG[type].repairTime;
}