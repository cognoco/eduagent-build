---
title: S4 — Scope Chip + Support Hub + Person Scopes + Structural Rendering Mask — Implementation Plan
date: 2026-06-10
profile: code
spec: docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md
status: draft
---

# S4 — Scope Chip + Support Hub + Person Scopes + Structural Rendering Mask — Implementation Plan

**Goal:** Replace today's mode/proxy/tab-shape matrix with a single relationship-lens **scope chip** (Learner = no chip; Supporter = `[Support hub][person]…[Me if studying]`), back the supporter person-scope Subjects view with the **S2 hub component server-masked to structural columns and read LIVE from the supportee's own tables** (never an edge-replicated copy), widen `GET /now` to supporter scopes with a per-edge fairness rule, repoint the `mentor_activity_ledger` from `profileId → personId` + add `edgeId` as part of the identity migration, and retire the ModeSwitcher / proxy mode / tab-shape matrix behind the V2 flag while V0/V1 must not regress.

**Approach:** This is the **first phase that reads the identity-foundation person/edge graph** (§9 contract: no S0–S3 deliverable touches `person`/`supportership`/`guardianship`; S4 is where it begins). It builds (a) a server-side **scope-resolution service** that enumerates a Person's scopes from their `supportership` edges, (b) a **structural permission mask** that re-uses the S2 hub's read shapes but server-filters to the "grades layer" columns and live-reads the supportee's tables (never copies them), (c) the `/now` supporter-scope widening with per-edge fairness, (d) the ledger column repoint migration sequenced AFTER identity-foundation W1, and (e) the mobile scope chip + a V2-flag-gated retirement of the ModeSwitcher/proxy/tab-matrix. Every artifact-wall guarantee (§6.1) is enforced server-side with negative-path access tests, never client-side hiding. Out of scope: the linking ceremony, two-way transparency views, managed/credentialized tiers, graduation, and the revocation FLOW (all S5); cutover/deletion (S6).

---

## Blocked-by / Prerequisites

S4 cannot begin until ALL of the following land. Tasks here read or migrate the person/edge graph, which **does not exist in code today** (it is ratified design only in `docs/canon/identity/`). Starting before these land would build against absent tables.

