import {
  collectExistingAcceptedMissingSignoff,
  findViolations,
  getDecidersLine,
  hasHumanArchitectureSignoff,
  isAcceptedAdr,
  isFeatSubject,
  type AddedAdr,
  type BaselineEntry,
} from './check-adr-provenance';

const file = 'docs/adr/MMT-ADR-9999-test-decision.md';

function addedAdr(partial: Partial<AddedAdr> = {}): AddedAdr {
  return {
    file,
    body: '**Status:** Proposed - 2026-06-29 - **Deciders:** Architecture sign-off pending',
    subject: 'docs(adr): add test decision',
    message: 'docs(adr): add test decision\n',
    ...partial,
  };
}

describe('ADR header parsing', () => {
  it('recognizes Accepted ADRs', () => {
    expect(
      isAcceptedAdr(
        '**Status:** Accepted - 2026-06-29 - **Deciders:** Architect (jjoerg) + Claude',
      ),
    ).toBe(true);
    expect(isAcceptedAdr('**Status:** Proposed - 2026-06-29')).toBe(false);
  });

  it('extracts deciders from the header line', () => {
    expect(
      getDecidersLine(
        '**Status:** Accepted - **Scope:** test - **Deciders:** Architect (jjoerg) + Claude',
      ),
    ).toBe('Architect (jjoerg) + Claude');
  });

  it('requires human Architecture sign-off for Accepted ADRs', () => {
    expect(
      hasHumanArchitectureSignoff('**Deciders:** Architect (jjoerg) + Claude'),
    ).toBe(true);
    expect(
      hasHumanArchitectureSignoff(
        '**Deciders:** drafted by Claude; **Architecture sign-off: Accepted by operator Jorn 2026-06-20**',
      ),
    ).toBe(true);
    expect(hasHumanArchitectureSignoff('**Deciders:** PM + Claude')).toBe(
      false,
    );
    expect(
      hasHumanArchitectureSignoff(
        '**Deciders:** Architecture sign-off pending',
      ),
    ).toBe(false);
  });
});

describe('subject classification', () => {
  it('matches conventional feat subjects only', () => {
    expect(isFeatSubject('feat(api): add thing')).toBe(true);
    expect(isFeatSubject('feat!: add thing')).toBe(true);
    expect(isFeatSubject('docs(adr): add decision')).toBe(false);
    expect(isFeatSubject('fix(api): bug')).toBe(false);
  });
});

describe('findViolations', () => {
  it('blocks feat commits that add an ADR', () => {
    expect(
      findViolations(
        [
          addedAdr({
            subject: 'feat(api): add consent workflow',
            message: 'feat(api): add consent workflow\n',
          }),
        ],
        [],
      ),
    ).toEqual([
      expect.objectContaining({
        kind: 'feat_adr_add',
        file,
        subject: 'feat(api): add consent workflow',
      }),
    ]);
  });

  it('allows docs(adr) commits that add Proposed ADRs', () => {
    expect(findViolations([addedAdr()], [])).toEqual([]);
  });

  it('requires a baseline entry and allow-comment for feat ADR additions', () => {
    const baseline: BaselineEntry[] = [
      {
        kind: 'feat_adr_add',
        file,
        subject: 'feat(docs): add bootstrapped ADR',
        reason: 'human Architecture-authored exception',
      },
    ];

    expect(
      findViolations(
        [
          addedAdr({
            subject: 'feat(docs): add bootstrapped ADR',
            message:
              'feat(docs): add bootstrapped ADR\n\nADR provenance allow: human Architecture-authored exception\n',
          }),
        ],
        baseline,
      ),
    ).toEqual([]);

    expect(
      findViolations(
        [
          addedAdr({
            subject: 'feat(docs): add bootstrapped ADR',
            message: 'feat(docs): add bootstrapped ADR\n',
          }),
        ],
        baseline,
      ),
    ).toEqual([expect.objectContaining({ kind: 'feat_adr_add' })]);
  });

  it('blocks newly added Accepted ADRs without human Architecture sign-off', () => {
    expect(
      findViolations(
        [
          addedAdr({
            body: '**Status:** Accepted - 2026-06-29 - **Deciders:** PM + Claude',
          }),
        ],
        [],
      ),
    ).toEqual([
      expect.objectContaining({
        kind: 'accepted_missing_arch_signoff',
        file,
      }),
    ]);
  });

  it('allows Accepted ADRs with human Architecture sign-off', () => {
    expect(
      findViolations(
        [
          addedAdr({
            body: '**Status:** Accepted - 2026-06-29 - **Deciders:** Architect (jjoerg) + Claude',
          }),
        ],
        [],
      ),
    ).toEqual([]);
  });

  it('grandfathers baseline Accepted ADRs without human Architecture sign-off', () => {
    expect(
      findViolations(
        [
          addedAdr({
            body: '**Status:** Accepted - 2026-06-29 - **Deciders:** PM + Claude',
          }),
        ],
        [
          {
            kind: 'accepted_missing_arch_signoff',
            file,
            reason: 'grandfathered pre-guard Accepted ADR',
          },
        ],
      ),
    ).toEqual([]);
  });

  it('honors temporary baseline expiry for Accepted ADRs without sign-off', () => {
    const acceptedWithoutSignoff = addedAdr({
      body: '**Status:** Accepted - 2026-06-29 - **Deciders:** PM + Claude',
    });
    const baseline: BaselineEntry[] = [
      {
        kind: 'accepted_missing_arch_signoff',
        file,
        reason: 'temporary branch reconciliation',
        temporary: true,
        expiresAt: '2026-07-10T00:00:00.000Z',
      },
    ];

    expect(
      findViolations([acceptedWithoutSignoff], baseline, {
        now: new Date('2026-07-09T00:00:00.000Z'),
      }),
    ).toEqual([]);
    expect(
      findViolations([acceptedWithoutSignoff], baseline, {
        now: new Date('2026-07-11T00:00:00.000Z'),
      }),
    ).toEqual([
      expect.objectContaining({ kind: 'accepted_missing_arch_signoff' }),
    ]);
  });

  it('can skip subject checks for pre-commit staged file validation', () => {
    expect(
      findViolations(
        [
          addedAdr({
            subject: 'feat(api): add consent workflow',
            message: 'feat(api): add consent workflow\n',
          }),
        ],
        [],
        { skipSubjectCheck: true },
      ),
    ).toEqual([]);
  });
});

describe('collectExistingAcceptedMissingSignoff', () => {
  it('can generate a grandfather baseline for existing ADRs', () => {
    const entries = collectExistingAcceptedMissingSignoff();
    expect(entries).toEqual(
      entries.map(() =>
        expect.objectContaining({
          kind: 'accepted_missing_arch_signoff',
          file: expect.stringMatching(/^docs\/adr\/MMT-ADR-\d{4}-.+\.md$/),
          reason: expect.any(String),
        }),
      ),
    );
  });
});
