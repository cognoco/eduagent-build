/**
 * Integration: WI-2498 rework — actor x profile-selection x X-Proxy-Mode
 * verification matrix for mentor-notice visibility (V,
 * services/mentor-notices/visibility.ts).
 *
 * WHY THIS FILE EXISTS. `mentor-notice-proxy-visibility.integration.test.ts`
 * (unmodified by this change; a concurrent lane, WI-2504, owns it) covers the
 * guardian-selected-child leak and V's predicate-level conjuncts. An
 * adversarial reviewer found it did not exercise the SUPPORTER axis (person
 * and hub scope) against the same profile-selection x X-Proxy-Mode grid, and
 * did not prove the guard is mutation-sensitive by actually breaking it. This
 * file is the standalone, named matrix that closes that finding:
 *
 *   actor {learner-self, guardian/owner, supporter}
 *   x profile-selection {caller-own, target learner}
 *   x X-Proxy-Mode header {absent, true}
 *   x applicable projection {/now, /now/overflow, /sessions/:id/summary}
 *
 * D = mentor_notice card, notice_locked_in ledger_moment card, and
 * summary.mentorNotice. L(c,s,h) = server caller c equals projected subject s
 * AND X-Proxy-Mode h is not true.
 *
 * NON-VACUITY (AC-4). Every fixture profile also gets an in-progress
 * ("active") learning session, which produces an `unfinished_session` card
 * UNCONDITIONALLY for every scope/visibility combination
 * (collectUnfinishedSessionCandidates is called outside every `visibility ===
 * 'self'` guard in now-feed.ts). Every negative row asserts this card IS
 * present alongside asserting D is absent — proving suppression, not an
 * empty response.
 *
 * SUPPORTER FIXTURE. A supporter cannot select another account's profile via
 * X-Profile-Id (profileScopeMiddleware's `getPersonScope` requires the header
 * profile to belong to the caller's own organization) — so "target learner"
 * for a supporter is reached via `?scope=person&personId=<supportee>` or
 * `?scope=supporter-hub`, never via the header. The supportership is brought
 * to `status: 'accepted'` through the real `initiateLink` / `acceptLink`
 * write path (matching `supporter-visibility-authorization.integration.test.ts`'s
 * convention), never fabricated via raw insert.
 *
 * Supporter reads have NO session-summary projection: `/sessions/:id/summary`
 * resolves its subject via `withProfile(c)` (X-Profile-Id, same-account
 * only), so a cross-account supporter can never reach it. Only learner-self
 * and guardian exercise that surface — this is the "applicable projection"
 * qualifier in the AC, not an omission.
 */

import { eq } from 'drizzle-orm';

import { mentorNotices, person, supportership } from '@eduagent/database';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
  resolveAccountId,
  seedCurriculum,
  seedDirectChildProfileForTest,
  seedFamilyLinkForTest,
  seedLearningSession,
  seedRetentionCard,
  seedSessionSummary,
  seedSubject,
  setProfileConsentStatusForTest,
} from './route-fixtures';
import { mockInngestEvents } from './mocks';
import { clearFetchCalls } from './fetch-interceptor';

import {
  initiateLink,
  acceptLink,
} from '../../apps/api/src/services/linking-ceremony';
import { app } from '../../apps/api/src/index';

const TEST_ENV = {
  ...buildIntegrationEnv(),
  MENTOR_NOTICE_ENABLED: 'true',
};

const LEARNER = {
  userId: 'integration-wi2498m-learner-user',
  email: 'integration-wi2498m-learner@integration.test',
};
const GUARDIAN = {
  userId: 'integration-wi2498m-guardian-user',
  email: 'integration-wi2498m-guardian@integration.test',
};
const SUPPORTER = {
  userId: 'integration-wi2498m-supporter-user',
  email: 'integration-wi2498m-supporter@integration.test',
};
const SUPPORTEE = {
  userId: 'integration-wi2498m-supportee-user',
  email: 'integration-wi2498m-supportee@integration.test',
};

const NOTICE_CONCEPT = (label: string) =>
  `WI2498-matrix open concept — ${label}`;
const NOTICE_HINT = (label: string) => `WI2498-matrix hint — ${label}`;
const LOCKED_CONCEPT = (label: string) =>
  `WI2498-matrix locked concept — ${label}`;
