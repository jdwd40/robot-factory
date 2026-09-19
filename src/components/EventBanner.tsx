import { BUYOUTABLE_EVENTS, EVENT_CONFIG, EVENT_EFFECT } from '../sim/config';
import { formatDuration } from '../sim/format';
import type { ActiveEvent, FactoryState } from '../sim/types';

interface EventBannerProps {
  state: FactoryState;
  onBuyOut: (eventId: number) => void;
}

const EVENT_ICON: Record<ActiveEvent['type'], string> = {
  'power-surge': '⚡',
  'bulk-order': '📦',
  'perfect-assembly': '✦',
  'maintenance-discount': '⛏',
  'material-shortage': '▤',
};

export function EventBanner({ state, onBuyOut }: EventBannerProps) {
  if (state.events.length === 0) return null;
  return (
    <div className="event-banners" aria-live="polite">
      {state.events.map((ev) => {
        const cfg = EVENT_CONFIG[ev.type];
        const bulk = ev.type === 'bulk-order';
        const buyable = BUYOUTABLE_EVENTS.includes(ev.type);
        const progress = bulk ? Math.min(1, ev.data[1] / Math.max(1, ev.data[0])) : 1;
        return (
          <div key={ev.id} className={`event-banner event-${ev.type}`}>
            <span className="event-icon" aria-hidden="true">
              {EVENT_ICON[ev.type]}
            </span>
            <div className="event-text">
              <strong>{cfg.label}</strong>
              <span className="event-blurb">
                {bulk
                  ? `Ship ${ev.data[0]} robots — ${ev.data[1]}/${ev.data[0]} done`
                  : cfg.blurb}
              </span>
            </div>
            <div className="event-meta">
              {bulk && (
                <span className="event-progress" aria-hidden="true">
                  <i style={{ width: `${progress * 100}%` }} />
                </span>
              )}
              <span className="event-time">{formatDuration(ev.remaining)}</span>
              {buyable && (
                <button
                  type="button"
                  className="event-buyout"
                  disabled={state.credits < EVENT_EFFECT.buyoutCost}
                  onClick={() => onBuyOut(ev.id)}
                  title="Pay to end this event early"
                >
                  End it · {EVENT_EFFECT.buyoutCost} cr
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}