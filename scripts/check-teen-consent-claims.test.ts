// Tests for the teen self-consent claim ratchet (WI-2535).
//
// The red-green anchor: the two literal strings below are the blanket claims
// that shipped in docs/plans/2026-07-10-mvp-roadmap/MVP-DEFINITION.md at
// origin/main@73f2597, and are what this WI corrected. If the detector stops
// flagging them, the guard has regressed to useless.

import {
  diffAgainstBaseline,
  findBlanketClaims,
  findFileViolations,
} from './check-teen-consent-claims';

describe('findBlanketClaims', () => {
  // --- Red anchor: the exact defect text from origin/main ---

  it('flags the shipped "13+ self-consenting teens" claim (MVP-DEFINITION.md:17)', () => {
    const line =
      'the counsel packet frames "children are a core audience" — under the launch posture those children are 13+ self-consenting teens.';
    expect(findBlanketClaims(line)).toEqual(['13+ self-consenting']);
  });

  it('flags the shipped "self-consenting 13+ teens" claim (MVP-DEFINITION.md:167)', () => {
    const line =
      '"family" at launch = parent + self-consenting 13+ teens via join-my-family (WI-1753) + opt-in Supportership.';
    expect(findBlanketClaims(line)).toEqual(['self-consenting 13+']);
  });

  it('flags the claim in either token order and with spacing variants', () => {
    expect(findBlanketClaims('13 + self consenting learners')).toHaveLength(1);
    expect(findBlanketClaims('self-consents at 13-plus')).toHaveLength(1);
  });

  // --- The conjunction, not the word: neither token alone is a violation ---

  it('does not flag a bare self-consent mention (adult self-consent is legitimate)', () => {
    expect(
      findBlanketClaims(
        'Mobile client consumes the needsAdultConsent signal (first-use adult self-consent re-consent)',
      ),
    ).toEqual([]);
  });

  it('does not flag a bare 13+ mention (age rating / launch floor are legitimate)', () => {
    expect(
      findBlanketClaims('age rating + declarations at 13+ (WI-1114)'),
    ).toEqual([]);
    expect(
      findBlanketClaims('13+ is the confirmed LAUNCH floor, not a forever cap'),
    ).toEqual([]);
  });

  it('does not flag the two ideas discussed at prose distance', () => {
    expect(
      findBlanketClaims(
        'A credentialed 13+ learner has an own login; consent authority is resolved elsewhere, and only some learners self-consent.',
      ),
    ).toEqual([]);
  });

  // --- Negated windows are corrections, not claims ---

  it('does not flag a negated window (the corrected phrasing must pass)', () => {
    expect(
      findBlanketClaims(
        '13+ is the floor for having an own login; it is not a grant of self-consent.',
      ),
    ).toEqual([]);
    expect(
      findBlanketClaims(
        'a credentialed 13+ learner is not automatically self-consenting',
      ),
    ).toEqual([]);
  });

  // --- Canon phrasing must never trip the guard ---

  it('does not flag the jurisdiction-aware canon phrasing', () => {
    expect(
      findBlanketClaims(
        'not every minor is a charge (16–17s and e.g. Norwegian 13–15s self-consent)',
      ),
    ).toEqual([]);
    expect(
      findBlanketClaims('v1 = parent-initiated invite, consent-capable teen'),
    ).toEqual([]);
  });
});

describe('findFileViolations', () => {
  it('honours a same-line teen-consent-allow annotation', () => {
    const body =
      'the phrase "self-consenting 13+ teens" is banned <!-- teen-consent-allow: cites it to name it -->';
    expect(findFileViolations('doc.md', body)).toEqual([]);
  });

  it('honours an annotation on the preceding line', () => {
    const body = [
      '<!-- teen-consent-allow: quoted below as the banned phrase -->',
      'Historic wording: 13+ self-consenting teens.',
    ].join('\n');
    expect(findFileViolations('doc.md', body)).toEqual([]);
  });

  it('reports file + normalized text, never a line number', () => {
    const body = 'family at launch = parent + self-consenting 13+ teens';
    expect(findFileViolations('docs/x.md', body)).toEqual([
      { file: 'docs/x.md', text: 'self-consenting 13+' },
    ]);
  });
});

describe('diffAgainstBaseline', () => {
  it('treats a baselined claim as grandfathered and a novel one as new', () => {
    const current = [
      { file: 'a.md', text: '13+ self-consenting' },
      { file: 'b.md', text: 'self-consenting 13+' },
    ];
    const baseline = [{ file: 'a.md', text: '13+ self-consenting' }];
    const { newViolations } = diffAgainstBaseline(current, baseline);
    expect(newViolations).toEqual([
      { file: 'b.md', text: 'self-consenting 13+' },
    ]);
  });

  it('reports baseline entries that no longer match, for pruning', () => {
    const { cleanedBaselineEntries } = diffAgainstBaseline(
      [],
      [{ file: 'a.md', text: '13+ self-consenting' }],
    );
    expect(cleanedBaselineEntries).toEqual([
      { file: 'a.md', text: '13+ self-consenting' },
    ]);
  });

  it('is keyed on text, so reflowing a paragraph does not churn the baseline', () => {
    const baseline = [{ file: 'a.md', text: '13+ self-consenting' }];
    const { newViolations } = diffAgainstBaseline(
      [{ file: 'a.md', text: '13+ self-consenting' }],
      baseline,
    );
    expect(newViolations).toEqual([]);
  });
});
