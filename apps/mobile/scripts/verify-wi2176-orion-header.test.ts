import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { verifyOrionHeaderEvidence } from './verify-wi2176-orion-header';

const fixture = (name: string): string =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf8');

const verifyEvidence = (headerFixture: string, endScrolledFixture: string) =>
  verifyOrionHeaderEvidence(
    fixture(headerFixture),
    fixture(endScrolledFixture),
  );

describe('WI-2176 Orion Support-hub hierarchy checker', () => {
  it('rejects a rotated hierarchy even when its controls otherwise fit', () => {
    expect(() =>
      verifyEvidence(
        'wi2176-orion-header-rotated.xml',
        'wi2176-orion-options-end-valid.xml',
      ),
    ).toThrow('expected portrait hierarchy rotation 0; found 1');
  });

  it('rejects a hierarchy whose root is not the fixed 360x760 viewport', () => {
    expect(() =>
      verifyEvidence(
        'wi2176-orion-header-wrong-viewport.xml',
        'wi2176-orion-options-end-valid.xml',
      ),
    ).toThrow('expected root viewport [0,0][360,760]; found [0,0][412,915]');
  });

  it('aggregates only fully visible option observations across both snapshots', () => {
    expect(
      verifyEvidence(
        'wi2176-orion-header-valid.xml',
        'wi2176-orion-options-end-valid.xml',
      ),
    ).toEqual({
      safeAreaMinimum: 24,
      scopeOptionCount: 3,
      snapshotCount: 2,
    });
  });

  it('reports header geometry and fully visible target violations together', () => {
    expect(() =>
      verifyEvidence(
        'wi2176-orion-header-invalid.xml',
        'wi2176-orion-options-end-valid.xml',
      ),
    ).toThrow(
      [
        'scope.right (310) must be <= avatar.left (300)',
        'heading.top (65) must be >= chrome.bottom (80)',
        'subtitle.top (90) must be >= heading.bottom (95)',
        'scope.top (20) must be >= safe-area minimum (24)',
        'avatar.top (22) must be >= safe-area minimum (24)',
        'scope option scope-chip-option-person-rich must be at least 44x44 (got 43x44)',
        'scope option scope-chip-option-person-empty must be at least 44x44 (got 44x43)',
        'avatar must be at least 44x44 (got 43x44)',
      ].join('\n'),
    );
  });

  it('rejects evidence that never fully exposes both seeded person options', () => {
    expect(() =>
      verifyEvidence(
        'wi2176-orion-header-incomplete.xml',
        'wi2176-orion-header-incomplete.xml',
      ),
    ).toThrow(
      'expected fully visible observations for the Support hub and at least two person scope options; found 2',
    );
  });
});
