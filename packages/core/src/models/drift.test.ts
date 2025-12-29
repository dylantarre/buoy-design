// packages/core/src/models/drift.test.ts
import { describe, it, expect } from 'vitest';
import {
  createDriftId,
  getSeverityWeight,
  getDefaultSeverity,
} from './drift.js';

describe('drift model helpers', () => {
  describe('createDriftId', () => {
    it('creates id with source only', () => {
      const id = createDriftId('hardcoded-value', 'component-123');
      expect(id).toBe('drift:hardcoded-value:component-123');
    });

    it('creates id with source and target', () => {
      const id = createDriftId('semantic-mismatch', 'src-1', 'tgt-2');
      expect(id).toBe('drift:semantic-mismatch:src-1:tgt-2');
    });
  });

  describe('getSeverityWeight', () => {
    it('returns 3 for critical', () => {
      expect(getSeverityWeight('critical')).toBe(3);
    });

    it('returns 2 for warning', () => {
      expect(getSeverityWeight('warning')).toBe(2);
    });

    it('returns 1 for info', () => {
      expect(getSeverityWeight('info')).toBe(1);
    });
  });

  describe('getDefaultSeverity', () => {
    it('returns critical for accessibility-conflict', () => {
      expect(getDefaultSeverity('accessibility-conflict')).toBe('critical');
    });

    it('returns warning for hardcoded-value', () => {
      expect(getDefaultSeverity('hardcoded-value')).toBe('warning');
    });

    it('returns info for naming-inconsistency', () => {
      expect(getDefaultSeverity('naming-inconsistency')).toBe('info');
    });
  });
});
