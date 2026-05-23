# Challenge Round — Target Decisions (Task 0.0 + 0.0a)

> Decision doc that resolves CRIT-1..4 and ROUTING-1..5 from
> `docs/plans/2026-05-18-challenge-round-into-note.md`. Phase 1 (Tasks 8, 9, 11)
> may not start until this doc is signed off and the named plan tasks have been
> updated to cite the targets chosen here.

**Status:** Decisions implemented (mostly). CRIT-1 (`mastery_challenge_verified_at` column on assessments) ✅. CRIT-2 (`needs_deepening_topics` extensions: source/concept/misconception/correction) ✅. CRIT-4 (`struggleStatusSchema` extracted in `packages/schemas/src/struggle-status.ts`) ✅. CRIT-3 (helper renames in `session-crud.ts`: `persistSessionMetadata` export) and ROUTING-1..5 (`llmRoutingRung` field, rung floor in `session-exchange.ts`) require code verification — not found as of 2026-05-23.

Produced from a codebase-existence spike against `origin/main` at commit `3584e279d`.

**Scope:** Storage targets, helper-name reconciliation, schema export
placement, and Challenge Round LLM routing policy. No code changes ship with
this doc.

---

## CRIT-1 — Mastery-verified persistence target

**Decision:** Add a `mastery_challenge_verified_at timestamp` column to the
existing `assessments` table (`packages/database/src/schema/assessments.ts:65`),
not to `retentionCards`, not to a new `topic_mastery_state` table, and not to
`learningSessions.metadata`.

**Why this beats the original (a)/(b)/(c) options:**

- The plan's (a) — adding to `retentionCards` — conflates spaced-repetition
  state (`easeFactor`, `intervalDays`, `nextReviewAt`) with mastery-decision
  state. SRS callers (`retention.ts`, `retention-data.ts`) read those rows on
  every review cycle; widening the row with a non-SRS axis they have to ignore
  is a foot-gun.
- The plan's (b) — a net-new `topic_mastery_state` table — duplicates the
  scoping pattern (`profile_id` + `topic_id`) that `assessments` already owns.
  `assessments` already carries `masteryScore numeric(3,2)` per
  `(profile_id, topic_id)`. Adding another mastery axis to the same row is the
  natural extension.
- The plan's (c) — JSON in `learningSessions.metadata` — cannot be indexed and
  cannot answer "is this topic challenge-verified?" without scanning every
  session row for that profile. Hard no.

**Schema change (for Task 9 Step 1):**

```sql
ALTER TABLE assessments
  ADD COLUMN mastery_challenge_verified_at timestamptz;
```

No index required for v1: reads will join on `(profile_id, topic_id)` which is
already covered by `assessments_profile_topic_idx`
(`assessments.ts:85`). Revisit if a "challenge-verified topic count" surface
needs to scan profile-wide.

**Scoping pattern:** Writes pass `profileId` explicitly through the
`createScopedRepository(db, profileId).assessments.update(...)` path, matching
how the rest of `assessments` writes already work.

**Test coverage owed by Task 9:** integration test that a Challenge Round
verdict sets the timestamp once, and that a subsequent partial/misconception
outcome does NOT overwrite or clear it (the column is monotonic — challenge
verification is sticky until an explicit unmark).

---

## CRIT-2 — Weak-spot persistence target (review of partial/misconception)

**Decision:** Reuse the existing `needs_deepening_topics` table
(`packages/database/src/schema/assessments.ts:137`) with two new columns and a
source discriminator. Do NOT build a net-new `review_targets` table.

**Why this beats the original (a)/(b)/(c) options:**

The plan was written without knowledge that `needs_deepening_topics` already
exists. It is already:

