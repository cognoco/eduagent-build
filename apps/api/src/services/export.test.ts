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
});
