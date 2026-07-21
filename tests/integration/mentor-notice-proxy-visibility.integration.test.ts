/**
 * Integration: WI-2498 — mentor-notice details stay learner-only in proxy reads.
 *
 * THE LEAK (the named red case). Mentor-notice read projections gated notice
 * data on the rollout flag plus the request's `scope`/`visibility` shape —
 * never on actor-versus-subject. A guardian who selects their child's profile
 * with `X-Profile-Id` issues a `scope=self` read and received the child's
 * private notice evidence (misconception concept, correction hint). No
 * `X-Proxy-Mode` header is needed: its ABSENCE is exactly the exposing case.
 *
 * These tests authenticate as the real guardian (their own Clerk login, so the
 * real middleware chain resolves `callerPersonId` to the GUARDIAN's person)
 * and select the child via header. The fix routes every notice-bearing
 * projection through the server-authoritative predicate V
 * (services/mentor-notices/visibility.ts), whose selfhood conjunct
 * `callerPersonId === subjectProfileId` cannot be satisfied by any header.
 *
 * CONTROLLED VARIABLE. Rollout is forced ON (MENTOR_NOTICE_ENABLED='true') and
 * the child's consent is CONSENTED in every case below, so "notices absent" can
 * only be attributed to caller identity — not to the rollout or consent
 * conjuncts of V, which are exercised separately.
 *
 * NOT A DENIAL. V gates the notice ENRICHMENT, not read authority: the guardian
 * still receives the feed and the session summary — just notice-free. Each
 * proxy case therefore asserts 200 + payload present + notice fields absent.
 *
 * BOTH notice-bearing Now surfaces are asserted, because they are produced by
 * two different collectors: the open-notice card (`kind: 'mentor_notice'`,
 * collectMentorNoticeCandidates) and the locked-in ledger moment
 * (`kind: 'ledger_moment'` with `params.ledgerKind: 'notice_locked_in'`,
 * collectNoticeLockedInCandidates). Asserting only the former would miss half
 * the leak.
 *
 * Red-green-revert: on unmodified main every "notice-free" case FAILS (the
 * notice card, the locked-in moment, and the summary receipt are all present in
 * the guardian's response); they pass once every projection routes through V;
 * reverting V turns them red again. The learner-self cases must be green BEFORE
 * and AFTER — they fence V from over-blocking.
 */

import { mentorNotices } from '@eduagent/database';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
  resolveAccountId,
  seedDirectChildProfileForTest,
  seedFamilyLinkForTest,
  seedLearningSession,
  seedSessionSummary,
  seedSubject,
  setProfileConsentStatusForTest,
} from './route-fixtures';
import { mockInngestEvents } from './mocks';
import { clearFetchCalls } from './fetch-interceptor';

import { resolveMentorNoticeVisibility } from '../../apps/api/src/services/mentor-notices';
import { app } from '../../apps/api/src/index';

// Rollout forced ON for every case — see "CONTROLLED VARIABLE" above.
const TEST_ENV = {
  ...buildIntegrationEnv(),
  MENTOR_NOTICE_ENABLED: 'true',
};

const GUARDIAN = {
  userId: 'integration-wi2498-guardian-user',
  email: 'integration-wi2498-guardian@integration.test',
};

const OPEN_CONCEPT = 'WI2498 open concept — sign flip across the equals sign';
const OPEN_HINT =
  'WI2498 open hint — apply the inverse operation to both sides';
const LOCKED_CONCEPT = 'WI2498 locked concept — distributing a negative';
const RECEIPT_CONCEPT = 'WI2498 receipt concept — order of operations';
const RECEIPT_HINT = 'WI2498 receipt hint — evaluate parentheses first';

type NowCard = {
  kind: string;
  params?: Record<string, unknown>;
};

