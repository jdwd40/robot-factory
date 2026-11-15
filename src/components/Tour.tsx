import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { FactoryState } from '../sim/types';
import { markTourSeen } from '../utils/tutorial';

export interface TourStep {
  /** CSS selector to spotlight. Steps without a target render a centered card. */
  target?: string;
  /** Auto-advance once the player has placed at least one order. */
  autoOnOrder?: boolean;
  title: string;
  body: ReactNode;
}

const STEPS: TourStep[] = [
  {
    title: 'Welcome to Robot Works',
    body: (
      <>
        You own the factory floor. Robots are ordered in the Order Book, travel the line left to
        right (<strong>Fabricator → Assembler → Finisher</strong>) and ship for credits. Keep the
        line fed and credits rolling. Let me walk you through your first robot.
      </>
    ),
  },
  {
    target: '[data-tour="order-worker"]',
    autoOnOrder: true,
    title: 'Place your first order',
    body: (
      <>
        Pick a chassis material above (Chrome is free; Alloy and Carbon unlock with upgrades), then
        click <strong>Order</strong> on the Worker Bot. I’ll move on automatically once it lands.
      </>
    ),
  },
  {
    target: '[data-tour="line"]',
    title: 'Watch it roll down the line',
    body: (
      <>
        Your order becomes a job that <em>Fabricates</em>, <em>Assembles</em> then <em>Finishes</em>,
        moving through the machines left to right. A machine with a full output bay blocks the line
        behind it — upgrading the slowest machine is usually the best first move.
      </>
    ),
  },
  {
    target: '[data-tour="heat"]',
    title: 'Heat is the price of speed',
    body: (
      <>
        Machines build heat while running and break down more often when hot. Overclock for +25%
        speed (at 2× heat build-up), or use <strong>Emergency Cool</strong> (12 cr) to vent the
        gauge. Reliability upgrades cut breakdown risk.
      </>
    ),
  },
  {
    target: '[data-tour="upgrades"]',
    title: 'Upgrade to grow',
    body: (
      <>
        Every machine has <strong>Speed</strong>, <strong>Reliability</strong> and a special track.
        Speed raises throughput, Reliability cuts failures, and each special does something unique —
        the tooltips say exactly what each level unlocks.
      </>
    ),
  },
  {
    target: '[data-tour="dock"]',
    title: 'Credits roll in at the dock',
    body: (
      <>
        Finished robots ship here and feed <strong>Credits</strong>, <strong>Robots/hr</strong> and{' '}
        <strong>Shipped</strong> in the header. Keep a small queue of orders ahead so the line never
        starves.
      </>
    ),
  },
  {
    target: '[data-tour="controls"]',
    title: 'Run it at your own pace',
    body: (
      <>
        Speed the sim up with <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> or these buttons; pause with{' '}
        <kbd>Space</kbd>. Events — surges, bulk-order bonuses, repair discounts — pop banners when
        they fire; the bad ones can usually be paid off early.
      </>
    ),
  },
  {
    title: 'You’re in control',
    body: (
      <>
        That’s the loop: <strong>order, upgrade, repair, ship, repeat</strong>. Press{' '}
        <kbd>?</kbd> for the full manual, or replay this tour from there. Now go make some robots.
      </>
    ),
  },
];

interface TourProps {
  state: FactoryState;
  onClose: () => void;
  /** Delay before the overlay appears, letting the first paint settle. */
  delayMs?: number;
}

export function Tour({ state, onClose, delayMs = 500 }: TourProps) {
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const placedAt = useRef(0);

  useEffect(() => {
    const t = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(t);
  }, [delayMs]);

  const step = STEPS[Math.min(index, STEPS.length - 1)];

  const finish = () => {
    markTourSeen();
    onClose();
  };

  const advance = () => {
    if (index >= STEPS.length - 1) finish();
    else setIndex((i) => i + 1);
  };

  const back = () => setIndex((i) => Math.max(0, i - 1));

  // Snapshot the committed-order spend when entering a step, so the "first
  // order" step can detect a fresh order and advance on its own. Deliberately
  // only keyed on the step index, not the spend value.
  useLayoutEffect(() => {
    placedAt.current = state.stats.costPaid;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Keep the spotlight glued to its target across scroll/resize.
  useLayoutEffect(() => {
    if (!visible || !step.target) return;
    const el = document.querySelector<HTMLElement>(step.target);
    if (!el) return;
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [visible, step.target]);

  // Auto-advance the "place your first order" step once the player commits.
  useEffect(() => {
    if (!visible || !step.autoOnOrder) return;
    if (state.stats.costPaid > placedAt.current) advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, step.autoOnOrder, state.stats.costPaid]);

  // Focus the primary action and let Esc skip the whole tour.
  useEffect(() => {
    if (!visible) return;
    nextRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, index]);

  if (!visible) return null;

  const centered = !step.target || !rect;
  const style: CSSProperties = {};
  if (!centered && rect) {
    const w = Math.min(360, window.innerWidth - 24);
    const above = rect.top - 14 - 200;
    const below = rect.bottom + 14;
    style.top = Math.max(10, Math.min(window.innerHeight - 210, above > 10 ? above : below));
    style.left = Math.max(
      10,
      Math.min(window.innerWidth - w - 10, rect.left + rect.width / 2 - w / 2),
    );
    style.width = w;
  }
  const last = index >= STEPS.length - 1;

  return (
    <>
      {centered ? (
        <div className="tour-scrim" aria-hidden="true" />
      ) : (
        rect && (
          <div
            className="tour-spotlight"
            aria-hidden="true"
            style={{
              left: rect.left - 4,
              top: rect.top - 4,
              width: rect.width + 8,
              height: rect.height + 8,
            }}
          />
        )
      )}
      <div
        className={centered ? 'tour-tooltip tour-tooltip--center' : 'tour-tooltip'}
        style={style}
        role="dialog"
        aria-modal="true"
        aria-label="Factory tutorial"
      >
        <div className="tour-tooltip-pop">
          <span className="tour-step-label">
            Step {index + 1} / {STEPS.length} · Esc to skip
          </span>
          <h3>{step.title}</h3>
          <p>{step.body}</p>
          <div className="tour-actions">
            <button type="button" className="tour-skip" onClick={finish}>
              Skip tour
            </button>
            <div className="tour-actions-group">
              {index > 0 && (
                <button type="button" className="tour-skip" onClick={back}>
                  Back
                </button>
              )}
              <button ref={nextRef} type="button" className="tour-next" onClick={advance}>
                {last ? "Let's go" : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}