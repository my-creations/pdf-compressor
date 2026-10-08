import { describe, it, expect } from 'bun:test';
import {
  MB, formatMB, formatSize, calculateReduction, parseTargetMB, targetBytesFor,
  targetLabel, outputFileName, baseName, uniqueNames,
} from '../../src/engine/format.js';

describe('formatMB / formatSize', () => {
  it('formats megabytes with two decimals', () => {
    expect(formatMB(0)).toBe('0.00 MB');
    expect(formatMB(MB)).toBe('1.00 MB');
    expect(formatMB(8808038)).toBe('8.40 MB');
  });

  it('handles invalid values', () => {
    expect(formatMB(-1)).toBe('0.00 MB');
    expect(formatMB(NaN)).toBe('0.00 MB');
    expect(formatMB(undefined)).toBe('0.00 MB');
  });

  it('uses KB below 1 MB', () => {
    expect(formatSize(20 * 1024)).toBe('20 KB');
    expect(formatSize(100)).toBe('1 KB');
    expect(formatSize(3 * MB)).toBe('3.00 MB');
  });
});

describe('calculateReduction', () => {
  it('computes whole percentages', () => {
    expect(calculateReduction(10 * MB, 2 * MB)).toBe(80);
    expect(calculateReduction(4 * MB, MB)).toBe(75);
  });

  it('never goes negative', () => {
    expect(calculateReduction(0, 100)).toBe(0);
    expect(calculateReduction(100, 200)).toBe(0);
  });
});

describe('targets', () => {
  it('parses decimal comma and dot', () => {
    expect(parseTargetMB('1,5')).toBe(1.5);
    expect(parseTargetMB(' 3 ')).toBe(3);
    expect(parseTargetMB(2)).toBe(2);
  });

  it('rejects unusable values', () => {
    expect(parseTargetMB('abc')).toBeNull();
    expect(parseTargetMB('0')).toBeNull();
    expect(parseTargetMB('1000')).toBeNull();
    expect(parseTargetMB('')).toBeNull();
  });

  it('aims below both binary and decimal megabytes', () => {
    const bytes = targetBytesFor(2);
    expect(bytes).toBeLessThan(2 * MB);
    expect(bytes).toBeLessThanOrEqual(2_000_000);
    expect(bytes).toBeGreaterThan(1.8 * MB);
  });

  it('labels targets', () => {
    expect(targetLabel(2)).toBe('2 MB');
    expect(targetLabel(1.5)).toBe('1.5 MB');
  });
});

describe('file names', () => {
  it('builds output names', () => {
    expect(outputFileName('Relatório.PDF', 2)).toBe('Relatório_2MB.pdf');
    expect(outputFileName('foto.jpg', 1.5, '_junto')).toBe('foto_junto_1.5MB.pdf');
  });

  it('strips unsafe characters', () => {
    expect(baseName('a/b:c?.pdf')).toBe('a_b_c_');
    expect(baseName('')).toBe('documento');
  });

  it('deduplicates names', () => {
    expect(uniqueNames(['a.pdf', 'a.pdf', 'b.pdf', 'a.pdf'])).toEqual(['a.pdf', 'a (2).pdf', 'b.pdf', 'a (3).pdf']);
  });
});
