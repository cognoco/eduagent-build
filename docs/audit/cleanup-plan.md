# Consistency Cleanup Plan

**Last updated:** 2026-05-04 UTC
**Branch:** `consistency`
**Replaces:** `docs/audit/2026-05-02-artefact-consistency-punchlist.md` (superseded; preserved as historical record only)
**Maintained by:** `/my:audit-status` skill (read mode refreshes PR/file claims; deviation mode appends to Deviations Log)

---

## Orientation

Living tracker for the artefact-consistency cleanup workstream. **This is not a recap of audit findings** — read the source recons (`docs/audit/2026-05-03-*.md`, `docs/audit/2026-05-02-consolidated-overview.md`) for evidence and reasoning. This doc tracks **what's left to do, who owns it, and what's blocked on a decision**.

### Stage model

Work is bucketed into three stages by status:

- **Stage 1 — Autonomous (`status: todo`, no `Owner`):** Subagent-executable work with files-claimed metadata. Coordinator dispatches; subagent fixes; coordinator commits.
- **Stage 2 — Blocked (`status: blocked`):** Notes column specifies the block type: `blocked-dependency on PR-XX` (must wait for another PR), `blocked-validation: <criteria>` (needs production data or time-gated verification), or `blocked on D-XXX` (decision pending — now all resolved). Once the block clears, status moves to `todo`.
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

---

## Resolved Decisions

Decisions promoted from Pending to executable. Captured here so the rationale survives even after the affected cluster phases close.

