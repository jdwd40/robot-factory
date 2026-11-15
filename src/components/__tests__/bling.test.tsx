// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { richState } from '../../sim/__tests__/helpers';
import { MachineCard } from '../MachineCard';
import { ProductionLine } from '../ProductionLine';

const noop = () => {};

afterEach(() => cleanup());

function machineState(overrides: Partial<{ heat: number; state: string; breakdownType: string | null; repairTimeLeft: number; currentJob: object | null }>) {
  const s = richState();
  const m = s.machines.fabricator;
  s.machines.fabricator = { ...m, ...overrides };
  return s;
}

describe('machine heat & fault bling', () => {
  it('vents steam when processing hot but below the threat line', () => {
    const s = machineState({ heat: 0.6, state: 'processing' });
    const { container } = render(
      <MachineCard id="fabricator" state={s} onUpgrade={noop} onRepair={noop} onSetOverclock={noop} onCool={noop} onSalvage={noop} />,
    );
    expect(container.querySelector('.machine-vent')).toBeTruthy();
    expect(container.querySelector('.machine-glow')).toBeNull();
  });

  it('adds the hot glow and steam when heat passes the hot line', () => {
    const s = machineState({ heat: 0.95, state: 'processing' });
    const { container } = render(
      <MachineCard id="fabricator" state={s} onUpgrade={noop} onRepair={noop} onSetOverclock={noop} onCool={noop} onSalvage={noop} />,
    );
    expect(container.querySelector('.machine-vent')).toBeTruthy();
    expect(container.querySelector('.glow-hot')).toBeTruthy();
  });

  it('stays clean when processing cool', () => {
    const s = machineState({ heat: 0.1, state: 'processing' });
    const { container } = render(
      <MachineCard id="fabricator" state={s} onUpgrade={noop} onRepair={noop} onSetOverclock={noop} onCool={noop} onSalvage={noop} />,
    );
    expect(container.querySelector('.machine-vent')).toBeNull();
    expect(container.querySelector('.machine-glow')).toBeNull();
  });

  it('flickers the overheat haze when the machine loses control', () => {
    const s = machineState({ heat: 1, state: 'overheated', breakdownType: 'overheating' });
    const { container } = render(
      <MachineCard id="fabricator" state={s} onUpgrade={noop} onRepair={noop} onSetOverclock={noop} onCool={noop} onSalvage={noop} />,
    );
    expect(container.querySelector('.glow-overheat')).toBeTruthy();
    expect(container.querySelector('.machine-sparks')).toBeNull();
  });

  it('throws sparks while broken', () => {
    const s = machineState({ heat: 0.4, state: 'broken', breakdownType: 'jam' });
    const { container } = render(
      <MachineCard id="fabricator" state={s} onUpgrade={noop} onRepair={noop} onSetOverclock={noop} onCool={noop} onSalvage={noop} />,
    );
    expect(container.querySelector('.glow-broken')).toBeTruthy();
    const sparks = container.querySelectorAll('.machine-sparks i');
    expect(sparks.length).toBe(3);
  });

  it('breathes the repair worklight while under maintenance', () => {
    const s = machineState({ heat: 0, state: 'repairing', breakdownType: 'overheating', repairTimeLeft: 3 });
    const { container } = render(
      <MachineCard id="fabricator" state={s} onUpgrade={noop} onRepair={noop} onSetOverclock={noop} onCool={noop} onSalvage={noop} />,
    );
    expect(container.querySelector('.glow-repair')).toBeTruthy();
  });
});

describe('shipping dock ka-ching', () => {
  it('floats the payout and sweeps a glint whenever a robot ships', () => {
    const s = richState();
    s.stats.robotsShipped = 3;
    s.stats.lastShipElapsed = s.elapsed; // shipped just now → dock-active window
    s.stats.lastShipValue = 61;
    const { container } = render(
      <ProductionLine
        state={s}
        onUpgrade={noop}
        onRepair={noop}
        onSetOverclock={noop}
        onCool={noop}
        onSalvage={noop}
      />,
    );
    expect(container.querySelector('.dock-payout')?.textContent).toBe('+61 cr');
    expect(container.querySelector('.dock-payout')?.textContent).toContain('61');
    expect(container.querySelector('.dock-glint')).toBeTruthy();
  });
});