- per-`(profile_id, subject_id, topic_id)` scoped,
- enum-statused (`active` / `resolved` via `needsDeepeningStatusEnum`),
- carrying `consecutive_success_count` for resolution accounting,
- FK-cascaded on profile/subject/topic delete (matches CLAUDE.md's "cascade
  cleanly" rule, and answers MED-2 for free).

The plan's option (a) — extending `retentionCards` with a `source`
discriminator — would again pollute SRS state. Option (b) — a net-new
`review_targets` table — duplicates `needs_deepening_topics`. Option (c) —
`learningSessions.metadata.gaps` (`packages/schemas/src/sessions.ts:170`) — is
fine for in-session hints but is bounded to `.max(8)` per session and cannot be
queried across sessions; it does not satisfy CRIT-8's durability requirement.

**Schema change (for Task 9 Step 1.5):**

```sql
ALTER TABLE needs_deepening_topics
  ADD COLUMN source text NOT NULL DEFAULT 'system_signal',
  ADD COLUMN concept text,
  ADD COLUMN misconception text,
  ADD COLUMN correction text;
```

- `source` discriminator values for v1: `'system_signal'` (existing rows — the
  per-topic struggle-status signal that wrote to this table before Challenge
  Round existed) and `'challenge_round'` (new). Future sources slot in without
  another migration.
- `concept`, `misconception`, `correction` are nullable because system-signal
  rows do not carry that resolution. Challenge Round rows MUST populate all
  three. Enforce in the service layer, not via a partial check constraint, to
  keep the migration simple.
- `consecutive_success_count` already exists and can drive eventual auto-resolve.

**CRIT-8 satisfaction:** Challenge Round partial/misconception outcomes write a
row here BEFORE the round closes. If the write fails, the round-close handler
fails the request (no Sentry-only silent recovery). The "save correct work,
forget weak spots" failure mode is mechanically prevented.

**Cooldown FK semantics (MED-2):** the separate `challenge_round_cooldowns`
table introduced in Task 2 cascades on `profile_id` delete; the
`topic_id` FK uses `ON DELETE CASCADE` (consistent with neighbours). Document
this in Task 2's migration, not here.

**Test coverage owed by Task 9:** integration test that a mixed-outcome round
(2 solid + 1 misconception) saves the solid quotes as a note (CRIT-1-adjacent)
AND writes exactly one `needs_deepening_topics` row with `source =
'challenge_round'`, populated `concept`/`misconception`/`correction`, and leaves
`assessments.mastery_challenge_verified_at` unset.

---

## CRIT-3 — Session CRUD helper names

**Decision:** Replace every `getSessionById` reference in
`docs/plans/2026-05-18-challenge-round-into-note.md` (Tasks 8, 9, 11) with
`getSession`. Replace every `persistSessionMetadata` reference with a new
exported helper `persistSessionMetadata(db, profileId, sessionId, partial)` that
must be extracted from the file-local `updateSessionMetadata` currently at
`apps/api/src/services/session/session-exchange.ts:310`.

**What actually exists today:**

| Plan name (does NOT exist)   | Real helper                                             | Location                          | Scoping                                                         |
|------------------------------|---------------------------------------------------------|-----------------------------------|-----------------------------------------------------------------|
| `getSessionById`             | `getSession(db, profileId, sessionId)`                  | `session-crud.ts:917`             | Uses `createScopedRepository(db, profileId)` — already scoped.  |
| `persistSessionMetadata`     | file-local `updateSessionMetadata(db, profileId, ...)`  | `session-exchange.ts:310`         | Direct `db.update` with `eq(learningSessions.profileId, …)`.    |

**Action for Task 8 / 9 / 11:**

1. **`getSession`** is correctly scoped (`createScopedRepository` enforces
   `profileId` at the repo boundary). No extraction needed. Plan references
   to `getSessionById` are pure name drift — substitute and move on.
2. **`persistSessionMetadata`** must be promoted from a file-private helper to
   an exported `session-crud.ts` function so Task 8's challenge-round state
   writes and Task 9's mastery/review writes call the same code path. The
   shape:

   ```ts
   export async function persistSessionMetadata(
     db: Database,
     profileId: string,
     sessionId: string,
     partial: Partial<SessionMetadata>,
   ): Promise<void> {
     // merge with existing metadata first (read-modify-write under
     // `(id, profileId)` predicate; the existing single-statement update
     // currently overwrites — see Task 8.5 mid-round recovery).
   }
   ```
3. **Break test (CLAUDE.md non-negotiable):** add
   `session-crud.persistSessionMetadata.scoped.integration.test.ts` covering:
   - Owner profile A can update session metadata for their session.
   - Profile B passing A's `sessionId` updates zero rows (assert `result.rowCount === 0`).
   - The merge does not clobber unrelated keys (read-modify-write, not full replace).

   This is a v1 break test, not a follow-up. The whole Challenge Round state
   machine is built on this helper; an IDOR here is a session takeover.

**Why no Task 9.0 spin-off:** the work fits naturally inside Task 8 Step 0
("session-crud surface extension"). Rename Task 8 Step 0 from "(nothing yet)"
to "extract `persistSessionMetadata` to `session-crud.ts` with break test."

---

## CRIT-4 — Schema export of `struggleStatusSchema`

**Decision:** Extract to `packages/schemas/src/struggle-status.ts` mirroring
`retention-status.ts`. Re-import from `progress.ts`. Re-export from the package
barrel. Pre-decided by the original plan; recorded here for completeness.

**Current state (verified via grep):**

```
packages/schemas/src/progress.ts:243
  struggleStatus: z.enum(['normal', 'needs_deepening', 'blocked']),
```

The enum is inline inside `topicProgressSnapshotSchema`. It is not exported
under any name and cannot be imported by the trigger evaluator
(`evaluateChallengeReadiness`, Task 3).

**Target shape (mirrors `retention-status.ts`):**

```ts
// packages/schemas/src/struggle-status.ts
import { z } from 'zod';

export const struggleStatusSchema = z.enum([
  'normal',
  'needs_deepening',
  'blocked',
]);
export type StruggleStatus = z.infer<typeof struggleStatusSchema>;
```

Then in `progress.ts:243`:

```ts
import { struggleStatusSchema } from './struggle-status';
// ...
struggleStatus: struggleStatusSchema,
```

And add to `packages/schemas/src/index.ts` next to `retentionStatusSchema`.

**Action:** add this as **Task 3 Step 0** ("Extract `struggleStatusSchema`"),
before existing Step 1. Tasks 8 and 9 also import the new schema once Task 3
ships; they do not need their own extraction step.

---

## Challenge Round LLM routing policy (0.0a — ROUTING-1..5)

**Decision:** Challenge Round routing reuses the existing commercial policy
boundary. No private model side channel. The only Challenge-Round-specific
behaviour is an optional **routing-only rung floor of 4** applied during
`accepted | active | drafting` states.

**Confirmed routing facts (verified in code, `origin/main`):**

| Fact                                                                                     | Citation                                                                |
|------------------------------------------------------------------------------------------|-------------------------------------------------------------------------|
| `resolveExchangeLlmRouting()` is the commercial policy boundary.                         | `apps/api/src/services/session/session-exchange.ts:149`                 |
| Family standard profiles get `providerPolicy: 'gemini_only'` — including fallback.       | `session-exchange.ts:182-188` + `router.ts:319-336, 430-461`            |
| Plus and addon-premium profiles get `llmTier: 'premium'` only at rung ≥ 4.               | `session-exchange.ts:154-180`, with `ADVANCED_MODEL_MIN_RUNG = 4`       |
| OpenAI advanced candidate is suppressed below rung 5 even on premium tier.               | `apps/api/src/services/llm/router.ts:277, 395` (`OPENAI_ADVANCED_MODEL_MIN_RUNG = 5`) |
| Per-exchange `llmRoutingReason`, `llmProviderPolicy`, `llmProvider`, `llmModel` are persisted in `ai_response.metadata`. | `session-exchange.ts:288-301` (`ExchangeBehavioralMetrics`)             |

These facts are load-bearing for what follows.

### Policy for Challenge Round turns

- **Offer turns** (the LLM is deciding whether to surface the offer card): use
  **normal routing**. No floor. These are ordinary teach/check turns dressed up
  with extra envelope schema.
- **Accepted / active / drafting turns** (the LLM is evaluating learner
  explanations or synthesising a note): apply a **routing-only minimum rung of
  4**, fed through the existing resolver. Reason: per-answer concept evaluation
  and faithful note synthesis are materially harder than ordinary turns —
  Gemini-flash at rung 1 is not adequate, but the upgrade must respect the
  user's plan (Family standard never crosses providers; addon-premium gates
  OpenAI to rung ≥ 5).
