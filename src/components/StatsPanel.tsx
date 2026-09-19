import { MACHINE_ORDER, ROBOT_CONFIG, ROBOT_ORDER } from '../sim/config';
import { formatDuration, formatNumber, formatSigned } from '../sim/format';
import { bottleneckLabel, detectBottleneck, lifetimeUptime } from '../sim/throughput';
import type { FactoryState } from '../sim/types';

interface StatsPanelProps {
  state: FactoryState;
}

export function StatsPanel({ state }: StatsPanelProps) {
  const s = state.stats;
  const b = detectBottleneck(state);
  return (
    <section className="panel stats-panel" aria-label="Factory statistics">
      <h2 className="panel-title">Factory Report</h2>
      <div className="stats-grid">
        <Stat label="Robots Shipped" value={formatNumber(s.robotsShipped)} />
        <Stat label="Robots / hr" value={s.rateEma * 3600 < 10 ? (s.rateEma * 3600).toFixed(1) : formatNumber(s.rateEma * 3600)} />
        <Stat label="Revenue" value={`${formatSigned(s.revenue)} cr`} highlight="pos" />
        <Stat label="Profit" value={`${formatSigned(s.profit)} cr`} highlight={s.profit >= 0 ? 'pos' : 'neg'} />
        <Stat label="Materials Spent" value={`${formatNumber(s.costPaid)} cr`} />
        <Stat label="Avg Build Time" value={s.buildSamples > 0 ? formatDuration(s.avgBuildTime) : '—'} />
        <Stat label="Breakdowns" value={formatNumber(s.breakdowns)} warn={s.breakdowns > 0} />
        <Stat label="Repairs" value={formatNumber(s.repairCount)} />
        <Stat label="Repair Costs" value={`${formatNumber(s.repairCost)} cr`} />
        <Stat label="Upgrades" value={formatNumber(s.upgradeCount)} />
        <Stat label="Upgrade Spend" value={`${formatNumber(s.upgradeSpend)} cr`} />
        <Stat label="Events" value={formatNumber(s.eventsTriggered)} />
        <Stat label="Events Fulfilled" value={formatNumber(s.eventsFulfilled)} />
        <Stat label="Bottleneck" value={b.id ? `${b.id}` : 'None'} highlight="warn" />
      </div>

      <h3 className="si-label">Machine Uptime</h3>
      <div className="uptime-list">
        {MACHINE_ORDER.map((id) => {
          const m = state.machines[id];
          const up = lifetimeUptime(state, id);
          return (
            <div className="uptime-row" key={id}>
              <span className="uptime-name">{m.id}</span>
              <span className="uptime-bar">
                <i style={{ width: `${Math.min(100, up * 100)}%` }} />
              </span>
              <span className="uptime-value">{Math.round(up * 100)}%</span>
              <span className="uptime-sub">
                {formatNumber(m.totalJobsCompleted)} done · {formatNumber(m.totalBreakdowns)} faults
              </span>
            </div>
          );
        })}
      </div>

      <h3 className="si-label">Shipped by Model</h3>
      <div className="roster-list">
        {ROBOT_ORDER.map((r) => (
          <div className="roster-row" key={r}>
            <span className="roster-dot" style={{ background: ROBOT_CONFIG[r].color }} />
            <span className="roster-name">{ROBOT_CONFIG[r].name}</span>
            <span className="roster-count">{formatNumber(s.byType[r])}</span>
          </div>
        ))}
      </div>
      <p className="stats-foot">Bottleneck detail: queued {b.inputQueue} · est. wait {formatDuration(b.avgWait)} · {Math.round(b.utilisation * 100)}% util</p>
      {lineIdle(state) && (
        <p className="stats-foot-muted" role="status">
          Line is idle — queue some orders to get things moving.
        </p>
      )}
      {s.upgradeSpend > 0 || s.repairCost > 0 ? null : (
        <p className="stats-foot-muted">{bottleneckLabel(state)}</p>
      )}
    </section>
  );
}

/** True when every machine is idle/waiting with nothing on the way. */
function lineIdle(state: FactoryState): boolean {
  if (state.orders.length > 0) return false;
  for (const id of MACHINE_ORDER) {
    const m = state.machines[id];
    if (m.currentJob || m.inputBuffer.length > 0) return false;
  }
  return state.elapsed > 15;
}

function Stat({
  label,
  value,
  highlight,
  warn,
}: {
  label: string;
  value: string;
  highlight?: 'pos' | 'neg' | 'warn';
  warn?: boolean;
}) {
  return (
    <div className={`stat-tile${highlight ? ` tile-${highlight}` : ''}${warn ? ' tile-warn' : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}