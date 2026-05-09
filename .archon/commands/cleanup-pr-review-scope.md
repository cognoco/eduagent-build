---
description: Gather local-branch context for review before PR creation (pre-PR variant of archon-pr-review-scope)
argument-hint: (none — reads work order from artifacts directory)
---

# Cleanup PR Review Scope (Pre-PR Variant)

*Project-local override of `archon-pr-review-scope`. Operates on the local worktree branch BEFORE the GitHub PR is created. The cleanup-create-pr node runs later in the DAG. See `.archon/spike-plan.md` for context.*

---

## Your Mission

Verify the local worktree branch is in a reviewable state, gather all context needed for the parallel review agents, and prepare the artifacts directory structure.

**Note**: No GitHub PR exists yet, so checks that depend on PR state (merge conflicts, CI status, behind-base, draft) are skipped — they will be evaluated by GitHub once `cleanup-create-pr` runs.

---

## Phase 1: IDENTIFY - Determine Scope

### 1.1 Get Work Order PR Identifier

The cleanup workflow's `extract` step writes `work-order.md` to `$ARTIFACTS_DIR/`. It contains the cleanup-plan PR identifier (e.g., `PR-08`).

```bash
ls $ARTIFACTS_DIR/work-order.md
PR_ID=$(rg -oP 'PR-\d+' $ARTIFACTS_DIR/work-order.md | head -1)
echo "Work Order: $PR_ID"
```

This is the cleanup-plan PR identifier, NOT a GitHub PR number (no GitHub PR exists yet).

### 1.2 Get Branch Info

```bash
HEAD_BRANCH=$(git branch --show-current)
BASE_BRANCH=main
echo "Branch: $HEAD_BRANCH → $BASE_BRANCH"
```

**PHASE_1_CHECKPOINT:**
- [ ] Work order PR identifier extracted
- [ ] Branch info captured

---

## Phase 2: VERIFY - Local State Checks

**No GitHub PR exists yet, so merge-conflict / CI / behind-base / draft checks do not apply at this stage.**

### 2.1 Check Diff Size

```bash
git diff --stat origin/main...HEAD | tail -1
git diff --shortstat origin/main...HEAD
```

| Metric | Warning Threshold | Action |
|--------|-------------------|--------|
| Changed files | 20+ | Note in scope: large diff |
| Lines changed | 1000+ | Note in scope: large diff |

Note the size in the scope manifest if large; do not block.

### 2.2 Compile Local Status Summary

```markdown
## Pre-PR Status

| Check | Status | Notes |
|-------|--------|-------|
| Branch | ✅ {head} → {base} | Local worktree branch |
| Diff Size | ✅ Normal / ⚠️ Large ({N} files) | {details} |
```

**PHASE_2_CHECKPOINT:**
- [ ] Diff size noted
- [ ] Local status compiled

---

## Phase 3: CONTEXT - Gather Review Context

### 3.1 Get Full Diff

```bash
git diff origin/main...HEAD
```

Store this for reference — parallel agents will re-fetch as needed.

### 3.2 List Changed Files by Type

```bash
git diff --name-only origin/main...HEAD
```

**Categorize files:**
- Source code (`.ts`, `.js`, `.py`, etc.)
- Test files (`*.test.ts`, `*.spec.ts`, `test_*.py`)
- Documentation (`*.md`, `docs/`)
- Configuration (`.json`, `.yaml`, `.toml`)
- Types/interfaces

### 3.3 CLAUDE.md Rules

