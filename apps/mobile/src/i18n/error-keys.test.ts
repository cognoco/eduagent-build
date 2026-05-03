import { getLocalizedErrorKey } from './error-keys';

describe('getLocalizedErrorKey', () => {
  it('maps QUOTA_EXCEEDED to errors.quotaExhausted', () => {
    expect(getLocalizedErrorKey('QUOTA_EXCEEDED')).toBe(
      'errors.quotaExhausted'
    );
  });

  it('maps NETWORK_ERROR to errors.networkError', () => {
    expect(getLocalizedErrorKey('NETWORK_ERROR')).toBe('errors.networkError');
  });

  it('maps NOT_FOUND to errors.notFound', () => {
    expect(getLocalizedErrorKey('NOT_FOUND')).toBe('errors.notFound');
  });

  it('maps FORBIDDEN to errors.forbidden', () => {
    expect(getLocalizedErrorKey('FORBIDDEN')).toBe('errors.forbidden');
  });

  it('maps RESOURCE_GONE to errors.resourceGone', () => {
    expect(getLocalizedErrorKey('RESOURCE_GONE')).toBe('errors.resourceGone');
  });

  it('maps RATE_LIMITED to errors.rateLimited', () => {
    expect(getLocalizedErrorKey('RATE_LIMITED')).toBe('errors.rateLimited');
  });

  it('maps UPSTREAM_ERROR to errors.serverError', () => {
    expect(getLocalizedErrorKey('UPSTREAM_ERROR')).toBe('errors.serverError');
  });

  it('maps BAD_REQUEST to errors.badRequest', () => {
    expect(getLocalizedErrorKey('BAD_REQUEST')).toBe('errors.badRequest');
  });

  it('returns errors.generic for unknown codes', () => {
    expect(getLocalizedErrorKey('SOME_UNKNOWN_CODE')).toBe('errors.generic');
  });
});
