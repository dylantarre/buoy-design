import { describe, it, expect, beforeEach } from 'vitest';
import { useDashboardStore } from './dashboard';

describe('useDashboardStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useDashboardStore.setState({ style: 'ring' });
  });

  it('has default style of ring', () => {
    const { style } = useDashboardStore.getState();
    expect(style).toBe('ring');
  });

  it('can change style to bar', () => {
    useDashboardStore.getState().setStyle('bar');
    expect(useDashboardStore.getState().style).toBe('bar');
  });

  it('can change style to cards', () => {
    useDashboardStore.getState().setStyle('cards');
    expect(useDashboardStore.getState().style).toBe('cards');
  });

  it('can change back to ring', () => {
    useDashboardStore.getState().setStyle('cards');
    useDashboardStore.getState().setStyle('ring');
    expect(useDashboardStore.getState().style).toBe('ring');
  });
});
