# AUDIT-BUILT-VS-DOCUMENTED — built-state vs documented-state reconciliation

**Date:** 2026-08-08
**Auditor:** Claude Code (Opus 5), supervised session, worktree `wi3122-execute-audit`
**Scope:** Enumerate present-tense state assertions in L1 canon, Accepted ADRs, and non-terminal
`_wip/` trackers; verify each against the repository and Cosmo; report the deltas. Assessment only —
this report records drift and edits nothing it audits.
**Status:** RECON COMPLETE (read-only — no fixes applied)
**Companion work item:** `WI-3122` — built-state vs documented-state reconciliation audit
(assessment only)
**Audited commit:** `019c72e36180cbe5a80f46ef9cf3e6f583c2b786` (`origin/main` at audit start).
Every `file:line` below is that revision.

---

## TL;DR

Sixteen verified contradictions across the 74-file bounded population. Twelve are in L1 canon —
`docs/architecture.md` carries eight of them (the other four are one each in
`docs/project_context.md` and `docs/deployment-and-secrets.md`, two in `docs/PRD.md`), including one
**doc-behind** claim that the mobile app has no i18n framework when react-i18next and seven locales
are live, and an epic-status row marking Epic 7 **DONE** on the strength of a `topic_prerequisites`
table that was never created. Two are
dead evidence pointers inside Accepted ADRs. Two are `w-state-stale`: the live `ACTIVE` program
roster reports five Work Items as Executing/Reviewing that Cosmo has Closed, and the approved
docs-tree mapping still plans against a `docs/meetings/` directory that has already moved. No
finding is remediated here; each is filed as its own Work Item.

## Severity

**YELLOW** — no finding is a correctness or safety defect, and none blocks shipping. The cost is
misdirection: two route-table rows and one route bullet would send an integrator to a 404, and the
Epic-7 and i18n rows would cause a planner to size work in the wrong direction. This is the drift
class `NEX-ADR-0000` §I.3.2 exists to name, and the roster finding is the same failure mode that
motivated `WI-3122` in the first place.

## Methodology

Reproducible from this repo root at the audited commit.

1. **Population regenerated** with the Acceptance Criteria's own commands:
   - (a) L1 canon, 9 files — `docs/architecture.md`, `docs/project_context.md`, `docs/PRD.md`,
     `docs/deployment-and-secrets.md`, plus `fd -e md . docs/canon` (5).
   - (b) Accepted ADRs — `rg -l '^\*\*Status:\*\* Accepted' docs/adr --glob 'MMT-ADR-*.md'`.
   - (c) W-state — `rg -l "^status:" _wip --type md` (28), each read for its status field and given
     an explicit terminal / non-terminal call (§ Terminal calls below).
   Totals: **74 files, 19,630 lines**.
2. **Extraction sieve.** Every backticked token (`` `…` ``) plus every unbackticked
   `SCREAMING_SNAKE`, `WI-\d+` and `MMT-ADR-\d{4}` was pulled with `file:line` provenance, then
   classified into the Acceptance Criteria's artifact classes — `PATH`, `FLAG` (env var / feature
   flag), `ROUTE`, `SCRIPT` (npm/pnpm), `SNAKE` (table/column), `CAMEL` (function/field), `WI`,
   `ADR`. Tokens matching no class are prose and were dropped.
3. **Resolution by artifact, not by document.** Each distinct token was resolved once against the
   repository — `git ls-files` for paths, `rg --fixed-strings --hidden` over `apps/ packages/
   scripts/ config/ eslint-rules/ tools/ tests/ .github/` for identifiers, `apps/api/drizzle/*.sql`
   (89 `CREATE TABLE` statements) for tables, `package.json` scripts for runners. One authoritative
   answer per artifact, applied to every line that names it.
4. **Hand adjudication of the residue.** Tokens that failed to resolve were read in context and
   judged against the candidate rule. Every token behind a finding below was then re-verified by
   hand — the automated resolver was treated as a triage filter, never as evidence.
5. **Two targeted passes the token sieve cannot reach**, because their assertions are about absence
   or status rather than about a name: negative-polarity claims (`no X`, `not yet`, `English only`,
   `deferred`) and status/epic tables (`DONE`, `Executing`, `Reviewing`).
6. **Cosmo verification** via `bun …/skills/execute/execute.ts fetch <WI-NN>` for the Work Items
   named in status claims in the live trackers.

