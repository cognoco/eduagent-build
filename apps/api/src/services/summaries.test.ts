import { registerProvider, createMockProvider } from './llm';
import { evaluateSummary } from './summaries';
import {
  llmPlainText,
  llmStructuredJson,
  registerLlmProviderFixture,
} from '../test-utils/llm-provider-fixtures';

// ---------------------------------------------------------------------------
// evaluateSummary
// ---------------------------------------------------------------------------

describe('evaluateSummary', () => {
  afterEach(() => {
    // Restore generic mock after each test
    registerProvider(createMockProvider('gemini'));
  });

  it('returns a SummaryEvaluation with feedback', async () => {
    registerLlmProviderFixture({
      chatResponse: {
        feedback: 'Great summary! You captured the key ideas well.',
        hasUnderstandingGaps: false,
        gapAreas: [],
        isAccepted: true,
      },
    });

    const result = await evaluateSummary(
      'Variables',
      'Understanding variables in programming',
      'Variables are containers that store data values.',
    );

    expect(result.feedback).toContain('Great summary');
    expect(result.hasUnderstandingGaps).toBe(false);
    expect(result.isAccepted).toBe(true);
  });

  it('detects understanding gaps', async () => {
    registerLlmProviderFixture({
      chatResponse: {
        feedback:
          "You have a good start! You haven't quite captured the difference between let and const yet.",
        hasUnderstandingGaps: true,
        gapAreas: ['let vs const distinction', 'block scoping'],
        isAccepted: false,
      },
    });

    const result = await evaluateSummary(
      'Variables',
      'Let, const, and var in JavaScript',
      'Variables store data. You use var to create them.',
    );

    expect(result.hasUnderstandingGaps).toBe(true);
    expect(Array.isArray(result.gapAreas)).toBe(true);
    expect(result.gapAreas).toContain('let vs const distinction');
    expect(result.isAccepted).toBe(false);
  });

  it('accepts a good summary', async () => {
    registerLlmProviderFixture({
      chatResponse: {
        feedback: 'Excellent work — you nailed it!',
        hasUnderstandingGaps: false,
        gapAreas: [],
        isAccepted: true,
      },
    });

    const result = await evaluateSummary(
      'Loops',
      'For and while loops',
      'For loops repeat a block a fixed number of times. While loops repeat until a condition is false.',
    );

    expect(result.isAccepted).toBe(true);
    expect(result.hasUnderstandingGaps).toBe(false);
  });

  it('falls back gracefully when LLM returns non-JSON', async () => {
    registerLlmProviderFixture({
      chatResponse: llmPlainText('Your summary looks good overall!'),
    });

    const result = await evaluateSummary(
      'Arrays',
      'Working with arrays',
      'Arrays are ordered collections.',
    );

    // Fallback: LLM returned non-JSON — show safe error message, do not accept.
    // The raw LLM text is never passed through as feedback (it could be an error
    // message, safety refusal, or rate-limit JSON).
    expect(result.feedback).toContain("couldn't provide AI feedback");
    expect(result.isAccepted).toBe(false);
    expect(result.hasUnderstandingGaps).toBe(false);
  });

  it('handles JSON embedded in surrounding text', async () => {
    registerLlmProviderFixture({
      chatResponse:
        'Here is my evaluation:\n' +
        llmStructuredJson({
          feedback: 'Well done!',
          hasUnderstandingGaps: false,
          gapAreas: [],
          isAccepted: true,
        }) +
        '\nEnd of evaluation.',
    });

    const result = await evaluateSummary(
      'Functions',
      'Function declarations',
      'Functions are reusable blocks of code.',
    );

    expect(result.feedback).toBe('Well done!');
    expect(result.isAccepted).toBe(true);
  });

  // [BUG-664 / S-4] Break tests for the brittle /\{[\s\S]*\}/ regex.
  it('parses correctly when prose with braces FOLLOWS the JSON envelope', async () => {
    // The original regex matched first `{` to LAST `}`, so trailing prose
    // braces would corrupt the substring fed to JSON.parse. The brace-depth
    // walker stops at the first balanced object, recovering correctly here.
    registerLlmProviderFixture({
      chatResponse:
        'Here is the evaluation:\n' +
        llmStructuredJson({
          feedback: 'Captured the main idea.',
          hasUnderstandingGaps: false,
          gapAreas: [],
          isAccepted: true,
        }) +
        '\n(rubric reference: see {section-3})',
    });

    const result = await evaluateSummary(
      'Functions',
      'Function declarations',
      'Functions are reusable blocks of code.',
    );

    // Without the brace-walker fix, this would fall back to the canned message.
    expect(result.feedback).toBe('Captured the main idea.');
    expect(result.isAccepted).toBe(true);
  });

  it('parses correctly when JSON is wrapped in a markdown code fence', async () => {
    registerLlmProviderFixture({
      chatResponse:
        '```json\n' +
        llmStructuredJson({
          feedback: 'Solid.',
          hasUnderstandingGaps: false,
          gapAreas: [],
          isAccepted: true,
        }) +
        '\n```',
    });

    const result = await evaluateSummary(
      'Loops',
      'For and while loops',
      'For loops repeat n times.',
    );

    expect(result.feedback).toBe('Solid.');
    expect(result.isAccepted).toBe(true);
  });

  // [BUG-670 / S-16] Break test — never leak raw LLM string as feedback.
  it('uses canned fallback when parsed JSON is missing the feedback field', async () => {
    registerLlmProviderFixture({
      chatResponse: {
        hasUnderstandingGaps: true,
        gapAreas: ['x'],
        isAccepted: false,
      },
    });

    const result = await evaluateSummary(
      'Arrays',
      'Arrays',
      'Some summary text.',
    );

    expect(result.feedback).toContain("couldn't provide AI feedback");
    expect(result.isAccepted).toBe(false);
  });
});
