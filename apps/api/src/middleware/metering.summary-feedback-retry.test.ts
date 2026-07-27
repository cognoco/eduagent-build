import {
  isQuotaNeutralLlmRoute,
  LLM_ROUTE_PATTERNS_POST_ONLY,
} from './metering';

const SESSION_ID = '00000000-0000-4000-8000-000000000101';

function matchesPostOnlyLlmRoute(path: string): boolean {
  return LLM_ROUTE_PATTERNS_POST_ONLY.some((pattern) => pattern.test(path));
}

describe('summary feedback retry metering [WI-2183]', () => {
  it('classifies the UUID-scoped POST as quota-neutral LLM recovery', () => {
    const path = `/v1/sessions/${SESSION_ID}/summary/retry-feedback`;

    expect(matchesPostOnlyLlmRoute(path)).toBe(true);
    expect(isQuotaNeutralLlmRoute(path, 'POST')).toBe(true);
    expect(isQuotaNeutralLlmRoute(path, 'GET')).toBe(false);
  });

  it('does not classify a malformed session id as an LLM-consuming retry', () => {
    expect(
      matchesPostOnlyLlmRoute('/v1/sessions/not-a-uuid/summary/retry-feedback'),
    ).toBe(false);
  });
});
