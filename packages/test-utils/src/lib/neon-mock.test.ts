// [CR-2026-05-21-183] Unit tests for createMockDb's documented contract and
// the test-context runtime guard. The static import-site guard lives in
// `neon-mock.guard.test.ts`.

import { createMockDb } from './neon-mock';

describe('createMockDb default (forbidden-by-default) behavior', () => {
  it('returns undefined for any query.X.findFirst by default', async () => {
    const db = createMockDb() as {
      query: { profiles: { findFirst: jest.Mock; findMany: jest.Mock } };
    };
    await expect(db.query.profiles.findFirst()).resolves.toBeUndefined();
  });

  it('returns [] for any query.X.findMany by default', async () => {
    const db = createMockDb() as {
      query: { subjects: { findFirst: jest.Mock; findMany: jest.Mock } };
    };
    await expect(db.query.subjects.findMany()).resolves.toEqual([]);
  });

  it('allows callers to override findFirst with a fixture (canonical pattern)', async () => {
    const db = createMockDb() as {
      query: { profiles: { findFirst: jest.Mock } };
    };
    // The query proxy returns a fresh object per access, so callers must
    // capture once and override on the captured handle.
    const profiles = db.query.profiles;
    (profiles.findFirst as jest.Mock).mockResolvedValue({
      id: 'p-1',
      displayName: 'Alex',
    });
    await expect(profiles.findFirst()).resolves.toEqual({
      id: 'p-1',
      displayName: 'Alex',
    });
  });

  it('exposes chain stubs for insert/update/delete/select that resolve to a proxy', () => {
    const db = createMockDb() as {
      insert: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      select: jest.Mock;
      execute: jest.Mock;
    };
    expect(typeof db.insert).toBe('function');
    expect(typeof db.update).toBe('function');
    expect(typeof db.delete).toBe('function');
    expect(typeof db.select).toBe('function');
    expect(typeof db.execute).toBe('function');
  });
});

describe('[CR-2026-05-21-183] createMockDb runtime test-context guard', () => {
  it('throws a loud error when invoked outside a Jest worker', () => {
    // Simulate non-test runtime by temporarily removing the `jest` global.
    const originalJest = (globalThis as { jest?: unknown }).jest;
    try {
      delete (globalThis as { jest?: unknown }).jest;
      expect(() => createMockDb()).toThrow(/outside Jest test context/);
    } finally {
      (globalThis as { jest?: unknown }).jest = originalJest;
    }
  });
});
