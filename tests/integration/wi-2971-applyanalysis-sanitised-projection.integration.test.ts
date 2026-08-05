/**
 * Integration: WI-2971 — the SANITISED PROJECTION `applyAnalysis` persists,
 * observed end to end against a real database.
 *
 * WHAT THIS COVERS THAT NOTHING ELSE DID
 * --------------------------------------
 * `sanitizeAnalysisProfileProjection` (apps/api/src/services/learner-profile.ts)
 * is not a single yes/no gate on the write. It is a per-entry filter over six
 * field families, and the write applies it as an OVERRIDE on top of the merged
 * updates:
 *
 *   tx.update(learningProfiles).set({ ...updates, ...safeProjection, ... })
 *
 * So every family has its own way to be silently un-sanitised. The nested
 * `strengths[].topics` filter, the `struggles` two-field predicate, the
 * `communicationNotes` filter and the `interestTimestamps` key pruning are each
 * independently removable, and removing any ONE of them leaves
 * `wi-2952-analysis-provenance.integration.test.ts` fully green — that suite
 * writes a single-element `interests` array and asserts presence/absence of one
 * string, so it cannot see the other five families at all.
 *
 * This suite therefore drives ONE `applyAnalysis` call carrying a MIXED
 * safe+unsafe payload and asserts, per family, that the persisted row holds the
 * safe entry and NOT the unsafe one. The unit of evidence is "the projection
 * that landed is the sanitised projection", not "some text was dropped".
 *
 * SCOPE — all SIX families the sanitiser filters, stated rather than implied.
 * The first describe covers five from one mixed payload: `interests`,
 * `interestTimestamps`, `strengths[].topics`, `struggles` and
 * `communicationNotes`. The sixth, `recentlyResolvedTopics`, has its own
 * describe at the foot of this file because it needs a different fixture shape
 * — it is not a direct analysis field, so it is reached through a pre-seeded
 * struggle that this run's `resolvedTopics` resolves.
 *
 * WHY INTEGRATION, NOT UNIT
 * -------------------------
 * Two unit-level attempts on this evidence failed to discriminate. An
 * `expect(txMock).toHaveBeenCalled()` assertion fires whether or not the gate
 * blanked the projection (measured: 275/275 still green under mutation), and a
 * hand-built transaction stub does not satisfy enough of the real transaction
 * body to reach the write at all. Only a real transaction writing a real
 * `learning_profiles` row, read back afterwards, observes what was persisted.
 *
 * NO MOCKS AT ALL — deliberately
 * ------------------------------
 * Every string here has a DETERMINISTIC verdict from `scanLearningText`, so no
 * judge, no provider registry and no `jest.mock` is involved (GC1/PRIN-12):
 *
 *   - unsafe: person-attributed clinical claims ("The learner has ADHD.") return
 *     `classification: 'block'`, `disposition: 'block'`,
 *     `reason: 'person_attribution'`. Attribution is decided BEFORE the
 *     fail-closed provenance matrix in `scan.ts`, so these block under every
 *     provenance — which is why this suite can use the `applyAnalysis` default
 *     author and still be deterministic.
 *   - safe: plain curriculum text carrying no protected lexeme and no
 *     attribution returns `classification: 'clear'`, `disposition: 'clear'`,
 *     never reaching the judge.
 *
 * That is the strongest available position: the sibling WI-2952 suite must
 * register a provider because its operator strings are `ambiguous → refer`;
 * this one needs nothing external, so a green run cannot be an artefact of a
 * stub.
 */

import { eq } from 'drizzle-orm';
import { generateUUIDv7, learningProfiles } from '@eduagent/database';
import type { FocusAreaEntry, StrengthEntry } from '@eduagent/schemas';
import type { SessionAnalysisOutput } from '@eduagent/schemas';

import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../../apps/api/src/test-utils/legacy-identity-anchors';
import {
  applyAnalysis,
  normalizeMemoryValue,
} from '../../apps/api/src/services/learner-profile';
import { createIntegrationDb } from './helpers';

const db = createIntegrationDb();
const accountIds: string[] = [];
const profileIds: string[] = [];

// ---------------------------------------------------------------------------
// Fixture text. Verdicts are deterministic (see the header) — each unsafe
// string is a person-attributed clinical claim, each safe string is ordinary
// curriculum prose. Distinct unsafe strings per family so a failure names the
// family that regressed rather than "something leaked".
// ---------------------------------------------------------------------------

const UNSAFE_INTEREST = 'The learner has ADHD.';
const UNSAFE_STRENGTH_TOPIC = 'The learner has dyslexia.';
const UNSAFE_STRUGGLE_TOPIC = 'The learner has autism.';
const UNSAFE_NOTE = 'The learner has ADHD.';

const SAFE_INTEREST = 'Photosynthesis';
const SAFE_STRENGTH_TOPIC = 'Long division with remainders';
const SAFE_STRUGGLE_TOPIC = 'Fractions';
const SAFE_NOTE = 'Prefers worked examples before practice.';
const SUBJECT = 'Mathematics';

