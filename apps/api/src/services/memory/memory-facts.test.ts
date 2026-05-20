import type { ScopedRepository } from '@eduagent/database';

import {
  hasMemoryFactsBackfillMarker,
  hasMemoryFactsMarker,
  readMemorySnapshotFromFacts,
  writeMemoryFactsForAnalysis,
} from './memory-facts';

describe('readMemorySnapshotFromFacts', () => {
  it('returns empty memory when consent is not granted', async () => {
    const scoped = {
      memoryFacts: { findManyActive: jest.fn() },
    } as unknown as ScopedRepository;

    await expect(
      readMemorySnapshotFromFacts(scoped, {
        memoryConsentStatus: 'pending',
        memoryEnabled: true,
        memoryInjectionEnabled: true,
      }),
    ).resolves.toEqual({
      strengths: [],
      struggles: [],
      interests: [],
      communicationNotes: [],
      suppressedInferences: [],
      interestTimestamps: {},
    });
    expect(scoped.memoryFacts.findManyActive).not.toHaveBeenCalled();
  });

  it('reconstructs JSONB-shaped memory from active rows', async () => {
    const observedAt = new Date('2026-04-30T12:00:00.000Z');
    const scoped = {
      memoryFacts: {
        findManyActive: jest.fn().mockResolvedValue([
          {
            category: 'interest',
            text: 'space',
            metadata: { context: 'school' },
            confidence: 'medium',
            observedAt,
          },
          {
            category: 'communication_note',
            text: 'prefers examples',
            metadata: {},
            confidence: 'medium',
            observedAt,
          },
        ]),
      },
    } as unknown as ScopedRepository;

    const snapshot = await readMemorySnapshotFromFacts(scoped, {
      memoryConsentStatus: 'granted',
      memoryEnabled: true,
      memoryInjectionEnabled: true,
    });

    expect(snapshot.interests).toEqual([{ label: 'space', context: 'school' }]);
    expect(snapshot.communicationNotes).toEqual(['prefers examples']);
    expect(snapshot.interestTimestamps).toEqual({
      space: observedAt.toISOString(),
    });
  });

  it('can read curated memory when injection is disabled', async () => {
    const scoped = {
      memoryFacts: {
        findManyActive: jest.fn().mockResolvedValue([
          {
            category: 'interest',
            text: 'football',
            metadata: { context: 'free_time' },
            confidence: 'medium',
            observedAt: new Date('2026-05-01T12:00:00.000Z'),
          },
        ]),
      },
    } as unknown as ScopedRepository;

    const snapshot = await readMemorySnapshotFromFacts(
      scoped,
      {
        memoryConsentStatus: 'granted',
        memoryEnabled: true,
        memoryInjectionEnabled: false,
      },
      { respectInjectionToggle: false },
    );

    expect(snapshot.interests).toEqual([
      { label: 'football', context: 'free_time' },
    ]);
    expect(scoped.memoryFacts.findManyActive).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// [BUG-365] Marker split — backfill cron vs runtime applyAnalysis paths must
// stamp DIFFERENT columns so orphan-fact recovery and audit logic can tell
// them apart. Before the fix, both paths stamped memoryFactsBackfilledAt and
// the two were indistinguishable.
// ---------------------------------------------------------------------------

describe('[BUG-365] memory-facts marker split', () => {
  describe('hasMemoryFactsMarker', () => {
    it('returns true when only the backfill-cron marker is set', () => {
      expect(
        hasMemoryFactsMarker({
          memoryFactsBackfilledAt: new Date('2026-05-01T00:00:00Z'),
          memoryFactsAnalysedAt: null,
        }),
      ).toBe(true);
    });

    it('returns true when only the runtime applyAnalysis marker is set', () => {
      expect(
        hasMemoryFactsMarker({
          memoryFactsBackfilledAt: null,
          memoryFactsAnalysedAt: new Date('2026-05-01T00:00:00Z'),
        }),
      ).toBe(true);
    });

    it('returns true when both markers are set', () => {
      expect(
        hasMemoryFactsMarker({
          memoryFactsBackfilledAt: new Date('2026-05-01T00:00:00Z'),
          memoryFactsAnalysedAt: new Date('2026-05-02T00:00:00Z'),
        }),
      ).toBe(true);
    });

    it('returns false when neither marker is set', () => {
      expect(
        hasMemoryFactsMarker({
          memoryFactsBackfilledAt: null,
          memoryFactsAnalysedAt: null,
        }),
      ).toBe(false);
    });

    it('exposes the historical name as an alias for backward compatibility', () => {
      expect(hasMemoryFactsBackfillMarker).toBe(hasMemoryFactsMarker);
    });
  });

  describe('writeMemoryFactsForAnalysis (runtime path)', () => {
    // Capture the column→value object passed to `db.update(...).set(...)`.
    function makeFakeDb() {
      const setCalls: Array<Record<string, unknown>> = [];
      const updateChain = {
        set: (values: Record<string, unknown>) => {
          setCalls.push(values);
          return { where: jest.fn().mockResolvedValue(undefined) };
        },
      };
      const fakeDb = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        }),
        delete: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockResolvedValue(undefined),
        }),
        update: jest.fn().mockReturnValue(updateChain),
      };
      return { fakeDb, setCalls };
    }

    const mergedState = {
      strengths: [],
      struggles: [],
      interests: [],
      communicationNotes: [],
      suppressedInferences: [],
      interestTimestamps: {},
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };

    // Red-green regression: prior single-column setup stamped
    // memoryFactsBackfilledAt from BOTH paths. The fix stamps
    // memoryFactsAnalysedAt from the runtime path so the two are
    // distinguishable.
    it('stamps memoryFactsAnalysedAt (NOT memoryFactsBackfilledAt) when called', async () => {
      const { fakeDb, setCalls } = makeFakeDb();

      await writeMemoryFactsForAnalysis(
        fakeDb as never,
        'profile-1',
        mergedState,
      );

      expect(setCalls).toHaveLength(1);
      const values = setCalls[0]!;
      expect(values).toHaveProperty('memoryFactsAnalysedAt');
      expect(values['memoryFactsAnalysedAt']).toBeInstanceOf(Date);
      // Pre-fix behaviour: the runtime path stamped memoryFactsBackfilledAt.
      // After the fix, the runtime path must NOT touch that column — the
      // backfill cron is its sole writer.
      expect(values).not.toHaveProperty('memoryFactsBackfilledAt');
    });
  });
});
