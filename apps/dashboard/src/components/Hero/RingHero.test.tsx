import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RingHero } from './RingHero';
import type { HealthData } from '../../types';

const mockHealthData: HealthData = {
  percentage: 94,
  componentsAligned: 47,
  componentsTotal: 52,
  alertCount: 2,
  trend: {
    direction: 'up',
    percentage: 3,
  },
  lastSyncAt: new Date().toISOString(),
};

describe('RingHero', () => {
  it('renders the health percentage', () => {
    render(<RingHero health={mockHealthData} />);
    expect(screen.getByText('94%')).toBeInTheDocument();
  });

  it('renders the component count', () => {
    render(<RingHero health={mockHealthData} />);
    expect(screen.getByText('47')).toBeInTheDocument();
    expect(screen.getByText('52')).toBeInTheDocument();
    expect(screen.getByText('components aligned')).toBeInTheDocument();
  });

  it('renders inbox item count', () => {
    render(<RingHero health={mockHealthData} />);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('inbox items')).toBeInTheDocument();
  });

  it('renders positive health message for high percentage', () => {
    render(<RingHero health={mockHealthData} />);
    expect(screen.getByText('Your design system is looking great today')).toBeInTheDocument();
  });

  it('renders moderate message for medium percentage', () => {
    const moderateHealth = { ...mockHealthData, percentage: 75 };
    render(<RingHero health={moderateHealth} />);
    expect(screen.getByText('Doing well, a few things to check')).toBeInTheDocument();
  });

  it('renders encouraging message for low percentage', () => {
    const lowHealth = { ...mockHealthData, percentage: 50 };
    render(<RingHero health={lowHealth} />);
    expect(screen.getByText("Needs some love — let's fix it together")).toBeInTheDocument();
  });

  it('renders trend when provided', () => {
    render(<RingHero health={mockHealthData} />);
    expect(screen.getByText(/↑ 3%/)).toBeInTheDocument();
    expect(screen.getByText('this week')).toBeInTheDocument();
  });

  it('handles missing trend gracefully', () => {
    const healthWithoutTrend = { ...mockHealthData, trend: undefined };
    render(<RingHero health={healthWithoutTrend} />);
    expect(screen.queryByText('this week')).not.toBeInTheDocument();
  });

  it('renders correct number of filled segments based on percentage', () => {
    render(<RingHero health={mockHealthData} />);
    // 94% of 5 segments = ~4.7, rounded to 5 filled segments
    const segments = screen.getAllByText('●');
    expect(segments.length).toBe(5);
  });
});
