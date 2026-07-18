import { matchBarIntent, type BarIntentNameIndex } from './bar-intent-match';
import { pushNowDeepLink } from './now-deep-link';

const NOOP_ROUTER = { push: (): void => undefined };

describe('matchBarIntent', () => {
  it('returns a deterministic jump only for currently supported catalog routes', () => {
    const result = matchBarIntent('continue my session session-123');

    expect(result).toEqual({
      kind: 'jump',
      deepLink: {
        route: 'session.resume',
        params: { sessionId: 'session-123' },
        chain: [],
      },
    });
  });

  it('does not jump to unsupported shell routes', () => {
    expect(matchBarIntent('show my progress')).toEqual({
      kind: 'uncertain',
      text: 'show my progress',
    });
  });

  it('routes an explicit pedagogical show-me-how request to Mentor with exact input', () => {
    expect(matchBarIntent('show me how photosynthesis works')).toEqual({
      kind: 'mentor',
      text: 'show me how photosynthesis works',
    });
  });

  it.each(['progress report', 'journal entries', 'subjects list'])(
    'keeps the unsupported destination phrase "%s" on the clarification path',
    (input) => {
      expect(matchBarIntent(input)).toEqual({
        kind: 'uncertain',
        text: input,
      });
    },
  );

  it('returns mentor for a clear conversational message', () => {
    expect(matchBarIntent('why does the moon look bigger tonight?')).toEqual({
      kind: 'mentor',
      text: 'why does the moon look bigger tonight?',
    });
  });

  it('returns uncertain for short or ambiguous text', () => {
    expect(matchBarIntent('review')).toEqual({
      kind: 'uncertain',
      text: 'review',
    });
  });

  it('is synchronous and does not call network APIs', () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    const result = matchBarIntent('open topic topic-1 in subject subject-1');

    expect(result).not.toBeInstanceOf(Promise);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// NL name-index path
// ---------------------------------------------------------------------------

describe('matchBarIntent — NL name-index path', () => {
  const SUBJECTS: BarIntentNameIndex['subjects'] = [
    { id: 'sub-maths', name: 'Maths' },
    { id: 'sub-french', name: 'French' },
  ];

  const TOPICS: BarIntentNameIndex['topics'] = [
    { id: 'topic-vocab', name: 'Vocabulary', subjectId: 'sub-french' },
    { id: 'topic-algebra', name: 'Algebra', subjectId: 'sub-maths' },
  ];

  // ── AC4-1: unique subject name hit → subject.hub ──────────────────────

  it('resolves "resume my maths session" to subject.hub when maths is unique in index', () => {
    const result = matchBarIntent('resume my maths session', {
      subjects: SUBJECTS,
    });
    expect(result).toEqual({
      kind: 'jump',
      deepLink: {
        route: 'subject.hub',
        params: { subjectId: 'sub-maths' },
        chain: [],
      },
    });
  });

  it('resolves "open french today" via NL (no literal subject-id keyword present)', () => {
    // "open french today" has no 'subject' keyword, so wordAfter('subject', ...)
    // returns undefined → literal path skipped → NL path resolves 'french'.
    const result = matchBarIntent('open french today', {
      subjects: SUBJECTS,
    });
    expect(result).toEqual({
      kind: 'jump',
      deepLink: {
        route: 'subject.hub',
        params: { subjectId: 'sub-french' },
        chain: [],
      },
    });
  });

  it('resolves "continue french learning" to subject.hub', () => {
    const result = matchBarIntent('continue french learning', {
      subjects: SUBJECTS,
    });
    expect(result).toEqual({
      kind: 'jump',
      deepLink: {
        route: 'subject.hub',
        params: { subjectId: 'sub-french' },
        chain: [],
      },
    });
  });

  // ── AC4-2: no match → uncertain ───────────────────────────────────────

  it('returns uncertain when subject name is absent from the index', () => {
    const result = matchBarIntent('resume my physics session', {
      subjects: SUBJECTS,
    });
    expect(result.kind).toBe('uncertain');
  });

  it('returns uncertain when nameIndex is provided but empty subjects', () => {
    const result = matchBarIntent('resume my maths session', {
      subjects: [],
    });
    expect(result.kind).toBe('uncertain');
  });

  // ── AC4-3: ambiguous → uncertain ──────────────────────────────────────

  it('returns uncertain when multiple subjects match the query', () => {
    // "history" and "science" both appear as whole words in the query.
    const result = matchBarIntent('review history and science this week', {
      subjects: [
        { id: 'sub-hist', name: 'History' },
        { id: 'sub-sci', name: 'Science' },
      ],
    });
    expect(result.kind).toBe('uncertain');
  });

  it('returns uncertain when a subject name appears in the query but is ambiguous (same name, two IDs)', () => {
    const result = matchBarIntent('open maths now', {
      subjects: [
        { id: 'sub-a', name: 'Maths' },
        { id: 'sub-b', name: 'Maths' },
      ],
    });
    expect(result.kind).toBe('uncertain');
  });

  // ── Subject + topic resolution → retention.review ─────────────────────

  it('resolves subject + topic to retention.review when "review" verb present', () => {
    const result = matchBarIntent('review french vocabulary', {
      subjects: SUBJECTS,
      topics: TOPICS,
    });
    expect(result).toEqual({
      kind: 'jump',
      deepLink: {
        route: 'retention.review',
        params: { subjectId: 'sub-french', topicId: 'topic-vocab' },
        chain: ['subject.hub'],
      },
    });
  });

  it('resolves subject + topic to challenge.start when "challenge" verb present', () => {
    const result = matchBarIntent('challenge me on maths algebra', {
      subjects: SUBJECTS,
      topics: TOPICS,
    });
    expect(result).toEqual({
      kind: 'jump',
      deepLink: {
        route: 'challenge.start',
        params: { subjectId: 'sub-maths', topicId: 'topic-algebra' },
        chain: ['subject.hub'],
      },
    });
  });

  // ── Topic-subject ownership guard: no cross-subject (subjectId,topicId) ──

  it('does not pair a topic with a subject it does not belong to [topic-ownership-guard]', () => {
    // "vocabulary" is a French topic; "maths" is the resolved subject. The
    // resolver must NOT emit retention.review with subjectId:'sub-maths' +
    // topicId:'topic-vocab' (an invalid pair). It drops the mismatched topic
    // and falls back to the subject-only hub jump.
    const result = matchBarIntent('review maths vocabulary', {
      subjects: [{ id: 'sub-maths', name: 'Maths' }],
      topics: [
        { id: 'topic-vocab', name: 'Vocabulary', subjectId: 'sub-french' },
      ],
    });
    expect(result).toEqual({
      kind: 'jump',
      deepLink: {
        route: 'subject.hub',
        params: { subjectId: 'sub-maths' },
        chain: [],
      },
    });
  });

  // ── Backward compat: no nameIndex → NL path disabled ──────────────────

  it('returns uncertain without nameIndex when no literal ID follows keyword', () => {
    // No nameIndex passed — should NOT attempt NL resolution.
    const result = matchBarIntent('resume my maths session');
    expect(result.kind).toBe('uncertain');
  });

  // ── Adversarial invariant: NL jumps must expand without throwing ───────

  it('every NL jump expands through pushNowDeepLink without throwing', () => {
    const nameIndex: BarIntentNameIndex = {
      subjects: SUBJECTS,
      topics: TOPICS,
    };

    const inputs = [
      'resume my maths session',
      'open french now',
      'review french vocabulary',
      'challenge me on maths algebra',
      'continue maths learning',
    ];

    const failures: string[] = [];
    for (const input of inputs) {
      const result = matchBarIntent(input, nameIndex);
      if (result.kind !== 'jump') continue;

      try {
        pushNowDeepLink(NOOP_ROUTER, result.deepLink, {
          subjectHubTarget: 'v2-subject-hub',
        });
      } catch (err) {
        failures.push(`"${input}" → pushNowDeepLink threw: ${String(err)}`);
      }
    }

    expect(failures).toEqual([]);
  });

  // ── Question-shape guard: typed questions must not be hijacked ───────────

  it('returns mentor for a question-shaped input even when a subject name appears in it [NL-question-guard]', () => {
    // 'what is biology?' mentions 'biology' (a valid subject) but is a question.
    // The NL path must not produce a jump — it must fall through as a mentor query.
    const result = matchBarIntent('what is biology?', {
      subjects: [{ id: 'sub-bio', name: 'biology' }],
    });
    expect(result).toEqual({ kind: 'mentor', text: 'what is biology?' });
  });

  it('does not throw when a subject entry has an undefined name [NL-undefined-name-guard]', () => {
    const nameIndex: BarIntentNameIndex = {
      subjects: [{ id: 'sub-1', name: undefined as unknown as string }],
    };
    expect(() => matchBarIntent('open my subject', nameIndex)).not.toThrow();
  });

  it('NL path is fully synchronous (no Promise, no network)', () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    const inputs = [
      'resume my maths session',
      'review french vocabulary',
      'resume my physics session',
    ];

    for (const input of inputs) {
      expect(
        matchBarIntent(input, { subjects: SUBJECTS, topics: TOPICS }),
      ).not.toBeInstanceOf(Promise);
    }

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
