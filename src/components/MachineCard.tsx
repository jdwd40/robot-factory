import { MACHINE_CONFIG } from '../sim/config';
import { machineStatus, throughput, upgradeCost } from '../sim/throughput';
import type { FactoryState, MachineId } from '../sim/types';

interface MachineCardProps {
  id: MachineId;
  state: FactoryState;
  onUpgrade: (id: MachineId) => void;
}

const STATUS_LABEL: Record<string, string> = {
  RUNNING: 'RUNNING',
  WAITING: 'WAITING',
  BOTTLENECK: '⚠ BOTTLENECK',
};

export function MachineCard({ id, state, onUpgrade }: MachineCardProps) {
  const cfg = MACHINE_CONFIG[id];
  const machine = state.machines[id];
  const status = machineStatus(state, id);
  const rate = throughput(state, id);
  const cost = upgradeCost(state, id);
  const affordable = state.credits >= cost;

  return (
    <section className={`machine machine-${status.toLowerCase()}`} aria-label={cfg.name}>
      <header className="machine-head">
        <h2>{cfg.name}</h2>
        <span className={`status-badge status-${status.toLowerCase()}`}>{STATUS_LABEL[status]}</span>
      </header>

      <div
        className={`machine-body${machine.active ? ' machine-active' : ''}`}
        style={{ ['--pulse-duration' as string]: `${Math.max(0.4, 1.2 / rate).toFixed(2)}s` }}
        aria-hidden="true"
      >
        <div className="machine-core" />
        <div className="machine-progress">
          <div
            className="machine-progress-fill"
            style={{ transform: `scaleX(${machine.progress.toFixed(3)})` }}
          />
        </div>
      </div>

      <dl className="machine-stats">
        <div>
          <dt>Level</dt>
          <dd>{machine.level}</dd>
        </div>
        <div>
          <dt>Rate</dt>
          <dd>{rate.toFixed(1)} u/s</dd>
        </div>
        <div>
          <dt>Input</dt>
          <dd>
            {cfg.inputPerOutput} {id === 'fabricator' ? 'raw' : id === 'assembler' ? 'comp' : 'unit'}
          </dd>
        </div>
      </dl>

      <button
        type="button"
        className="upgrade-btn"
        disabled={!affordable}
        onClick={() => onUpgrade(id)}
      >
        Upgrade — {cost} cr
        {!affordable && <span className="upgrade-hint">insufficient credits</span>}
      </button>
    </section>
  );
}
