// @inngest-admin: parent-chain (consentStates.profileId enforced in WHERE)
import { inngest } from '../client';
import {
  getStepDatabase,
  getStepResendApiKey,
  getStepEmailFrom,
  getStepAppUrl,
  isIdentityV2EnabledInStep,
} from '../helpers';
import { and, eq, gte, lt } from 'drizzle-orm';
import { consentRequest, consentStates } from '@eduagent/database';
import { refreshConsentTokenForRequest } from '../../services/consent';
import {
  refreshConsentTokenForRequestV2,
  type RefreshedConsentTokenForRequestV2,
} from '../../services/identity-v2/consent-v2';
import { resolveConsentStatus } from '../../services/identity-v2/consent-status-v2';
import { resolveOrgIdForPerson } from '../../services/identity-v2/family-v2';
import {
  sendEmail,
  formatConsentReminderEmail,
  type EmailOptions,
} from '../../services/notifications';
import { deleteProfileIfNoConsent } from '../../services/deletion';
import { deletePersonIfNoConsentV2 } from '../../services/identity-v2/deletion-v2';
import { buildEmailIdempotencyKey } from '../../services/dedupe-key';

export const consentReminder = inngest.createFunction(
  { id: 'consent-reminder', name: 'Send consent reminder' },
  { event: 'app/consent.requested' },
  async ({ event, step }) => {
    const { profileId } = event.data;
    const requestedAt =
      typeof event.data.requestedAt === 'string'
        ? event.data.requestedAt
        : null;
    const requestedAtDate = requestedAt ? new Date(requestedAt) : null;
    const requestedAtUpperBound =
      requestedAtDate != null && !Number.isNaN(requestedAtDate.getTime())
        ? new Date(requestedAtDate.getTime() + 1)
        : null;

    function currentConsentRequestWhere() {
      if (!requestedAtDate || !requestedAtUpperBound) return null;
      return and(
        eq(consentStates.profileId, profileId),
        eq(consentStates.consentType, 'GDPR'),
        gte(consentStates.requestedAt, requestedAtDate),
        lt(consentStates.requestedAt, requestedAtUpperBound),
      );
    }

    // [CUT-B2] v2 equivalent of currentConsentRequestWhere over consent_request.
    function currentConsentRequestWhereV2() {
      if (!requestedAtDate || !requestedAtUpperBound) return null;
      return and(
        eq(consentRequest.chargePersonId, profileId),
        eq(consentRequest.requestedBasis, 'gdpr_parental_consent'),
        gte(consentRequest.requestedAt, requestedAtDate),
        lt(consentRequest.requestedAt, requestedAtUpperBound),
      );
    }

    function isTerminalConsentStatus(status: string | null): boolean {
      return status === 'CONSENTED' || status === 'WITHDRAWN';
    }

    // [BUG-699] Build email options. Each reminder step passes a deterministic
    // idempotency key so Inngest step retries cannot deliver the same reminder
    // twice — Resend dedupes calls with matching `Idempotency-Key` within 24h.
    // The key is bound to the Inngest run id so a *new* consent.requested
    // event (e.g. re-requesting consent for the same profile after the
    // workflow concluded) will produce a fresh key and send a fresh email.
    const emailOpts = (stepId: string): EmailOptions => ({
      resendApiKey: getStepResendApiKey(),
      emailFrom: getStepEmailFrom(),
      idempotencyKey: buildEmailIdempotencyKey(
        'consent-reminder',
        profileId,
        event.id ?? 'no-event',
        stepId,
      ),
    });

    /** Look up parentEmail and consentToken from the DB (never from event payload — PII). */
    async function lookupConsentDetails(): Promise<{
      parentEmail: string | null;
      consentToken: string | null;
    }> {
      const db = getStepDatabase();
      if (isIdentityV2EnabledInStep()) {
        const where = currentConsentRequestWhereV2();
        if (!where) return { parentEmail: null, consentToken: null };
        const row = await db.query.consentRequest.findFirst({
          where,
          columns: { guardianEmail: true, token: true },
        });
        return {
          parentEmail: row?.guardianEmail ?? null,
          consentToken: row?.token ?? null,
        };
      }
      const where = currentConsentRequestWhere();
      if (!where) {
        return { parentEmail: null, consentToken: null };
      }
      const row = await db.query.consentStates.findFirst({
        where,
        columns: { parentEmail: true, consentToken: true },
      });
      return {
        parentEmail: row?.parentEmail ?? null,
        consentToken: row?.consentToken ?? null,
      };
    }

    async function getCurrentConsentRequestStatus(): Promise<string | null> {
      const db = getStepDatabase();
      if (isIdentityV2EnabledInStep()) {
        // v2: reduce the GDPR (charge, purpose, org, basis) to the 4-value
        // status via the basis-explicit resolver. The reminder workflow is
        // GDPR-pinned, so a basis-blind read is wrong here.
        const organizationId = await resolveOrgIdForPerson(db, profileId);
        if (!organizationId) return null;
        return resolveConsentStatus(
          db,
          profileId,
          organizationId,
          'platform_use',
          'gdpr_parental_consent',
        );
      }
      const where = currentConsentRequestWhere();
      if (!where) return null;
      const row = await db.query.consentStates.findFirst({
        where,
        columns: { status: true },
      });
      return row?.status ?? null;
    }

    async function refreshCurrentConsentToken(): Promise<{
      parentEmail: string;
      freshToken: string;
    } | null> {
      if (!requestedAtDate || !requestedAtUpperBound) return null;
      const db = getStepDatabase();
      if (isIdentityV2EnabledInStep()) {
        const organizationId = await resolveOrgIdForPerson(db, profileId);
        if (!organizationId) return null;
        const res: RefreshedConsentTokenForRequestV2 | null =
          await refreshConsentTokenForRequestV2(db, {
            chargePersonId: profileId,
            organizationId,
            requestedAt: requestedAtDate,
            requestedAtUpperBound,
          });
        // Normalize the v2 {guardianEmail} shape to the closure's {parentEmail}.
        return res
          ? { parentEmail: res.guardianEmail, freshToken: res.freshToken }
          : null;
      }
      return refreshConsentTokenForRequest(db, {
        profileId,
        requestedAt: requestedAtDate,
        requestedAtUpperBound,
      });
    }

    /** Builds the direct consent page URL from a token. */
    function buildTokenUrl(token: string): string {
      return `${getStepAppUrl()}/v1/consent-page?token=${encodeURIComponent(token)}`;
    }

    // Day 7 reminder.
    // [DS-020] Mint the fresh token in its OWN step so Inngest memoizes it: the
    // original requestConsent token expires after 7 days (race-prone link), and
    // token refresh is non-idempotent (random token each call). If the mint
    // shared a step with sendEmail, a retry after a delivered email would mint a
    // new token, dead-linking the email the parent already received.
    await step.sleep('wait-7-days', '7d');
    const day7 = await step.run('refresh-day-7-token', async () => {
      const status = await getCurrentConsentRequestStatus();
      if (!status || isTerminalConsentStatus(status)) return null;
      // [WI-637] Memoize the freshly-minted token ONLY. Inngest persists a
      // step's return value in its third-party state store; the parent email
      // must not ride along, so it is re-read in the send step below
      // (lookupConsentDetails) instead of being returned here. The mint stays
      // its own step so it survives replay (DS-020).
      const refreshed = await refreshCurrentConsentToken();
      return refreshed ? { freshToken: refreshed.freshToken } : null;
    });
    if (day7) {
      await step.run('send-day-7-reminder', async () => {
        const { parentEmail } = await lookupConsentDetails();
        if (!parentEmail) return;
        await sendEmail(
          formatConsentReminderEmail(
            parentEmail,
            'your child',
            23,
            buildTokenUrl(day7.freshToken),
          ),
          emailOpts('day-7'),
        );
      });
    }

    // Day 14 reminder. Same memoized-mint pattern as day-7 (see note above):
    // without the fresh token the day-14 link is always expired (day-0 token
    // had a 7-day TTL), and the mint must be its own step to survive retries.
    await step.sleep('wait-7-more-days', '7d');
    const day14 = await step.run('refresh-day-14-token', async () => {
      const status = await getCurrentConsentRequestStatus();
      if (!status || isTerminalConsentStatus(status)) return null;
      // [WI-637] Token-only memoized return; parent email re-read in the send
      // step (see day-7 note).
      const refreshed = await refreshCurrentConsentToken();
      return refreshed ? { freshToken: refreshed.freshToken } : null;
    });
    if (day14) {
      await step.run('send-day-14-reminder', async () => {
        const { parentEmail } = await lookupConsentDetails();
        if (!parentEmail) return;
        await sendEmail(
          formatConsentReminderEmail(
            parentEmail,
            'your child',
            16,
            buildTokenUrl(day14.freshToken),
          ),
          emailOpts('day-14'),
        );
      });
    }

    // Day 25 final warning
    await step.sleep('wait-11-more-days', '11d');
    await step.run('send-day-25-warning', async () => {
      const status = await getCurrentConsentRequestStatus();
      if (!status || isTerminalConsentStatus(status)) return;
      const { parentEmail } = await lookupConsentDetails();
      if (!parentEmail) return;
      await sendEmail(
        {
          to: parentEmail,
          subject:
            "Final warning: your child's MentoMate account will be removed",
          body: `Without your consent, your child's account and data will be automatically removed in 5 days.`,
          type: 'consent_warning',
        },
        emailOpts('day-25-final'),
      );
    });

    // Day 30 auto-delete — GDPR requires deletion if consent not granted.
    // [SUG-4] Intentionally NO reminder email at this step. The Day-25
    // "final warning" above has already told the parent the account will
    // be removed in 5 days; sending another email at the moment of
    // deletion would be both redundant and unnecessarily distressing. The
    // last actionable notice is at Day-25; Day-30 is the cutoff itself.
    await step.sleep('wait-5-more-days', '5d');
    await step.run('auto-delete-account', async () => {
      const db = getStepDatabase();
      // Fast guard: bail out if this GDPR request was already granted/withdrawn.
      const status = await getCurrentConsentRequestStatus();
      if (!status || isTerminalConsentStatus(status)) return;
      if (!requestedAt) return;
      // CI-11: Use service function instead of raw SQL.
      // Atomic delete — only deletes if no CONSENTED/WITHDRAWN consent exists.
      // This eliminates the TOCTOU race where a parent approves consent between
      // the status check above and the delete below.
      // FK cascades remove all child records (subjects, sessions, consent_states, etc.).
      if (isIdentityV2EnabledInStep()) {
        // [CUT-B2] v2: re-home any grants, then delete the person (the §6.1
        // pattern at single-person granularity). Same no-consent guard AND the
        // same request-generation guard as legacy: thread requestedAtDate so a
        // stale day-30 run cannot delete a child who started a newer consent
        // cycle (the legacy deleteProfileIfNoConsent(requestedAt) semantics).
        if (!requestedAtDate || Number.isNaN(requestedAtDate.getTime())) return;
        await deletePersonIfNoConsentV2(db, profileId, requestedAtDate);
      } else {
        await deleteProfileIfNoConsent(db, profileId, new Date(requestedAt));
      }
    });
  },
);
