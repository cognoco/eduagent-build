import { buildSystemPrompt } from './exchange-prompts';
import type { ExchangeContext } from './exchanges';

function makeContext(
  overrides: Partial<ExchangeContext> = {},
): ExchangeContext {
  return {
    sessionId: 'session-1',
    profileId: 'profile-1',
    subjectName: 'Italian',
    sessionType: 'learning',
    escalationRung: 1,
    exchangeHistory: [],
    ...overrides,
  };
}

describe('buildSystemPrompt — anti-fabrication block [BUG-937]', () => {
  it('includes the ANTI-FABRICATION block in language-mode prompts', () => {
    const prompt = buildSystemPrompt(
      makeContext({
        pedagogyMode: 'four_strands',
        languageCode: 'it',
        topicTitle: 'Greetings & Introductions',
        topicDescription:
          'Meet people, say hello, and share simple personal details.',
      }),
    );

    expect(prompt).toContain('ANTI-FABRICATION');
    expect(prompt).toMatch(/Do NOT invent or imply learner background/i);
    expect(prompt).toMatch(/pen pals/i);
    expect(prompt).toMatch(/I am a complete beginner/i);
  });

  it('includes the ANTI-FABRICATION block in non-language sessions too', () => {
    // Hallucination is not language-specific: Devil's Advocate, Teach Back,
    // and freeform learning sessions can equally invent learner context.
    const prompt = buildSystemPrompt(
      makeContext({
        sessionType: 'learning',
        topicTitle: 'Photosynthesis',
        topicDescription: 'How plants turn sunlight into energy.',
      }),
    );

    expect(prompt).toContain('ANTI-FABRICATION');
  });

  it('places ANTI-FABRICATION before learner-name and topic sections', () => {
    // Order matters: the anti-fabrication rule must precede the personalisation
    // sections so the model reads the constraint before it sees the few real
    // facts it is allowed to use.
    const prompt = buildSystemPrompt(
      makeContext({
        learnerName: 'Zuzana',
        pedagogyMode: 'four_strands',
        languageCode: 'it',
      }),
    );

    const antiFabIdx = prompt.indexOf('ANTI-FABRICATION');
    const learnerNameIdx = prompt.indexOf('"Zuzana"');
    expect(antiFabIdx).toBeGreaterThan(-1);
    expect(learnerNameIdx).toBeGreaterThan(antiFabIdx);
  });

  it('forbids "you already know X" framing for unsupported claims [break test]', () => {
    // BUG-937 break test: this is the exact attack the rule is meant to block.
    // The "AI opening" reproduced in the bug said: "You already know 'ciao' and
    // 'grazie'." If the prompt did not explicitly forbid that framing, the
    // model would keep doing it. Failing this test means the rule was watered
    // down to something the model can route around.
    const prompt = buildSystemPrompt(
      makeContext({
        pedagogyMode: 'four_strands',
        languageCode: 'it',
        knownVocabulary: [],
      }),
    );

    expect(prompt).toMatch(/"You already know X" is forbidden/i);
  });

  it('reinforces zero-knowledge stance via empty-vocabulary block in language mode [BUG-937]', () => {
    const prompt = buildSystemPrompt(
      makeContext({
        pedagogyMode: 'four_strands',
        languageCode: 'it',
        knownVocabulary: [],
      }),
    );

    // The empty-vocabulary block from language-prompts.ts must reach the final
    // assembled prompt.
    expect(prompt).toContain('Known vocabulary: NONE');
    expect(prompt).toContain('complete beginner');
  });
});

