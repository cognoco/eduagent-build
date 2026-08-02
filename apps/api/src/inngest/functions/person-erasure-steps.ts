// @inngest-admin: event-profile (erasure targets come from the originating account/profile event)
import { NonRetriableError, type GetStepTools } from 'inngest';
import {
  ensurePendingClerkErasures,
  markPendingClerkErasuresComplete,
  type PersonErasureAttemptResultV2,
  type PersonErasureSnapshotV2,
} from '../../services/identity-v2/deletion-v2';
import { deleteClerkUser } from '../../services/clerk-user';
import { getStepClerkSecretKey, getStepDatabase } from '../helpers';
import { inngest } from '../client';

type DurableStep = GetStepTools<typeof inngest>;

export async function runStablePersonErasure(args: {
  step: DurableStep;
  stepPrefix: string;
  capture: () => Promise<PersonErasureSnapshotV2>;
  erase: (
    snapshot: PersonErasureSnapshotV2,
  ) => Promise<PersonErasureAttemptResultV2>;
}): Promise<PersonErasureAttemptResultV2> {
  for (const attempt of [1, 2]) {
    const snapshot = await args.step.run(
      `${args.stepPrefix}-capture-${attempt}`,
      args.capture,
    );
    const result = await args.step.run(
      `${args.stepPrefix}-database-${attempt}`,
      () => args.erase(snapshot),
    );
    if (result.status !== 'snapshot_changed') return result;
  }

  throw new NonRetriableError(
    `${args.stepPrefix}: external erasure snapshot changed twice; reroute for operator reconciliation`,
  );
}

export async function completePersonErasureExternalWork(args: {
  step: DurableStep;
  stepPrefix: string;
  result: PersonErasureAttemptResultV2;
}): Promise<void> {
  if (
    args.result.status !== 'deleted' &&
    args.result.status !== 'already_deleted'
  ) {
    return;
  }

  if (args.result.clerkUserIds.length > 0) {
    const reserved = await args.step.run(
      `${args.stepPrefix}-clerk-users-reserve`,
      () =>
        ensurePendingClerkErasures(getStepDatabase(), args.result.clerkUserIds),
    );
    if (!reserved) {
      throw new NonRetriableError(
        `${args.stepPrefix}: clerk_erasure_target_rebound; reroute for operator reconciliation`,
      );
    }

    await args.step.run(`${args.stepPrefix}-clerk-users`, async () => {
      // The reserve receipt can outlive its finite fence. Re-check for a
      // rebound login at the destructive boundary and refresh the DB-clock
      // deadline; 24 hours comfortably bounds the Clerk request callback.
      const stillReserved = await ensurePendingClerkErasures(
        getStepDatabase(),
        args.result.clerkUserIds,
      );
      if (!stillReserved) {
        throw new NonRetriableError(
          `${args.stepPrefix}: clerk_erasure_target_rebound; reroute for operator reconciliation`,
        );
      }
      return Promise.all(
        args.result.clerkUserIds.map((userId) =>
          deleteClerkUser({
            userId,
            clerkSecretKey: getStepClerkSecretKey(),
          }),
        ),
      );
    });
    await args.step.run(`${args.stepPrefix}-clerk-users-release`, () =>
      markPendingClerkErasuresComplete(
        getStepDatabase(),
        args.result.clerkUserIds,
      ),
    );
  }

  if (
    args.result.organizationDeleted &&
    args.result.organizationId &&
    args.result.subscriptionStoreTeardownTargets.length > 0
  ) {
    await args.step.sendEvent(
      `${args.stepPrefix}-subscription-store-teardown`,
      {
        name: 'app/billing.subscription_store_teardown_requested',
        data: {
          accountId: args.result.organizationId,
          identityVersion: 'v2',
          reason: 'whole_org_erasure',
          requestedAt: new Date().toISOString(),
          subscriptions: args.result.subscriptionStoreTeardownTargets,
        },
      },
    );
  }
}