type PersistedProjection = {
  interests: string[];
  interestTimestamps: Record<string, string>;
  strengths: StrengthEntry[];
  struggles: FocusAreaEntry[];
  communicationNotes: string[];
};

async function seedProfile(
  label: string,
  seedStruggles: FocusAreaEntry[] = [],
): Promise<string> {
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  accountIds.push(accountId);
  profileIds.push(profileId);
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId,
    clerkUserId: `wi-2971-${label}-${profileId}`,
    email: `wi-2971-${label}-${profileId}@test.invalid`,
    displayName: `WI-2971 ${label}`,
    birthYear: 2010,
    isOwner: true,
    seedBaselineSubscription: false,
  });

  // `applyAnalysis` no-ops (writes nothing, returns fieldsUpdated: []) unless
  // the learning_profiles row already has memory consent GRANTED and collection
  // ENABLED — both default otherwise ('pending' / false, per
  // packages/database/src/schema/learning-profiles.ts). Insert the row directly
  // with those flags set; `getOrCreateLearningProfileTx` inside applyAnalysis
  // then finds it rather than creating a fresh pending one.
  await db.insert(learningProfiles).values({
    profileId,
    memoryConsentStatus: 'granted',
    memoryCollectionEnabled: true,
    ...(seedStruggles.length > 0 ? { struggles: seedStruggles } : {}),
  });

  return profileId;
}

// PRIN-03: single scoped table, `profileId` pinned in the WHERE — the sanctioned
// `db.select()` alternative for a read the scoped-repository API cannot express
// (this suite needs the raw persisted JSONB, not a domain projection).
async function readProjection(profileId: string): Promise<PersistedProjection> {
  const [row] = await db
    .select({
      interests: learningProfiles.interests,
      interestTimestamps: learningProfiles.interestTimestamps,
      strengths: learningProfiles.strengths,
      struggles: learningProfiles.struggles,
      communicationNotes: learningProfiles.communicationNotes,
    })
    .from(learningProfiles)
    .where(eq(learningProfiles.profileId, profileId));

  return {
    interests: (row?.interests as string[] | null) ?? [],
    interestTimestamps:
      (row?.interestTimestamps as Record<string, string> | null) ?? {},
    strengths: (row?.strengths as StrengthEntry[] | null) ?? [],
    struggles: (row?.struggles as FocusAreaEntry[] | null) ?? [],
    communicationNotes: (row?.communicationNotes as string[] | null) ?? [],
  };
}

/**
 * One analysis carrying a safe AND an unsafe entry in each of the five families
 * this suite covers (see SCOPE in the header — `recentlyResolvedTopics` is the
 * sixth and is not among them; `resolvedTopics` is left null here deliberately).
 * Both strengths signals share a subject so they merge into ONE strength entry
 * with two topics — which is what puts the nested `strengths[].topics` filter
 * under test rather than the outer per-entry filter.
 */
function mixedAnalysis(): SessionAnalysisOutput {
  return {
    explanationEffectiveness: null,
    interests: [SAFE_INTEREST, UNSAFE_INTEREST],
    strengths: [
      { topic: SAFE_STRENGTH_TOPIC, subject: SUBJECT },
      { topic: UNSAFE_STRENGTH_TOPIC, subject: SUBJECT },
    ],
    struggles: [
      { topic: SAFE_STRUGGLE_TOPIC, subject: SUBJECT },
      { topic: UNSAFE_STRUGGLE_TOPIC, subject: SUBJECT },
    ],
    resolvedTopics: null,
    communicationNotes: [SAFE_NOTE, UNSAFE_NOTE],
    engagementLevel: null,
    confidence: 'high',
  };
}

