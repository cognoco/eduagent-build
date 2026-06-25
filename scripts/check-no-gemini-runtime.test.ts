import {
  scanContent,
  diffAgainstBaseline,
  TOKEN_RULES,
  type BaselineEntry,
} from './check-no-gemini-runtime';

describe('check-no-gemini-runtime', () => {
  describe('scanContent', () => {
    it('detects each Gemini token class', () => {
      const content = [
        `const a = { provider: 'gemini', model: 'x' };`,
        `const b = { preferredProvider: 'gemini' };`,
        `const policy = 'gemini_only';`,
        `const m = 'gemini-2.5-flash';`,
        `import { createGeminiProvider } from './x';`,
        `const k = c.env.GEMINI_API_KEY;`,
        `import { createGeminiProvider } from '../services/llm/providers/gemini';`,
      ].join('\n');

      const tokens = new Set(scanContent('f.ts', content).map((o) => o.token));

      expect(tokens).toContain('provider:gemini');
      expect(tokens).toContain('preferredProvider:gemini');
      expect(tokens).toContain('gemini_only');
      expect(tokens).toContain('gemini-2.5');
      expect(tokens).toContain('createGeminiProvider');
      expect(tokens).toContain('GEMINI_API_KEY');
      expect(tokens).toContain('providers/gemini');
    });

    it('exempts the FALLBACK_FORBIDDEN enforcement line', () => {
      // The enforcement that keeps Gemini out must be allowed to name it. Use a
      // synthetic line that DOES contain a matched token to prove the allowlist
      // is line-scoped, not token-blind.
      const content = `const FALLBACK_FORBIDDEN = new Set(['gemini-2.5', 'vertex']); // GEMINI_API_KEY`;
      expect(scanContent('router.ts', content)).toEqual([]);
    });

    it('does not match a bare gemini Set member (specific patterns only)', () => {
      // `new Set(['gemini', 'vertex'])` is NOT one of the token patterns, so even
      // without the allowlist a bare Set member is not a false positive.
      const content = `const x = new Set(['gemini', 'vertex']);`;
      expect(scanContent('other.ts', content)).toEqual([]);
    });

    it('reports the 1-based line number', () => {
      const content = [
        '// line 1',
        '// line 2',
        `const k = GEMINI_API_KEY;`,
      ].join('\n');
      const occ = scanContent('f.ts', content).find(
        (o) => o.token === 'GEMINI_API_KEY',
      );
      expect(occ?.line).toBe(3);
    });
  });

  describe('diffAgainstBaseline', () => {
    const baseline: BaselineEntry[] = [
      { file: 'apps/api/src/legacy.ts', token: 'GEMINI_API_KEY' },
    ];

    it('flags a NEW {file, token} pair as a regression', () => {
      const current = [
        { file: 'apps/api/src/legacy.ts', line: 1, token: 'GEMINI_API_KEY' },
        // a stray new coupling in a different file
        { file: 'apps/api/src/new-file.ts', line: 9, token: 'provider:gemini' },
      ];
      const { newOccurrences } = diffAgainstBaseline(current, baseline);
      expect(newOccurrences).toHaveLength(1);
      expect(newOccurrences[0]).toMatchObject({
        file: 'apps/api/src/new-file.ts',
        token: 'provider:gemini',
      });
    });

    it('does not flag a baselined {file, token} pair', () => {
      const current = [
        { file: 'apps/api/src/legacy.ts', line: 42, token: 'GEMINI_API_KEY' },
      ];
      expect(diffAgainstBaseline(current, baseline).newOccurrences).toEqual([]);
    });

    it('reports baseline entries that are no longer present', () => {
      const { cleanedBaselineEntries } = diffAgainstBaseline([], baseline);
      expect(cleanedBaselineEntries).toEqual(baseline);
    });
  });

  it('every rule has a unique token label', () => {
    const labels = TOKEN_RULES.map((r) => r.token);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
