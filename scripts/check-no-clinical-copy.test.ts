import {
  diffAgainstBaseline,
  findViolations,
  walkStrings,
  type Violation,
} from './check-no-clinical-copy';

describe('walkStrings', () => {
  it('flattens nested objects to dotted JSON paths', () => {
    const tree = {
      a: { b: 'leaf-1', c: { d: 'leaf-2' } },
      e: 'leaf-3',
    };
    const out = walkStrings(tree);
    expect(out).toEqual([
      { path: 'a.b', value: 'leaf-1' },
      { path: 'a.c.d', value: 'leaf-2' },
      { path: 'e', value: 'leaf-3' },
    ]);
  });

  it('indexes array entries with bracket notation', () => {
    const out = walkStrings({ list: ['first', 'second'] });
    expect(out).toEqual([
      { path: 'list[0]', value: 'first' },
      { path: 'list[1]', value: 'second' },
    ]);
  });
});

describe('findViolations', () => {
  it('returns empty when no banned terms appear', () => {
    expect(findViolations({ greeting: "Let's try again." })).toEqual([]);
  });

  it('detects banned terms as whole words, case-insensitive', () => {
    const v = findViolations({
      a: 'You got it Wrong.',
      b: 'Not Wrong, but check again.',
      c: 'wrongful — should NOT match (not a whole word)',
    });
    expect(v).toEqual<Violation[]>([
      { path: 'a', term: 'wrong', value: 'You got it Wrong.' },
      { path: 'b', term: 'wrong', value: 'Not Wrong, but check again.' },
    ]);
  });

  it('detects multiple banned terms in a single string', () => {
    const v = findViolations({
      bad: 'You failed and got it wrong.',
    });
    expect(v.map((x) => x.term)).toEqual(['failed', 'wrong']);
    expect(v.every((x) => x.path === 'bad')).toBe(true);
  });

  it('walks into arrays and nested objects', () => {
    const v = findViolations({
      list: ['ok', 'incorrect'],
      nested: { msg: 'You struggle here.' },
    });
    expect(v).toEqual<Violation[]>([
      {
        path: 'list[1]',
        term: 'incorrect',
        value: 'incorrect',
      },
      {
        path: 'nested.msg',
        term: 'struggle',
        value: 'You struggle here.',
      },
    ]);
  });
});

describe('diffAgainstBaseline', () => {
  it('returns no new violations when all current are grandfathered', () => {
    const current: Violation[] = [
      { path: 'a.b', term: 'failed', value: 'Sync failed.' },
    ];
    const baseline = [{ path: 'a.b', term: 'failed' }];
    expect(diffAgainstBaseline(current, baseline)).toEqual({
      newViolations: [],
      cleanedBaselineEntries: [],
    });
  });

  it('flags new violations not present in baseline', () => {
    const current: Violation[] = [
      { path: 'old', term: 'failed', value: '...' },
      { path: 'new', term: 'wrong', value: '...' },
    ];
    const baseline = [{ path: 'old', term: 'failed' }];
    const { newViolations, cleanedBaselineEntries } = diffAgainstBaseline(
      current,
      baseline,
    );
    expect(newViolations).toEqual<Violation[]>([
      { path: 'new', term: 'wrong', value: '...' },
    ]);
    expect(cleanedBaselineEntries).toEqual([]);
  });

  it('reports baseline entries no longer present so devs can prune', () => {
    const current: Violation[] = [
      { path: 'still.here', term: 'failed', value: '...' },
    ];
    const baseline = [
      { path: 'still.here', term: 'failed' },
      { path: 'cleaned.up', term: 'wrong' },
    ];
    const { newViolations, cleanedBaselineEntries } = diffAgainstBaseline(
      current,
      baseline,
    );
    expect(newViolations).toEqual([]);
    expect(cleanedBaselineEntries).toEqual([
      { path: 'cleaned.up', term: 'wrong' },
    ]);
  });

  it('matches case-insensitively on term', () => {
    // Baseline stores lowercase; current may surface mixed case from the
    // source. Diff must not double-count.
    const current: Violation[] = [
      { path: 'p', term: 'wrong', value: 'Wrong.' },
    ];
    const baseline = [{ path: 'p', term: 'Wrong' }];
    expect(diffAgainstBaseline(current, baseline).newViolations).toEqual([]);
  });
});
