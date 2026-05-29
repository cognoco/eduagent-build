---
title: Bucket 1 Duplication Consolidation — Implementation Plan
date: 2026-05-29
profile: change
spec: conversation (duplication audit, 2026-05-29)
status: draft
---

# Bucket 1 Duplication Consolidation — Implementation Plan

**Goal:** Collapse three security-adjacent duplications into their existing canonical
helpers — the curriculum-topic ownership join, the account-owner 403 gate, and the
subscription-tier union — so a change is made in one place and the strict-correct
behavior is enforced everywhere.

**Approach:** Each target already has a canonical home (`curriculum-topic-ownership.ts`,
`family-access.assertOwnerProfile`, `@eduagent/schemas` billing types). We extend the
canonical helper just enough to absorb the call sites' real data needs, migrate every
duplicate site, add a forward-only guard test where 3+ siblings existed, and prove the
security paths with red-green break-tests. No behavior changes other than making the
ownership join *stricter* (T2 verifies that's safe against prod data shape).

## Scope

In scope:
- `apps/api/src/services/curriculum-topic-ownership.ts` (extend return shape)
- `apps/api/src/services/evaluate-data.ts` (`checkEvaluateEligibility`)
- `apps/api/src/services/assessments.ts` (`loadAssessmentTopicContext`)
- `apps/api/src/services/family-bridge.ts` (`topicBelongsToProfile`)
- `apps/api/src/services/family-access.ts` (`assertOwnerProfile` signature)
- `apps/api/src/routes/account.ts`, `billing.ts`, `consent.ts`, `onboarding.ts` (owner gates)
- `apps/api/src/services/subscription.ts`, `services/billing/metering.ts`, `services/challenge-round/trigger.ts` (tier union)
- New guard test: `apps/api/src/services/curriculum-topic-ownership.guard.test.ts`

Out of scope (do not touch):
- `apps/api/src/routes/profiles.ts:78,146,189` — these are NOT pure owner gates. `:146`/`:189`
  are compound (`isOwner !== true && id !== activeProfileId` — non-owners may edit their own
  profile); `:78` is the first-profile bootstrap branch. Leaving them is deliberate.
- `packages/database/src/repository.ts:653-790` — the scoped-repo internal ownership joins are
  a separate canonical layer; not duplicates to fold here.
- `subscription.ts` `TIER_CONFIGS` (the quota/price numbers) — legitimately API-only, must NOT
  move into schemas.
- Anything mobile, and the V0/V1 nav surface.

## Phase A — Curriculum-topic ownership join (security hardening)

The three inline sites verify ownership through *different* parent tables
(`evaluate-data`/`family-bridge` via `curriculumBooks.subjectId`; `assessments` via
`curricula.subjectId`). `curriculumTopics` has both `curriculumId` and `bookId` as
independent NOT-NULL FKs (`packages/database/src/schema/subjects.ts:176,185`), so a single
parent path is strictly weaker than the canonical `findOwnedCurriculumTopic`, which joins
through **both** and requires them to agree on the same owned subject.

### Tasks

- [ ] **T1: Extend `OwnedCurriculumTopic` and both selects** with the fields the three call
  sites need, so they can drop their bespoke selects. Add to the interface and to *both*
  `findOwnedCurriculumTopic` and `findOwnedCurriculumTopics` `.select({...})` blocks:
  ```ts
  // interface OwnedCurriculumTopic (after existing fields)
  topicSource: typeof curriculumTopics.$inferSelect['source'];
  subjectName: string;
  subjectPedagogyMode: typeof subjects.$inferSelect['pedagogyMode'];
  subjectLanguageCode: typeof subjects.$inferSelect['languageCode'];
  ```
  ```ts
  // both .select({...}) blocks, added alongside existing keys
  topicSource: curriculumTopics.source,
  subjectName: subjects.name,
  subjectPedagogyMode: subjects.pedagogyMode,
  subjectLanguageCode: subjects.languageCode,
  ```
  — done when: `pnpm exec nx run api:typecheck` passes and the existing
  `curriculum-topic-ownership` unit tests still pass unchanged.

- [ ] **T2: Prove the stricter join is safe against current data shape.** Run a read-only
  count of topics whose two parent paths disagree on subject:
  ```sql
  SELECT count(*) FROM curriculum_topics t
  JOIN curriculum_books b ON b.id = t.book_id
  JOIN curricula c ON c.id = t.curriculum_id
  WHERE b.subject_id <> c.subject_id;
  ```
  Run against dev (`pnpm run db:studio:dev` or a scoped query) and against a staging snapshot.
  — done when: the count is `0` on both, recorded in the PR body. If non-zero, STOP and
  escalate: the double-join would change which topics resolve, and Phase A must be re-scoped
  to a data-repair task first. (Note: all three call sites treat a null result benignly —
  title falls back to `topicId`, family-bridge no-ops — so even a non-zero count is not a
  data-loss risk, only a "title/undo silently stops working for divergent topics" behavior
  change that needs a conscious decision.)

- [ ] **T3: Migrate `evaluate-data.ts checkEvaluateEligibility`** (currently inline join at
  `:60-68`). Replace the inline `db.select(...).from(curriculumTopics).innerJoin(curriculumBooks...)`
  with:
  ```ts
  import { findOwnedCurriculumTopic } from './curriculum-topic-ownership';
  // ...
  const owned = await findOwnedCurriculumTopic(db, { profileId, topicId });
  const topicTitle = owned?.topicTitle ?? topicId;
  ```
  Drop the now-unused `curriculumBooks` / `subjects` / `curriculumTopics` imports if no other
  use remains in the file. Keep the `[BUG-354]` comment intent as a one-line note pointing at
  the helper. — done when: `evaluate-data` unit tests pass and `api:typecheck` passes.

- [ ] **T4: Migrate `assessments.ts loadAssessmentTopicContext`** (inline join at `:763-777`).
  Replace with the helper and map the extra fields it now returns:
  ```ts
  const owned = await findOwnedCurriculumTopic(db, { profileId, topicId });
  return {
    topicTitle: owned?.topicTitle ?? topicId,
    topicDescription: owned?.topicDescription ?? '',
    subjectName: owned?.subjectName,
    pedagogyMode: owned?.subjectPedagogyMode,
    languageCode: owned?.subjectLanguageCode ?? null,
  };
  ```
  — done when: `assessments` unit tests pass; `api:typecheck` passes; the returned shape is
  identical to today (same keys, same fallbacks).

- [ ] **T5: Migrate `family-bridge.ts topicBelongsToProfile`** (inline join at `:546-554`). The
  caller (`undoCloneFromChild`) only reads existence + `topic.source`, so return the helper's
  new `topicSource` instead of the full row:
  ```ts
  async function topicBelongsToProfile(
    db: Database, profileId: string, topicId: string,
  ): Promise<OwnedCurriculumTopic | null> {
    return findOwnedCurriculumTopic(db, { profileId, topicId });
  }
  ```
  Update the call site `undoCloneFromChild` (`:567-573`): `if (!topic || topic.topicSource !== 'parent_bridge')`.
  — done when: `family-bridge` unit tests pass; `api:typecheck` passes.

- [ ] **T6: Install a forward-only guard test** (CLAUDE.md "Sweep when you fix" — 3+ siblings).
  New `curriculum-topic-ownership.guard.test.ts` greps `apps/api/src/services` and `routes`
  (excluding `curriculum-topic-ownership.ts` and `repository.ts`) for the inline pattern
  `.innerJoin(subjects` co-located with `curriculumTopics`, and fails on any match not on an
  allowlist (which is empty after T3–T5). Mirror the structure of
  `apps/api/src/services/safe-non-core.guard.test.ts`. — done when: the guard test passes
  with an empty allowlist, and fails if any of the T3–T5 inline joins are reintroduced
  (verify by temporarily reverting T3 and watching it go red).

## Phase B — Account-owner 403 gate

`assertOwnerProfile(c)` (`family-access.ts:140`) already encapsulates the gate but throws a
fixed message; 14 route sites re-implement `c.get('profileMeta'); if (isOwner !== true) return
apiError/forbidden(...)` with per-site copy. The global `onError` (`index.ts:317`) converts a
thrown `ForbiddenError` to `{ code: 'FORBIDDEN', apiCode: undefined, message }` at 403 —
byte-identical to the inline `{ code: 'FORBIDDEN', message }` (JSON drops `undefined`), so
return→throw is behavior-preserving **iff each site's existing message is passed through**.

### Tasks

- [ ] **T7: Add an optional message param to `assertOwnerProfile`:**
  ```ts
  export function assertOwnerProfile<E extends ProfileMetaContextEnv, P extends string, I extends Input>(
    c: Context<E, P, I>,
    message = 'Only the account owner can view this surface.',
  ): void {
    if (c.get('profileMeta')?.isOwner !== true) {
      throw new ForbiddenError(message);
    }
  }
  ```
  — done when: `api:typecheck` passes and `family-access` tests pass.

- [ ] **T8: Migrate the 14 pure owner-gate sites** to `assertOwnerProfile(c, '<existing message>')`,
  preserving each site's current copy verbatim. Sites (verify line numbers at edit time):
  `account.ts:59,131,163`; `billing.ts:151,349,426,688,850,898,950`; `consent.ts:408,454,506`;
  `onboarding.ts:62`. Each replaces a 3–4 line `const activeProfileMeta… = c.get('profileMeta');
  if (…?.isOwner !== true) { return apiError(c, 403, ERROR_CODES.FORBIDDEN, '<msg>'); }` block
  with a single `assertOwnerProfile(c, '<msg>');`. Remove now-dead `activeProfileMeta*` locals.
  Do NOT touch `profiles.ts` (see Out of scope). — done when: `api:typecheck` + `api:lint` pass,
  and the per-route unit tests pass; manually diff that no message string changed.

- [ ] **T9: Red-green break-tests for the gate** (CLAUDE.md "Security fixes require a break test").
  For at least one route per file (`account`, `billing`, `consent`, `onboarding`), add/confirm a
  test: a non-owner profile (`profileMeta: { isOwner: false }`) hitting the endpoint gets `403`
  with body exactly `{ code: 'FORBIDDEN', message: '<that site's message>' }`. Watch green →
  revert the T8 edit for that route → watch red (the gate is gone) → restore. — done when: all
  four break-tests pass on the migrated code and fail on the reverted code, recorded in PR body.

## Phase C — Subscription-tier union

`subscription.ts` imports nothing from schemas and re-spells the tier/status unions; two more
sites re-spell the tier; `trigger.ts:47` adds a stray `'trial'` (a *status*, not a tier — no
caller passes it; every real `subscriptionTier` site uses a `SubscriptionTier`).

### Tasks

- [ ] **T10: Replace the inline unions in `subscription.ts:6-11`** with schema types:
  ```ts
  import type { SubscriptionTier, SubscriptionStatus } from '@eduagent/schemas';
  export interface SubscriptionState {
    tier: SubscriptionTier;
    status: SubscriptionStatus;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
  }
  ```
  `TIER_CONFIGS: Record<SubscriptionState['tier'], TierConfig>` still resolves (now keyed by
  `SubscriptionTier`). Keep the local `LLMTier` / `BillingAccess` (API-only). — done when:
  `api:typecheck` passes; `subscription` tests pass.

- [ ] **T11: Replace the three inline `'free' | 'plus' | 'family' | 'pro'` annotations** in
  `metering.ts:507,569,695` with `SubscriptionTier` (import from `@eduagent/schemas`).
  — done when: `api:typecheck` passes; `metering` tests pass.

- [ ] **T12: Fix `trigger.ts:47`** — replace `subscriptionTier?: 'free' | 'plus' | 'family' | 'pro' | 'trial'`
  with `subscriptionTier?: SubscriptionTier`. Confirms the drift smudge is gone and the type now
  matches every caller (`session-exchange.ts:2024,2039` pass `SubscriptionTier | undefined`).
  — done when: `api:typecheck` passes; `challenge-round/trigger` tests pass.

## Cross-cutting verification (before commit)

- [ ] **V1:** `pnpm exec nx run api:typecheck` and `pnpm exec nx run api:lint` clean.
- [ ] **V2:** `pnpm exec nx run api:test` green (unit).
- [ ] **V3:** `pnpm exec nx test:integration api` green — Phase A touches DB-scoping/ownership
  paths and Phase B touches auth-scoping; the pre-commit/pre-push hooks skip `.integration.test.`,
  so this must be run by hand (CLAUDE.md Required Validation).
- [ ] **V4:** No internal `jest.mock('./…')` added (GC1); break-tests use real service code.

## Sequencing & risk

Phases are independent and can ship as three separate PRs (recommended) or one. Within Phase A,
**T2 gates T3–T5** — do not migrate the joins until the divergence count is confirmed `0`.
Phase B is the lowest-risk (pure behavior-preserving, proven by T9). Phase C is type-only, zero
runtime change. Highest-value/highest-risk is Phase A (security hardening); ship it first and
alone so the break in behavior, if any, is isolated.
