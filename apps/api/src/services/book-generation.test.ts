const mockRouteAndCall = jest.fn();

jest.mock('./llm' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('./llm') as typeof import('./llm');
  return {
    ...actual,
    routeAndCall: (...args: unknown[]) => mockRouteAndCall(...args),
  };
});

import { detectSubjectType, generateBookTopics } from './book-generation';

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
        stopReason: 'stop',
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
        stopReason: 'stop',
      });

      const result = await detectSubjectType('Fractions', 11);

      expect(result.type).toBe('narrow');
      if (result.type === 'narrow') {
        expect(result.topics).toHaveLength(1);
        expect(result.topics[0]?.title).toBe('What is a Fraction?');
      }
    });

    it('includes age-register guidance in the subject structure prompt', async () => {
      mockRouteAndCall.mockResolvedValueOnce({
        response: JSON.stringify({
          type: 'broad',
          books: [
            {
              title: 'Human Biology',
              description: 'Study body systems and health',
              emoji: '🧬',
              sortOrder: 1,
            },
          ],
        }),
        provider: 'mock',
        model: 'mock-model',
        latencyMs: 12,
        stopReason: 'stop',
      });

      await detectSubjectType('Biology', 20);

      expect(mockRouteAndCall).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining(
              'For ages 18+, use clear adult-learning titles',
            ),
          }),
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('Avoid cutesy labels'),
          }),
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('Learner age: 20'),
          }),
        ]),
        2,
      );
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
        stopReason: 'stop',
      });

      const result = await generateBookTopics(
        'Ancient Egypt',
        'Explore pyramids and pharaohs',
        11,
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
        stopReason: 'stop',
      });

      await generateBookTopics(
        'Ancient Egypt',
        'Explore pyramids',
        11,
        'I already know about pyramids',
      );

      expect(mockRouteAndCall).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('I already know about pyramids'),
          }),
        ]),
        2,
      );
    });

    it('rejects blank generated topic titles', async () => {
      mockRouteAndCall.mockResolvedValueOnce({
        response: JSON.stringify({
          topics: [
            {
              title: '   ',
              description: 'How it all began',
              chapter: 'The Story',
              sortOrder: 1,
              estimatedMinutes: 30,
            },
          ],
          connections: [],
        }),
        provider: 'mock',
        model: 'mock-model',
        latencyMs: 12,
        stopReason: 'stop',
      });

      await expect(
        generateBookTopics('Ancient Egypt', 'Explore pyramids', 11),
      ).rejects.toThrow('LLM returned unexpected book topic structure');
    });

    it('asks for adult-appropriate book topic naming when the learner is adult', async () => {
      mockRouteAndCall.mockResolvedValueOnce({
        response: JSON.stringify({ topics: [], connections: [] }),
        provider: 'mock',
        model: 'mock-model',
        latencyMs: 12,
        stopReason: 'stop',
      });

      await generateBookTopics(
        'Life Sciences',
        'Living things, ecosystems, and the human body',
        20,
      );

      expect(mockRouteAndCall).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining(
              'For ages 18+, use clear adult-learning titles',
            ),
          }),
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining(
              'never preschool, early-reader, or babyish wording',
            ),
          }),
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining(
              'Avoid cutesy labels, exclamation marks',
            ),
          }),
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('Learner age: 20'),
          }),
        ]),
        2,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Error cases — malformed LLM responses [4B.1]
  // -------------------------------------------------------------------------

  describe('detectSubjectType error handling', () => {
    it('throws on completely non-JSON LLM response', async () => {
      mockRouteAndCall.mockResolvedValueOnce({
        response: 'I am sorry, I cannot help with that request.',
        provider: 'mock',
        model: 'mock-model',
        latencyMs: 12,
        stopReason: 'stop',
      });

      await expect(detectSubjectType('History', 11)).rejects.toThrow(
        'LLM returned invalid JSON for subject detection',
      );
    });

    it('throws on malformed JSON (truncated response)', async () => {
      mockRouteAndCall.mockResolvedValueOnce({
        response: '{"type":"broad","books":[{"title":"Ancient Egypt"',
        provider: 'mock',
        model: 'mock-model',
        latencyMs: 12,
        stopReason: 'stop',
      });

      await expect(detectSubjectType('History', 11)).rejects.toThrow(
        'LLM returned invalid JSON for subject detection',
      );
    });

    it('throws on schema validation failure — missing required fields', async () => {
      mockRouteAndCall.mockResolvedValueOnce({
        response: JSON.stringify({
          type: 'broad',
          books: [{ title: 'Ancient Egypt' }],
          // missing description, emoji, sortOrder on book
        }),
        provider: 'mock',
        model: 'mock-model',
        latencyMs: 12,
        stopReason: 'stop',
      });

      await expect(detectSubjectType('History', 11)).rejects.toThrow(
        'LLM returned unexpected subject detection structure',
      );
    });

    it('throws on schema validation failure — invalid discriminator', async () => {
      mockRouteAndCall.mockResolvedValueOnce({
        response: JSON.stringify({
          type: 'unknown',
          stuff: [],
        }),
        provider: 'mock',
        model: 'mock-model',
        latencyMs: 12,
        stopReason: 'stop',
      });

      await expect(detectSubjectType('History', 11)).rejects.toThrow(
        'LLM returned unexpected subject detection structure',
      );
    });

    it('extracts JSON from markdown-wrapped response', async () => {
      mockRouteAndCall.mockResolvedValueOnce({
        response:
          'Here is the result:\n```json\n' +
          JSON.stringify({
            type: 'narrow',
            topics: [
              {
                title: 'Basics',
                description: 'The basics',
                relevance: 'core',
                estimatedMinutes: 30,
              },
            ],
          }) +
          '\n```',
        provider: 'mock',
        model: 'mock-model',
        latencyMs: 12,
        stopReason: 'stop',
      });

      const result = await detectSubjectType('Fractions', 11);
      expect(result.type).toBe('narrow');
    });

    it('throws when response contains no JSON object at all', async () => {
      mockRouteAndCall.mockResolvedValueOnce({
        response: 'Just plain text with no braces anywhere',
        provider: 'mock',
        model: 'mock-model',
        latencyMs: 12,
        stopReason: 'stop',
      });

      await expect(detectSubjectType('History', 11)).rejects.toThrow(
        'LLM returned invalid JSON for subject detection',
      );
    });
  });

  describe('generateBookTopics error handling', () => {
    it('throws on completely non-JSON LLM response', async () => {
      mockRouteAndCall.mockResolvedValueOnce({
        response: 'Error: rate limit exceeded',
        provider: 'mock',
        model: 'mock-model',
        latencyMs: 12,
        stopReason: 'stop',
      });

      await expect(
        generateBookTopics('Ancient Egypt', 'Explore pyramids', 11),
      ).rejects.toThrow('LLM returned invalid JSON for book topic generation');
    });

    it('throws on malformed JSON (truncated)', async () => {
      mockRouteAndCall.mockResolvedValueOnce({
        response: '{"topics":[{"title":"Timeline","description":"How it',
        provider: 'mock',
        model: 'mock-model',
        latencyMs: 12,
        stopReason: 'stop',
      });

      await expect(
        generateBookTopics('Ancient Egypt', 'Explore pyramids', 11),
      ).rejects.toThrow('LLM returned invalid JSON for book topic generation');
    });

    it('throws on schema validation failure — topics missing required fields', async () => {
      mockRouteAndCall.mockResolvedValueOnce({
        response: JSON.stringify({
          topics: [{ title: 'Timeline' }],
          // missing description, chapter, sortOrder, estimatedMinutes
          connections: [],
        }),
        provider: 'mock',
        model: 'mock-model',
        latencyMs: 12,
        stopReason: 'stop',
      });

      await expect(
        generateBookTopics('Ancient Egypt', 'Explore pyramids', 11),
      ).rejects.toThrow('LLM returned unexpected book topic structure');
    });

    it('throws on schema validation failure — missing connections array', async () => {
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
          ],
          // connections field entirely missing
        }),
        provider: 'mock',
        model: 'mock-model',
        latencyMs: 12,
        stopReason: 'stop',
      });

      await expect(
        generateBookTopics('Ancient Egypt', 'Explore pyramids', 11),
      ).rejects.toThrow('LLM returned unexpected book topic structure');
    });

    it('extracts JSON when LLM wraps response with extra text', async () => {
      mockRouteAndCall.mockResolvedValueOnce({
        response:
          'Sure! Here is the curriculum:\n' +
          JSON.stringify({
            topics: [
              {
                title: 'Timeline',
                description: 'How it all began',
                chapter: 'The Story',
                sortOrder: 1,
                estimatedMinutes: 30,
              },
            ],
            connections: [],
          }) +
          '\nLet me know if you need changes.',
        provider: 'mock',
        model: 'mock-model',
        latencyMs: 12,
        stopReason: 'stop',
      });

      const result = await generateBookTopics(
        'Ancient Egypt',
        'Explore pyramids',
        11,
      );
      expect(result.topics).toHaveLength(1);
      expect(result.topics[0]?.title).toBe('Timeline');
    });

    it('throws on valid JSON but wrong shape (array instead of object)', async () => {
      mockRouteAndCall.mockResolvedValueOnce({
        response: '[{"title":"Timeline"}]',
        provider: 'mock',
        model: 'mock-model',
        latencyMs: 12,
        stopReason: 'stop',
      });

      // extractJson regex /\{[\s\S]*\}/ extracts {"title":"Timeline"} from the array,
      // which parses as valid JSON but fails schema validation (no topics/connections).
      await expect(
        generateBookTopics('Ancient Egypt', 'Explore pyramids', 11),
      ).rejects.toThrow('LLM returned unexpected book topic structure');
    });
  });
});
