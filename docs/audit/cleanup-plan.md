# Consistency Cleanup Plan

**Last updated:** 2026-05-03 23:00 UTC
**Branch:** `consistency`
**Replaces:** `docs/audit/2026-05-02-artefact-consistency-punchlist.md` (superseded; preserved as historical record only)
**Maintained by:** `/my:audit-status` skill (read mode refreshes PR/file claims; deviation mode appends to Deviations Log)

---

## Orientation

Living tracker for the artefact-consistency cleanup workstream. **This is not a recap of audit findings** — read the source recons (`docs/audit/2026-05-03-*.md`, `docs/audit/2026-05-02-consolidated-overview.md`) for evidence and reasoning. This doc tracks **what's left to do, who owns it, and what's blocked on a decision**.

### Stage model

Work is bucketed into three stages by status:

- **Stage 1 — Autonomous (`status: todo`, no `Owner`):** Subagent-executable work with files-claimed metadata. Coordinator dispatches; subagent fixes; coordinator commits.
- **Stage 2 — Blocked on decision (`status: blocked`):** Notes column carries `blocked on D-XXX` linking to Pending Decisions index. Once the decision lands, status moves to `todo` and an owner can claim.
- **Stage 3 — In-flight or shipped (`in-progress` / `review` / `done`):** PR column populated; coordinator drives.

### Reading the status tables

Each cluster table uses the audit-status skill schema:

```
| Phase | Description | Status | Owner | PR | Files-claimed | Notes |
```

- `Status` ∈ {`todo`, `in-progress`, `blocked`, `review`, `done`}
- `Owner` is agent name or empty (claim by setting it)
- `PR` is `#NNNN` GitHub number or commit hash for direct merges
- `Files-claimed` is a glob/path list — coordination metadata so two agents don't touch the same files concurrently
- `Notes` carries severity tag `[YELLOW]` / `[YELLOW-RED]` / `[RED]`, effort estimate, and decision-ID dependencies

---

## Pending Decisions (Stage 2 input)

Each ID below blocks one or more cluster phases. Resolve in any order; once resolved, mark blocked phases as `todo` and update Notes.

| ID | Decision needed | Source | Blocks | Recommendation |
|---|---|---|---|---|
| D-C4-2 | Brand/animation/celebration hex carve-out in CLAUDE.md | MOBILE-2b, MOBILE-2 F1 | C4 P2 | Codify the exemption — 13 files, 98 hex occurrences; without exemption, every future hex sweep re-flags them |
| D-C4-3 | `personaFromBirthYear()` root migration: replace with `computeAgeBracket()` across 5 callers, rename-only, or keep as-is with doc annotation? Root decision — cascades to RemediationCard, relearn.tsx, consent-copy callers, mentor-memory, CLAUDE.md wording. | Epic 12 persona-fossil sweep (2026-05-03 session) | C4 P7, C4 P8, CLAUDE.md tightening | Replace with `computeAgeBracket(birthYear)` — aligns vocabulary with Epic 12's three-axis model; eliminates the stale `'parent'` label for adult self-learners; 5 caller sites + 4 test mocks + function definition = ~15 files, ~1-2 hr |
| D-C4-4 | `relearn.tsx` `isLearner` fossil: delete dead branch (if teen path unreachable like RemediationCard) or migrate to age-bracket copy? Needs caller verification first. | Epic 12 persona-fossil sweep (2026-05-03 session) | C4 P8 | Verify whether any caller passes non-learner result; if all callers are learner-only, delete dead branch (~30 min); if teen path is reachable, migrate to `computeAgeBracket()` (~1 hr). Decision depends on D-C4-3 root migration approach. |
| D-C5-1a | Architectural call: which deps belong at root, which in `apps/mobile/`, which need explicit per-workspace declarations (the 83-row worksheet) | DEP-DRIFT-2 F1, AUDIT-DEPENDENCY-DRIFT-2-1a-DECISION | C5 P1 | Execute Buckets B + C — 30 deletes from root (23 Bucket B + 7 Bucket C); accept Bucket E removals; 1a-EXECUTE follows |
| D-C5-2 | Pin-style convention for SDK-coupled mobile deps: `~` (Expo recommendation) OR `^` (mobile current) | DEP-DRIFT-2 F6 | C5 P1 | `~` per Expo recommendation; align mobile during 1a-EXECUTE; document in CLAUDE.md |
| D-C6-1 | `jest.config.cjs` tsconfig switch: Option 1 (point at new `tsconfig.spec.json`) OR Option 2 (leave at `tsconfig.app.json`) | PACKAGE-SCRIPTS-2 F3-D | C6 P3 | Option 1 + smoke run — standard pattern, matches packages/database; Option 2 creates typecheck/jest config split |
| D-C6-2 | Maestro guard symmetry: (a) mirror barricade into nx, (b) drop the broken `nx.json targetDefaults.e2e` block, (c) keep both | PACKAGE-SCRIPTS-2 F4-3 | C6 P4 | (b) — `nx run mobile:e2e` doesn't match documented workflow; clean removal beats parallel maintenance |
| D-MEM-1 | Reconcile `docs/audit/claude-optimization/memory-overlap-flags.md` (recommends DELETE for some entries) vs. `2026-05-03-memory-drift-audit.md` (classifies same entries as REINFORCES) | memory-drift-audit cross-coupling | C7 P7 | Treat REINFORCES as authoritative — keep entries; mark older overlap-flags doc as superseded for affected entries |
| D-C7-1 | Stale plan/spec sweep — verify ~9 Active Work memory entries (project_f8_memory_source_refs, project_parent_visibility_spec, others uncertain) against `git log --since=2026-04-18`; archive shipped ones | Subagent D follow-up (memory sweep) | C7 P6 | Run sweep; partial-shipped entries need per-spec verification |

---

## Resolved Decisions

Decisions promoted from Pending to executable. Captured here so the rationale survives even after the affected cluster phases close.

