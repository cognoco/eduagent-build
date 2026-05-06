import type { ScopedRepository } from '@eduagent/database';

import { readMemorySnapshotFromFacts } from './memory-facts';

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
      })
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
      { respectInjectionToggle: false }
    );

    expect(snapshot.interests).toEqual([
      { label: 'football', context: 'free_time' },
    ]);
    expect(scoped.memoryFacts.findManyActive).toHaveBeenCalledTimes(1);
  });
});
