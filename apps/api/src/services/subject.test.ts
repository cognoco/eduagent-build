jest.mock('@eduagent/database', () => {
  const actual = jest.requireActual('@eduagent/database');
  return {
    ...actual,
    createScopedRepository: jest.fn(),
  };
});

import type { Database } from '@eduagent/database';
import { createScopedRepository } from '@eduagent/database';
import {
  listSubjects,
  createSubject,
  getSubject,
  updateSubject,
} from './subject';

const NOW = new Date('2025-01-15T10:00:00.000Z');
const profileId = 'test-profile-id';

function mockSubjectRow(
  overrides?: Partial<{
    id: string;
    profileId: string;
    name: string;
    status: 'active' | 'paused' | 'archived';
  }>
) {
  return {
    id: overrides?.id ?? 'subject-1',
    profileId: overrides?.profileId ?? profileId,
    name: overrides?.name ?? 'Mathematics',
    status: overrides?.status ?? 'active',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createMockDb({
  insertReturning = [] as ReturnType<typeof mockSubjectRow>[],
  updateReturning = [] as ReturnType<typeof mockSubjectRow>[],
} = {}): Database {
  return {
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue(insertReturning),
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue(updateReturning),
        }),
      }),
    }),
  } as unknown as Database;
}

function setupScopedRepo({
  findManyResult = [] as ReturnType<typeof mockSubjectRow>[],
  findFirstResult = undefined as ReturnType<typeof mockSubjectRow> | undefined,
} = {}) {
  (createScopedRepository as jest.Mock).mockReturnValue({
    subjects: {
      findMany: jest.fn().mockResolvedValue(findManyResult),
      findFirst: jest.fn().mockResolvedValue(findFirstResult),
    },
  });
}

describe('listSubjects', () => {
  it('returns empty array when no subjects', async () => {
    setupScopedRepo({ findManyResult: [] });
    const db = createMockDb();
    const result = await listSubjects(db, profileId);
    expect(result).toEqual([]);
  });

  it('returns mapped subjects', async () => {
    const rows = [
      mockSubjectRow({ id: 's1', name: 'Math' }),
      mockSubjectRow({ id: 's2', name: 'Science' }),
    ];
    setupScopedRepo({ findManyResult: rows });
    const db = createMockDb();
    const result = await listSubjects(db, profileId);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Math');
    expect(result[1].name).toBe('Science');
    expect(result[0].createdAt).toBe('2025-01-15T10:00:00.000Z');
  });

  it('filters by active status by default', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    (createScopedRepository as jest.Mock).mockReturnValue({
      subjects: { findMany },
    });
    const db = createMockDb();
    await listSubjects(db, profileId);

    // Should pass a SQL where clause (not undefined)
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0]).toBeDefined();
  });

  it('passes no status filter when includeInactive is true', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    (createScopedRepository as jest.Mock).mockReturnValue({
      subjects: { findMany },
    });
    const db = createMockDb();
    await listSubjects(db, profileId, { includeInactive: true });

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0]).toBeUndefined();
  });
});

describe('createSubject', () => {
  it('returns subject with name from input', async () => {
    const row = mockSubjectRow({ name: 'Mathematics' });
    const db = createMockDb({ insertReturning: [row] });
    const result = await createSubject(db, profileId, { name: 'Mathematics' });

    expect(result.name).toBe('Mathematics');
    expect(result.profileId).toBe(profileId);
    expect(result.status).toBe('active');
  });

  it('includes valid timestamps', async () => {
    const row = mockSubjectRow({ name: 'Science' });
    const db = createMockDb({ insertReturning: [row] });
    const result = await createSubject(db, profileId, { name: 'Science' });

    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
    expect(() => new Date(result.createdAt)).not.toThrow();
    expect(() => new Date(result.updatedAt)).not.toThrow();
  });

  it('returns an id', async () => {
    const row = mockSubjectRow({ id: 'new-id', name: 'History' });
    const db = createMockDb({ insertReturning: [row] });
    const result = await createSubject(db, profileId, { name: 'History' });
    expect(result.id).toBe('new-id');
  });
});

describe('getSubject', () => {
  it('returns null when not found', async () => {
    setupScopedRepo({ findFirstResult: undefined });
    const db = createMockDb();
    const result = await getSubject(db, profileId, 'some-subject-id');
    expect(result).toBeNull();
  });

  it('returns mapped subject when found', async () => {
    const row = mockSubjectRow({ id: 'subject-1', name: 'Physics' });
    setupScopedRepo({ findFirstResult: row });
    const db = createMockDb();
    const result = await getSubject(db, profileId, 'subject-1');

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Physics');
    expect(result!.id).toBe('subject-1');
  });
});

describe('updateSubject', () => {
  it('returns null when not found', async () => {
    const db = createMockDb({ updateReturning: [] });
    const result = await updateSubject(db, profileId, 'some-subject-id', {
      name: 'Updated',
    });
    expect(result).toBeNull();
  });

  it('returns mapped updated subject', async () => {
    const row = mockSubjectRow({ name: 'Updated Name' });
    const db = createMockDb({ updateReturning: [row] });
    const result = await updateSubject(db, profileId, 'subject-1', {
      name: 'Updated Name',
    });

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Updated Name');
  });
});
