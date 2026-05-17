import {
  buildCurrentTopicMapContext,
  buildResumeContext,
  computeActiveSeconds,
} from './session-context-builders';
import type { Database } from '@eduagent/database';

// Lightweight DB stub: each query.X.findFirst/findMany pulls from a fixture
// pre-seeded by the test. Just enough surface for buildResumeContext —
// adding a real Drizzle harness here would dwarf the actual fix.
function makeDbStub(fixtures: {
  session?: Record<string, unknown> | null;
  subject?: { name: string } | null;
  topic?: { title: string } | null;
  summary?: Record<string, unknown> | null;
  events?: Array<{ eventType: string; content: string }>;
}): Database {
  return {
    query: {
      learningSessions: {
        findFirst: async () => fixtures.session ?? null,
      },
      curriculumTopics: {
        findFirst: async () => fixtures.topic ?? null,
      },
      sessionSummaries: {
        findFirst: async () => fixtures.summary ?? null,
      },
      sessionEvents: {
        findMany: async () => fixtures.events ?? [],
      },
    },
  } as unknown as Database;
}

// createScopedRepository(db, profileId).subjects.findFirst(...) is the only
// scoped-repo call in buildResumeContext. Mock the @eduagent/database export
// surface so the function returns a stub that surfaces the test's `subject`
// fixture.
let mockSubjectFixture: { name: string } | null = null;
jest.mock('@eduagent/database', () => {
  const actual = jest.requireActual('@eduagent/database');
  return {
    ...actual,
    createScopedRepository: () => ({
      subjects: {
        findFirst: async () => mockSubjectFixture,
      },
    }),
  };
});

describe('buildResumeContext', () => {
  beforeEach(() => {
    mockSubjectFixture = null;
  });

  // BUG-888 break test: the resume context block must include the strong
  // "MANDATORY OPENER FORMAT" directive that forces the LLM to reference a
  // specific prior detail in its first turn — not a generic "ready when you
  // are" opener.
  it('[BUG-888] emits a MANDATORY opener directive that bans generic openers', async () => {
    mockSubjectFixture = { name: 'Geography' };
    const db = makeDbStub({
      session: { id: 's1', subjectId: 'sub1', topicId: 't1' },
      topic: { title: "Africa's Geographic Tapestry" },
      summary: {
        learnerRecap: 'Nile is the largest river. Congo is the second largest.',
      },
      events: [
        { eventType: 'user_message', content: 'I remember the Nile' },
        { eventType: 'ai_response', content: 'Right, the Nile is huge.' },
      ],
    });

    const result = await buildResumeContext(db, 'profile-1', 'session-prev');

    expect(result).toBeTruthy();
    expect(result).toContain('MANDATORY OPENER FORMAT');
    expect(result).toMatch(/MUST reference at least one specific detail/);
    expect(result).toMatch(/Do NOT produce a generic.*ready when you are/i);
    // The previous-summary content must be passed through to the LLM so the
    // model has something to cite.
    expect(result).toContain('Nile');
  });

  // BUG-888: buildResumeContext returns undefined when the session is gone.
  it('returns undefined when the prior session no longer exists', async () => {
    const db = makeDbStub({ session: null });
    const result = await buildResumeContext(db, 'profile-1', 'missing');
    expect(result).toBeUndefined();
  });

  it('[BUG-934] projects legacy raw-envelope ai_response content to plain reply in Recent exchange block', async () => {
    mockSubjectFixture = { name: 'History' };
    // Simulate a legacy ai_response row whose content is raw envelope JSON.
    const rawEnvelope = JSON.stringify({
      reply: 'The French Revolution began in 1789.',
      signals: {
        partial_progress: false,
        needs_deepening: false,
        understanding_check: false,
      },
      ui_hints: { note_prompt: { show: false, post_session: false } },
    });

    const db = makeDbStub({
      session: { id: 's1', subjectId: 'sub1', topicId: null },
      events: [
        { eventType: 'user_message', content: 'When did it start?' },
        { eventType: 'ai_response', content: rawEnvelope },
      ],
    });

    const result = await buildResumeContext(db, 'profile-1', 'session-legacy');

    expect(result).toBeTruthy();
    // The plain reply text must appear in the resume context block.
    expect(result).toContain('The French Revolution began in 1789.');
    // The raw JSON structure must NOT appear — that would leak to the LLM.
    expect(result).not.toContain('"signals"');
    expect(result).not.toContain('"ui_hints"');
  });
});

