import { useEffect, useRef } from 'react';
import { MACHINE_ORDER, MATERIAL_ORDER, MATERIAL_CONFIG, ROBOT_CONFIG, ROBOT_ORDER } from '../sim/config';
import { formatDuration, formatNumber, formatPercent, formatSigned } from '../sim/format';
import { lifetimeUptime } from '../sim/throughput';
import type { FactoryState } from '../sim/types';

interface ReportModalProps {
  state: FactoryState;
  onClose: () => void;
}

/** Period/run summary scroll — a glass-office monthly report. */
export function ReportModal({ state, onClose }: ReportModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const s = state.stats;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const profitPct = s.revenue > 0 ? (s.profit / s.revenue) * 100 : 0;
  const avgSale = s.robotsShipped > 0 ? s.revenue / s.robotsShipped : 0;

  return (
    <div className="overlay-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal report-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 id="report-title">Run Report</h2>
          <button ref={closeRef} type="button" className="modal-close" onClick={onClose} aria-label="Close report">
            ×
          </button>
        </header>
        <div className="modal-body">
          <div className="report-topline">
            <span className="report-run">
              {formatDuration(state.elapsed)} elapsed · {formatNumber(s.robotsShipped)} shipped
            </span>
            <span className="report-total">
              Net {formatSigned(s.profit)} cr <small>({s.revenue > 0 ? `${Math.round(profitPct)}%` : '—'} margin)</small>
            </span>
          </div>

          <h3>Production by model</h3>
          <table className="report-table">
            <thead>
              <tr>
                <th>Model</th>
                <th className="num">Shipped</th>
                <th className="num">Revenue</th>
                <th className="num">Profit</th>
              </tr>
            </thead>
            <tbody>
              {ROBOT_ORDER.map((r) => (
                <tr key={r}>
                  <td style={{ color: ROBOT_CONFIG[r].color }}>{r}</td>
                  <td className="num">{formatNumber(s.byType[r])}</td>
                  <td className="num">{formatSigned(s.byTypeRevenue[r])}</td>
                  <td className="num">{formatSigned(s.byTypeProfit[r])}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Materials shipped</h3>
          <div className="report-materials">
            {MATERIAL_ORDER.map((m) => {
              const count = s.byMaterial[m];
              return (
                <span key={m} className="report-material">
                  <i style={{ background: MATERIAL_CONFIG[m].color }} aria-hidden="true" />
                  {MATERIAL_CONFIG[m].name}: {formatNumber(count)}
                </span>
              );
            })}
          </div>

          <h3>Machine uptime</h3>
          <div className="uptime-list">
            {MACHINE_ORDER.map((id) => {
              const m = state.machines[id];
              const up = lifetimeUptime(state, id);
              const jobs = m.totalJobsCompleted;
              const faults = m.totalBreakdowns;
              return (
                <div className="uptime-row" key={id}>
                  <span className="uptime-name">{id}</span>
                  <span className="uptime-bar">
                    <i style={{ width: `${Math.min(100, up * 100)}%` }} />
                  </span>
                  <span className="uptime-value">{Math.round(up * 100)}%</span>
                  <span className="uptime-sub">
                    {formatNumber(jobs)} done · {formatNumber(faults)} faults
                  </span>
                </div>
              );
            })}
          </div>

          <h3>Headline stats</h3>
          <dl className="report-grid">
            <div>
              <dt>Avg sale value</dt>
              <dd>{formatNumber(avgSale)} cr</dd>
            </div>
            <div>
              <dt>Avg build time</dt>
              <dd>{s.buildSamples > 0 ? formatDuration(s.avgBuildTime) : '—'}</dd>
            </div>
            <div>
              <dt>Breakdowns</dt>
              <dd>{formatNumber(s.breakdowns)}</dd>
            </div>
            <div>
              <dt>Repairs</dt>
              <dd>
                {formatNumber(s.repairCount)} ({formatNumber(s.repairCost)} cr)
              </dd>
            </div>
            <div>
              <dt>Upgrades</dt>
              <dd>
                {formatNumber(s.upgradeCount)} ({formatNumber(s.upgradeSpend)} cr)
              </dd>
            </div>
            <div>
              <dt>Events</dt>
              <dd>
                {formatNumber(s.eventsTriggered)} · {formatNumber(s.eventsFulfilled)} fulfilled
              </dd>
            </div>
            <div>
              <dt>Throughput</dt>
              <dd>
                {formatNumber(Math.round(s.rateEma * 3600))} robots/hr
              </dd>
            </div>
            <div>
              <dt>Materials spent</dt>
              <dd>{formatNumber(s.costPaid)} cr</dd>
            </div>
          </dl>
          <p className="report-foot">
            Lifetime utilisation is {formatPercent(state.machines.fabricator.activeEma, 0)} /
            {formatPercent(state.machines.assembler.activeEma, 0)} /
            {formatPercent(state.machines.finisher.activeEma, 0)} across the line.
          </p>
        </div>
      </div>
    </div>
  );
}