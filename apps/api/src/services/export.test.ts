import type { Database } from '@eduagent/database';
import { dataExportSchema } from '@eduagent/schemas';
import { generateExport, serializeDates } from './export';

const NOW = new Date('2025-01-15T10:00:00.000Z');

function mockAccountRow() {
  return {
    id: 'account-1',
    clerkUserId: 'clerk_1',
    email: 'user@example.com',
    createdAt: NOW,
    updatedAt: NOW,
    deletionScheduledAt: null,
    deletionCancelledAt: null,
  };
}

function mockProfileRow(id: string, displayName: string) {
  return {
    id,
    accountId: 'account-1',
    displayName,
    avatarUrl: null,
    birthYear: 1990,
    location: null,
    isOwner: false,
    hasPremiumLlm: false,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function mockConsentRow(profileId: string) {
  return {
    id: 'consent-1',
    profileId,
    consentType: 'GDPR' as const,
    status: 'CONSENTED' as const,
    parentEmail: 'parent@example.com',
    requestedAt: NOW,
    respondedAt: NOW,
    expiresAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createMockDb({
  account = mockAccountRow() as ReturnType<typeof mockAccountRow> | undefined,
  profiles = [] as ReturnType<typeof mockProfileRow>[],
  consents = [] as ReturnType<typeof mockConsentRow>[],
  subjects = [] as Record<string, unknown>[],
  curricula = [] as Record<string, unknown>[],
  curriculumTopics = [] as Record<string, unknown>[],
  learningSessions = [] as Record<string, unknown>[],
  sessionEvents = [] as Record<string, unknown>[],
  sessionSummaries = [] as Record<string, unknown>[],
  sessionEmbeddings = [] as Record<string, unknown>[],
  retentionCards = [] as Record<string, unknown>[],
  assessments = [] as Record<string, unknown>[],
  xpLedger = [] as Record<string, unknown>[],
  streaks = [] as Record<string, unknown>[],
  notificationPreferences = [] as Record<string, unknown>[],
  learningModes = [] as Record<string, unknown>[],
  teachingPreferences = [] as Record<string, unknown>[],
  parkingLotItems = [] as Record<string, unknown>[],
  needsDeepeningTopics = [] as Record<string, unknown>[],
  familyLinks = [] as Record<string, unknown>[],
  subscriptions = [] as Record<string, unknown>[],
  quotaPools = [] as Record<string, unknown>[],
  topUpCredits = [] as Record<string, unknown>[],
  learningProfiles = [] as Record<string, unknown>[],
  mentorActivityLedger = [] as Record<string, unknown>[],
} = {}): Database {
  return {
    query: {
      accounts: {
        findFirst: jest.fn().mockResolvedValue(account),
      },
      profiles: {
        findMany: jest.fn().mockResolvedValue(profiles),
      },
      consentStates: {
        findMany: jest.fn().mockResolvedValue(consents),
      },
      subjects: {
        findMany: jest.fn().mockResolvedValue(subjects),
      },
      curricula: {
        findMany: jest.fn().mockResolvedValue(curricula),
      },
      curriculumTopics: {
        findMany: jest.fn().mockResolvedValue(curriculumTopics),
      },
      learningSessions: {
        findMany: jest.fn().mockResolvedValue(learningSessions),
      },
      sessionEvents: {
        findMany: jest.fn().mockResolvedValue(sessionEvents),
      },
      sessionSummaries: {
        findMany: jest.fn().mockResolvedValue(sessionSummaries),
      },
      sessionEmbeddings: {
        findMany: jest.fn().mockResolvedValue(sessionEmbeddings),
      },
      retentionCards: {
        findMany: jest.fn().mockResolvedValue(retentionCards),
      },
      assessments: {
        findMany: jest.fn().mockResolvedValue(assessments),
      },
      xpLedger: {
        findMany: jest.fn().mockResolvedValue(xpLedger),
      },
      streaks: {
        findMany: jest.fn().mockResolvedValue(streaks),
      },
      notificationPreferences: {
        findMany: jest.fn().mockResolvedValue(notificationPreferences),
      },
      learningModes: {
        findMany: jest.fn().mockResolvedValue(learningModes),
      },
      teachingPreferences: {
        findMany: jest.fn().mockResolvedValue(teachingPreferences),
      },
      parkingLotItems: {
        findMany: jest.fn().mockResolvedValue(parkingLotItems),
      },
      needsDeepeningTopics: {
        findMany: jest.fn().mockResolvedValue(needsDeepeningTopics),
      },
      familyLinks: {
        findMany: jest.fn().mockResolvedValue(familyLinks),
      },
      subscriptions: {
        findMany: jest.fn().mockResolvedValue(subscriptions),
      },
      quotaPools: {
        findMany: jest.fn().mockResolvedValue(quotaPools),
      },
      topUpCredits: {
        findMany: jest.fn().mockResolvedValue(topUpCredits),
      },
      learningProfiles: {
        findMany: jest.fn().mockResolvedValue(learningProfiles),
      },
      mentorActivityLedger: {
        findMany: jest.fn().mockResolvedValue(mentorActivityLedger),
      },
    },
  } as unknown as Database;
}

describe('generateExport', () => {
  it('returns a valid DataExport shape', async () => {
    const db = createMockDb();
    const result = await generateExport(db, 'account-1');

    expect(result.account).toEqual(expect.objectContaining({}));
    expect(typeof result.account.email).toBe('string');
    expect(typeof result.account.createdAt).toBe('string');
    expect(result.profiles).toBeInstanceOf(Array);
    expect(result.consentStates).toBeInstanceOf(Array);
    expect(typeof result.exportedAt).toBe('string');
  });

  it('returns a valid ISO 8601 exportedAt date', async () => {
    const db = createMockDb();
    const result = await generateExport(db, 'account-1');
    expect(new Date(result.exportedAt).toISOString()).toBe(result.exportedAt);
  });

  it('validates against the dataExportSchema', async () => {
    const db = createMockDb();
    const result = await generateExport(db, 'account-1');
    const parsed = dataExportSchema.safeParse(result);

    expect(parsed.success).toBe(true);
  });

  it('returns empty arrays for a new account (no profiles)', async () => {
    const db = createMockDb({ profiles: [], consents: [] });
    const result = await generateExport(db, 'brand-new-account');

    expect(result.profiles).toEqual([]);
    expect(result.consentStates).toEqual([]);
  });

  it('returns consistent results across multiple calls (idempotent)', async () => {
    const db = createMockDb();
    const first = await generateExport(db, 'account-1');
    const second = await generateExport(db, 'account-1');

    expect(first.account.email).toBe(second.account.email);
    expect(first.profiles).toEqual(second.profiles);
    expect(first.consentStates).toEqual(second.consentStates);
  });

  it('returns a valid account email', async () => {
    const db = createMockDb();
    const result = await generateExport(db, 'account-1');

    expect(result.account.email).toContain('@');
  });

  it('includes profiles with mapped dates', async () => {
    const profileRow = mockProfileRow('p1', 'Alice');
    const db = createMockDb({ profiles: [profileRow] });
    const result = await generateExport(db, 'account-1');

    expect(result.profiles).toHaveLength(1);
    expect(result.profiles[0]!.displayName).toBe('Alice');
    expect(result.profiles[0]!.birthYear).toBe(1990);
    expect(result.profiles[0]!.createdAt).toBe('2025-01-15T10:00:00.000Z');
  });

  it('includes consent states with mapped dates', async () => {
    const profileRow = mockProfileRow('p1', 'Alice');
    const consentRow = mockConsentRow('p1');
    const db = createMockDb({ profiles: [profileRow], consents: [consentRow] });
    const result = await generateExport(db, 'account-1');

    expect(result.consentStates).toHaveLength(1);
    expect(result.consentStates[0]!.consentType).toBe('GDPR');
    expect(result.consentStates[0]!.status).toBe('CONSENTED');
    expect(result.consentStates[0]!.requestedAt).toBe(
      '2025-01-15T10:00:00.000Z',
    );
  });

  it('includes GDPR Article 15 tables when data is present', async () => {
    const profileRow = mockProfileRow('p1', 'Alice');
    const subjectRow = { id: 'sub-1', profileId: 'p1', name: 'Math' };
    const curriculumRow = { id: 'cur-1', subjectId: 'sub-1', version: 1 };
    const topicRow = { id: 'top-1', curriculumId: 'cur-1', title: 'Algebra' };
    const sessionRow = { id: 'ses-1', profileId: 'p1' };
    const eventRow = { id: 'evt-1', profileId: 'p1' };
    const summaryRow = { id: 'sum-1', profileId: 'p1' };
    const cardRow = { id: 'card-1', profileId: 'p1' };
    // [WI-978] Assessment row must match the tightened dataExportAssessmentRowSchema.
    const now = new Date('2025-05-01T00:00:00.000Z').toISOString();
    const assessmentRow = {
      id: 'a0000000-0000-4000-8000-000000000001',
      profileId: 'a0000000-0000-4000-8000-000000000002',
      subjectId: 'a0000000-0000-4000-8000-000000000003',
      topicId: 'a0000000-0000-4000-8000-000000000004',
      sessionId: null,
      verificationDepth: 'recall',
      status: 'passed',
      masteryScore: null,
      masteryChallengeVerifiedAt: null,
      qualityRating: null,
      exchangeHistory: [],
      createdAt: now,
      updatedAt: now,
    };
    const xpRow = { id: 'xp-1', profileId: 'p1' };
    const streakRow = { id: 'str-1', profileId: 'p1' };
    const notifRow = { id: 'notif-1', profileId: 'p1' };
    const modeRow = { id: 'mode-1', profileId: 'p1' };
    const teachRow = { id: 'teach-1', profileId: 'p1' };
    const parkingRow = { id: 'park-1', profileId: 'p1' };

    const db = createMockDb({
      profiles: [profileRow],
      subjects: [subjectRow],
      curricula: [curriculumRow],
      curriculumTopics: [topicRow],
      learningSessions: [sessionRow],
      sessionEvents: [eventRow],
      sessionSummaries: [summaryRow],
      retentionCards: [cardRow],
      assessments: [assessmentRow],
      xpLedger: [xpRow],
      streaks: [streakRow],
      notificationPreferences: [notifRow],
      learningModes: [modeRow],
      teachingPreferences: [teachRow],
      parkingLotItems: [parkingRow],
    });

    const result = await generateExport(db, 'account-1');

    expect(result.subjects).toHaveLength(1);
    expect(result.curricula).toHaveLength(1);
    expect(result.curriculumTopics).toHaveLength(1);
    expect(result.learningSessions).toHaveLength(1);
    expect(result.sessionEvents).toHaveLength(1);
    expect(result.sessionSummaries).toHaveLength(1);
    expect(result.retentionCards).toHaveLength(1);
    expect(result.assessments).toHaveLength(1);
    expect(result.xpLedger).toHaveLength(1);
    expect(result.streaks).toHaveLength(1);
    expect(result.notificationPreferences).toHaveLength(1);
    expect(result.learningModes).toHaveLength(1);
    expect(result.teachingPreferences).toHaveLength(1);
    expect(result.parkingLotItems).toHaveLength(1);
  });

  // Break test [BUG-934] — GDPR export is user-visible. ai_response rows
  // that contain raw envelope JSON must be projected to prose before export.
  it('[BUG-934] projects raw envelope JSON in ai_response sessionEvent rows to prose', async () => {
    const profileRow = mockProfileRow('p1', 'Alice');
    const rawEnvelope = JSON.stringify({
      reply: 'Great job today!',
      signals: { close: true },
      ui_hints: {},
    });
    const eventRows = [
      {
        id: 'evt-user',
        profileId: 'p1',
        sessionId: 'ses-1',
        eventType: 'user_message',
        content: 'What is gravity?',
      },
      {
        id: 'evt-ai',
        profileId: 'p1',
        sessionId: 'ses-1',
        eventType: 'ai_response',
        content: rawEnvelope,
      },
    ];

    const db = createMockDb({
      profiles: [profileRow],
      sessionEvents: eventRows,
    });

    const result = await generateExport(db, 'account-1');

    expect(result.sessionEvents).toBeDefined();
    const events = result.sessionEvents as Record<string, unknown>[];

    const aiRow = events.find(
      (e: Record<string, unknown>) => e['eventType'] === 'ai_response',
    );
    expect(aiRow).toBeDefined();
    expect(aiRow!['content']).toBe('Great job today!');
    expect(aiRow!['content']).not.toContain('"signals"');
    expect(aiRow!['content']).not.toContain('"ui_hints"');

    // user_message rows must be left untouched
    const userRow = events.find(
      (e: Record<string, unknown>) => e['eventType'] === 'user_message',
    );
    expect(userRow).toBeDefined();
    expect(userRow!['content']).toBe('What is gravity?');
  });

  it('[WI-213] projects raw envelope JSON in legacy sessionEmbedding rows before export', async () => {
    const profileRow = mockProfileRow('p1', 'Alice');
    const rawEnvelope = JSON.stringify({
      reply: 'Embedding-visible tutoring prose.',
      signals: { ready_to_finish: true },
      ui_hints: { fluency_drill: { active: false } },
    });
    const embeddingRows = [
      {
        id: 'emb-1',
        profileId: 'p1',
        sessionId: 'ses-1',
        content: rawEnvelope,
        createdAt: NOW,
      },
    ];

    const db = createMockDb({
      profiles: [profileRow],
      sessionEmbeddings: embeddingRows,
    });

    const result = await generateExport(db, 'account-1');

    expect(result.sessionEmbeddings).toHaveLength(1);
    const [embedding] = result.sessionEmbeddings as Record<string, unknown>[];
    expect(embedding!['content']).toBe('Embedding-visible tutoring prose.');
    expect(embedding!['content']).not.toContain('"signals"');
    expect(embedding!['content']).not.toContain('"ui_hints"');
  });

  it('[WI-213] projects embedded raw envelopes inside legacy full-transcript sessionEmbedding content', async () => {
    const profileRow = mockProfileRow('p1', 'Alice');
    const rawEnvelope = JSON.stringify({
      reply: 'Visible mentor reply.',
      signals: { partial_progress: true },
      ui_hints: { note_prompt: { show: false } },
    });
    const embeddingRows = [
      {
        id: 'emb-1',
        profileId: 'p1',
        sessionId: 'ses-1',
        content: `What is photosynthesis?\n\n${rawEnvelope}\n\nWhy does chlorophyll matter?`,
        createdAt: NOW,
      },
    ];

    const db = createMockDb({
      profiles: [profileRow],
      sessionEmbeddings: embeddingRows,
    });

    const result = await generateExport(db, 'account-1');

    const [embedding] = result.sessionEmbeddings as Record<string, unknown>[];
    expect(embedding!['content']).toBe(
      'What is photosynthesis?\n\nVisible mentor reply.\n\nWhy does chlorophyll matter?',
    );
    expect(embedding!['content']).not.toContain('"signals"');
    expect(embedding!['content']).not.toContain('"ui_hints"');
    expect(embedding!['content']).not.toContain('"reply"');
  });

  it('[WI-213] projects embedded raw envelopes when a legacy transcript starts with non-envelope JSON', async () => {
    const profileRow = mockProfileRow('p1', 'Alice');
    const learnerJson = JSON.stringify({ student: 'asked in JSON' });
    const rawEnvelope = JSON.stringify({
      reply: 'Visible reply.',
      signals: { partial_progress: true },
      private_sources: { reason: 'internal source-pack detail' },
    });
    const embeddingRows = [
      {
        id: 'emb-1',
        profileId: 'p1',
        sessionId: 'ses-1',
        content: `${learnerJson}\n\n${rawEnvelope}`,
        createdAt: NOW,
      },
    ];

    const db = createMockDb({
      profiles: [profileRow],
      sessionEmbeddings: embeddingRows,
    });

    const result = await generateExport(db, 'account-1');

    const [embedding] = result.sessionEmbeddings as Record<string, unknown>[];
    expect(embedding!['content']).toBe(`${learnerJson}\n\nVisible reply.`);
    expect(embedding!['content']).not.toContain('"signals"');
    expect(embedding!['content']).not.toContain('"private_sources"');
  });

  it('[WI-213] preserves embedded JSON examples that are not strict envelopes', async () => {
    const profileRow = mockProfileRow('p1', 'Alice');
    const jsonExample = JSON.stringify({
      reply: 'Keep this field in the export.',
      signals: { example: true },
      extra: 'This makes the object arbitrary content, not an envelope.',
    });
    const embeddingRows = [
      {
        id: 'emb-1',
        profileId: 'p1',
        sessionId: 'ses-1',
        content: `Please explain this JSON:\n\n${jsonExample}`,
        createdAt: NOW,
      },
    ];

    const db = createMockDb({
      profiles: [profileRow],
      sessionEmbeddings: embeddingRows,
    });

    const result = await generateExport(db, 'account-1');

    const [embedding] = result.sessionEmbeddings as Record<string, unknown>[];
    expect(embedding!['content']).toBe(
      `Please explain this JSON:\n\n${jsonExample}`,
    );
  });

  // [BUG-413] Break tests: Drizzle / neon-serverless returns raw Date objects.
  // Without serializeDates, the export payload carries Date objects in rows
  // that were cast as `Record<string, unknown>[]`.  These are NOT ISO strings
  // and cause inconsistent behaviour (zod z.unknown() accepts them silently,
  // but strict consumers and JSON.stringify produce different results).
  describe('[BUG-413] Date serialisation in raw-cast GDPR tables', () => {
    it('serializeDates converts Date values to ISO strings', () => {
      const date = new Date('2025-06-01T12:00:00.000Z');
      const row = { id: 'x', createdAt: date, name: 'Alice', count: 5 };
      const result = serializeDates(row);
      expect(result['createdAt']).toBe('2025-06-01T12:00:00.000Z');
      expect(result['id']).toBe('x');
      expect(result['name']).toBe('Alice');
      expect(result['count']).toBe(5);
    });

    it('serializeDates leaves non-Date values unchanged (strings, numbers, nulls)', () => {
      const row = {
        id: 'abc',
        score: 42,
        label: 'math',
        missing: null,
        flag: true,
      };
      const result = serializeDates(row);
      expect(result).toEqual(row);
    });

    it('exports subjects rows with Date columns as ISO strings (not Date objects)', async () => {
      const profileRow = mockProfileRow('p1', 'Alice');
      const date = new Date('2025-03-10T08:30:00.000Z');
      // Simulate a Drizzle row that carries a raw Date object (neon-serverless).
      const subjectRow = {
        id: 'sub-1',
        profileId: 'p1',
        name: 'Biology',
        createdAt: date,
        updatedAt: date,
      };
      const db = createMockDb({
        profiles: [profileRow],
        subjects: [subjectRow as unknown as Record<string, unknown>],
      });

      const result = await generateExport(db, 'account-1');

      expect(result.subjects).toHaveLength(1);
      const exported = (result.subjects as Record<string, unknown>[])[0]!;
      // Without BUG-413 fix: createdAt would be a Date object, not a string.
      expect(typeof exported['createdAt']).toBe('string');
      expect(exported['createdAt']).toBe('2025-03-10T08:30:00.000Z');
      expect(exported['updatedAt']).toBe('2025-03-10T08:30:00.000Z');
    });

    it('exports learningSessions rows with Date columns as ISO strings', async () => {
      const profileRow = mockProfileRow('p1', 'Alice');
      const date = new Date('2025-04-15T09:00:00.000Z');
      const sessionRow = {
        id: 'ses-1',
        profileId: 'p1',
        startedAt: date,
        endedAt: date,
        createdAt: date,
      };
      const db = createMockDb({
        profiles: [profileRow],
        learningSessions: [sessionRow as unknown as Record<string, unknown>],
      });

      const result = await generateExport(db, 'account-1');

      const sessions = result.learningSessions as Record<string, unknown>[];
      expect(sessions).toHaveLength(1);
      // All Date fields must be ISO strings, not Date objects.
      expect(typeof sessions[0]!['startedAt']).toBe('string');
      expect(sessions[0]!['startedAt']).toBe('2025-04-15T09:00:00.000Z');
      expect(sessions[0]!['endedAt']).toBe('2025-04-15T09:00:00.000Z');
    });

    it('dataExportSchema.parse succeeds on export with Date-carrying raw subscriptions row', async () => {
      // subscriptions are account-scoped (not profile-scoped), so they are
      // always queried regardless of profileIds — ideal for a Date-serialisation
      // schema-parse test that doesn't depend on profileSchema.
      const date = new Date('2025-05-01T00:00:00.000Z');
      // [WI-978] Row must match the tightened dataExportSubscriptionRowSchema:
      // real column names (`tier`/`status`) and valid UUIDs for id/accountId.
      const subUuid = 'a1b2c3d4-e5f6-4789-a012-b3c4d5e6f701';
      const acctUuid = 'a1b2c3d4-e5f6-4789-a012-b3c4d5e6f702';
      const subscriptionRow = {
        id: subUuid,
        accountId: acctUuid,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        tier: 'plus',
        status: 'active',
        trialEndsAt: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelledAt: null,
        lastStripeEventTimestamp: null,
        lastStripeEventId: null,
        revenuecatOriginalAppUserId: null,
        lastRevenuecatEventId: null,
        lastRevenuecatEventTimestampMs: null,
        createdAt: date,
        updatedAt: date,
      };
      const db = createMockDb({
        profiles: [],
        subscriptions: [subscriptionRow as unknown as Record<string, unknown>],
      });

      const result = await generateExport(db, 'account-1');
      // Without BUG-413 fix, Date objects would pass through as-is.
      // With the fix, the serialized row has ISO string dates.
      const subs = result.subscriptions as Record<string, unknown>[];
      expect(subs).toHaveLength(1);
      expect(typeof subs[0]!['createdAt']).toBe('string');
      expect(subs[0]!['createdAt']).toBe('2025-05-01T00:00:00.000Z');

      // Schema parse must also succeed — no raw Date objects in the payload.
      const parsed = dataExportSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });

  it('returns empty arrays for GDPR tables when no profiles exist', async () => {
    const db = createMockDb({ profiles: [], consents: [] });
    const result = await generateExport(db, 'account-1');

    expect(result.subjects).toEqual([]);
    expect(result.curricula).toEqual([]);
    expect(result.curriculumTopics).toEqual([]);
    expect(result.learningSessions).toEqual([]);
    expect(result.sessionEvents).toEqual([]);
    expect(result.sessionSummaries).toEqual([]);
    expect(result.sessionEmbeddings).toEqual([]);
    expect(result.retentionCards).toEqual([]);
    expect(result.assessments).toEqual([]);
    expect(result.xpLedger).toEqual([]);
    expect(result.streaks).toEqual([]);
    expect(result.notificationPreferences).toEqual([]);
    expect(result.learningModes).toEqual([]);
    expect(result.teachingPreferences).toEqual([]);
    expect(result.parkingLotItems).toEqual([]);
    expect(result.needsDeepeningTopics).toEqual([]);
    expect(result.familyLinks).toEqual([]);
    // subscriptions are account-scoped (not profile-scoped), so they still get queried
    expect(result.subscriptions).toEqual([]);
    expect(result.quotaPools).toEqual([]);
    expect(result.topUpCredits).toEqual([]);
    expect(result.mentorActivityLedger).toEqual([]);
  });

  // [WI-679] GDPR Art-15 gap: mentor_activity_ledger (added by migration 0111)
  // was written from merge day but was missing from the export — erasure via FK
  // cascade was covered but portability was not.
  it('[WI-679] includes mentor_activity_ledger rows for the owning profile in the export', async () => {
    const profileRow = mockProfileRow('p1', 'Alice');
    const ledgerRow = {
      id: 'ledger-1',
      profileId: 'p1',
      actorJob: 'mentor',
      kind: 'session_recap',
      templateKey: 'recap.v1',
      params: { score: 42 },
      visibility: 'self',
      createdAt: NOW,
      surfacedAt: null,
    };

    const db = createMockDb({
      profiles: [profileRow],
      mentorActivityLedger: [ledgerRow],
    });

    const result = await generateExport(db, 'account-1');

    expect(result.mentorActivityLedger).toHaveLength(1);
    const exported = (
      result.mentorActivityLedger as Record<string, unknown>[]
    )[0]!;
    expect(exported['id']).toBe('ledger-1');
    expect(exported['profileId']).toBe('p1');
    expect(exported['templateKey']).toBe('recap.v1');
    // Date serialisation: createdAt must be an ISO string, not a Date object
    expect(typeof exported['createdAt']).toBe('string');
    expect(exported['createdAt']).toBe('2025-01-15T10:00:00.000Z');
  });

  it('[WI-679] passes a where clause to mentor_activity_ledger findMany (proves profile scoping)', async () => {
    // createMockDb ignores where args — it always returns the seeded rows.
    // What we prove: the service passes a non-undefined where argument to
    // findMany, meaning profile scoping is wired.  A service that dropped
    // inArray(...profileIds) would pass `undefined` and this assertion
    // would catch it.
    //
    // Complementary proof (see test below): when profileIds is empty the
    // service must NOT call findMany at all — the early-return guard is
    // the second half of the scoping proof.
    const profileRow = mockProfileRow('p1', 'Alice');
    const ledgerRow = {
      id: 'ledger-own',
      profileId: 'p1',
      actorJob: 'mentor',
      kind: 'session_recap',
      templateKey: 'recap.v1',
      params: {},
      visibility: 'self',
      createdAt: NOW,
      surfacedAt: null,
    };

    const db = createMockDb({
      profiles: [profileRow],
      mentorActivityLedger: [ledgerRow],
    });

    await generateExport(db, 'account-1');

    const mockDb = db as unknown as {
      query: {
        mentorActivityLedger: { findMany: jest.Mock };
      };
    };
    expect(mockDb.query.mentorActivityLedger.findMany).toHaveBeenCalledTimes(1);
    // The call must include a where argument — undefined means no scoping.
    const callArgs = mockDb.query.mentorActivityLedger.findMany.mock
      .calls[0]![0] as { where?: unknown } | undefined;
    expect(callArgs).toBeDefined();
    expect(callArgs!.where).toBeDefined();
  });

  it('[WI-679] skips mentor_activity_ledger query when account has no profiles', async () => {
    // When profileIds is empty the service must NOT call findMany at all.
    // The inArray guard short-circuits to [] without touching the DB.
    // If the where guard were missing, the service would call findMany
    // unconditionally and return every row in the table.
    const db = createMockDb({ profiles: [], consents: [] });

    await generateExport(db, 'brand-new-account');

    const mockDb = db as unknown as {
      query: {
        mentorActivityLedger: { findMany: jest.Mock };
      };
    };
    expect(mockDb.query.mentorActivityLedger.findMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// [WI-809] generateExport(learningOnlyProfileIds) branch — NO-DB unit coverage.
// generateExportV2 calls generateExport with this opt so the legacy export half
// skips the four identity tables dropped at M-DROP (accounts/profiles/
// consent_states/family_links) — they 500 post-drop. [WI-805] The legacy
// billing chain (subscriptions → quota/top-ups) is now skipped on this path too
// (dropped by 0119); the CI-lane red-green for that skip lives in
// export.integration.test.ts. These fast mock-db assertions pin the branching.
// ---------------------------------------------------------------------------

describe('generateExport — [WI-809] learningOnlyProfileIds branch', () => {
  it('skips the four dropped-identity reads AND the legacy billing chain; keeps learning reads keyed on the passed ids', async () => {
    // Seed the identity tables too — a correct learningOnly path must NOT touch them.
    const db = createMockDb({
      account: mockAccountRow(),
      profiles: [mockProfileRow('person-1', 'Charge One')],
      consents: [mockConsentRow('person-1')],
      familyLinks: [
        { parentProfileId: 'g-1', childProfileId: 'person-1', createdAt: NOW },
      ],
      subjects: [
        {
          id: 'subj-1',
          profileId: 'person-1',
          name: 'Math',
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });

    const result = await generateExport(db, 'org-1', {
      learningOnlyProfileIds: ['person-1'],
    });

    const q = (
      db as unknown as {
        query: Record<string, { findMany?: jest.Mock; findFirst?: jest.Mock }>;
      }
    ).query;
    // The four dropped-identity reads are SKIPPED flag-on (would 500 post-drop).
    expect(q.accounts!.findFirst!).not.toHaveBeenCalled();
    expect(q.profiles!.findMany!).not.toHaveBeenCalled();
    expect(q.consentStates!.findMany!).not.toHaveBeenCalled();
    expect(q.familyLinks!.findMany!).not.toHaveBeenCalled();

    // Identity sections are empty placeholders (the v2 caller overrides them).
    expect(result.account).toEqual({
      email: '',
      createdAt: expect.any(String),
    });
    expect(result.profiles).toEqual([]);
    expect(result.consentStates).toEqual([]);
    expect(result.familyLinks).toEqual([]);

    // The learning-data half STILL runs, keyed on the passed ids.
    expect(q.subjects!.findMany!).toHaveBeenCalled();
    expect(result.subjects).toHaveLength(1);
    // [WI-805] The legacy billing chain (subscriptions → quota/top-ups) is now
    // ALSO skipped on the learning-only path: the v2 export twin overrides
    // billing from the v2 `subscription` chain, so the legacy `subscriptions`
    // read (dropped by 0119) must not run — it would 500 post-drop.
    expect(q.subscriptions!.findMany!).not.toHaveBeenCalled();
    expect(result.subscriptions).toEqual([]);
    expect(result.quotaPools).toEqual([]);
    expect(result.topUpCredits).toEqual([]);
  });

  it('[non-vacuous] WITHOUT learningOnlyProfileIds the four dropped-identity reads DO run', async () => {
    const db = createMockDb({
      profiles: [mockProfileRow('person-1', 'Charge One')],
    });

    await generateExport(db, 'account-1');

    const q = (
      db as unknown as {
        query: Record<string, { findMany?: jest.Mock; findFirst?: jest.Mock }>;
      }
    ).query;
    expect(q.accounts!.findFirst!).toHaveBeenCalled();
    expect(q.profiles!.findMany!).toHaveBeenCalled();
    expect(q.consentStates!.findMany!).toHaveBeenCalled();
    expect(q.familyLinks!.findMany!).toHaveBeenCalled();
  });
});
