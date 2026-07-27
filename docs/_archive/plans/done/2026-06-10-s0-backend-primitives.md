---
title: S0 — Backend Primitives (Activity Ledger + Writer Helper + GET /now) — Implementation Plan
date: 2026-06-10
profile: code
spec: docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md
status: draft
---

# S0 — Backend Primitives — Implementation Plan

> **STATUS (2026-06-27):** IMPLEMENTED (core). `mentor_activity_ledger` table + RLS, `writeActivityMoment` writer, deterministic `GET /now` + `/now/overflow`, ranking service, `MMT-ADR-0022`, and `MODE_NAV_V2_ENABLED` API env var all landed. PARTIAL on the producer sweep: only `session_filed` and `snapshot_ready` wired to the ledger (~2 of ~7 producers); `milestone_reached`, `recap_ready`, `topic_mastered`, `retention_due`, and `needs_deepening_added` not yet wired. NEXT: finish the remaining producers before any consumer depends on ledger moments beyond those two.

> **⚠️ Identity wording below is stale (2026-06-28).** The out-of-scope notes that say identity "is not live for S0" / "the ledger column remains `profileId` until the IF flip + convergence" are outdated: the IF flip + M-REPOINT are **done on the live DBs** (stg/prd: `profiles` dropped, `person` live, ledger/`subjects` `profile_id` FKs re-pointed to `person`; the column *name* did stay `profile_id` per OQ-7). Two consequences: (1) the S0 "no `person`/edge reads" contract is now **violated in code** — `now-feed.ts` reads `person`/`supportership` (the S0↔S4 tier leak, `WI-1123`, live-but-benign since `supportership` is empty); (2) `WriteActivityMomentInput` can't express non-self visibility (`WI-1121`). See [`03-gap-analysis-2026-06-28.md`](03-gap-analysis-2026-06-28.md).

> **✅ RULING (2026-07-01, `WI-1123`): re-classify, doc-only — the "no `person`/edge reads" contract below is obsolete.** It was written under the pre-flip assumption in the note above; identity is now live, so its precondition no longer holds. The `person`/`supportership` reads in `now-feed.ts` (`resolveNowTarget`, `collectSupporterHubCandidates`) are correct S4-scoped behavior that shipped early — not a violation to fix. No flag-fence, no service split: `now-feed.ts` keeps serving `self`/`person`/`supporter-hub` scopes from one service. `supportership` is empty (no linking UI yet), so these joins return nothing in practice; the ruling is benign-by-data, not benign-by-design, and should be revisited if that ever concerns a reviewer. `architecture.md`'s Activity Feed section carries the matching note, and `docs/adr/MMT-ADR-0022-activity-ledger-narration-substrate.md` (Decision, point 6) records the why in lockstep.

**Goal:** Ship three identity-independent, dark backend primitives the mentor-is-the-app shell needs — an append-only `mentor_activity_ledger` table keyed by `profileId`, a best-effort non-throwing writer helper, and a deterministic `GET /now` ranked feed (no LLM in the ranking path) that reads `retention_cards` / `parking_lot_items` / `needs_deepening_topics` / `learning_sessions` / `assessments` / the ledger as-is.

> Synced to spec amendment 2026-06-10 (§2 P5 route-catalog target, §2 superseded LLM-ranked-feed note).

**Approach:** Additive Drizzle table + migration; reuse the existing `safeWrite` posture (already in `apps/api/src/services/safe-non-core.ts:111`) for the ledger writer; build `GET /now` as a Hono route group delegating to a pure ranking service. The retention gate (`applyRetentionUpdate()`) is **explicitly carved out** to a separate plan (S0-R) per spec §8.3 / §11 and is **not** in this plan. No UI, no `person`/`edge` reads.

## Scope

In scope:
- `packages/database/src/schema/activity-ledger.ts` (new table)
- `packages/database/src/schema/index.ts` (barrel export — one added line)
- `apps/api/drizzle/0111_zippy_gateway.sql` + `0112_rls_mentor_activity_ledger.sql` (landed ledger table + RLS policy migrations)
- `apps/api/src/services/activity-ledger.ts` (writer helper + kind/visibility constants)
- `packages/schemas/src/now-feed.ts` (new — `/now` request/response + card schemas)
- `packages/schemas/src/activity-ledger.ts` (new — ledger row kinds, visibility, template keys)
- `packages/schemas/src/index.ts` (barrel exports — two added lines)
- `apps/api/src/services/now-feed.ts` (new — deterministic ranking service + route catalog)
- `apps/api/src/routes/now.ts` (new — `GET /now` Hono route group)
- `apps/api/src/index.ts` (route registration — one added `.route('/', nowRoutes)` line)
- `apps/api/src/config.ts` (add `MODE_NAV_V2_ENABLED` to the API env schema for completeness/parity; see T9)
- `docs/adr/MMT-ADR-0022-activity-ledger-narration-substrate.md` (new ADR, lockstep)
- Co-located unit tests + one integration test (paths in `## Tests`)

