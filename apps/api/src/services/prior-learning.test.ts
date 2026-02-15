import { buildPriorLearningContext } from './prior-learning';
import type { PriorTopic } from './prior-learning';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTopic(
  overrides: Partial<PriorTopic> & { topicId: string }
): PriorTopic {
  return {
    title: `Topic ${overrides.topicId}`,
    completedAt: '2025-01-15T10:00:00Z',
    ...overrides,
  };
}

/** Generate N topics with sequential dates and mastery scores */
function makeTopics(count: number): PriorTopic[] {
  return Array.from({ length: count }, (_, i) => ({
    topicId: `topic-${i + 1}`,
    title: `Topic ${i + 1}`,
    summary: `Summary for topic ${i + 1}`,
    masteryScore: (i * 4) % 100, // varied mastery scores
    completedAt: new Date(2025, 0, i + 1).toISOString(), // sequential dates in Jan 2025
  }));
}

// ---------------------------------------------------------------------------
// buildPriorLearningContext
// ---------------------------------------------------------------------------

describe('buildPriorLearningContext', () => {
  describe('empty state', () => {
    it('returns empty context when no completed topics', () => {
      const result = buildPriorLearningContext([]);

      expect(result.contextText).toBe('');
      expect(result.topicsIncluded).toBe(0);
      expect(result.truncated).toBe(false);
    });
  });

  describe('normal case (within limit)', () => {
    it('includes all topics when under the default limit', () => {
      const topics = [
        makeTopic({
          topicId: 'a',
          title: 'Variables',
          summary: 'I learned about vars',
        }),
        makeTopic({ topicId: 'b', title: 'Functions', masteryScore: 85 }),
      ];

      const result = buildPriorLearningContext(topics);

      expect(result.topicsIncluded).toBe(2);
      expect(result.truncated).toBe(false);
      expect(result.contextText).toContain('Variables');
      expect(result.contextText).toContain('Functions');
    });

    it('includes learner summaries in context', () => {
      const topics = [
        makeTopic({
          topicId: 'a',
          title: 'Arrays',
          summary: 'Arrays are like lists of things',
        }),
      ];

      const result = buildPriorLearningContext(topics);

      expect(result.contextText).toContain('Arrays are like lists of things');
    });

    it('includes mastery scores in context', () => {
      const topics = [
        makeTopic({ topicId: 'a', title: 'Loops', masteryScore: 92 }),
      ];

      const result = buildPriorLearningContext(topics);

      expect(result.contextText).toContain('92%');
    });

    it('handles topics without summary or mastery', () => {
      const topics = [makeTopic({ topicId: 'a', title: 'Generics' })];

      const result = buildPriorLearningContext(topics);

      expect(result.topicsIncluded).toBe(1);
      expect(result.contextText).toContain('Generics');
      expect(result.contextText).not.toContain('Mastery');
      expect(result.contextText).not.toContain('summary');
    });

    it('includes exactly 20 topics without truncation', () => {
      const topics = makeTopics(20);

      const result = buildPriorLearningContext(topics);

      expect(result.topicsIncluded).toBe(20);
      expect(result.truncated).toBe(false);
    });
  });

  describe('truncation at >20 topics', () => {
    it('truncates when more than 20 topics', () => {
      const topics = makeTopics(25);

      const result = buildPriorLearningContext(topics);

      expect(result.truncated).toBe(true);
      expect(result.topicsIncluded).toBeLessThan(25);
    });

    it('includes at most 15 topics (10 recent + 5 high mastery)', () => {
      const topics = makeTopics(30);

      const result = buildPriorLearningContext(topics);

      expect(result.topicsIncluded).toBeLessThanOrEqual(15);
    });

    it('includes the most recent topics', () => {
      const topics = makeTopics(25);
      // Topics are created with sequential dates, so topic-25 is most recent

      const result = buildPriorLearningContext(topics);

      // The most recent topic (topic-25, Jan 25) should be included
      expect(result.contextText).toContain('Topic 25');
    });

    it('includes high-mastery topics even if not recent', () => {
      const topics: PriorTopic[] = [];

      // 15 recent topics (dates in Feb) with low mastery
      for (let i = 0; i < 15; i++) {
        topics.push({
          topicId: `recent-${i}`,
          title: `Recent Topic ${i}`,
          masteryScore: 10,
          completedAt: new Date(2025, 1, i + 1).toISOString(), // Feb 2025
        });
      }

      // 10 old topics (dates in Jan) — one with very high mastery
      for (let i = 0; i < 10; i++) {
        topics.push({
          topicId: `old-${i}`,
          title: `Old Topic ${i}`,
          masteryScore: i === 0 ? 99 : 5, // old-0 has 99% mastery
          completedAt: new Date(2025, 0, i + 1).toISOString(), // Jan 2025
        });
      }

      const result = buildPriorLearningContext(topics);

      // The high-mastery old topic should be included
      expect(result.contextText).toContain('Old Topic 0');
      expect(result.truncated).toBe(true);
    });
  });

  describe('custom maxTopics parameter', () => {
    it('respects a custom maxTopics limit', () => {
      const topics = makeTopics(10);

      const result = buildPriorLearningContext(topics, 5);

      expect(result.truncated).toBe(true);
      expect(result.topicsIncluded).toBeLessThanOrEqual(15);
    });

    it('does not truncate when within custom limit', () => {
      const topics = makeTopics(8);

      const result = buildPriorLearningContext(topics, 10);

      expect(result.truncated).toBe(false);
      expect(result.topicsIncluded).toBe(8);
    });
  });

  describe('context text format', () => {
    it('includes a header explaining the context', () => {
      const topics = [makeTopic({ topicId: 'a', title: 'Intro' })];

      const result = buildPriorLearningContext(topics);

      expect(result.contextText).toContain('Prior Learning Context');
    });

    it('includes guidance for using the context', () => {
      const topics = [makeTopic({ topicId: 'a', title: 'Intro' })];

      const result = buildPriorLearningContext(topics);

      expect(result.contextText).toContain('connect new concepts');
    });
  });
});
