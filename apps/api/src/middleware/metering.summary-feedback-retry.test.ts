import { LLM_ROUTE_PATTERNS_POST_ONLY } from './metering';

const SESSION_ID = '00000000-0000-4000-8000-000000000101';

function matchesPostOnlyLlmRoute(path: string): boolean {
  return LLM_ROUTE_PATTERNS_POST_ONLY.some((pattern) => pattern.test(path));
}

describe('summary feedback retry metering [WI-2183]', () => {
  it('meters the UUID-scoped retry endpoint before the route refunds recovery quota', () => {
    expect(
      matchesPostOnlyLlmRoute(
        `/v1/sessions/${SESSION_ID}/summary/retry-feedback`,
      ),
    ).toBe(true);
  });

  it('does not classify a malformed session id as an LLM-consuming retry', () => {
    expect(
      matchesPostOnlyLlmRoute('/v1/sessions/not-a-uuid/summary/retry-feedback'),
    ).toBe(false);
  });
});