Out of scope (must not change):
- **The retention gate / `applyRetentionUpdate()` SRS refactor (spec §8.3) — that is plan S0-R, a separate track.** `GET /now` reads `retention_cards` exactly as it is today; no writer in `services/retention-data.ts`, `inngest/functions/review-calibration-grade.ts`, `services/verification-completion.ts`, `services/evaluate-data.ts`, `services/retention-mastery.ts`, or `inngest/functions/topic-probe-extract.ts` is touched.
- **Any UI** — no mobile screens, no `apps/mobile/src/lib/feature-flags.ts` change (the mobile-side `MODE_NAV_V2_ENABLED` flag and its consumption is an S1 deliverable; this plan only reserves the API-side env var name — see T9 / Deliverable 2(e)).
- **Any live `person` / `edge` / `membership` read or write.** Identity schema now exists in code, but it is not live for S0. The ledger column remains `profileId` until the IF flip + convergence. The `scope` query param is accepted and validated, but in S0 only `scope=self` (the learner's own Me scope) returns data; supporter scopes are a documented S4 follow-on (T7).
- **The supporter `/now` path** (aggregated feed, per-edge fairness, attention items) — designed-for in the contract (T7) but not implemented (needs identity → S4).
- Existing tables' columns; existing routes; the LLM router.

---

## Verified audit amendments (2026-06-13)

S0 has landed since this draft was written. Treat the tasks below as historical implementation detail unless they are explicitly updated during a follow-up.

- **Migration numbering is stale.** Do not generate or apply `0108_*` from this plan. The ledger table landed in `apps/api/drizzle/0111_zippy_gateway.sql`; RLS landed in `apps/api/drizzle/0112_rls_mentor_activity_ledger.sql`. Any future migration must use the current migration head and must not recreate `ledger_visibility` or `mentor_activity_ledger`.
- **RLS is part of the accepted S0 contract.** The Drizzle table must keep RLS enabled and the SQL migration/policy must keep `ALTER TABLE "mentor_activity_ledger" ENABLE ROW LEVEL SECURITY` plus `mentor_activity_ledger_profile_isolation` using `app.current_profile_id`. Do not treat RLS as a later hardening afterthought.
- **Identity wording is stale.** `person` / `supportership` / `membership` schema now exists in code, but it is not live for S0. The actual guard is runtime/cutover status: no S0-S3 code may read or write identity runtime data before the IF flip + convergence. Any such dependency is misclassified and moves to the identity-coupled phase.
- **Producer coverage is incomplete.** Current code only wires `writeActivityMoment()` in the session-filing path. Before S1/S3 depend on ledger moments beyond `session_filed`, add a producer wiring sweep for every S0 `LedgerKind`: `session_filed`, `topic_mastered`, `retention_due`, `needs_deepening_added`, `recap_ready`, `snapshot_ready`, `milestone_reached`, with exact producer files and tests; or explicitly narrow the consumer plans to the kinds that are actually produced.
  - **`milestone_reached` producer is the existing milestone-detection path — wire, don't build.** `storeMilestones(db, profileId, detected)` (`apps/api/src/services/milestone-detection.ts:202`, called from `snapshot-aggregation.ts:1075,1282`, driven by the `daily-snapshot` cron) already detects and inserts *new* achievement milestones (`vocabulary_count`, `topic_mastered_count`, `book_completed`, `session_count`, `streak_length`, `learning_time`, `subject_mastered`, `topics_explored` — `milestoneTypeSchema`, `packages/schemas/src/snapshots.ts:141`) via `onConflictDoNothing`, and **returns only the rows it actually inserted**. For each returned (genuinely new) milestone, emit one `writeActivityMoment({ kind: 'milestone_reached', templateKey: 'ledger.milestone_reached.default', params: { milestoneType, threshold, label }, visibility: 'self' })`. Because the moment fires only on the newly-inserted set, a milestone is announced once and never re-announced. **The milestones table, `detectMilestones`/`storeMilestones`, and snapshot aggregation all STAY** — this kind only adds a moment emit; it does not move the detection logic. This is the heir that lets S6 delete the standalone milestones *gallery screen* (former `progress/milestones.tsx`) without losing the achievement data.
- **`/now` acceptance coverage must match the landed candidate set.** Route-level tests should be real integration-style scoping tests, not only a mocked route test, and should seed all candidate classes (`unfinished_session`, `retention_due`, `parked_item`, `needs_deepening`, `challenge_ready`, `ledger_moment`) for profile A/B leak checks. Correct the pattern reference to the repo's `tests/integration/*` routes tests when adding this.
- **Deep links are abstract route keys, not guaranteed mobile paths.** S0 emits closed catalog keys only. S1/S2 own mapping those keys to current Expo Router paths: current `session.resume` maps to `/(app)/session` with `sessionId`; `subject.topic` maps to `/(app)/topic/[topicId]`; `subject.hub` must switch to the S2 hub under V2. `retention.review` and `challenge.start` need either dedicated leaves or an explicit defer before S1 can push them.

## Surface map (files × responsibility)

| File | Responsibility |
|---|---|
| `schema/activity-ledger.ts` | `mentorActivityLedger` Drizzle table + `ledgerVisibilityEnum` pgEnum |
| `schemas/src/activity-ledger.ts` | `LedgerKind`, `LedgerVisibility`, `LedgerTemplateKey` zod enums + `ledgerParamsSchema` |
| `services/activity-ledger.ts` | `writeActivityMoment()` writer (wraps `safeWrite`) + `markMomentSurfaced()` |
| `schemas/src/now-feed.ts` | `nowQuerySchema`, `nowCardSchema`, `nowResponseSchema`, `nowScopeSchema`, card-`kind` enum, `deepLinkSchema`, `nowOverflowItemSchema` |
| `services/now-feed.ts` | `buildNowFeed()` ranking algorithm + `RANKING` constants + `resolveDeepLink()` closed route catalog |
| `routes/now.ts` | `nowRoutes` Hono group — `GET /now` (+ `GET /now/overflow`) |
| `apps/api/drizzle/0111_zippy_gateway.sql`; `0112_rls_mentor_activity_ledger.sql` | landed additive table/enum/index migration + RLS enablement/policy migration |
| `docs/adr/MMT-ADR-0022-*.md` | ADR for the ledger as load-bearing GDPR-timer substrate (spec §12 obligation #4) |

---

## Tasks

- [ ] **T1: Define the `mentor_activity_ledger` Drizzle table + visibility enum.**
  Create `packages/database/src/schema/activity-ledger.ts` with the DDL below; add `export * from './activity-ledger';` to `packages/database/src/schema/index.ts`. Columns per spec §8.2 verbatim, keyed by `profileId` (FK → `profiles.id`, `onDelete: 'cascade'`, mirroring every existing table e.g. `assessments.ts:60`). `params` is `jsonb` (TS-only `$type`, parsed on read like `sessions.ts:99`). Two indexes: the surfacing scan `(profileId, surfacedAt)` and the standalone FK index `(profileId)` (matches the BUG-393 convention every table follows, e.g. `assessments.ts:104`).
  ```ts
  import { pgTable, uuid, text, timestamp, jsonb, pgEnum, index } from 'drizzle-orm/pg-core';
  import { profiles } from './profiles';
  import { generateUUIDv7 } from '../utils/uuid';

  export const ledgerVisibilityEnum = pgEnum('ledger_visibility', [
    'self',
    'supporter',
    'both',
  ]);

  export const mentorActivityLedger = pgTable(
    'mentor_activity_ledger',
    {
      id: uuid('id').primaryKey().$defaultFn(() => generateUUIDv7()),
      // S0: profile-keyed. The S4 identity migration repoints this to
      // person_id and adds edge_id (spec §8.2). DO NOT add those columns here.
      profileId: uuid('profile_id')
        .notNull()
        .references(() => profiles.id, { onDelete: 'cascade' }),
      // Inngest function id (or 'route:<name>') that produced the row. Free text
      // (not an enum) so a new producer never needs a migration.
      actorJob: text('actor_job').notNull(),
      // Stable moment kind — see LedgerKind in @eduagent/schemas. Text (not a DB
      // enum) so new kinds ship without a migration; validated app-side on read.
      kind: text('kind').notNull(),
      // Stable copy template — see LedgerTemplateKey. Text for the same reason.
      templateKey: text('template_key').notNull(),
      // Render params for templateKey. $type is TS-only; callers MUST parse the
      // raw value through parseLedgerParams() before rendering.
      params: jsonb('params').notNull().default({}).$type<Record<string, unknown>>(),
      visibility: ledgerVisibilityEnum('visibility').notNull().default('self'),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      // Null until the row has been surfaced in a /now feed (or a supporter
      // report). The /now ranker reads pending (surfacedAt IS NULL) rows.
      surfacedAt: timestamp('surfaced_at', { withTimezone: true }),
    },
    (table) => [
      // Pending-moment scan: WHERE profile_id = $1 AND surfaced_at IS NULL
      // ORDER BY created_at. The partial index keeps it tight as the ledger grows.
      index('mentor_activity_ledger_pending_idx')
        .on(table.profileId, table.createdAt)
        .where(sql`${table.surfacedAt} IS NULL`),
      // Standalone FK index (BUG-393 convention) for the ON DELETE CASCADE probe.
      index('mentor_activity_ledger_profile_id_idx').on(table.profileId),
    ],
  );
  ```
  (Add `import { sql } from 'drizzle-orm';` at the top — the partial index uses it.)
  **done when:** `packages/database/src/schema/activity-ledger.test.ts` (new, T1a) asserts the table is exported from `@eduagent/database`, has columns `id, profileId, actorJob, kind, templateKey, params, visibility, createdAt, surfacedAt`, that `ledgerVisibilityEnum.enumValues` deep-equals `['self','supporter','both']`, and that `visibility` defaults to `'self'`. `pnpm exec nx run database:typecheck` passes.

- [ ] **T2: Verify the landed ledger migrations and RLS policy.**
  Do not generate `0108_*`. Verify the current landed migrations instead: `apps/api/drizzle/0111_zippy_gateway.sql` creates `ledger_visibility`, `mentor_activity_ledger`, and the required indexes; `apps/api/drizzle/0112_rls_mentor_activity_ledger.sql` enables row-level security and defines `mentor_activity_ledger_profile_isolation` using `app.current_profile_id`. Any future correction uses the current migration head and must be additive unless a rollback section explicitly covers data loss.
  **Additive-only posture:** the original ledger creation created only new objects; RLS hardening is now part of the accepted S0 floor. Forward recovery for a pre-launch reset remains dropping the ledger table/type and rerunning migrations; production rollback must follow the repo Schema-And-Deploy-Safety rule for whatever new migration is authored.
  **done when:** the landed SQL files are present, no future migration recreates `mentor_activity_ledger` or `ledger_visibility`, RLS remains enabled in SQL and schema tests, and the dev DB applies the current migration chain cleanly. Add a regression test or SQL assertion that removing the RLS policy fails the S0 verification.

- [ ] **T3: Define ledger schema contracts in `@eduagent/schemas`.**
  Create `packages/schemas/src/activity-ledger.ts` with the kind enum, visibility enum, template-key enum, and params parser; add `export * from './activity-ledger';` to `packages/schemas/src/index.ts`. The S0 kind set is the minimum the §8.2 consumers need — keep it closed and stable (new kinds are an additive PR + a `templateKey` entry, never a migration).
  ```ts
  import { z } from 'zod';

  export const ledgerVisibilitySchema = z.enum(['self', 'supporter', 'both']);
  export type LedgerVisibility = z.infer<typeof ledgerVisibilitySchema>;

  // S0 kinds — the moments today's Inngest jobs already produce. Additive only.
  export const ledgerKindSchema = z.enum([
    'session_filed',        // auto-file-session completed
    'topic_mastered',       // retention masteredAt stamped
    'retention_due',        // a card came due (ledger mirror for the feed)
    'needs_deepening_added', // a weak concept was routed to needs_deepening
    'recap_ready',          // a session summary/recap was generated
    'snapshot_ready',       // daily snapshot produced
    'milestone_reached',    // a NEW achievement milestone was detected+stored (former Progress milestones gallery → moments)
  ]);
  export type LedgerKind = z.infer<typeof ledgerKindSchema>;

  // templateKey convention: 'ledger.<kind>.<variant>' — see Deliverable 2(c).
  export const ledgerTemplateKeySchema = z.enum([
    'ledger.session_filed.default',
    'ledger.topic_mastered.default',
    'ledger.retention_due.default',
    'ledger.needs_deepening_added.default',
    'ledger.recap_ready.default',
    'ledger.snapshot_ready.default',
    'ledger.milestone_reached.default',
  ]);
  export type LedgerTemplateKey = z.infer<typeof ledgerTemplateKeySchema>;

  export const ledgerParamsSchema = z.record(z.string(), z.unknown());
  export function parseLedgerParams(raw: unknown): Record<string, unknown> {
    const r = ledgerParamsSchema.safeParse(raw);
    return r.success ? r.data : {};
  }
  ```
  **done when:** `packages/schemas/src/activity-ledger.test.ts` (T3a) asserts `ledgerKindSchema.options` length and members, `ledgerVisibilitySchema.options === ['self','supporter','both']`, every `ledgerTemplateKeySchema` value matches `/^ledger\.[a-z_]+\.[a-z_]+$/` and has a `ledgerKindSchema` member as its second segment, and `parseLedgerParams(undefined)` returns `{}`. `pnpm exec nx run schemas:typecheck` passes.

- [ ] **T4: Implement the non-throwing ledger writer helper.**
  Create `apps/api/src/services/activity-ledger.ts`. The writer wraps the **existing** `safeWrite` (`services/safe-non-core.ts:111`) — the same Sentry-captured, never-throwing posture as `safeSend`, applied to a DB insert (spec LOW-2: do **not** call `safeSend`; `safeWrite` is the DB analog and already exists). Signature and a usage example below; usage goes **inside an Inngest fn body**, after the core work, never gating it.
  ```ts
  import type { Database } from '@eduagent/database';
  import { mentorActivityLedger } from '@eduagent/database';
  import {
    type LedgerKind,
    type LedgerTemplateKey,
    type LedgerVisibility,
  } from '@eduagent/schemas';
  import { safeWrite } from './safe-non-core';
  import { eq, and, isNull } from 'drizzle-orm';

  export interface WriteActivityMomentInput {
    db: Database;
    profileId: string;
    actorJob: string;          // e.g. 'auto-file-session'
    kind: LedgerKind;
    templateKey: LedgerTemplateKey;
    params?: Record<string, unknown>;
    visibility?: LedgerVisibility; // default 'self'
  }

  /**
   * Best-effort, non-throwing ledger insert. A write failure is captured in
   * Sentry (via safeWrite) and never propagates — the calling Inngest job's
   * core work must complete even if the moment row is lost (spec §8.2).
   * Returns void; callers do not branch on success.
   */
  export async function writeActivityMoment(
    input: WriteActivityMomentInput,
  ): Promise<void> {
    const { db, profileId, actorJob, kind, templateKey, params, visibility } = input;
    await safeWrite(
      () =>
        db.insert(mentorActivityLedger).values({
          profileId,
          actorJob,
          kind,
          templateKey,
          params: params ?? {},
          visibility: visibility ?? 'self',
        }),
      'activity-ledger.write',
      { profileId, actorJob, kind },
    );
  }

  /** Stamp surfacedAt on pending rows the /now feed just surfaced. Best-effort. */
  export async function markMomentSurfaced(
    db: Database,
    profileId: string,
    ledgerIds: string[],
  ): Promise<void> {
    if (ledgerIds.length === 0) return;
    await safeWrite(
      () =>
        db
          .update(mentorActivityLedger)
          .set({ surfacedAt: new Date() })
          .where(
            and(
              eq(mentorActivityLedger.profileId, profileId),
              isNull(mentorActivityLedger.surfacedAt),
              // inArray on ledgerIds — import inArray from 'drizzle-orm'
              inArray(mentorActivityLedger.id, ledgerIds),
            ),
          ),
      'activity-ledger.mark-surfaced',
      { profileId, count: ledgerIds.length },
    );
  }
  ```
  (Import `inArray` from `'drizzle-orm'` alongside `eq, and, isNull`.)
  **Usage example — wired into `auto-file-session.ts` after the existing `markSessionAutoFiled` step (`inngest/functions/auto-file-session.ts:104-107`), as a new best-effort step that never blocks the job:**
  ```ts
  // after the finalize-session step, before the return:
  await step.run('write-ledger-moment', async () => {
    const db = getStepDatabase();
    await writeActivityMoment({
      db,
      profileId,
      actorJob: 'auto-file-session',
      kind: 'session_filed',
      templateKey: 'ledger.session_filed.default',
      params: { topicTitle: result.topicTitle, bookId: result.bookId },
      visibility: 'self',
    });
    return { written: true };
  });
  ```
  **done when:** `apps/api/src/services/activity-ledger.test.ts` (T4a) proves the writer is non-throwing (passing a `db` whose `insert(...).values()` rejects → `writeActivityMoment` resolves, no throw, and `captureException` was invoked — Sentry is mocked as an external boundary), and that a successful insert passes the spec'd column values. The `auto-file-session.ts` edit is verified by `apps/api/src/inngest/functions/auto-file-session.test.ts` gaining one assertion that the ledger step runs after filing and that a thrown ledger error does not fail the function (T4b). `pnpm exec nx run api:typecheck` passes.

- [ ] **T5: Define `/now` request/response schema contracts in `@eduagent/schemas`.**
  Create `packages/schemas/src/now-feed.ts`; add `export * from './now-feed';` to `packages/schemas/src/index.ts`. Card `kind` enum, deep-link envelope, scope, query, card, overflow, and response shapes per spec §8.1 + Deliverable 2. The deep-link `route` is a closed enum (the route catalog keys, T8) — the server only emits catalog keys, never raw paths.
  ```ts
  import { z } from 'zod';

  export const nowScopeSchema = z.enum(['self']); // S0: self only. S4 adds 'supporter-hub' | 'person'.
  export type NowScope = z.infer<typeof nowScopeSchema>;

  export const nowCardKindSchema = z.enum([
    'unfinished_session',   // a learning_sessions row with status='active'
    'retention_due',        // a due retention_card
    'parked_item',          // a parking_lot_items row (explored=false)
    'needs_deepening',      // a needs_deepening_topics row (active)
    'challenge_ready',      // an assessment-eligible topic (challenge-readiness)
    'ledger_moment',        // a pending mentor_activity_ledger row
  ]);
  export type NowCardKind = z.infer<typeof nowCardKindSchema>;

  // Closed route catalog keys — see resolveDeepLink() route catalog (T8).
  export const nowDeepLinkRouteSchema = z.enum([
    'session.resume',       // /sessions/[sessionId]
    'subject.topic',        // /shelf/[subjectId]/book/[bookId]/topic/[topicId]
    'subject.hub',          // /shelf/[subjectId]
    'retention.review',     // /shelf/[subjectId]/topic/[topicId]/review
    'challenge.start',      // /shelf/[subjectId]/topic/[topicId]/challenge
  ]);
  export type NowDeepLinkRoute = z.infer<typeof nowDeepLinkRouteSchema>;

  // Deep link envelope: the closed route key + the full ancestor-chain params.
  // The mobile client expands `chain` into successive router.push calls
  // (cross-stack-push rule) — the server never ships a bare leaf path.
  export const nowDeepLinkSchema = z.object({
    route: nowDeepLinkRouteSchema,
    params: z.record(z.string(), z.string()), // e.g. { subjectId, bookId, topicId }
    chain: z.array(z.string()),               // ordered ancestor route keys to push first
  });
  export type NowDeepLink = z.infer<typeof nowDeepLinkSchema>;

  export const nowCardSchema = z.object({
    kind: nowCardKindSchema,
    templateKey: z.string(),                  // 'now.<kind>.<variant>' — Deliverable 2(c)
    params: z.record(z.string(), z.unknown()),
    deepLink: nowDeepLinkSchema,
    scope: nowScopeSchema,
  });
  export type NowCard = z.infer<typeof nowCardSchema>;

  export const nowOverflowItemSchema = z.object({
    kind: nowCardKindSchema,
    templateKey: z.string(),
    params: z.record(z.string(), z.unknown()),
    deepLink: nowDeepLinkSchema,
    scope: nowScopeSchema,
  });
  export type NowOverflowItem = z.infer<typeof nowOverflowItemSchema>;

  export const nowQuerySchema = z.object({
    scope: nowScopeSchema.default('self'),
  });

  export const nowResponseSchema = z.object({
    scope: nowScopeSchema,
    cards: z.array(nowCardSchema).max(3),     // ≤3 highlight ceiling (EU-3)
    overflowCount: z.number().int().min(0),   // how many waiting items beyond the top 3
    generatedAt: z.string(),                  // ISO; clients cache for the failure-mode fallback (§14)
  });
  export type NowResponse = z.infer<typeof nowResponseSchema>;

  export const nowOverflowResponseSchema = z.object({
    scope: nowScopeSchema,
    items: z.array(nowOverflowItemSchema),    // everything waiting beyond the top 3
  });
  export type NowOverflowResponse = z.infer<typeof nowOverflowResponseSchema>;
  ```
  **done when:** `packages/schemas/src/now-feed.test.ts` (T5a) asserts `nowResponseSchema` rejects a `cards` array of length 4 (the `.max(3)` ceiling), accepts length 0–3, that every `nowCardKindSchema` member is present, and that `nowDeepLinkSchema` requires `route` to be a catalog key (rejects an arbitrary string). `pnpm exec nx run schemas:typecheck` passes.

- [ ] **T6: Implement the deterministic ranking service `buildNowFeed()`.**
  Create `apps/api/src/services/now-feed.ts`. **No LLM call anywhere in this file.** It gathers candidates from five live sources + the ledger, scores them by a fixed priority, sorts with deterministic tie-breaks, slices the top 3, and reports the overflow count.
  > **Superseded (spec §2 / Annex D — do not re-propose):** an earlier direction had the LLM ranking the feed ("LLM as mastermind"). This is ruled out: ranking is deterministic and template-rendered; the LLM's home is the teaching conversation. LLM-assisted ranking can only return as a later, separately-ruled rung.

  The full algorithm is specified in `## Ranking algorithm` below — implement it exactly. All reads enforce `profileId`: single-table reads use `createScopedRepository(db, profileId)` (`packages/database/src/repository.ts:71`); the parent-chain joins (retention/needs-deepening through `subjects.profileId`) follow the sanctioned `db.select()` parent-chain pattern already used in `services/retention-data.ts:494-526` (enforce `eq(subjects.profileId, profileId)` in the WHERE).
  Business logic lives here (not in the route) per eslint G1/G5. The route (T7) only validates, calls `buildNowFeed`, and parses the response.
  **done when:** `apps/api/src/services/now-feed.test.ts` (T6a, unit) drives `buildNowFeed` with hand-built candidate sets and asserts: (a) ordering follows the priority table for a mixed set; (b) the deterministic tie-break (older `createdAt`/`nextReviewAt` first, then `id` asc) holds for same-priority items; (c) the result is capped at 3 and `overflowCount` equals `candidates.length - 3`; (d) a parked item that loses all 3 slots to higher-priority cards still appears in `buildNowOverflow` output (EU-3 reachability). `pnpm exec nx run api:typecheck` passes.

- [ ] **T7: Implement the `GET /now` + `GET /now/overflow` route group, scope-accepting.**
  Create `apps/api/src/routes/now.ts` exporting `nowRoutes` (Hono group, same `Env` shape as `routes/retention.ts:40`). Register it in `apps/api/src/index.ts` by adding `.route('/', nowRoutes)` to the chained `routes` builder (alongside `retentionRoutes` at `index.ts:264`). Both endpoints validate `scope` via `nowQuerySchema`; in S0 only `scope=self` is served. **Accept the param and document the supporter extension as S4 follow-on** (spec §8.1 supporter scopes need identity): if `scope` is anything other than `self`, return `400 VALIDATION_ERROR` — the schema's `z.enum(['self'])` makes any other value a validation failure today, and the S4 plan widens `nowScopeSchema` to add `'supporter-hub' | 'person'` plus a `personId` query param and the per-edge fairness rule. Add a top-of-file comment block stating: "S0 serves only `scope=self`. Supporter scopes (aggregated feed, per-edge fairness, attention items) are an S4 follow-on requiring the identity-foundation model; do not add a `person`/`edge` read here."
  ```ts
  export const nowRoutes = new Hono<NowRouteEnv>()
    .get('/now', zValidator('query', nowQuerySchema), async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { scope } = c.req.valid('query');
      const feed = await buildNowFeed(db, profileId, scope);
      return c.json(nowResponseSchema.parse(feed));
    })
    .get('/now/overflow', zValidator('query', nowQuerySchema), async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { scope } = c.req.valid('query');
      const overflow = await buildNowOverflow(db, profileId, scope);
      return c.json(nowOverflowResponseSchema.parse(overflow));
    });
  ```
  **done when:** `apps/api/src/routes/now.integration.test.ts` (T7a, integration — real Hono app, real DB, only Clerk JWKS + Neon passthrough mocked per the GC1 pattern in `routes/sessions.integration.test.ts:17-54`) asserts: (a) a seeded profile with an active session + a due retention card + a parked item gets a `200` with `cards` ranked per the priority table, each card carrying a valid catalog `deepLink`; (b) `overflowCount` is correct when >3 items wait; (c) **profileId scoping** — a second profile's due cards / parked items / sessions never appear in the first profile's `/now` (seed two profiles, assert isolation); (d) `GET /now?scope=person` returns `400`. `pnpm exec nx test:integration api` passes for this suite.

- [ ] **T8: Define the closed, server-validated route catalog with ancestor chains.**
  Inside `apps/api/src/services/now-feed.ts`, define `resolveDeepLink()` and a frozen `ROUTE_CATALOG` mapping each `NowDeepLinkRoute` key to (a) the required param names and (b) the ordered ancestor `chain`. The server only ever emits a `NowDeepLink` produced by this function — never an interpolated path string — so the mobile client receives a closed key + params + chain and pushes the **full ancestor chain** (cross-stack-push rule: a leaf push from another tab synthesizes a 1-deep stack and `router.back()` falls through to Home).
  > **Additional consumer (spec §2 P5 — no new S0 code needed):** the S1 bar-jump intent-matcher also resolves confident matches through this same closed catalog. The catalog's closed-set invariant (`nowDeepLinkRouteSchema` + `ROUTE_CATALOG` parity) must hold for bar jumps too. No new keys or code are added in S0; the intent-matcher itself is an S1 deliverable. Keep the set closed and deterministic.
  Catalog (final):
  ```ts
  const ROUTE_CATALOG = {
    'session.resume':   { params: ['sessionId'],                    chain: [] },
    'subject.hub':      { params: ['subjectId'],                    chain: [] },
    'subject.topic':    { params: ['subjectId', 'bookId', 'topicId'], chain: ['subject.hub'] },
    'retention.review': { params: ['subjectId', 'topicId'],         chain: ['subject.hub'] },
    'challenge.start':  { params: ['subjectId', 'topicId'],         chain: ['subject.hub'] },
  } as const satisfies Record<NowDeepLinkRoute, { params: readonly string[]; chain: readonly NowDeepLinkRoute[] }>;

  export function resolveDeepLink(
    route: NowDeepLinkRoute,
    params: Record<string, string>,
  ): NowDeepLink {
    const entry = ROUTE_CATALOG[route];
    for (const required of entry.params) {
      if (!params[required]) {
        throw new Error(`resolveDeepLink: missing param '${required}' for route '${route}'`);
      }
    }
    return { route, params, chain: [...entry.chain] };
  }
  ```
  **done when:** `apps/api/src/services/now-feed.test.ts` gains catalog assertions (T8a): `resolveDeepLink('subject.topic', { subjectId, bookId, topicId })` returns `chain: ['subject.hub']`; calling it with a missing param throws; `Object.keys(ROUTE_CATALOG)` deep-equals `nowDeepLinkRouteSchema.options` (catalog ⇔ schema parity — a forward-only guard that a new schema route without a catalog entry, or vice versa, fails the test). `pnpm exec nx run api:typecheck` passes.

- [ ] **T9: Reserve the `MODE_NAV_V2_ENABLED` env var name (API-side, parity only).**
  Add `MODE_NAV_V2_ENABLED: z.enum(['true', 'false']).default('false')` to the env schema in `apps/api/src/config.ts` (alongside the other `MODE_NAV_*`-adjacent flags — there is no API-side MODE_NAV flag today, so add it next to `LLM_ROUTING_V2_ENABLED:154` with a comment). This is **name reservation only** — S0 ships no code that reads it; the mobile shell consumes `MODE_NAV_V2_ENABLED` (from `EXPO_PUBLIC_ENABLE_MODE_NAV_V2`) in S1. Reserving it here freezes the canonical name for every downstream plan (Deliverable 2(e)) and keeps the env-validation surface honest. Add a comment: "S1 mobile-shell flag; reserved at S0 so the name is final. No API code reads this yet."
  **done when:** `apps/api/src/config.test.ts` gains one assertion that `validateEnv({ ...minimal, MODE_NAV_V2_ENABLED: 'true' })` parses and yields `MODE_NAV_V2_ENABLED === 'true'`, and that the default is `'false'` when omitted. `pnpm exec nx run api:test` passes for `config.test.ts`.

- [x] **T10: Draft `MMT-ADR-0022` in lockstep (spec §12 obligation #4). — DONE (renumbered from 0020 on 2026-06-12, WI-678)**
  `docs/adr/MMT-ADR-0022-activity-ledger-narration-substrate.md` exists. The lockstep canon edit is the `mentor_activity_ledger` rule in `docs/architecture.md` — added in the same change-set as the ADR file (WI-678). Decision: the `mentor_activity_ledger` is the append-only narration/moments substrate, template-first rendered (no LLM per row by default), and is **load-bearing for GDPR-timer countdowns** (spec §8.2). See the ADR for the full record (context, `profileId`-keyed / S4-repoint decision, template-first vs LLM-per-row tradeoff, additive-migration / no-rollback posture).

---

## Ranking algorithm (T6 — the complete spec, no TBD)

`buildNowFeed(db, profileId, scope='self')` returns `{ scope, cards, overflowCount, generatedAt }`. `buildNowOverflow(db, profileId, scope)` returns `{ scope, items }` = the full candidate list minus the top 3.

### Input sources (all `profileId`-scoped; `now = new Date()`)

| Candidate `kind` | Source query | Predicate | Card `templateKey` | `deepLink` |
|---|---|---|---|---|
| `unfinished_session` | `learningSessions` (scoped repo) | `status='active'`, most recent `lastActivityAt` first; take ≤1 (the single most recent) | `now.unfinished_session.default` | `session.resume` `{ sessionId }` |
| `retention_due` | `retentionCards` via parent-chain (`subjects.profileId`, pattern at `retention-data.ts:494`) | `nextReviewAt < now`, order `nextReviewAt ASC` (most overdue first) | `now.retention_due.default` | `retention.review` `{ subjectId, topicId }` |
| `needs_deepening` | `needsDeepeningTopics` via parent-chain | `status='active'` **AND** (`pendingExpiresAt IS NULL` OR `pendingExpiresAt > now`) — surface **before** expiry, reconciling with the existing clock (see backstop); order by `pendingExpiresAt ASC NULLS LAST`, then `createdAt ASC` | `now.needs_deepening.default` | `subject.topic` `{ subjectId, bookId, topicId }` |
| `challenge_ready` | `getAssessmentEligibleTopics(db, profileId)` (existing, `retention-data.ts:632`) | as-is (completed topic, ≥ min exchanges, no active assessment) | `now.challenge_ready.default` | `challenge.start` `{ subjectId, topicId }` |
| `parked_item` | `parkingLotItems` (scoped repo) | `explored=false`; order `createdAt ASC` (oldest first — see aging window) | `now.parked_item.default` | `subject.topic` `{ subjectId, bookId, topicId }` (or `session.resume` `{ sessionId }` when the item has no topic) |
| `ledger_moment` | `mentorActivityLedger` (scoped repo) | `surfacedAt IS NULL`; order `createdAt ASC` | `now.ledger_moment.<kind>` derived from the row's `kind` | depends on `kind` (`session_filed`→`subject.hub`; `topic_mastered`/`recap_ready`→`subject.topic`; `milestone_reached`→`subject.hub` when the milestone carries a `subjectId` in `params`, else no deep link — it is a celebratory receipt, not a navigation target; else `subject.hub`) |

Each row is mapped to a candidate `{ kind, priority, sortKey, tieId, templateKey, params, deepLink, scope }`. `deepLink` is built via `resolveDeepLink()` (T8) — never an interpolated string.

### Priority (lower number = higher rank)

```
P0  unfinished_session   // "continue where you left off" — strongest re-entry signal
P1  retention_due        // due SRS work — time-sensitive, decays if skipped
P2  needs_deepening      // active weak concept, bounded by pendingExpiresAt
P3  challenge_ready      // mastery opportunity (not yet due, not weak)
P4  parked_item          // park-and-return (P3 magic) — backstopped by aging (below)
P5  ledger_moment        // narration moment — informational, lowest urgency
```

### Aging / starvation backstop (EU-3, spec §8.1) — the two stores + precedence

The ≤3 cap is a **highlight ceiling, not reachability** (EU-3). Two mechanisms:

1. **Overflow.** Everything not in the top 3 is reachable via `GET /now/overflow` (`buildNowOverflow`) — the "more / everything waiting" payload. `overflowCount` in `/now` tells the client how many wait.

2. **Aging promotion (the deterministic backstop, per-store):**
   - **`parking_lot_items` (no expiry column).** Define a concrete window: **`PARKED_AGING_WINDOW_DAYS = 7`.** A `parked_item` whose `createdAt` is older than 7 days is **promoted from P4 to P1.5** (between retention_due and needs_deepening) so it can no longer be permanently outranked by fresh due-work and is guaranteed a top-3 highlight slot within the window. (Chosen as one SRS week — long enough not to nag, short enough that "later" reliably returns; this is the single source of the parked-item clock since the table has none.)
   - **`needs_deepening_topics` (has `pendingExpiresAt`).** **Do not invent a competing clock.** Reconcile with the existing `pendingExpiresAt`: a `needs_deepening` candidate whose `pendingExpiresAt` is within **`DEEPENING_SURFACE_LEAD_DAYS = 2`** of `now` is **promoted from P2 to P1.5** so it is surfaced **before** it expires. Rows already past `pendingExpiresAt` are excluded at the source query (they are no longer "active-and-pending" to the learner). The existing `pendingExpiresAt` is the authoritative clock; S0 only reads it.

   **Precedence between the two stores when both are promoted to P1.5:** `needs_deepening` (an identified weak concept on a real expiry deadline) outranks an aged `parked_item` (a self-noted "later" with a soft window). Concretely, within the P1.5 band the order is: aged-`needs_deepening` (by `pendingExpiresAt ASC`) **then** aged-`parked_item` (by `createdAt ASC`). Rationale: a topic the system *knows* is weak and is *about to lose its pending window* is more load-bearing for learning outcomes than a learner's parked curiosity, which the 7-day window will still surface shortly after.

### Sort & tie-break (deterministic — no LLM, no randomness)

Sort candidates by, in order:
1. effective `priority` ascending (after aging promotion).
2. `sortKey` ascending — the kind's time key: `retention_due`/aged stores by their date (`nextReviewAt` / `pendingExpiresAt` / `createdAt`), `unfinished_session` by `-lastActivityAt` (most recent first → smallest sortKey), others by `createdAt`.
3. `tieId` ascending — the row `id` (UUIDv7, monotonic) as the final deterministic tie-break so two same-priority same-timestamp rows always order identically across calls.

`cards = sorted.slice(0, 3)`; `overflowCount = Math.max(0, sorted.length - 3)`. `generatedAt = now.toISOString()`.

### Empty feed

If `sorted.length === 0`, return `cards: []`, `overflowCount: 0`. (The onboarding-proposal card of §14 "Empty feed" is an S1 client concern — S0 returns an honest empty feed; the route never 404s.)

### Surfacing side-effect (best-effort, non-core)

After computing `cards`, call `markMomentSurfaced(db, profileId, ledgerIds)` for any `ledger_moment` cards in the top 3 (`ledgerIds` = their row ids). This is fire-and-forget via `safeWrite` — a failure to stamp `surfacedAt` never fails the `/now` response (the row simply re-appears next call). Do **not** stamp overflow ledger rows (they were not surfaced).

---

## Tests

All co-located (no `__tests__/` dirs). Internal modules are never `jest.mock`'d (GC1) — only Sentry / Clerk JWKS / Neon-passthrough are mocked as external boundaries.

- **T1a** `packages/database/src/schema/activity-ledger.test.ts` — table export, column set, enum values, `visibility` default.
- **T3a** `packages/schemas/src/activity-ledger.test.ts` — kind/visibility/templateKey enums; templateKey ↔ kind naming-convention regex; `parseLedgerParams` fallback.
- **T4a** `apps/api/src/services/activity-ledger.test.ts` — `writeActivityMoment` non-throwing on insert rejection (asserts `captureException` called, promise resolves); successful-insert column values; `markMomentSurfaced` no-ops on empty ids.
- **T4b** `apps/api/src/inngest/functions/auto-file-session.test.ts` (extend existing) — ledger step runs after filing; a thrown ledger error does not fail the function (the writer swallows it).
- **T5a** `packages/schemas/src/now-feed.test.ts` — `nowResponseSchema` `.max(3)` rejection at length 4; card-kind membership; deep-link route enum closedness.
- **T6a / T8a** `apps/api/src/services/now-feed.test.ts` — full ranking-order test across a mixed candidate set; aging promotion for both stores (parked >7d → P1.5; needs_deepening within 2d of `pendingExpiresAt` → P1.5) and the P1.5 precedence (needs_deepening before parked); tie-break by `id`; cap-at-3 + `overflowCount`; the EU-3 reachability assertion (a parked item that loses all 3 slots still appears in `buildNowOverflow`); route-catalog parity (`Object.keys(ROUTE_CATALOG) === nowDeepLinkRouteSchema.options`) + missing-param throw.
- **T7a** `apps/api/src/routes/now.integration.test.ts` — real app/DB: ranked `/now` with valid catalog deep links; correct `overflowCount`; **two-profile isolation** (profileId scoping break test — profile B's due cards/parked items/sessions never surface for profile A); `?scope=person` → 400.
- **T9** `apps/api/src/config.test.ts` (extend) — `MODE_NAV_V2_ENABLED` parses and defaults to `'false'`.

**Run gates:** `pnpm exec nx run-many -t typecheck`, `pnpm exec nx run-many -t lint`, `pnpm exec nx run api:test`, `pnpm exec nx run schemas:test`, `pnpm exec nx run database:test`, and **`pnpm exec nx test:integration api`** (required — the pre-commit/pre-push hooks skip `.integration.test.` files, so the `/now` scoping test must be run explicitly before commit per the repo's Required-Validation rule).

---

## Self-review

**Spec coverage** (each S0 requirement → task):
- Activity ledger table, `profileId`-keyed, exact columns (§8.2, HIGH-1) → T1, T2. No `personId`/`edgeId` (§9) → T1 comment + Scope "out".
- Writer helper, `safeWrite` posture not literal `safeSend` (§8.2, LOW-2) → T4 (wraps existing `safeWrite`).
- `GET /now` deterministic, no-LLM, template-rendered, reads `retention_cards` as-is (§8.1) → T6, T7, ranking algorithm.
- Inputs: unfinished session, due cards, parked, challenge-readiness, ledger moments (§8.1) → ranking input table.
- ≤3 highlight ceiling + overflow affordance (EU-3, §8.1) → `nowResponseSchema.max(3)` + `overflowCount` + `GET /now/overflow` (T5, T6, T7).
- P3 two-store backstop: `parking_lot_items` (no expiry → 7-day window) + `needs_deepening_topics` (reconcile with `pendingExpiresAt`, surface before expiry) + **precedence** (MED-2, §8.1) → ranking "Aging backstop" section. Both stores confirmed against `sessions.ts:306` / `assessments.ts:163`.
- Closed server-validated route catalog, full ancestor chains (§8.1, cross-stack-push) → T8 + `nowDeepLinkRouteSchema`.
- Scope param accepted; S0 serves only `self`; supporter = S4 follow-on (§8.1) → T7 `nowScopeSchema=['self']`, 400 on other, S4 comment.
- Additive migration, no rollback needed (stated explicitly) → T2.
- ADR obligation #4 in lockstep (§12) → T10.
- Retention gate carved OUT to S0-R → Scope "out of scope" (top line) + Approach.

**Name consistency:** `mentorActivityLedger` / `mentor_activity_ledger` table; `ledgerVisibilityEnum` / `ledger_visibility`; `writeActivityMoment`, `markMomentSurfaced`; `buildNowFeed`, `buildNowOverflow`, `resolveDeepLink`, `ROUTE_CATALOG`; schemas `nowScopeSchema`, `nowCardKindSchema`, `nowDeepLinkRouteSchema`, `nowDeepLinkSchema`, `nowCardSchema`, `nowResponseSchema`, `nowOverflowResponseSchema`, `nowQuerySchema`; ledger `ledgerKindSchema`, `ledgerTemplateKeySchema`, `ledgerVisibilitySchema`, `parseLedgerParams`; env `MODE_NAV_V2_ENABLED`. All used identically across tasks, the ranking algorithm, the tests, and Deliverable 2.

**Deferred-decision scan:** aging windows are concrete (`PARKED_AGING_WINDOW_DAYS = 7`, `DEEPENING_SURFACE_LEAD_DAYS = 2`); precedence is decided (needs_deepening before parked in the P1.5 band); priority table is fully ordered; tie-break is `id`-final; empty-feed and scope-rejection behavior are specified. No "TBD"/"handle appropriately" remain.
