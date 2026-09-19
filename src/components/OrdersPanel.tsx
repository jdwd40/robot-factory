import {
  MATERIAL_CONFIG,
  MATERIAL_ORDER,
  MAX_ORDER_QUEUE,
  ROBOT_CONFIG,
  ROBOT_ORDER,
  UPGRADE_TRACKS,
} from '../sim/config';
import { materialBlocks, materialMet, orderCost, robotBuildTime, saleValueFor } from '../sim/economy';
import type { FactoryState, Job, MaterialId, RobotId } from '../sim/types';
import { RobotIcon } from './RobotIcon';

interface OrdersPanelProps {
  state: FactoryState;
  onAddOrder: (type: RobotId) => void;
  onSetMaterial: (material: MaterialId) => void;
  onCancelOrder: (id: number) => void;
  onReorderOrder: (id: number, dir: -1 | 1) => void;
}

const STAGE_LABEL: Record<string, string> = {
  queued: 'Queued',
  fabricating: 'Fabricating',
  assembling: 'Assembling',
  finishing: 'Finishing',
};

interface Row {
  key: string;
  job: Job;
  stage: Job['stage'] | 'queued';
  progress?: number;
  queuedIndex?: number;
}

export function OrdersPanel({
  state,
  onAddOrder,
  onSetMaterial,
  onCancelOrder,
  onReorderOrder,
}: OrdersPanelProps) {
  const fabSpecial = state.machines.fabricator.upgrades.special;
  const finSpecial = state.machines.finisher.upgrades.special;
  const material = state.settings.material;

  return (
    <section className="panel orders-panel" aria-label="Orders and queue">
      <h2 className="panel-title">Order Book</h2>

      <div className="material-picker" role="group" aria-label="Chassis material">
        {MATERIAL_ORDER.map((mid) => {
          const cfg = MATERIAL_CONFIG[mid];
          const met = materialMet(mid, state.machines);
          const blocked = materialBlocks(mid, state.machines);
          const selected = material === mid;
          const classes = [
            'material-chip',
            selected ? 'material-selected' : '',
            met ? '' : 'material-locked',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={mid}
              type="button"
              className={classes}
              disabled={!met}
              aria-pressed={selected}
              title={met ? cfg.blurb : `${cfg.name} — needs ${blocked ? `${UPGRADE_TRACKS[blocked.machine][blocked.track].name} L${blocked.level}` : 'upgrades'}`}
              onClick={() => onSetMaterial(mid)}
            >
              <span className="material-dot" style={{ background: cfg.color }} aria-hidden="true" />
              <span className="material-name">{cfg.name}</span>
              {!met && <span className="material-lock-mark" aria-hidden="true">🔒</span>}
            </button>
          );
        })}
      </div>

      <div className="order-catalog">
        {ROBOT_ORDER.map((type) => {
          const cfg = ROBOT_CONFIG[type];
          const cost = orderCost(type, fabSpecial, material);
          const sale = saleValueFor(type, finSpecial, material);
          const build = Math.round(robotBuildTime(type) * MATERIAL_CONFIG[material].timeMult);
          const met = cfg.requires.every(
            (r) => state.machines[r.machine].upgrades[r.track] >= r.level,
          );
          const unmet = cfg.requires.find(
            (r) => state.machines[r.machine].upgrades[r.track] < r.level,
          );
          const affordable = state.credits >= cost;
          const queueFull = state.orders.length >= MAX_ORDER_QUEUE;
          const orderHint = queueFull
            ? `queue full (${MAX_ORDER_QUEUE} limit)` 
            : !affordable ? 'insufficient credits' : '';
          return (
            <div className={`catalog-row${met ? '' : ' catalog-locked'}`} key={type}>
              <div className="catalog-robot">
                <RobotIcon type={type} size={34} />
                <div>
                  <div className="catalog-name">
                    {cfg.name}
                    {!met && <span className="catalog-lock">🔒</span>}
                  </div>
                  <div className="catalog-tagline">
                    {cfg.tagline} · {MATERIAL_CONFIG[material].name}
                  </div>
                </div>
              </div>
              <div className="catalog-stats">
                <div>
                  <span className="catalog-key">Cost</span>
                  <span className="catalog-val">{cost} cr</span>
                </div>
                <div>
                  <span className="catalog-key">Sale</span>
                  <span className="catalog-val">{sale} cr</span>
                </div>
                <div>
                  <span className="catalog-key">Profit</span>
                  <span className="catalog-val stat-profit">+{sale - cost}</span>
                </div>
                <div>
                  <span className="catalog-key">Build</span>
                  <span className="catalog-val">{build}s</span>
                </div>
              </div>
              {met ? (
                <button
                  type="button"
                  className="order-btn"
                  disabled={!affordable || queueFull}
                  onClick={() => onAddOrder(type)}
                >
                  Order — {cost} cr
                </button>
              ) : (
                <span className="order-requirement">
                  Needs {unmet ? `${UPGRADE_TRACKS[unmet.machine][unmet.track].name} L${unmet.level}` : 'upgrades'}
                </span>
              )}
              {met && orderHint && <span className="order-hint">{orderHint}</span>}
            </div>
          );
        })}
      </div>

      <h2 className="panel-title">Production Queue</h2>
      <div className="queue-list">
        {buildRows(state).map((row) => (
          <QueueRow
            key={row.key}
            row={row}
            isFirst={row.queuedIndex === 0}
            isLast={row.queuedIndex === state.orders.length - 1}
            onCancel={onCancelOrder}
            onReorder={onReorderOrder}
          />
        ))}
        {state.orders.length === 0 &&
          state.machines.fabricator.currentJob === null &&
          state.machines.assembler.inputBuffer.length === 0 &&
          state.machines.finisher.inputBuffer.length === 0 && (
            <div className="queue-empty">Queue is empty — order a robot above.</div>
          )}
      </div>
      <div className="queue-foot">Profit shown per unit at current upgrades & material.</div>
    </section>
  );
}

