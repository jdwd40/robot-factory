import { ROBOT_CONFIG } from '../sim/config';
import type { RobotId } from '../sim/types';

interface RobotIconProps {
  type: RobotId;
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Distinct inline robot silhouettes per model, tinted by the model's accent
 * colour. Kept as minimal geometric shapes to match the control-room aesthetic.
 */
export function RobotIcon({ type, size = 40, className, title }: RobotIconProps) {
  const color = ROBOT_CONFIG[type].color;
  const dark = '#0e1114';
  const visor = '#ffd08a';
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title ?? ROBOT_CONFIG[type].name}
      style={{ color }}
    >
      {type === 'worker' && (
        <g fill="currentColor">
          <line x1="24" y1="9" x2="24" y2="3" stroke="currentColor" strokeWidth="2" />
          <circle cx="24" cy="2.5" r="1.6" fill={visor} />
          <rect x="11" y="9" width="26" height="22" rx="4" />
          <rect x="15" y="15" width="6" height="6" fill={dark} />
          <rect x="27" y="15" width="6" height="6" fill={dark} />
          <rect x="17" y="24" width="14" height="3" rx="1.5" fill={dark} />
        </g>
      )}
      {type === 'explorer' && (
        <g fill="currentColor">
          <line x1="24" y1="13" x2="24" y2="4" stroke="currentColor" strokeWidth="2" />
          <circle cx="24" cy="3" r="2" fill={visor} />
          <polygon points="24,5 37,18 24,31 11,18" />
          <circle cx="24" cy="18" r="5" fill={dark} />
          <circle cx="24" cy="18" r="2.2" fill={visor} />
          <rect x="12" y="33" width="24" height="4" rx="2" fill={dark} />
        </g>
      )}
      {type === 'combat' && (
        <g fill="currentColor">
          <polygon points="11,12 30,6 39,18 30,31 11,29" />
          <polygon points="15,15 33,11 35,19 33,26 15,24" fill={dark} />
          <polygon points="18,17 31,14 31,20 18,22" fill={visor} />
          <rect x="12" y="34" width="24" height="4" rx="2" fill={dark} />
          <rect x="8" y="36" width="4" height="5" rx="1" fill="currentColor" />
          <rect x="36" y="36" width="4" height="5" rx="1" fill="currentColor" />
        </g>
      )}
    </svg>
  );
}