CLAUDE.md is already loaded into your system prompt — do not re-read it.
Note the key rules that the parallel review agents should check the diff against
(captured later in the scope manifest's "CLAUDE.md Rules to Check" section).

### 3.4 Identify New Abstractions

Scan the diff for new abstractions introduced by this PR:

- New interfaces, types, or abstract classes (search diff for `interface `, `type `, `abstract class`)
- New utility modules or helper files (new `.ts` files that aren't feature files or tests)
- New configuration keys or schema fields

For each new abstraction found, note it in the scope manifest under "Review Focus Areas" so the code review agent can verify it doesn't duplicate an existing primitive.

```bash
# Quick scan for new abstractions in diff
git diff origin/main...HEAD | rg '^\+' | rg '(export )?(interface |type |abstract class )' | head -20
```

**PHASE_3_CHECKPOINT:**
- [ ] Diff available
- [ ] Files categorized by type
- [ ] CLAUDE.md rules noted
- [ ] New abstractions scanned

---

## Phase 3.5: WORK ORDER CONTEXT - Read Cleanup-Plan Scope

The work order contains the original cleanup plan context. Read it for scope limits.

### 3.5.1 Read Work Order

```bash
cat $ARTIFACTS_DIR/work-order.md
```

### 3.5.2 Extract Scope Limits

The work order describes specific phases, files-claimed, and deliverables. Anything OUTSIDE the scope of these phases is intentional exclusion — do NOT flag as a bug or missing feature.

If the work order references resolved decisions (D-XXX), those are also in scope as defined by the decision text.

**PHASE_3.5_CHECKPOINT:**
- [ ] Work order loaded
- [ ] Scope limits noted (phases + files-claimed)

---

## Phase 3.6: PRE-FLAG CHECK — Verify Against `origin/main`

**Why this exists:** A previous review-scope run flagged a phase as "P1 incomplete"
because an invariant the work order required wasn't visible in the diff — but
the invariant already existed at `origin/main:<file>` and the diff simply didn't
touch that line. False-positive. This rule prevents the recurrence.

### 3.6.1 The Rule

Before adding any claim to the scope manifest of the form:
- "Phase N appears incomplete: <invariant> missing from <file>"
- "<file> does not enforce <invariant> as the work order requires"
- "Removed: <line/check/import>" — when the diff does NOT actually delete that line

…you MUST first verify the invariant's state on `origin/main`. If the invariant
exists there and the diff does not delete or modify the line(s) that establish
it, the work order's expectation is already met; do NOT flag.

### 3.6.2 The Check

For any candidate "missing invariant" claim:

```bash
# Verify what the file looks like at origin/main
git show "origin/main:<file>" 2>/dev/null | rg -n '<expected pattern>' || \
    echo "INVARIANT NOT IN origin/main — flag is legitimate"

# Verify the diff did not remove it
git diff origin/main...HEAD -- '<file>' | rg '^-[^-].*<expected pattern>' || \
    echo "DIFF DOES NOT REMOVE the invariant"
```

Decision matrix:

| origin/main has invariant? | diff removes it? | Action |
|---|---|---|
| yes | no | DO NOT flag — work order already satisfied |
| yes | yes | flag legitimately — diff regresses an existing invariant |
| no | (n/a) | flag legitimately — work order asks for new invariant not yet present |

### 3.6.3 Apply To Every Such Claim

Run the check above for EVERY invariant-missing / phase-incomplete claim before
including it in the scope manifest. The cost is a few `git show` / `git diff`
calls; the benefit is eliminating a class of false positives that derail
fix-locally.

**PHASE_3.6_CHECKPOINT:**
- [ ] Every invariant-missing claim verified against origin/main
- [ ] False-positive candidates suppressed

---

## Phase 4: PREPARE - Create Artifacts Directory

### 4.1 Create Directory Structure

```bash
mkdir -p $ARTIFACTS_DIR/review
```

### 4.2 Clean Stale Artifacts

```bash
# Remove review directories older than 7 days
fd -t d -d 1 'pr-' "$ARTIFACTS_DIR/../reviews" --changed-before 7d -x rm -rf {} 2>/dev/null || true
```

### 4.3 Create Scope Manifest

Write `$ARTIFACTS_DIR/review/scope.md`:

```markdown
# Cleanup PR Review Scope: {Work Order PR-ID}

**Work Order**: {PR-ID from cleanup-plan.md}
**Branch**: {head} → main (LOCAL — GitHub PR not yet created)
**Date**: {ISO timestamp}

---

## Pre-PR Status

| Check | Status | Notes |
|-------|--------|-------|
| Branch | {head} → main | Local worktree branch |
| Diff Size | {status} | {files} files, +{add}/-{del} |

(Merge-conflict / CI / behind-base / draft checks do not apply pre-PR — they will be evaluated by GitHub after `cleanup-create-pr` runs.)

---

## Changed Files

| File | Type | Additions | Deletions |
|------|------|-----------|-----------|
| `src/file.ts` | source | +10 | -5 |
| `src/file.test.ts` | test | +20 | -0 |
| ... | ... | ... | ... |

**Total**: {count} files, +{additions} -{deletions}

---

## File Categories

### Source Files ({count})
- `src/...`

### Test Files ({count})
- `src/...test.ts`

### Documentation ({count})
- `docs/...`
- `README.md`

### Configuration ({count})
- `package.json`

---

## Review Focus Areas

Based on changes, reviewers should focus on:

1. **Code Quality**: {list key source files}
2. **Test Coverage**: {new functionality needing tests}
3. **CLAUDE.md Compliance**: {rules to check}
4. **Primitive Alignment**: {If new abstractions found: list them} — verify no duplication of existing primitives

---

## CLAUDE.md Rules to Check

{Extract key rules from CLAUDE.md that apply to this PR}

---

## Work Order Context

### Scope (from cleanup-plan.md)

{Summary of what the work order says is IN scope — list of phases, files-claimed, etc.}

**OUT OF SCOPE (do not flag):**
- Anything not in the work order's phases
- Pre-existing patterns that the work order didn't ask to change

---

## Metadata

- **Scope created**: {ISO timestamp}
- **Artifact path**: `$ARTIFACTS_DIR/review/`
```

**PHASE_4_CHECKPOINT:**
- [ ] Directory created
- [ ] Stale artifacts cleaned
- [ ] Scope manifest written with pre-PR status

---

## Phase 5: OUTPUT - Report

```markdown
## Cleanup PR Review Scope Complete (Pre-PR)

**Work Order**: {PR-ID}
**Branch**: {head} → main
**Files**: {count} changed (+{additions} -{deletions})

### Local Status
| Check | Status |
|-------|--------|
| Diff Size | {✅ Normal / ⚠️ Large} |

### File Categories
- Source: {count} files
- Tests: {count} files
- Docs: {count} files
- Config: {count} files

### Artifacts Directory
`$ARTIFACTS_DIR/review/`

### Next Step
Launching 3 parallel review agents (code-review, test-coverage, adversarial)...
```

---

## Success Criteria

- **WORK_ORDER_LOADED**: Work order PR identifier extracted
- **CONTEXT_GATHERED**: Local diff and file list available
- **ARTIFACTS_DIR_CREATED**: Directory structure exists
- **SCOPE_MANIFEST_WRITTEN**: `scope.md` file created with pre-PR status