- **Floor mechanism:** add a separate `llmRoutingRung?: EscalationRung` field
  to `ExchangeContext`. `prepareExchangeContext()` computes it AFTER the normal
  escalation decision and BEFORE `resolveExchangeLlmRouting()`:

  ```ts
  const llmRoutingRung =
    challengeState === 'accepted' || challengeState === 'active' || challengeState === 'drafting'
      ? Math.max(escalationRung, 4) as EscalationRung
      : escalationRung;
  ```

  `processExchange()` and `streamExchange()` then pass
  `context.llmRoutingRung ?? context.escalationRung` to `routeAndCall()` /
  `routeAndStream()`. `escalationRung` itself is unchanged — that field
  continues to mean "pedagogy/analytics rung", and the existing escalation
  decision does not get inflated by a Challenge Round being active.
- **No direct provider/model selection.** Challenge Round code must never call
  `routeAndCall(..., { preferredProvider: 'openai' })` or similar. The floor
  is the only lever.
- **Persistence proof.** Every Challenge Round turn writes `llmRoutingReason`,
  `llmProviderPolicy`, `llmProvider`, `llmModel`, and the chosen `llmRoutingRung`
  (new metric field) into `ai_response.metadata` so an auditor can confirm the
  floor did not bypass the policy. The chosen `llmRoutingRung` field needs to
  be added to `ExchangeBehavioralMetrics` (Task 8).

### Quota gate (ROUTING-3)