1. **Identity-foundation W1 — the person/edge/membership schema** (`_wip/identity-foundation/2026-06-09-phase-o-master-plan.md` §1, `WP-W1-schema` — the 8-table baseline: `person`, `login`, `organization`, `membership`, `subscription`, `guardianship`, `supportership`, `consent_grant`). S4's scope resolution reads `supportership` (`supporter_person_id`, `supportee_person_id`, `revoked_at`); its structural mask scopes on `person_id`. **None of these tables exist until W1 ships.** W1 is itself gated on the W0 hard gate (`WP-W0-baseline` + the three patch-now units) clearing first.
2. **The baseline reset — `MMT-ADR-0012`** (one-time, pre-launch collapse of the migration chain to a fresh create-from-empty baseline; migration `0106` removed from the effective chain, NOT undone with a follow-up revert). The 8 identity tables are *born* in their target shape by this reset (`docs/canon/identity/data-model.md` §1). The ledger repoint migration (T9 here) is an **append-only** migration that lands AFTER the reset's baseline — it depends on `person` existing.
3. **`WI-530` — the Harness-Hygiene exit-gate work package** (eduagent's dev-execution harness rewired to replacement-parity 80/20 so Phase-P Cosmo slicing can begin; mirrored by Cosmo boundary node `WI-533`). **Phase P is blocked-by `WI-530`** (`ROADMAP.md` Harness-Hygiene block; master-plan §6). The identity rewrite (baseline reset → W1 → … → tail) is the first Cosmo dogfood and flows through Phase P **only once `WI-530` = done**. As of 2026-06-09 the workstream is IN PROGRESS but the `WI-530` gate node is not-started. Until W1 lands via that gated rewrite, S4 has no schema to consume.

**Sequencing note inside S4.** T9 (the ledger repoint migration) is itself **folded into the identity-foundation migration set** — it is an append-only migration that runs **after** W1's baseline, not a standalone S4 migration that races it. Treat T9 as "the S4-owned column on the identity migration train," landing in the same coordinated cluster as `WP-TAIL-reseed`-adjacent data work. The mobile-side tasks (T2–T6, T10–T12) may begin their non-schema scaffolding against the W1 schema as soon as W1 is green on staging; the server scope/mask tasks (T1, T7, T8) require W1 + the supportership edges seeded.

**Open decision that gates S4 (not this plan):** §13.2 "Identity-foundation sequencing confirmation" — S4/S5 assume the ratified `_wip/identity-foundation/` model lands first; the runway's own timeline must tolerate this consumer. Owner: product. This plan assumes a yes; it does not re-decide it.

---

## ADR obligation (owed in lockstep, per MMT-ADR-0000)

**Obligation #1 from spec §12** — *"One-shell/scope-chip model replacing mode/proxy/tab-shape matrix (affects S4) — supersedes parts of the navigation-contract design."* This is ADR-class (it is a contested, hard-to-reverse decision that supersedes the live `resolveNavigationContract` / `resolveTabShape` design rationale archived at `docs/_archive/specs/Done/2026-05-21-navigation-contract.md`). **T13 writes `MMT-ADR-0021` in the same change-set that lands the scope-chip seam (T10/T11)**; the `decision-adr-link` CI guard (`scripts/check-decision-adr-link.ts`) fails any spec/plan decision block that lacks a linked `MMT-ADR`. The ADR must record: the chip-scopes-replace-matrix decision, the V0/V1 must-not-regress constraint that keeps the old design alive behind flags until S6, and the canon line it changes (the navigation-contract section of `docs/architecture.md` + the spec §4/§7). **Obligation #2** (supporter visibility contract) and **#3** (managed/credentialized tier carrier) are S5-owned and are NOT written here — S4 only consumes the §6.1 contract's structural-read half.

---

## Scope

In scope:
- `apps/api/src/services/scope-resolution.ts` (new — enumerate a Person's scopes from `supportership` edges)
- `packages/schemas/src/scope.ts` (new — `scopeKindSchema`, `scopeDescriptorSchema`, `supporterScopeListSchema`)
- `apps/api/src/services/supporter-structural-mask.ts` (new — server-enforced structural permission mask; the §6.1 live-read mechanism)
- `apps/api/src/routes/scopes.ts` (new — `GET /scopes` + `GET /scopes/:personId/subjects` masked structural read)
- `apps/api/src/services/now-feed.ts` (extend — widen scope param, supporter-scope candidates, per-edge fairness)
- `packages/schemas/src/now-feed.ts` (extend — `nowScopeSchema` adds `'supporter-hub' | 'person'`; add `personId` query field)
- `apps/api/src/routes/now.ts` (extend — accept + route supporter scopes)
- `packages/database/src/schema/activity-ledger.ts` (modify — `profileId → personId`, add `edgeId`)
- `apps/api/drizzle/<NNNN>_*.sql` (append-only migration repointing the ledger; sequenced AFTER identity W1 baseline)
- `apps/api/src/services/activity-ledger.ts` (modify — writer signature `profileId → personId`, optional `edgeId`)
- `apps/mobile/src/components/chrome/ScopeChip.tsx` (new — the scope chip)
- `apps/mobile/src/lib/scope-context.tsx` (new — active-scope provider; EU-4 last-active/user-set default)
- `apps/mobile/src/hooks/use-navigation-contract.ts` (extend — V2 branch already seeded at S1; S4 adds the chip-driven scope set)
- `apps/mobile/src/app/(app)/_layout.tsx` (extend — mount `ScopeChip` in the V2 header in place of `ModeSwitcher`, behind `MODE_NAV_V2_ENABLED`)
- `docs/adr/MMT-ADR-0021-scope-chip-supersedes-nav-contract.md` (new ADR, lockstep)
- Co-located unit tests + integration tests (paths in `## Tests`)

Out of scope (must not change):
- **The linking ceremony, the linking flow, invite/accept** — S5. S4 reads existing `supportership` edges; it does not create them.
- **Two-way transparency views, the shared-record Journal cell, render-equivalence, the non-reportable class** (§6.1 EU-1, §6.3 Journal column for person scope) — S5. S4 renders the **Subjects** structural cell only; the person-scope Journal/shared-record is an explicit S5 follow-on and renders a "coming in S5" placeholder via the standard empty state, NOT a partial artifact read.
- **Managed/credentialized tier mechanics, graduation, the appeal affordance, decline=snooze persistence beyond the chip** — S5. (S4 implements decline=snooze *semantics for the chip-surfaced supporter cards* per EU-8, but the full attention-item lifecycle is S5.)
- **The revocation FLOW** (kid-initiated unlink, confirmation, supporter notice copy, grace window — EU-7) — S5. S4 only **retires a revoked scope from the chip**: when a `supportership` row has `revoked_at IS NOT NULL`, scope resolution excludes it (the partial-unique `WHERE revoked_at IS NULL` is the filter). The plain "Emma ended sharing" hub card and the grace window are S5.
- **V0 legacy (`legacy-navigation-contract.ts`, `resolveShellVisibleTabs`) and V1 (`resolveNavigationContract`, `resolveTabShape`) code paths** — these MUST NOT be edited. The §7 hard constraint requires `MODE_NAV_V0_ENABLED=false` (prod) and the V1 dev/preview state to keep producing today's exact shells until the S6 retirement ruling. The chip rides behind `MODE_NAV_V2_ENABLED` and short-circuits before V0/V1 logic, exactly as the S1 seam does.
- **Cutover / deletion of ModeSwitcher, proxy mode, `child/[profileId]/*`, tab-shape matrix** — S6. S4 stops *mounting* them in the V2 shell and supersedes them functionally, but the files stay alive flag-isolated.
- **`GET /now` ranking semantics for the learner Me scope** (S0) — unchanged; S4 only adds supporter-scope candidate sources + fairness on top.

---

## Surface map (files × responsibility)

| File | Responsibility |
|---|---|
| `schemas/src/scope.ts` | `scopeKindSchema` (`me`/`supporter-hub`/`person`), `scopeDescriptorSchema` (`{ kind, personId?, displayName?, label }`), `supporterScopeListSchema` |
| `services/scope-resolution.ts` | `resolveScopesForPerson(db, personId)` — enumerates Me + Support-hub + one person-scope per active `supportership` edge |
| `services/supporter-structural-mask.ts` | `readSupporteeStructuralSubjects(db, supporterPersonId, supporteePersonId)` — the §6.1 live-read-behind-mask; asserts the edge, returns ONLY structural columns |
| `routes/scopes.ts` | `GET /scopes` (the chip list), `GET /scopes/:personId/subjects` (masked structural hub read) |
| `services/now-feed.ts` (extend) | supporter-hub aggregated feed + person-scope feed + per-edge fairness rule (EU-3) |
| `schemas/src/now-feed.ts` (extend) | `nowScopeSchema` widened; `personId` query field; fairness is server-side (no schema change) |
| `routes/now.ts` (extend) | accept `scope=supporter-hub|person` + `personId`; reject mismatched combos |
| `schema/activity-ledger.ts` (modify) | column repoint `profileId → personId`; add nullable `edgeId` |
| `apps/api/drizzle/<NNNN>_*.sql` | append-only migration: rename/repoint ledger column + add `edge_id` (post-W1-baseline) |
| `services/activity-ledger.ts` (modify) | `writeActivityMoment` signature `profileId → personId`, optional `edgeId`; `markMomentSurfaced` likewise |
| `mobile/components/chrome/ScopeChip.tsx` | the chip UI: Learner renders nothing; Supporter renders the scope list; tapping switches active scope |
| `mobile/lib/scope-context.tsx` | active-scope provider; EU-4 default = last-active (persisted) or user-set, never hardwired hub |
| `mobile/hooks/use-navigation-contract.ts` (extend) | V2 branch returns the three-tab set; S4 feeds the chip's active scope into the contract |
| `mobile/app/(app)/_layout.tsx` (extend) | mount `ScopeChip` in the V2 header behind `MODE_NAV_V2_ENABLED`; `ModeSwitcher` mount untouched for V0/V1 |
| `docs/adr/MMT-ADR-0021-*.md` | ADR obligation #1 (scope-chip supersedes nav-contract parts) |

---

## Canon column-name reconciliation (read before T1/T7/T8/T9)

S4 cites the identity canon's **actual** table/column names (`docs/canon/identity/data-model.md`). Every person/edge reference below uses these — do not invent.

| Concept | Canon table | Canon columns S4 reads | Source |
|---|---|---|---|
| The human (scope key) | `person` | `id` (the `person_id` scope key for all learning data) | data-model.md §2, §4.1, §5.1 (`person_id` is the scope key) |
| Supporter→supportee edge | `supportership` | `supporter_person_id`, `supportee_person_id`, `revoked_at` | data-model.md §2 row, §4.7 (`UNIQUE (supporter, supportee) where revoked_at IS NULL`; indexes `(supportee_person_id)`, `(supporter_person_id)`) |
| Consent edge (NOT read for visibility) | `guardianship` | `guardian_person_id`, `charge_person_id` | data-model.md §4.6 — **consent-only, NOT a visibility grant** (inv 14); S4 must NOT derive supporter visibility from `guardianship` |
| Billing (access-inert) | `subscription` | `payer_person_id` | data-model.md §4.5 / §2A.4 — **access-inert**, never a visibility source (inv 17) |

**Visibility derivation rule (load-bearing, inv 8 / inv 9):** supporter visibility into another Person's learning data is **edge-derived from `supportership` ONLY**, edge-scoped to the named supportee, never org-wide and never from `membership` or `guardianship`. The structural mask (T7/T8) asserts an **active `supportership` row** (`revoked_at IS NULL`) from the requesting supporter to the target supportee before any read. A guardian who is NOT also a supporter has consent authority but **no everyday data-visibility scope in the chip** (a guardian view may be *derived* per `MMT-ADR-0008` `op(G,C)` but that is the guardian-operate path, distinct from the supporter person-scope this plan builds — see OPEN ITEM 2).

### S4 OPEN ITEMS (canon underspecifies — record, do not invent)

1. **`edgeId` has no canon column.** Spec §8.2 instructs the S4 migration to "add `edgeId`" to the ledger so a row can be attributed to the edge that produced it (e.g. a supporter-visible moment). **The identity canon defines no surrogate `edge_id`** — `supportership` and `guardianship` each have their own `id UUID PRIMARY KEY` (data-model.md §2A key convention: every surrogate PK is `uuid` v7), but there is no single polymorphic "edge" id. **Decision for this plan (recorded, ratified at S4 build, NOT invented silently):** `mentor_activity_ledger.edge_id UUID` is **nullable** and, when set, references **`supportership.id`** (the only edge that carries everyday data-visibility — inv 9). It is NULL for self-scope (`visibility='self'`) rows. A guardianship-attributed moment, if ever needed, is a future additive column (`guardianship_edge_id`) — NOT overloaded onto `edge_id`. **This polymorphism question is an S4 OPEN ITEM** flagged to the identity-foundation owner: confirm whether a single typed `edge_id` + `edge_kind` discriminator is preferred over the supportership-only FK before the migration lands.
2. **Guardian-operate vs supporter person-scope.** The canon's `op(G, C)` derivation (`MMT-ADR-0008`: `guardian-link ∧ shared-org ∧ charge-has-no-Login`) gives a guardian an *operate* capability over a managed charge — distinct from the *supporter* person-scope this plan builds (edge-scoped visibility, any age). **For S4, the chip person-scope is `supportership`-derived ONLY.** Whether a managed charge's guardian also gets a person-scope in the chip (via the derived guardian view) is an **S4 OPEN ITEM** for the identity owner; the launch tier is credentialized (managed activation deferred per §13.5), so the supportership-only path covers the live audience and the guardian-derived path can be added in S5 when managed activates. Default for S4: do not surface a guardian-only (non-supporter) person-scope.
3. **`displayName` source for a supportee.** The chip shows a person label ("Emma"). Canon `person.display_name NOT NULL` (data-model.md §4.1). The mask returns the supportee's `display_name` as the **only** identity field crossing the edge for the chip label — confirmed structural, not an artifact. No OPEN ITEM; recorded for completeness.

---

## Tasks

- [ ] **T1: Define scope contracts in `@eduagent/schemas`.**
  Create `packages/schemas/src/scope.ts`; add `export * from './scope';` to `packages/schemas/src/index.ts`. The descriptor is what the chip renders and what `/now` keys on.
  ```ts
  import { z } from 'zod';

  export const scopeKindSchema = z.enum(['me', 'supporter-hub', 'person']);
  export type ScopeKind = z.infer<typeof scopeKindSchema>;

  // A single chip entry. `personId` is present iff kind === 'person'.
  export const scopeDescriptorSchema = z
    .object({
      kind: scopeKindSchema,
      personId: z.string().uuid().optional(), // the supportee's person.id (kind='person' only)
      edgeId: z.string().uuid().optional(),   // supportership.id backing this person-scope (kind='person' only)
      displayName: z.string().optional(),     // supportee.display_name (kind='person'); undefined for me/hub
      label: z.string(),                      // chip copy key resolved client-side; server sends a stable label token
    })
    .refine((s) => (s.kind === 'person') === (s.personId !== undefined), {
      message: 'personId is required iff kind is person',
    })
    .refine((s) => (s.kind === 'person') === (s.edgeId !== undefined), {
      message: 'edgeId is required iff kind is person',
    });
  export type ScopeDescriptor = z.infer<typeof scopeDescriptorSchema>;

  // The ordered chip list. Supporter shape: [supporter-hub, person…, me?]; Learner shape: [].
  export const supporterScopeListSchema = z.object({
    shape: z.enum(['learner', 'supporter']), // learner = no chip; supporter = render the chip
    scopes: z.array(scopeDescriptorSchema),
    defaultScopeIndex: z.number().int().min(0), // EU-4: server's last-active/user-set hint; client may override from local store
  });
  export type SupporterScopeList = z.infer<typeof supporterScopeListSchema>;
  ```
  **done when:** `packages/schemas/src/scope.test.ts` (T1a) asserts: `scopeKindSchema.options` deep-equals `['me','supporter-hub','person']`; `scopeDescriptorSchema` rejects `{ kind: 'person' }` with no `personId`/`edgeId` and rejects `{ kind: 'me', personId: <uuid> }`; `supporterScopeListSchema` parses a learner shape (`scopes: []`) and a supporter shape. `pnpm exec nx run schemas:typecheck` passes.

- [ ] **T2: Implement `resolveScopesForPerson` against the `supportership` edge graph.**
  Create `apps/api/src/services/scope-resolution.ts`. Given the authenticated `personId`, enumerate the chip list: always a Me scope candidate; a Support-hub scope iff the Person holds ≥1 active `supportership` edge as **supporter**; one `person` scope per active outbound `supportership` edge. Active = `revoked_at IS NULL` (the partial-unique filter, data-model.md §4.7). Read `supportership.id` (→ `edgeId`), `supportership.supportee_person_id` (→ `personId`), and join `person.display_name` (→ `displayName`) for each. **Shape determination (§4.1):** if the Person is a supporter (≥1 active outbound edge) → `shape='supporter'` and the chip renders; else `shape='learner'` (no chip, single implicit Me). **Me-when-studying (§4.2 state 3):** the Me scope is included for a supporter only when they have their own learning activity (a learner membership role OR any `learning_sessions` row scoped to their `person_id`); a pure supporter with no study history gets `[supporter-hub, person…]` with no Me, per "no personal learner space until they actively start studying."
  All reads enforce `person_id` scope: the supportership lookup filters `eq(supportership.supporterPersonId, personId)`; the `person.display_name` join is the only supportee field crossing into the result and is structural (OPEN ITEM 3).
  **done when:** `apps/api/src/services/scope-resolution.test.ts` (T2a) — real DB, only Clerk JWKS / Neon-passthrough mocked (GC1) — asserts: (a) a Person with zero outbound supportership edges → `shape='learner'`, `scopes=[{kind:'me'}]`; (b) a Person with two active outbound edges → `shape='supporter'`, scopes `[supporter-hub, person(A), person(B)]`, each person-scope carrying the correct `edgeId`=`supportership.id` and `displayName`; (c) a **revoked** edge (`revoked_at` set) is **excluded** from the list (EU-7 chip-retirement: the scope disappears); (d) a supporter with no own study history has **no** Me scope; a supporter with a `learning_sessions` row gets a Me scope appended. `pnpm exec nx test:integration api` passes for this suite.

- [ ] **T3: Implement the server-enforced structural permission mask (the §6.1 live-read).**
  Create `apps/api/src/services/supporter-structural-mask.ts`. `readSupporteeStructuralSubjects(db, supporterPersonId, supporteePersonId)` is the §6.1 mechanism: it **(1) asserts an active `supportership` edge** from supporter→supportee (`eq(supportership.supporterPersonId, supporter)`, `eq(supportership.supporteePersonId, supportee)`, `isNull(supportership.revokedAt)`) and **throws `ForbiddenError` if absent**; **(2) reads the supportee's OWN tables live** (`subjects`/`curriculum_books`/`curriculum_topics`/mastery scoped via `subjects.personId = supporteePersonId` through the sanctioned parent-chain `db.select()` pattern), returning **ONLY structural columns** — subject name, chapter list, per-chapter/topic mastery state, last-activity timestamp, next-up. It **never** selects, joins, or returns notes, Journal content, mentor memory, chat transcripts, or any artifact column. This is **not** a copy: there is no shadow table, no replication, no sync — the supporter scope reads the supportee's live rows through this masked projection (resolves the §4↔§6.3 tension; the same hub *read shape* the S2 hub uses, server-filtered).
  The structural projection is the **exact same data the S2 hub renders for the owner** minus artifacts — reuse the S2 hub's structural read shape so the supporter sees a real, current "grades layer," not a re-render. (The S2 hub component itself is the mobile renderer; this server function feeds it the masked rows.)
  **done when:** `apps/api/src/services/supporter-structural-mask.test.ts` (T3a, integration) asserts: (a) with an active edge, the supporter gets the supportee's real subjects + mastery + next-up, byte-matching a direct owner read of the same structural columns (proving live-read, not a stale copy — mutate the supportee's mastery, re-read, the supporter sees the new value); (b) **negative-path access test** — a supporter with **no** edge to the supportee gets `ForbiddenError` (seed two unrelated Persons, attempt the read, assert the throw); (c) **negative-path artifact test** — the returned object has **no** key for notes/journal/memory/transcript, and a snapshot of the SQL (or a column-allowlist assertion) proves no artifact table is queried; (d) a **revoked** edge → `ForbiddenError` (the mask respects `revoked_at`). These are the §6.1 "no read path exists on any supporter edge" break-tests. `pnpm exec nx test:integration api` passes.

- [ ] **T4: Repoint the ledger schema `profileId → personId` and add `edgeId` (Drizzle).**
  Modify `packages/database/src/schema/activity-ledger.ts` (created in S0 keyed by `profileId`). Rename the column to `personId` (FK → `person.id`, `onDelete: 'cascade'`) and add `edgeId UUID` nullable (FK → `supportership.id`, `onDelete: 'set null'` — a revoked/dropped edge must not cascade-delete narration history; per OPEN ITEM 1, supportership-only for v1). Update the two indexes to key on `personId`. **This is the spec §8.2 repoint — it is folded into the identity-foundation migration set, NOT a standalone pre-W1 change.** The S0 plan's T1 comment ("DO NOT add those columns here — the S4 migration repoints") is the contract this task fulfills.
  ```ts
  // after identity W1: person + supportership exist
  personId: uuid('person_id').notNull().references(() => person.id, { onDelete: 'cascade' }),
  edgeId: uuid('edge_id').references(() => supportership.id, { onDelete: 'set null' }), // null = self-scope row
  ```
  **done when:** `packages/database/src/schema/activity-ledger.test.ts` (extend, T4a) asserts the table now has `personId` (not `profileId`), `edgeId` nullable, and the indexes key on `personId`. `pnpm exec nx run database:typecheck` passes.

- [ ] **T5: Generate the append-only repoint migration (post-W1-baseline).**
  Run `pnpm run db:generate:dev`. The migration must be **append-only against the identity baseline** (the `person`/`supportership` tables already exist from W1's `MMT-ADR-0012` reset): it renames `mentor_activity_ledger.profile_id` → `person_id`, re-points the FK to `person(id)`, adds `edge_id` with the `supportership(id)` FK, and rebuilds the two indexes. Because S0 ships pre-launch with zero ledger rows in production (the ledger started accumulating in dev only), the rename is data-safe; state this in the plan/PR. **`## Rollback` section required** — this migration *drops/alters* a column (the `profile_id → person_id` repoint alters an existing column and its FK), so per the repo Schema-And-Deploy-Safety rule a rollback note is owed: (a) rollback is possible pre-launch (re-point `person_id → profile_id` against `profiles`), (b) no production data lost (pre-launch, zero prod rows), (c) recovery = inverse migration; post-launch the rename is forward-only like every post-baseline migration.
  **done when:** the generated migration renames `profile_id → person_id`, adds `edge_id` with the `supportership` FK and the two repointed indexes, and contains a `## Rollback` block in the plan/PR. `pnpm run db:migrate:dev` applies cleanly against a dev DB that already has the W1 baseline. (Manual dev check; the migration lands on the identity migration train, not standalone.)

- [ ] **T6: Update the ledger writer signature `profileId → personId` + optional `edgeId`.**
  Modify `apps/api/src/services/activity-ledger.ts` (`writeActivityMoment`, `markMomentSurfaced`). `WriteActivityMomentInput.profileId` → `personId`; add `edgeId?: string` (set by supporter-visible producers, null for self-scope). All existing callers (the S0 wiring in `auto-file-session.ts` and any S0-R/S1–S3 producers) update `profileId: X` → `personId: X`. The non-throwing `safeWrite` posture is unchanged. **Sweep:** grep every `writeActivityMoment(` call site and repoint the key in the same PR (CLAUDE.md "sweep when you fix" — this is the N-site repoint, do all of them).
  **done when:** `apps/api/src/services/activity-ledger.test.ts` (T6a) proves the writer inserts a `personId`-keyed row with optional `edgeId`, remains non-throwing on insert rejection, and a `visibility='supporter'` row carries a non-null `edgeId` while a `visibility='self'` row carries null. A grep assertion (or the typecheck) confirms zero remaining `profileId:` keys at `writeActivityMoment` call sites. `pnpm exec nx run api:typecheck` passes; `pnpm exec nx run api:test` passes for the suite.

- [ ] **T7: Widen `nowScopeSchema` + add `personId` to the `/now` query contract.**
  Modify `packages/schemas/src/now-feed.ts` (S0 shipped `nowScopeSchema = z.enum(['self'])`). Widen to `z.enum(['self', 'supporter-hub', 'person'])` and add `personId` to `nowQuerySchema` (optional; **required iff `scope='person'`**, enforced by `.refine`). Keep the S0 `self` path byte-identical. The S0 route comment ("S0 serves only `scope=self`; supporter scopes are an S4 follow-on") is now fulfilled.
  ```ts
  export const nowScopeSchema = z.enum(['self', 'supporter-hub', 'person']);
  export const nowQuerySchema = z
    .object({ scope: nowScopeSchema.default('self'), personId: z.string().uuid().optional() })
    .refine((q) => (q.scope === 'person') === (q.personId !== undefined), {
      message: 'personId is required iff scope is person',
    });
  ```
  **done when:** `packages/schemas/src/now-feed.test.ts` (extend, T7a) asserts `scope='person'` without `personId` is rejected, `scope='self'` with `personId` is rejected, and `scope='supporter-hub'` (no `personId`) parses. `pnpm exec nx run schemas:typecheck` passes.

- [ ] **T8: Implement supporter-scope `/now` candidates + the per-edge fairness rule (EU-3).**
  Extend `apps/api/src/services/now-feed.ts`. Add two new scope branches to `buildNowFeed`/`buildNowOverflow`:
  - **`supporter-hub`:** the aggregated feed across ALL the supporter's active supportees (§6.3) — attention items + milestones per edge, plus supporter-addressed hub moments. Candidate sources are **structural-mask reads** (T3) per edge — never artifact reads. Every candidate is attributed with its `edgeId`.
  - **`person`:** the feed *about* one named supportee (`personId` + asserted edge) — that supportee's attention items + milestones only. Reuses the mask (T3) to assert the edge first (`ForbiddenError` if absent/revoked).
  **Per-edge fairness rule (EU-3, §8.1):** in the `supporter-hub` aggregation, each linked supportee is **guaranteed representation** in the top-3 stack OR the overflow before any single supportee takes a *second* top-3 slot. Concretely: round-robin one card per edge by edge priority first, then fill remaining slots by global priority — so a supporter with two struggling children never sees only one child's items in the top 3. **Decline = acknowledge/snooze (EU-8):** a declined supporter card is snoozed (a `snoozedUntil` marker on the surfaced state) and **re-surfaces while the underlying condition persists** — it never silently clears the attention flag. (S4 implements the snooze marker on the `/now` surfacing side; the full attention-item lifecycle is S5 — S4's job is that decline does not *lose* the signal.)
  All supporter-scope reads enforce the edge via T3's assertion. **No LLM in the ranking path** (S0 invariant holds).
  **done when:** `apps/api/src/services/now-feed.test.ts` (extend, T8a, unit + T8b integration) asserts: (a) `scope='supporter-hub'` with two linked supportees, one with 3 high-priority items and one with 1, yields a top-3 that **includes the second supportee's item** (per-edge fairness — without the rule the first supportee would take all 3); (b) `scope='person'` returns only that supportee's items, each carrying the correct `edgeId`; (c) **negative-path** — `scope='person'` with a `personId` the caller has no active edge to → `ForbiddenError` (the supporter cannot read an unlinked person's feed; seed an unrelated person, assert the throw); (d) a declined card is snoozed and re-appears on the next build while its condition persists (EU-8). `pnpm exec nx test:integration api` passes.

- [ ] **T9: Add the `/scopes` + `/now` supporter routes; register them.**
  Create `apps/api/src/routes/scopes.ts` (`GET /scopes` → `resolveScopesForPerson`; `GET /scopes/:personId/subjects` → `readSupporteeStructuralSubjects`, both validating + parsing through the schemas). Extend `apps/api/src/routes/now.ts` to accept the widened `scope`/`personId` and route to T8's branches. Register `scopesRoutes` in `apps/api/src/index.ts` (one `.route('/', scopesRoutes)` line alongside `nowRoutes`). Business logic stays in services (eslint G1/G5); routes only validate + delegate + parse.
  **done when:** `apps/api/src/routes/scopes.integration.test.ts` (T9a) asserts: (a) a supporter Person gets a `200` scope list with hub + person scopes; (b) `GET /scopes/:personId/subjects` for a linked supportee returns masked structural subjects; (c) **break-test** — the same call for a non-linked `personId` returns `403` (ForbiddenError → the API client's typed-error map); (d) `GET /now?scope=person&personId=<linked>` returns that supportee's feed and `?scope=person` with no `personId` returns `400`. `apps/api/src/routes/now.integration.test.ts` (extend) keeps the S0 `self` assertions green (no regression). `pnpm exec nx test:integration api` passes.

- [ ] **T10: Build the `ScopeChip` component + `scope-context` provider (EU-4 default).**
  Create `apps/mobile/src/lib/scope-context.tsx` — an active-scope provider that fetches `GET /scopes` (typed off `AppType` via the existing `api-client`), exposes `{ shape, scopes, activeScope, setActiveScope }`, and resolves the **default scope per EU-4: last-active scope from local persistence (SecureStore-safe key `scope.last-active`), else the server's `defaultScopeIndex` hint, NEVER a hardwired Support-hub default.** A supporter who is also a serious learner (§4.1/§4.2 state 3) lands in Me if Me was last active. Create `apps/mobile/src/components/chrome/ScopeChip.tsx` — when `shape === 'learner'` it renders **nothing** (no chip; single implicit Me, §4.1); when `shape === 'supporter'` it renders the horizontal scope list `[Support hub][person…][Me?]`, the active one highlighted, tapping `setActiveScope`. Uses semantic tokens (no hardcoded hex), all copy through `t()` (new keys in `en.json` same PR), persona-unaware. Loading/error use the shared `TimeoutLoader`/`ErrorFallback` (classify the raw error, never parse status).
  **done when:** `apps/mobile/src/components/chrome/ScopeChip.test.tsx` (T10a) asserts: (a) `shape='learner'` renders no chip element; (b) `shape='supporter'` renders one entry per scope with the active one marked; (c) tapping a person scope calls `setActiveScope` with that descriptor; (d) the default-scope resolution prefers the persisted last-active over the server hint (EU-4 — mock both, assert last-active wins). `apps/mobile/src/lib/scope-context.test.tsx` (T10b) asserts the provider fetches `/scopes` and seeds `activeScope` from persistence. Run `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/chrome/ScopeChip.tsx src/lib/scope-context.tsx --no-coverage`. `cd apps/mobile && pnpm exec tsc --noEmit` passes.

- [ ] **T11: Wire the chip into the V2 shell; retire ModeSwitcher/proxy/tab-matrix behind the flag.**
  Extend `apps/mobile/src/hooks/use-navigation-contract.ts`: the V2 branch (seeded at S1) now consumes `scope-context`'s `activeScope` so the three tabs render per-scope content (Me / supporter-hub / person — §6.3). Extend `apps/mobile/src/app/(app)/_layout.tsx`: in the V2 header, mount `<ScopeChip/>` **in place of** `<ModeSwitcher/>` **only when `MODE_NAV_V2_ENABLED`**. The existing `<ModeSwitcher/>` mount (`_layout.tsx:602`) stays for V0/V1 — **do not remove it**; gate the chip-vs-switcher choice on the V2 flag so V0/V1 keep their exact shell. The ModeSwitcher, proxy mode (`app-context.tsx` `setMode`/`derivedMode`), and the tab-shape matrix (`resolveNavigationContract`/`resolveTabShape`) are **functionally superseded** by the chip in V2 but **stay alive flag-isolated** (S6 deletes them after the §13.1 retirement ruling). Net effect mirrors the S1 seam: prod V0-on (chip absent, ModeSwitcher present, unchanged); dev/preview V1+V2 (V2 branch wins where it short-circuits, chip replaces switcher).
  **done when:** `apps/mobile/src/app/(app)/_layout.test.tsx` (extend, T11a) asserts: (a) with `MODE_NAV_V2_ENABLED=true` the header mounts `ScopeChip` and **not** `ModeSwitcher`; (b) with V2 off + V0 on, `ModeSwitcher` mounts and `ScopeChip` does not (V0 no-regress); (c) with V2 off + V1 on, the V1 shell is byte-identical to its pre-S4 state (V1 no-regress — snapshot or visibleTabs assertion). `apps/mobile/src/hooks/use-navigation-contract.test.ts` (extend, T11b) asserts the V2 branch maps `activeScope.kind` to the correct per-scope three-tab content and **never touches** `resolveTabShape`/`legacy-navigation-contract` when V2 is on. `cd apps/mobile && pnpm exec tsc --noEmit` passes; run the related-tests jest for both files.

- [ ] **T12: Person-scope Subjects renders the masked S2 hub; Journal/shared-record is an S5 placeholder.**
  In the V2 person-scope, the **Subjects** tab renders the **same S2 hub component** fed by `GET /scopes/:personId/subjects` (T9) — the structural rows only (§6.3 "same hub component, server-masked to structural columns, read live"). The hub component is unchanged; it receives masked rows and renders chapters/mastery/next-up with **no notes/artifacts surface** (the artifact UI elements are absent because the data is absent — there is no client-side hiding to bypass). The **Mentor** tab in person-scope renders the `/now` person feed (T8). The **Journal** tab in person-scope renders the standard empty state with an "available in a later update" message (the shared-record / two-way-transparency view is **S5** — explicitly out of scope here; S4 must not partial-read artifacts into it).
  **done when:** `apps/mobile/src/app/(app)/<v2-subjects-route>.test.tsx` (T12a) asserts: (a) in a person scope, the Subjects hub renders the supportee's masked subjects (structural rows present, no notes/artifact element rendered); (b) the person-scope Journal renders the S5 placeholder, not any artifact; (c) switching the chip from a person scope back to Me re-fetches the owner's own hub (scope isolation — the supportee's data does not leak into Me). Run the related-tests jest; `cd apps/mobile && pnpm exec tsc --noEmit` passes.

- [ ] **T13: Write `MMT-ADR-0021` in lockstep (ADR obligation #1).**
  Create `docs/adr/MMT-ADR-0021-scope-chip-supersedes-nav-contract.md` following the `MMT-ADR-0019`/`0020` format. Decision: the one-shell scope-chip model (Learner=no-chip / Supporter=hub+person+me) **supersedes the mode/proxy/tab-shape-matrix parts** of the navigation-contract design (`resolveNavigationContract`/`resolveTabShape`/`legacy-navigation-contract.ts` + the ModeSwitcher + proxy mode). Record: context (§4 relationship-lens model, §7 what-dies), the V0/V1 **must-not-regress** constraint (the superseded design stays alive flag-isolated until the §13.1 S6 retirement ruling), the canon line it changes (the navigation-contract section of `docs/architecture.md` + spec §4/§7), and the identity-coupling (chip reads `supportership`). **Lands in the same change-set as T10/T11** (the `decision-adr-link` CI guard fails a decision block with no linked `MMT-ADR`).
  **done when:** the ADR exists with all required sections, references the scope-chip / nav-contract supersession + the V0/V1 constraint, and `scripts/check-decision-adr-link.ts` (the `docs-checks.yml` → `decision-adr-link` job) passes for the spec/plan decision block. (Plan author runs the check locally.)

---

## Tests

All co-located (no `__tests__/`). Internal modules are never `jest.mock`'d (GC1) — only Sentry / Clerk JWKS / Neon-passthrough / LLM / push are mocked as external boundaries. The structural-mask and supporter-feed negative-path tests are **security break-tests** (CLAUDE.md "security fixes require a break test"): write the test, watch it pass against the edge-assertion, revert the assertion, watch it fail (the unlinked supporter would read artifacts/feed), restore.

- **T1a** `packages/schemas/src/scope.test.ts` — scope kind/descriptor/list shapes + the person↔personId/edgeId refinements.
- **T2a** `apps/api/src/services/scope-resolution.test.ts` (integration) — learner vs supporter shape; per-edge person scopes with correct `edgeId`/`displayName`; revoked edge excluded (EU-7 chip-retirement); Me-only-when-studying.
- **T3a** `apps/api/src/services/supporter-structural-mask.test.ts` (integration) — live-read (mutate→re-read sees new value, proving not-a-copy); **no-edge → ForbiddenError**; **no artifact columns returned / queried**; revoked edge → ForbiddenError. (The §6.1 "no read path exists" break-tests.)
- **T4a** `packages/database/src/schema/activity-ledger.test.ts` (extend) — `personId` not `profileId`; `edgeId` nullable; indexes on `personId`.
- **T6a** `apps/api/src/services/activity-ledger.test.ts` (extend) — `personId`-keyed insert; `edgeId` set for supporter rows / null for self; non-throwing preserved; no residual `profileId:` keys.
- **T7a** `packages/schemas/src/now-feed.test.ts` (extend) — widened `nowScopeSchema`; `personId` required-iff-person refinement.
- **T8a/T8b** `apps/api/src/services/now-feed.test.ts` (extend) — per-edge fairness (weaker supportee guaranteed a slot); person-scope feed carries `edgeId`; **no-edge person feed → ForbiddenError**; decline=snooze re-surfaces (EU-8).
- **T9a** `apps/api/src/routes/scopes.integration.test.ts` — scope list; masked subjects read; **403 on unlinked personId**; `/now` person routing + 400 on missing personId. Plus `now.integration.test.ts` extended to keep S0 `self` green.
- **T10a/T10b** `apps/mobile/src/components/chrome/ScopeChip.test.tsx` + `apps/mobile/src/lib/scope-context.test.tsx` — learner=no-chip; supporter renders list; tap switches; EU-4 last-active default beats server hint.
- **T11a/T11b** `apps/mobile/src/app/(app)/_layout.test.tsx` + `use-navigation-contract.test.ts` (extend) — V2 mounts chip not ModeSwitcher; **V0 no-regress** (ModeSwitcher present, chip absent); **V1 no-regress** (shell byte-identical); V2 branch never calls `resolveTabShape`/legacy contract.
- **T12a** `apps/mobile/src/app/(app)/<v2-subjects-route>.test.tsx` — person-scope masked hub (no artifact element); person-scope Journal = S5 placeholder; chip-switch scope isolation (no supportee leak into Me).

**Run gates:** `pnpm exec nx run-many -t typecheck`, `pnpm exec nx run-many -t lint`, `pnpm exec nx run api:test`, `pnpm exec nx run schemas:test`, `pnpm exec nx run database:test`, the mobile related-tests jest for each touched file, and **`pnpm exec nx test:integration api`** (required — the pre-commit/pre-push hooks skip `.integration.test.` files, so the scope/mask/feed scoping + ForbiddenError break-tests MUST be run explicitly before commit per the repo Required-Validation rule). The structural-mask and supporter-feed negative-path break-tests are mandatory for the CRITICAL/HIGH artifact-wall guarantee — run the red→revert→green→restore cycle and record it in the commit per the Fix-Verification rules.

---

## Self-review

**Spec coverage** (each S4 requirement → task):
- §4 scope = relationship lens, two account shapes (Learner=no chip / Supporter=`[hub][person]…[Me if studying]`) → T1, T2, T10.
- §4 EU-4 default scope = last-active / user-set, not hardwired hub → T10 (scope-context default resolution) + T1 (`defaultScopeIndex` hint, client may override).
- §4.2 supporter lifecycle 3 states (signed-up/linked/studying); Me only when studying → T2 (Me-when-studying); revocation = 4th state, **flow is S5**, S4 only retires the scope from the chip → T2(c) revoked-edge exclusion + Scope "out".
- §6.1 / §6.3 structural permission mask = S2 hub server-filtered to structural columns, read LIVE from supportee tables, NOT a copy; no artifact read path on any edge → T3 (mask) + T12 (hub render) + T3a break-tests.
- §6.3 EU-8 supporter decline = acknowledge/snooze, re-surfaces while condition persists → T8 (snooze marker) + T8a(d).
- §8.1 `/now` supporter-scope widening + per-edge fairness rule → T7 (schema), T8 (branches + fairness), T9 (routes).
- §8.2 ledger repoint `profileId → personId` + add `edgeId`, sequenced AFTER identity W1 → T4 (schema), T5 (migration, post-baseline, rollback note), T6 (writer + sweep).
- §7 ModeSwitcher + proxy + tab-shape matrix DIE → chip scopes; V0/V1 must-not-regress behind flags → T11 (chip replaces switcher in V2 only; V0/V1 untouched) + Scope "out".
- §9 identity-independent contract: S4 is where person/edge reads begin → Blocked-by section + T2/T3 (first `supportership`/`person` reads).
- ADR obligation #1 (scope-chip supersedes nav-contract parts) in lockstep → T13.
- Out of scope honored: linking ceremony / two-way transparency / managed-credentialized tiers / graduation / revocation FLOW (S5); cutover/deletion (S6) → Scope "out of scope".

**Name consistency:** `resolveScopesForPerson`, `readSupporteeStructuralSubjects`, `writeActivityMoment`/`markMomentSurfaced`, `ScopeChip`, `scope-context`/`setActiveScope`/`activeScope`; schemas `scopeKindSchema`/`scopeDescriptorSchema`/`supporterScopeListSchema`, `nowScopeSchema`/`nowQuerySchema`; canon tables `person`/`supportership`/`guardianship`/`subscription` with columns `person.id`/`display_name`, `supportership.id`/`supporter_person_id`/`supportee_person_id`/`revoked_at`; ledger `personId`/`edgeId`. Used identically across tasks, tests, and the surface map.

**Deferred-decision scan:** the three OPEN ITEMS (`edgeId` polymorphism, guardian-operate-vs-supporter-scope, displayName source) are explicitly recorded as S4 OPEN ITEMs flagged to the identity owner with a **concrete default for this plan** (edgeId = supportership.id nullable; guardian-only scope NOT surfaced at S4; displayName = person.display_name) — they are not "TBD" guesses, they are decisions-with-a-named-fork. EU-4 default resolution, fairness algorithm (round-robin then global priority), decline-snooze semantics, and the migration rollback posture are all concrete. No "TBD"/"handle appropriately" remain.

**Identity-coupling check (§9):** every person/edge read is in T2/T3/T8 (scope resolution, mask, supporter feed) — all S4. No earlier-phase deliverable was pulled in. The ledger repoint (T4/T5) is the only schema touch and is explicitly post-W1-baseline, append-only against the identity migration. The visibility derivation rule (supportership-only, never guardianship/membership) is enforced and break-tested, honoring inv 8/9/14.