### Extraction rule as applied

A candidate is a present-tense claim about built reality naming a mechanically checkable artifact.
Three sub-rules did the most work and are stated so another auditor converges:

- **Illustrative examples are not assertions.** A naming-conventions table whose Example column
  reads `topic_schedules` asserts a convention, not a table. Excluded (and disclosed below).
- **Migration-history and plan tables are not assertions.** `docs/architecture.md`'s
  "Current / Replace With" table describes the pre-migration stack; epic-implementation tables
  marked `(new)` describe planned files. Excluded.
- **An ADR body is a decision, not a state report.** An Accepted ADR ratifies a rule; the
  Acceptance Criteria puts "claims of intent, rationale, policy, or future plan" out by
  construction. Population (b) therefore yields candidates only where an ADR makes an *existence*
  claim about a repository artifact — a file path, a script, a job. This is the single largest
  determinant of (b)'s low yield and is disclosed below.

## Population deltas from the as-of date

- **(b) Accepted ADRs: 37, not the 36 fixed in the Acceptance Criteria.** The delta is
  `MMT-ADR-0055` (jurisdiction-aware consent completes by wiring the resolver), added
  2026-08-07 14:01 in commit `a407426` and **Accepted at creation**. It was already present at
  `af75fbe8a` (2026-08-07 17:34): diffing the Accepted set at `af75fbe8a` against the set at the
  audited commit yields an empty symmetric difference, so nothing was promoted `Proposed → Accepted`
  after the as-of date — the AC's count was simply taken earlier the same day. Because the file was
  created *on* the as-of date and not after it, `MMT-ADR-0055` is **in scope** and was audited.
  Proposed ADRs: 17, unchanged. Total `MMT-ADR-*.md`: 54.
- **(a) canon: 5 files, and (c) W-state: 28 files — both match.** Total population 74 files rather
  than the AC's 73, entirely from the ADR delta.
- Per the Acceptance Criteria, the delta is recorded and not chased.

## Terminal calls for population (c)

Rule, applied mechanically: **terminal** = the status asserts the effort finished, was superseded,
or was ratified *and* executed. **Non-terminal** = the status asserts liveness, ongoing work, an
unapplied ruling, or a pending gate. Only non-terminal files yield candidates.

| File | `status:` | Call |
|---|---|---|
| `_wip/identity-cutover/execution-tracker.md` | TERMINAL — completed; stamped 2026-08-07 | terminal |
| `_wip/identity-cutover/wp1-reader-writer-enumeration.md` | FINAL | terminal |
| `_wip/identity-foundation/2026-06-08-j0-disposition-inventory.md` | complete — ratified and executed | terminal |
| `_wip/identity-foundation/2026-06-08-phase-h-architecture-identity-carveout.md` | done | terminal |
| `_wip/identity-foundation/2026-06-08-phase-i-architecture-legacy-pass.md` | completed | terminal |
| `_wip/identity-foundation/2026-06-09-instruction-surface-cleanup-checklist.md` | TEMPORARY WORKING ARTIFACT | non-terminal |
| `_wip/identity-foundation/2026-06-09-instruction-surface-disposition-matrix-v0.md` | ROWS STILL REQUIRE VERIFICATION | non-terminal |
| `_wip/identity-foundation/2026-06-09-j1-memory-disposition-inventory.md` | EXECUTED 2026-06-09 | terminal |
| `_wip/identity-foundation/2026-06-09-j2-doctrine-routing-disposition.md` | EXECUTED 2026-06-09 | terminal |
| `_wip/identity-foundation/2026-06-09-j3-docs-tree-disposition.md` | EXECUTED 2026-06-09 | terminal |
| `_wip/identity-foundation/2026-06-09-phase-n-sequencing.md` | RATIFIED (forward sequence, no completion stamp) | non-terminal |
| `_wip/identity-foundation/2026-06-09-phase-o-master-plan.md` | RATIFIED (master plan) | non-terminal |
| `_wip/identity-foundation/2026-06-09-wi-531-pipeline-rule-memory-handoff.md` | HANDOFF FOR … EXECUTION | non-terminal |
| `_wip/identity-foundation/archive/2026-05-31-identity-org-membership-redesign.md` | superseded | terminal |
| `_wip/identity-foundation/archive/2026-05-31-identity-t1-data-model.md` | superseded | terminal |
| `_wip/identity-foundation/archive/2026-05-31-identity-t2-auth.md` | superseded | terminal |
| `_wip/umbrella-program/2026-07-12-stream-2-slice-plan-DRAFT.md` | DRAFT · awaiting operator ruling | non-terminal |
| `_wip/umbrella-program/2026-07-14-s2-01-decision-census.md` | RULED, riders outstanding | non-terminal |
| `_wip/umbrella-program/2026-07-14-s2-02-docs-tree-mapping.md` | APPROVED, execution = WI-2074/WI-2076 | non-terminal |
| `_wip/umbrella-program/2026-07-14-s2-03-principles-extraction-draft.md` | RULED (content still NOT applied) | non-terminal |
| `_wip/umbrella-program/2026-07-30-s2-06a-disposition-ledger.md` | Authored; awaits sign-off | non-terminal |
| `_wip/umbrella-program/2026-07-30-s2-06b-disposition-ledger.md` | Authored; awaits sign-off | non-terminal |
| `_wip/umbrella-program/activation-planning.md` | RATIFIED — analysis + charters | non-terminal |
| `_wip/umbrella-program/planning-reference.md` | CANONICAL for the umbrella program · v1 | non-terminal |
| `_wip/umbrella-program/program-roster.md` | ACTIVE | non-terminal |
| `_wip/umbrella-program/stream-2-backlog.md` | BACKLOG · home doc | non-terminal |
| `_wip/umbrella-program/supporting-artefacts/memory-cleanup.md` | results-final | terminal |
| `_wip/umbrella-program/supporting-artefacts/wi-587-ruling-sheet.md` | RULED … executed same day | terminal |

