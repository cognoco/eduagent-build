// @inngest-admin: cross-profile
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { createLogger } from '../../services/logger';
import {
  remediateMentorNotices,
  remediateNeedsDeepening,
  remediateTopicNotes,
} from '../../services/learning-text-safety/persisted-remediation-apply';
import { remediateLearnerProfileFreeText } from '../../services/learning-text-safety/persisted-remediation-profile';
import {
  remediateMemoryFacts,
  remediateTopicNoteArtifactConceptKeys,
} from '../../services/learning-text-safety/persisted-remediation-memory';

const logger = createLogger();

/**
 * [WI-2753] Remediate learning text that the English-only safety gate let reach
 * the database before WI-2628 made it multilingual.
 *
 * SINGLE-FLIGHT. Two concurrent runs would classify the same rows and issue
 * overlapping scrubs; the writes are idempotent so the result would still be
 * correct, but the duplicated scan is pure waste. Matches the
 * `memory-facts-backfill` / `filing-stranded-backfill` pattern.
 *
 * NO CURSOR, DELIBERATELY. The sibling backfills page because they fan out one
 * step per profile slice and would exceed Inngest's per-run step ceiling. This
 * one issues a bounded number of queries per surface and does no LLM work at
 * all — migration provenance never reaches the judge — so a run is a handful of
 * statements rather than thousands of steps. If the corpus later grows past
 * what one run can classify in memory, add the same composite cursor those two
 * use; that is a size problem, not a design one.
 */
export const persistedLearningTextRemediation = inngest.createFunction(
  {
    id: 'persisted-learning-text-remediation',
    concurrency: {
      key: '"persisted-learning-text-remediation"',
      limit: 1,
    },
  },
  { event: 'admin/persisted-learning-text-remediation.requested' },
  async ({ step }) => {
    const db = getStepDatabase();

    // ONE STEP PER SURFACE, not one step for all of them. The surfaces are
    // independent reads and writes with no transaction spanning them, so a
    // single wrapping step that threw partway would replay the surfaces that had
    // already committed — and their counts would come back zero the second time
    // (the rows are scrubbed, so nothing is left to remediate), silently
    // under-reporting what the run actually did. Per-surface steps let Inngest
    // memoize each completed surface's real counts and retry only the one that
    // failed. Re-running a surface is still safe on its own terms; this is about
    // not losing the numbers.
    const reports = [
      ...(await step.run('remediate-mentor-notices', async () =>
        remediateMentorNotices(db),
      )),
      await step.run('remediate-topic-notes', async () =>
        remediateTopicNotes(db),
      ),
      await step.run('remediate-topic-note-artifact-concept-keys', async () =>
        remediateTopicNoteArtifactConceptKeys(db),
      ),
      await step.run('remediate-needs-deepening', async () =>
        remediateNeedsDeepening(db),
      ),
      ...(await step.run('remediate-learner-profile-free-text', async () =>
        remediateLearnerProfileFreeText(db),
      )),
      ...(await step.run('remediate-memory-facts', async () =>
        remediateMemoryFacts(db),
      )),
    ];

    // Observability records surface, counts and nothing else — never the text,
    // and never a row id alongside it. `review` is logged at warn because it is
    // the queue a human still has to look at: rows the gate blocked as ambiguous,
    // which this job deliberately leaves untouched.
    for (const report of reports) {
      logger.info('[WI-2753] persisted learning text remediated', {
        flow: 'remediation.persisted_learning_text',
        surface: report.surface,
        scanned: report.scanned,
        remediated: report.remediated,
        skippedChanged: report.skippedChanged,
      });
      if (report.review > 0) {
        logger.warn('[WI-2753] rows require human review, not remediated', {
          flow: 'remediation.persisted_learning_text',
          surface: report.surface,
          review: report.review,
        });
      }
    }

    return {
      surfaces: reports,
      totalRemediated: reports.reduce(
        (sum, report) => sum + report.remediated,
        0,
      ),
      totalReview: reports.reduce((sum, report) => sum + report.review, 0),
    };
  },
);
