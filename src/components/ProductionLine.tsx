import { MACHINE_ORDER } from '../sim/config';
import { formatNumber, formatSigned } from '../sim/format';
import type { FactoryState, MachineId, UpgradeTrack } from '../sim/types';
import { Conveyor } from './Conveyor';
import { MachineCard } from './MachineCard';

interface ProductionLineProps {
  state: FactoryState;
  onUpgrade: (machine: MachineId, track: UpgradeTrack) => void;
  onRepair: (machine: MachineId) => void;
  onSetOverclock: (machine: MachineId, on: boolean) => void;
  onCool: (machine: MachineId) => void;
  onSalvage: (machine: MachineId) => void;
}

const CONVEYOR_LABELS: Record<MachineId, string> = {
  fabricator: '',
  assembler: 'Fabricated units moving from Fabricator to Assembler',
  finisher: 'Assembled chassis moving from Assembler to Finisher',
};

export function ProductionLine({
  state,
  onUpgrade,
  onRepair,
  onSetOverclock,
  onCool,
  onSalvage,
}: ProductionLineProps) {
  return (
    <main className="line" aria-label="Production line">
      {MACHINE_ORDER.map((id, i) => {
        const next = MACHINE_ORDER[i + 1];
        const upstreamActive = state.machines[id].state === 'processing';
        return (
          <div className="line-segment" key={id}>
            <MachineCard
              id={id}
              state={state}
              onUpgrade={onUpgrade}
              onRepair={onRepair}
              onSetOverclock={onSetOverclock}
              onCool={onCool}
              onSalvage={onSalvage}
            />
            {next && (
              <Conveyor
                jobs={state.machines[next].inputBuffer}
                active={upstreamActive}
                label={CONVEYOR_LABELS[next]}
              />
            )}
          </div>
        );
      })}
      <ShippingDock state={state} />
    </main>
  );
}

function ShippingDock({ state }: { state: FactoryState }) {
  const recent = state.elapsed - state.stats.lastShipElapsed < 4 && state.stats.robotsShipped > 0;
  const rate = state.stats.rateEma * 3600;
  return (
    <aside className={`dock${recent ? ' dock-active' : ''}`} aria-label="Shipping dock">
      <div className="dock-lights" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <h2>Shipping</h2>
      <p className="dock-count">{formatNumber(state.stats.robotsShipped)} robots delivered</p>
      <p className="dock-rate">
        {rate < 10 ? rate.toFixed(1) : formatNumber(rate)} robots/hr
      </p>
      {recent && (
        <div key={state.stats.robotsShipped} className="dock-payout" aria-live="polite">
          {formatSigned(state.stats.lastShipValue)} cr
        </div>
      )}
    </aside>
  );
}