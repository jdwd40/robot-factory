// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { richState } from '../../sim/__tests__/helpers';
import { Header } from '../Header';
import { HelpOverlay } from '../HelpOverlay';
import { ReportModal } from '../ReportModal';

afterEach(cleanup);

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
