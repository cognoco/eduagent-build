// [WI-2452] Run-smoke lane resolver + quarantine-with-expiry unit tests.
//
// Verifies the AC-2 contract directly: a quarantined project auto-returns to
// the required-stable core lane once its `expires` passes (no permanent
// mutes), and the registry validator catches malformed entries before they
// can gate CI silently.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import {
  DECLARED_CORE_PROJECTS,
  isActive,
  loadRegistry,
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

  it('partitions every declared project into exactly one lane', () => {
    const { core, advisory } = resolveLanes(NOW, [
      { project: 'smoke-parent', expires: FUTURE },
      { project: 'smoke-auth', expires: PAST },
    ]);
    const combined = [...core, ...advisory];

    expect(new Set(combined).size).toBe(combined.length);
    expect([...combined].sort()).toEqual([...DECLARED_CORE_PROJECTS].sort());
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

describe('[WI-2452] expires — impossible calendar date (bounce #3 regression)', () => {
  // Date.parse silently NORMALIZES an impossible calendar date instead of
  // rejecting it: '2026-02-30T00:00:00.000Z' parses to 2026-03-02T...Z. A
  // malformed "expires" could therefore silently EXTEND a mute past its
  // declared calendar expiry. Assert the outcome (registry rejected, and the
  // quarantine does not remain active), not the parser call.
  const IMPOSSIBLE_EXPIRES = '2026-02-30T00:00:00.000Z';

  it('validate() rejects a ledger entry whose expires is an impossible calendar date', () => {
    const problems = validate([
      {
        id: 'smoke-parent-flaky',
        project: 'smoke-parent',
        owner: 'jorn',
        wi: 'WI-1234',
        reason: 'races on seeded staging data under parallel workers',
        expires: IMPOSSIBLE_EXPIRES,
      },
    ]);
    expect(problems.some((p) => p.includes('invalid "expires"'))).toBe(true);
  });

  it('does not keep the quarantine active past its declared (impossible) expiry', () => {
    // Date.parse rolls IMPOSSIBLE_EXPIRES forward to 2026-03-02, so a naive
    // isActive() would still report "active" on 2026-03-01. The property
    // under test is that it must NOT — an invalid expires fails toward core.
    const afterDeclaredExpiry = new Date('2026-03-01T00:00:00.000Z');
    expect(isActive({ expires: IMPOSSIBLE_EXPIRES }, afterDeclaredExpiry)).toBe(
      false,
    );

    const { core, advisory } = resolveLanes(afterDeclaredExpiry, [
      { project: 'smoke-parent', expires: IMPOSSIBLE_EXPIRES },
    ]);
    expect(advisory).toEqual([]);
    expect(core).toEqual([...DECLARED_CORE_PROJECTS]);
  });
});

describe('[WI-2452] loadRegistry — malformed top-level structure', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'run-smoke-lanes-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty array for a genuinely absent file (not malformed)', () => {
    expect(loadRegistry(join(dir, 'absent.json'))).toEqual([]);
  });

  it('accepts a genuinely valid empty ledger', () => {
    const file = join(dir, 'valid-empty.json');
    writeFileSync(file, JSON.stringify({ version: 1, entries: [] }));
    expect(loadRegistry(file)).toEqual([]);
  });

  it('throws when "entries" is absent from an otherwise-valid document', () => {
    const file = join(dir, 'missing-entries.json');
    writeFileSync(file, JSON.stringify({ version: 1 }));
    expect(() => loadRegistry(file)).toThrow(
      /malformed.*"entries" must be an array/,
    );
  });

  it('throws when "entries" is present but not an array', () => {
    const file = join(dir, 'wrong-type-entries.json');
    writeFileSync(file, JSON.stringify({ version: 1, entries: 'oops' }));
    expect(() => loadRegistry(file)).toThrow(
      /malformed.*"entries" must be an array/,
    );
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

  it('flags a missing id', () => {
    const { id: _id, ...rest } = validEntry;
    const problems = validate([rest]);
    expect(problems.some((p) => p.includes('missing "id"'))).toBe(true);
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