describe('buildSystemPrompt — first-encounter topic probe', () => {
  it('uses the subject opener on the first turn of a never-seen subject', () => {
    const prompt = buildSystemPrompt(
      makeContext({
        topicTitle: 'Photosynthesis',
        exchangeCount: 0,
        isFirstEncounter: true,
        isFirstSessionOfSubject: true,
      }),
    );

    expect(prompt).toContain('SUBJECT OPENER');
    expect(prompt).toContain('what brought you to Italian');
    expect(prompt).not.toContain('FIRST-ENCOUNTER TOPIC RULE:');
    expect(prompt).not.toContain('end with exactly one learner action');
  });

  it('uses teach-while-probe on the first turn of a new topic in a known subject', () => {
    const prompt = buildSystemPrompt(
      makeContext({
        topicTitle: 'Photosynthesis',
        exchangeCount: 0,
        isFirstEncounter: true,
        isFirstSessionOfSubject: false,
      }),
    );

    expect(prompt).toContain('FIRST-ENCOUNTER TOPIC RULE');
    expect(prompt).toContain(
      'one teaching nugget AND one focused follow-up question',
    );
    expect(prompt).toContain('end with exactly one focused follow-up question');
    expect(prompt).not.toContain('end with exactly one learner action');
    expect(prompt).toContain(
      'NEVER frame this as an interview, intake, or assessment',
    );
  });

  it('keeps the topic-probe block through exchange 3 and removes it on exchange 4', () => {
    const turn3Prompt = buildSystemPrompt(
      makeContext({
        topicTitle: 'Photosynthesis',
        exchangeCount: 3,
        exchangeHistory: [
          { role: 'user', content: 'I know plants need sun.' },
          { role: 'assistant', content: 'Yes - sunlight matters.' },
        ],
        isFirstEncounter: true,
      }),
    );
    const turn4Prompt = buildSystemPrompt(
      makeContext({
        topicTitle: 'Photosynthesis',
        exchangeCount: 4,
        exchangeHistory: [
          { role: 'user', content: 'I know plants need sun.' },
          { role: 'assistant', content: 'Yes - sunlight matters.' },
        ],
        isFirstEncounter: true,
      }),
    );

    expect(turn3Prompt).toContain('FIRST-ENCOUNTER TOPIC RULE');
    expect(turn4Prompt).not.toContain('FIRST-ENCOUNTER TOPIC RULE');
  });

  it('keeps the original first-turn action rule for returning topics', () => {
    const prompt = buildSystemPrompt(
      makeContext({
        topicTitle: 'Photosynthesis',
        exchangeCount: 0,
        isFirstEncounter: false,
        isFirstSessionOfSubject: false,
      }),
    );

    expect(prompt).toContain('end with exactly one learner action');
    expect(prompt).not.toContain('FIRST-ENCOUNTER TOPIC RULE');
    expect(prompt).not.toContain('SUBJECT OPENER');
  });

  it('does not add topic-probe blocks in language or review mode', () => {
    const languagePrompt = buildSystemPrompt(
      makeContext({
        pedagogyMode: 'four_strands',
        exchangeCount: 0,
        isFirstEncounter: true,
      }),
    );
    const reviewPrompt = buildSystemPrompt(
      makeContext({
        effectiveMode: 'review',
        topicTitle: 'Photosynthesis',
        exchangeCount: 0,
        isFirstEncounter: true,
      }),
    );

    expect(languagePrompt).not.toContain('FIRST-ENCOUNTER TOPIC RULE');
    expect(languagePrompt).not.toContain('SUBJECT OPENER');
    expect(reviewPrompt).not.toContain('FIRST-ENCOUNTER TOPIC RULE');
    expect(reviewPrompt).not.toContain('SUBJECT OPENER');
  });

  it('reflects extracted signals only after a learner turn exists', () => {
    const prompt = buildSystemPrompt(
      makeContext({
        exchangeCount: 2,
        extractedSignalsToReflect: {
          currentKnowledge: 'has already used chemistry sets',
          interests: ['experiments'],
        },
      }),
    );

    expect(prompt).toContain('SIGNAL REFLECTION');
    expect(prompt).toContain('has already used chemistry sets');
    expect(prompt).toContain('experiments');
  });

  it('[BUG-ZERO-TOKEN-STREAM] keeps response format as the final instruction when orphan turns exist', () => {
    const prompt = buildSystemPrompt(
      makeContext({
        exchangeHistory: [
          { role: 'user', content: 'first question' },
          { role: 'assistant', content: 'first answer' },
          {
            role: 'user',
            content: 'lost retry',
            orphan_reason: 'llm_empty_or_unparseable',
          },
        ],
      }),
    );

    const orphanIdx = prompt.indexOf('ORPHAN USER TURN RECOVERY');
    const formatIdx = prompt.lastIndexOf('RESPONSE FORMAT — CRITICAL');
    expect(orphanIdx).toBeGreaterThan(-1);
    expect(formatIdx).toBeGreaterThan(orphanIdx);
    expect(prompt).toContain(
      '<server_note kind="orphan_user_turn" reason="llm_empty_or_unparseable"/>',
    );
    expect(prompt.slice(formatIdx)).not.toContain('<server_note');
    expect(prompt.trim()).toMatch(/observational only\.$/);
  });
});
