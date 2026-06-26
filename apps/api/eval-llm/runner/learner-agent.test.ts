import { runLearnerTurn, buildLearnerSystemPrompt } from './learner-agent';
import { _resetBootstrap } from './llm-bootstrap';
import { CHALLENGE_SIM_SCENARIOS } from '../fixtures/challenge-personas';
import { PROFILES } from '../fixtures/profiles';

// Only the external HTTP boundary (global fetch) is stubbed — callOpenRouterModel,
// the OpenRouter provider, and message serialization all run for real (GC1-clean:
// no internal jest.mock).

const mockFetch = jest.fn();
(global as unknown as { fetch: typeof fetch }).fetch = mockFetch;

const scenario = CHALLENGE_SIM_SCENARIOS.find(
  (s) => s.id === 'CRS02-fractions-misconception',
)!;
const profile = PROFILES.find((p) => p.id === scenario.profileId)!;

function okResponse(content: string): Partial<Response> {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content }, finish_reason: 'stop' }],
    }),
    text: async () => '',
  };
}

function capturedRequestBody(): {
  messages: Array<{ role: string; content: string }>;
} {
  expect(mockFetch).toHaveBeenCalledTimes(1);
  const [, opts] = mockFetch.mock.calls[0] as [string, { body: string }];
  return JSON.parse(opts.body) as {
    messages: Array<{ role: string; content: string }>;
  };
}

describe('runLearnerTurn', () => {
  const prevOpenRouter = process.env['OPENROUTER_API_KEY'];
  const prevGemini = process.env['GEMINI_API_KEY'];

  beforeEach(() => {
    mockFetch.mockReset();
    process.env['OPENROUTER_API_KEY'] = 'test-or-key';
    process.env['GEMINI_API_KEY'] = 'test-gemini-key';
    _resetBootstrap();
  });

  afterEach(() => {
    _resetBootstrap();
    if (prevOpenRouter === undefined) delete process.env['OPENROUTER_API_KEY'];
    else process.env['OPENROUTER_API_KEY'] = prevOpenRouter;
    if (prevGemini === undefined) delete process.env['GEMINI_API_KEY'];
    else process.env['GEMINI_API_KEY'] = prevGemini;
  });

  it('embeds the hidden competence brief in the system prompt', () => {
    const system = buildLearnerSystemPrompt(scenario, profile);
    expect(system).toContain(scenario.competenceBrief);
    expect(system).toContain(scenario.topicTitle);
    expect(system).toContain(String(profile.ageYears));
  });

  it('sends the competence brief and the mentor question to the model', async () => {
    mockFetch.mockResolvedValue(
      okResponse('You flip it because dividing always makes it smaller.'),
    );

    await runLearnerTurn({
      scenario,
      profile,
      mentorQuestion: scenario.seedQuestion,
      history: [],
      learnerModel: 'anthropic/claude-3.5-sonnet',
    });

    const body = capturedRequestBody();
    const systemMsg = body.messages.find((m) => m.role === 'system');
    expect(systemMsg?.content).toContain(scenario.competenceBrief);
    const lastUser = body.messages.filter((m) => m.role === 'user').at(-1);
    expect(lastUser?.content).toBe(scenario.seedQuestion);
  });

  it('returns the model reply verbatim', async () => {
    const reply = 'You flip it because dividing always makes it smaller.';
    mockFetch.mockResolvedValue(okResponse(reply));

    const result = await runLearnerTurn({
      scenario,
      profile,
      mentorQuestion: scenario.seedQuestion,
      history: [],
      learnerModel: 'anthropic/claude-3.5-sonnet',
    });

    expect(result).toBe(reply);
  });

  it('flips prior history roles (mentor→user, learner→assistant)', async () => {
    mockFetch.mockResolvedValue(okResponse('ok'));

    await runLearnerTurn({
      scenario,
      profile,
      mentorQuestion: 'And why is that?',
      history: [
        { role: 'mentor', content: scenario.seedQuestion },
        { role: 'learner', content: 'Because it makes it smaller.' },
      ],
      learnerModel: 'anthropic/claude-3.5-sonnet',
    });

    const body = capturedRequestBody();
    // [system, user(mentor seed), assistant(learner), user(current question)]
    const nonSystem = body.messages.filter((m) => m.role !== 'system');
    expect(nonSystem.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(nonSystem[0]?.content).toBe(scenario.seedQuestion);
    expect(nonSystem[1]?.content).toBe('Because it makes it smaller.');
    expect(nonSystem[2]?.content).toBe('And why is that?');
  });
});
