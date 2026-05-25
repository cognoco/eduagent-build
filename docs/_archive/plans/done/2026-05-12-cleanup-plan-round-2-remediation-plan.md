# Cleanup-Plan Remediation Pass — Round 2

## Context

### What you are about to do

`docs/audit/cleanup-plan.md` is the root input for the Archon workflow at `.archon/workflows/execute-cleanup-pr-claude.yaml`. The workflow's first step (`.archon/scripts/cleanup-extract.sh`) deterministically parses the plan's phase-table rows into a `work-order.md` that the implement agent reads. The implement agent does **not** read the cleanup plan itself — only the extracted work order — so plan errors translate directly into:

- Wrong **Description** → agent implements the wrong thing → reviewers flag CRITICAL/HIGH → fix-locally may not be able to resolve plan-level errors
- Incomplete **Files-claimed** → scope guard fires (Phase 2.5 / 5.5), workflow halts, Notion P1 ticket
- Wrong **Notes preconditions** → agent trusts them and breaks live code → 3-strike circuit breaker → Notion P1
- Bogus **Verification command** or impossible **Definition of Done** → validation fails → blocked

### What prompted this round

A first adversarial review (`docs/audit/cleanup-review.md`) was remediated in DEV-004 (already applied — see the Deviations Log section at the bottom of `cleanup-plan.md`). A second adversarial review (`docs/audit/cleanup-review-round-2.md`) was then run against the post-DEV-004 plan and surfaced 6 findings: 2 BLOCKER, 3 HIGH, 1 MEDIUM. Most of them are the same anti-pattern as DEV-004 — detailed phase rows updated, but downstream summaries / cross-coupling sections / DoD commands not propagated.

This pass remediates all 6 Round-2 findings and adds a DEV-005 entry to the Deviations Log.

### Pre-work: branch state

PR #187 ("UX cleanup and mobile reliability polish") merged to `origin/main` on 2026-05-09. The plan doc has already been updated to reflect this (activity section says "Merged 2026-05-09"; the 5 `blocked-validation: PR #187` gates in C1 P1, C1 P3, C1 P5, C4 P7, C7 P1 have been replaced with "agent must re-read at HEAD" notes).

**However, the working branch `consistency2` is NOT yet rebased onto post-#187 main.** Confirm with:
```bash
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/main
# Should show '0 0' after rebase. Currently shows '17 2' or similar.
```

If the branch is not rebased, do that BEFORE applying these plan edits. Without the rebase, the working tree's missing-snapshot list is `0006-0010, 0013, 0021, 0025, 0043, 0044, 0055, 0063, 0064, 0065` (14 items), but the plan correctly says `origin/main`'s list is `0006-0010, 0013, 0021, 0025, 0043, 0044, 0055` (11 items). C8 P1's Files-claimed reflects the post-merge state.

After rebase the working tree will match `origin/main`'s state. No plan edit is needed for the rebase itself — the plan is already aligned with `origin/main`.

### Files in scope

Only `docs/audit/cleanup-plan.md` is edited.

For reference (read-only, do not modify):
- `docs/audit/cleanup-review-round-2.md` — source of findings (line numbers in this plan reference its anchors)
- `.archon/scripts/cleanup-extract.sh` — workflow parser whose grammar dictates phase-row structure
- `.archon/scripts/cleanup-scope-guard.sh` — enforces Files-claimed completeness; verifies the agent only touches claimed files
- `.archon/commands/cleanup-plan-review.md` — pre-implement gate logic that catches obvious work-order errors

---

## Edits to `docs/audit/cleanup-plan.md`

Apply each block's changes by locating the unique-text anchor (works regardless of line drift). Verify the anchor first, edit, then move on.

### R2-1 — Refine C1 P5 line-number reference (small follow-up)

The `blocked-validation: PR #187` gates have already been removed. One residual: my pre-merge line-number guesses ("around 570 and 712") are now stale. The reviewer found post-merge sites at `sessions.ts:574-578` and `:743-746`.

**Anchor:** the C1 P5 phase row in the C1 cluster table — find the row starting `| P5 | Per D-C1-3 (revised 2026-05-09)`.

**Edit:** Find the substring `they were around 570 and 712 pre-merge; they will have shifted` and replace it with `they are around 574-578 and 743-746 on origin/main as of 2026-05-09; verify before edit`.

### R2-2 — Fix C2 P4 Definition-of-Done grep (BLOCKER)

