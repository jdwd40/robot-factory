import type { FactoryState } from '../sim/types';

interface FactoryControlsProps {
  state: FactoryState;
  onSetSpeed: (speed: 1 | 2 | 3) => void;
  onSetPaused: (paused: boolean) => void;
  onReset: () => void;
}

export function FactoryControls({ state, onSetSpeed, onSetPaused, onReset }: FactoryControlsProps) {
  const speeds: Array<1 | 2 | 3> = [1, 2, 3];
  const paused = state.settings.paused;
  const doReset = () => {
    if (window.confirm('Reset the factory? All orders, upgrades and credits will be lost.')) {
      onReset();
    }
  };
  return (
    <footer className="controls">
      <div className="controls-group" role="group" aria-label="Game speed">
        <span className="controls-label">Game speed</span>
        {speeds.map((spd) => (
          <button
            key={spd}
            type="button"
            className={`speed-btn${state.settings.gameSpeed === spd ? ' speed-active' : ''}`}
            aria-pressed={state.settings.gameSpeed === spd}
            onClick={() => onSetSpeed(spd)}
          >
            {spd}×
          </button>
        ))}
      </div>
      <button
        type="button"
        className={`pause-btn${paused ? ' pause-active' : ''}`}
        aria-pressed={paused}
        onClick={() => onSetPaused(!paused)}
        title={paused ? 'Resume (Space)' : 'Pause (Space)'}
      >
        {paused ? 'Resume' : 'Pause'}
      </button>
      <button type="button" className="reset-btn" onClick={doReset}>
        Reset Factory
      </button>
    </footer>
  );
}