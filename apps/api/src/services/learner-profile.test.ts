import type { MemoryBlockProfile } from './learner-profile';
import {
  buildMemoryBlock,
  mergeInterests,
  mergeStrengths,
  resolveStruggle,
} from './learner-profile';

describe('mergeInterests', () => {
  it('deduplicates and keeps normalized timestamps', () => {
    const result = mergeInterests(['Space'], ['space', 'Dinosaurs'], [], {
      space: '2026-01-01T00:00:00.000Z',
    });

    expect(result.interests).toEqual(['Space', 'Dinosaurs']);
    expect(result.timestamps['space']).toBeDefined();
    expect(result.timestamps['dinosaurs']).toBeDefined();
  });
});

describe('mergeStrengths', () => {
  it('upgrades confidence after repeated topics in one subject', () => {
    const result = mergeStrengths(
      [],
      [
        { subject: 'Math', topic: 'fractions', source: 'learner' },
        { subject: 'Math', topic: 'multiplication', source: 'learner' },
        { subject: 'Math', topic: 'division', source: 'learner' },
      ],
      []
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      subject: 'Math',
      confidence: 'high',
      source: 'learner',
    });
  });
});

describe('resolveStruggle', () => {
  it('removes the struggle when attempts drop to zero', () => {
    const result = resolveStruggle(
      [
        {
          subject: 'Math',
          topic: 'fractions',
          attempts: 1,
          confidence: 'low',
          lastSeen: '2026-04-01T00:00:00.000Z',
        },
      ],
      'fractions',
      'Math'
    );

    expect(result).toEqual([]);
  });
});

describe('buildMemoryBlock', () => {
  it('excludes strong retained struggles but keeps sparse-profile guidance', () => {
    const profile: MemoryBlockProfile = {
      learningStyle: null,
      interests: ['space'],
      strengths: [],
      struggles: [
        {
          subject: 'Math',
          topic: 'fractions',
          attempts: 4,
          confidence: 'medium',
          lastSeen: '2026-04-01T00:00:00.000Z',
        },
        {
          subject: null,
          topic: 'reading directions carefully',
          attempts: 3,
          confidence: 'medium',
          lastSeen: '2026-04-01T00:00:00.000Z',
        },
      ],
      communicationNotes: [],
      memoryEnabled: true,
      memoryInjectionEnabled: true,
    };

    const block = buildMemoryBlock(profile, 'Math', 'fractions', {
      status: 'strong',
      strongTopics: ['fractions'],
    });

    expect(block).not.toContain('fractions');
    expect(block).toContain('reading directions carefully');
    expect(block).toContain('still sparse');
    expect(block).toContain('Reference interests only when genuinely relevant');
  });
});
