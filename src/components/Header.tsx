import { throughput } from '../sim/factory';
import type { FactoryState } from '../sim/types';

interface HeaderProps {
  state: FactoryState;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function Header({ state }: HeaderProps) {
  const perMinute = throughput(state, 'finisher') * 60;
  return (
    <header className="header">
      <div className="header-brand">
        <span className="header-logo" aria-hidden="true">
          ⚙
        </span>
        <h1>ROBOT WORKS</h1>
        <span className="header-sub">Factory Control</span>
      </div>
      <dl className="header-stats">
        <div className="stat">
          <dt>Credits</dt>
          <dd className="stat-credits">{formatNumber(state.credits)}</dd>
        </div>
        <div className="stat">
          <dt>Robots Shipped</dt>
          <dd>{formatNumber(state.robotsShipped)}</dd>
        </div>
        <div className="stat">
          <dt>Production / min</dt>
          <dd>{perMinute.toFixed(1)}</dd>
        </div>
      </dl>
    </header>
  );
}
