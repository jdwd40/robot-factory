import { MACHINE_ORDER } from '../sim/config';
import { bufferPressure } from '../sim/throughput';
import type { FactoryState, MachineId } from '../sim/types';
import { Conveyor } from './Conveyor';
import { MachineCard } from './MachineCard';

interface ProductionLineProps {
  state: FactoryState;
  onUpgrade: (id: MachineId) => void;
}

const CONVEYOR_LABELS: Record<MachineId, string> = {
  fabricator: '',
  assembler: 'Components moving from Fabricator to Assembler',
  finisher: 'Unfinished robots moving from Assembler to Finisher',
};

export function ProductionLine({ state, onUpgrade }: ProductionLineProps) {
  return (
    <main className="line">
      {MACHINE_ORDER.map((id, i) => (
        <div className="line-segment" key={id}>
          <MachineCard id={id} state={state} onUpgrade={onUpgrade} />
          {i < MACHINE_ORDER.length - 1 && (
            <Conveyor
              flow={bufferPressure(state, MACHINE_ORDER[i + 1])}
              label={CONVEYOR_LABELS[MACHINE_ORDER[i + 1]]}
            />
          )}
        </div>
      ))}
      <ShippingDock shipped={state.robotsShipped} />
    </main>
  );
}

function ShippingDock({ shipped }: { shipped: number }) {
  const active = shipped > 0;
  return (
    <aside className={`dock${active ? ' dock-active' : ''}`} aria-label="Shipping dock">
      <div className="dock-lights" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <h2>Shipping</h2>
      <p className="dock-count">{Math.floor(shipped)} robots delivered</p>
    </aside>
  );
}