The current DoD scans `apps/api/src/inngest/` which catches dozens of unrelated unit-test mocks (e.g. `payment-failed-observe.test.ts`, `session-completed.test.ts`). An agent satisfying the DoD literally would either fail or scope-creep into draining unit tests not in C2 P4's scope.

**Anchor:** the C2 P4 phase row — find the row starting `| P4 | Drain inngest allowlist`.

**Edit:** Replace the entire DoD command line. Find:
```
Definition of Done: `rg "jest\.mock\(['\"]\\.\\.?/" tests/integration/ apps/api/src/inngest/` returns zero hits in the listed files.
```
Replace with:
```
Definition of Done: `rg "apps/api/src/inngest/client" tests/integration/account-deletion.integration.test.ts tests/integration/consent-email.integration.test.ts tests/integration/learning-session.integration.test.ts tests/integration/sessions-routes.integration.test.ts tests/integration/stripe-webhook.integration.test.ts tests/integration/mocks.ts` returns zero hits inside `jest.mock(...)` blocks (any non-mock import of the client is fine — the drain target is the mock boundary, not the symbol itself).
```

The boundary semantics matter: tests can legitimately *import* the client; what they cannot do is `jest.mock` it.

### R2-3 — Scope two zero-hit DoDs to code-only paths (HIGH)

#### R2-3a: C1 P3 DoD

Current DoD says `rg 'coachingCardCelebrationResponseSchema'` returns zero hits "across the workspace". This is impossible — audit docs (`docs/audit/cleanup-review.md`, `docs/audit/2026-05-03-audit-types-2-deepening.md`), the plan itself, and `plans/serialized-greeting-island.md` all reference the symbol as evidence/instructions and are out of scope for PR-02.

**Anchor:** the C1 P3 phase row — find the row starting `| P3 | Delete the dead `coachingCardCelebrationResponseSchema` export`.

**Edit:** In that row's Notes, find `rg 'coachingCardCelebrationResponseSchema'` returns zero hits across the workspace. and replace with `rg 'coachingCardCelebrationResponseSchema' packages apps` returns zero hits.

#### R2-3b: C4 P7 DoD

Current DoD says `rg 'personaFromBirthYear' apps/mobile docs packages` returns zero hits. The `docs` portion is wrong — `docs/architecture.md` is owned by C7 P3 (not PR-11), and audit docs are historical evidence. PR-11 can complete its work and still fail its own DoD because PR-17 hasn't run.

**Anchor:** the C4 P7 phase row — find the row starting `| P7 | Expand shared `computeAgeBracket()` to three-way`.

**Edit:** In that row's Notes, find `rg 'personaFromBirthYear' apps/mobile docs packages` returns zero hits and replace with `rg 'personaFromBirthYear' apps/mobile packages/schemas/src` returns zero hits (the `docs/architecture.md` reference is owned by C7 P3 and updated in PR-17; audit docs are historical evidence and stay as-is).

### R2-4 — Sweep three stale `PR-02 → PR-06` references (HIGH)

DEV-004 marked the dependency edge stale in **Key dependencies** but missed three other places that still imply C1 P3 gates C2 P3.

#### R2-4a: C1 cross-coupling section

**Anchor:** the C1 cluster's `**Cross-coupling:**` block. Find the bullet `- C1 P3 → unblocks C2 sweep (route tests can re-assert against schemas)`.

**Edit:** Replace that bullet with `- ~~C1 P3 → unblocks C2 sweep~~ — stale (DEV-004): route wraps already shipped upstream; PR-02 is now a dead-export deletion only. C2 P3 has no upstream dependency.`

#### R2-4b: C2 P3 row Notes

**Anchor:** the C2 P3 phase row — find the row starting `| P3 | AUDIT-TESTS-2C — Drain LLM allowlist`.

**Edit:** Find the substring ` Pairs with PR-02. ` (with surrounding spaces) and remove it entirely. The phrase makes no sense post-DEV-004.

#### R2-4c: Cross-cluster sequencing

**Anchor:** the `## Cross-cluster sequencing` section. Find the bullet starting `- **C1 ↔ C2 paired.**`.

