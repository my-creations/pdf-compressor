import { describe, it, expect } from 'bun:test';
import { messages, detectLanguage, t, tn } from '../../src/i18n.js';

describe('i18n', () => {
  it('has the same keys in every language', () => {
    const pt = Object.keys(messages.pt).sort();
    const en = Object.keys(messages.en).sort();
    expect(en).toEqual(pt);
  });

  it('uses the same placeholders in every language', () => {
    const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
    for (const key of Object.keys(messages.pt)) {
      expect(`${key}:${vars(messages.en[key])}`).toBe(`${key}:${vars(messages.pt[key])}`);
    }
  });

  it('detects language from saved choice, then browser, then defaults to Portuguese', () => {
    expect(detectLanguage('en', ['pt-PT'])).toBe('en');
    expect(detectLanguage(null, ['en-GB', 'pt'])).toBe('en');
    expect(detectLanguage(null, ['pt-BR'])).toBe('pt');
    expect(detectLanguage(null, ['de-DE', 'fr'])).toBe('pt');
    expect(detectLanguage('xx', [])).toBe('pt');
  });

  it('interpolates and pluralises', () => {
    expect(t('cta.compress', { size: '2 MB' }, 'pt')).toBe('Comprimir para menos de 2 MB');
    expect(t('cta.compress', { size: '2 MB' }, 'en')).toBe('Compress to under 2 MB');
    expect(tn('ws.pages', 1, {}, 'pt')).toBe('1 página');
    expect(tn('ws.pages', 3, {}, 'en')).toBe('3 pages');
    expect(t('missing.key')).toBe('missing.key');
  });
});
