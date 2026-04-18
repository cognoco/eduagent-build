// apps/api/src/services/quiz/mastery-keys.test.ts
import {
  computeCapitalsItemKey,
  computeGuessWhoItemKey,
  bucketEra,
  normalizeName,
  stripDiacritics,
} from './mastery-keys';

describe('mastery-keys', () => {
  describe('stripDiacritics', () => {
    it('removes diacritical marks', () => {
      expect(stripDiacritics('René')).toBe('Rene');
      expect(stripDiacritics('Dvořák')).toBe('Dvorak');
    });

    it('leaves ASCII unchanged', () => {
      expect(stripDiacritics('Newton')).toBe('Newton');
    });
  });

  describe('normalizeName', () => {
    it('lowercases, trims, and strips diacritics', () => {
      expect(normalizeName(' René Descartes ')).toBe('rene descartes');
    });
  });

  describe('bucketEra', () => {
    it('maps century strings', () => {
      expect(bucketEra('17th century')).toBe('17c');
      expect(bucketEra('1st century')).toBe('1c');
    });

    it('maps decade-style strings', () => {
      expect(bucketEra('1600s')).toBe('17c');
      expect(bucketEra('1900s')).toBe('20c');
    });

    it('maps range-style strings', () => {
      expect(bucketEra('1600-1699')).toBe('17c');
    });

    it('maps BCE century strings', () => {
      expect(bucketEra('5th century bce')).toBe('bce-5c');
    });

    it('returns unknown for null/undefined/unparseable', () => {
      expect(bucketEra(null)).toBe('unknown');
      expect(bucketEra(undefined)).toBe('unknown');
      expect(bucketEra('long ago')).toBe('unknown');
    });
  });

  describe('computeCapitalsItemKey', () => {
    it('lowercases and trims', () => {
      expect(computeCapitalsItemKey(' Slovakia ')).toBe('slovakia');
      expect(computeCapitalsItemKey('GERMANY')).toBe('germany');
    });
  });

  describe('computeGuessWhoItemKey', () => {
    it('produces 16-char hex hash', () => {
      const key = computeGuessWhoItemKey('Isaac Newton', '17th century');
      expect(key).toHaveLength(16);
      expect(key).toMatch(/^[0-9a-f]{16}$/);
    });

    it('17th century / 1600s / 1600-1699 all hash to same key', () => {
      const a = computeGuessWhoItemKey('Isaac Newton', '17th century');
      const b = computeGuessWhoItemKey('Isaac Newton', '1600s');
      const c = computeGuessWhoItemKey('Isaac Newton', '1600-1699');
      expect(a).toBe(b);
      expect(b).toBe(c);
    });

    it('diacritics do not affect hash', () => {
      const a = computeGuessWhoItemKey('René Descartes', '17th century');
      const b = computeGuessWhoItemKey('Rene Descartes', '17th century');
      expect(a).toBe(b);
    });

    it('different eras produce different keys', () => {
      const a = computeGuessWhoItemKey('Plato', '5th century bce');
      const b = computeGuessWhoItemKey('Plato', '4th century bce');
      expect(a).not.toBe(b);
    });

    it('missing era maps to unknown bucket', () => {
      const a = computeGuessWhoItemKey('Someone', null);
      const b = computeGuessWhoItemKey('Someone', undefined);
      expect(a).toBe(b);
    });
  });
});