**Edit:** Replace the entire bullet (everything from `- **C1 ↔ C2 paired.**` through the end of that bullet — it's a multi-sentence paragraph) with:
```
- **C1 ↔ C2 paired (historical).** Originally C1 was supposed to introduce runtime parsing on `c.json` and C2 was to add test-side parsing in lockstep. **Status (DEV-004, 2026-05-09):** the route wraps already shipped upstream, so C1 P3 is now a dead-export deletion. C2 P3 and P4 have no upstream dependency on C1. Keeping this note as evidence in case the original pairing rationale becomes relevant for future schema work.
```

### R2-5 — Sweep stale counts and old work descriptions in summaries (HIGH)

The same anti-pattern as DEV-004: detailed phase rows updated, summary tables/headlines/lists not propagated. Seven separate locations need fixing.

#### R2-5a: Net-effect bullet about billing.ts

**Anchor:** the `**Net effect on Stage 3 plan (cumulative to 2026-05-09):**` block in the activity section. Find the bullet starting `- **Partial drift:** C1 P3`.

**Edit:** Replace the entire bullet with:
```
- **C1 P3 re-scoped (DEV-004):** all 6 target route files are fully wrapped (multi-line `c.json(\n  schema.parse({...}),\n  status\n)` pattern). Earlier sweep grep was single-line-only and missed it. P3 is now just a dead-export deletion in `progress.ts`.
```

#### R2-5b: C1 cluster headline

**Anchor:** the C1 cluster's `**Headline:**` line — find `12 wrappable c.json sites confirmed`.

**Edit:** Replace the entire Headline with:
```
**Headline:** Route wraps and the celebrations rename already shipped upstream (verified 2026-05-09 — see DEV-004). 1 schema needs `queued` field added (DONE in PR #153). 2 schema renames + 2 new response schemas needed (P4). 1 SSE schema needed with optional `code` field (P5, revised). 2 typed errors must move to `@eduagent/schemas` for type co-location (P1, BUG-947 guard pattern preserved). 4 no-route schemas need disposition: 2 deletes + 2 renames per D-C1-1 (P6). 1 dead schema export to delete in `progress.ts` (P3). 3 auth 501 stubs to delete; `ERROR_CODES.NOT_IMPLEMENTED` preserved per DEV-004 (P7).
```

#### R2-5c: C2 cluster headline

**Anchor:** the C2 cluster's `**Headline:**` line — find `3 LLM offenders + 6 inngest offenders`.

**Edit:** Replace the entire Headline with:
```
**Headline:** Real-DB harness already exists (`weekly-progress-push.integration.test.ts` is the migration exemplar). BUG-743 LLM mock guard is the precedent. TESTS-1 F2 was overstated (driver shim, not behavior mock). **Sweep target after PR #180 + DEV-004 corrections:** 2 LLM integration offenders (was 3) + 5 Inngest integration offenders + `tests/integration/mocks.ts` shared setup (was "6"). New per-channel guards superseded by GC1 ratchet (PR #171).
```

#### R2-5d: PR-07 summary in PR Execution Plan table

**Anchor:** the PR Execution Plan table row — find `| PR-07 | C2 | P4 | Drain 6 Inngest mock allowlist offenders`.

**Edit:** Replace the row's Summary cell with:
```
Drain 5 Inngest mock allowlist offenders + shared `tests/integration/mocks.ts` setup. ~~Blocked on PR-05.~~ **Unblocked** — GC1 ratchet (#171) prevents regression during/after drain.
```

#### R2-5e: Human-involvement-required PR-12 stale count

**Anchor:** the `### Human involvement required` section. Find `**PR-12** (C5 P1): 32 dep deletions`.

**Edit:** Replace `32 dep deletions` with `~17 dep changes (6 root duplicate deletions, 2 api orphan deletions, dotenv align, 8 mobile tilde pins, FORBIDDEN list expansion)`.

#### R2-5f: C1 P8 still claims deleted `interview.ts`

**Anchor:** the C1 P8 phase row — find the row starting `| P8 | AUDIT-TYPES-2.4-FOLLOWUP`.

**Edit:** In that row's Files-claimed cell, remove `apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts` if present, AND remove `apps/api/src/routes/interview.ts` (the latter is the relevant fix for this finding — `interview.ts` was deleted upstream and is no longer in the codebase).

The Files-claimed should end up as: `packages/schemas/src/stream-fallback.ts`, `apps/api/src/routes/sessions.ts`, `apps/mobile/src/lib/sse.ts` (+ tests). Append to that row's Notes: `**Note (2026-05-09):** `apps/api/src/routes/interview.ts` removed from Files-claimed — file was deleted upstream before this phase was authored.`

#### R2-5g: D-C1-1 stale "Defer to C1 P3" reference

**Anchor:** the D-C1-1 row in the Resolved Decisions table — find the row starting `| D-C1-1 | 2026-05-03 |`.

**Edit:** Append (do not rewrite — preserve the historical decision text) the following sentence to the Resolution column, just before the final closing `|`:
```
**Note (2026-05-09):** the `coachingCardCelebrationResponseSchema → pendingCelebrationsResponseSchema` rename actually shipped upstream before C1 P3 ran. C1 P3 is retained only to delete the now-dead `coachingCardCelebrationResponseSchema` export — see DEV-004.
```

### R2-6 — Three fixes for C9 P5 / PR-29 (MEDIUM)

#### R2-6a: Add PR-29 to C9 cross-coupling

**Anchor:** the C9 cluster's `**Cross-coupling:**` block. Find the bullet `- P3 ↔ C7 P1-P5 (inbound-link conflicts)`.

**Edit:** Insert a new bullet immediately after that one:
```
- P5 (PR-29) ↔ P1+P3 (PR-25/PR-27): folder-level archive moves create new paths that the inbound-link fixes target. PR-29's link-fix scope overlaps with PR-27. Co-land or sequence the three together to avoid broken references.
```

#### R2-6b: Fix the broken-backtick DoD command

**Anchor:** the C9 P5 phase row — find the row starting `| P5 | Folder-level archive moves`.

**Edit:** In that row's Notes, find `rg 'docs/(specs\|plans)/done(/\|"\|`)' docs/` (the literal command text contains a backtick that breaks the markdown rendering and is malformed shell anyway) and replace with:
```
rg 'docs/(specs|plans)/done' docs --glob '!docs/_archive/**' --glob '!docs/audit/**' --glob '!docs/specs/done/**' --glob '!docs/plans/done/**'
```

The `--glob` excludes prevent the command from re-flagging audit history (which preserves old paths as evidence) or the directories being moved themselves.

#### R2-6c: Update C9 P5 Definition of Done

**Anchor:** the same C9 P5 phase row.

**Edit:** Find the substring `Definition of Done: ` and replace the rest of the DoD sentence (everything from `Definition of Done` through the next `.` that ends the DoD) with:
```
Definition of Done: `ls docs/specs/done docs/plans/done` returns "no such directory"; `docs/_archive/specs/done/` and `docs/_archive/plans/done/` exist; the grep above (with all four `--glob` excludes) returns zero hits in active docs.
```

### Append DEV-005 to Deviations Log

**Anchor:** the end of the Deviations Log section — find the existing `### DEV-004` block and append the new entry below it (after DEV-004's last bullet and methodology lesson).

**New entry text:**
```
### DEV-005

**Status:** `processed-2026-05-09`
**Source:** Round-2 adversarial review (`docs/audit/cleanup-review-round-2.md`, dated 2026-05-09)
**Finding:** Round 2 surfaced 6 issues post-DEV-004: 2 BLOCKER (R2-1: PR #187 in-flight references after merge; R2-2: C2 P4 DoD grep scope-creeps into unit tests), 3 HIGH (R2-3: zero-hit DoDs include audit/historical docs; R2-4: stale `PR-02 → PR-06` references in 3 places DEV-004 missed; R2-5: 7 stale summary counts/headlines/list entries), 1 MEDIUM (R2-6: PR-29 missing from C9 cross-coupling, broken-backtick DoD, missing audit-history excludes).

**Root cause:** Same anti-pattern DEV-004 named: detailed phase rows updated, downstream summaries/cross-couplings/DoDs not propagated. DEV-004's "sweep all non-phase-row summaries" recommendation was followed in 5 places but missed C1/C2 cluster headlines, the C1 cross-coupling subsection, the C2 P3 "Pairs with PR-02" Notes phrase, the cross-cluster sequencing paragraph, the C1 P8 stale Files-claimed, and the human-involvement-required count. Additionally, R2-2 and R2-3 surfaced a new sub-class of error: Definition-of-Done grep commands that are impossible to satisfy because they scope to the workspace or include directories the phase doesn't own.

**Delta applied (2026-05-09):**
- C1 P5 line-number reference refined to post-#187-merge sites (`sessions.ts:574-578` and `:743-746`).
- C2 P4 DoD rewritten to scope to the 6 claimed files only and target the `apps/api/src/inngest/client` boundary.
- C1 P3 DoD scoped to `packages apps` (was workspace-wide).
- C4 P7 DoD scoped to `apps/mobile packages/schemas/src` (was including `docs/`).
- C1 cross-coupling, C2 P3 Notes, and Cross-cluster sequencing paragraphs all amended to remove stale `PR-02 → PR-06` and `C1 P3 gating` claims.
- Net-effect bullet, C1 cluster headline, C2 cluster headline, PR-07 summary, human-involvement PR-12 entry, C1 P8 Files-claimed, and D-C1-1 resolution text all updated to reflect post-DEV-004 reality.
- C9 P5 row: PR-29 added to cross-coupling subsection; broken-backtick DoD command fixed; `--glob '!docs/_archive/**' --glob '!docs/audit/**'` excludes added.

**Methodology lessons:**
1. **DoD commands are part of the work order, not commentary.** Every grep in a Definition-of-Done must be tested against the current working tree to confirm it returns the expected zero hits in scope, AND that it does NOT return spurious hits in out-of-scope paths (audit history, sibling clusters' Files-claimed). A DoD that fails on accidental hits is a workflow blocker, not a typo.
2. **Sweep more aggressively.** A targeted edit to a phase row should trigger a `rg` for any of the changed identifiers across the entire plan doc, not just the row. Cluster headlines, cross-coupling sections, the PR Execution Plan table, the Independently-startable list, the Human-involvement-required list, and the Resolved Decisions resolutions are all at-risk surfaces. Add a checklist for these to the audit-status skill.
3. **Adversarial review must run after each remediation, not just once before dispatch.** R2 found 6 issues that DEV-004 introduced or failed to clean up. Self-review missed them. Treat adversarial review as a per-remediation-pass step, not a one-shot.
```

---

## Verification (after applying all edits)

### Self-checks before commit

Run these from the repo root:

1. **No remaining `blocked-validation: PR #187` strings:**
   ```bash
   rg "blocked-validation: PR #187" docs/audit/cleanup-plan.md
   ```
   Should return zero hits (the gates were lifted post-merge — DEV-005 doesn't re-add them).

2. **No `Pairs with PR-02` or `unblocks C2 sweep` strings:**
   ```bash
   rg "Pairs with PR-02|unblocks C2 sweep" docs/audit/cleanup-plan.md
   ```
   Should return zero unstruck hits (struck-through entries with `~~` are fine — they're historical evidence).

3. **No remaining `apps/api/src/routes/interview.ts` references in active phase Files-claimed:**
   ```bash
   rg "apps/api/src/routes/interview.ts" docs/audit/cleanup-plan.md
   ```
   Acceptable hits: D-C1-3 historical-decision text (preserved with revision note), DEV-004/DEV-005 entries explaining the deletion. Unacceptable: any current phase row's Files-claimed cell.

4. **DoD greps are realistic:** For each of C1 P3, C4 P7, C2 P4, and C9 P5, run the new DoD grep against the current working tree (NOT the file you just edited — you want to confirm the command shape, not the result). All four should produce parseable output without shell errors.

5. **Counts match across summary and detail:**
   - C1 P3 detail says "delete dead export"; PR-02 summary says the same.
   - C2 P3 detail says "2 LLM offenders"; PR-06 summary says "2 LLM offenders".
   - C2 P4 detail says "5 + mocks.ts"; PR-07 summary says "5 + mocks.ts".
   - C5 P1 detail says "~17 changes"; PR-12 summary AND Human-involvement section both say "~17".
   - C8 P1 detail says "11 missing"; PR-18 summary says "11 missing".

### Cross-reference Round-2 review

Open `docs/audit/cleanup-review-round-2.md`. For each of R2-1 through R2-6, confirm the recommended fix is reflected in the plan. Nothing left dangling.

### Commit message

A single commit with message:
```
docs(audit): remediate Round-2 adversarial review (DEV-005)

Sweep stale summaries, fix impossible DoD greps, remove stale
PR-02 → PR-06 references that DEV-004 missed. See DEV-005 entry
in cleanup-plan.md Deviations Log.
```

Use the `commit` skill. Do not push.

---

## Out of scope

- **Executing any cleanup PRs.** This pass is plan-doc maintenance only.
- **Branch rebase.** That's a separate workflow step. The plan is already aligned with `origin/main` post-#187; the working branch alignment is the operator's call.
- **Round 1 findings.** Already addressed in DEV-004 (already in `cleanup-plan.md`).
- **Workflow changes.** The Archon workflow is fine; only the plan doc needs editing.
- **Rewriting historical Resolved Decisions wholesale.** Append revision notes only.

---

## Critical files

- **`docs/audit/cleanup-plan.md`** — the only file edited.
- **`docs/audit/cleanup-review-round-2.md`** — source of findings (read-only).
- **`docs/audit/cleanup-review.md`** — Round-1 review, already remediated by DEV-004 (read-only, for context).
- **`.archon/scripts/cleanup-extract.sh`**, **`.archon/scripts/cleanup-scope-guard.sh`**, **`.archon/commands/cleanup-plan-review.md`** — workflow consumers; informs why the structural fixes matter (read-only).
