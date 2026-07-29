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
  it('accepts only the fixed 360x760 logical Orion profile and exact three-scope shape', () => {
    expect(
      verifyEvidence(
        'wi2176-orion-header-valid.xml',
        'wi2176-orion-options-end-valid.xml',
      ),
    ).toEqual({
      density: 3,
      logicalViewport: '360x760',
      optionIds: [
        'scope-chip-option-me',
        'scope-chip-option-person-supportee',
        'scope-chip-option-supporter-hub',
      ],
      safeAreaTop: 24,
      snapshotCount: 2,
    });
  });

  it('rejects a rotated hierarchy', () => {
    expect(() =>
      verifyEvidence(
        'wi2176-orion-header-rotated.xml',
        'wi2176-orion-options-end-valid.xml',
      ),
    ).toThrow('expected portrait hierarchy rotation 0; found 1');
  });

  it('rejects a physical viewport that is not 1080x2280 at Orion density', () => {
    expect(() =>
      verifyEvidence(
        'wi2176-orion-header-wrong-viewport.xml',
        'wi2176-orion-options-end-valid.xml',
      ),
    ).toThrow(
      'expected physical root viewport [0,0][1080,2280]; found [0,0][1080,1920]',
    );
  });

  it('rejects evidence that never fully exposes Support hub, one person, and Me', () => {
    expect(() =>
      verifyEvidence(
        'wi2176-orion-header-incomplete.xml',
        'wi2176-orion-header-incomplete.xml',
      ),
    ).toThrow(
      'expected exactly Support hub, one person, and Me scope options; found scope-chip-option-person-supportee, scope-chip-option-supporter-hub',
    );
  });

  it('rejects a fourth scope even when it is partially outside the visible strip', () => {
    expect(() =>
      verifyEvidence(
        'wi2176-orion-hidden-extra-scope.xml',
        'wi2176-orion-hidden-extra-scope.xml',
      ),
    ).toThrow(
      'expected exactly Support hub, one person, and Me scope options; found scope-chip-option-me, scope-chip-option-person-hidden-extra, scope-chip-option-person-supportee, scope-chip-option-supporter-hub',
    );
  });

  it('reports overlap, safe-area, page-copy, target, action, and label violations together', () => {
    expect(() =>
      verifyEvidence(
        'wi2176-orion-header-invalid.xml',
        'wi2176-orion-options-end-valid.xml',
      ),
    ).toThrow(
      [
        'scope.right + gap (300 + 8) must be <= avatar.left (292)',
        'scope.top (20) must be >= safe-area + inset (32)',
        'avatar.top (22) must be >= safe-area + inset (32)',
        'Support-hub surface.top (80) must be >= chrome.bottom (92)',
        'heading.top (80) must be >= chrome.bottom (92)',
        'subtitle.top (100) must be >= heading.bottom (110)',
        'scope option scope-chip-option-supporter-hub must be at least 44x44 (got 43x44)',
        'scope option scope-chip-option-supporter-hub must be enabled and clickable',
        'avatar must be at least 44x44 (got 43x44)',
        'avatar must be enabled and clickable',
        'scope-chip-option-supporter-hub must expose the full accessible label "Support hub" (got "Support")',
        'person scope must expose the full accessible label "Test Supportee" (got "Supportee")',
        'Support-hub option must be selected in the header snapshot',
      ].join('\n'),
    );
  });
});
