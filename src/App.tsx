import { useEffect, useState } from 'react';
import { EventBanner } from './components/EventBanner';
import { EventLog } from './components/EventLog';
import { FactoryControls } from './components/FactoryControls';
import { Header } from './components/Header';
import { HelpOverlay } from './components/HelpOverlay';
import { OrdersPanel } from './components/OrdersPanel';
import { ProductionLine } from './components/ProductionLine';
import { ReportModal } from './components/ReportModal';
import { StatsPanel } from './components/StatsPanel';
import { Tour } from './components/Tour';
import { useFactory } from './hooks/useFactory';
import { hasSeenTour } from './utils/tutorial';

export default function App() {
  const {
    state,
    addOrder,
    cancelOrder,
    reorderOrder,
    upgrade,
    repair,
    setOverclock,
    emergencyCool,
    salvage,
    buyOutEvent,
    setSpeed,
    setPaused,
    setMaterial,
    setSound,
    reset,
  } = useFactory();

  const [showHelp, setShowHelp] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [tourActive, setTourActive] = useState(() => !hasSeenTour());

  // Keyboard shortcuts: 1/2/3 game speed, Space pause/resume, ? help.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tourActive) return; // let the tour own the keyboard while it is up
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (e.key === '1') setSpeed(1);
      else if (e.key === '2') setSpeed(2);
      else if (e.key === '3') setSpeed(3);
      else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        setPaused(!state.settings.paused);
      } else if (e.key === '?') setShowHelp((v) => !v);
      else if (e.key === 'h' || e.key === 'H') setShowHelp((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setSpeed, setPaused, state.settings.paused, tourActive]);

  return (
    <div className="app">
      <Header
        state={state}
        onToggleSound={() => setSound(!state.settings.sound)}
        onOpenHelp={() => setShowHelp(true)}
        onOpenReport={() => setShowReport(true)}
      />
      <EventBanner state={state} onBuyOut={buyOutEvent} />
      <div className="workspace">
        <ProductionLine
          state={state}
          onUpgrade={upgrade}
          onRepair={repair}
          onSetOverclock={setOverclock}
          onCool={emergencyCool}
          onSalvage={salvage}
        />
        <OrdersPanel
          state={state}
          onAddOrder={addOrder}
          onSetMaterial={setMaterial}
          onCancelOrder={cancelOrder}
          onReorderOrder={reorderOrder}
        />
      </div>
      <div className="lower">
        <StatsPanel state={state} />
        <EventLog state={state} />
      </div>
      <FactoryControls state={state} onSetSpeed={setSpeed} onSetPaused={setPaused} onReset={reset} />
      {tourActive && <Tour state={state} onClose={() => setTourActive(false)} />}
      {showHelp && (
        <HelpOverlay
          onClose={() => setShowHelp(false)}
          onStartTour={() => {
            setShowHelp(false);
            setTourActive(true);
          }}
        />
      )}
      {showReport && <ReportModal state={state} onClose={() => setShowReport(false)} />}
    </div>
  );
}