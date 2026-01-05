import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Inbox } from './Inbox';
import type { InboxItem } from '../../types';

const mockItems: InboxItem[] = [
  {
    id: 'inbox-1',
    type: 'new-component',
    title: 'New component: <ProductBadge>',
    description: 'AI created this during the sprint.',
    createdAt: new Date().toISOString(),
    metadata: {
      filePath: 'src/components/ProductBadge.tsx',
      prNumber: 482,
      author: 'jamie',
    },
  },
  {
    id: 'inbox-2',
    type: 'undefined-token',
    title: 'Undefined token: #3B82F6',
    description: 'This blue is not in your palette.',
    createdAt: new Date().toISOString(),
    metadata: {
      tokenValue: '#3B82F6',
      closestToken: '--color-blue-500',
    },
  },
];

describe('Inbox', () => {
  it('renders the title', () => {
    render(<Inbox items={mockItems} onAction={vi.fn()} />);
    expect(screen.getByText('Needs Your Eye')).toBeInTheDocument();
  });

  it('renders item count in title', () => {
    render(<Inbox items={mockItems} onAction={vi.fn()} />);
    expect(screen.getByText('(2)')).toBeInTheDocument();
  });

  it('renders all inbox items', () => {
    render(<Inbox items={mockItems} onAction={vi.fn()} />);
    expect(screen.getByText('New component: <ProductBadge>')).toBeInTheDocument();
    expect(screen.getByText('Undefined token: #3B82F6')).toBeInTheDocument();
  });

  it('renders empty state when no items', () => {
    render(<Inbox items={[]} onAction={vi.fn()} />);
    expect(screen.getByText('All caught up! Nothing needs your attention right now.')).toBeInTheDocument();
  });

  it('does not show count when empty', () => {
    render(<Inbox items={[]} onAction={vi.fn()} />);
    expect(screen.queryByText('(0)')).not.toBeInTheDocument();
  });

  it('shows View all button when items exist', () => {
    render(<Inbox items={mockItems} onAction={vi.fn()} />);
    expect(screen.getByText('View all →')).toBeInTheDocument();
  });

  it('does not show View all when empty', () => {
    render(<Inbox items={[]} onAction={vi.fn()} />);
    expect(screen.queryByText('View all →')).not.toBeInTheDocument();
  });

  it('calls onAction when action button is clicked', () => {
    const onAction = vi.fn();
    render(<Inbox items={mockItems} onAction={onAction} />);

    const addButton = screen.getByText('Add to System ✓');
    fireEvent.click(addButton);

    expect(onAction).toHaveBeenCalledWith('inbox-1', 'add-to-system');
  });
});
