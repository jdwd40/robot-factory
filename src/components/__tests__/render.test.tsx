// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addOrder } from '../../sim/factory';
import { richState } from '../../sim/__tests__/helpers';
import { clearTourSeen, hasSeenTour } from '../../utils/tutorial';
import { Header } from '../Header';
import { HelpOverlay } from '../HelpOverlay';
import { ReportModal } from '../ReportModal';
import { Tour } from '../Tour';

// happy-dom in this setup ships no localStorage, so provide a minimal one.
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  clearTourSeen();
});

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

const noop = () => {};

describe('component smoke render', () => {
  it('renders the header brand and credits stat', () => {
    const s = richState();
    render(<Header state={s} onToggleSound={noop} onOpenHelp={noop} onOpenReport={noop} />);
    expect(screen.getByText(/ROBOT WORKS/i)).toBeTruthy();
    expect(screen.getByText(/1_000_000|1,000,000/)).toBeTruthy();
  });

  it('exposes sound, report and help controls', () => {
    const s = richState();
    render(<Header state={s} onToggleSound={noop} onOpenHelp={noop} onOpenReport={noop} />);
    expect(screen.getByRole('button', { name: /sound/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /report/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /play/i })).toBeTruthy();
  });

  it('renders the help overlay', () => {
    render(<HelpOverlay onClose={noop} />);
    expect(screen.getByRole('heading', { name: /How to Play/i })).toBeTruthy();
  });

  it('renders the report modal', () => {
    const s = richState();
    render(<ReportModal state={s} onClose={noop} />);
    expect(screen.getByRole('heading', { name: /Run Report/i })).toBeTruthy();
  });
});

describe('guided tutorial', () => {
  it('opens on a centered welcome card and skips to the first order step', () => {
    vi.useFakeTimers();
    render(<Tour state={richState()} onClose={noop} delayMs={0} />);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('dialog', { name: /tutorial/i })).toBeTruthy();
    expect(screen.getByText(/Welcome to Robot Works/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByText(/Place your first order/i)).toBeTruthy();
  });

  it('auto-advances past the order step once a robot is ordered', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Tour state={richState()} onClose={noop} delayMs={0} />);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByText(/Place your first order/i)).toBeTruthy();

    const ordered = addOrder(richState(), 'worker').state;
    act(() => {
      rerender(<Tour state={ordered} onClose={noop} delayMs={0} />);
    });
    expect(screen.getByText(/Watch it roll down the line/i)).toBeTruthy();
  });

  it('skip closes the tour and persists the seen flag', () => {
    vi.useFakeTimers();
    expect(hasSeenTour()).toBe(false);
    const onClose = vi.fn();
    render(<Tour state={richState()} onClose={onClose} delayMs={0} />);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    fireEvent.click(screen.getByRole('button', { name: /Skip tour/i }));
    expect(onClose).toHaveBeenCalled();
    expect(hasSeenTour()).toBe(true);
  });
});

describe('help overlay replay button', () => {
  it('exposes a replay-tutorial button only when provided', () => {
    const onStartTour = vi.fn();
    render(<HelpOverlay onClose={noop} onStartTour={onStartTour} />);
    fireEvent.click(screen.getByRole('button', { name: /Replay tutorial/i }));
    expect(onStartTour).toHaveBeenCalled();
  });

  it('omits the replay button when no handler is supplied', () => {
    render(<HelpOverlay onClose={noop} />);
    expect(screen.queryByRole('button', { name: /Replay tutorial/i })).toBeNull();
  });
});
