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
      displayMessage: '',
    });

    const result = await resolveSubjectName('Physics');

    expect(result).toEqual({
      status: 'direct_match',
      resolvedName: 'Physics',
      displayMessage: '',
    });
  });

  it('returns corrected for a misspelled subject', async () => {
    llmResponse({
      status: 'corrected',
      resolvedName: 'Physics',
      displayMessage: 'Did you mean **Physics**?',
    });

    const result = await resolveSubjectName('Phsics');

    expect(result).toEqual({
      status: 'corrected',
      resolvedName: 'Physics',
      displayMessage: 'Did you mean **Physics**?',
    });
  });

  it('returns resolved for natural language input', async () => {
    llmResponse({
      status: 'resolved',
      resolvedName: 'Biology — Entomology',
      displayMessage:
        'This sounds like **Biology — Entomology** — shall we go with that?',
    });

    const result = await resolveSubjectName('I want to learn about ants');

    expect(result).toEqual({
      status: 'resolved',
      resolvedName: 'Biology — Entomology',
      displayMessage:
        'This sounds like **Biology — Entomology** — shall we go with that?',
    });
  });

  it('returns no_match with null resolvedName for nonsense input', async () => {
    llmResponse({
      status: 'no_match',
      resolvedName: null,
      displayMessage:
        "I couldn't find a matching subject. Try entering a subject name like 'Physics' or 'History', or describe what you'd like to learn.",
    });

    const result = await resolveSubjectName('jjjjj');

    expect(result.status).toBe('no_match');
    expect(result.resolvedName).toBeNull();
    expect(result.displayMessage).toBeTruthy();
  });

  it('falls back to direct_match when LLM returns unparseable response', async () => {
    mockRouteAndCall.mockResolvedValueOnce({
      response: 'Sorry, I cannot help with that.',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      latencyMs: 50,
    });

    const result = await resolveSubjectName('History');

    expect(result).toEqual({
      status: 'direct_match',
      resolvedName: 'History',
      displayMessage: '',
    });
  });

  it('falls back to direct_match when LLM returns unknown status', async () => {
    llmResponse({
      status: 'something_unknown',
      resolvedName: 'Whatever',
      displayMessage: 'Weird message',
    });

    const result = await resolveSubjectName('History');

    expect(result.status).toBe('direct_match');
  });

  it('calls routeAndCall with rung 1', async () => {
    llmResponse({
      status: 'direct_match',
      resolvedName: 'Math',
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
});
