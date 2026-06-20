// ---------------------------------------------------------------------------
// Email suppression service — persist permanently-dead recipient addresses.
//
// When Resend reports a HARD bounce (`bounce.type === 'Permanent'`) or a spam
// complaint, the recipient is permanently un-emailable. Re-sending burns send
// quota and erodes sender reputation. This service records those addresses and
// answers "is this address suppressed?" for the send path.
//
// Route files must not import @eduagent/database directly (G5); this service is
// the single place that accesses the emailSuppressions table — same pattern as
// services/webhook-idempotency.ts.
// ---------------------------------------------------------------------------

import { eq } from 'drizzle-orm';
import { emailSuppressions } from '@eduagent/database';
import type { Database, EmailSuppressionReason } from '@eduagent/database';
import { captureException } from './sentry';
import { createLogger } from './logger';

const logger = createLogger();

/** Canonicalise an address so lookups and writes agree on the same key. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Persist a suppression record for a permanently-dead address.
 *
 * Idempotent: the address is the primary key, so a repeat hard bounce / repeat
 * complaint for the same address is a no-op (`ON CONFLICT DO NOTHING`).
 *
 * Returns:
 *   - 'suppressed'  — a new suppression row was written (or already present)
 *   - 'unavailable' — the DB call failed; caller decides the fallback
 *
 * Per AGENTS.md "Silent recovery without escalation is banned" (webhook code):
 * DB failures are escalated to Sentry + structured log so on-call can query
 * frequency and distinguish a transient connection error from a schema/auth
 * regression. The caller (the webhook route) still acks the webhook so Resend
 * does not retry indefinitely.
 */
export async function suppressEmail(
  db: Database,
  email: string,
  reason: EmailSuppressionReason,
  emailId: string | null,
): Promise<'suppressed' | 'unavailable'> {
  const normalized = normalizeEmail(email);
  try {
    await db
      .insert(emailSuppressions)
      .values({ email: normalized, reason, emailId })
      .onConflictDoNothing({ target: emailSuppressions.email });
    return 'suppressed';
  } catch (err) {
    logger.error('[email-suppression] failed to persist suppression', {
      event: 'email_suppression.persist_failed',
      reason,
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, {
      // No raw recipient address in tags/extra — bounce/complaint recipients
      // are bystander PII (same reasoning as the resend webhook masking).
      extra: { context: 'email_suppression.persist_failed', reason },
    });
    return 'unavailable';
  }
}

/**
 * Returns true when the address is on the suppression list (permanently dead).
 *
 * On a DB failure we fail OPEN (return false) so a transient DB outage does not
 * silently swallow legitimate mail — but we escalate so the outage is visible.
 * A missed skip re-sends one email; a wrongly-true skip would silently drop a
 * consent / security email, which is the worse failure for this product.
 */
export async function isEmailSuppressed(
  db: Database,
  email: string,
): Promise<boolean> {
  const normalized = normalizeEmail(email);
  try {
    const rows = await db
      .select({ email: emailSuppressions.email })
      .from(emailSuppressions)
      .where(eq(emailSuppressions.email, normalized))
      .limit(1);
    return rows.length > 0;
  } catch (err) {
    logger.error('[email-suppression] suppression lookup failed', {
      event: 'email_suppression.lookup_failed',
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, {
      extra: { context: 'email_suppression.lookup_failed' },
    });
    return false;
  }
}
