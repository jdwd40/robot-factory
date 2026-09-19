import { formatNumber } from '../sim/format';
import type { Job } from '../sim/types';
import { RobotIcon } from './RobotIcon';

interface ConveyorProps {
  /** Jobs currently waiting on the next machine (what the belt is carrying). */
  jobs: Job[];
  /** True when the upstream machine is actively pushing product. */
  active: boolean;
  label: string;
}

const SHOWN = 4;

/**
 * Animated conveyor between machines, carrying the actual queued units the
 * simulation has produced. Tokens are the real robot models waiting on the
 * next machine, so an empty buffer means a visibly empty belt — no fake motion.
 */
export function Conveyor({ jobs, active, label }: ConveyorProps) {
  const busy = active && jobs.length > 0;
  const duration = `${busy ? 1.6 : 2.6}s`;
  const shown = jobs.slice(0, SHOWN);
  return (
    <div className="conveyor" role="img" aria-label={label}>
      <div className={`conveyor-belt${busy ? ' belt-moving' : ''}`} />
      {shown.map((job, i) => (
        <span
          key={job.id}
          className={`conveyor-item${busy ? '' : ' item-idle'}`}
          style={{
            animationDuration: duration,
            animationDelay: busy ? `${(i / SHOWN) * parseFloat(duration)}s` : undefined,
          }}
        >
          <RobotIcon type={job.type} size={16} />
        </span>
      ))}
      {jobs.length > SHOWN && (
        <span className="conveyor-more">+{formatNumber(jobs.length - SHOWN)}</span>
      )}
      <div className="conveyor-frame" aria-hidden="true" />
    </div>
  );
}