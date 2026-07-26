import { buildPastDueLaunchHealthSignals } from './past-due-launch-health';

describe('past-due subscription launch-health signals', () => {
  it('emits bounded aggregate signals for aged and grace-expired rows', () => {
    expect(
      buildPastDueLaunchHealthSignals({
        environment: 'production',
        agedPastDueCount: 3,
        graceExceededCount: 1,
        observedAt: '2026-07-25T10:00:00.000Z',
      }),
    ).toEqual([
      {
        message: 'billing.past_due_aged',
        level: 'warning',
        tags: {
          surface: 'billing',
          signal: 'past-due-aged',
          environment: 'production',
        },
        extra: {
          count: 3,
          age_threshold_hours: 24,
          observed_at: '2026-07-25T10:00:00.000Z',
        },
      },
      {
        message: 'billing.past_due_grace_exceeded',
        level: 'error',
        tags: {
          surface: 'billing',
          signal: 'past-due-grace-exceeded',
          environment: 'production',
        },
        extra: {
          count: 1,
          observed_at: '2026-07-25T10:00:00.000Z',
        },
      },
    ]);
  });

  it('emits nothing when both aggregate counts are zero', () => {
    expect(
      buildPastDueLaunchHealthSignals({
        environment: 'production',
        agedPastDueCount: 0,
        graceExceededCount: 0,
        observedAt: '2026-07-25T10:00:00.000Z',
      }),
    ).toEqual([]);
  });

  it('cannot include payer identifiers or payment payloads', () => {
    const serialized = JSON.stringify(
      buildPastDueLaunchHealthSignals({
        environment: 'production',
        agedPastDueCount: 1,
        graceExceededCount: 1,
        observedAt: '2026-07-25T10:00:00.000Z',
      }),
    );

    expect(serialized).not.toMatch(
      /payer|person|subscription_id|customer|payment|payload/i,
    );
  });
});