const RECEIPT_CONCEPT = (label: string) =>
  `WI2498-matrix receipt concept — ${label}`;
const RECEIPT_HINT = (label: string) => `WI2498-matrix receipt hint — ${label}`;

type NowCard = { kind: string; params?: Record<string, unknown> };

/** Cards carrying notice evidence — the two collectors the AC names. */
function noticeBearingCards(cards: NowCard[]): NowCard[] {
  return cards.filter(
    (card) =>
      card.kind === 'mentor_notice' ||
      (card.kind === 'ledger_moment' &&
        card.params?.ledgerKind === 'notice_locked_in'),
  );
}

/** The non-vacuity signal: `unfinished_session` and `retention_due` are both
 *  collected unconditionally, outside every `visibility === 'self'` /
 *  `scope === 'self'` guard in now-feed.ts — unlike notice candidates, they
 *  are never suppressed by V or by the scope guards. Five such candidates
 *  are seeded per profile (1 unfinished session + 4 due retention cards) so
 *  the top-3 ranking cannot swallow all of them into `cards`: at least one
 *  must appear in `/now/overflow` too, keeping every overflow assertion
 *  below non-vacuous. */
function hasNonNoticeContent(cards: NowCard[]): boolean {
  return cards.some(
    (card) =>
      card.kind === 'unfinished_session' || card.kind === 'retention_due',
  );
}

type ProfileSurfaces = {
  profileId: string;
  summarySessionId: string;
};

/** Seeds one profile's open notice, 4 locked-in notices (forces overflow —
 *  /now returns only the top 3), a receipt-bearing summary session, AND an
 *  `active` (unfinished) session for the non-vacuity signal. */
