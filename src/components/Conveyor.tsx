interface ConveyorProps {
  /** 0..1 how full the downstream flow is — drives belt speed and item rate. */
  flow: number;
  label: string;
}

const ITEM_COUNT = 3;

/**
 * Animated conveyor belt between two machines, carrying discrete items.
 * Pure CSS animation: items travel left → right with staggered negative
 * delays so they are spread along the belt. `flow` scales the travel
 * duration, and when the stage is starved (flow ≈ 0) no items render at
 * all — the belt is visibly empty, matching the simulation state.
 */
export function Conveyor({ flow, label }: ConveyorProps) {
  const duration = `${Math.max(0.8, 3 - flow * 2.4).toFixed(2)}s`;
  const active = flow > 0.02;
  return (
    <div className="conveyor" role="img" aria-label={label}>
      <div className="conveyor-belt" style={{ animationDuration: duration }} />
      {active &&
        Array.from({ length: ITEM_COUNT }, (_, i) => (
          <div
            key={i}
            className="conveyor-item"
            style={{
              animationDuration: duration,
              animationDelay: `${(-(i / ITEM_COUNT) * parseFloat(duration)).toFixed(2)}s`,
            }}
          />
        ))}
      <div className="conveyor-frame" aria-hidden="true" />
    </div>
  );
}
