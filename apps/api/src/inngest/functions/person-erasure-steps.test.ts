const mockEnsurePendingClerkErasures = jest.fn().mockResolvedValue(true);
const mockMarkPendingClerkErasuresComplete = jest
  .fn()
  .mockResolvedValue(undefined);
const mockDeleteClerkUser = jest.fn().mockResolvedValue({ deleted: true });
const mockDb = { kind: 'test-db' };

jest.mock('../../services/identity-v2/deletion-v2', () => {
  const actual = jest.requireActual(
    '../../services/identity-v2/deletion-v2',
  ) as typeof import('../../services/identity-v2/deletion-v2');
  return {
    ...actual,
    ensurePendingClerkErasures: (...args: unknown[]) =>
      mockEnsurePendingClerkErasures(...args),
    markPendingClerkErasuresComplete: (...args: unknown[]) =>
      mockMarkPendingClerkErasuresComplete(...args),
  };
});

jest.mock('../../services/clerk-user', () => {
  const actual = jest.requireActual(
    '../../services/clerk-user',
  ) as typeof import('../../services/clerk-user');
  return {
    ...actual,
    deleteClerkUser: (...args: unknown[]) => mockDeleteClerkUser(...args),
  };
});

jest.mock('../helpers', () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return {
    ...actual,
    getStepDatabase: () => mockDb,
    getStepClerkSecretKey: () => 'clerk-test-key',
  };
});

import { NonRetriableError } from 'inngest';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { completePersonErasureExternalWork } from './person-erasure-steps';

const RESULT = {
  status: 'deleted' as const,
  clerkUserIds: ['clerk-a', 'clerk-b'],
  organizationId: 'org-test',
  organizationDeleted: false,
  subscriptionStoreTeardownTargets: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockEnsurePendingClerkErasures.mockResolvedValue(true);
  mockMarkPendingClerkErasuresComplete.mockResolvedValue(undefined);
  mockDeleteClerkUser.mockResolvedValue({ deleted: true });
});

describe('completePersonErasureExternalWork Clerk fence', () => {
  it('[WI-2788] revalidates a memoized reservation before deleting a rebound Clerk identity', async () => {
    mockEnsurePendingClerkErasures.mockResolvedValue(false);
    const runner = createInngestStepRunner({
      // Models a sleeping run whose original reservation receipt is memoized
      // after its finite fence expired and the Clerk identity rebound.
      runResults: { 'person-erasure-clerk-users-reserve': true },
    });

    await expect(
      completePersonErasureExternalWork({
        step: runner.step as never,
        stepPrefix: 'person-erasure',
        result: RESULT,
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
    expect(mockEnsurePendingClerkErasures).toHaveBeenCalledTimes(1);
    expect(mockEnsurePendingClerkErasures).toHaveBeenCalledWith(mockDb, [
      'clerk-a',
      'clerk-b',
    ]);
    expect(mockDeleteClerkUser).not.toHaveBeenCalled();
  });

  it('[WI-2788] keeps every fence pending when one Clerk deletion fails', async () => {
    mockDeleteClerkUser
      .mockResolvedValueOnce({ deleted: true })
      .mockRejectedValueOnce(new Error('Clerk unavailable'));
    const runner = createInngestStepRunner();

    await expect(
      completePersonErasureExternalWork({
        step: runner.step as never,
        stepPrefix: 'person-erasure',
        result: RESULT,
      }),
    ).rejects.toThrow('Clerk unavailable');
    expect(mockMarkPendingClerkErasuresComplete).not.toHaveBeenCalled();
  });

  it('[WI-2788] releases every fence only after all Clerk deletions complete', async () => {
    const runner = createInngestStepRunner();

    await completePersonErasureExternalWork({
      step: runner.step as never,
      stepPrefix: 'person-erasure',
      result: RESULT,
    });

    expect(mockEnsurePendingClerkErasures).toHaveBeenCalledWith(mockDb, [
      'clerk-a',
      'clerk-b',
    ]);
    expect(mockEnsurePendingClerkErasures).toHaveBeenCalledTimes(2);
    expect(mockDeleteClerkUser).toHaveBeenCalledTimes(2);
    expect(mockMarkPendingClerkErasuresComplete).toHaveBeenCalledWith(mockDb, [
      'clerk-a',
      'clerk-b',
    ]);
  });
});