function buildRows(state: FactoryState): Row[] {
  const rows: Row[] = [];
  state.orders.forEach((job, i) => rows.push({ key: `q-${job.id}`, job, stage: 'queued', queuedIndex: i }));
  const fab = state.machines.fabricator.currentJob;
  if (fab) rows.push({ key: `fab-${fab.id}`, job: fab, stage: 'fabricating', progress: state.machines.fabricator.progress });
  for (const job of state.machines.assembler.inputBuffer) rows.push({ key: `asb-${job.id}`, job, stage: 'assembling' });
  const asb = state.machines.assembler.currentJob;
  if (asb) rows.push({ key: `asb-${asb.id}`, job: asb, stage: 'assembling', progress: state.machines.assembler.progress });
  for (const job of state.machines.finisher.inputBuffer) rows.push({ key: `fin-${job.id}`, job, stage: 'finishing' });
  const fin = state.machines.finisher.currentJob;
  if (fin) rows.push({ key: `fin-${fin.id}`, job: fin, stage: 'finishing', progress: state.machines.finisher.progress });
  return rows;
}

interface QueueRowProps {
  row: Row;
  isFirst: boolean;
  isLast: boolean;
  onCancel: (id: number) => void;
  onReorder: (id: number, dir: -1 | 1) => void;
}

function QueueRow({ row, isFirst, isLast, onCancel, onReorder }: QueueRowProps) {
  const queued = row.queuedIndex !== undefined;
  const progress =
    row.progress !== undefined ? Math.max(0, Math.min(100, row.progress * 100)) : null;
  const mat = MATERIAL_CONFIG[row.job.material];
  return (
    <div className="queue-row">
      <div className="queue-row-main">
        <RobotIcon type={row.job.type} size={20} />
        <span className="queue-row-name">
          {row.job.type} · #{row.job.serial}
        </span>
        <span
          className="queue-material"
          style={{ color: mat.color }}
          title={mat.name}
        >
          {mat.name}
        </span>
        <span className={`queue-stage stage-${row.stage}`}>{STAGE_LABEL[row.stage]}</span>
        {progress !== null && (
          <span className="queue-progress">
            <i style={{ width: `${progress}%` }} />
          </span>
        )}
      </div>
      {queued && (
        <div className="queue-controls">
          <button
            type="button"
            className="queue-btn"
            disabled={isFirst}
            aria-label="Move earlier"
            onClick={() => onReorder(row.job.id, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="queue-btn"
            disabled={isLast}
            aria-label="Move later"
            onClick={() => onReorder(row.job.id, 1)}
          >
            ↓
          </button>
          <button
            type="button"
            className="queue-btn queue-btn-cancel"
            aria-label="Cancel order"
            onClick={() => onCancel(row.job.id)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}