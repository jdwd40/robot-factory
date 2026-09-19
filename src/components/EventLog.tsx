import { useMemo, useState } from 'react';
import { formatDuration } from '../sim/format';
import type { FactoryState, LogKind } from '../sim/types';

interface EventLogProps {
  state: FactoryState;
}

type Filter = LogKind | 'all';

const FILTER_LABEL: Record<Filter, string> = {
  all: 'All',
  info: 'Info',
  production: 'Production',
  economy: 'Economy',
  upgrade: 'Upgrades',
  repair: 'Repairs',
  warning: 'Warnings',
  error: 'Errors',
  success: 'Success',
  event: 'Events',
};

export function EventLog({ state }: EventLogProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const entries = useMemo(() => {
    const rows = filter === 'all' ? state.log : state.log.filter((e) => e.kind === filter);
    return { newest: rows.slice(-1)[0], all: rows.slice(-60).reverse() };
  }, [state.log, filter]);

  return (
    <section className="panel log-panel" aria-label="Factory event log">
      <h2 className="panel-title">{formatDuration(state.elapsed)}</h2>
      <div className="log-filters" role="group" aria-label="Filter log entries">
        {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            className={`log-filter-btn${filter === f ? ' log-filter-active' : ''}`}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {FILTER_LABEL[f]}
          </button>
        ))}
      </div>
      <ol className="event-log" aria-live="polite" aria-relevant="additions">
        {entries.all.map((e) => (
          <li
            key={e.id}
            className={`log-entry log-${e.kind}${entries.newest?.id === e.id ? ' log-entry-new' : ''}`}
          >
            <span className="log-time">{formatDuration(e.elapsed)}</span>
            <span className="log-msg">{e.message}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}