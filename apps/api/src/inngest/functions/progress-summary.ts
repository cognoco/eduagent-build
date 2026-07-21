// @inngest-admin: parent-chain (learningSessions and familyLinks queried with profileId enforced)
import { and, desc, eq } from 'drizzle-orm';
import { learningSessions, person } from '@eduagent/database';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { parseConversationLanguage } from '../../services/llm';
import { buildKnowledgeInventory } from '../../services/snapshot-aggregation';
import {
  deterministicProgressSummaryFallback,
  findLatestCompletedLearningSession,
  generateProgressSummary,
  upsertProgressSummary,
} from '../../services/progress-summary';
import { isLlmExchangeConsentAllowed } from '../../services/identity-v2/consent-status-v2';
import { getGuardianPersonIds } from '../../services/identity-v2/guardianship';
import { captureException } from '../../services/sentry';
import { NonRetriableError } from 'inngest';

export const progressSummaryGeneration = inngest.createFunction(
  {
    id: 'progress-summary-generation',
    name: 'Generate child progress summary after session',
    retries: 2,
    debounce: {
      // Debounce per profile. Inngest debounce keys are CEL expressions, not
      // mustache templates — a `{{ ... }}` here fails CEL compilation and blocks
      // the ENTIRE app sync (all functions), not just this one. The key is
      // already function-scoped, so no prefix is needed.
      key: 'event.data.profileId',
      period: '5m',
    },
  },
  { event: 'app/session.completed' },
  async ({ event, step }) => {
    // Validate that profileId and sessionId are non-empty strings before
    // any data access. The AC classifies progress-summary as a lower-risk
    // consumer (conservative if-guards protect against most bad values), so we
    // enforce only the minimum gate: profileId and sessionId must be strings.
    // Full schema validation lives in session-completed.ts (the primary consumer).
    // Using NonRetriableError here prevents retry loops on structurally invalid
    // events (e.g. missing ids) — the existing if-guard below handles falsy values
    // via a soft skip, which is the correct fallback for in-flight legacy events.
    if (
      typeof event.data.profileId !== 'string' ||
      typeof event.data.sessionId !== 'string'
    ) {
      throw new NonRetriableError(
        '[progress-summary] Invalid event payload: profileId and sessionId must be strings',
      );
    }

    const profileId = event.data.profileId;
    const sessionId = event.data.sessionId;
    if (!profileId || !sessionId) {
      return { status: 'skipped', reason: 'missing profileId or sessionId' };
    }

    // [CUT-B2] GDPR gate + parent-link + person reads dispatch by the flag.
    // [WI-2396] isLlmExchangeConsentAllowed also honors adult self-consent
    // (art6_1_a) withdrawal, not only the parental basis — both call sites
    // below gate the LLM-generated progress summary (generateProgressSummary).
    const gdprAllowed = (db: ReturnType<typeof getStepDatabase>) =>
      isLlmExchangeConsentAllowed(db, profileId);

    const context = await step.run('gather-context', async () => {
      const db = getStepDatabase();
      // Parent-link existence: v2 reads an active guardianship edge (any
      // guardian over this person), legacy reads family_links.
      const hasParent = (await getGuardianPersonIds(db, profileId)).length > 0;
      if (!hasParent) return null;

      // [WI-82] Re-check current GDPR consent at execution time. This job runs
      // outside the HTTP consent middleware; a queued event must not send learner
      // data to the LLM or persist derived data for a profile whose consent is
      // no longer granted.
      if (!(await gdprAllowed(db))) {
        return { status: 'consent-blocked' as const };
      }

      const profile = await db.query.person.findFirst({
        where: eq(person.id, profileId),
        columns: { displayName: true, conversationLanguage: true },
      });
      if (!profile) return null;

      let latestSession = await findLatestCompletedLearningSession(
        db,
        profileId,
      );
      if (!latestSession) {
        const rows = await db
          .select({
            id: learningSessions.id,
            startedAt: learningSessions.startedAt,
          })
          .from(learningSessions)
          .where(
            and(
              eq(learningSessions.id, sessionId),
              eq(learningSessions.profileId, profileId),
              eq(learningSessions.status, 'completed'),
            ),
          )
          .orderBy(desc(learningSessions.startedAt))
          .limit(1);
        latestSession = rows[0] ?? null;
      }
      if (!latestSession) return null;

      // Minor-PII discipline: this return value is memoized into Inngest's
      // third-party state store, so it carries opaque references only — the
      // child's name and knowledge inventory are rehydrated from the DB
      // inside the step that consumes them.
      return {
        status: 'ok' as const,
        latestSessionId: latestSession.id,
        latestSessionAt: latestSession.startedAt,
        // DB returns string | null; parse to union before passing to LLM call.
        conversationLanguage: parseConversationLanguage(
          profile.conversationLanguage,
        ),
      };
    });

    if (!context) {
      return { status: 'skipped', reason: 'not a linked child or no session' };
    }
    if (context.status === 'consent-blocked') {
      return { status: 'skipped', reason: 'consent_not_granted' };
    }
    // `context.status === 'ok'` — narrowed cleanly, no cast needed.
    const ctx = context;

    // Generation and persistence share one step: the generated summary is
    // parent-facing personal data about the minor (name + learning topics),
    // so it must never cross a step boundary into Inngest's memoized state.
    // The child name and knowledge inventory are rehydrated from the DB here
    // instead of riding the gather-context step return.
    const summaryResult = await step.run('generate-summary', async () => {
      // [WI-82] Re-check consent here too: gather-context's gate is memoized by
      // Inngest, so on a retry of this step a withdrawal after the first run
      // must still block the LLM call (cross-step memoization gap). Persisting
      // in the same step also closes the old generate→persist gap.
      const db = getStepDatabase();
      if (!(await gdprAllowed(db))) {
        return { status: 'skipped' as const, reason: 'consent_not_granted' };
      }
      const profile = await db.query.person.findFirst({
        where: eq(person.id, profileId),
        columns: { displayName: true },
      });
      if (!profile) {
        return { status: 'skipped' as const, reason: 'profile_missing' };
      }
      const inventory = await buildKnowledgeInventory(db, profileId);

      let summary: string;
      try {
        summary = await generateProgressSummary({
          childName: profile.displayName,
          latestSessionId: ctx.latestSessionId,
          inventory,
          latestSessionAt: new Date(ctx.latestSessionAt),
          conversationLanguage: ctx.conversationLanguage,
        });
      } catch (error) {
        captureException(error, {
          profileId,
          extra: {
            step: 'generate-progress-summary',
            surface: 'progress-summary-generation',
            sessionId,
          },
        });
        summary = deterministicProgressSummaryFallback(
          profile.displayName,
          new Date(ctx.latestSessionAt),
        );
      }

      // [WI-82] Re-check before persisting derived data — defense-in-depth
      // for a withdrawal that lands while the LLM call is in flight.
      if (!(await gdprAllowed(db))) {
        return { status: 'skipped' as const, reason: 'consent_not_granted' };
      }
      await upsertProgressSummary(db, {
        childProfileId: profileId,
        summary,
        basedOnLastSessionAt: new Date(ctx.latestSessionAt),
        latestSessionId: ctx.latestSessionId,
      });
      return { status: 'generated' as const };
    });

    if (summaryResult.status === 'skipped') {
      return { status: 'skipped', reason: summaryResult.reason };
    }

    return {
      status: 'generated',
      profileId,
      latestSessionId: ctx.latestSessionId,
    };
  },
);
