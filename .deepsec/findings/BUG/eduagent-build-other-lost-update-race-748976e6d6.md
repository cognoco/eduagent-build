# [BUG] updateInterestsContext bumps the optimistic-concurrency version but never checks it (non-CAS), allowing a lost update vs a concurrent interest merge

**File:** [`apps/api/src/services/onboarding/index.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/services/onboarding/index.ts#L156-L190) (lines 156, 187, 190)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** low  •  **Slug:** `other-lost-update-race`

## Owners

**Suggested assignee:** `vetinari@zaf.fleet` _(via last-committer)_

## Finding

updateInterestsContext() verifies ownership with a SELECT on profiles (L156-159), then performs a wholesale UPDATE of learningProfiles.interests with `version: sql`${learningProfiles.version} + 1`` and `WHERE eq(learningProfiles.profileId, profileId)` (L181-190). The version is INCREMENTED but never used as a guard in the WHERE clause, so this is not a true compare-and-swap. The inline comment states the bump 'mirrors the pattern used by applyAnalysis/mergeInterests' — those sibling writers do read-modify-write with a version check and will retry on a stale version. The asymmetry means: if a session-analysis merge (read interests@v5 → add items → write WHERE version=5) interleaves with this wholesale replace (write interests + version=v+1 with no version guard), the replace can clobber the merge's additions, and because it does not check version it will not retry. Impact is low: it is data loss of recently-merged interests, scoped to one profile, and the racing window (onboarding picker submit concurrent with session analysis) is unlikely since a user is typically either onboarding or in a session. It may also be intended 'picker is authoritative / wholesale replace' semantics. No security impact: ownership is verified and cross-account access is not possible. Flagging because it diverges from the sibling CAS pattern the comment claims to mirror, and the scanner flagged this region as a read-then-write race (the scanner's TOCTOU concern itself is NOT exploitable: a profile's accountId binding is immutable and an attacker has no write path to flip it between the SELECT and UPDATE).

## Recommendation

If lost-update protection is intended here, make the UPDATE a real compare-and-swap: capture the row's current version during the ownership read and add `AND eq(learningProfiles.version, expectedVersion)` to the WHERE clause, then detect 0 rows updated and retry (re-read + re-apply). If wholesale-replace-wins is the intended semantic, drop the misleading `version + 1` bump or add a comment clarifying that this writer is intentionally authoritative and does not participate in CAS, so future maintainers don't assume it does.

## Revalidation

**Verdict:** true-positive

Confirmed in current code: updateInterestsContext() issues UPDATE learningProfiles SET interests = safeInterests, version = version + 1 WHERE profileId = profileId, with no version equality predicate in the WHERE clause — so the version increment is decorative, not a compare-and-swap. The sibling writer applyAnalysis() in learner-profile.ts protects itself with pessimistic locking (SELECT ... FOR UPDATE inside a transaction via getOrCreateLearningProfileTx), and mergeInterests() is a pure in-memory function — so the inline comment claiming this bump 'mirrors the pattern used by applyAnalysis/mergeInterests' is factually misleading (neither sibling does optimistic CAS-with-retry as the comment implies). The concrete lost-update interleaving: applyAnalysis commits a merged interest set, then updateInterestsContext's lock-free bare UPDATE wholesale-replaces it with only the picker's selection and never retries, discarding the merged additions; the reverse ordering is benign, making the data loss order-dependent. Impact is genuinely low (BUG): the interest picker is a one-time onboarding action unlikely to coincide with a post-session analysis Inngest job, and loss is scoped to one profile's recently-merged interests. The secondary TOCTOU/security angle is NOT a vulnerability — ownership is verified against the profiles table and a profile's accountId binding is immutable with no attacker write path to flip it between the SELECT and UPDATE. The data-integrity bug is real as described; severity BUG is appropriate.

## Recent committers (`git log`)

- Lord Vetinari <vetinari@zaf.fleet> (2026-05-25)
- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-04-20)
