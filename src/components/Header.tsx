import { ROBOT_CONFIG, ROBOT_ORDER } from '../sim/config';
import { formatNumber } from '../sim/format';
import type { FactoryState } from '../sim/types';

interface HeaderProps {
  state: FactoryState;
  onToggleSound: () => void;
  onOpenHelp: () => void;
  onOpenReport: () => void;
}

export function Header({ state, onToggleSound, onOpenHelp, onOpenReport }: HeaderProps) {
  const robotsPerHour = state.stats.rateEma * 3600;
  const pending = state.orders.length;
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
          <dd key={Math.round(state.credits)} className="stat-credits stat-pop">
            {formatNumber(state.credits)}
          </dd>
        </div>
        <div className="stat">
          <dt>Robots / hr</dt>
          <dd>{robotsPerHour < 10 ? robotsPerHour.toFixed(1) : formatNumber(robotsPerHour)}</dd>
        </div>
        <div className="stat">
          <dt>Shipped</dt>
          <dd>{formatNumber(state.stats.robotsShipped)}</dd>
        </div>
        <div className="stat">
          <dt>Orders Queued</dt>
          <dd>{formatNumber(pending)}</dd>
        </div>
        <div className="stat stat-roster">
          <dt>Line Up</dt>
          <dd className="roster">
            {ROBOT_ORDER.map((r) => (
              <span
                key={r}
                className="roster-chip"
                style={{ color: ROBOT_CONFIG[r].color }}
                title={`${ROBOT_CONFIG[r].name}: ${state.stats.byType[r]} shipped`}
              >
                {state.stats.byType[r]}
              </span>
            ))}
          </dd>
        </div>
      </dl>

      <div className="header-actions" role="group" aria-label="Factory actions">
        <button
          type="button"
          className="head-btn"
          aria-pressed={state.settings.sound}
          aria-label={state.settings.sound ? 'Disable sound cues' : 'Enable sound cues'}
          title={state.settings.sound ? 'Sound on' : 'Sound off'}
          onClick={onToggleSound}
        >
          {state.settings.sound ? '🔊' : '🔇'}
        </button>
        <button type="button" className="head-btn" onClick={onOpenReport}>
          Report
        </button>
        <button type="button" className="head-btn" aria-label="How to play" onClick={onOpenHelp}>
          ?
        </button>
      </div>
    </header>
  );
}