describe('buildCurrentTopicMapContext', () => {
  const topics = [
    {
      id: 'topic-1',
      title: 'What Plants Need: The Ingredients',
      description: 'Light, water, and carbon dioxide as inputs.',
      chapter: 'The Grand Overview',
    },
    {
      id: 'topic-2',
      title: "The Plant's Powerhouse: Chloroplasts",
      description: 'How chloroplasts turn light into usable energy.',
      chapter: 'The Green Factories',
    },
    {
      id: 'topic-3',
      title: "The Green Pigment: Chlorophyll's Magic",
      description: 'Why chlorophyll captures light.',
      chapter: 'The Green Factories',
    },
  ] as Parameters<typeof buildCurrentTopicMapContext>[0]['topics'];

  it('summarizes the current topic scope and nearby path for the mentor', () => {
    const result = buildCurrentTopicMapContext({
      subjectName: 'Biology',
      bookTitle: 'Photosynthesis',
      bookDescription: 'How plants use sunlight to create food and energy',
      currentTopicId: 'topic-2',
      topics,
      latestByTopic: new Map([
        ['topic-1', new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)],
      ]),
    });

    expect(result).toContain('Topic map for the mentor');
    expect(result).toContain('Current topic (2 of 3)');
    expect(result).toContain("The Plant's Powerhouse: Chloroplasts");
    expect(result).toContain(
      'Topic scope: How chloroplasts turn light into usable energy.',
    );
    expect(result).toContain('Earlier in the book');
    expect(result).toContain('What Plants Need: The Ingredients');
    expect(result).toContain('Coming next in the book');
    expect(result).toContain("The Green Pigment: Chlorophyll's Magic");
    expect(result).toContain('Do not treat the topic as learned');
  });

  it('returns undefined when the current topic is not in the ordered map', () => {
    expect(
      buildCurrentTopicMapContext({
        subjectName: 'Biology',
        bookTitle: 'Photosynthesis',
        currentTopicId: 'missing-topic',
        topics,
      }),
    ).toBeUndefined();
  });
});

describe('computeActiveSeconds', () => {
  const baseTime = new Date('2025-01-15T10:00:00.000Z');

  function eventAt(
    offsetSeconds: number,
    metadata?: Record<string, unknown>,
  ): { createdAt: Date; metadata?: unknown } {
    return {
      createdAt: new Date(baseTime.getTime() + offsetSeconds * 1000),
      metadata,
    };
  }

  it('returns 0 for an empty event list', () => {
    expect(computeActiveSeconds(baseTime, [])).toBe(0);
  });

  it('uses the actual gap for a single event within the fallback cap', () => {
    expect(computeActiveSeconds(baseTime, [eventAt(30)])).toBe(30);
  });

  it('sums gaps between consecutive events', () => {
    expect(computeActiveSeconds(baseTime, [eventAt(10), eventAt(70)])).toBe(70);
  });

  it('caps very large gaps at the fallback maximum', () => {
    expect(computeActiveSeconds(baseTime, [eventAt(900)])).toBe(600);
  });

  it('uses expectedResponseMinutes metadata for a custom per-gap cap', () => {
    expect(
      computeActiveSeconds(baseTime, [
        eventAt(300, { expectedResponseMinutes: 2 }),
      ]),
    ).toBe(180);
  });

  it('sorts out-of-order events before computing gaps', () => {
    expect(computeActiveSeconds(baseTime, [eventAt(60), eventAt(10)])).toBe(60);
  });

  it('clamps negative gaps when an event predates the session start', () => {
    expect(
      computeActiveSeconds(baseTime, [
        { createdAt: new Date(baseTime.getTime() - 5_000) },
      ]),
    ).toBe(0);
  });
});