/** Cards carrying notice evidence, from BOTH collectors. */
function noticeBearingCards(cards: NowCard[]): NowCard[] {
  return cards.filter(
    (card) =>
      card.kind === 'mentor_notice' ||
      (card.kind === 'ledger_moment' &&
        card.params?.ledgerKind === 'notice_locked_in'),
  );
}

/** Guardian headers selecting the child profile. `proxyMode` toggles the
 *  client-supplied X-Proxy-Mode header — the AC requires notice-free reads for
 *  EVERY combination of profile selection and X-Proxy-Mode. */
function guardianHeaders(
  childProfileId: string,
  proxyMode: boolean,
): HeadersInit {
  return {
    ...(buildAuthHeaders(
      { sub: GUARDIAN.userId, email: GUARDIAN.email },
      childProfileId,
    ) as Record<string, string>),
    ...(proxyMode ? { 'X-Proxy-Mode': 'true' } : {}),
  };
}

type Fixture = {
  guardianProfileId: string;
  childProfileId: string;
  childSummarySessionId: string;
  guardianSummarySessionId: string;
};

let fixture: Fixture;

beforeAll(async () => {
  mockInngestEvents();
  clearFetchCalls();
  await cleanupAccounts({
    emails: [GUARDIAN.email],
    clerkUserIds: [GUARDIAN.userId],
  });
  fixture = await seedFixture();
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [GUARDIAN.email],
    clerkUserIds: [GUARDIAN.userId],
  });
});

/**
 * Seeds a guardian (owner, via the real create route) plus an uncredentialed
 * child with CONSENTED status, and gives BOTH of them the full notice-bearing
 * surface set: an eligible open notice, a recently locked-in notice, and a
 * session summary whose source session carries a notice receipt.
 *
 * The guardian gets their own copies so the positive "learner reading their own
 * profile" cases assert against identically-shaped data — the only difference
 * between the leak cases and the control cases is WHOSE profile is selected
 * relative to the authenticated caller.
 */
async function seedFixture(): Promise<Fixture> {
  const db = createIntegrationDb();

  const guardian = await createProfileViaRoute({
    app,
    env: TEST_ENV,
    user: GUARDIAN,
    displayName: 'WI-2498 Guardian',
    birthYear: 1985,
  });

  const child = await seedDirectChildProfileForTest({
    parentProfileId: guardian.id,
    accountId: guardian.accountId,
    displayName: 'WI-2498 Child',
    birthYear: 2012,
  });
  await seedFamilyLinkForTest({
    parentProfileId: guardian.id,
    childProfileId: child.id,
  });
  const childAccountId = await resolveAccountId(db, child.id);
  if (!childAccountId) throw new Error('child accountId unresolved');
  await setProfileConsentStatusForTest({
    profileId: child.id,
    accountId: childAccountId,
    status: 'CONSENTED',
    parentEmail: GUARDIAN.email,
  });

  const childSummarySessionId = await seedNoticeSurfaces(child.id, 'child');
  const guardianSummarySessionId = await seedNoticeSurfaces(
    guardian.id,
    'guardian',
  );

  return {
    guardianProfileId: guardian.id,
    childProfileId: child.id,
    childSummarySessionId,
    guardianSummarySessionId,
  };
}

/** Seeds one profile's open notice, locked-in notice, and summary receipt.
 *  Returns the session id whose summary carries the receipt. */