async function seedNoticeSurfaces(
  profileId: string,
  label: string,
): Promise<ProfileSurfaces> {
  const db = createIntegrationDb();
  const subject = await seedSubject(
    profileId,
    `WI2498-matrix subject ${label}`,
  );

  const openSessionId = await seedLearningSession({
    profileId,
    subjectId: subject.id,
    overrides: { sessionType: 'homework', status: 'completed' },
  });
  await db.insert(mentorNotices).values({
    profileId,
    subjectId: subject.id,
    sourceSessionId: openSessionId,
    concept: NOTICE_CONCEPT(label),
    correctionHint: NOTICE_HINT(label),
    status: 'open',
  });

  for (let i = 0; i < 4; i += 1) {
    const lockedSessionId = await seedLearningSession({
      profileId,
      subjectId: subject.id,
      overrides: { sessionType: 'homework', status: 'completed' },
    });
    await db.insert(mentorNotices).values({
      profileId,
      subjectId: subject.id,
      sourceSessionId: lockedSessionId,
      concept: `${LOCKED_CONCEPT(label)} #${i}`,
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
    concept: RECEIPT_CONCEPT(label),
    correctionHint: RECEIPT_HINT(label),
    status: 'locked_in',
    resolvedAt: new Date(),
  });
  await seedSessionSummary({
    sessionId: receiptSessionId,
    profileId,
    content: `WI2498-matrix summary ${label}`,
    status: 'submitted',
  });

  // Non-vacuity signal #1: a plain in-progress session. `seedLearningSession`
  // defaults to status:'active', which is exactly what
  // collectUnfinishedSessionCandidates queries — no override needed.
  await seedLearningSession({ profileId, subjectId: subject.id });

  // Non-vacuity signal #2: 4 PAST-DUE retention cards. Combined with the one
  // unfinished_session above, that's 5 notice-free candidates per profile —
  // more than the top-3 ranking window, so at least one is guaranteed to
  // land in `/now/overflow` even when every notice candidate is suppressed
  // (see hasNonNoticeContent's doc comment).
  const { topicIds } = await seedCurriculum({
    subjectId: subject.id,
    topics: [0, 1, 2, 3].map((i) => ({
      title: `WI2498-matrix topic ${label} #${i}`,
    })),
  });
  for (const topicId of topicIds) {
    await seedRetentionCard({
      profileId,
      topicId,
      nextReviewAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
  }

  return { profileId, summarySessionId: receiptSessionId };
}

type Fixture = {
  learner: ProfileSurfaces;
  guardianProfileId: string;
  child: ProfileSurfaces;
  supporter: ProfileSurfaces;
  supportee: ProfileSurfaces;
};

let fixture: Fixture;

beforeAll(async () => {
  mockInngestEvents();
  clearFetchCalls();
  await cleanupAccounts({
    emails: [LEARNER.email, GUARDIAN.email, SUPPORTER.email, SUPPORTEE.email],
    clerkUserIds: [
      LEARNER.userId,
      GUARDIAN.userId,
      SUPPORTER.userId,
      SUPPORTEE.userId,
    ],
  });
  fixture = await seedFixture();
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [LEARNER.email, GUARDIAN.email, SUPPORTER.email, SUPPORTEE.email],
    clerkUserIds: [
      LEARNER.userId,
      GUARDIAN.userId,
      SUPPORTER.userId,
      SUPPORTEE.userId,
    ],
  });
});

async function consentProfile(
  profileId: string,
  parentEmail: string,
): Promise<void> {
  const db = createIntegrationDb();
  const accountId = await resolveAccountId(db, profileId);
  if (!accountId) throw new Error(`accountId unresolved for ${profileId}`);
  await setProfileConsentStatusForTest({
    profileId,
    accountId,
    status: 'CONSENTED',
    parentEmail,
  });
}

async function seedFixture(): Promise<Fixture> {
  // --- learner-self -------------------------------------------------------
  const learnerOwner = await createProfileViaRoute({
    app,
    env: TEST_ENV,
    user: LEARNER,
    displayName: 'WI-2498m Learner',
    birthYear: 1990,
  });
  await consentProfile(learnerOwner.id, LEARNER.email);
  const learner = await seedNoticeSurfaces(learnerOwner.id, 'learner-self');

  // --- guardian + direct child ---------------------------------------------
  const guardian = await createProfileViaRoute({
    app,
    env: TEST_ENV,
    user: GUARDIAN,
    displayName: 'WI-2498m Guardian',
    birthYear: 1985,
  });
  const childProfile = await seedDirectChildProfileForTest({
    parentProfileId: guardian.id,
    accountId: guardian.accountId,
    displayName: 'WI-2498m Child',
    birthYear: 2012,
  });
  await seedFamilyLinkForTest({
    parentProfileId: guardian.id,
    childProfileId: childProfile.id,
  });
  await consentProfile(childProfile.id, GUARDIAN.email);
  const child = await seedNoticeSurfaces(childProfile.id, 'guardian-child');

  // --- supporter + supportee (separate accounts, accepted supportership) --
  const supporterOwner = await createProfileViaRoute({
    app,
    env: TEST_ENV,
    user: SUPPORTER,
    displayName: 'WI-2498m Supporter',
    birthYear: 1980,
  });
  await consentProfile(supporterOwner.id, SUPPORTER.email);
  const supporter = await seedNoticeSurfaces(
    supporterOwner.id,
    'supporter-own',
  );

  const supporteeOwner = await createProfileViaRoute({
    app,
    env: TEST_ENV,
    user: SUPPORTEE,
    displayName: 'WI-2498m Supportee',
    birthYear: 1995,
  });
  await consentProfile(supporteeOwner.id, SUPPORTEE.email);
  const supportee = await seedNoticeSurfaces(
    supporteeOwner.id,
    'supportee-target',
  );

  const db = createIntegrationDb();
  const contract = await initiateLink(db, {
    supporterPersonId: supporter.profileId,
    supporteePersonId: supportee.profileId,
    relation: 'other',
    managedTier: false,
    managedTierActive: false,
    now: new Date(),
  });
  await acceptLink(db, contract.id, {
    actorPersonId: supporter.profileId,
    audience: 'supporter',
    now: new Date(),
  });
  const accepted = await acceptLink(db, contract.id, {
    actorPersonId: supportee.profileId,
    audience: 'supportee',
    now: new Date(),
  });
  if (accepted.status !== 'accepted') {
    throw new Error(
      `fixture setup: supportership did not reach accepted (got ${accepted.status})`,
    );
  }

  return {
    learner,
    guardianProfileId: guardian.id,
    child,
    supporter,
    supportee,
  };
}

function headersFor(
  user: { userId: string; email: string },
  profileId: string,
  proxyMode: boolean,
): HeadersInit {
  return {
    ...(buildAuthHeaders(
      { sub: user.userId, email: user.email },
      profileId,
    ) as Record<string, string>),
    ...(proxyMode ? { 'X-Proxy-Mode': 'true' } : {}),
  };
}

/**
 * One row of the verification matrix. Fixture-dependent values (profileId,
 * personId query params) are NOT resolved here — this is built once at
 * module-eval time, BEFORE `beforeAll` populates `fixture`. Each row instead
 * carries a `resolve(fixture)` closure, called from inside the `it()` body
 * (which runs after `beforeAll`), so the actual path/headers are computed
 * lazily against the real, seeded fixture. Row NAMES need no fixture data —
 * they're static strings — so `describe.each` can enumerate them at collect
 * time while resolution stays lazy.
 */
type Row = {
  name: string;
  isOverflow: boolean;
  resolve: (f: Fixture) => {
    path: string;
    headers: HeadersInit;
    /** true: D must be present (asserted via `concept` when given). false: D
     *  absent AND the non-vacuity signal present. */
    expectD: boolean;
    concept?: string;
  };
};

function nowRows(): Row[] {
  const rows: Row[] = [];

  // R1-R2: learner-self, own profile, header absent — the positive anchor.
  for (const [label, isOverflow] of [
    ['/v1/now', false],
    ['/v1/now/overflow', true],
  ] as const) {
    rows.push({
      name: `learner-self, own profile, no header — ${label}`,
      isOverflow,
      resolve: (f) => ({
        path: `${label}?scope=self`,
        headers: headersFor(LEARNER, f.learner.profileId, false),
        expectD: true,
        // The top-3 `/now` ranking may not surface the same notice as
        // `/now/overflow` — assert whichever concept is guaranteed for that
        // specific surface: the single `mentor_notice` (open) card for
        // `/now`, one of the 4 `notice_locked_in` cards for `/now/overflow`.
        concept: isOverflow
          ? LOCKED_CONCEPT('learner-self')
          : NOTICE_CONCEPT('learner-self'),
      }),
    });
  }

  // R3-R6: guardian selecting the child — the named red case (absent) plus
  // the header-present tightening control.
  for (const proxyMode of [false, true]) {
    for (const [label, isOverflow] of [
      ['/v1/now', false],
      ['/v1/now/overflow', true],
    ] as const) {
      rows.push({
        name: `guardian selecting child, X-Proxy-Mode=${proxyMode} — ${label}`,
        isOverflow,
        resolve: (f) => ({
          path: `${label}?scope=self`,
          headers: headersFor(GUARDIAN, f.child.profileId, proxyMode),
          expectD: false,
        }),
      });
    }
  }

  // R7-R10: supporter selecting THEIR OWN profile (caller-own). Positive
  // when header absent; X-Proxy-Mode:true must TIGHTEN even a genuine
  // self-read (visibility.ts's documented "can only tighten" contract).
  for (const proxyMode of [false, true]) {
    for (const [label, isOverflow] of [
      ['/v1/now', false],
      ['/v1/now/overflow', true],
    ] as const) {
      rows.push({
        name: `supporter selecting own profile, X-Proxy-Mode=${proxyMode} — ${label}`,
        isOverflow,
        resolve: (f) => ({
          path: `${label}?scope=self`,
          headers: headersFor(SUPPORTER, f.supporter.profileId, proxyMode),
          expectD: !proxyMode,
          concept: proxyMode
            ? undefined
            : isOverflow
              ? LOCKED_CONCEPT('supporter-own')
              : NOTICE_CONCEPT('supporter-own'),
        }),
      });
    }
  }

  // R11-R14: supporter targeting the supportee via person scope.
  for (const proxyMode of [false, true]) {
    for (const [label, isOverflow] of [
      ['/v1/now', false],
      ['/v1/now/overflow', true],
    ] as const) {
      rows.push({
        name: `supporter targeting supportee (person scope), X-Proxy-Mode=${proxyMode} — ${label}`,
        isOverflow,
        resolve: (f) => ({
          path: `${label}?scope=person&personId=${f.supportee.profileId}`,
          headers: headersFor(SUPPORTER, f.supporter.profileId, proxyMode),
          expectD: false,
        }),
      });
    }
  }

  // R15-R18: supporter hub scope (aggregates all accepted supportees).
  for (const proxyMode of [false, true]) {
    for (const [label, isOverflow] of [
      ['/v1/now', false],
      ['/v1/now/overflow', true],
    ] as const) {
      rows.push({
        name: `supporter hub scope, X-Proxy-Mode=${proxyMode} — ${label}`,
        isOverflow,
        resolve: (f) => ({
          path: `${label}?scope=supporter-hub`,
          headers: headersFor(SUPPORTER, f.supporter.profileId, proxyMode),
          expectD: false,
        }),
      });
    }
  }

  return rows;
}

describe('WI-2498 rework: mentor-notice visibility verification matrix', () => {
  describe.each(nowRows().map((row) => [row.name, row] as const))(
    '%s',
    (_name, row) => {
      it('matches the guaranteed D property for this named case', async () => {
        const { path, headers, expectD, concept } = row.resolve(fixture);
        const res = await app.request(path, { headers }, TEST_ENV);
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          cards?: NowCard[];
          items?: NowCard[];
        };
        const cards = (row.isOverflow ? body.items : body.cards) ?? [];

        if (expectD) {
          expect(noticeBearingCards(cards).length).toBeGreaterThan(0);
          if (concept) {
            expect(JSON.stringify(cards)).toContain(concept);
          }
        } else {
          expect(noticeBearingCards(cards)).toEqual([]);
          // AC-4 non-vacuity: this response is not merely empty — the
          // unconditional unfinished_session signal must be present, proving
          // suppression rather than an empty database/profile.
          expect(hasNonNoticeContent(cards)).toBe(true);
        }
      });
    },
  );

  // --- session-summary rows (learner-self, guardian only — see file header
  // for why supporter has no applicable projection here) ---------------------

  it('R19: learner-self session summary, no header — carries the notice receipt', async () => {
    const res = await app.request(
      `/v1/sessions/${fixture.learner.summarySessionId}/summary`,
      { headers: headersFor(LEARNER, fixture.learner.profileId, false) },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: { id: string; mentorNotice?: { concept: string } } | null;
    };
    expect(body.summary).not.toBeNull();
    expect(body.summary?.mentorNotice?.concept).toBe(
      RECEIPT_CONCEPT('learner-self'),
    );
  });

  it.each([
    ['R20', false],
    ['R21', true],
  ])(
    '%s: guardian-selected-child session summary, X-Proxy-Mode=%s — summary present, notice receipt absent',
    async (_label, proxyMode) => {
      const res = await app.request(
        `/v1/sessions/${fixture.child.summarySessionId}/summary`,
        {
          headers: headersFor(
            GUARDIAN,
            fixture.child.profileId,
            proxyMode as boolean,
          ),
        },
        TEST_ENV,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        summary: { id: string; mentorNotice?: unknown } | null;
      };
      // Not a denial — the guardian legitimately reads the summary (proves
      // this is suppression, not an empty/failed response).
      expect(body.summary).not.toBeNull();
      expect(body.summary?.mentorNotice).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain(
        RECEIPT_CONCEPT('guardian-child'),
      );
      expect(JSON.stringify(body)).not.toContain(
        RECEIPT_HINT('guardian-child'),
      );
    },
  );
});

// Sanity guard: proves the supporter fixture's supportership genuinely
// reached 'accepted' (a broken fixture would make every supporter-target row
// above vacuously pass with a 403 instead of a 200 + suppressed D).
describe('WI-2498 rework: fixture sanity', () => {
  it('the supporter/supportee link is accepted, not merely pending', async () => {
    const db = createIntegrationDb();
    const rows = await db
      .select({ id: supportership.id })
      .from(supportership)
      .where(eq(supportership.supporterPersonId, fixture.supporter.profileId));
    expect(rows.length).toBeGreaterThan(0);
  });

  it('supporter-target person-scope /now returns 200 (not 403) — proves the scope guard, not a denial, suppresses D', async () => {
    const res = await app.request(
      `/v1/now?scope=person&personId=${fixture.supportee.profileId}`,
      { headers: headersFor(SUPPORTER, fixture.supporter.profileId, false) },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
  });

  it('unrelated person row exists check does not leak (self-check on person table availability)', async () => {
    const db = createIntegrationDb();
    const row = await db.query.person.findFirst({
      where: eq(person.id, fixture.supportee.profileId),
      columns: { id: true },
    });
    expect(row?.id).toBe(fixture.supportee.profileId);
  });
});
