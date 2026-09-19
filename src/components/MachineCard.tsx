import {
  BREAKDOWN_CONFIG,
  EMERGENCY_COOL_COST,
  EMERGENCY_COOL_MIN_HEAT,
  HEAT_HOT_AT,
  HEAT_THREAT_AT,
  HEAT_WARM_AT,
  MACHINE_CONFIG,
  MATERIAL_CONFIG,
  MATERIAL_ORDER,
  MAX_UPGRADE_LEVEL,
  OVERCLOCK_HEAT_MULT,
  OVERCLOCK_SPEED_MULT,
  ROBOT_CONFIG,
  ROBOT_ORDER,
  SALVAGE_FRACTION,
  UPGRADE_TRACKS,
  UPGRADE_TRACKS_ORDER,
} from '../sim/config';
import { capacityFor, processFailureRisk, upgradeCost } from '../sim/economy';
import { activeModifiers } from '../sim/modifiers';
import { jobEta } from '../sim/throughput';
import { formatDuration } from '../sim/format';
import type {
  FactoryState,
  MachineId,
  MachineState,
  MachineStateType,
  UpgradeTrack,
} from '../sim/types';
import { RobotIcon } from './RobotIcon';

interface MachineCardProps {
  id: MachineId;
  state: FactoryState;
  onUpgrade: (machine: MachineId, track: UpgradeTrack) => void;
  onRepair: (machine: MachineId) => void;
  onSetOverclock: (machine: MachineId, on: boolean) => void;
  onCool: (machine: MachineId) => void;
  onSalvage: (machine: MachineId) => void;
}

const STATUS_LABEL: Record<MachineStateType, string> = {
  idle: 'IDLE',
  processing: 'RUNNING',
  waiting: 'WAITING',
  blocked: 'BLOCKED',
  overheated: 'OVERHEATED',
  broken: 'BROKEN',
  repairing: 'REPAIRING',
};

function heatClass(heat: number): string {
  if (heat >= HEAT_HOT_AT) return 'heat-hot';
  if (heat >= HEAT_WARM_AT) return 'heat-warm';
  return 'heat-cool';
}

