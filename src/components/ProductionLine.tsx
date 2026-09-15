import { MACHINE_CONFIG, MACHINE_ORDER } from '../sim/config';
import type { FactoryState, MachineId } from '../sim/types';
import { Conveyor } from './Conveyor';
import { MachineCard } from './MachineCard';

interface ProductionLineProps {
  state: FactoryState;
  onUpgrade: (id: MachineId) => void;
}

/** Normalized 0..1 flow for each conveyor, from the buffers it feeds. */
function conveyorFlow(state: FactoryState, index: number): number {
  const cap = (id: MachineId) => MACHINE_CONFIG[id].baseRate * state.machines[id].level;
  if (index === 0) {
    // Fabricator → Assembler: how well-fed the assembler is relative to demand.
    return Math.min(1, state.components / Math.max(cap('assembler') * 2, 1));
  }
  // Assembler → Finisher.
  return Math.min(1, state.unfinishedRobots / Math.max(cap('finisher'), 1));
}

const CONVEYOR_LABELS = [
  'Components moving from Fabricator to Assembler',
  'Unfinished robots moving from Assembler to Finisher',
];

export function ProductionLine({ state, onUpgrade }: ProductionLineProps) {
  return (
    <main className="line">
      {MACHINE_ORDER.map((id, i) => (
        <div className="line-segment" key={id}>
          <MachineCard id={id} state={state} onUpgrade={onUpgrade} />
          {i < MACHINE_ORDER.length - 1 && (
            <Conveyor flow={conveyorFlow(state, i)} label={CONVEYOR_LABELS[i]} />
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