Replace the original plan's "5% remaining" readiness gate with an absolute
remaining-turn budget. v1 sizing: require at least **3 remaining
non-Challenge turns** in the per-period quota BEFORE offering — sized for a
round of up to 3 evaluation turns plus the note-save turn. Document in Task 3
trigger evaluator. The 5% threshold disproportionately blocks Plus/Family
profiles whose monthly cap is high but whose daily cap is low.

### Validation hook (ROUTING-5)

Final Validation must run BOTH:

```
pnpm eval:llm --live           # envelope-shape + signal-distribution baseline
pnpm test:llm:premium-routing  # commercial policy gate
```

`scripts/premium-routing-pass.ts` is the source of truth for the routing
contract; if `pnpm test:llm:premium-routing` fails after Challenge Round
ships, the floor mechanism violated the policy and the change must roll back
before merge.

### What this rules out

- Forcing OpenAI on any Challenge Round turn before rung 5.
- Bypassing `gemini_only` for Family standard turns, even on "drafting" notes.
- Logging Challenge Round routing as a "challenge_round" reason when the
  underlying policy is "family_standard_gemini_only" — `routingReason` must
  remain the policy-level reason; Challenge Round status lives in a separate
  metric field.

---

## Plan amendments required after this doc is signed off

The following inline references in
`docs/plans/2026-05-18-challenge-round-into-note.md` must be updated in the
SAME PR that lands the first Challenge Round implementation task (Task 1 or
Task 3 — whichever ships first). Doing them later means each downstream task
needs to redo the lookup.

- **Task 3 Step 0:** insert "Extract `struggleStatusSchema` to
  `packages/schemas/src/struggle-status.ts` mirroring `retention-status.ts`,
  re-import in `progress.ts:243`, add to package barrel." Existing Step 1
  becomes Step 2.
- **Task 8 Step 0:** insert "Extract `persistSessionMetadata` from
  `session-exchange.ts:310` (file-local) to `session-crud.ts` as an exported
  read-modify-write helper. Add IDOR break test."
- **Task 8** (LLM routing wiring): add `llmRoutingRung?: EscalationRung` to
  `ExchangeContext`; populate in `prepareExchangeContext()` per the rule
  above; thread through `processExchange()` / `streamExchange()`. Add
  `llmRoutingRung` to `ExchangeBehavioralMetrics`.
- **Task 8 / 9 / 11:** s/`getSessionById`/`getSession`/g and
  s/`persistSessionMetadata`/`persistSessionMetadata` (no rename — the new
  export keeps that name)/g. Strip the implied `getSessionById` import path.
- **Task 9 Step 1:** "Add `mastery_challenge_verified_at timestamptz` column
  to `assessments` (not a new `topic_mastery_state` table, not `retentionCards`).
  Cite `assessments.ts:65`." Update `## Rollback` block accordingly — drop
  column on rollback; pre-launch, no real data.
- **Task 9 Step 1.5:** "Extend `needs_deepening_topics` with `source` (default
  `'system_signal'`, NOT NULL), `concept`, `misconception`, `correction`. Cite
  `assessments.ts:137`. Do NOT build a net-new `review_targets` table." Update
  `## Rollback` block to drop columns; existing rows back-fill default
  `source = 'system_signal'`.
- **Task 9 Step 4 (Inngest):** weak-spot persistence target is the extended
  `needs_deepening_topics` table; the in-session `learningSessions.metadata.gaps`
  array is NOT the durable target (it's the in-session hint surface only).
- **Task 3 (trigger evaluator):** replace "5% quota remaining" with "at least
  3 non-Challenge turns remaining in the active period budget" per ROUTING-3.
- **Final Validation:** add `pnpm test:llm:premium-routing` next to
  `pnpm eval:llm --live`.

---

## Open follow-ups (not blocking)

1. **Auto-resolve for `needs_deepening_topics` rows of source `'challenge_round'`.**
   The existing `consecutive_success_count` column already supports this. v1
   ships without an auto-resolve cron; a follow-up plan can decide whether a
   subsequent Challenge Round on the same topic that returns all-solid clears
   the row, or whether the learner must explicitly mark it resolved.
2. **`learning_modes` table rename.** The Phase 0 sunset (PR #325) left the
   table holding only `medianResponseSeconds` and `celebrationLevel`. The name
   is misleading post-sunset. Out of scope here; tracked separately.
3. **`assessments_profile_topic_idx` width.** Once the
   `mastery_challenge_verified_at` column is queried by "challenge-verified
   topics in last 30 days" for any analytics surface, a partial index
   (`WHERE mastery_challenge_verified_at IS NOT NULL`) may be worth adding.
   Defer until that surface exists.

---

_Sign-off received; this doc is now a historical decision record._
