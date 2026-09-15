interface FactoryControlsProps {
  onReset: () => void;
}

/** Visually understated reset control — deliberately not a prominent button. */
export function FactoryControls({ onReset }: FactoryControlsProps) {
  return (
    <footer className="controls">
      <button type="button" className="reset-btn" onClick={onReset}>
        Reset Factory
      </button>
    </footer>
  );
}
