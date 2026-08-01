/**
 * Integration: WI-2952 AC-6 — caller provenance threaded into `applyAnalysis`
 * proven end-to-end against a real database.
 *
 * WHY INTEGRATION, NOT UNIT: two prior unit-level attempts at this evidence
 * failed to discriminate the regression this Work Item fixes. A
 * `expect(txMock).toHaveBeenCalled()` assertion fires whether or not the
 * gate blanked the projection, and a hand-built tx stub cannot reach the real
 * write. Only a real transaction against a real `learning_profiles` row can
 * prove the GUARANTEED PROPERTY: was the learner's own text actually
 * persisted, or actually blanked.
 *
 * WHAT THIS PROVES (WI-2952 AC-6, both operator example strings):
 *   - `applyAnalysis(..., { provenance: 'user' })` on a learner's own
 *     self-disclosure ("ADHD can affect executive function.",
 *     "I'm learning about autism.") reaches the persisted `interests` column
 *     — the fix this item exists for.
 *   - `applyAnalysis(..., { provenance: 'llm', producerVendor: '' })` — the
 *     default an old/stubbed caller still produces — fails CLOSED on the
 *     identical strings: nothing is persisted.
 *
 * External boundaries mocked:
 * - The independent learning-text-safety JUDGE (`judgeReferredLearningText`
 *   → `routeAndCall`), via `registerProvider` — the codebase idiom for the
 *   one true external boundary an LLM-backed judge crosses (see
 *   `judge-suitability.integration.test.ts`). Both operator strings contain a
 *   protected lexeme ("ADHD"/"autism") with no person-attribution grammar, so
 *   the deterministic scanner classifies them `ambiguous` and the `user`
 *   provenance case is REFERRED to this judge (`scan.ts`'s fail-closed
 *   matrix). The mock is not internal: it stubs the real provider registry
 *   `routeAndCall` dispatches through, exactly as production code does for a
 *   real vendor.
 * - Nothing else. `applyAnalysis`, the gate, the scanner and the DB write are
 *   all real.
 *
 * Judge unreachable would NOT discriminate: an unmocked `routeAndCall` throws
 * in this environment (no network egress, no provider registered), which
 * `judge.ts` maps to the SAME fail-closed `block` outcome as the
 * llm-blank-vendor case. Without registering a provider that returns
 * `allow`/`educational_reference`, both branches would block and the test
 * would be vacuous — which is why the mock exists and why its absence is
 * flagged rather than silently worked around.
 */

import { eq } from 'drizzle-orm';
import { generateUUIDv7, learningProfiles } from '@eduagent/database';

import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../../apps/api/src/test-utils/legacy-identity-anchors';
import { applyAnalysis } from '../../apps/api/src/services/learner-profile';
import type { SessionAnalysisOutput } from '@eduagent/schemas';
import { createIntegrationDb } from './helpers';
import { registerProvider } from '../../apps/api/src/services/llm';
import { createMockProvider } from '../../apps/api/src/services/llm/test-utils';

const db = createIntegrationDb();
const accountIds: string[] = [];
const profileIds: string[] = [];

// ---------------------------------------------------------------------------
// Judge provider — the learning-text-safety judge (judge.ts) resolves a
// vendor via `resolveGraderConfig`, which never picks Gemini (ADR-0016
// §2/§10.1). Register both non-Gemini vendors, mirroring
// judge-suitability.integration.test.ts, so the referred-scan round trip
// resolves regardless of which one grader routing selects.
// ---------------------------------------------------------------------------

const JUDGE_ALLOW_VERDICT = JSON.stringify({
  verdict: 'allow',
  reason: 'educational_reference',
});

function registerAllowingJudgeProvider(): void {
  for (const vendor of ['anthropic', 'openai'] as const) {
    registerProvider({
      ...createMockProvider(vendor),
      async chat() {
        return { content: JUDGE_ALLOW_VERDICT, stopReason: 'stop' as const };
      },
    });
  }
}

async function seedProfile(label: string): Promise<string> {
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  accountIds.push(accountId);
  profileIds.push(profileId);
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId,
    clerkUserId: `wi-2952-ac6-${label}-${profileId}`,
    email: `wi-2952-ac6-${label}-${profileId}@test.invalid`,
    displayName: `WI-2952 AC-6 ${label}`,
    birthYear: 2010,
    isOwner: true,
    seedBaselineSubscription: false,
  });

  // `applyAnalysis` no-ops (writes nothing, returns fieldsUpdated: []) unless
  // the learning_profiles row already has memory consent GRANTED and
  // collection ENABLED — both default otherwise ('pending' / false per
  // packages/database/src/schema/learning-profiles.ts). Insert the row
  // directly with those flags set; `getOrCreateLearningProfileTx` inside
  // applyAnalysis then finds it rather than creating a fresh pending one.
  await db.insert(learningProfiles).values({
    profileId,
    memoryConsentStatus: 'granted',
    memoryCollectionEnabled: true,
  });

  return profileId;
}

async function readInterests(profileId: string): Promise<string[]> {
  const [row] = await db
    .select({ interests: learningProfiles.interests })
    .from(learningProfiles)
    .where(eq(learningProfiles.profileId, profileId));
  return ((row?.interests as string[] | null) ?? []) as string[];
}

function analysisWithInterest(text: string): SessionAnalysisOutput {
  return {
    explanationEffectiveness: null,
    interests: [text],
    strengths: null,
    struggles: null,
    resolvedTopics: null,
    communicationNotes: null,
    engagementLevel: null,
    confidence: 'high',
  };
}

beforeAll(() => registerAllowingJudgeProvider());

describe('WI-2952 AC-6 — applyAnalysis caller provenance, real database', () => {
  afterAll(async () => {
    await deleteV2IdentitiesForTest(db, { accountIds, profileIds });
  });

  it.each([
    ['ADHD can affect executive function.'],
    ["I'm learning about autism."],
  ])(
    'persists the learner\'s own self-disclosure (%s) under provenance "user", and fails closed under the llm-blank-vendor default',
    async (operatorString) => {
      // --- provenance: 'user' — the learner's own typed words. The scanner
      // finds a protected lexeme with no person-attribution grammar
      // (classification: ambiguous) and REFERS it to the judge, which this
      // suite's mock allows as educational_reference. The text must survive
      // to the persisted `interests` column.
      const userProfileId = await seedProfile('user');
      await applyAnalysis(
        db,
        userProfileId,
        analysisWithInterest(operatorString),
        null,
        'inferred',
        undefined,
        { provenance: 'user' },
      );
      expect(await readInterests(userProfileId)).toContain(operatorString);

      // --- provenance: 'llm' + blank producerVendor — the pre-WI-2952
      // default an old/stubbed caller still produces. `scanLearningText`
      // resolves this straight to `block`/`unclear` WITHOUT ever reaching the
      // judge (scan.ts's resolveReferralPayload returns null for a blank
      // vendor), so the identical string must NOT be persisted.
      const llmProfileId = await seedProfile('llm-blank-vendor');
      await applyAnalysis(
        db,
        llmProfileId,
        analysisWithInterest(operatorString),
        null,
        'inferred',
        undefined,
        { provenance: 'llm', producerVendor: '' },
      );
      expect(await readInterests(llmProfileId)).not.toContain(operatorString);
    },
  );
});
