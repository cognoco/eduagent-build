// @inngest-admin: no-db (logging observer; no DB access)
// ---------------------------------------------------------------------------
// Email Bounced Observe — observable terminus for the app/email.bounced event
// emitted by the Resend webhook handler when an email bounces or is complained
// about. [AUDIT-INNGEST-1 / PR-17-P1 / 2026-05-12]
//
// Pre-fix: the event was emitted by apps/api/src/routes/resend-webhook.ts with
// the comment "Telemetry-only event — no Inngest handler registered; consumed
// by observability tooling." This meant the event fired into the void — the
// Inngest dashboard could not query it and there was no structured-log terminus,
// violating the AGENTS.md "Silent recovery without escalation" rule.
//
// [SEC-6 / BUG-722] The email payload already masks recipient PII before
// emitting the event. This handler logs the masked payload only.
//
// Event payload shape (shared with sender via `@eduagent/schemas`):
//   app/email.bounced → emailBouncedEventSchema
//
// Note: both `email.bounced` and `email.complained` events from Resend are
// multiplexed onto the single `app/email.bounced` Inngest event; the `type`
// field on the payload distinguishes them. The structured-log `message`
// reflects the original event type so dashboard queries can filter on it.
// ---------------------------------------------------------------------------

import {
  emailBouncedEventSchema,
  summarizeRawPayload,
} from '@eduagent/schemas';
import { inngest } from '../client';
import { createLogger } from '../../services/logger';
import { captureException } from '../../services/sentry';

const logger = createLogger();

export const emailBouncedObserve = inngest.createFunction(
  {
    id: 'email-bounced-observe',
    name: 'Email bounced/complained observability',
  },
  { event: 'app/email.bounced' },
  async ({ event }) => {
    const parseResult = emailBouncedEventSchema.safeParse(event.data);
    if (!parseResult.success) {
      logger.error('email.bounced.schema_drift', {
        issues: parseResult.error.issues,
        rawData: summarizeRawPayload(event.data),
      });
      captureException(
        new Error(
          '[email-bounced] invalid event payload — schema drift or bad event',
        ),
        {
          extra: {
            issues: parseResult.error.issues,
            rawData: summarizeRawPayload(event.data),
          },
        },
      );
      return { status: 'schema_error' as const };
    }
    const data = parseResult.data;

    // Branch the log message on the resend event type so dashboard / on-call
    // queries can filter `email.complained.received` separately from
    // `email.bounced.received`. Bug-314: previously hard-coded to
    // `email.bounced.received` for both signals, losing the complaint signal.
    const logMessage =
      data.type === 'email.complained'
        ? 'email.complained.received'
        : 'email.bounced.received';

    logger.warn(logMessage, {
      type: data.type,
      to: data.to,
      emailId: data.emailId ?? null,
      eventTimestamp: data.timestamp ?? null,
      receivedAt: new Date().toISOString(),
    });

    return {
      status: 'logged' as const,
      type: data.type,
      emailId: data.emailId ?? null,
    };
  },
);
