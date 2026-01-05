import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatRelativeTime, formatPercentage } from './format';

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-04T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for times less than a minute ago', () => {
    const date = new Date('2026-01-04T11:59:45Z').toISOString();
    expect(formatRelativeTime(date)).toBe('just now');
  });

  it('returns minutes for times less than an hour ago', () => {
    const date = new Date('2026-01-04T11:30:00Z').toISOString();
    expect(formatRelativeTime(date)).toBe('30 min ago');
  });

  it('returns hours for times less than a day ago', () => {
    const date = new Date('2026-01-04T08:00:00Z').toISOString();
    expect(formatRelativeTime(date)).toBe('4 hours ago');
  });

  it('returns "1 hour ago" for singular hour', () => {
    const date = new Date('2026-01-04T11:00:00Z').toISOString();
    expect(formatRelativeTime(date)).toBe('1 hour ago');
  });

  it('returns "yesterday" for times from yesterday', () => {
    const date = new Date('2026-01-03T12:00:00Z').toISOString();
    expect(formatRelativeTime(date)).toBe('yesterday');
  });

  it('returns days for times within a week', () => {
    const date = new Date('2026-01-01T12:00:00Z').toISOString();
    expect(formatRelativeTime(date)).toBe('3 days ago');
  });

  it('returns formatted date for times over a week ago', () => {
    const date = new Date('2025-12-20T12:00:00Z').toISOString();
    expect(formatRelativeTime(date)).toBe('Dec 20');
  });
});

describe('formatPercentage', () => {
  it('formats whole numbers', () => {
    expect(formatPercentage(94)).toBe('94%');
  });

  it('rounds decimal numbers', () => {
    expect(formatPercentage(94.6)).toBe('95%');
    expect(formatPercentage(94.4)).toBe('94%');
  });

  it('handles zero', () => {
    expect(formatPercentage(0)).toBe('0%');
  });

  it('handles 100', () => {
    expect(formatPercentage(100)).toBe('100%');
  });
});
