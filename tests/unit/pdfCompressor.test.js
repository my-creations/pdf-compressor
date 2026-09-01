import { describe, it, expect } from 'bun:test';
import { formatMB, TARGET_MAX_BYTES, calculateReduction } from '../../src/pdfCompressor.js';

describe('PDF Compressor Unit Tests', () => {
  describe('formatMB', () => {
    it('should format 0 bytes correctly', () => {
      expect(formatMB(0)).toBe('0.00 MB');
    });

    it('should format 1 MB (1048576 bytes) correctly', () => {
      expect(formatMB(1024 * 1024)).toBe('1.00 MB');
    });

    it('should format 2.5 MB correctly', () => {
      expect(formatMB(2.5 * 1024 * 1024)).toBe('2.50 MB');
    });

    it('should format arbitrary byte numbers with two decimal places', () => {
      expect(formatMB(8808038)).toBe('8.40 MB');
    });

    it('should handle negative and invalid values gracefully', () => {
      expect(formatMB(-100)).toBe('0.00 MB');
      expect(formatMB(NaN)).toBe('0.00 MB');
      expect(formatMB(undefined)).toBe('0.00 MB');
    });
  });

  describe('calculateReduction', () => {
    it('should calculate reduction percentage correctly', () => {
      // 10 MB to 2 MB = 80% reduction
      expect(calculateReduction(10 * 1024 * 1024, 2 * 1024 * 1024)).toBe(80);
      // 4 MB to 1 MB = 75% reduction
      expect(calculateReduction(4 * 1024 * 1024, 1 * 1024 * 1024)).toBe(75);
    });

    it('should handle zero or negative edge cases without throwing', () => {
      expect(calculateReduction(0, 100)).toBe(0);
      expect(calculateReduction(100, 200)).toBe(0);
    });
  });

  describe('TARGET_MAX_BYTES', () => {
    it('should be strictly less than 2.0 MB (2097152 bytes)', () => {
      const TWO_MB = 2 * 1024 * 1024;
      expect(TARGET_MAX_BYTES).toBeLessThan(TWO_MB);
      expect(TARGET_MAX_BYTES).toBeGreaterThanOrEqual(1.5 * 1024 * 1024);
    });
  });
});
