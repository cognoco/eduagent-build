const mockGetStepDatabase = jest.fn();
const mockFade = jest.fn();

jest.mock('../helpers' /* gc1-allow: Inngest step DB boundary */, () => ({
  ...jest.requireActual('../helpers'),
  getStepDatabase: () => mockGetStepDatabase(),
}));

jest.mock(
  '../../services/mentor-notices' /* gc1-allow: service orchestration boundary; service behavior has direct tests */,
  () => ({
    ...jest.requireActual('../../services/mentor-notices'),
    fadeStaleMentorNotices: (...args: unknown[]) => mockFade(...args),
  }),
);

import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { mentorNoticeFade } from './mentor-notice-fade';

async function execute() {
  return (mentorNoticeFade as any).fn({
    step: createInngestStepRunner().step,
  });
}

describe('mentorNoticeFade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue({ marker: 'db' });
  });

  // [WI-2627] INVERTS the previous assertion ("does not touch notices while the
  // feature is disabled"), which encoded the defect: while the flag was off,
  // notices aged but were never retired, so a re-enable surfaced records that
  // had been inactive for months and would have been faded had the feature
  // stayed on. Fading emits nothing to any client — it retires stale
  // learner-private rows — so flag state is not its gate. The function no longer
  // reads the flag at all, which is why this suite no longer stubs it.
  it('fades stale notices even while the rollout flag is off, so an off-period cannot bank stale records for a re-enable', async () => {
    mockFade.mockResolvedValue(4);

    await expect(execute()).resolves.toEqual({ faded: 4 });
    expect(mockFade).toHaveBeenCalledTimes(1);
  });

  it('uses a 21-day inactivity cutoff', async () => {
    const now = new Date('2026-07-22T03:45:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    mockFade.mockResolvedValue(2);
    try {
      await expect(execute()).resolves.toEqual({ faded: 2 });
      expect(mockFade).toHaveBeenCalledWith(
        { marker: 'db' },
        new Date('2026-07-01T03:45:00.000Z'),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
