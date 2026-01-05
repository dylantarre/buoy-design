import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardsHero } from './CardsHero';
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

describe('CardsHero', () => {
  it('renders personalized greeting with user name', () => {
    render(<CardsHero health={mockHealthData} userName="Alex" />);
    // Just check that the name appears in a greeting
    expect(screen.getByText(/Alex/)).toBeInTheDocument();
    expect(screen.getByText(/Good (morning|afternoon|evening), Alex/)).toBeInTheDocument();
  });

  it('uses default greeting when no user name provided', () => {
    render(<CardsHero health={mockHealthData} />);
    expect(screen.getByText(/Good (morning|afternoon|evening), there/)).toBeInTheDocument();
  });

  it('renders a time-appropriate greeting', () => {
    render(<CardsHero health={mockHealthData} userName="Alex" />);
    // The greeting should be one of the three options
    const greetingElement = screen.getByRole('heading', { level: 1 });
    expect(greetingElement.textContent).toMatch(/Good (morning|afternoon|evening), Alex/);
  });

  it('renders health percentage card', () => {
    render(<CardsHero health={mockHealthData} />);
    expect(screen.getByText('94%')).toBeInTheDocument();
    expect(screen.getByText('System Health')).toBeInTheDocument();
  });

  it('renders components card', () => {
    render(<CardsHero health={mockHealthData} />);
    expect(screen.getByText('47/52')).toBeInTheDocument();
    expect(screen.getByText('Components Live')).toBeInTheDocument();
  });

  it('renders inbox card', () => {
    render(<CardsHero health={mockHealthData} />);
    expect(screen.getByText('2 items')).toBeInTheDocument();
    expect(screen.getByText('Need Your Eye')).toBeInTheDocument();
  });

  it('renders guardrails card', () => {
    render(<CardsHero health={mockHealthData} />);
    expect(screen.getByText('12 caught')).toBeInTheDocument();
    expect(screen.getByText('By Guardrails')).toBeInTheDocument();
  });

  it('shows trend with up arrow for positive trend', () => {
    render(<CardsHero health={mockHealthData} />);
    expect(screen.getByText(/↑ 3% this week/)).toBeInTheDocument();
  });

  it('has sync button', () => {
    render(<CardsHero health={mockHealthData} />);
    expect(screen.getByText('Sync ↻')).toBeInTheDocument();
  });
});