export function MachineCard({
  id,
  state,
  onUpgrade,
  onRepair,
  onSetOverclock,
  onCool,
  onSalvage,
}: MachineCardProps) {
  const cfg = MACHINE_CONFIG[id];
  const m = state.machines[id];
  const mods = activeModifiers(state);
  const buffer = id === 'fabricator' ? state.orders : m.inputBuffer;
  const cap = capacityFor(id, m.upgrades.special);
  const eta = jobEta(state, id);
  const job = m.currentJob;
  const repairing = m.state === 'repairing';
  const repairType = repairing ? m.breakdownType : null;
  const repairDoneFrac = repairType
    ? Math.min(1, Math.max(0, 1 - m.repairTimeLeft / BREAKDOWN_CONFIG[repairType].repairTime))
    : 0;

  const needsMaintenance = m.state === 'broken' || m.state === 'overheated';
  const down = needsMaintenance || repairing;
  const discount = mods.maintenanceFactor;
  const heatPct = Math.min(100, Math.round(m.heat * 100));
  const heatThreat = m.state === 'processing' && m.heat >= HEAT_THREAT_AT;
  const risk = m.state === 'processing' ? processFailureRisk(cfg.breakdownRate, m.upgrades.reliability, m.heat) : 0;
  const canCool = m.heat >= EMERGENCY_COOL_MIN_HEAT && !down;
  const salvageRefund = needsMaintenance && job ? Math.round(job.costPaid * SALVAGE_FRACTION) : 0;

  return (
    <section className={`machine machine-${m.state}`} aria-label={cfg.name}>
      <header className="machine-head">
        <h2>{cfg.name}</h2>
        <div className="machine-head-badges">
          {m.overclock && (
            <span className="status-badge status-overclock" role="status">
              OC
            </span>
          )}
          <span className={`status-badge status-${m.state}`}>{STATUS_LABEL[m.state]}</span>
        </div>
      </header>

      <div className="machine-workspace">
        <div className={`machine-job${down ? ' machine-job-down' : ''}`}>
          {job ? (
            <>
              <div className="machine-job-robot">
                <RobotIcon type={job.type} size={46} />
                <div>
                  <span className="machine-job-name">{cfg.name} bay</span>
                  <span className="machine-job-serial">
                    {job.type} · #{job.serial}{' '}
                    <span className="job-material" style={{ color: MATERIAL_CONFIG[job.material].color }}>
                      {MATERIAL_CONFIG[job.material].name}
                    </span>
                  </span>
                </div>
              </div>
              <div className="machine-job-progress">
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, m.progress * 100))}%` }} />
                </div>
                <div className="machine-job-meta">
                  <span>{Math.round(m.progress * 100)}%</span>
                  <span>{eta !== null ? formatDuration(eta) : '—'}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="machine-job-empty">
              <div className="machine-core" aria-hidden="true" />
              <span>{m.state === 'idle' ? 'Line clear' : 'Awaiting input'}</span>
            </div>
          )}
        </div>

        <div className={`machine-heat ${heatClass(m.heat)}`}>
          <span className="machine-heat-label">
            {m.heat >= HEAT_HOT_AT ? 'HOT' : m.heat >= HEAT_WARM_AT ? 'WARM' : 'COOL'} {heatPct}%
          </span>
          <div
            className="progress-track heat-track"
            role="progressbar"
            aria-label={`${cfg.name} heat`}
            aria-valuenow={heatPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="progress-fill heat-fill" style={{ width: `${heatPct}%` }} />
          </div>
          {heatThreat && (
            <span className="heat-threat" role="status">
              OVERHEAT THREAT
            </span>
          )}
          {risk > 0 && (
            <span className="heat-risk" title="Breakdown chance per second at this heat">
              {(risk * 100).toFixed(2)}%/s
            </span>
          )}
          {canCool && (
            <button
              type="button"
              className="cool-btn"
              disabled={state.credits < EMERGENCY_COOL_COST}
              onClick={() => onCool(id)}
              title="Vent all heat instantly"
            >
              Cool {EMERGENCY_COOL_COST} cr
            </button>
          )}
        </div>

        <div className="machine-buffer">
          <span className="machine-buffer-label">
            Input {cap !== null ? `${buffer.length}/${cap}` : buffer.length}
          </span>
          <div className="machine-buffer-items">
            {buffer.slice(0, 5).map((j) => (
              <RobotIcon key={j.id} type={j.type} size={16} />
            ))}
            {buffer.length > 5 && <span className="buffer-more">+{buffer.length - 5}</span>}
            {buffer.length === 0 && <span className="buffer-empty">—</span>}
          </div>
        </div>
      </div>

      {down ? (
        <div className="machine-maintenance">
          {needsMaintenance && (
            <>
              <div className="maintenance-title">
                {m.breakdownType ? BREAKDOWN_CONFIG[m.breakdownType].label : 'Maintenance needed'}
              </div>
              <div className="maintenance-actions">
                <button
                  type="button"
                  className="repair-btn"
                  disabled={state.credits < repairCostPreview(m, discount)}
                  onClick={() => onRepair(id)}
                >
                  Repair — {repairCostPreview(m, discount)} cr
                </button>
                {job && (
                  <button
                    type="button"
                    className="salvage-btn"
                    onClick={() => onSalvage(id)}
                    title="Scrap the stuck robot for a partial refund — use it to afford the repair"
                  >
                    Salvage job +{salvageRefund} cr
                  </button>
                )}
              </div>
              {state.credits < repairCostPreview(m, discount) && (
                <span className="upgrade-hint">insufficient credits — salvage the job to cover this</span>
              )}
            </>
          )}
          {repairing && (
            <div className="repairing">
              <span>Repairing…</span>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, repairDoneFrac * 100))}%` }} />
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="machine-overclock" role="group" aria-label="Overclock">
            <button
              type="button"
              className={`overclock-btn${m.overclock ? ' overclock-on' : ''}`}
              aria-pressed={m.overclock}
              onClick={() => onSetOverclock(id, !m.overclock)}
              title={m.overclock ? `Off: ${OVERCLOCK_SPEED_MULT}× speed, 2× heat` : 'Overclock: +25% speed but heat builds twice as fast'}
            >
              <span className="overclock-track-name">Overclock</span>
              <span className="overclock-track-value">{m.overclock ? 'ON' : 'OFF'}</span>
            </button>
            <p className="overclock-note">
              {m.overclock
                ? `${OVERCLOCK_SPEED_MULT}× speed · ${OVERCLOCK_HEAT_MULT}× heat`
                : 'Boost throughput, trade reliability'}
            </p>
          </div>
          <div className="machine-upgrades">
            {UPGRADE_TRACKS_ORDER.map((track) => {
              const lvl = m.upgrades[track];
              const t = UPGRADE_TRACKS[id][track];
              const base = upgradeCost(id, track, lvl);
              const cost = discount < 1 ? Math.round(base * discount) : base;
              const maxed = lvl >= MAX_UPGRADE_LEVEL;
              const unlocks = nextLevelUnlocks(id, track, lvl);
              return (
                <button
                  key={track}
                  type="button"
                  className="upgrade-btn"
                  disabled={maxed || state.credits < cost}
                  onClick={() => onUpgrade(id, track)}
                  title={unlocks ? `${t.blurb} — ${unlocks}` : t.blurb}
                >
                  <span className="upgrade-track-name">{t.name}</span>
                  <span className="upgrade-track-level">L{lvl}</span>
                  <span className="upgrade-track-cost">
                    {discount < 1 && <s>{base}</s>}
                    {maxed ? 'MAX' : `${cost} cr`}
                  </span>
                  {unlocks && <span className="upgrade-track-unlock">{unlocks}</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function repairCostPreview(m: MachineState, factor: number): number {
  const type = m.breakdownType;
  if (!type) return 0;
  return Math.round(BREAKDOWN_CONFIG[type].repairCost * factor);
}

/**
 * If upgrading machine `id`'s `track` to the next level is exactly what
 * unlocks a robot model or chassis material, return a short hint string.
 */
function nextLevelUnlocks(id: MachineId, track: UpgradeTrack, currentLevel: number): string | null {
  const next = currentLevel + 1;
  const names: string[] = [];
  const reqMatched = (req: { machine: MachineId; track: UpgradeTrack; level: number }) =>
    req.machine === id && req.track === track && req.level === next;
  for (const r of ROBOT_ORDER) {
    const cfg = ROBOT_CONFIG[r];
    if (cfg.requires.some(reqMatched)) names.push(cfg.name);
  }
  for (const mId of MATERIAL_ORDER) {
    const cfg = MATERIAL_CONFIG[mId];
    if (cfg.requires.some(reqMatched)) names.push(`${cfg.name} chassis`);
  }
  return names.length > 0 ? `Unlocks ${names.join(', ')}` : null;
}