async function seedNoticeSurfaces(
  profileId: string,
  label: string,
): Promise<string> {
  const db = createIntegrationDb();
  const subject = await seedSubject(profileId, `WI2498 Algebra ${label}`);

  const openSessionId = await seedLearningSession({
    profileId,
    subjectId: subject.id,
    overrides: { sessionType: 'homework', status: 'completed' },
  });
  await db.insert(mentorNotices).values({
    profileId,
    subjectId: subject.id,
    sourceSessionId: openSessionId,
    concept: OPEN_CONCEPT,
    correctionHint: OPEN_HINT,
    status: 'open',
  });

  // FOUR locked-in notices, deliberately. `ledger_moment` is the lowest-ranked
  // card kind (basePriority / RANKING.LEDGER_MOMENT), and /now returns only the
  // top 3 — so with four of them the overflow page is guaranteed to carry
  // notice-bearing items. Without this the `/now/overflow` assertions would be
  // VACUOUSLY green (an empty overflow trivially contains no notices) and would
  // not have been red on unmodified main.
  // The source-session type is cycled across every eligible class
  // (learning / homework / interleaved) named in the AC. V is
  // source-session-agnostic — it never reads the source session — so this
  // enumerates rather than adds a code path; it exists to moot the question.
  const SOURCE_CLASSES = [
    'learning',
    'homework',
    'interleaved',
    'learning',
  ] as const;
  for (let i = 0; i < SOURCE_CLASSES.length; i += 1) {
    const lockedSessionId = await seedLearningSession({
      profileId,
      subjectId: subject.id,
      overrides: { sessionType: SOURCE_CLASSES[i], status: 'completed' },
    });
    await db.insert(mentorNotices).values({
      profileId,
      subjectId: subject.id,
      sourceSessionId: lockedSessionId,
      concept: `${LOCKED_CONCEPT} #${i}`,
      correctionHint: null,
      status: 'locked_in',
      resolvedAt: new Date(),
    });
  }

  const receiptSessionId = await seedLearningSession({
    profileId,
    subjectId: subject.id,
    overrides: { sessionType: 'homework', status: 'completed' },
  });
  await db.insert(mentorNotices).values({
    profileId,
    subjectId: subject.id,
    sourceSessionId: receiptSessionId,
    concept: RECEIPT_CONCEPT,
    correctionHint: RECEIPT_HINT,
    status: 'locked_in',
    resolvedAt: new Date(),
  });
  await seedSessionSummary({
    sessionId: receiptSessionId,
    profileId,
    content: `WI2498 summary ${label}`,
    status: 'submitted',
  });

  return receiptSessionId;
}

