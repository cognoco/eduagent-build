import { NetworkError, RateLimitedError, UpstreamError } from './api-errors';
import { shouldReportQueryErrorToSentry } from './query-error-reporting';

describe('shouldReportQueryErrorToSentry', () => {
  // CR-144: NetworkError suppression
  it('suppresses NetworkError (device offline)', () => {
    expect(shouldReportQueryErrorToSentry(new NetworkError())).toBe(false);
  });

  // CR-144: RateLimitedError suppression
  it('suppresses RateLimitedError (429)', () => {
    expect(shouldReportQueryErrorToSentry(new RateLimitedError())).toBe(false);
  });

  // CR-144: 5xx UpstreamError suppression (server already captures via CR-091)
  it('suppresses UpstreamError with status 500', () => {
    expect(
      shouldReportQueryErrorToSentry(
        new UpstreamError('Internal error', 'INTERNAL_ERROR', 500),
      ),
    ).toBe(false);
  });

  it('suppresses UpstreamError with status 502', () => {
    expect(
      shouldReportQueryErrorToSentry(
        new UpstreamError('Bad gateway', 'UPSTREAM_ERROR', 502),
      ),
    ).toBe(false);
  });

  it('suppresses typed transient database 503 query errors', () => {
    const error = new UpstreamError(
      'Database temporarily unavailable — please retry',
      'SERVICE_UNAVAILABLE',
      503,
    );

    expect(shouldReportQueryErrorToSentry(error)).toBe(false);
  });

  it('suppresses upstream-shaped 5xx errors when class identity is lost', () => {
    const error = {
      name: 'UpstreamError',
      message: 'Bad gateway',
      code: 'UPSTREAM_ERROR',
      status: 502,
    };

    expect(shouldReportQueryErrorToSentry(error)).toBe(false);
  });

  it('keeps reporting upstream-shaped 4xx errors when class identity is lost', () => {
    const error = {
      name: 'UpstreamError',
      message: 'Not found',
      code: 'NOT_FOUND',
      status: 404,
    };

    expect(shouldReportQueryErrorToSentry(error)).toBe(true);
  });

  it('keeps reporting 4xx upstream errors (not server-side captured)', () => {
    const error = new UpstreamError('Not found', 'NOT_FOUND', 404);

    expect(shouldReportQueryErrorToSentry(error)).toBe(true);
  });

  it('keeps reporting unknown errors', () => {
    expect(shouldReportQueryErrorToSentry(new Error('Boom'))).toBe(true);
  });
});
