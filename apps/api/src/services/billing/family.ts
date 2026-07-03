// ---------------------------------------------------------------------------
// Billing — Family billing (Story 5.5)
//
// [WI-1239 / 779-strip] listFamilyMembers, getUsageBreakdownForProfile,
// addProfileToSubscription, removeProfileFromSubscription,
// downgradeAllFamilyProfiles, and getFamilyPoolStatus were removed — every
// caller was dead; `routes/billing.ts` uses the `-V2` twins
// (billing-v2/family-v2.ts, billing-v2/family-usage-v2.ts) exclusively.
//
// getSubscriptionForProfile, getProfileCountForSubscription, and
// canAddProfile are KEPT — they are still transitively reachable from
// services/profile.ts's createProfileWithLimitCheck (out of WI-1239's
// scope; dead in production, routes use createChildProfileV2). Live v2
// equivalent: canAddProfileV2 in billing-v2/family-v2.ts.
//
// Kept — neutral, no legacy-table dependency, still live:
//   - addToByokWaitlist: writes byokWaitlist, an unrelated global waitlist
//     table (not one of the 5 identity tables), used by routes/billing.ts.
//   - getUsageEventsAvailableSince / buildUsageDateLabels / formatDateLabel:
//     pure date-formatting helpers, used by routes/billing.ts.
//   - UsageBreakdown: shared type, imported by family-usage-v2.ts.
//   - ProfileRemovalNotImplementedError: routes/billing.ts still checks
//     `instanceof` this class alongside its V2 twin (belt-and-braces from
//     the now-dead legacy removeProfileFromSubscription); kept so that
//     check keeps compiling without touching the out-of-scope route file.
// ---------------------------------------------------------------------------

import { byokWaitlist, type Database } from '@eduagent/database';

import { createLogger } from '../logger';
import { captureException } from '../sentry';

const logger = createLogger();

export type { FamilyMember } from '@eduagent/schemas';

/**
 * Adds an email to the BYOK (Bring Your Own Key) waitlist.
 * Uses ON CONFLICT DO NOTHING for idempotency.
 */
export async function addToByokWaitlist(
  db: Database,
  email: string,
): Promise<void> {
  await db
    .insert(byokWaitlist)
    .values({ email })
    .onConflictDoNothing({ target: byokWaitlist.email });
}

// ---------------------------------------------------------------------------
// removeProfileFromSubscription — error class (function itself removed)
// ---------------------------------------------------------------------------

export class ProfileRemovalNotImplementedError extends Error {
  constructor() {
    super(
      'Profile removal requires an invite/claim flow that is not yet implemented',
    );
    this.name = 'ProfileRemovalNotImplementedError';
  }
}

// ---------------------------------------------------------------------------
// Usage breakdown — shared type + date-label helpers
// ---------------------------------------------------------------------------

export interface UsageBreakdown {
  byProfile: Array<{
    profile_id: string;
    name: string;
    used: number;
    usedToday: number;
    is_self: boolean;
  }>;
  familyAggregate: { used: number; limit: number } | null;
  isOwnerBreakdownViewer: boolean;
  /**
   * Per-profile usage today for the active viewer's row. Used to scope
   * `usedToday` in the response so non-owner viewers cannot infer family
   * members' daily activity. `null` when the viewer is the owner (the raw
   * subscription-level aggregate is shown instead).
   */
  selfUsedToday: number | null;
  selfUsedThisMonth: number | null;
}

const USAGE_EVENTS_AVAILABLE_SINCE = '2026-05-06T00:00:00.000Z';

export function getUsageEventsAvailableSince(): string {
  return USAGE_EVENTS_AVAILABLE_SINCE;
}

function formatDateLabel(
  dateIso: string | null,
  timezone: string | null | undefined,
  locale = 'en-US',
): string | null {
  if (!dateIso) return null;
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return null;
  const timeZone = timezone ?? 'UTC';
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  } catch (err) {
    // [BUG-689] Invalid IANA timezone in billing data — `Intl.DateTimeFormat`
    // throws a RangeError for unrecognized zones. Falling back to UTC silently
    // hid bad subscription/profile timezone columns from observability, so
    // cycle dates rendered to the wrong day for affected users with no audit
    // trail. Emit a structured log so on-call can query "how many billing
    // renders fell back to UTC in 24h" — per AGENTS.md "Silent recovery
    // without escalation is banned" in billing code.
    logger.warn('[billing] invalid timezone fell back to UTC', {
      event: 'billing.format_date.timezone_fallback',
      requestedTimezone: timeZone,
      locale,
      error: err instanceof Error ? err.message : String(err),
    });
    // Sentry, not just console.warn, so the billing fallback rate is queryable.
    captureException(err, {
      extra: {
        context: 'billing.formatDateLabel.timezone_fallback',
        requestedTimezone: timeZone,
        locale,
      },
    });
    return new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  }
}

export function buildUsageDateLabels(input: {
  resetsAt: string;
  renewsAt: string | null;
  timezone?: string | null;
  locale?: string | null;
}): {
  resetsAt: string;
  renewsAt: string | null;
  resetsAtLabel: string;
  renewsAtLabel: string | null;
} {
  return {
    resetsAt: input.resetsAt,
    renewsAt: input.renewsAt,
    resetsAtLabel:
      formatDateLabel(
        input.resetsAt,
        input.timezone,
        input.locale ?? undefined,
      ) ?? '',
    renewsAtLabel: formatDateLabel(
      input.renewsAt,
      input.timezone,
      input.locale ?? undefined,
    ),
  };
}
