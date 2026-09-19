import { useEffect, useRef } from 'react';
import {
  EMERGENCY_COOL_COST,
  MATERIAL_CONFIG,
  MATERIAL_ORDER,
  MAX_ORDER_QUEUE,
  OVERCLOCK_HEAT_MULT,
  OVERCLOCK_SPEED_MULT,
  ROBOT_CONFIG,
  ROBOT_ORDER,
} from '../sim/config';

interface HelpOverlayProps {
  onClose: () => void;
}

export function HelpOverlay({ onClose }: HelpOverlayProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal help-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 id="help-title">How to Play</h2>
          <button ref={closeRef} type="button" className="modal-close" onClick={onClose} aria-label="Close help">
            ×
          </button>
        </header>
        <div className="modal-body">
          <h3>The line</h3>
          <p>
            Order robots into the <strong>Order Book</strong>; work flows Fabricator → Assembler →
            Finisher and out the shipping dock. A slow machine backs the whole line up — watch whose
            buffer is growing.
          </p>

          <h3>Machines</h3>
          <p>
            Each machine has <strong>Speed</strong>, <strong>Reliability</strong> and a special track.
            Reliable machines fail far less often. Hot machines fail more — keep an eye on the{' '}
            <em>heat gauge</em> (<span className="nowrap">OVERHEAT THREAT</span> warns you). When a
            machine breaks, pay to repair it: repairs take time and your line idles, so budget early.
            If you can't afford a repair, <strong>salvage</strong> the stuck job for a partial refund.
          </p>

          <h3>Overclock, cooling & heat</h3>
          <p>
            Toggle <strong>overclock</strong> on a running machine for {OVERCLOCK_SPEED_MULT}× speed —
            but heat builds {OVERCLOCK_HEAT_MULT}× fast, and overheated machines fail more and can
            seize into a breakdown. <strong>Emergency cool</strong> vents a hot machine instantly for{' '}
            {EMERGENCY_COOL_COST} cr. Overclocking a hot line is a gamble worth paying attention to.
          </p>

          <h3>Models & materials</h3>
          <ul className="help-list">
            {ROBOT_ORDER.map((r) => (
              <li key={r}>
                <strong style={{ color: ROBOT_CONFIG[r].color }}>{ROBOT_CONFIG[r].name}</strong> —{' '}
                {ROBOT_CONFIG[r].tagline.toLowerCase()}.
              </li>
            ))}
          </ul>
          <p>
            Pick a <strong>chassis material</strong> before ordering:
            {MATERIAL_ORDER.map((m) => (
              <span key={m} className="help-material" style={{ color: MATERIAL_CONFIG[m].color }}>
                {MATERIAL_CONFIG[m].name} {MATERIAL_CONFIG[m].costMult}× cost · {MATERIAL_CONFIG[m].saleMult}× sale
              </span>
            ))}
            . Heavier materials build slower but resell for more.
          </p>

          <h3>Events</h3>
          <p>
            The logistics office throws curveballs: power surges, bulk orders with bonuses, perfect
            assembly streaks, repair discounts and material shortages. A fulfilled bulk order pays a
            large bonus. Some negative events (power surge, material shortage) can be paid off early
            to end them right now.
          </p>

          <h3>Shortcuts & speed</h3>
          <p>
            Pause and resume any time (<kbd>Space</kbd>). Game speed <kbd>1</kbd> <kbd>2</kbd>{' '}
            <kbd>3</kbd> ×, help <kbd>?</kbd>. The production queue is capped at{' '}
            {MAX_ORDER_QUEUE} pending orders.
          </p>

          <h3>Finishing</h3>
          <p>Keep the line fed, repair early, and the credits roll in — or take a breath and pause.</p>
        </div>
        <footer className="modal-foot">
          <button type="button" className="order-btn" onClick={onClose}>
            Got it
          </button>
        </footer>
      </div>
    </div>
  );
}