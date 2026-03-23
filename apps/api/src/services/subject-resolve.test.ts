jest.mock('./llm', () => ({
  routeAndCall: jest.fn(),
}));

import { resolveSubjectName } from './subject-resolve';
import { routeAndCall } from './llm';

const mockRouteAndCall = routeAndCall as jest.MockedFunction<
  typeof routeAndCall
>;

function llmResponse(json: Record<string, unknown>): void {
  mockRouteAndCall.mockResolvedValueOnce({
    response: JSON.stringify(json),
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    latencyMs: 50,
  });
}

beforeEach(() => jest.clearAllMocks());

describe('resolveSubjectName', () => {
  it('returns direct_match for a valid subject name', async () => {
    llmResponse({
      status: 'direct_match',
      resolvedName: 'Physics',
      suggestions: [
        { name: 'Physics', description: 'Forces, motion and energy' },
      ],
      displayMessage: '',
    });

    const result = await resolveSubjectName('Physics');

    expect(result.status).toBe('direct_match');
    expect(result.resolvedName).toBe('Physics');
    expect(result.suggestions).toHaveLength(1);
    expect(result.displayMessage).toBe('');
  });

  it('returns corrected for a misspelled subject', async () => {
    llmResponse({
      status: 'corrected',
      resolvedName: 'Physics',
      suggestions: [
        { name: 'Physics', description: 'Forces, motion and energy' },
      ],
      displayMessage: 'Did you mean **Physics**?',
    });

    const result = await resolveSubjectName('Phsics');

    expect(result.status).toBe('corrected');
    expect(result.resolvedName).toBe('Physics');
    expect(result.suggestions[0].name).toBe('Physics');
  });

  it('returns ambiguous with multiple suggestions for a broad topic', async () => {
    llmResponse({
      status: 'ambiguous',
      resolvedName: null,
      suggestions: [
        {
          name: 'Biology — Entomology',
          description: 'Ant bodies, life cycle and species',
        },
        { name: 'Ecology', description: 'How ants interact with ecosystems' },
      ],
      displayMessage:
        '**Ants** can be studied from different angles — which interests you?',
    });

    const result = await resolveSubjectName('ants');

    expect(result.status).toBe('ambiguous');
    expect(result.resolvedName).toBeNull();
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions[0].name).toBe('Biology — Entomology');
    expect(result.suggestions[1].name).toBe('Ecology');
  });

  it('returns resolved for natural language input', async () => {
    llmResponse({
      status: 'resolved',
      resolvedName: 'Computer Science',
      suggestions: [
        { name: 'Computer Science', description: 'How computers work' },
      ],
      displayMessage:
        'This sounds like **Computer Science** — shall we go with that?',
    });

    const result = await resolveSubjectName(
      'I want to learn how computers work'
    );

    expect(result.status).toBe('resolved');
    expect(result.resolvedName).toBe('Computer Science');
  });

  it('returns no_match with null resolvedName for nonsense input', async () => {
    llmResponse({
      status: 'no_match',
      resolvedName: null,
      suggestions: [],
      displayMessage: "I couldn't find a matching subject.",
    });

    const result = await resolveSubjectName('jjjjj');

    expect(result.status).toBe('no_match');
    expect(result.resolvedName).toBeNull();
    expect(result.suggestions).toHaveLength(0);
  });

  it('falls back to direct_match when LLM returns unparseable response', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: 'Sorry, I cannot help with that.',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      latencyMs: 50,
    });

    const result = await resolveSubjectName('History');

    expect(result.status).toBe('direct_match');
    expect(result.resolvedName).toBe('History');
    expect(result.suggestions).toHaveLength(1);
  });

  it('falls back to direct_match when LLM returns unknown status', async () => {
    llmResponse({
      status: 'something_unknown',
      resolvedName: 'Whatever',
      suggestions: [],
      displayMessage: '',
    });

    const result = await resolveSubjectName('History');

    expect(result.status).toBe('direct_match');
  });

  it('calls routeAndCall with rung 1', async () => {
    llmResponse({
      status: 'direct_match',
      resolvedName: 'Math',
      suggestions: [{ name: 'Math', description: '' }],
      displayMessage: '',
    });

    await resolveSubjectName('Math');

    expect(mockRouteAndCall).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user', content: 'Math' }),
      ]),
      1
    );
  });

  it('handles missing suggestions array gracefully', async () => {
    llmResponse({
      status: 'corrected',
      resolvedName: 'Physics',
      displayMessage: 'Did you mean **Physics**?',
      // no suggestions field
    });

    const result = await resolveSubjectName('Phsics');

    expect(result.status).toBe('corrected');
    expect(result.resolvedName).toBe('Physics');
    expect(result.suggestions).toEqual([]);
  });
});
