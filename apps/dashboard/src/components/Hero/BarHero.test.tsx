import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BarHero } from './BarHero';
import type { HealthData } from '../../types';

const mockHealthData: HealthData = {
  percentage: 87,
  componentsAligned: 47,
  componentsTotal: 52,
  alertCount: 3,
  trend: {
    direction: 'up',
    percentage: 12,
  },
  lastSyncAt: new Date().toISOString(),
};

describe('BarHero', () => {
  it('renders the title', () => {
    render(<BarHero health={mockHealthData} />);
    expect(screen.getByText('Your Design System Health')).toBeInTheDocument();
  });

  it('renders the health percentage', () => {
    render(<BarHero health={mockHealthData} />);
    expect(screen.getByText('87%')).toBeInTheDocument();
  });

  it('renders component alignment stats', () => {
    render(<BarHero health={mockHealthData} />);
    expect(screen.getByText('47')).toBeInTheDocument();
    expect(screen.getByText('/ 52')).toBeInTheDocument();
    expect(screen.getByText('components aligned')).toBeInTheDocument();
  });

  it('renders alert count', () => {
    render(<BarHero health={mockHealthData} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('need attention')).toBeInTheDocument();
  });

  it('renders sync status', () => {
    render(<BarHero health={mockHealthData} />);
    expect(screen.getByText(/Last scan:/)).toBeInTheDocument();
    expect(screen.getByText(/Next auto-scan:/)).toBeInTheDocument();
  });

  it('has a progress bar with correct width', () => {
    const { container } = render(<BarHero health={mockHealthData} />);
    const barFill = container.querySelector('[class*="barFill"]');
    expect(barFill).toHaveStyle({ width: '87%' });
  });
});
