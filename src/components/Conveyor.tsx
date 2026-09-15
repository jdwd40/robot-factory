interface ConveyorProps {
  /** 0..1 how full the downstream flow is — drives belt speed. */
  flow: number;
  label: string;
}

/**
 * Animated conveyor belt between two machines. Pure CSS animation; `flow`
 * scales the animation duration so a starved belt visibly slows down.
 */
export function Conveyor({ flow, label }: ConveyorProps) {
  const duration = `${Math.max(0.8, 3 - flow * 2.4).toFixed(2)}s`;
  return (
    <div className="conveyor" role="img" aria-label={label}>
      <div className="conveyor-belt" style={{ animationDuration: duration }} />
      <div className="conveyor-frame" aria-hidden="true" />
    </div>
  );
}
