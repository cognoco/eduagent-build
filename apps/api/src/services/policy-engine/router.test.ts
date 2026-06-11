// ---------------------------------------------------------------------------
// Exchange Router stub — unit tests (WI-571 WP-W1-spine TDD)
// ---------------------------------------------------------------------------

import { resolveExchangeRouter, NoEligibleModelError } from './router';

const MOCK_ROW = {
  model: 'claude-opus-4-8',
  serviceProvider: 'anthropic-direct',
  servingRegion: 'us-east-1',
} as const;

describe('resolveExchangeRouter', () => {
  it('exports resolveExchangeRouter as a function', () => {
    expect(typeof resolveExchangeRouter).toBe('function');
  });

  it('returns { model, serviceProvider, servingRegion } shape from the first eligible row', () => {
    const result = resolveExchangeRouter({ eligibleRows: [MOCK_ROW] });
    expect(result.model).toBe(MOCK_ROW.model);
    expect(result.serviceProvider).toBe(MOCK_ROW.serviceProvider);
    expect(result.servingRegion).toBe(MOCK_ROW.servingRegion);
  });

  it('picks the first row when multiple eligible rows exist', () => {
    const second = {
      model: 'gpt-5',
      serviceProvider: 'azure-openai',
      servingRegion: 'eu-west-1',
    };
    const result = resolveExchangeRouter({ eligibleRows: [MOCK_ROW, second] });
    expect(result.model).toBe(MOCK_ROW.model);
    expect(result.serviceProvider).toBe(MOCK_ROW.serviceProvider);
    expect(result.servingRegion).toBe(MOCK_ROW.servingRegion);
  });

  it('throws NoEligibleModelError when eligibility set is empty (fail-closed)', () => {
    expect(() => resolveExchangeRouter({ eligibleRows: [] })).toThrow(
      NoEligibleModelError,
    );
  });
});

describe('NoEligibleModelError', () => {
  it('is exported and instanceof Error', () => {
    const err = new NoEligibleModelError();
    expect(err instanceof Error).toBe(true);
    expect(err.name).toBe('NoEligibleModelError');
  });

  it('accepts an optional reason message', () => {
    const err = new NoEligibleModelError('no models for this age bracket');
    expect(err.message).toContain('no models for this age bracket');
  });
});
