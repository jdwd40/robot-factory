import { FactoryControls } from './components/FactoryControls';
import { Header } from './components/Header';
import { ProductionLine } from './components/ProductionLine';
import { useFactory } from './hooks/useFactory';

export default function App() {
  const { state, upgrade, reset } = useFactory();
  return (
    <div className="app">
      <Header state={state} />
      <ProductionLine state={state} onUpgrade={upgrade} />
      <FactoryControls onReset={reset} />
    </div>
  );
}