| ID | Resolved | Decision | Resolution | Rationale |
|---|---|---|---|---|
| D-C1-1 | 2026-05-03 | Disposition of no-matching-route `*ResponseSchema` exports | **Hybrid (2 deletes + 2 renames + 1 deferred):** (a) Delete `internalQuizRoundResponseSchema` + `InternalQuizRoundResponse` (zero consumers anywhere). (b) Delete `homeCardsResponseSchema` + `HomeCardsResponse` (zero consumers — `HomeCard` singular type is separate and stays). (c) Rename `learnerRecapResponseSchema` → `learnerRecapLlmOutputSchema` (+ type alias `LearnerRecapLlmOutput`). (d) Rename `filingResponseSchema` → `filingLlmOutputSchema` (+ type alias `FilingLlmOutput`); **keep function name `buildFallbackFilingResponse` unchanged** — only the schema and type rename. (e) Defer adjacent `coachingCardCelebrationResponseSchema` → `pendingCelebrationsResponseSchema` rename to C1 P3 (the wrap PR), where celebrations.ts is already in scope. | Deletes match the strict "zero consumers" evidence bar set by `internalQuizRound*`. Renames give honest `*LlmOutputSchema` names that future SCHEMA-2 sweeps can filter by suffix convention. Function name kept stable to minimize cascade — type rename is the high-signal change. Adjacent rename deferred to keep D-C1-1 PR focused on dead-or-misnamed `*Response` exports without a real route. |
| D-C1-2 | 2026-05-03 | Disposition of `auth.ts` 501 stubs | **Delete the entire stub surface (Option 2, scope expanded post-verification).** Delete `apps/api/src/routes/auth.ts` (3 stub routes), `apps/api/src/routes/auth.test.ts` (9 test cases for 501 stubs), `packages/schemas/src/auth.ts` (3 schemas + 3 type aliases — zero consumers anywhere). Remove import + mount from `apps/api/src/index.ts:35` and `:199`. Verification confirmed: zero mobile callers, zero non-route consumers of the schemas, `@eduagent/factory.buildRegisterInput` is archival noise (the package doesn't exist on disk — separate ghost-package cleanup tracked under C8). | 404 surfaces real bugs that 501-with-explanation would mask. ERROR_CODES kept clean of non-error codes (`NOT_IMPLEMENTED` is "intentionally absent," not "something went wrong" — different concerns). Schemas had no consumers despite a JSDoc claim of mobile/Clerk client-side validation use — the JSDoc is aspirational; reality is dead code. Expanded scope = same direction, more dead code removed. |
| D-C4-1 | 2026-05-03 | `RemediationCard` persona-keyed strings governance | **Delete the dead branch (supersedes original "Allow + clarify CLAUDE.md" recommendation).** Epic 12 deleted `personaType`; `isLearner` is a Story-10.9 fossil missed by Story 12.5's literal-string `personaType` sweep. The single caller (`recall-test.tsx:215`) hard-codes `isLearner={true}`, so the teen branch is provably unreachable dead code. Delete `isLearner` prop + teen branch + `getCooldownMessage` teen path; hard-code learner copy. ~30 min YAGNI cleanup, not refactor. Also sweep 3 stale persona comments (`MentomateLogo.tsx:25`, `QuotaExceededCard.tsx:12`, `LivingBook.tsx:19`). Broader persona-fossil sweep surfaced `relearn.tsx` as a second `isLearner` fossil and `personaFromBirthYear()` as root cause — tracked separately as D-C4-3 and D-C4-4. | Original recommendation "Allow + clarify CLAUDE.md" was architectural backsliding post-Epic-12 — it would codify the exact failure mode that let the fossil survive Story 12.5's sweep. Both MOBILE-1 and MOBILE-2 deepenings asked "is the `isLearner` pattern OK?" without first asking "should `isLearner` exist at all?" (Epic 12 answered: no). The "2-4 hr refactor" cost estimate was wrong — actual cost is ~30 min dead-branch deletion at the real call-site count (1 caller, hard-coded `true`). |
| D-C4-2 | 2026-05-04 | Brand/animation/celebration hex carve-out in CLAUDE.md | **Codify exemption.** Add exception clause to CLAUDE.md "Non-Negotiable Engineering Rules" hex-color rule: brand-fixed hex in SVG-internal animation and celebration components (`*Animation.tsx`, `*Celebration.tsx`, `AnimatedSplash.tsx`, `MentomateLogo.tsx`) is acceptable when annotated in-file with brand intent. Covers 13 files / 98 hex occurrences. | Tokenizing 98 SVG-internal brand colors adds indirection with no runtime or maintenance benefit — SVG fills/strokes are design primitives co-located with animation timing. Without the carve-out, every future hex sweep re-flags the same 13 files, creating noise that masks real violations (the 20 across 6 production files tracked in C4 P1). Pattern-based exemption is greppable and enforceable by future lint rules. |
| D-C4-3 | 2026-05-04 | `personaFromBirthYear()` root migration | **Option C: Expand shared schema to three-way.** (1) Update `packages/schemas/src/age.ts`: `AgeBracket = 'child' \| 'adolescent' \| 'adult'`; add `< 13 → 'child'` branch to `computeAgeBracket()`. (2) Update `packages/schemas/src/age.test.ts`: replace BUG-642 two-value guard with three-value contract test. (3) Delete mobile's `personaFromBirthYear()` from `apps/mobile/src/lib/profile.ts`; all 5 mobile callers import `computeAgeBracket` from `@eduagent/schemas` instead. (4) Update `consent-copy.ts` to accept `AgeBracket`. (5) Update existing shared-schema consumers (`tell-mentor-input.tsx`, `use-rating-prompt.ts`) to handle new `'child'` value. (6) Update 4 test mocks. `relearn.tsx` included (D-C4-4). | Preserves the three-way age-appropriate copy split (child-friendly for <13, descriptive for 13-17, clinical for 18+) that `mentor-memory.tsx` and `consent-copy.ts` depend on. An 11-year-old and a 17-year-old have meaningfully different reading comprehension — collapsing to two-way would lose the simpler-language tier. Expanding the shared schema is cleaner than maintaining a parallel mobile-only function: one function, one type, one source of truth. BUG-642's guard was correct for the previous product state but the three-axis Epic 12 model supports the finer granularity. The `@see personaFromBirthYear` JSDoc in `age.ts:14` already acknowledged the relationship — now we unify them. |
| D-C4-4 | 2026-05-04 | `relearn.tsx` `isLearner` fossil disposition | **Migrate within P7 scope (absorbed into root migration).** Verified: `relearn.tsx` has a live two-way branch (not dead code like RemediationCard) — the value comes from the real profile `birthYear`, so both adolescent and non-adolescent paths are reachable. Rename `isLearner` → `isAdolescent`, rename constants `TEACHING_METHODS_LEARNER` → `TEACHING_METHODS_ADOLESCENT` and `COPY_LEARNER` → `COPY_ADOLESCENT`. P8 merged into P7 — same mechanical change as other callers. | Unlike RemediationCard (caller hard-coded `true` → dead teen branch), `relearn.tsx` receives a real computed value. Both branches serve users. The fix is vocabulary alignment (same as 4 sibling callers), not dead-code deletion. Separate phase tracking was unnecessary overhead — one atomic migration PR is cleaner than splitting the same rename across two phases. |
| D-C7-1 | 2026-05-04 | Stale plan/spec memory sweep | **Sweep executed and completed.** 10 project-type memory entries checked against `git log --since=2026-04-18`. Results: 4 STALE (archived: `project_parent_visibility_spec`, `project_ux_review_pass`, `project_open_bugs`, `project_multiple_coaching_cards`), 2 archived with Notion issue follow-ups (`project_prod_approval_gate` → Notion P2, `project_template_repo` → Notion P3), 1 archived as abandoned (`project_f8_memory_source_refs` — spec file missing, user-facing features unimplemented), 1 archived per user (`project_deploy_config_open` → covered by Notion prod gate issue). 1 flagged for post-C4-P7 update (`project_persona_removal.md` line 31). MEMORY.md Active Work section updated. | Sweep confirmed the drift audit's suspicion: 8 of 10 entries were stale or better tracked in Notion. Memory system should hold durable architectural decisions and active constraints, not work-item status — Notion is the canonical tracker for that. |
| D-MEM-1 | 2026-05-04 | Memory overlap-flags reconciliation | **REINFORCES is authoritative — keep entries, supersede older doc.** The `2026-05-03-memory-drift-audit.md` classification (REINFORCES) takes precedence over `memory-overlap-flags.md` (DELETE) for the conflicting entries. Mark the affected entries in `memory-overlap-flags.md` as superseded with a reference to the drift audit's per-entry classification. Do not delete the memory entries. | The drift audit is newer, more thorough, and used a nuanced classification that distinguishes "overlapping" from "reinforcing." Two entries approaching the same topic from different angles (e.g., one describing the rule, one describing the rationale) are both useful — the overlap-flags doc's simpler dedup heuristic didn't account for this. Keeping both entries costs nothing (memory files are small); deleting a reinforcing entry risks losing context in future sessions. |
| D-C6-2 | 2026-05-04 | Maestro guard symmetry | **Option (b): Drop the broken `nx.json targetDefaults.e2e` block (lines 71-87).** The nx target runs bare `maestro test` bypassing the `pretest:e2e*` barricade hooks in root `package.json`. Nobody uses `nx run mobile:e2e` — documented workflow is direct Maestro CLI, and the active e2e entrypoint is Playwright via `pnpm test:e2e:web*`. Verify `nx graph` after removal. | Clean removal beats parallel guard maintenance. The nx target is unused infrastructure that creates a false affordance — someone running `nx run mobile:e2e` gets no barricade, no environment setup, and a confusing failure. If Maestro re-enters the CI/dev flow, add the target back properly with the barricade wired in. |
| D-C6-1 | 2026-05-04 | `jest.config.cjs` tsconfig switch | **Option A: Switch jest to `tsconfig.spec.json`.** One-line change in `apps/api/jest.config.cjs`: swap `tsconfig.app.json` → `tsconfig.spec.json` in the ts-jest transform config. Verify with `pnpm exec nx run api:test` smoke run before merging. | Standard pattern matching `packages/database` and `apps/mobile`. Eliminates the config split where typecheck and jest disagree on what's in scope — `tsconfig.app.json` excludes `**/*.test.ts` but ts-jest silently ignores that exclusion. After the switch, both `tsc --build` and jest use `tsconfig.spec.json` for test files, making type errors in tests visible to CI typecheck. Low breakage risk since both configs extend `tsconfig.base.json` with identical base settings. |
| D-C5-2 | 2026-05-04 | Pin-style convention for SDK-coupled mobile deps | **`~` (tilde) per Expo recommendation.** During 1a-EXECUTE, align the 8 drifted Expo SDK-coupled deps from `^` to `~`: `react-native-reanimated`, `react-native-gesture-handler`, `react-native-safe-area-context`, `react-native-screens`, `react-native-svg`, `react-native-svg-transformer`, `metro-config`, `metro-resolver`. Document in CLAUDE.md Repo-Specific Guardrails: "Expo SDK-coupled mobile deps use `~` (tilde) pins, not `^`." | Expo SDK releases are tested against specific minor versions of these packages. `^` allows untested minor combinations to creep in between SDK upgrades. `~` constrains to patch-only, matching Expo's compatibility matrix. Slightly more manual work on SDK bumps (explicit minor version changes) is a worthwhile trade for build stability. |
| D-C5-1a | 2026-05-04 | 83-row dependency worksheet architectural call | **Execute Buckets B + C + E confirmed removals.** Scope: (1) Delete 23 Bucket B entries from root `package.json` (mobile-runtime deps with 0 root/api consumers — mobile already declares all of them). (2) Delete 7 Bucket C entries from root (multi-workspace deps already declared per-workspace — `hono`, `react`, `react-dom`, `react-native`, `react-native-web`, `nativewind`, `@testing-library/react-native`). (3) Delete 2 confirmed Bucket E orphans from `apps/api/package.json` (`@neondatabase/serverless`, `@clerk/types`). (4) Align root `dotenv` from `^16.4.5` → `^16.4.7` (drive-by, matches `packages/test-utils`). (5) For `react-native-css-interop`: move dep to `apps/mobile`, leave `pnpm.patchedDependencies` entry + `patches/` file at root (pnpm reads patches from root regardless). (6) Single `pnpm install` + lockfile regen. Verify: `pnpm exec nx run-many -t typecheck`. Total: 32 deletions + 1 version align. Prettier 3 upgrade (C5 P8) deferred to standalone PR — Notion issue created. | Root manifest is a "tooling + mobile-runtime junk drawer." All 30 B+C entries are already declared in their consuming workspace — the root copies are historical duplicates from before per-workspace manifests. Zero behavioral change expected (pnpm resolves from workspace declarations, not root). Bucket E removals are confirmed zero-import orphans. Keeping Prettier 2→3 separate preserves clean `git blame`. |
| D-C1-3 | 2026-05-03 | SSE schema scope (error-frame only vs. unified envelope) | **Option 1: error-frame only.** Author `streamErrorFrameSchema = z.object({type: z.literal('error'), message: z.string()})` in `packages/schemas/src/stream-fallback.ts` (sibling to existing `streamFallbackFrameSchema`). Add `.parse()` at the 4 emission sites in `interview.ts:254-263, 413-418` and `sessions.ts:363-368, 507-511`. **Drop `apps/mobile/src/lib/sse.ts` from C1 P5 Files-claimed** — server-side validation only, no consumer-side change. Defer unified `streamFrameSchema` discriminated union (covering `chunk + fallback + done + error`) and mobile-consumer migration to new C1 P8 (blocked on P5 + production validation period). | Bounded blast radius beats theoretical completeness. Mirrors `streamFallbackFrameSchema` precedent (single-frame schema, not union). Bundling the consumer-side refactor with the server-side schema gap mixes risk profiles in one PR; debugging gets harder. After P5 ships and the `.parse()` pattern is validated, an envelope follow-up can revisit *with data* rather than committing to a design upfront. |

---

## PR Execution Plan (Stage 3)

Consecutive numbering across all clusters. **Numbering does not imply strict sequential order** — many PRs are independently startable. See "Key dependencies" below for ordering constraints.

| PR | Cluster | Phases | Summary |
|---|---|---|---|
| PR-01 | C1 | P1+P2 | Move typed errors to `@eduagent/schemas/errors.ts` + add `queued` to `feedbackResponseSchema` |
| PR-02 | C1 | P3 | SCHEMA-2 wrap — 12 `c.json` route sites + celebration schema rename. **Gates PR-06.** |
| PR-03 | C1 | P4+P5+P6 | Rename misnamed request schemas, author response schemas, add `streamErrorFrameSchema`, execute D-C1-1 dispositions |
| PR-04 | C1 | P7 | Delete auth 501 stub surface (routes, tests, schemas, mount) |
| PR-05 | C2 | P1+P2 | Two forward-only guard tests — database mock guard + Inngest mock guard. **Gates PR-07.** |
| PR-06 | C2 | P3 | Drain 3 LLM mock allowlist offenders (~10-15 hr). Pairs with PR-02. |
| PR-07 | C2 | P4 | Drain 6 Inngest mock allowlist offenders. Blocked on PR-05. |
| PR-08 | C3 | P1+P2 | `unstable_settings` on 3 layouts + `AccordionTopicList` cross-tab push fix |
| PR-09 | C4 | P1+P2 | Replace 20 hex literals with tokens + CLAUDE.md brand hex carve-out |
| PR-10 | C4 | P3+P4+P6 | RemediationCard dead branch deletion + persona comment sweep + weekly-report route verification + persona-fossil guard test |
| PR-11 | C4 | P7 | Root migration: `personaFromBirthYear()` → `computeAgeBracket()` across all callers. **Land before PR-17.** |
| PR-12 | C5 | P1 | 1a-EXECUTE — 32 dep deletions, dotenv align, `react-native-css-interop` move, 8 pins to `~`, lockfile regen. **Land before PR-13.** |
| PR-13 | C5 | P3+P7 | Small dep fixes bundle — declare `@react-navigation/native`, consolidate `onlyBuiltDependencies`. (P4/P5 absorbed into PR-12. P6 verified: not orphan, kept.) |
| PR-14 | C6 | P1b+P2 | Drizzle-import guard test + `apps/api/eslint.config.mjs` |
| PR-15 | C6 | P3 | `tsconfig.spec.json` + jest config switch. Smoke run required. |
| PR-16 | C6 | P4+P5 | Drop broken nx e2e block + rename `db:generate` → `db:generate:dev` |
| PR-17 | C7 | P1+P2+P3+P4+P5+P7 | Doc reconciliation bundle — Inngest observers, RLS plan refresh, CLAUDE.md persona rule + db:* commands, UX spec paths, SCHEMA-2 plan numbers, baseline-delta amendment, overlap-flags supersede. **Co-land with PR-27.** |
| PR-18 | C8 | P1 | Regenerate 10 missing drizzle migration snapshots |
| PR-19 | C8 | P2 | Fix non-monotonic `_journal.json` timestamps |
| PR-20 | C8 | P3 | Sweep destructive migrations for missing rollback sections |
| PR-21 | C8 | P4 | Memory file dedupe (~96 files) |
| PR-22 | C8 | P5 | Resolve vendored bmad commands vs installed plugin |
| PR-23 | C8 | P6 | EduAgent → Mentomate naming sweep (docs/code string literals, NOT `@eduagent/*` package names) |
| PR-24 | C8 | P7 | Per-package READMEs |
| PR-25 | C9 | P1 | Archive/delete 25 Cat 1 obsolete files with link redirects |
| PR-26 | C9 | P2 | Per-file decision on 23 Cat 2 possibly-obsolete files |
| PR-27 | C9 | P3 | 8 inbound-link conflicts. **Co-land with PR-17.** |
| PR-28 | C9 | P4 | Verify 116 Cat 3 keep-files for current relevance |

### Key dependencies

- **PR-02 → PR-06:** C2 LLM mock drain needs C1 schema wraps for test assertions
- **PR-05 → PR-07:** Inngest mock drain needs the guard test in place first
- **PR-11 → PR-17:** CLAUDE.md persona rule wording depends on `computeAgeBracket()` vocabulary
- **PR-12 → PR-13:** Shared lockfile — small dep fixes must follow the large manifest cleanup
- **PR-17 ↔ PR-27:** Inbound-link conflicts must co-land with doc reconciliation
- **PR-25 ↔ PR-27:** Cat 1 archive moves must co-land with inbound-link fixes to avoid broken references

### Independently startable (no ordering constraints)

PR-01, PR-04, PR-05, PR-08, PR-09, PR-10, PR-12, PR-14, PR-15, PR-16, PR-18–PR-26, PR-28

### Human involvement required

These PRs need coordinator or human review beyond agent execution:
- **PR-12** (C5 P1): 32 dep deletions — human review of manifest changes before merge
- **PR-20** (C8 P3): Migration rollback sections — requires reading each destructive migration and writing rollback assessment
- **PR-23** (C8 P6): EduAgent→Mentomate naming sweep — broad string-literal change needs human review to avoid touching `@eduagent/*` package names
- **PR-25** (C9 P1): Obsolete file archival — human decision on link redirects
- **PR-26** (C9 P2): Possibly-obsolete files — per-file human decision required

---

## Cluster status

### C1 — Schema contract enforcement

**Source:** TYPES-1, SCHEMA-2 plan, TYPES-2 deepening, baseline-delta
**Severity (recalibrated):** **RED** (gates C2 timing)
**Headline:** 12 wrappable c.json sites confirmed (down from naive ~36); 1 schema needs field added; 2 schema renames + 2 new response schemas needed; 1 SSE schema needed; 2 typed errors must move to `@eduagent/schemas`; 6 no-route schemas need disposition; 3 auth 501 stubs need disposition.

| Phase | Description | Status | Owner | PR | Files-claimed | Notes |
|---|---|---|---|---|---|---|
| P1 | AUDIT-TYPES-2.7 — Move `QuotaExceededError` + `ResourceGoneError` to `@eduagent/schemas/errors.ts`; convert `error.name === 'X'` checks to `instanceof` | todo | | **PR-01** | `packages/schemas/src/errors.ts`, `apps/mobile/src/lib/api-errors.ts`, `apps/mobile/src/lib/format-api-error.ts`, `apps/mobile/src/components/session/use-session-streaming.ts`, `apps/mobile/src/lib/api-client.ts` | [YELLOW-RED] ~1-2 hr. Note: classifier uses `error.name` + shape checks (not `instanceof`) — the HMR-resilient path is already the primary implementation. Moving classes to schemas doesn't change classifier behavior. BUG-947 tests remain valid. Verify: `pnpm exec jest --findRelatedTests <changed-files> --no-coverage` + `pnpm exec nx run api:typecheck` + `cd apps/mobile && pnpm exec tsc --noEmit`. |
| P2 | AUDIT-TYPES-2.2 — Add `queued: z.boolean()` to `feedbackResponseSchema` before any wrap | todo | | **PR-01** | `packages/schemas/src/feedback.ts`, `apps/api/src/routes/feedback.ts` (verification only) | [YELLOW] ~15 min. Bundled with P1. Verify: `pnpm exec jest --findRelatedTests packages/schemas/src/feedback.ts apps/api/src/routes/feedback.ts --no-coverage`. |
| P3 | AUDIT-TYPES-2.1 — SCHEMA-2 PR 1: wrap 12 ready-to-fit c.json sites with their existing schemas + rename `coachingCardCelebrationResponseSchema` → `pendingCelebrationsResponseSchema` during the celebrations wrap (per D-C1-1 deferral) | todo | | **PR-02** | `apps/api/src/routes/quiz.ts`, `apps/api/src/routes/account.ts`, `apps/api/src/routes/celebrations.ts`, `apps/api/src/routes/curriculum.ts`, `apps/api/src/routes/notes.ts`, `apps/api/src/routes/billing.ts`, `packages/schemas/src/progress.ts` (celebration-rename only) | [YELLOW] ~1 hr + ~10 min for rename. **Gates PR-06.** Verify: `pnpm exec nx run api:test` + `pnpm exec nx run api:typecheck`. |
| P4 | AUDIT-TYPES-2.3 — Rename `quickCheckResponseSchema` → `*RequestSchema` and `consentResponseSchema` → `consentRespondRequestSchema`; author real response schemas | todo | | **PR-03** | `packages/schemas/src/assessments.ts`, `packages/schemas/src/consent.ts`, `apps/api/src/routes/assessments.ts`, `apps/api/src/routes/consent.ts` | [YELLOW-RED] ~1.5 hr. Verify: `pnpm exec jest --findRelatedTests <changed-files> --no-coverage` + `pnpm exec nx run api:typecheck`. |
| P5 | AUDIT-TYPES-2.4 — Per D-C1-3: author `streamErrorFrameSchema` in `packages/schemas/src/stream-fallback.ts`; add `.parse()` at 4 emission sites. Server-side only. | todo | | **PR-03** | `packages/schemas/src/stream-fallback.ts`, `apps/api/src/routes/interview.ts`, `apps/api/src/routes/sessions.ts` | [YELLOW] ~30 min. Resolved by D-C1-3. |
| P8 | AUDIT-TYPES-2.4-FOLLOWUP — Unified `streamFrameSchema` discriminated union; migrate `apps/mobile/src/lib/sse.ts`. | blocked | | (future) | `packages/schemas/src/stream-fallback.ts`, `apps/api/src/routes/interview.ts`, `apps/api/src/routes/sessions.ts`, `apps/mobile/src/lib/sse.ts` (+ tests) | [GREEN] ~2 hr. **blocked-dependency on PR-03 + blocked-validation: PR-03 must run in production ≥1 week without `.parse()` errors before expanding to full envelope.** |
| P6 | AUDIT-TYPES-2.5 — Resolve no-matching-route schemas per D-C1-1: 2 deletes + 2 renames. **Do NOT rename function `buildFallbackFilingResponse`.** | todo | | **PR-03** | `packages/schemas/src/quiz.ts`, `packages/schemas/src/progress.ts`, `packages/schemas/src/sessions.ts`, `packages/schemas/src/filing.ts`, `packages/schemas/src/filing.test.ts`, `apps/api/src/services/session-recap.ts`, `apps/api/eval-llm/flows/session-recap.ts`, `apps/api/src/services/filing.ts`, `apps/api/src/services/filing.integration.test.ts` | [YELLOW] ~2 hr. Resolved by D-C1-1. |
| P7 | AUDIT-TYPES-2.6 — Per D-C1-2: delete entire auth stub surface (routes, tests, schemas, mount). Also: remove `export * from './auth'` from schema barrel, remove `NOT_IMPLEMENTED` from `ERROR_CODES` (zero consumers outside stubs), remove `/v1/auth/` from `PUBLIC_PATHS` (dead exemption). | todo | | **PR-04** | `apps/api/src/routes/auth.ts`, `apps/api/src/routes/auth.test.ts`, `packages/schemas/src/auth.ts`, `packages/schemas/src/index.ts`, `packages/schemas/src/errors.ts`, `apps/api/src/middleware/auth.ts`, `apps/api/src/index.ts` | [GREEN] ~45 min. Resolved by D-C1-2. Verify: `pnpm exec nx run api:typecheck` + `pnpm exec nx run api:test`. |

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
| P1 | AUDIT-TESTS-2A — Extend BUG-743 guard pattern to `@eduagent/database` mocks in integration tests (forward-only, empty allowlist) | todo | | **PR-05** | `apps/api/src/services/db/integration-mock-guard.test.ts` (new) | [YELLOW] ~1-2 hr. Verify: `pnpm exec jest --findRelatedTests apps/api/src/services/db/integration-mock-guard.test.ts --no-coverage`. |
| P2 | AUDIT-TESTS-2B — Extend BUG-743 guard pattern to `inngest` mocks (initial allowlist of 6) | todo | | **PR-05** | `apps/api/src/inngest/integration-mock-guard.test.ts` (new) | [YELLOW] ~1-2 hr. **Gates PR-07.** Verify: `pnpm exec jest --findRelatedTests apps/api/src/inngest/integration-mock-guard.test.ts --no-coverage`. |
| P3 | AUDIT-TESTS-2C — Drain LLM allowlist: migrate 3 KNOWN_OFFENDERS to HTTP-boundary or provider-registry pattern | todo | | **PR-06** | `apps/api/src/services/session-summary.integration.test.ts`, `apps/api/src/services/quiz/vocabulary.integration.test.ts`, `apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts` | [YELLOW] ~10-15 hr. Pairs with PR-02. |
| P4 | AUDIT-TESTS-2D — Drain inngest allowlist: sweep 5+1 known offenders | blocked | | **PR-07** | `tests/integration/{account-deletion,consent-email,learning-session,onboarding,stripe-webhook}.integration.test.ts`, `apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts` | [YELLOW] ~10-18 hr. **blocked-dependency on PR-05** (guard test must exist before draining allowlist). |
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
| P1 | MOBILE-1 1a / MOBILE-2 F5 — Add `unstable_settings = { initialRouteName: 'index' }` to 3 nested layouts | todo | | **PR-08** | `apps/mobile/src/app/(app)/progress/_layout.tsx`, `apps/mobile/src/app/(app)/quiz/_layout.tsx`, `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx` | [YELLOW] ~30 min total. Verify: `cd apps/mobile && pnpm exec tsc --noEmit`. |
| P2 | MOBILE-1 F2 — `AccordionTopicList` cross-tab push must push parent chain | todo | | **PR-08** | `apps/mobile/src/components/progress/AccordionTopicList.tsx` | [YELLOW] ~15-30 min. Verify: `pnpm exec jest --findRelatedTests apps/mobile/src/components/progress/AccordionTopicList.tsx --no-coverage`. |

**Cross-coupling:** None — independent of all other clusters.

---

### C4 — Mobile design system drift

**Source:** MOBILE-1, MOBILE-2 deepening, baseline-delta, **Epic 12 persona-fossil sweep (2026-05-03)**
**Severity:** **YELLOW-RED** (upgraded from YELLOW — persona-fossil sweep expanded scope significantly beyond hex-code cleanup)
**Headline:** 20 hex codes across 6 production .tsx files. 13 brand/animation/celebration files (98 occurrences) governed by D-C4-2 carve-out (RESOLVED). **Epic 12 persona-fossil sweep:** RemediationCard `isLearner` dead branch (D-C4-1 RESOLVED → delete), `relearn.tsx` `isLearner` fossil (D-C4-4 RESOLVED → absorbed into P7), `personaFromBirthYear()` root migration to `computeAgeBracket()` (D-C4-3 RESOLVED). All 4 C4 decisions resolved. Forward-only guard test + root migration + CLAUDE.md persona-rule tightening remain as execution work.

| Phase | Description | Status | Owner | PR | Files-claimed | Notes |
|---|---|---|---|---|---|---|
| P1 | AUDIT-MOBILE-2a — Replace hex literals across production files with `tokens.colors.*` references | todo | | **PR-09** | `apps/mobile/src/app/(app)/session/index.tsx`, `apps/mobile/src/app/(app)/child/[profileId]/index.tsx`, `apps/mobile/src/app/_layout.tsx`, `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx`, `apps/mobile/src/app/profiles.tsx`, `apps/mobile/src/components/library/NoteInput.tsx` | [YELLOW] ~1-2 hr. Counts are pre-language-add; re-grep after dispatch. `session/index.tsx` and `app/_layout.tsx` may have zero hex at HEAD — scope may shrink. |
| P2 | AUDIT-MOBILE-2b — Codify brand/animation/celebration hex carve-out in CLAUDE.md | todo | | **PR-09** | `CLAUDE.md` (Non-Negotiable Engineering Rules section) | [YELLOW] ~15 min. Resolved by D-C4-2. |
| P3 | Per D-C4-1: delete `RemediationCard.tsx` dead teen branch + sweep 3 stale persona comments. | todo | | **PR-10** | `apps/mobile/src/components/progress/RemediationCard.tsx`, `apps/mobile/src/app/(app)/topic/recall-test.tsx`, `apps/mobile/src/app/(app)/topic/recall-test.test.tsx`, `apps/mobile/src/components/home/MentomateLogo.tsx`, `apps/mobile/src/components/session/QuotaExceededCard.tsx`, `apps/mobile/src/components/session/LivingBook.tsx` | [YELLOW] ~45 min. Resolved by D-C4-1. |
| P4 | AUDIT-MOBILE-2c — Confirm `weekly-report/[weeklyReportId]` route auto-discovery | todo | | **PR-10** | `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx` | [GREEN-YELLOW] ~5 min. |
| P5 | AUDIT-MOBILE-2d — Amend `2026-05-03-baseline-delta.md` C4 section | todo | | **PR-17** | `docs/audit/2026-05-03-baseline-delta.md` (lines 14, 89-103) | [GREEN] ~10 min. Cross-listed with C7 PR-17. |
| P6 | EPIC-12-GUARD — Forward-only persona-fossil guard test | todo | | **PR-10** | `apps/mobile/src/components/persona-fossil-guard.test.ts` (new) | [YELLOW] ~30 min. Independent of root migration. |
| P7 | EPIC-12-ROOT — Expand shared `computeAgeBracket()` to three-way (`child, adolescent, adult`). Delete mobile's `personaFromBirthYear()`. All 5 mobile callers import from `@eduagent/schemas`. Update existing schema consumers (`tell-mentor-input.tsx`, `use-rating-prompt.ts`). **Post-land:** update `.claude/memory/project_persona_removal.md`. | todo | | **PR-11** | `packages/schemas/src/age.ts`, `packages/schemas/src/age.test.ts`, `apps/mobile/src/lib/profile.ts`, `apps/mobile/src/lib/consent-copy.ts`, `apps/mobile/src/lib/consent-copy.test.ts`, `apps/mobile/src/app/(app)/_layout.tsx`, `apps/mobile/src/app/(app)/_layout.test.tsx`, `apps/mobile/src/app/session-summary/[sessionId].tsx`, `apps/mobile/src/app/session-summary/[sessionId].test.tsx`, `apps/mobile/src/app/(app)/mentor-memory.tsx`, `apps/mobile/src/app/(app)/mentor-memory.test.tsx`, `apps/mobile/src/app/(app)/topic/relearn.tsx`, `apps/mobile/src/app/(app)/topic/relearn.test.tsx`, `apps/mobile/src/components/tell-mentor-input.tsx`, `apps/mobile/src/hooks/use-rating-prompt.ts`, `apps/mobile/src/hooks/use-rating-prompt.test.ts` | [YELLOW-RED] ~2-3 hr. **Land before PR-17.** Resolved by D-C4-3 (option C). Verify: `pnpm exec nx run-many -t typecheck` + `pnpm exec jest --findRelatedTests packages/schemas/src/age.ts apps/mobile/src/lib/profile.ts --no-coverage`. |
| P8 | ~~EPIC-12-RELEARN~~ — Absorbed into P7 per D-C4-4 resolution. `relearn.tsx` is a live two-way branch, not dead code; same mechanical rename as other callers. | done | | (merged into P7) | n/a | [N/A] See D-C4-4 in Resolved Decisions. |

**Cross-coupling:**
- P5 also lives in C7 (doc reconciliation). Owner should claim once.
- P8 absorbed into P7 (D-C4-4 resolved: relearn is live two-way branch, same rename).
- P6 (guard test) is independent — can land anytime, even before P3.
- P3 (RemediationCard deletion) is independent of P7 — the dead branch is dead regardless of root migration approach.

---

### C5 — Manifest & dep-declaration hygiene

**Source:** DEP-DRIFT-1, DEP-DRIFT-2 deepening, baseline-delta
**Severity:** **RED** (largest structural violation in batch; phantom escalated 1→28 files)
**Headline:** 24 root↔mobile duplicates, 15 drifted at HEAD. 83-row reconciliation worksheet exists in DEP-DRIFT-2 F1 with bucket assignments (KEEP-at-root / MOVE-to-mobile / multi-workspace decision / under-declared / orphan). PR #144 doesn't touch manifests — 1a unblocked. `@eduagent/test-utils` phantom dep was DECLARED in commit `e622dd15` (pre-P0).

| Phase | Description | Status | Owner | PR | Files-claimed | Notes |
|---|---|---|---|---|---|---|
| P1 | AUDIT-DEPENDENCY-DRIFT-2-1a-EXECUTE — 32 dep deletions, dotenv align, css-interop move, 8 pins to `~`, lockfile regen | todo | | **PR-12** | `package.json`, `apps/api/package.json`, `apps/mobile/package.json`, `pnpm-lock.yaml` | [YELLOW-RED] agent ~20-30 min, human review 1-2 hr. **Land before PR-13.** Verify: `pnpm install` + `pnpm exec nx run-many -t typecheck`. |
| P2 | AUDIT-DEPENDENCY-DRIFT-2-1b — Declare `@eduagent/test-utils` | done | | `e622dd15` | n/a | Shipped pre-P0. |
| P3 | AUDIT-DEPENDENCY-DRIFT-2-1c — Declare `@react-navigation/native` | todo | | **PR-13** | `apps/mobile/package.json`, `pnpm-lock.yaml` | [YELLOW] ~3 min. |
| P4 | AUDIT-DEPENDENCY-DRIFT-2-1d — Remove orphan `@neondatabase/serverless` | done | | (absorbed into PR-12) | n/a | Bucket E removal included in D-C5-1a scope. |
| P5 | AUDIT-DEPENDENCY-DRIFT-2-1e — Remove orphan `@clerk/types` | done | | (absorbed into PR-12) | n/a | Bucket E removal included in D-C5-1a scope. |
| P6 | AUDIT-DEPENDENCY-DRIFT-2-1f — Verify `expo-system-ui` orphan status | done | | (verified — kept) | n/a | Verified: NOT orphan — required by `userInterfaceStyle: automatic` in `app.json:9`. Expo SDK 54 requires `expo-system-ui` for Android. Kept. |
| P7 | AUDIT-DEPENDENCY-DRIFT-2-1g — Consolidate `onlyBuiltDependencies` | todo | | **PR-13** | `package.json`, `pnpm-workspace.yaml` | [GREEN-YELLOW] ~3 min. |
| P8 | AUDIT-DEPENDENCY-DRIFT-2-1h — Prettier 3 upgrade (deferred) | todo | | (Notion) | `package.json`, source files | [GREEN-YELLOW] Deferred to standalone PR. Notion issue: `3568bce91f7c81a88abad5b14f17efed`. |

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
| P1b | AUDIT-PACKAGE-SCRIPTS-2a (part 2) — Drizzle-import forward-only guard test | todo | | **PR-14** | `apps/api/src/routes/no-drizzle-orm-imports.test.ts` (new) | [YELLOW] ~30 min. |
| P2 | AUDIT-PACKAGE-SCRIPTS-2b — Add `apps/api/eslint.config.mjs` re-exporting root | todo | | **PR-14** | `apps/api/eslint.config.mjs` (new) | [YELLOW] ~10 min. |
| P3 | AUDIT-PACKAGE-SCRIPTS-2c — `tsconfig.spec.json` + jest config switch | todo | | **PR-15** | `apps/api/tsconfig.spec.json` (new), `apps/api/tsconfig.json`, `apps/api/jest.config.cjs` | [YELLOW] ~30 min. Resolved by D-C6-1. Smoke run required. |
| P4 | AUDIT-PACKAGE-SCRIPTS-2d — Drop broken `nx.json` e2e block | todo | | **PR-16** | `nx.json` | [YELLOW] ~10 min. Resolved by D-C6-2. |
| P5 | AUDIT-EXTREFS-1 — Rename `db:generate` → `db:generate:dev` | todo | | **PR-16** | `package.json` (scripts), `CLAUDE.md` (Handy Commands), `docs/architecture.md` if cited | [YELLOW] ~10 min. |
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
| P1 | AUDIT-INNGEST-2 — Ship 2 new observer functions for orphan events | todo | | **PR-17** | `apps/api/src/inngest/functions/ask-gate-observe.ts` (new), `apps/api/src/inngest/functions/email-bounced-observe.ts` (new), `apps/api/src/inngest/index.ts` | [YELLOW] ~10 min. Observers are safe to ship before PR-07 — they log only. End-to-end verification comes when PR-07 drains Inngest mocks. Verify: `pnpm exec nx run api:typecheck`. |
| P2 | AUDIT-SPECS-2 — Refresh RLS plan status table | todo | | **PR-17** | `docs/plans/2026-04-15-S06-rls-phase-0-1-preparatory.md` | [YELLOW] ~30-40 min. |
| P3 | AUDIT-GOVERNING-1d — CLAUDE.md `db:*` commands + persona-rule tightening + UX spec `(learner)/` → `(app)/` paths + update `docs/architecture.md` `personaFromBirthYear` references | todo | | **PR-17** | `CLAUDE.md`, `docs/ux-design-specification.md`, `docs/architecture.md` | [YELLOW] ~35 min. **Land after PR-11.** |
| P4 | TYPES-1 F5 — Update SCHEMA-2 plan numbers | todo | | **PR-17** | `docs/audit/2026-05-02-audit-schema-2-plan.md` | [YELLOW] ~15 min. |
| P5 | AUDIT-MOBILE-2d — Amend baseline-delta C4 section | todo | | **PR-17** | `docs/audit/2026-05-03-baseline-delta.md` | [GREEN] ~10 min. Same as C4 P5. |
| P6 | D-C7-1 sweep — Memory entry verification | done | | (D-C7-1 session) | `.claude/memory/` | Resolved. 8 archived, 3 Notion issues. |
| P7 | D-MEM-1 reconciliation — Mark overlap-flags superseded | todo | | **PR-17** | `docs/audit/claude-optimization/memory-overlap-flags.md` | [YELLOW] ~15 min. Resolved by D-MEM-1. |

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
| P1 | AUDIT-MIGRATIONS-1 — Regenerate 10 missing drizzle snapshots | todo | | **PR-18** | `apps/api/drizzle/meta/{0006-0010,0013,0021,0025,0043,0044}_snapshot.json` | [YELLOW] ~1 hr. Verify: `pnpm run db:generate` completes without errors. |
| P2 | AUDIT-MIGRATIONS-2 — Fix non-monotonic `_journal.json` timestamps | todo | | **PR-19** | `apps/api/drizzle/meta/_journal.json` | [YELLOW] ~30 min. Verify: timestamps are monotonically increasing in `_journal.json`. |
| P3 | AUDIT-MIGRATIONS-3-SWEEP — Sweep destructive migrations for missing rollback sections | todo | | **PR-20** | `apps/api/drizzle/0*_*.sql`, `apps/api/drizzle/*.rollback.md` | [YELLOW] ~2 hr. |
| P4 | AUDIT-MEMORY-2 — Memory file dedupe (~96 files) | todo | | **PR-21** | `.claude/memory/*.md` | [YELLOW] ~1 hr. |
| P5 | AUDIT-SKILLS-2 — Resolve vendored bmad vs installed plugin | todo | | **PR-22** | `.claude/commands/bmad/`, `.claude/plugins/` | [YELLOW] ~30 min. |
| P6 | AUDIT-EXTREFS-2 — EduAgent → Mentomate naming sweep (NOT `@eduagent/*` package names) | todo | | **PR-23** | `docs/**/*.md`, `README.md`, `apps/**/*.{ts,tsx}` (string literals only) | [YELLOW] ~1 hr. |
| P7 | AUDIT-EXTREFS-3 — Per-package READMEs | todo | | **PR-24** | `apps/api/README.md`, `apps/mobile/README.md`, `packages/{database,schemas,test-utils,retention}/README.md` | [YELLOW] ~2 hr. |

**Cross-coupling:** None.

---

### C9 — Cleanup-triage (parallel track)

**Source:** `docs/audit/2026-04-30-cleanup-triage.md`
**Severity:** **YELLOW** (parallel-track; not summed into main effort estimate)
**Headline:** 164 active files in 3 categories + 8 inbound-link conflicts requiring co-changes with C7. Execution dominated by human review of category assignments.

| Phase | Description | Status | Owner | PR | Files-claimed | Notes |
|---|---|---|---|---|---|---|
| P1 | Cleanup-triage E1 — Process 25 Cat 1 obsolete files | todo | | **PR-25** | per cleanup-triage doc; touches `docs/_archive/` | [YELLOW] varies. |
| P2 | Cleanup-triage E2 — Process 23 Cat 2 possibly-obsolete files | todo | | **PR-26** | per cleanup-triage doc | [YELLOW] varies. |
| P3 | Cleanup-triage E3 — Process 8 inbound-link conflicts | todo | | **PR-27** | per cleanup-triage doc + targets in C7 | [YELLOW] ~2-3 hr. **Co-land with PR-17.** |
| P4 | Cleanup-triage E4 — Verify 116 Cat 3 keep-files | todo | | **PR-28** | per cleanup-triage doc | [GREEN-YELLOW] ~1 hr sample-based. |

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

**Gate status (2026-05-04): RESOLVED.** `origin/language-add` is now merged to main. Branch rebased onto current main. Only CLAUDE.md + lockfile overlap found — trivially resolvable. No plan adjustments needed.

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
- New decisions added then resolved: D-C4-3 (`personaFromBirthYear()` → `computeAgeBracket()`, RESOLVED 2026-05-04), D-C4-4 (`relearn.tsx` absorbed into P7, RESOLVED 2026-05-04)
- C4 expanded from 5 phases to 8: P6 (forward-only guard test), P7 (root migration), P8 (absorbed into P7)
- C4 severity upgraded YELLOW → YELLOW-RED
- C7 P3 scope expanded: tighten CLAUDE.md persona-unaware rule + update UX spec stale `(learner)/` paths
- Closed/revised: 2 entries added (D-C4-1 original recommendation + MOBILE-2 F4 severity)
- Methodology lesson: future audits should grep `docs/specs/epics.md` for the relevant axis before recommending governance posture. Forward-only guard tests (per BUG-743 pattern) should cover persona-shaped booleans in shared components.