describe('WI-2971 — applyAnalysis persists the SANITISED projection, real database', () => {
  // A single write, then one read-back that every family-level expectation
  // shares. Splitting the families across separate `applyAnalysis` calls would
  // let a family pass because a LATER call rewrote the column; asserting them
  // all against one persisted row cannot.
  let persisted: PersistedProjection;

  beforeAll(async () => {
    const profileId = await seedProfile('mixed');
    const result = await applyAnalysis(db, profileId, mixedAnalysis(), SUBJECT);

    // Guard against the vacuous pass: if the consent gate, the low-confidence
    // short-circuit or a gate coverage miss had turned the call into a no-op,
    // every `not.toContain` below would pass on an empty row and the suite
    // would assert nothing. Requiring the write to have actually touched these
    // columns is what makes the negative assertions load-bearing.
    expect(result.fieldsUpdated).toEqual(
      expect.arrayContaining([
        'interests',
        'strengths',
        'struggles',
        'communicationNotes',
      ]),
    );

    persisted = await readProjection(profileId);
  });

  it('persists the safe interest and drops the person-attributed one', () => {
    expect(persisted.interests).toContain(SAFE_INTEREST);
    expect(persisted.interests).not.toContain(UNSAFE_INTEREST);
  });

  it('prunes interestTimestamps to the surviving interests', () => {
    // The sanitiser rebuilds this map from the FILTERED interests, keyed by
    // `normalizeMemoryValue`. A dropped interest that keeps its timestamp key is
    // a live leak of the learner text through a JSONB object key.
    const keys = Object.keys(persisted.interestTimestamps).map(
      normalizeMemoryValue,
    );
    expect(keys).not.toContain(normalizeMemoryValue(UNSAFE_INTEREST));
  });

  it('filters the NESTED strengths[].topics, keeping the entry itself', () => {
    // The family `wi-2952-analysis-provenance.integration.test.ts` cannot
    // observe: both topics hang off one safe subject, so the outer per-entry
    // filter keeps the entry and only the inner `topics` filter can drop the
    // unsafe topic.
    const entry = persisted.strengths.find((s) => s.subject === SUBJECT);
    expect(entry).toBeDefined();
    expect(entry?.topics).toContain(SAFE_STRENGTH_TOPIC);
    expect(entry?.topics).not.toContain(UNSAFE_STRENGTH_TOPIC);
  });

  it('filters struggles by topic', () => {
    const topics = persisted.struggles.map((s) => s.topic);
    expect(topics).toContain(SAFE_STRUGGLE_TOPIC);
    expect(topics).not.toContain(UNSAFE_STRUGGLE_TOPIC);
  });

  it('filters communicationNotes', () => {
    expect(persisted.communicationNotes).toContain(SAFE_NOTE);
    expect(persisted.communicationNotes).not.toContain(UNSAFE_NOTE);
  });
});

// ---------------------------------------------------------------------------
// The sixth family. Separated because it needs a different fixture shape:
// `recentlyResolvedTopics` is not a direct analysis field. `applyAnalysis`
// OVERWRITES it from the `struggle_resolved` notifications each run, and a
// notification only fires for a struggle that was ALREADY on the row and is
// named by this run's `resolvedTopics`. So the unsafe label arrives on the
// persisted column by a different route from every case above: it is derived
// from the raw merged state, never supplied as analysis text.
// ---------------------------------------------------------------------------

const SAFE_RESOLVED_TOPIC = 'Fractions';
const UNSAFE_RESOLVED_TOPIC = 'The learner has autism.';

function seededStruggle(topic: string): FocusAreaEntry {
  return {
    subject: SUBJECT,
    topic,
    lastSeen: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    attempts: 2,
    confidence: 'high',
  };
}

describe('WI-2971 — applyAnalysis sanitises recentlyResolvedTopics too', () => {
  let resolvedTopics: Array<{ topic: string; subject: string | null }>;

  beforeAll(async () => {
    // Both struggles pre-exist on the row, so resolving both produces two
    // `struggle_resolved` notifications and `updates.recentlyResolvedTopics`
    // carries BOTH labels into the write. Only the projection sanitiser stands
    // between the unsafe label and the persisted column.
    const profileId = await seedProfile('resolved', [
      seededStruggle(SAFE_RESOLVED_TOPIC),
      seededStruggle(UNSAFE_RESOLVED_TOPIC),
    ]);

    const result = await applyAnalysis(
      db,
      profileId,
      {
        explanationEffectiveness: null,
        interests: null,
        strengths: null,
        struggles: null,
        resolvedTopics: [
          { topic: SAFE_RESOLVED_TOPIC, subject: SUBJECT },
          { topic: UNSAFE_RESOLVED_TOPIC, subject: SUBJECT },
        ],
        communicationNotes: null,
        engagementLevel: null,
        confidence: 'high',
      },
      SUBJECT,
    );

    // Same anti-vacuity guard as above: the resolution must actually have
    // happened, or the assertions below pass on an empty column.
    expect(result.fieldsUpdated).toContain('struggles');

    const [row] = await db
      .select({
        recentlyResolvedTopics: learningProfiles.recentlyResolvedTopics,
      })
      .from(learningProfiles)
      .where(eq(learningProfiles.profileId, profileId));

    resolvedTopics =
      (row?.recentlyResolvedTopics as Array<{
        topic: string;
        subject: string | null;
      }> | null) ?? [];
  });

  it('keeps the safe resolved topic and drops the person-attributed one', () => {
    const topics = resolvedTopics.map((entry) => entry.topic);
    expect(topics).toContain(SAFE_RESOLVED_TOPIC);
    expect(topics).not.toContain(UNSAFE_RESOLVED_TOPIC);
  });

  // Teardown for BOTH describes, and it has to live here rather than at file
  // scope. `tests/integration/setup.ts` registers a file-scope `afterAll` that
  // ends the pg pool (setup.ts:85), and because setupFilesAfterEach runs first
  // its hook is registered first and therefore runs first — a file-scope
  // cleanup here would fire against a closed pool and fail the suite. A
  // describe-scoped hook runs before any file-scope one, and this is the LAST
  // describe, so by now both blocks have pushed their ids into the shared
  // `accountIds` / `profileIds` and this tears down every one of them.
  afterAll(async () => {
    await deleteV2IdentitiesForTest(db, { accountIds, profileIds });
  });
});
