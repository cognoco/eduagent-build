const mockRecordChildCapNotificationForSubscriptionV2 = jest.fn();
const mockGetStepDatabase = jest.fn();

// [GC6] requireActual + targeted override: only getStepDatabase needs a fake DB
// handle; the rest of ../helpers runs real.
jest.mock(
  '../helpers' /* gc1-allow: getStepDatabase wraps Inngest step DB acquisition; test injects a fake handle */,
  () => {
    const actual = jest.requireActual(
      '../helpers',
    ) as typeof import('../helpers');
    return { ...actual, getStepDatabase: () => mockGetStepDatabase() };
  },
);

// [WI-867] flag collapsed — source now calls recordChildCapNotificationForSubscriptionV2
// from billing-v2 unconditionally; old child-cap-notifications mock is dead.
jest.mock(
  '../../services/billing/billing-v2' /* gc1-allow: read-then-write fn — recordChildCapNotificationForSubscriptionV2 verifies child-in-subscription via a db.select().from(person) join then performs the idempotent insert, neither exercisable on the unit Proxy mock-db; this suite tests the handler dispatch + result mapping, not the billing reduction. No notify-parent-child-cap-hit integration twin exists yet — coverage gap tracked WI-905 */,
  () => {
    const actual = jest.requireActual(
      '../../services/billing/billing-v2',
    ) as typeof import('../../services/billing/billing-v2');
    return {
      ...actual,
      recordChildCapNotificationForSubscriptionV2: (
        ...args: unknown[]
      ): unknown => mockRecordChildCapNotificationForSubscriptionV2(...args),
    };
  },
);

import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { notifyParentChildCapHit } from './notify-parent-child-cap-hit';

const DB = { kind: 'db' };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetStepDatabase.mockReturnValue(DB);
  mockRecordChildCapNotificationForSubscriptionV2.mockResolvedValue({
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
    expect(
      mockRecordChildCapNotificationForSubscriptionV2,
    ).toHaveBeenCalledWith(DB, {
      subscriptionId: 'sub-1',
      childProfileId: 'child-1',
      kind: 'daily_exceeded',
      resetsAt: '2026-05-27T01:00:00.000Z',
      occurredAt: '2026-05-26T12:00:00.000Z',
    });
    expect(result).toEqual({
      status: 'recorded',
      inserted: true,
    });
  });
});