**13 terminal, 15 non-terminal.** The three trackers stamped terminal on 2026-08-07 (`af75fbe8a`) —
the confirmed `w-state-stale` case that motivated this item — were re-read and are
**verified consistent**: `_wip/identity-cutover/execution-tracker.md` carries its terminal banner and
appears above; `_wip/identity-foundation/execution-tracker.md` and
`_wip/identity-cutover/_state/SESSION-HANDOFF.md` carry equivalent banners but have no `^status:`
line, so the Acceptance Criteria's selector does not admit them to population (c) (see Audit honesty
disclosures).

## Coverage

Counts are per population, at the unit the audit actually verified — the distinct artifact token,
with its mention count in parentheses.

| | (a) L1 canon | (b) Accepted ADRs | (c) W-state, non-terminal |
|---|---|---|---|
| Files | 9 | 37 | 15 of 28 |
| Lines | 6,846 | 2,813 | 9,971 (all 28) |
| Artifact-bearing lines (sieve) | 1,186 | 569 | 1,701 (all 28) |
| **Distinct artifact tokens extracted** (mentions) | **597** (1,174) | **397** (948) | **648** (1,495) |
| — resolvable classes (`PATH` `FLAG` `ROUTE` `SCRIPT` `SNAKE` `CAMEL`) | 534 | 343 | 503 |
| — reference classes (`WI` `ADR`) | 63 | 54 | 145 |
| *Resolvable classes* — resolved mechanically | 494 | 318 | 452 |
| *Resolvable classes* — hand-adjudicated residue | 40 | 25 | 51 |
| — verified consistent | 5 | 0 | 19 |
| — excluded by the extraction rule | 25 | 22 | 25 |
| — **findings (tokens)** | **10** | **3** | **4** |
| — unresolved, with reason | 0 | 0 | 3 |
| *Reference classes* — `MMT-ADR` ids verified against `docs/adr/` | 33 | 40 | 35 |
| *Reference classes* — `WI-NN` ids fetched from Cosmo | 0 | 0 | 7 |
| *Reference classes* — `WI-NN` ids unresolved, with reason | 30 | 14 | 103 |
| Findings from the negative-polarity / status passes | 2 | 0 | 1 |
| **Findings, total** | **12** | **2** | **2** |

**Total unresolved with reason: 150** — 147 `WI-NN` tokens not fetched from Cosmo, plus the 3
repo-external paths described below.

Notes on the buckets:

