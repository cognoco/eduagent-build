const mockRouteAndCall = jest.fn();

jest.mock('./llm' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('./llm') as typeof import('./llm');
  return {
    ...actual,
    routeAndCall: (...args: unknown[]) => mockRouteAndCall(...args),
  };
});

import { detectSubjectType, generateBookTopics } from './book-generation';

function llmRouteResult(response: string) {
  return {
    response,
    provider: 'mock',
    model: 'mock-model',
    latencyMs: 12,
    stopReason: 'stop',
  };
}

function generatedBooksFixture() {
  return [
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
    {
      title: 'Ancient Rome',
      description: 'Republics, empires, roads, and law',
      emoji: '🏺',
      sortOrder: 3,
    },
    {
      title: 'Medieval Worlds',
      description: 'Kingdoms, trade, religion, and daily life',
      emoji: '🏰',
      sortOrder: 4,
    },
    {
      title: 'Modern Revolutions',
      description: 'New ideas, industry, and political change',
      emoji: '⚙️',
      sortOrder: 5,
    },
  ];
}

function generatedSubjectTopicsFixture() {
  return [
    'What is a Fraction?',
    'Numerator and Denominator',
    'Visual Fractions',
    'Equivalent Fractions',
    'Simplifying Fractions',
    'Comparing Fractions',
    'Adding Fractions',
    'Subtracting Fractions',
  ].map((title) => ({
    title,
    description: `${title} for fraction practice`,
    relevance: 'core' as const,
    estimatedMinutes: 30,
  }));
}

function generatedBookTopicsFixture() {
  return [
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
    {
      title: 'Daily Life',
      description: 'What ordinary people did each day',
      chapter: 'Society',
      sortOrder: 4,
      estimatedMinutes: 25,
    },
    {
      title: 'Legacy',
      description: 'Why Ancient Egypt still matters',
      chapter: 'Society',
      sortOrder: 5,
      estimatedMinutes: 20,
    },
  ];
}

