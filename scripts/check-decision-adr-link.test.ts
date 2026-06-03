import {
  diffAgainstBaseline,
  findDecisionHeadings,
  findFileViolations,
  type Violation,
} from './check-decision-adr-link';

describe('findDecisionHeadings', () => {
  it('matches decision-signalling headings at any level', () => {
    const body = [
      '# Title',
      '## Key design decisions (locked 2026-05-30)',
      'prose',
      '### Technical Decisions',
      '#### Alternatives considered',
      '## Trade-offs',
      '## Product Decisions',
    ].join('\n');
    expect(findDecisionHeadings(body)).toEqual([
      'Key design decisions (locked 2026-05-30)',
      'Technical Decisions',
      'Alternatives considered',
      'Trade-offs',
      'Product Decisions',
    ]);
  });

  it('does not match non-decision headings or prose mentions', () => {
    const body = [
      '## Overview',
      '## Implementation Plan',
      'We rejected the alternative approach in prose — not a heading.',
      '## Scope',
    ].join('\n');
    expect(findDecisionHeadings(body)).toEqual([]);
  });
});

describe('findFileViolations', () => {
  it('flags decision headings when the file has no MMT-ADR link', () => {
    const body = '## Design decisions\nWe chose X over Y.';
    expect(findFileViolations('docs/plans/foo.md', body)).toEqual<Violation[]>([
      { file: 'docs/plans/foo.md', heading: 'Design decisions' },
    ]);
  });

  it('is satisfied by any MMT-ADR reference in the file', () => {
    const body = '## Design decisions\nSee MMT-ADR-0007 for rationale.';
    expect(findFileViolations('docs/plans/foo.md', body)).toEqual([]);
  });
});

describe('diffAgainstBaseline', () => {
  it('returns no new violations when all current are grandfathered', () => {
    const current: Violation[] = [
      { file: 'docs/specs/a.md', heading: 'Decisions' },
    ];
    const baseline = [{ file: 'docs/specs/a.md', heading: 'Decisions' }];
    expect(diffAgainstBaseline(current, baseline)).toEqual({
      newViolations: [],
      cleanedBaselineEntries: [],
    });
  });

  it('flags new violations not present in baseline', () => {
    const current: Violation[] = [
      { file: 'docs/specs/old.md', heading: 'Decisions' },
      { file: 'docs/specs/new.md', heading: 'Technical Decisions' },
    ];
    const baseline = [{ file: 'docs/specs/old.md', heading: 'Decisions' }];
    expect(diffAgainstBaseline(current, baseline).newViolations).toEqual<
      Violation[]
    >([{ file: 'docs/specs/new.md', heading: 'Technical Decisions' }]);
  });

  it('reports baseline entries no longer present so devs can prune', () => {
    const current: Violation[] = [
      { file: 'docs/specs/here.md', heading: 'Decisions' },
    ];
    const baseline = [
      { file: 'docs/specs/here.md', heading: 'Decisions' },
      { file: 'docs/specs/gone.md', heading: 'Alternatives considered' },
    ];
    const { newViolations, cleanedBaselineEntries } = diffAgainstBaseline(
      current,
      baseline,
    );
    expect(newViolations).toEqual([]);
    expect(cleanedBaselineEntries).toEqual([
      { file: 'docs/specs/gone.md', heading: 'Alternatives considered' },
    ]);
  });
});