- **Verified consistent** in (a): the negative assertions `no MODE_IDENTITY_V1 flag`
  (`docs/architecture.md:644`) and `There is no packages/factory/ package` (`:1477`) both hold;
  `pnpm --filter @eduagent/database db:migrate` resolves to a real script; and
  `age_method` / `residence_method` / `age_estimation_signal` (`docs/canon/identity/data-model.md:150-151`)
  are **value-set names, not columns** — the same document declares the columns as
  `age_knowing` / `residence_knowing` JSONB at `:146-147`, which is exactly what
  `packages/database/src/schema/identity.ts:103,105` ships. No drift.
- **Verified consistent** in (c): all 19 memory tokens in
  `_wip/identity-foundation/2026-06-09-wi-531-pipeline-rule-memory-handoff.md`. The nine
  `.claude/memory/feedback_*.md` paths it names are absent **because the document itself records
  them as deleted** (`:55-70`), and the ten `feedback_*`/`project_*` rows in its disposition table
  are marked `delete` for WI-387, which executed. The one row marked **KEEP-in-place**,
  `feedback_nx_reset_before_commit`, is still present. That handoff is accurate.
- **Excluded by the extraction rule** covers illustrative examples (7 in (a)), migration-history
  and plan-table rows (11 in (a)), explicit future/`v1.1` scoping (5 in (a)), ADR decision bodies
  (22 in (b) — see the disclosure below), and unexecuted plan *targets* in (c)'s mapping documents
  (`docs/registers/flows/`, `docs/specs/flows/`, `docs/canon/navigation/`, `docs/compliance/store/`
  and siblings), which are correctly absent because the plan has not run.
- **Reference classes.** 50 distinct `MMT-ADR-NNNN` ids are cited across the three populations; 49
  resolve to a file in `docs/adr/`. The one that does not — `MMT-ADR-0003` — is cited only at
  `_wip/umbrella-program/2026-07-30-s2-06a-disposition-ledger.md:21` and its sibling `06b:21`, both
  of which state that 0003 "is a pre-existing gap in the sequence and was deliberately **not**
  filled". The assertion is that the ADR is absent, and it is absent. Verified consistent.
- **Unresolved, with reason** — 3 tokens in (c), all absolute or repo-external paths into the
  `nexus` repository (`/Users/vetinari/nexus/_WIP/zdx-productionization/harness-hygiene-tracker.md`
  and two `_WIP/zdx-productionization/…` siblings). They name artifacts in a different repository
  and cannot be verified from this one. Verifying them is a cross-repo exercise, out of this item's
  bounded population.

## Findings

Each finding carries the three required fields: the `file:line` of the claim, the contradicting
artifact, and the direction of drift. Per the Acceptance Criteria the template's per-finding
severity / effort / track fields are omitted — sizing belongs to the spawned captures.

### Finding 1 — Epic 7 is marked DONE on a table that was never created

- **Claim:** `docs/architecture.md:1738` — `| Epic 7: Self-Building Library | `topic_prerequisites` join table, shelf/book/chapter hierarchy … | DONE |`
- **Contradicted by:** no `topic_prerequisites` table exists. `rg --fixed-strings topic_prerequisites` and `topicPrerequisites` return zero hits across `apps/` and `packages/`; no `CREATE TABLE topic_prerequisites` appears in any of the 89 tables declared across `apps/api/drizzle/*.sql`. The only in-repo occurrences are in documentation and one memory file.
- **Direction:** `doc-ahead`
- **Captured as:** WI-3147 (Epic 7 DONE cites a topic_prerequisites table that was never created)

### Finding 2 — the capability table says there is no i18n framework; seven locales are live

- **Claim:** `docs/architecture.md:1581` — `| i18n (UI) | English only for v1.0 — no i18n framework. Deferred to future release. |`
- **Contradicted by:** `apps/mobile/src/i18n/index.ts` (react-i18next, seven registered UI locales), and by the same document at `:1473` ("react-i18next and seven UI locales are implemented") and `:1768` ("7 locales … registered in `apps/mobile/src/i18n/index.ts`").
- **Direction:** `doc-behind`
- **Captured as:** WI-3148 (architecture.md says no i18n framework while react-i18next is live)

### Finding 3 — the learner language field is named `preferredLanguage`; the column is `conversationLanguage`

- **Claim:** `docs/architecture.md:1473`, and again at `:1582`, `:1640`, `:1768`
- **Contradicted by:** `packages/database/src/schema/identity.ts:112` — `conversationLanguage: text('conversation_language').notNull().default('en')`. `preferredLanguage` has zero occurrences in `apps/` or `packages/`.
- **Direction:** `doc-ahead`
- **Captured as:** WI-3149 (architecture.md names preferredLanguage; the column is conversationLanguage)