| ID | Resolved | Decision | Resolution | Rationale |
|---|---|---|---|---|
| D-C1-1 | 2026-05-03 | Disposition of no-matching-route `*ResponseSchema` exports | **Hybrid (2 deletes + 2 renames + 1 deferred):** (a) Delete `internalQuizRoundResponseSchema` + `InternalQuizRoundResponse` (zero consumers anywhere). (b) Delete `homeCardsResponseSchema` + `HomeCardsResponse` (zero consumers — `HomeCard` singular type is separate and stays). (c) Rename `learnerRecapResponseSchema` → `learnerRecapLlmOutputSchema` (+ type alias `LearnerRecapLlmOutput`). (d) Rename `filingResponseSchema` → `filingLlmOutputSchema` (+ type alias `FilingLlmOutput`); **keep function name `buildFallbackFilingResponse` unchanged** — only the schema and type rename. (e) Defer adjacent `coachingCardCelebrationResponseSchema` → `pendingCelebrationsResponseSchema` rename to C1 P3 (the wrap PR), where celebrations.ts is already in scope. | Deletes match the strict "zero consumers" evidence bar set by `internalQuizRound*`. Renames give honest `*LlmOutputSchema` names that future SCHEMA-2 sweeps can filter by suffix convention. Function name kept stable to minimize cascade — type rename is the high-signal change. Adjacent rename deferred to keep D-C1-1 PR focused on dead-or-misnamed `*Response` exports without a real route. |
| D-C1-2 | 2026-05-03 | Disposition of `auth.ts` 501 stubs | **Delete the entire stub surface (Option 2, scope expanded post-verification).** Delete `apps/api/src/routes/auth.ts` (3 stub routes), `apps/api/src/routes/auth.test.ts` (9 test cases for 501 stubs), `packages/schemas/src/auth.ts` (3 schemas + 3 type aliases — zero consumers anywhere). Remove import + mount from `apps/api/src/index.ts:35` and `:199`. Verification confirmed: zero mobile callers, zero non-route consumers of the schemas, `@eduagent/factory.buildRegisterInput` is archival noise (the package doesn't exist on disk — separate ghost-package cleanup tracked under C8). | 404 surfaces real bugs that 501-with-explanation would mask. ERROR_CODES kept clean of non-error codes (`NOT_IMPLEMENTED` is "intentionally absent," not "something went wrong" — different concerns). Schemas had no consumers despite a JSDoc claim of mobile/Clerk client-side validation use — the JSDoc is aspirational; reality is dead code. Expanded scope = same direction, more dead code removed. |
| D-C4-1 | 2026-05-03 | `RemediationCard` persona-keyed strings governance | **Delete the dead branch (supersedes original "Allow + clarify CLAUDE.md" recommendation).** Epic 12 deleted `personaType`; `isLearner` is a Story-10.9 fossil missed by Story 12.5's literal-string `personaType` sweep. The single caller (`recall-test.tsx:215`) hard-codes `isLearner={true}`, so the teen branch is provably unreachable dead code. Delete `isLearner` prop + teen branch + `getCooldownMessage` teen path; hard-code learner copy. ~30 min YAGNI cleanup, not refactor. Also sweep 3 stale persona comments (`MentomateLogo.tsx:25`, `QuotaExceededCard.tsx:12`, `LivingBook.tsx:19`). Broader persona-fossil sweep surfaced `relearn.tsx` as a second `isLearner` fossil and `personaFromBirthYear()` as root cause — tracked separately as D-C4-3 and D-C4-4. | Original recommendation "Allow + clarify CLAUDE.md" was architectural backsliding post-Epic-12 — it would codify the exact failure mode that let the fossil survive Story 12.5's sweep. Both MOBILE-1 and MOBILE-2 deepenings asked "is the `isLearner` pattern OK?" without first asking "should `isLearner` exist at all?" (Epic 12 answered: no). The "2-4 hr refactor" cost estimate was wrong — actual cost is ~30 min dead-branch deletion at the real call-site count (1 caller, hard-coded `true`). |
| D-C1-3 | 2026-05-03 | SSE schema scope (error-frame only vs. unified envelope) | **Option 1: error-frame only.** Author `streamErrorFrameSchema = z.object({type: z.literal('error'), message: z.string()})` in `packages/schemas/src/stream-fallback.ts` (sibling to existing `streamFallbackFrameSchema`). Add `.parse()` at the 4 emission sites in `interview.ts:254-263, 413-418` and `sessions.ts:363-368, 507-511`. **Drop `apps/mobile/src/lib/sse.ts` from C1 P5 Files-claimed** — server-side validation only, no consumer-side change. Defer unified `streamFrameSchema` discriminated union (covering `chunk + fallback + done + error`) and mobile-consumer migration to new C1 P8 (blocked on P5 + production validation period). | Bounded blast radius beats theoretical completeness. Mirrors `streamFallbackFrameSchema` precedent (single-frame schema, not union). Bundling the consumer-side refactor with the server-side schema gap mixes risk profiles in one PR; debugging gets harder. After P5 ships and the `.parse()` pattern is validated, an envelope follow-up can revisit *with data* rather than committing to a design upfront. |

---

## Cluster status

### C1 — Schema contract enforcement

**Source:** TYPES-1, SCHEMA-2 plan, TYPES-2 deepening, baseline-delta
**Severity (recalibrated):** **RED** (gates C2 timing)
**Headline:** 12 wrappable c.json sites confirmed (down from naive ~36); 1 schema needs field added; 2 schema renames + 2 new response schemas needed; 1 SSE schema needed; 2 typed errors must move to `@eduagent/schemas`; 6 no-route schemas need disposition; 3 auth 501 stubs need disposition.

| Phase | Description | Status | Owner | PR | Files-claimed | Notes |
|---|---|---|---|---|---|---|
| P1 | AUDIT-TYPES-2.7 — Move `QuotaExceededError` + `ResourceGoneError` to `@eduagent/schemas/errors.ts`; convert `error.name === 'X'` checks to `instanceof` | todo | | | `packages/schemas/src/errors.ts`, `apps/mobile/src/lib/api-errors.ts`, `apps/mobile/src/lib/format-api-error.ts`, `apps/mobile/src/components/session/use-session-streaming.ts`, `apps/mobile/src/lib/api-client.ts` | [YELLOW-RED] ~1-2 hr. Smoking gun: 3 string-name workarounds. Half-migrated already (`QuotaExceeded` data type already imported from schemas). |
| P2 | AUDIT-TYPES-2.2 — Add `queued: z.boolean()` to `feedbackResponseSchema` before any wrap | todo | | | `packages/schemas/src/feedback.ts`, `apps/api/src/routes/feedback.ts` (verification only) | [YELLOW] ~15 min. Drift: route emits `{success, queued}` but schema declares only `{success}`. Naive wrap would silently strip `queued`. |
| P3 | AUDIT-TYPES-2.1 — SCHEMA-2 PR 1: wrap 12 ready-to-fit c.json sites with their existing schemas + rename `coachingCardCelebrationResponseSchema` → `pendingCelebrationsResponseSchema` during the celebrations wrap (per D-C1-1 deferral) | todo | | | `apps/api/src/routes/quiz.ts`, `apps/api/src/routes/account.ts`, `apps/api/src/routes/celebrations.ts`, `apps/api/src/routes/curriculum.ts`, `apps/api/src/routes/notes.ts`, `apps/api/src/routes/billing.ts`, `packages/schemas/src/progress.ts` (celebration-rename only) | [YELLOW] ~1 hr + ~10 min for rename. Mechanical pass. Net-zero risk; all 12 schemas verified shape-equivalent. Blocks C2 P3+. |
| P4 | AUDIT-TYPES-2.3 — Rename `quickCheckResponseSchema` → `*RequestSchema` and `consentResponseSchema` → `consentRespondRequestSchema`; author real response schemas | todo | | | `packages/schemas/src/assessments.ts`, `packages/schemas/src/consent.ts`, `apps/api/src/routes/assessments.ts`, `apps/api/src/routes/consent.ts` | [YELLOW-RED] ~1.5 hr. Names lie — schemas describe POST bodies. Must precede SCHEMA-2 PR 2 wrapping for these two routes. |
| P5 | AUDIT-TYPES-2.4 — Per D-C1-3: author `streamErrorFrameSchema = z.object({type: z.literal('error'), message: z.string()})` in `packages/schemas/src/stream-fallback.ts`; add `.parse()` at 4 emission sites (`interview.ts:254-263, 413-418`; `sessions.ts:363-368, 507-511`). Server-side only — no mobile consumer change. | todo | | | `packages/schemas/src/stream-fallback.ts`, `apps/api/src/routes/interview.ts`, `apps/api/src/routes/sessions.ts` | [YELLOW] ~30 min. Resolved by D-C1-3. Verify: targeted jest on interview + sessions route tests. |
| P8 | AUDIT-TYPES-2.4-FOLLOWUP — Unified `streamFrameSchema` discriminated union over `chunk + fallback + done + error`; migrate `apps/mobile/src/lib/sse.ts` to parse against the union; add `.parse()` at all chunk/done emission sites. | blocked | | | `packages/schemas/src/stream-fallback.ts`, `apps/api/src/routes/interview.ts`, `apps/api/src/routes/sessions.ts`, `apps/mobile/src/lib/sse.ts` (+ tests) | [GREEN] ~2 hr. **blocked on P5 landing + production validation period** (cf. D-C1-3 deferral rationale). Re-audit before claiming — may surface design refinements from P5 experience. |
| P6 | AUDIT-TYPES-2.5 — Resolve no-matching-route schemas per D-C1-1: delete `internalQuizRoundResponseSchema` + `InternalQuizRoundResponse` (`quiz.ts:180-190`); delete `homeCardsResponseSchema` + `HomeCardsResponse` (`progress.ts:385-389`); rename `learnerRecapResponseSchema` → `learnerRecapLlmOutputSchema` + type alias (sessions.ts + 2 consumer sites in `services/session-recap.ts` + `eval-llm/flows/session-recap.ts`); rename `filingResponseSchema` → `filingLlmOutputSchema` + type `FilingResponse` → `FilingLlmOutput` (filing.ts + ~17 consumer sites across `services/filing.ts`, `filing.test.ts`, `filing.integration.test.ts`); **do NOT rename function `buildFallbackFilingResponse`** | todo | | | `packages/schemas/src/quiz.ts`, `packages/schemas/src/progress.ts`, `packages/schemas/src/sessions.ts`, `packages/schemas/src/filing.ts`, `packages/schemas/src/filing.test.ts`, `apps/api/src/services/session-recap.ts`, `apps/api/eval-llm/flows/session-recap.ts`, `apps/api/src/services/filing.ts`, `apps/api/src/services/filing.integration.test.ts` | [YELLOW] ~2 hr. Resolved by D-C1-1 (see Resolved Decisions). Verify: `pnpm exec jest --findRelatedTests <renamed-files> --no-coverage` + `pnpm exec nx run api:typecheck`. |
| P7 | AUDIT-TYPES-2.6 — Per D-C1-2: delete entire auth stub surface. Delete files `apps/api/src/routes/auth.ts` (3 stubs), `apps/api/src/routes/auth.test.ts` (9 test cases), `packages/schemas/src/auth.ts` (3 schemas, zero consumers). Remove `import { auth }` + `.route('/', auth)` from `apps/api/src/index.ts` (lines 35 and 199). | todo | | | `apps/api/src/routes/auth.ts`, `apps/api/src/routes/auth.test.ts`, `packages/schemas/src/auth.ts`, `apps/api/src/index.ts` | [GREEN] ~45 min (expanded from ~30 — also removes dead test + schema files). Resolved by D-C1-2. Verify: `pnpm exec nx run api:typecheck` + `pnpm exec nx run api:test`. |

**Cross-coupling:**
- C1 P3 → unblocks C2 sweep (route tests can re-assert against schemas)
- C1 P4 must precede SCHEMA-2 PR 2 (current schemas can't validate the actual response shapes)
- C1 P5 (P6, P7 closely follow) constitute SCHEMA-2 PR 2 effective scope

---

### C2 — Test integration boundary

**Source:** TESTS-1, TESTS-2 deepening, baseline-delta (BUG-743 finding)
**Severity:** **YELLOW** (unchanged; guard exists for one channel; sweep + extend remains)
**Headline:** Real-DB harness already exists (`weekly-progress-push.integration.test.ts` is the migration exemplar). BUG-743 LLM mock guard is the precedent. TESTS-1 F2 was overstated (driver shim, not behavior mock). Sweep target: 3 LLM offenders + 6 inngest offenders. Two new guards (db, inngest) recommended.

| Phase | Description | Status | Owner | PR | Files-claimed | Notes |
|---|---|---|---|---|---|---|
| P1 | AUDIT-TESTS-2A — Extend BUG-743 guard pattern to `@eduagent/database` mocks in integration tests (forward-only, empty allowlist) | todo | | | `apps/api/src/services/db/integration-mock-guard.test.ts` (new) | [YELLOW] ~1-2 hr. Mirrors `apps/api/src/services/llm/integration-mock-guard.test.ts`. Pure forward fence — no current offenders. |
| P2 | AUDIT-TESTS-2B — Extend BUG-743 guard pattern to `inngest` mocks (initial allowlist of 6) | todo | | | `apps/api/src/inngest/integration-mock-guard.test.ts` (new) | [YELLOW] ~1-2 hr. Catches 5 known + 1 cross-channel offender. Precedes P4 sweep. |
| P3 | AUDIT-TESTS-2C — Drain LLM allowlist: migrate 3 KNOWN_OFFENDERS to HTTP-boundary or provider-registry pattern | todo | | | `apps/api/src/services/session-summary.integration.test.ts`, `apps/api/src/services/quiz/vocabulary.integration.test.ts`, `apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts` | [YELLOW] ~10-15 hr (3-6 hr per file). Migration target: `weekly-progress-push.integration.test.ts:1-637` or `learning-session.integration.test.ts:35-49`. |
| P4 | AUDIT-TESTS-2D — Drain inngest allowlist: sweep 5+1 known offenders | blocked | | | `tests/integration/{account-deletion,consent-email,learning-session,onboarding,stripe-webhook}.integration.test.ts`, `apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts` | [YELLOW] ~10-18 hr; parallelizable into 2-3 PRs. **blocked on P2 shipping first.** |
| P5 | AUDIT-TESTS-2E — Close TESTS-1 F2 as not-actionable (driver shim, not behavior mock) | done | | (closed in this plan) | n/a | [N/A] Documentation-only. See "Closed / revised" section below. |

**Cross-coupling:**
- P1, P2 are independent and parallelizable
- P3 should pair with C1 P3 wraps (route tests can re-assert against schemas once routes parse them)
- P4 unblocks AUDIT-INNGEST-2 observers being verifiable end-to-end (C7 P1)

---

### C3 — Mobile navigation safety nets

**Source:** MOBILE-1, MOBILE-2 deepening
**Severity:** **YELLOW** (unchanged)
**Headline:** Same 3 layouts MOBILE-1 named (`progress`, `quiz`, `child/[profileId]`) survive strict re-evaluation. `child/[profileId]` urgency increased — now 5 dynamic children (not 4) due to in-window `weekly-report` addition.

| Phase | Description | Status | Owner | PR | Files-claimed | Notes |
|---|---|---|---|---|---|---|
| P1 | MOBILE-1 1a / MOBILE-2 F5 — Add `unstable_settings = { initialRouteName: 'index' }` to 3 nested layouts | todo | | | `apps/mobile/src/app/(app)/progress/_layout.tsx`, `apps/mobile/src/app/(app)/quiz/_layout.tsx`, `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx` | [YELLOW] ~30 min total. Pattern reference: `apps/mobile/src/app/(app)/shelf/_layout.tsx:35`. |
| P2 | MOBILE-1 F2 — `AccordionTopicList` cross-tab push must push parent chain | todo | | | `apps/mobile/src/components/progress/AccordionTopicList.tsx` | [YELLOW] ~15-30 min. Direct violation of CLAUDE.md cross-tab push rule. |

**Cross-coupling:** None — independent of all other clusters.

---

### C4 — Mobile design system drift

**Source:** MOBILE-1, MOBILE-2 deepening, baseline-delta, **Epic 12 persona-fossil sweep (2026-05-03)**
**Severity:** **YELLOW-RED** (upgraded from YELLOW — persona-fossil sweep expanded scope significantly beyond hex-code cleanup)
**Headline:** 20 hex codes across 6 production .tsx files. 13 brand/animation/celebration files (98 occurrences) need governance carve-out. **Epic 12 persona-fossil sweep found:** RemediationCard `isLearner` dead branch (D-C4-1 RESOLVED → delete), `relearn.tsx` second `isLearner` fossil (D-C4-4 PENDING), `personaFromBirthYear()` root-cause function returning deleted vocabulary across 5 callers (D-C4-3 PENDING), 3 stale persona comments, ~8 stale `(learner)/` paths in UX design spec. Forward-only guard test needed. CLAUDE.md persona-unaware rule needs tightening against Epic 12's three-axis model.

| Phase | Description | Status | Owner | PR | Files-claimed | Notes |
|---|---|---|---|---|---|---|
| P1 | AUDIT-MOBILE-2a — Replace 20 hex literals across 6 production files with `tokens.colors.*` references | todo | | | `apps/mobile/src/app/(app)/session/index.tsx` (10 sites), `apps/mobile/src/app/(app)/child/[profileId]/index.tsx` (4), `apps/mobile/src/app/_layout.tsx` (3), `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx` (1), `apps/mobile/src/app/profiles.tsx` (1), `apps/mobile/src/components/library/NoteInput.tsx` (1) | [YELLOW] ~1-2 hr. All 20 sites have direct mappings in `apps/mobile/src/lib/design-tokens.ts`. `child/[profileId]/*` two files may bundle with profile-as-lens phase 2 if in flight. |
| P2 | AUDIT-MOBILE-2b — Codify brand/animation/celebration hex carve-out in CLAUDE.md "Non-Negotiable Engineering Rules" | blocked | | | `CLAUDE.md` (Non-Negotiable Engineering Rules section) | [YELLOW] ~15 min. **blocked on D-C4-2.** |
| P3 | Per D-C4-1: delete `RemediationCard.tsx` dead teen branch — strip `isLearner` prop (caller hard-codes `true`), hard-code learner copy, remove `getCooldownMessage` teen path, collapse divergent JSX trees to learner-only. Also sweep 3 stale persona comments: `MentomateLogo.tsx:25` ("regardless of persona"), `QuotaExceededCard.tsx:12` ("Persona-unaware"), `LivingBook.tsx:19` ("Callers map persona → boolean"). | todo | | | `apps/mobile/src/components/progress/RemediationCard.tsx`, `apps/mobile/src/app/(app)/topic/recall-test.tsx` (remove `isLearner` prop), `apps/mobile/src/app/(app)/topic/recall-test.test.tsx` (update mock), `apps/mobile/src/components/home/MentomateLogo.tsx`, `apps/mobile/src/components/session/QuotaExceededCard.tsx`, `apps/mobile/src/components/session/LivingBook.tsx` | [YELLOW] ~30 min dead-branch deletion + ~15 min comment sweep. Resolved by D-C4-1 (Epic 12 fossil — see Resolved Decisions). Verify: `pnpm exec jest --findRelatedTests <changed-files> --no-coverage`. |
| P4 | AUDIT-MOBILE-2c — Confirm `weekly-report/[weeklyReportId]` route is auto-discovered without explicit `<Stack.Screen>` registration | todo | | | `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx` | [GREEN-YELLOW] ~5 min. Layout explicitly registers 4 of 5 dynamic children with `getId`; verify whether `weekly-report` needs same treatment. |
| P5 | AUDIT-MOBILE-2d — Amend `2026-05-03-baseline-delta.md` C4 section (retract "10→7" claim, add filter funnel) + add second meta-pattern example (Story 12.5/12.6 `personaType` sweep missed `isLearner` — same mechanism as "audit grep narrower than architectural intent") | todo | | | `docs/audit/2026-05-03-baseline-delta.md` (lines 14, 89-103) | [GREEN] ~10 min. Cross-listed with C7 doc reconciliation. |
| P6 | EPIC-12-GUARD — Forward-only guard test: CI fails if any `apps/mobile/src/components/**/*.tsx` introduces `isLearner\|isTeen\|isAdolescent\|isParent\|personaType` props (excluding `isParentProxy` from `familyLinks`). Mirror BUG-743 / `integration-mock-guard.test.ts` pattern. | todo | | | `apps/mobile/src/components/persona-fossil-guard.test.ts` (new) | [YELLOW] ~30 min. Prevents post-Epic-12 regression. Independent of D-C4-3/D-C4-4. |
| P7 | EPIC-12-ROOT — Migrate `personaFromBirthYear()` to `computeAgeBracket()` across 5 callers: `_layout.tsx` (×2 consent copy), `session-summary/[sessionId].tsx`, `mentor-memory.tsx`, `relearn.tsx`. Rename function, update return values from persona labels to age-bracket labels, update all callers to branch on `'child'\|'adolescent'\|'adult'` instead of `'teen'\|'learner'\|'parent'`. Update 4 test mocks. | blocked | | | `apps/mobile/src/lib/profile.ts`, `apps/mobile/src/app/(app)/_layout.tsx`, `apps/mobile/src/app/session-summary/[sessionId].tsx`, `apps/mobile/src/app/(app)/mentor-memory.tsx`, `apps/mobile/src/app/(app)/topic/relearn.tsx`, + test files | [YELLOW-RED] ~1-2 hr. Root fix for all persona-vocabulary fossils. **blocked on D-C4-3.** |
| P8 | EPIC-12-RELEARN — Resolve `relearn.tsx` `isLearner` fossil: delete dead branch or migrate to age-bracket per D-C4-3 root migration. Verify caller pass patterns first. | blocked | | | `apps/mobile/src/app/(app)/topic/relearn.tsx`, `apps/mobile/src/app/(app)/topic/relearn.test.tsx` | [YELLOW] ~30 min (delete) or ~1 hr (migrate). **blocked on D-C4-4** (which itself depends on D-C4-3). |

**Cross-coupling:**
- P5 also lives in C7 (doc reconciliation). Owner should claim once.
- P7 (root migration) must land BEFORE P8 (relearn fix) — P8's approach depends on P7's vocabulary change.
- P6 (guard test) is independent — can land anytime, even before P3.
- P3 (RemediationCard deletion) is independent of P7/P8 — the dead branch is dead regardless of root migration approach.

---

### C5 — Manifest & dep-declaration hygiene

**Source:** DEP-DRIFT-1, DEP-DRIFT-2 deepening, baseline-delta
**Severity:** **RED** (largest structural violation in batch; phantom escalated 1→28 files)
**Headline:** 24 root↔mobile duplicates, 15 drifted at HEAD. 83-row reconciliation worksheet exists in DEP-DRIFT-2 F1 with bucket assignments (KEEP-at-root / MOVE-to-mobile / multi-workspace decision / under-declared / orphan). PR #144 doesn't touch manifests — 1a unblocked. `@eduagent/test-utils` phantom dep was DECLARED in commit `e622dd15` (pre-P0).

| Phase | Description | Status | Owner | PR | Files-claimed | Notes |
|---|---|---|---|---|---|---|
| P1 | AUDIT-DEPENDENCY-DRIFT-2-1a-EXECUTE — Apply 1a-DECISION worksheet directive (~30 deletes from root, reconcile 15 drifts in mobile's favor) | blocked | | | `package.json`, `apps/mobile/package.json`, `pnpm-lock.yaml`, `patches/react-native-css-interop@0.2.1.patch` | [YELLOW-RED] agent ~20-30 min, human review 1-2 hr. Shrinks root manifest from 83 to ~53 entries. **blocked on D-C5-1a + D-C5-2.** |
| P2 | AUDIT-DEPENDENCY-DRIFT-2-1b — Declare `@eduagent/test-utils` in `apps/api/package.json#devDependencies` | done | | `e622dd15` | n/a | [YELLOW-RED] Shipped pre-P0 alongside this plan-doc creation. Phantom now spans 28 api files. |
| P3 | AUDIT-DEPENDENCY-DRIFT-2-1c — Declare `@react-navigation/native` in `apps/mobile/package.json#dependencies` at expo-router-bundled version | todo | | | `apps/mobile/package.json`, `pnpm-lock.yaml` | [YELLOW] ~3 min agent. Read `node_modules/expo-router/package.json` first to derive correct pin. |
| P4 | AUDIT-DEPENDENCY-DRIFT-2-1d — Remove orphan `@neondatabase/serverless` from `apps/api/package.json` | todo | | | `apps/api/package.json`, `pnpm-lock.yaml` | [YELLOW] ~1 min. Used only in `packages/database/src` (correctly declared there). |
| P5 | AUDIT-DEPENDENCY-DRIFT-2-1e — Remove orphan `@clerk/types` from `apps/api/package.json#devDependencies` | todo | | | `apps/api/package.json`, `pnpm-lock.yaml` | [GREEN-YELLOW] ~1 min. Vestigial. |
| P6 | AUDIT-DEPENDENCY-DRIFT-2-1f — Verify and (if confirmed orphan) remove `expo-system-ui` from both root and mobile | todo | | | `apps/mobile/app.json` (read first), `apps/mobile/package.json`, `package.json`, `pnpm-lock.yaml` | [GREEN] ~5 min. Read `app.json` plugins block first to confirm orphan status. |
| P7 | AUDIT-DEPENDENCY-DRIFT-2-1g — Consolidate `onlyBuiltDependencies` into `pnpm-workspace.yaml` (dedupe `['@swc/core', 'nx']` ∪ `['esbuild', 'sharp']`) | todo | | | `package.json`, `pnpm-workspace.yaml` | [GREEN-YELLOW] ~3 min. |
| P8 | AUDIT-DEPENDENCY-DRIFT-2-1h — Schedule Prettier 3 upgrade as standalone PR (deferred) | todo | | | `package.json`, source files (auto-formatted diff) | [GREEN-YELLOW] agent ~10 min, human 30-60 min. Defer to a quiet window — keep noisy diff alone for clean blame. |

**Cross-coupling:**
- P1 should land before C4, C6, C7 if they're in flight simultaneously (manifest changes have wide rebase implications)
- P3-P7 are independent and parallelizable (different files except shared `pnpm-lock.yaml`)
- Lockfile coordination: any 2+ phases touching `pnpm-lock.yaml` should serialize

---

### C6 — apps/api config & E2E symmetry

**Source:** PACKAGE-SCRIPTS-1, PACKAGE-SCRIPTS-2 deepening, baseline-delta
**Severity:** **YELLOW** (unchanged; partial pre-P0 ship)
**Headline:** Stale `sessions.ts` drizzle Known Exception removed in `e622dd15` (PR #130 had silently fixed the underlying violation). Forward-only guard test still pending. `apps/api` needs explicit `eslint.config.mjs` + `tsconfig.spec.json` (NOT `tsconfig.lib.json` — it's an application, not a library). Maestro guard symmetry resolution pending.

| Phase | Description | Status | Owner | PR | Files-claimed | Notes |
|---|---|---|---|---|---|---|
| P1a | AUDIT-PACKAGE-SCRIPTS-2a (part 1) — Remove stale `sessions.ts` drizzle Known Exception from CLAUDE.md | done | | `e622dd15` | n/a | [YELLOW-RED] doc/code reality drift. Shipped pre-P0. |
| P1b | AUDIT-PACKAGE-SCRIPTS-2a (part 2) — Add forward-only guard test (BUG-743 pattern) blocking new `from 'drizzle-orm'` imports in `apps/api/src/routes/*.ts` | todo | | | `apps/api/src/routes/no-drizzle-orm-imports.test.ts` (new) | [YELLOW] ~30 min. Mirrors `integration-mock-guard.test.ts` structure. Guard-then-sweep complete (sweep already done by PR #130). |
| P2 | AUDIT-PACKAGE-SCRIPTS-2b — Add `apps/api/eslint.config.mjs` re-exporting root | todo | | | `apps/api/eslint.config.mjs` (new) | [YELLOW] ~10 min. Replaces PACKAGE-SCRIPTS-1b eslint branch. Behavior-preserving — net rules unchanged. |
| P3 | AUDIT-PACKAGE-SCRIPTS-2c — Add `apps/api/tsconfig.spec.json`; update `tsconfig.json` references; switch `jest.config.cjs` to spec config | blocked | | | `apps/api/tsconfig.spec.json` (new), `apps/api/tsconfig.json`, `apps/api/jest.config.cjs` | [YELLOW] ~30 min. Replaces PACKAGE-SCRIPTS-1d (which incorrectly proposed `tsconfig.lib.json`). **blocked on D-C6-1** (jest config switch decision). |
| P4 | AUDIT-PACKAGE-SCRIPTS-2d — Drop the broken `nx.json` `targetDefaults.e2e` block | blocked | | | `nx.json` (lines 71-87) | [YELLOW] ~10 min. **blocked on D-C6-2.** |
| P5 | AUDIT-EXTREFS-1 follow-on (PACKAGE-SCRIPTS-1a) — Rename `db:generate` → `db:generate:dev` for naming consistency with sibling scripts | todo | | | `package.json` (scripts), `CLAUDE.md` (Handy Commands), `docs/architecture.md` if cited | [YELLOW] ~10 min. Last `:dev`-suffix straggler from PR #131 sweep. |
| P6 | PACKAGE-SCRIPTS-1d — WITHDRAWN (replaced by P3, scoped down) | done | | (closed in this plan) | n/a | [N/A] Bookkeeping. See "Closed / revised" section. |

**Cross-coupling:**
- P1b lands clean — sweep already done
- P3 is a behavior-affecting change in test compilation; smoke run required pre-merge
- P5 is partial-cleanup of the rename PR #131 missed (the meta-pattern instance the audit batch is targeting)

---

### C7 — Doc & plan reconciliation

**Source:** AUDIT-INNGEST-2, AUDIT-SPECS-2, AUDIT-GOVERNING-1d, TYPES-1 F5, cleanup-triage 8 conflicts, memory-drift-audit
**Severity:** **YELLOW** (unchanged)
**Headline:** Three plan/doc reconciliations + 2 new Inngest observers + memory hygiene. RLS plan internally contradicts itself (header says 0.0 done, table says NOT DONE). SCHEMA-2 plan numbers superseded by TYPES-2.

| Phase | Description | Status | Owner | PR | Files-claimed | Notes |
|---|---|---|---|---|---|---|
| P1 | AUDIT-INNGEST-2 — Ship 2 new observer functions for orphan events (`app/ask.gate_*`, `app/email.bounced`) | todo | | | `apps/api/src/inngest/functions/ask-gate-observe.ts` (new), `apps/api/src/inngest/functions/email-bounced-observe.ts` (new), `apps/api/src/inngest/index.ts` | [YELLOW] ~10 min. Mirror existing `payment-failed-observe.ts`. Pairs with C2 P4 (Inngest sweep) for end-to-end verification. |
| P2 | AUDIT-SPECS-2 — Refresh RLS plan status table; archive stale "Implication" paragraph into `## Historical context` | todo | | | `docs/plans/2026-04-15-S06-rls-phase-0-1-preparatory.md` | [YELLOW] ~30-40 min. Plan internally contradicts itself; spot-check Phase 0.3 test content; run `pg_tables.rowsecurity` query for Phase 1.3. |
| P3 | AUDIT-GOVERNING-1d — Sweep CLAUDE.md `db:*` Handy Commands for resolution against current scripts. **Bundle:** tighten persona-unaware rule to anchor against Epic 12's three-axis model (age from `birthYear`, role from `familyLinks`, intent from session state). Also update `docs/ux-design-specification.md` ~8 stale `(learner)/` path references → `(app)/`. | todo | | | `CLAUDE.md` (Handy Commands + Non-Negotiable Engineering Rules), `docs/ux-design-specification.md` (lines 1978, 2102, 2122, 2311, 2457, 2515) | [YELLOW] ~30 min total (10 min db:* sweep + 10 min persona-rule tightening + 10 min UX spec paths). CLAUDE.md wording for persona rule depends on D-C4-3 root migration approach — apply after D-C4-3 resolves. |
| P4 | TYPES-1 F5 — Update `2026-05-02-audit-schema-2-plan.md` schema-count claim to TYPES-2 numbers (12 wraps + 2 renames + 2 new authors + 1 SSE schema) | todo | | | `docs/audit/2026-05-02-audit-schema-2-plan.md` (lines 22, 29) | [YELLOW] ~15 min. |
| P5 | AUDIT-MOBILE-2d — Amend `2026-05-03-baseline-delta.md` C4 section | todo | | | `docs/audit/2026-05-03-baseline-delta.md` | [GREEN] ~10 min. Cross-listed with C4 P5 — claim once. |
| P6 | D-C7-1 sweep — Verify ~9 Active Work memory entries against `git log --since=2026-04-18`; archive shipped | blocked | | | `.claude/memory/MEMORY.md`, `.claude/memory/project_*.md`, `.claude/memory/_archive/` | [YELLOW] ~30-60 min. Subagent D follow-up. **blocked on D-C7-1.** |
| P7 | D-MEM-1 reconciliation — Mark `docs/audit/claude-optimization/memory-overlap-flags.md` as superseded for entries the drift audit classified as REINFORCES | blocked | | | `docs/audit/claude-optimization/memory-overlap-flags.md` | [YELLOW] ~15 min. **blocked on D-MEM-1.** |

**Cross-coupling:**
- P1 + C2 P4 should land in close succession — observers without an unmocked dispatch path are wired-but-untriggered code
- P5 is the same edit as C4 P5
- P2 may also touch the deploy-safety story — couples loosely with C5

---

### C8 — Track C archeology

**Source:** Original cleanup-triage + DEP-DRIFT-1 + AUDIT-MIGRATIONS series
**Severity:** **GREEN-leaning-YELLOW** (unchanged; standalone-shippable janitor work)
**Headline:** Each item ships independently for clean git blame. No cross-coupling.

| Phase | Description | Status | Owner | PR | Files-claimed | Notes |
|---|---|---|---|---|---|---|
| P1 | AUDIT-MIGRATIONS-1 — Regenerate 10 missing snapshot files in `apps/api/drizzle/meta/` | todo | | | `apps/api/drizzle/meta/{0006-0010,0013,0021,0025,0043,0044}_snapshot.json` | [YELLOW] ~1 hr. Silent time bomb for next `drizzle-kit generate`. |
| P2 | AUDIT-MIGRATIONS-2 — Backward sweep of non-monotonic `_journal.json` `when` timestamps | todo | | | `apps/api/drizzle/meta/_journal.json` | [YELLOW] ~30 min. PR #129 only fixed entry 0044. |
| P3 | AUDIT-MIGRATIONS-3-SWEEP — Sweep all destructive migrations for missing `## Rollback` sections | todo | | | `apps/api/drizzle/0*_*.sql`, `docs/plans/migrations/*.md` | [YELLOW] ~2 hr. PR #135 only fixed migration 0017. |
| P4 | AUDIT-MEMORY-2 — `.claude/memory/` ~96-file dedupe | todo | | | `.claude/memory/*.md` | [YELLOW] ~1 hr. Low-impact but accumulates entropy. |
| P5 | AUDIT-SKILLS-2 — Vendored `commands/bmad/` vs installed plugin — pick canonical | todo | | | `.claude/commands/bmad/`, `.claude/plugins/` | [YELLOW] ~30 min. Cosmetic / maintenance. |
| P6 | AUDIT-EXTREFS-2 — EduAgent → Mentomate naming sweep across docs/code (NOT `@eduagent/*` package names) | todo | | | `docs/**/*.md`, `README.md`, `apps/**/*.{ts,tsx}` (string literals only) | [YELLOW] ~1 hr. Be precise — package names are protected. |
| P7 | AUDIT-EXTREFS-3 — Per-package READMEs for `apps/api/`, `apps/mobile/`, `packages/*` | todo | | | `apps/api/README.md`, `apps/mobile/README.md`, `packages/{database,schemas,test-utils,retention}/README.md` | [YELLOW] ~2 hr. Helpful but not urgent. |

**Cross-coupling:** None.

---

### C9 — Cleanup-triage (parallel track)

**Source:** `docs/audit/2026-04-30-cleanup-triage.md`
**Severity:** **YELLOW** (parallel-track; not summed into main effort estimate)
**Headline:** 164 active files in 3 categories + 8 inbound-link conflicts requiring co-changes with C7. Execution dominated by human review of category assignments.

| Phase | Description | Status | Owner | PR | Files-claimed | Notes |
|---|---|---|---|---|---|---|
| P1 | Cleanup-triage E1 — Process 25 Cat 1 (obsolete) files: archive or delete with link redirects | todo | | | per cleanup-triage doc; touches `docs/_archive/` | [YELLOW] varies. Couples with C7 P5/P3 for inbound-link integrity. |
| P2 | Cleanup-triage E2 — Process 23 Cat 2 (possibly-obsolete) files: per-file decision + archive | todo | | | per cleanup-triage doc | [YELLOW] varies. Each requires read + decide. |
| P3 | Cleanup-triage E3 — Process 8 inbound-link conflicts (couples with C7) | todo | | | per cleanup-triage doc + targets in C7 | [YELLOW] ~2-3 hr. Land alongside C7 P1-P5 — splitting causes broken cross-references during the window. |
| P4 | Cleanup-triage E4 — Verify 116 Cat 3 (keep) files have current relevance check | todo | | | per cleanup-triage doc | [GREEN-YELLOW] ~1 hr sample-based. Low priority. |

**Cross-coupling:**
- P3 ↔ C7 P1-P5 (inbound-link conflicts)
- P1, P2 may surface new audit findings (deviation log them)

---

## Cross-cluster sequencing

Structural information only — sequencing decisions belong to the user.

- **C1 ↔ C2 paired.** C1 will introduce runtime parsing on `c.json`; C2 should add test-side parsing in lockstep so schema drift is caught at CI rather than at production request time. Doing them serially means two passes across the same route+test pairs. C1 P3 is the gating side; C2 P3+ cannot meaningfully proceed without C1's wraps.
- **C5 P1 (1a-EXECUTE) is a parallel architectural call.** Can run any time; lockfile blast radius. Any deps-touching PR landed before P1 may cause merge conflict P1 must absorb. **PR #144 doesn't touch manifests** — current open window is safe. Land P1 early to lock that in.
- **C5 P3-P7 are independent of one another** except for shared `pnpm-lock.yaml` coordination. Two agents working different `package.json` files concurrently must serialize on the lockfile regen.
- **C6 P1a + C7** — CLAUDE.md correction is partial (P1a done) — couple any further `CLAUDE.md` edits with the new explicit configs landing.
- **C7 P1 + C2 P4** — Inngest observers must land alongside Inngest sweep (P4) so observers are verifiable end-to-end. Wired-but-untriggered code is worse than dead code.
- **Cleanup-triage (C9 P3) ↔ C7 P1-P5** — inbound-link conflicts must be reconciled in lockstep. Splitting creates a window where cross-references are broken.
- **C3 is independent** of all other clusters. Smallest dispatch surface.
- **C4 now couples to C7 P3** (CLAUDE.md persona-rule tightening). C4 P7 (root migration) should land before C7 P3 (CLAUDE.md edit) so the rule wording aligns with the actual code state. C4 P3 (RemediationCard dead branch) and C4 P6 (guard test) are independent and can land anytime.
- **C8 is independent** of all others. Each phase ships standalone.

### Parallel-work conflict gate (MANDATORY before Stage 3)

Before starting Stage 3 execution, re-sweep `origin/language-add` (320 files, i18n + library v3 + relearn redesign + post-session reflection) against the plan's Files-claimed columns. Initial sweep (2026-05-03) confirmed no decision inputs are invalidated, but **execution-time file conflicts are significant** — particularly C1 (schema/route files), C4 P7 (`_layout.tsx`), C5 (manifest/lockfile), and C7 P3 (CLAUDE.md). Run `git diff --name-only origin/main...origin/language-add` and cross-reference before claiming any phase that touches overlapping files. If language-add has merged to main by then, rebase `consistency` first.

---

## Closed / revised (audit honesty)

These items appeared in earlier audit docs but were demoted, contradicted, or already shipped silently. Listed here so future readers don't re-derive contradicted conclusions from originating audits.

| ID | Original claim | Actual state | Source of correction |
|---|---|---|---|
| TESTS-1 F2 | `@eduagent/database` mocked in `tests/integration/setup.ts` and `api-setup.ts` violates "no internal mocks in integration tests" rule | Driver shim swapping Neon HTTP for `pg` wire on non-Neon URLs; spreads `...actual` through. Required CI infrastructure, not a behavior mock. | TESTS-2 F3 |
| PACKAGE-SCRIPTS-1d | Add `apps/api/tsconfig.lib.json` mirroring `packages/*` shape | Wrong move — `apps/api` is an application not a library; would create shadow `build` target conflicting with explicit `wrangler deploy --dry-run` target. Replaced by C6 P3 (only `tsconfig.spec.json`). | PACKAGE-SCRIPTS-2 F2 |
| PACKAGE-SCRIPTS-1 F4 / CLAUDE.md "Known Exceptions" | `apps/api/src/routes/sessions.ts` imports `from 'drizzle-orm'` as sanctioned exception | Import removed by PR #130 (commit `8672bdcd`, 2026-05-02) silently. Zero route files import drizzle-orm at HEAD. CLAUDE.md exception entry removed in commit `e622dd15`. Forward-only guard test still pending (C6 P1b). | PACKAGE-SCRIPTS-2 F4-1 |
| baseline-delta C4 narrative | `session/index.tsx` shrank from 10→7 hex codes — partial fix without sweep, the cluster's own meta-pattern playing out on its own example file | Measurement artifact — baseline-delta ran 6-digit-only grep, dropping 3 three-digit hits at L191/211/238. File still has 10 occurrences at HEAD; zero churn since baseline. The meta-pattern claim still stands generally (the `35fd074a` consent example is solid), just not on this file. Amendment scheduled (C4 P5 / C7 P5). | MOBILE-2 F3 |
| 2026-05-02-audit-schema-2-plan.md (lines 22, 29) | ~50 response schemas exist; SCHEMA-2 PR scope is "wrap most" | 22 schemas exist; 9 wrappable as-is + 3 need authoring + 6 no-route disposition. Actual PR1 scope is 12 wraps; PR2 is rename + author + SSE. Update scheduled (C7 P4). | TYPES-1 F5, TYPES-2 F1 |
| TYPES-1 F2 | `quickCheckResponseSchema` and `consentResponseSchema` shape ambiguous | Conclusively classified: both are actually-request-shaped (the `*Response` suffix means "user's response", not "HTTP response"). Schema rename + new response-schema authoring scheduled (C1 P4). | TYPES-2 F2 |
| D-C4-1 original recommendation | "Allow + clarify CLAUDE.md ('prop-injected persona is persona-unaware')" — cheaper than refactor, architectural pattern otherwise clean | **Superseded by Epic 12 awareness.** Persona is not an architectural axis — it's a deleted concept (Epic 12). `isLearner` is a Story-10.9 fossil missed by Story 12.5's literal-string `personaType` sweep. The "allow" path would codify a pattern Epic 12 specifically eliminated. The "2-4 hr refactor" cost estimate was wrong (actual: ~30 min dead-branch deletion at the real call-site count of 1). Both MOBILE-1 and MOBILE-2 deepenings asked governance-posture questions without checking whether `personaType` still existed — a methodology gap, not a finding gap. | Epic 12 persona-fossil sweep (2026-05-03 session) |
| MOBILE-2 F4 severity | YELLOW (governance call pending, no code change required) | Upgraded to YELLOW-RED. The broader persona-fossil sweep discovered `relearn.tsx` as a second active `isLearner` violation and `personaFromBirthYear()` as root cause with 5 callers returning deleted vocabulary. C4 scope expanded from 5 phases to 8. | Epic 12 persona-fossil sweep (2026-05-03 session) |

---

## Already shipped (preserved from punch list)

Reference table only — these items are NOT in the cluster status tables (they'd false-positive the audit-status PR/file-claim refresh).

| ID | What | Where |
|---|---|---|
| AUDIT-INNGEST-1 | payment.failed observer | PR #132 (`4b63e4b4`) |
| AUDIT-SCHEMA-1 | mobile aiFeedback nullability | PR #132 (`ba3db196`) |
| AUDIT-SKILLS-1 | broken pre-commit hook removed | PR #132 (`11cd1346`) |
| AUDIT-EVAL-1 | Tier 2 runLive inertness documented | PR #132 (`9a4af1d7`) |
| AUDIT-EXTREFS-1 | `db:*:stg` → `db:*:dev` rename (3 of 4 — `db:generate` straggler tracked as C6 P5) | PR #131 |
| AUDIT-GOVERNING-1a | CLAUDE.md Snapshot counts refreshed | PR #131 |
| AUDIT-GOVERNING-1b | "Known Exceptions" subsection added | PR #131 |
| AUDIT-GOVERNING-1c | `ux-dead-end-audit` skill citation removed | PR #131 |
| AUDIT-ARCH-1 | architecture.md drizzle/AppType/route fixes | PR #131 |
| AUDIT-SPECS-1 | plan-status refresh on 4 active plans | PR #131 |
| AUDIT-MEMORY-1 | `dev_schema_drift_trap.md` self-contradiction healed | PR #131 |
| INTERACTION-DUR-L1 | MAX_INTERVIEW_EXCHANGES docs → 4 | PR #134 |
| AUDIT-MIGRATIONS-3 | Migration 0017 rollback notes | PR #135 |
| AUDIT-WORKFLOW | `_wip/` gitignored | direct push (`55cd30df`) |
| AUDIT-EVAL-2 | First `runLive` — exchanges flow | PR #137 |
| AUDIT-EVAL-2.1 | PR #137 review fixups | PR #139 |
| BUG-743 / T-1 | Forward-only LLM mock guard for integration tests | commit `35fd074a` |
| Pre-P0 hygiene batch | "Sweep when you fix" rule + phantom test-utils + memory hygiene + audit-status skill + 6 deepening recons + memory drift audit + relatedness step in /my:commit | commit `e622dd15` |

---

## Deviations Log

> Captured via `/my:audit-status deviation`. Each entry records a finding that requires plan adjustment. Status transitions: `open` → `processed-YYYY-MM-DD` (delta applied) or `rejected-YYYY-MM-DD` (deferred or contradicted).

### DEV-001

**Status:** `processed-2026-05-03`
**Source:** Epic 12 persona-fossil sweep (Stage 2 decision burndown for D-C4-1)
**Finding:** Both MOBILE-1 and MOBILE-2 deepening audits asked "is the `isLearner` pattern OK?" without first asking "should `isLearner` exist at all in this codebase?" Epic 12 had already deleted `personaType` and decomposed it into three orthogonal axes (age from `birthYear`, role from `familyLinks`, intent from per-session state). The audits' governance recommendation ("Allow + clarify CLAUDE.md") was framed against the wrong baseline — it would have codified a pattern the preceding epic specifically eliminated.

**Root cause:** Methodology gap — audits of shared-component conventions did not cross-reference against the spec/epic history to check whether the underlying concept had been removed. Story 12.5/12.6's verification sweep used literal-string `grep personaType` which missed the boolean alias `isLearner` (same concept under a different name). This is a generalizable failure mode: any deleted concept can survive under aliases that the original sweep didn't cover.

**Delta applied:**
- D-C4-1 recommendation flipped from "Allow + clarify" to "Delete dead branch" (see Resolved Decisions)
- New Pending Decisions: D-C4-3 (`personaFromBirthYear()` root migration), D-C4-4 (`relearn.tsx` disposition)
- C4 expanded from 5 phases to 8: P6 (forward-only guard test), P7 (root `personaFromBirthYear()` migration), P8 (`relearn.tsx` fossil)
- C4 severity upgraded YELLOW → YELLOW-RED
- C7 P3 scope expanded: tighten CLAUDE.md persona-unaware rule + update UX spec stale `(learner)/` paths
- Closed/revised: 2 entries added (D-C4-1 original recommendation + MOBILE-2 F4 severity)
- Methodology lesson: future audits should grep `docs/specs/epics.md` for the relevant axis before recommending governance posture. Forward-only guard tests (per BUG-743 pattern) should cover persona-shaped booleans in shared components.
