const mockRecordChildCapNotificationForSubscription = jest.fn();
const mockGetStepDatabase = jest.fn();

// [GC6] requireActual + targeted override: only getStepDatabase needs a fake DB
// handle; the rest of ../helpers (incl. isIdentityV2EnabledInStep, which the
// CUT-B3 flag dispatch calls — default false in the Node test env) runs real.
jest.mock('../helpers', () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return {
    ...actual,
    getStepDatabase: () => mockGetStepDatabase(),
  };
});

jest.mock(
  '../../services/child-cap-notifications' /* gc1-allow: handler unit delegates DB behavior to service tests */,
  () => ({
    recordChildCapNotificationForSubscription: (...args: unknown[]): unknown =>
      mockRecordChildCapNotificationForSubscription(...args),
  }),
);

import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { notifyParentChildCapHit } from './notify-parent-child-cap-hit';

const DB = { kind: 'db' };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetStepDatabase.mockReturnValue(DB);
  mockRecordChildCapNotificationForSubscription.mockResolvedValue({
    inserted: true,
  });
});

describe('notifyParentChildCapHit', () => {
  it('is registered for the child quota exhausted event', () => {
    expect(
      (notifyParentChildCapHit as { opts?: { id?: string } }).opts?.id,
    ).toBe('notify-parent-child-cap-hit');
    expect((notifyParentChildCapHit as any).opts?.triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'app/billing.profile_quota.exhausted',
        }),
      ]),
    );
  });

  it('records an idempotent parent notification row', async () => {
    const runner = createInngestStepRunner();
    const handler = (notifyParentChildCapHit as any).fn;

    const result = await handler({
      event: {
        name: 'app/billing.profile_quota.exhausted',
        data: {
          subscriptionId: 'sub-1',
          profileId: 'child-1',
          kind: 'daily_exceeded',
          resetsAt: '2026-05-27T01:00:00.000Z',
          occurredAt: '2026-05-26T12:00:00.000Z',
        },
      },
      step: runner.step,
    });

    expect(runner.runNames()).toEqual(['record-child-cap-notification']);
    expect(mockRecordChildCapNotificationForSubscription).toHaveBeenCalledWith(
      DB,
      {
        subscriptionId: 'sub-1',
        childProfileId: 'child-1',
        kind: 'daily_exceeded',
        resetsAt: '2026-05-27T01:00:00.000Z',
        occurredAt: '2026-05-26T12:00:00.000Z',
      },
    );
    expect(result).toEqual({
      status: 'recorded',
      inserted: true,
    });
  });
});