### Finding 4 — the cross-service-call example names a function that is not exported

- **Claim:** `docs/architecture.md:1273` — "`exchanges.ts` calls `getTopicSchedules()` from `retention.ts`"
- **Contradicted by:** `apps/api/src/services/retention.ts` exports `createInitialRetentionState` (`:42`), `processRecallResult` (`:79`), `isReviewDue` (`:161`), `canRetestTopic` (`:176`), `getRetentionStatus` (`:196`), `isTopicStable` (`:218`) — and nothing named `getTopicSchedules`. Zero hits repo-wide.
- **Direction:** `doc-ahead`
- **Captured as:** WI-3150 (architecture.md cites getTopicSchedules(), not an export of retention.ts)

### Finding 5 — an "existing `system_prompt_hash` approach" that does not exist

- **Claim:** `docs/architecture.md:1387` — "existing `system_prompt_hash` approach handles invalidation automatically"
- **Contradicted by:** zero occurrences of `system_prompt_hash` or `systemPromptHash` anywhere in `apps/` or `packages/`, and no such column in any migration.
- **Direction:** `doc-ahead`
- **Captured as:** WI-3151 (architecture.md describes a non-existent system_prompt_hash approach)

### Finding 6 — the Stripe webhook route is documented at the wrong path

- **Claim:** `docs/architecture.md:1500` — `| `/v1/stripe-webhook` | Stripe event processing | Stripe | Webhook signing secret |`
- **Contradicted by:** `apps/api/src/routes/stripe-webhook.ts:53` registers `.post('/stripe/webhook', …)`; the app mounts routes under `.basePath('/v1')` (`apps/api/src/index.ts:455`). The live path is `/v1/stripe/webhook`.
- **Direction:** `doc-ahead`
- **Captured as:** WI-3152 (architecture.md lists /v1/stripe-webhook; the route is /v1/stripe/webhook)

### Finding 7 — a `/v1/parking-lot/*` route family is documented but not registered

