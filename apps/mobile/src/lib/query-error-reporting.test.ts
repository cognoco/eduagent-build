import { UpstreamError } from './api-errors';
import { shouldReportQueryErrorToSentry } from './query-error-reporting';

describe('shouldReportQueryErrorToSentry', () => {
  it('suppresses typed transient database 503 query errors', () => {
    const error = new UpstreamError(
      'Database temporarily unavailable — please retry',
      'SERVICE_UNAVAILABLE',
      503,
    );

    expect(shouldReportQueryErrorToSentry(error)).toBe(false);
  });

  it('suppresses service-unavailable shaped errors when class identity is lost', () => {
    const error = {
      name: 'UpstreamError',
      message: 'Database temporarily unavailable — please retry',
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
    };

    expect(shouldReportQueryErrorToSentry(error)).toBe(false);
  });

  it('keeps reporting other upstream errors', () => {
    const error = new UpstreamError('Server exploded', 'INTERNAL_ERROR', 500);

    expect(shouldReportQueryErrorToSentry(error)).toBe(true);
  });

  it('keeps reporting unknown errors', () => {
    expect(shouldReportQueryErrorToSentry(new Error('Boom'))).toBe(true);
  });
});