describe('WI-2498: guardian selected-child reads are notice-free', () => {
  // The AC demands every combination of profile selection and X-Proxy-Mode.
  // `false` is the named red case: guardian-selected-child WITHOUT the header.
  describe.each([
    ['no X-Proxy-Mode header (the named red case)', false],
    ['X-Proxy-Mode: true', true],
  ])('guardian selecting the child, %s', (_label, proxyMode) => {
    it('GET /v1/now returns no notice-bearing cards', async () => {
      const res = await app.request(
        '/v1/now?scope=self',
        { headers: guardianHeaders(fixture.childProfileId, proxyMode) },
        TEST_ENV,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { cards: NowCard[] };
      expect(noticeBearingCards(body.cards)).toEqual([]);
      expect(JSON.stringify(body)).not.toContain(OPEN_CONCEPT);
      expect(JSON.stringify(body)).not.toContain(OPEN_HINT);
      expect(JSON.stringify(body)).not.toContain(LOCKED_CONCEPT);
    });

    it('GET /v1/now/overflow returns no notice-bearing items', async () => {
      const res = await app.request(
        '/v1/now/overflow?scope=self',
        { headers: guardianHeaders(fixture.childProfileId, proxyMode) },
        TEST_ENV,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: NowCard[] };
      expect(noticeBearingCards(body.items)).toEqual([]);
      expect(JSON.stringify(body)).not.toContain(OPEN_CONCEPT);
      expect(JSON.stringify(body)).not.toContain(OPEN_HINT);
      expect(JSON.stringify(body)).not.toContain(LOCKED_CONCEPT);
    });

    it('GET /v1/sessions/:id/summary still returns the summary, without the notice receipt', async () => {
      const res = await app.request(
        `/v1/sessions/${fixture.childSummarySessionId}/summary`,
        { headers: guardianHeaders(fixture.childProfileId, proxyMode) },
        TEST_ENV,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        summary: { id: string; mentorNotice?: unknown } | null;
      };
      // Not a denial — the guardian legitimately reads the summary.
      expect(body.summary).not.toBeNull();
      expect(body.summary?.mentorNotice).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain(RECEIPT_CONCEPT);
      expect(JSON.stringify(body)).not.toContain(RECEIPT_HINT);
    });
  });
});

describe('WI-2498: a learner reading their own profile keeps eligible notices', () => {
  it('GET /v1/now still surfaces the learner’s own notice-bearing cards', async () => {
    const res = await app.request(
      '/v1/now?scope=self',
      {
        headers: buildAuthHeaders(
          { sub: GUARDIAN.userId, email: GUARDIAN.email },
          fixture.guardianProfileId,
        ),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cards: NowCard[];
      overflowCount: number;
    };
    // Ranking can push either surface into overflow; assert on the union of
    // both pages so the control is not brittle to card ordering.
    const overflowRes = await app.request(
      '/v1/now/overflow?scope=self',
      {
        headers: buildAuthHeaders(
          { sub: GUARDIAN.userId, email: GUARDIAN.email },
          fixture.guardianProfileId,
        ),
      },
      TEST_ENV,
    );
    const overflowBody = (await overflowRes.json()) as { items: NowCard[] };
    // NON-VACUITY GUARD for the guardian `/now/overflow` assertions above: prove
    // that with this fixture the overflow page genuinely carries notice-bearing
    // items for a permitted reader. If this ever goes false, those assertions
    // have stopped testing anything and must be re-seeded.
    expect(noticeBearingCards(overflowBody.items).length).toBeGreaterThan(0);
    const all = [...body.cards, ...overflowBody.items];
    expect(
      noticeBearingCards(all).some((card) => card.kind === 'mentor_notice'),
    ).toBe(true);
    expect(
      noticeBearingCards(all).some((card) => card.kind === 'ledger_moment'),
    ).toBe(true);
  });

  it('GET /v1/sessions/:id/summary still carries the learner’s own notice receipt', async () => {
    const res = await app.request(
      `/v1/sessions/${fixture.guardianSummarySessionId}/summary`,
      {
        headers: buildAuthHeaders(
          { sub: GUARDIAN.userId, email: GUARDIAN.email },
          fixture.guardianProfileId,
        ),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: { mentorNotice?: { concept: string } } | null;
    };
    expect(body.summary?.mentorNotice?.concept).toBe(RECEIPT_CONCEPT);
  });
});

describe('WI-2498: V’s rollout conjunct', () => {
  it('rollout OFF hides the learner’s own notices', async () => {
    const res = await app.request(
      '/v1/now?scope=self',
      {
        headers: buildAuthHeaders(
          { sub: GUARDIAN.userId, email: GUARDIAN.email },
          fixture.guardianProfileId,
        ),
      },
      { ...TEST_ENV, MENTOR_NOTICE_ENABLED: 'false' },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cards: NowCard[] };
    expect(
      noticeBearingCards(body.cards).some(
        (card) => card.kind === 'mentor_notice',
      ),
    ).toBe(false);
  });
});

/**
 * Predicate-level coverage of V's full conjunct set against the real database.
 *
 * The CONSENT conjunct is not independently observable at the HTTP layer for a
 * self-read: withdrawing the subject's consent makes the upstream consent gate
 * reject the whole request (403), so "no notices" would be indistinguishable
 * from "no response". These cases call the predicate directly, so each conjunct
 * is isolated with the others held true.
 */
// [WI-2504] The predicate now returns `{ visible, policyEpoch }` from the same
// branch structure. Each case below pins BOTH — against a real database — so
// the epoch a client binds its cache to is proven to track the same conjunct
// that decides visibility, per denial reason.
describe('WI-2498: resolveMentorNoticeVisibility conjuncts', () => {
  const EPOCH_VISIBLE = 'notice-policy-v1:on:self:consented';
  const EPOCH_ROLLOUT_OFF = 'notice-policy-v1:off';
  const EPOCH_PROXY = 'notice-policy-v1:on:proxy';
  const EPOCH_OTHER_SUBJECT = 'notice-policy-v1:on:other-subject';
  const EPOCH_CONSENT_WITHDRAWN = 'notice-policy-v1:on:self:withdrawn';

  /** The narrow context shape the predicate reads — nothing else is consulted,
   *  which is itself the proof that no request header can reach the decision
   *  except through the explicit `signals` argument. */
  function source(callerPersonId: string | undefined) {
    const db = createIntegrationDb();
    return {
      get(key: 'db' | 'callerPersonId') {
        return key === 'db' ? db : callerPersonId;
      },
    } as Parameters<typeof resolveMentorNoticeVisibility>[0];
  }

  it('is true for the subject reading their own consented profile with rollout on', async () => {
    await expect(
      resolveMentorNoticeVisibility(
        source(fixture.childProfileId),
        fixture.childProfileId,
        'true',
      ),
    ).resolves.toEqual({ visible: true, policyEpoch: EPOCH_VISIBLE });
  });

  it('is false when the rollout flag is off', async () => {
    await expect(
      resolveMentorNoticeVisibility(
        source(fixture.childProfileId),
        fixture.childProfileId,
        'false',
      ),
    ).resolves.toEqual({ visible: false, policyEpoch: EPOCH_ROLLOUT_OFF });
  });

  it('is false when the caller is not the subject (selfhood conjunct)', async () => {
    await expect(
      resolveMentorNoticeVisibility(
        source(fixture.guardianProfileId),
        fixture.childProfileId,
        'true',
      ),
    ).resolves.toEqual({ visible: false, policyEpoch: EPOCH_OTHER_SUBJECT });
  });

  it('is false when caller identity is unresolved (fail closed)', async () => {
    await expect(
      resolveMentorNoticeVisibility(
        source(undefined),
        fixture.childProfileId,
        'true',
      ),
    ).resolves.toEqual({ visible: false, policyEpoch: EPOCH_OTHER_SUBJECT });
  });

  it('X-Proxy-Mode can only TIGHTEN: true forces false for a genuine self-read', async () => {
    await expect(
      resolveMentorNoticeVisibility(
        source(fixture.childProfileId),
        fixture.childProfileId,
        'true',
        { proxyModeHeader: 'true' },
      ),
    ).resolves.toEqual({ visible: false, policyEpoch: EPOCH_PROXY });
  });

  it('X-Proxy-Mode cannot ESTABLISH selfhood: absent header does not help a non-subject caller', async () => {
    await expect(
      resolveMentorNoticeVisibility(
        source(fixture.guardianProfileId),
        fixture.childProfileId,
        'true',
        { proxyModeHeader: undefined },
      ),
    ).resolves.toEqual({ visible: false, policyEpoch: EPOCH_OTHER_SUBJECT });
  });

  it('is false when the SUBJECT has withdrawn consent (consent conjunct)', async () => {
    const db = createIntegrationDb();
    const accountId = await resolveAccountId(db, fixture.childProfileId);
    if (!accountId) throw new Error('child accountId unresolved');
    await setProfileConsentStatusForTest({
      profileId: fixture.childProfileId,
      accountId,
      status: 'WITHDRAWN',
      parentEmail: GUARDIAN.email,
    });
    try {
      await expect(
        resolveMentorNoticeVisibility(
          source(fixture.childProfileId),
          fixture.childProfileId,
          'true',
        ),
      ).resolves.toEqual({
        visible: false,
        policyEpoch: EPOCH_CONSENT_WITHDRAWN,
      });
    } finally {
      await setProfileConsentStatusForTest({
        profileId: fixture.childProfileId,
        accountId,
        status: 'CONSENTED',
        parentEmail: GUARDIAN.email,
      });
    }
  });
});