- **Claim:** `docs/architecture.md:1500` — `| `/v1/parking-lot/*` | Parking lot topics | — | Clerk JWT |`
- **Contradicted by:** `apps/api/src/routes/parking-lot.ts:48,64,80` — the only parking-lot paths are `/sessions/:sessionId/parking-lot` and `/subjects/:subjectId/topics/:topicId/parking-lot`. No route is registered under a `/parking-lot` prefix.
- **Direction:** `doc-ahead`
- **Captured as:** WI-3153 (architecture.md lists an unregistered /v1/parking-lot/* route family)

### Finding 8 — mobile offline caching is attributed to a file that does not exist

- **Claim:** `docs/architecture.md:1549` and `:1775` — the TanStack Query offline cache is persisted by `lib/storage.ts`
- **Contradicted by:** no `storage.ts` under `apps/mobile/src/lib/`. The AsyncStorage persister is `apps/mobile/src/lib/query-persister.ts` (identity-scoped since BUG-357, per its header at `:2-15`).
- **Direction:** `doc-ahead`
- **Captured as:** WI-3154 (architecture.md attributes offline caching to a non-existent lib/storage.ts)

### Finding 9 — a documented Challenge Round route is not implemented

- **Claim:** `docs/project_context.md:224` — "**Routes:** `POST /challenge-round/{maybe-offer,accept,decline,abort}`" and "'Too easy' mobile chip calls `/maybe-offer`"
- **Contradicted by:** `apps/api/src/routes/challenge-round.ts:25,41,57` registers exactly `/challenge-round/accept`, `/challenge-round/decline`, `/challenge-round/abort`. `apps/mobile/src/hooks/use-challenge-round.ts:77,90,103` calls only those three. `maybe-offer` and `maybeOffer` have zero occurrences repo-wide, tests included.
- **Direction:** `doc-ahead`
- **Captured as:** WI-3155 (project_context.md documents an unimplemented /challenge-round/maybe-offer)

### Finding 10 — `docs/known-issues/` is cited but has never existed

- **Claim:** `docs/deployment-and-secrets.md:684` — "Check this runtime-version section, `apps/mobile/.fingerprintignore`, and `docs/known-issues/` before re-attempting."
- **Contradicted by:** the directory is absent, and `git log --diff-filter=A -- 'docs/known-issues/*'` returns nothing — it was never created at any commit. (`apps/mobile/.fingerprintignore`, the sibling pointer on the same line, does exist.)
- **Direction:** `doc-ahead`
- **Captured as:** WI-3156 (deployment-and-secrets.md points at docs/known-issues/, never created)

### Finding 11 — the PRD names an absent file as the canonical pricing source

- **Claim:** `docs/PRD.md:1497` — "**Canonical Source:** Full pricing specification in `docs/Legacy/eduagent-pricing-specification.md`", and `:80` citing the same path
- **Contradicted by:** neither `docs/Legacy/` nor `docs/legacy/` exists, and no file matching `eduagent-pricing-specification` exists anywhere in the repository.
- **Direction:** `doc-ahead`
- **Captured as:** WI-3157 (PRD.md names an absent file as the canonical pricing source)

### Finding 12 — the PRD says epic planning content "has been moved to" a file that is absent

- **Claim:** `docs/PRD.md:1771` — "Epic-level planning content … has been moved to `docs/analysis/epics-inputs.md`", and `:390` deferring journey maps to the same path
- **Contradicted by:** `docs/analysis/epics-inputs.md` does not exist and was never added. (Distinguish from `docs/PRD.md:9-10`, whose `inputDocuments:` frontmatter also names absent `docs/legacy/*` paths — that is a historical provenance list, not a present-tense claim, and is excluded.)
- **Direction:** `doc-ahead`
- **Captured as:** WI-3158 (PRD.md points epic planning content at an absent docs/analysis/epics-inputs.md)

### Finding 13 — two Accepted ADRs cite `_wip/` evidence paths that moved

- **Claim:** `docs/adr/MMT-ADR-0013-policy-engine-spine.md:3` and `docs/adr/MMT-ADR-0014-router-runtime-vetting-split.md:3` cite `_wip/identity-foundation/policy-engine-spine-walkthrough/` as an **Input**; `MMT-ADR-0013:24` cites the PoC at `_wip/identity-foundation/age-consent-landscape/`.
- **Contradicted by:** commit `5bf80fba1` ("chore(_wip): tidy identity-foundation folder structure") moved them to `_wip/identity-foundation/_walkthroughs/policy-engine-spine-walkthrough/` and `_wip/identity-foundation/_research/age-consent-landscape/`. Both ADRs are `Status: Accepted`, so the evidence trail behind a ratified decision no longer resolves.
- **Direction:** `doc-ahead`
- **Captured as:** WI-3159 (MMT-ADR-0013/0014 cite _wip evidence paths that moved in 5bf80fba1)

### Finding 14 — `MMT-ADR-0015` cites a sweep report that was never committed

- **Claim:** `docs/adr/MMT-ADR-0015-data-model-amendment-pre-baseline.md:45` — "The sweep report is at `_wip/identity-foundation/charge-terminology-sweep-report.md` (109 edits across 13 files; verification PASS)"
- **Contradicted by:** no file of that name exists at any commit in the repository's history (`git log --all -- '*charge-terminology-sweep-report*'` is empty). The rename itself did ship — `charge_person_id`/`chargePersonId` are present across 92 and 102 files respectively — but the cited verification evidence is unretrievable.
- **Direction:** `doc-ahead`
- **Captured as:** WI-3160 (MMT-ADR-0015 cites a charge-terminology sweep report never committed)

### Finding 15 — the live program roster reports five Closed Work Items as still in flight

- **Claim:** `_wip/umbrella-program/program-roster.md` (`status: ACTIVE`) — `:605` and `:698`/`:245`: "WI-805 (drop legacy subscriptions) + WI-814 (staging reseed) **Executing**; WI-779/817 gated behind 805"; `:887`: "**G4 hangs on `WI-578` alone** (Executing)"; `:596`/`:140`: "WI-587 now **Reviewing**; only a manual `/cosmo:review` close remains"; `:73`: "`WI-569` executed + PR #845 merged (**Reviewing**)".
- **Contradicted by:** Cosmo at the audited time — **WI-805 Closed, WI-814 Closed, WI-817 Closed, WI-578 Closed, WI-587 Closed, WI-569 Closed** (`WI-779` is `Ready/Parked`, consistent with "gated"). Read via `bun …/skills/execute/execute.ts fetch <WI-NN>`.
- **Direction:** `w-state-stale`
- **Captured as:** WI-3162 (program-roster.md reports five Closed Work Items as Executing/Reviewing)

### Finding 16 — the approved docs-tree mapping plans against a directory that has already moved

- **Claim:** `_wip/umbrella-program/2026-07-14-s2-02-docs-tree-mapping.md:278` (§4.14 "`docs/meetings/**`"), rows 23 and 24 at `:152-153`, and `:281`, `:336`, `:358`; plus `_wip/umbrella-program/2026-07-14-s2-01-decision-census.md:464`. Status `APPROVED`, execution assigned to WI-2074/WI-2076 — so these rows are the instruction set a future executor reads.
- **Contradicted by:** `docs/meetings/` does not exist. All four named files now live in `docs/compliance/history/` — `2026-06-04-age-floor-decision-minutes.md`, `2026-06-05-launch-posture-decision-brief.md`, `2026-06-07-minors-compliance-requirements.md`, `age-country-explorer.html`. Both the source rows and the prescribed targets (`docs/_archive/meetings/`, `docs/compliance/minors-compliance-requirements.md`) are stated against a tree that has already moved, as is the §6 blocker the document flags.
- **Direction:** `w-state-stale`
- **Captured as:** WI-3161 (s2-02 docs-tree mapping plans against a docs/meetings/ that already moved) — the capture pipeline's dedup judge auto-linked it as a related item to **`WI-2066` (S2-02: docs-tree reorg mapping table — legacy doc → target home per ADR-0000 §I.4; `Stage=Backlog`)**, i.e. to the very item that would execute this mapping. The link is apt but the two are not duplicates: WI-2066 executes the mapping, WI-3161 says the mapping's source rows must be re-derived first. Triage should keep both.

## Routing of the captures

All sixteen findings were filed via `/cosmo:capture` with `--origin-wi WI-3122`, at
`Stage=Captured`, `WI-3147`–`WI-3162`. Two notes a reviewer should have rather than discover:

- **`Workstream` is deliberately unset on all sixteen.** Workstream routing for audit/governance
  items is an open question with the MentoMate PgM — `WI-3091`, `WI-3102` and `WI-3122` itself are
  already waiting on that ruling — so guessing a home for a batch of sixteen would be harder to
  undo than leaving them blank. `--origin-wi` inheritance (WI-1206) auto-copied `WI-3122`'s own
  Workstream ("Stream 2 — Estate-Canon Drain (PRG-20)") onto every row at creation; it was cleared
  on all sixteen immediately afterwards by a direct property PATCH. That PATCH is the only
  out-of-band Cosmo write this audit made, it touched no lifecycle field (`Stage`, `Fixed In`,
  claim props), and it is recorded here rather than left to be found.
- **Filing is where this item's scope ends.** Nothing filed here was fixed here.

## Out of scope / not checked

- **Correcting anything.** Operator-ruled 2026-08-05 and restated in this item's Acceptance
  Criteria: this audit records drift and edits no document it audits. Nothing under `docs/canon`,
  `docs/adr`, `docs/architecture.md`, `docs/project_context.md`, `docs/PRD.md`,
  `docs/deployment-and-secrets.md` or `_wip/` was touched. The two files this report does write are
  itself and its `docs/audit/INDEX.md` row, neither of which is in the audited population.
- **Any standing enforcement mechanism** — armed doc-claim check, drift ratchet, CI gate. Ruled out
  of scope pending both these findings and a ZDX/Nexus placement discussion. This report proposes
  none.
- **Undated-but-true state assertions** (`NEX-ADR-0000` §I.3.1) — a different and larger audit.
- **`AGENTS.md` / `CLAUDE.md` / `CONTEXT.md`.** Not in the bounded population. Worth noting for
  whoever scopes the next pass: `AGENTS.md` § Profile Shapes describes the identity target model as
  pending cutover, while the identity V2 tables (`person`, `login`, `organization`, `membership`,
  `guardianship`, `consent_grant`, `policy_cells`, …) are present in
  `packages/database/src/schema/identity.ts`. That is recorded here as a scoping observation, not
  as a finding — it was not verified to this report's evidentiary standard.
- **Files created after 2026-08-07.** None encountered; `MMT-ADR-0055` was created *on* the as-of
  date and is in scope (see Population deltas).

## Audit honesty disclosures

- **The sieve is name-based and will miss prose-only claims.** A present-tense assertion that names
  its artifact only in words — "the consent flag", "the scheduling table" — carries no extractable
  token and does not appear in the candidate counts. The two negative-polarity/status passes were
  added specifically because of this blind spot and found three of the sixteen findings, which is
  direct evidence the blind spot is real rather than theoretical. A prose-recall sweep is a
  different technique and was not run.
- **Population (b)'s low yield is a consequence of one stated rule.** Treating an ADR body as a
  decision rather than a state report excluded 22 of the 25 hand-adjudicated ADR tokens in one
  stroke — mostly identity schema columns in `MMT-ADR-0011`/`0013`/`0015`. An auditor who read
  Accepted ADRs as built-state reports would produce a materially larger (b) finding set. The rule
  is defended above and follows the Acceptance Criteria's exclusion of intent and policy, but it is
  the single most consequential judgment in this audit and a reader should know it was a judgment.
  Related: `MMT-ADR-0011`'s `ward_person_id` is absent because `MMT-ADR-0015` renamed it, and
  `charge_person_id` ships — an ADR superseded on a point by a later ADR is the chain working, not
  drift, and was recorded as such.
- **Mechanical resolution is an EXISTENCE check, not a predicate check — and this is the larger of
  the two blind spots.** The ~1,264 tokens resolved mechanically prove only that the named artifact
  is present somewhere in the tree. They do **not** verify what the sentence claims *about* it:
  "flag Z gates W", "nothing calls X", "column C is `NOT NULL`", "route R is registered", "service
  S owns the write" all pass a bare existence hit while their actual predicate goes unchecked.
  Predicate verification happened only for the hand-adjudicated residue and the two targeted
  passes. Finding 6 is the cautionary instance: `/v1/stripe-webhook` surfaced *because* the token
  happened to fail resolution — a mis-stated route whose token resolved anywhere in the tree would
  have passed silently. Treat the mechanically-resolved column as "the artifact exists", never as
  "the claim is true".
- **Cosmo verification was targeted, not exhaustive.** The population contains 154 distinct `WI-NN`
  tokens (30 in (a), 14 in (b), 110 in (c) non-terminal, 483 mentions in (c) alone). Seven were
  fetched from Cosmo — the ones carrying explicit lifecycle-status claims in the two live trackers,
  which is where a stale claim does damage. The other 147 are counted as **unresolved with reason**
  in the Coverage table, not as verified. The reason: they are references and provenance rather
  than status assertions, and a full 154-item sweep exceeds this item's bounded population. It is
  worth noting how the checked seven came out — **six of seven were stale** (Finding 15). That hit
  rate, not the raw remaining count, is the argument for a follow-up sweep; a 6-in-7 rate in the
  status-bearing subset says the unchecked 147 deserve a look by someone scoped to do it.
- **The automated resolver produced false positives in both directions and was not trusted.** Its
  first pass missed `.claude/` entirely (ripgrep skips hidden directories), which would have
  manufactured a dozen phantom findings about deleted memory files; its second pass falsely
  "resolved" `topic_prerequisites` against a prose mention in a memory file, which would have
  suppressed Finding 1. Every token behind a finding above was re-verified by hand against code,
  schema, migration SQL or Cosmo. The resolver's aggregate counts in the Coverage table are triage
  statistics, not evidence.
- **Two of the three trackers named in this item's origin story are outside its own population
  selector.** `_wip/identity-foundation/execution-tracker.md` and
  `_wip/identity-cutover/_state/SESSION-HANDOFF.md` carry terminal banners in prose but no
  `^status:` line, so `rg -l "^status:" _wip --type md` does not return them. They were read and are
  correctly stamped; they are reported as verified-consistent rather than silently included, because
  including them would have exceeded the stated population.
- **Findings 6 and 7 were judged, not merely matched.** `docs/architecture.md:685` lists
  `/v1/parking-lot` a second time, in a *naming-conventions* example table; that instance is
  excluded as illustrative and only the API-surface row at `:1500` is cited. The same rule excluded
  `topic_schedules` and two `idx_*` names at `:654`/`:657` — none of which exist either. An auditor
  who read convention-table example cells as existence claims would report three more findings.
- **Line numbers are pinned to `019c72e36`.** `main` moves under this worktree; other sessions
  landed on it during the audit. Re-verify a `file:line` against that commit before acting on it.
