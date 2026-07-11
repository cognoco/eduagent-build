// @inngest-admin: cross-profile
// Metadata-only blocked-safety ingestion + daily operator digest (WI-1691).

import type { BlockedSafetyDailyBucket } from '@eduagent/database';
import {
  blockedSafetyDigestEventSchema,
  type BlockedSafetyDigestEvent,
} from '@eduagent/schemas';
import {
  deliverBlockedSafetyDigestBucket,
  listUndeliveredClosedBlockedSafetyBuckets,
  recordBlockedSafetyDigestEvent,
} from '../../services/blocked-safety-digest';
import { captureException } from '../../services/sentry';
import { inngest } from '../client';
import {
  getStepDatabase,
  getStepEmailFrom,
  getStepResendApiKey,
  getStepSupportEmail,
} from '../helpers';

interface StepRunner {
  run<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

interface IngestArgs {
  event: { name: string; data: unknown };
  step: StepRunner;
}

interface IngestDependencies {
  record(event: BlockedSafetyDigestEvent): Promise<{
    recorded: boolean;
    bucketDate: string;
  }>;
}

const defaultIngestDependencies: IngestDependencies = {
  record: (event) => recordBlockedSafetyDigestEvent(getStepDatabase(), event),
};

export async function runBlockedSafetyDigestIngest(
  { event, step }: IngestArgs,
  dependencies: IngestDependencies = defaultIngestDependencies,
) {
  const data =
    event.data && typeof event.data === 'object'
      ? (event.data as Record<string, unknown>)
      : {};
  const parsed = blockedSafetyDigestEventSchema.safeParse({
    ...data,
    name: event.name,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      code: issue.code,
      path: issue.path.join('.'),
    }));
    captureException(new Error('Invalid blocked-safety digest event'), {
      extra: { eventName: event.name, issues },
    });
    return { status: 'skipped' as const, reason: 'invalid_payload' as const };
  }

  const result = await step.run('record-blocked-safety-event', () =>
    dependencies.record(parsed.data),
  );
  return { status: 'recorded' as const, ...result };
}

interface DeliveryDependencies {
  currentDate(): string;
  loadClosed(currentUtcDate: string): Promise<BlockedSafetyDailyBucket[]>;
  deliver(
    bucket: BlockedSafetyDailyBucket,
  ): Promise<{ delivered: boolean; reason?: 'empty' }>;
}

const defaultDeliveryDependencies: DeliveryDependencies = {
  currentDate: () => new Date().toISOString().slice(0, 10),
  loadClosed: (currentUtcDate) =>
    listUndeliveredClosedBlockedSafetyBuckets(
      getStepDatabase(),
      currentUtcDate,
    ),
  deliver: (bucket) =>
    deliverBlockedSafetyDigestBucket(getStepDatabase(), bucket, {
      to: getStepSupportEmail(),
      resendApiKey: getStepResendApiKey(),
      emailFrom: getStepEmailFrom(),
    }),
};

export async function runBlockedSafetyDigestDelivery(
  { step }: { step: StepRunner },
  dependencies: DeliveryDependencies = defaultDeliveryDependencies,
) {
  const currentDate = dependencies.currentDate();
  const buckets = await step.run('load-undelivered-closed-buckets', () =>
    dependencies.loadClosed(currentDate),
  );

  for (const bucket of buckets) {
    await step.run(`deliver-blocked-safety-digest-${bucket.bucketDate}`, () =>
      dependencies.deliver(bucket),
    );
  }

  return { status: 'completed' as const, bucketCount: buckets.length };
}

export const blockedSafetyDigestIngest = inngest.createFunction(
  {
    id: 'blocked-safety-digest-ingest',
    name: 'Record blocked-safety digest counters',
    retries: 5,
  },
  [
    { event: 'app/safety.dangerous_procedure_blocked' },
    { event: 'app/safety.minor_pii_echo_redacted' },
    { event: 'app/safety.suitability_blocked' },
  ],
  runBlockedSafetyDigestIngest,
);

export const blockedSafetyDigestDelivery = inngest.createFunction(
  {
    id: 'blocked-safety-digest-delivery',
    name: 'Deliver blocked-safety daily operator digest',
    retries: 5,
    concurrency: { limit: 1 },
  },
  { cron: '15 0 * * *' },
  runBlockedSafetyDigestDelivery,
);
