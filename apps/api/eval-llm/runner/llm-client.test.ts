import { runHarnessLlm, setOpenRouterModelOverride } from './llm-client';
import { _resetBootstrap } from './llm-bootstrap';
import type { ChatMessage } from '../../src/services/llm/types';

// ---------------------------------------------------------------------------
// Regression: the candidate-model path (`--openrouter-model`) MUST apply the
// production personalization + safety preamble before calling the candidate.
//
// Before the fix, `runHarnessLlm` called `callOpenRouterModel(messages, ...)`
// with raw messages, bypassing `routeAndCall`'s `withSafetyPreamble`. The
// language directive from `getPersonalizationPreamble` ("…in {name}…") never
// reached the candidate, so every candidate's language eval ran on a prompt
// missing the one line that controls reply language. Measured impact: gpt-oss
// scored ~30-73% wrong-language WITHOUT the preamble vs ~2% WITH it — i.e. the
// §6 candidate "wrong-language" finding was a harness artifact. This test
// fails closed if the candidate path ever drops the preamble again.
//
// Only the external HTTP boundary (global fetch) is stubbed; `withSafetyPreamble`,
// the OpenRouter provider, and message serialization all run for real.
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
(global as unknown as { fetch: typeof fetch }).fetch = mockFetch;

const SYSTEM_PROMPT = 'You are MentoMate. Teach fractions.';
const MESSAGES: ChatMessage[] = [
  { role: 'system', content: SYSTEM_PROMPT },
  { role: 'user', content: 'Wytłumacz mi ułamki.' },
];

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

function capturedRequestBody(): string {
  expect(mockFetch).toHaveBeenCalledTimes(1);
  const [, opts] = mockFetch.mock.calls[0] as [string, { body: string }];
  return opts.body;
}

describe('runHarnessLlm — candidate path applies production preamble', () => {
  const prevOpenRouter = process.env['OPENROUTER_API_KEY'];
  const prevGemini = process.env['GEMINI_API_KEY'];

  beforeEach(() => {
    mockFetch.mockReset();
    // bootstrapLlmProviders() throws unless a production key is present; a
    // dummy is fine because provider factories never touch the network at
    // construction time.
    process.env['OPENROUTER_API_KEY'] = 'test-or-key';
    process.env['GEMINI_API_KEY'] = 'test-gemini-key';
    _resetBootstrap();
    mockFetch.mockResolvedValue(okResponse('{"reply":"Ułamki to..."}'));
  });

  afterEach(() => {
    setOpenRouterModelOverride(null);
    _resetBootstrap();
    if (prevOpenRouter === undefined) delete process.env['OPENROUTER_API_KEY'];
    else process.env['OPENROUTER_API_KEY'] = prevOpenRouter;
    if (prevGemini === undefined) delete process.env['GEMINI_API_KEY'];
    else process.env['GEMINI_API_KEY'] = prevGemini;
  });

  it('prepends the conversation-language directive for the candidate model', async () => {
    setOpenRouterModelOverride('openai/gpt-oss-120b');

    await runHarnessLlm(MESSAGES, 1, {
      conversationLanguage: 'pl',
      ageBracket: 'adolescent',
      responseFormat: 'json',
    });

    const body = capturedRequestBody();
    // The exact production directive text from getPersonalizationPreamble.
    expect(body).toContain('in Polish unless the learner switches');
    // The safety preamble must also be present (same withSafetyPreamble path).
    expect(body).toContain(
      'You are an educational AI assistant for young learners',
    );
    // The original flow system prompt is preserved after the preamble.
    expect(body).toContain('You are MentoMate. Teach fractions.');
    // Candidate model id passes through verbatim.
    expect(JSON.parse(body).model).toBe('openai/gpt-oss-120b');
  });

  it('still applies the safety preamble when no conversation language is set', async () => {
    setOpenRouterModelOverride('openai/gpt-oss-120b');

    await runHarnessLlm(MESSAGES, 1, {
      ageBracket: 'adolescent',
      responseFormat: 'json',
    });

    const body = capturedRequestBody();
    expect(body).toContain(
      'You are an educational AI assistant for young learners',
    );
    // No language directive when conversationLanguage is absent.
    expect(body).not.toContain('unless the learner switches');
  });
});
