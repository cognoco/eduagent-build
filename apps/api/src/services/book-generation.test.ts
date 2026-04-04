jest.mock('./llm', () => ({
  routeAndCall: jest.fn(),
}));

import { routeAndCall } from './llm';
import { detectSubjectType, generateBookTopics } from './book-generation';

const mockRouteAndCall = routeAndCall as jest.MockedFunction<
  typeof routeAndCall
>;

describe('book-generation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('detectSubjectType', () => {
    it('returns broad with books for broad subjects', async () => {
      mockRouteAndCall.mockResolvedValueOnce({
        response: JSON.stringify({
          type: 'broad',
          books: [
            {
              title: 'Ancient Egypt',
              description: 'Explore pyramids and pharaohs',
              emoji: '🏛️',
              sortOrder: 1,
            },
            {
              title: 'Ancient Greece',
              description: 'Gods, heroes, and democracy',
              emoji: '⚔️',
              sortOrder: 2,
            },
          ],
        }),
        provider: 'mock',
        model: 'mock-model',
        latencyMs: 12,
      });

      const result = await detectSubjectType('History', 11);

      expect(result.type).toBe('broad');
      if (result.type === 'broad') {
        expect(result.books).toHaveLength(2);
        expect(result.books[0]?.title).toBe('Ancient Egypt');
      }
    });

    it('returns narrow with topics for narrow subjects', async () => {
      mockRouteAndCall.mockResolvedValueOnce({
        response: JSON.stringify({
          type: 'narrow',
          topics: [
            {
              title: 'What is a Fraction?',
              description: 'Introduction to fractions',
              relevance: 'core',
              estimatedMinutes: 30,
            },
          ],
        }),
        provider: 'mock',
        model: 'mock-model',
        latencyMs: 12,
      });

      const result = await detectSubjectType('Fractions', 11);

      expect(result.type).toBe('narrow');
      if (result.type === 'narrow') {
        expect(result.topics).toHaveLength(1);
        expect(result.topics[0]?.title).toBe('What is a Fraction?');
      }
    });
  });

  describe('generateBookTopics', () => {
    it('generates topics with chapters and connections', async () => {
      mockRouteAndCall.mockResolvedValueOnce({
        response: JSON.stringify({
          topics: [
            {
              title: 'Timeline',
              description: 'How it all began',
              chapter: 'The Story',
              sortOrder: 1,
              estimatedMinutes: 30,
            },
            {
              title: 'Old Kingdom',
              description: 'The age of pyramids',
              chapter: 'The Story',
              sortOrder: 2,
              estimatedMinutes: 30,
            },
            {
              title: 'Pyramids',
              description: 'How were they built?',
              chapter: 'Monuments',
              sortOrder: 3,
              estimatedMinutes: 25,
            },
          ],
          connections: [{ topicA: 'Old Kingdom', topicB: 'Pyramids' }],
        }),
        provider: 'mock',
        model: 'mock-model',
        latencyMs: 12,
      });

      const result = await generateBookTopics(
        'Ancient Egypt',
        'Explore pyramids and pharaohs',
        11
      );

      expect(result.topics).toHaveLength(3);
      expect(result.topics[0]?.chapter).toBe('The Story');
      expect(result.connections).toHaveLength(1);
      expect(result.connections[0]?.topicA).toBe('Old Kingdom');
    });

    it('passes prior knowledge through to the LLM prompt', async () => {
      mockRouteAndCall.mockResolvedValueOnce({
        response: JSON.stringify({ topics: [], connections: [] }),
        provider: 'mock',
        model: 'mock-model',
        latencyMs: 12,
      });

      await generateBookTopics(
        'Ancient Egypt',
        'Explore pyramids',
        11,
        'I already know about pyramids'
      );

      expect(mockRouteAndCall).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('I already know about pyramids'),
          }),
        ]),
        2
      );
    });
  });
});
