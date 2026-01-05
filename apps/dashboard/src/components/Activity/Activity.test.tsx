import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Activity } from './Activity';
import type { ActivityItem } from '../../types';

const mockItems: ActivityItem[] = [
  {
    id: 'activity-1',
    type: 'component-added',
    description: '<CardHeader> added to system by you',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    success: true,
  },
  {
    id: 'activity-2',
    type: 'guardrail-caught',
    description: 'Guardrail caught 5px border-radius, dev fixed it',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    success: true,
  },
  {
    id: 'activity-3',
    type: 'marked-one-off',
    description: '<DataTable> marked as one-off',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    success: false,
  },
];

describe('Activity', () => {
  it('renders the title', () => {
    render(<Activity items={mockItems} />);
    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
  });

  it('renders View All button', () => {
    render(<Activity items={mockItems} />);
    expect(screen.getByText('View All →')).toBeInTheDocument();
  });

  it('renders all activity items', () => {
    render(<Activity items={mockItems} />);
    expect(screen.getByText('<CardHeader> added to system by you')).toBeInTheDocument();
    expect(screen.getByText('Guardrail caught 5px border-radius, dev fixed it')).toBeInTheDocument();
    expect(screen.getByText('<DataTable> marked as one-off')).toBeInTheDocument();
  });

  it('shows checkmark for successful items', () => {
    render(<Activity items={mockItems} />);
    const checkmarks = screen.getAllByText('✓');
    expect(checkmarks).toHaveLength(2); // Two successful items
  });

  it('shows circle for non-successful items', () => {
    render(<Activity items={mockItems} />);
    expect(screen.getByText('○')).toBeInTheDocument();
  });

  it('renders relative time for items', () => {
    render(<Activity items={mockItems} />);
    expect(screen.getByText('2 days ago')).toBeInTheDocument();
    expect(screen.getByText('3 days ago')).toBeInTheDocument();
    expect(screen.getByText('5 days ago')).toBeInTheDocument();
  });
});
