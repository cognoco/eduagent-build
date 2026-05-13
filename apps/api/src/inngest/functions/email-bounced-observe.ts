// ---------------------------------------------------------------------------
// Email Bounced Observe — observable terminus for the app/email.bounced event
// emitted by the Resend webhook handler when an email bounces or is complained
// about. [AUDIT-INNGEST-1 / PR-17-P1 / 2026-05-12]
//
// Pre-fix: the event was emitted by apps/api/src/routes/resend-webhook.ts with
// the comment "Telemetry-only event — no Inngest handler registered; consumed
// by observability tooling." This meant the event fired into the void — the
// Inngest dashboard could not query it and there was no structured-log terminus,
// violating the CLAUDE.md "Silent recovery without escalation" rule.
//
// [SEC-6 / BUG-722] The email payload already masks recipient PII before
// emitting the event. This handler logs the masked payload only.
//
// Event payload shape (sender: apps/api/src/routes/resend-webhook.ts):
//   { type: 'email.bounced' | 'email.complained', to: string (masked),
//     emailId: string | null, timestamp: string }
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { inngest } from '../client';
import { createLogger } from '../../services/logger';

const logger = createLogger();

const emailBouncedPayloadSchema = z.object({
  type: z.enum(['email.bounced', 'email.complained']).optional(),
  to: z.string().optional(),
  emailId: z.string().nullable().optional(),
  timestamp: z.string().optional(),
});

export const emailBouncedObserve = inngest.createFunction(
  {
    id: 'email-bounced-observe',
    name: 'Email bounced/complained observability',
  },
  { event: 'app/email.bounced' },
  async ({ event }) => {
    const parseResult = emailBouncedPayloadSchema.safeParse(event.data);
    if (!parseResult.success) {
      logger.error('email.bounced.schema_drift', {
        issues: parseResult.error.issues,
        rawData: event.data, // `to` is pre-masked by sender (resend-webhook.ts:maskEmail)
      });
      return { status: 'schema_error' as const };
    }
    const data = parseResult.data;

    logger.warn('email.bounced.received', {
      type: data.type ?? null,
      to: data.to ?? null,
      emailId: data.emailId ?? null,
      eventTimestamp: data.timestamp ?? null,
      receivedAt: new Date().toISOString(),
    });

    return {
      status: 'logged' as const,
      type: data.type ?? null,
      emailId: data.emailId ?? null,
    };
  },
);
