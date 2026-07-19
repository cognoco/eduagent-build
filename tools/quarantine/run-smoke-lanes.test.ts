// [WI-2452] Run-smoke lane resolver + quarantine-with-expiry unit tests.
//
// Verifies the AC-2 contract directly: a quarantined project auto-returns to
// the required-stable core lane once its `expires` passes (no permanent
// mutes), and the registry validator catches malformed entries before they
// can gate CI silently.

import { describe, expect, it } from '@jest/globals';
import {
  DECLARED_CORE_PROJECTS,
  isActive,
  playwrightProjectFlags,
  resolveLanes,
  validate,
} from './run-smoke-lanes.cjs';

const NOW = new Date('2026-07-19T12:00:00.000Z');
const FUTURE = '2026-08-01T00:00:00.000Z';
const PAST = '2026-07-01T00:00:00.000Z';

describe('[WI-2452] resolveLanes', () => {
  it('puts every declared project in core when the registry is empty', () => {
    const { core, advisory } = resolveLanes(NOW);
    expect(core).toEqual([...DECLARED_CORE_PROJECTS]);
    expect(advisory).toEqual([]);
  });

  it('demotes a project to advisory while its quarantine entry is unexpired', () => {
    const { core, advisory } = resolveLanes(NOW, [
      { project: 'smoke-parent', expires: FUTURE },
    ]);
    expect(advisory).toEqual(['smoke-parent']);
    expect(core).not.toContain('smoke-parent');
    expect(core).toEqual(
      DECLARED_CORE_PROJECTS.filter((p) => p !== 'smoke-parent'),
    );
  });

  it('auto-reverts a project to core once its quarantine entry expires', () => {
    const { core, advisory } = resolveLanes(NOW, [
      { project: 'smoke-parent', expires: PAST },
    ]);
    expect(core).toEqual([...DECLARED_CORE_PROJECTS]);
    expect(advisory).toEqual([]);
  });
});

describe('[WI-2452] isActive', () => {
  it('is active for an entry expiring in the future', () => {
    expect(isActive({ expires: FUTURE }, NOW)).toBe(true);
  });

  it('is not active for an entry that has already expired', () => {
    expect(isActive({ expires: PAST }, NOW)).toBe(false);
  });

  it('is not active for a missing expires field', () => {
    expect(isActive({}, NOW)).toBe(false);
  });

  it('is not active for an unparsable expires string', () => {
    expect(isActive({ expires: 'not-a-date' }, NOW)).toBe(false);
  });

  it('is not active for a null entry', () => {
    expect(isActive(null, NOW)).toBe(false);
  });
});

describe('[WI-2452] playwrightProjectFlags', () => {
  it('formats an empty list as an empty string', () => {
    expect(playwrightProjectFlags([])).toBe('');
  });

  it('formats projects as --project= flags', () => {
    expect(playwrightProjectFlags(['smoke-auth', 'smoke-learner'])).toBe(
      '--project=smoke-auth --project=smoke-learner',
    );
  });
});

describe('[WI-2452] validate', () => {
  const validEntry = {
    id: 'smoke-parent-flaky',
    project: 'smoke-parent',
    owner: 'jorn',
    wi: 'WI-1234',
    reason: 'races on seeded staging data under parallel workers',
    expires: FUTURE,
  };

  it('accepts a well-formed entry', () => {
    expect(validate([validEntry])).toEqual([]);
  });

  it('accepts an empty registry', () => {
    expect(validate([])).toEqual([]);
  });

  it('flags an unknown project name', () => {
    const problems = validate([{ ...validEntry, project: 'smoke-typo' }]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/"project" must be one of/);
  });

  it('flags a missing owner', () => {
    const { owner: _owner, ...rest } = validEntry;
    const problems = validate([rest]);
    expect(problems.some((p) => p.includes('missing "owner"'))).toBe(true);
  });

  it('flags a missing or malformed wi', () => {
    const problems = validate([{ ...validEntry, wi: 'not-a-wi' }]);
    expect(problems.some((p) => p.includes('invalid "wi"'))).toBe(true);
  });

  it('flags a missing reason', () => {
    const { reason: _reason, ...rest } = validEntry;
    const problems = validate([rest]);
    expect(problems.some((p) => p.includes('missing "reason"'))).toBe(true);
  });

  it('flags an unparsable expires', () => {
    const problems = validate([{ ...validEntry, expires: 'soon-ish' }]);
    expect(problems.some((p) => p.includes('invalid "expires"'))).toBe(true);
  });

  it('flags a duplicate project across entries', () => {
    const problems = validate([
      validEntry,
      { ...validEntry, id: 'smoke-parent-flaky-2' },
    ]);
    expect(problems.some((p) => p.includes('duplicate of entry[0]'))).toBe(
      true,
    );
  });

  it('flags a non-object entry', () => {
    expect(validate([null])).toEqual(['entry[0]: not an object']);
  });
});