describe('book-generation', () => {
  beforeEach(() => {
    mockRouteAndCall.mockReset();
    mockRouteAndCall.mockResolvedValue(llmRouteResult('not json at all'));
  });

  describe('detectSubjectType', () => {
    it('returns broad with books for broad subjects', async () => {
      mockRouteAndCall.mockResolvedValueOnce(
        llmRouteResult(
          JSON.stringify({
            type: 'broad',
            books: generatedBooksFixture(),
          }),
        ),
      );

      const result = await detectSubjectType('History', 11);

      expect(result.type).toBe('broad');
      if (result.type === 'broad') {
        expect(result.books).toHaveLength(5);
        expect(result.books[0]?.title).toBe('Ancient Egypt');
      }
    });

    it('returns narrow with topics for narrow subjects', async () => {
      mockRouteAndCall.mockResolvedValueOnce(
        llmRouteResult(
          JSON.stringify({
            type: 'narrow',
            topics: generatedSubjectTopicsFixture(),
          }),
        ),
      );

      const result = await detectSubjectType('Fractions', 11);

      expect(result.type).toBe('narrow');
      if (result.type === 'narrow') {
        expect(result.topics).toHaveLength(8);
        expect(result.topics[0]?.title).toBe('What is a Fraction?');
      }
    });

    it('does not route to Gemini for under-18 learners (MMT-ADR-0016 §10.1)', async () => {
      // Regression test: under-18 learners must never be routed to Gemini.
      // Without the fix, callBookGenerationJson passes providerPolicy: 'gemini_only'
      // unconditionally; with the fix it is omitted for learnerAge < 18.
      mockRouteAndCall.mockResolvedValueOnce(
        llmRouteResult(
          JSON.stringify({
            type: 'broad',
            books: generatedBooksFixture(),
          }),
        ),
      );

      await detectSubjectType('Biology', 15);

      expect(mockRouteAndCall).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ providerPolicy: 'gemini_only' }),
      );
    });

    it('does not route to Gemini at the boundary year (computed age 18 may still be 17) (MMT-ADR-0016 §10.1)', async () => {
      // SF1 fail-closed boundary: learnerAge === 18 corresponds to
      // birthYear === currentYear - 18 — the learner may not have had their
      // 18th birthday yet, so they must be treated as a minor. The old
      // `learnerAge >= 18` gate routed this boundary learner to Gemini; the
      // fail-closed `> 18` gate (== isUnambiguouslyAdult) must NOT.
      mockRouteAndCall.mockResolvedValueOnce(
        llmRouteResult(
          JSON.stringify({
            type: 'broad',
            books: generatedBooksFixture(),
          }),
        ),
      );

      await detectSubjectType('Biology', 18);

      expect(mockRouteAndCall).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ providerPolicy: 'gemini_only' }),
      );
    });

    it('includes age-register guidance in the subject structure prompt', async () => {
      mockRouteAndCall.mockResolvedValueOnce(
        llmRouteResult(
          JSON.stringify({
            type: 'broad',
            books: generatedBooksFixture(),
          }),
        ),
      );

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
        3,
        expect.objectContaining({
          flow: 'book.generation',
          providerPolicy: 'gemini_only',
          responseFormat: 'json',
        }),
      );
    });
  });

  describe('generateBookTopics', () => {
    it('generates topics with chapters and connections', async () => {
      mockRouteAndCall.mockResolvedValueOnce(
        llmRouteResult(
          JSON.stringify({
            topics: generatedBookTopicsFixture(),
            connections: [{ topicA: 'Old Kingdom', topicB: 'Pyramids' }],
          }),
        ),
      );

      const result = await generateBookTopics(
        'Ancient Egypt',
        'Explore pyramids and pharaohs',
        11,
      );

      expect(result.topics).toHaveLength(5);
      expect(result.topics[0]?.chapter).toBe('The Story');
      expect(result.connections).toHaveLength(1);
      expect(result.connections[0]?.topicA).toBe('Old Kingdom');
    });

    it('passes prior knowledge through to the LLM prompt', async () => {
      mockRouteAndCall.mockResolvedValueOnce(
        llmRouteResult(
          JSON.stringify({
            topics: generatedBookTopicsFixture(),
            connections: [],
          }),
        ),
      );

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
        3,
        expect.objectContaining({
          flow: 'book.generation',
          responseFormat: 'json',
        }),
      );
      // learnerAge=11 (under-18): must NOT route to Gemini (MMT-ADR-0016 §10.1)
      expect(mockRouteAndCall).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ providerPolicy: 'gemini_only' }),
      );
    });

    it('retries once when structured JSON is malformed', async () => {
      mockRouteAndCall
        .mockResolvedValueOnce(
          llmRouteResult('{"topics":[{"title":"Bad",}],"connections":[]}'),
        )
        .mockResolvedValueOnce(
          llmRouteResult(
            JSON.stringify({
              topics: generatedBookTopicsFixture(),
              connections: [],
            }),
          ),
        );

      const result = await generateBookTopics(
        'Ancient Egypt',
        'Explore pyramids and pharaohs',
        11,
      );

      expect(result.topics).toHaveLength(5);
      expect(mockRouteAndCall).toHaveBeenCalledTimes(2);
      expect(mockRouteAndCall).toHaveBeenLastCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining(
              'The previous response failed validation.',
            ),
          }),
        ]),
        3,
        expect.objectContaining({
          flow: 'book.generation',
          responseFormat: 'json',
        }),
      );
      // learnerAge=11 (under-18): must NOT route to Gemini (MMT-ADR-0016 §10.1)
      expect(mockRouteAndCall).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ providerPolicy: 'gemini_only' }),
      );
    });

    it('retries once when connections reference omitted topics', async () => {
      mockRouteAndCall
        .mockResolvedValueOnce(
          llmRouteResult(
            JSON.stringify({
              topics: generatedBookTopicsFixture(),
              connections: [
                {
                  topicA: 'Missing Introduction',
                  topicB: 'Timeline',
                },
              ],
            }),
          ),
        )
        .mockResolvedValueOnce(
          llmRouteResult(
            JSON.stringify({
              topics: generatedBookTopicsFixture(),
              connections: [{ topicA: 'Timeline', topicB: 'Old Kingdom' }],
            }),
          ),
        );

      const result = await generateBookTopics(
        'Ancient Egypt',
        'Explore pyramids and pharaohs',
        11,
      );

      expect(result.connections).toEqual([
        { topicA: 'Timeline', topicB: 'Old Kingdom' },
      ]);
      expect(mockRouteAndCall).toHaveBeenCalledTimes(2);
    });

    it('retries once when generated descriptions contain precise unsourced dates', async () => {
      const datedTopics = generatedBookTopicsFixture().map((topic, index) =>
        index === 1
          ? {
              ...topic,
              description:
                'Trace the chain of events that followed in the summer of 1914.',
            }
          : topic,
      );
      mockRouteAndCall
        .mockResolvedValueOnce(
          llmRouteResult(
            JSON.stringify({
              topics: datedTopics,
              connections: [],
            }),
          ),
        )
        .mockResolvedValueOnce(
          llmRouteResult(
            JSON.stringify({
              topics: generatedBookTopicsFixture(),
              connections: [],
            }),
          ),
        );

      const result = await generateBookTopics(
        'Causes of World War I',
        'A careful study path for understanding causes.',
        15,
      );

      expect(result.topics[1]?.description).toBe('The age of pyramids');
      expect(mockRouteAndCall).toHaveBeenCalledTimes(2);
    });

    it('retries once when generated chapter groups are non-contiguous', async () => {
      const nonContiguousTopics = generatedBookTopicsFixture().map(
        (topic, index) =>
          index === 0 ? { ...topic, chapter: 'Society' } : topic,
      );
      mockRouteAndCall
        .mockResolvedValueOnce(
          llmRouteResult(
            JSON.stringify({
              topics: nonContiguousTopics,
              connections: [],
            }),
          ),
        )
        .mockResolvedValueOnce(
          llmRouteResult(
            JSON.stringify({
              topics: generatedBookTopicsFixture(),
              connections: [],
            }),
          ),
        );

      const result = await generateBookTopics(
        'Human Biology',
        'Body systems and evidence-based reasoning.',
        18,
      );

      expect(result.topics.map((topic) => topic.chapter)).toEqual([
        'The Story',
        'The Story',
        'Monuments',
        'Society',
        'Society',
      ]);
      expect(mockRouteAndCall).toHaveBeenCalledTimes(2);
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
        response: JSON.stringify({
          topics: generatedBookTopicsFixture(),
          connections: [],
        }),
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
        3,
        expect.objectContaining({
          flow: 'book.generation',
          providerPolicy: 'gemini_only',
          responseFormat: 'json',
        }),
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

    it('throws when a broad subject returns too few books', async () => {
      mockRouteAndCall.mockResolvedValueOnce(
        llmRouteResult(
          JSON.stringify({
            type: 'broad',
            books: generatedBooksFixture().slice(0, 2),
          }),
        ),
      );

      await expect(detectSubjectType('History', 11)).rejects.toThrow(
        'LLM returned unexpected subject detection structure',
      );
    });

    it('throws when a narrow subject returns too few topics', async () => {
      mockRouteAndCall.mockResolvedValueOnce(
        llmRouteResult(
          JSON.stringify({
            type: 'narrow',
            topics: generatedSubjectTopicsFixture().slice(0, 3),
          }),
        ),
      );

      await expect(detectSubjectType('Fractions', 11)).rejects.toThrow(
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
            topics: generatedSubjectTopicsFixture(),
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

    it('throws when the generated book is too thin', async () => {
      mockRouteAndCall.mockResolvedValueOnce({
        response: JSON.stringify({
          topics: generatedBookTopicsFixture().slice(0, 2),
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

    it('throws when generated topics all belong to one chapter', async () => {
      mockRouteAndCall.mockResolvedValueOnce({
        response: JSON.stringify({
          topics: generatedBookTopicsFixture().map((topic) => ({
            ...topic,
            chapter: 'Only Chapter',
          })),
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
            topics: generatedBookTopicsFixture(),
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
      expect(result.topics).toHaveLength(5);
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
