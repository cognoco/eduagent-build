import { computeUpNextTopic } from './up-next-topic';

type Topic = { id: string; chapter: string | null; sortOrder: number };
type Session = { topicId: string | null; createdAt: string };

const go = (n: number): Topic => ({
  id: `go-${n}`,
  chapter: 'Grand Overview',
  sortOrder: n,
});

const gf = (n: number): Topic => ({
  id: `gf-${n}`,
  chapter: 'Green Factories',
  sortOrder: 100 + n,
});

const session = (topicId: string, ms = 0): Session => ({
  topicId,
  createdAt: new Date(ms).toISOString(),
});

describe('computeUpNextTopic', () => {
  describe('Rule 1 - momentum', () => {
    it('picks the earliest unstarted topic in the most recent session chapter', () => {
      const topics = [
        go(1),
        go(2),
        go(3),
        go(4),
        go(5),
        gf(1),
        gf(2),
        gf(3),
        gf(4),
      ];

      const result = computeUpNextTopic(
        topics,
        new Set(['go-1', 'go-2', 'go-3']),
        new Set<string>(),
        [session('go-3')],
      );

      expect(result?.id).toBe('go-4');
    });

    it('prefers momentum over a chapter with a higher completion ratio', () => {
      const topics = [
        go(1),
        go(2),
        go(3),
        go(4),
        go(5),
        gf(1),
        gf(2),
        gf(3),
        gf(4),
      ];

      const result = computeUpNextTopic(
        topics,
        new Set(['go-1', 'go-2', 'gf-1', 'gf-2']),
        new Set<string>(),
        [session('go-2', 2_000), session('gf-1', 1_000)],
      );

      expect(result?.id).toBe('go-3');
    });

    it('switches momentum when the most recent session is in another chapter', () => {
      const topics = [
        go(1),
        go(2),
        go(3),
        go(4),
        go(5),
        gf(1),
        gf(2),
        gf(3),
        gf(4),
      ];

      const result = computeUpNextTopic(
        topics,
        new Set(['go-1', 'go-2', 'gf-1', 'gf-2']),
        new Set<string>(),
        [session('go-2', 1_000), session('gf-2', 2_000)],
      );

      expect(result?.id).toBe('gf-3');
    });

    it('falls through when the momentum chapter is already complete', () => {
      const topics = [
        go(1),
        go(2),
        go(3),
        go(4),
        go(5),
        gf(1),
        gf(2),
        gf(3),
        gf(4),
      ];

      const result = computeUpNextTopic(
        topics,
        new Set(['go-1', 'go-2', 'go-3', 'go-4', 'go-5', 'gf-1']),
        new Set<string>(),
        [session('go-5')],
      );

      expect(result?.id).toBe('gf-2');
    });
  });

  describe('Rule 2 - highest partial completion', () => {
    it('picks the partially complete chapter with the best completion ratio', () => {
      const topics = [
        go(1),
        go(2),
        go(3),
        go(4),
        go(5),
        gf(1),
        gf(2),
        gf(3),
        gf(4),
      ];

      const result = computeUpNextTopic(
        topics,
        new Set(['go-1', 'go-2', 'go-3', 'gf-1']),
        new Set<string>(),
        [],
      );

      expect(result?.id).toBe('go-4');
    });
  });

  describe('Rule 3 - earliest uncompleted chapter', () => {
    it('returns the first topic of the earliest chapter when no progress exists', () => {
      const topics = [go(1), go(2), gf(1), gf(2)];

      const result = computeUpNextTopic(
        topics,
        new Set<string>(),
        new Set<string>(),
        [],
      );

      expect(result?.id).toBe('go-1');
    });
  });

  describe('null-chapter edge cases', () => {
    it('does not treat two null-chapter topics as a shared momentum bucket', () => {
      const topics: Topic[] = [
        { id: 'orphan-a', chapter: null, sortOrder: 1 },
        { id: 'orphan-b', chapter: null, sortOrder: 2 },
      ];

      const result = computeUpNextTopic(
        topics,
        new Set<string>(),
        new Set<string>(),
        [session('orphan-a')],
      );

      expect(result?.id).toBe('orphan-a');
    });
  });

  describe('edge cases', () => {
    it('returns null when every topic is already done', () => {
      const result = computeUpNextTopic(
        [go(1), go(2)],
        new Set(['go-1', 'go-2']),
        new Set<string>(),
        [],
      );

      expect(result).toBeNull();
    });

    it('excludes in-progress topics from the up-next candidates', () => {
      const result = computeUpNextTopic(
        [go(1), go(2), go(3)],
        new Set<string>(),
        new Set(['go-1']),
        [session('go-1')],
      );

      expect(result?.id).toBe('go-2');
    });

    it('returns null when every topic is either done or in progress', () => {
      const result = computeUpNextTopic(
        [go(1), go(2)],
        new Set(['go-1']),
        new Set(['go-2']),
        [],
      );

      expect(result).toBeNull();
    });
  });
});
