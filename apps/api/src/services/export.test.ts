import type { Database } from '@eduagent/database';
import { dataExportSchema } from '@eduagent/schemas';
import { generateExport } from './export';

const NOW = new Date('2025-01-15T10:00:00.000Z');
const BIRTH = new Date('1990-06-15T00:00:00.000Z');

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
    birthDate: BIRTH,
    personaType: 'LEARNER' as const,
    isOwner: false,
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
  retentionCards = [] as Record<string, unknown>[],
  assessments = [] as Record<string, unknown>[],
  xpLedger = [] as Record<string, unknown>[],
  streaks = [] as Record<string, unknown>[],
  notificationPreferences = [] as Record<string, unknown>[],
  learningModes = [] as Record<string, unknown>[],
  teachingPreferences = [] as Record<string, unknown>[],
  onboardingDrafts = [] as Record<string, unknown>[],
  parkingLotItems = [] as Record<string, unknown>[],
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
      onboardingDrafts: {
        findMany: jest.fn().mockResolvedValue(onboardingDrafts),
      },
      parkingLotItems: {
        findMany: jest.fn().mockResolvedValue(parkingLotItems),
      },
    },
  } as unknown as Database;
}

describe('generateExport', () => {
  it('returns a valid DataExport shape', async () => {
    const db = createMockDb();
    const result = await generateExport(db, 'account-1');

    expect(result.account).toBeDefined();
    expect(result.account.email).toBeDefined();
    expect(result.account.createdAt).toBeDefined();
    expect(result.profiles).toBeInstanceOf(Array);
    expect(result.consentStates).toBeInstanceOf(Array);
    expect(result.exportedAt).toBeDefined();
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
    expect(result.profiles[0].displayName).toBe('Alice');
    expect(result.profiles[0].birthDate).toBe('1990-06-15');
    expect(result.profiles[0].createdAt).toBe('2025-01-15T10:00:00.000Z');
  });

  it('includes consent states with mapped dates', async () => {
    const profileRow = mockProfileRow('p1', 'Alice');
    const consentRow = mockConsentRow('p1');
    const db = createMockDb({ profiles: [profileRow], consents: [consentRow] });
    const result = await generateExport(db, 'account-1');

    expect(result.consentStates).toHaveLength(1);
    expect(result.consentStates[0].consentType).toBe('GDPR');
    expect(result.consentStates[0].status).toBe('CONSENTED');
    expect(result.consentStates[0].requestedAt).toBe(
      '2025-01-15T10:00:00.000Z'
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
    const assessmentRow = { id: 'asmnt-1', profileId: 'p1' };
    const xpRow = { id: 'xp-1', profileId: 'p1' };
    const streakRow = { id: 'str-1', profileId: 'p1' };
    const notifRow = { id: 'notif-1', profileId: 'p1' };
    const modeRow = { id: 'mode-1', profileId: 'p1' };
    const teachRow = { id: 'teach-1', profileId: 'p1' };
    const draftRow = { id: 'draft-1', profileId: 'p1' };
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
      onboardingDrafts: [draftRow],
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
    expect(result.onboardingDrafts).toHaveLength(1);
    expect(result.parkingLotItems).toHaveLength(1);
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
    expect(result.retentionCards).toEqual([]);
    expect(result.assessments).toEqual([]);
    expect(result.xpLedger).toEqual([]);
    expect(result.streaks).toEqual([]);
    expect(result.notificationPreferences).toEqual([]);
    expect(result.learningModes).toEqual([]);
    expect(result.teachingPreferences).toEqual([]);
    expect(result.onboardingDrafts).toEqual([]);
    expect(result.parkingLotItems).toEqual([]);
  });
});
