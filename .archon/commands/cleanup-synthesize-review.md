---
description: Synthesize cleanup review agent findings into a consolidated artifact (no GitHub post — deferred to cleanup-post-review-comments)
argument-hint: (none — reads from review artifacts)
---

# Cleanup Synthesize Review

*Project-local override of `archon-synthesize-review`. Creates a consolidated review artifact ONLY — does NOT post to GitHub. The PR comment is posted later by `cleanup-post-review-comments` after `cleanup-create-pr`. See `.archon/spike-plan.md` for context.*

---

## Your Mission

Read all parallel review agent artifacts (code-review, test-coverage, adversarial-review), synthesize findings into a consolidated report, and create a master artifact.

**Output artifact**: `$ARTIFACTS_DIR/review/consolidated-review.md`

(GitHub PR comment posting is deferred to `cleanup-post-review-comments` — no PR exists yet at this stage in the DAG.)

---

## Phase 1: LOAD - Gather All Findings

### 1.1 Read Scope

```bash
cat $ARTIFACTS_DIR/review/scope.md
```

Note the Work Order PR identifier (no GitHub PR number exists yet).

### 1.2 Read All Agent Artifacts

```bash
cat $ARTIFACTS_DIR/review/code-review-findings.md
cat $ARTIFACTS_DIR/review/test-coverage-findings.md
cat $ARTIFACTS_DIR/review/adversarial-findings.md
```

**PHASE_1_CHECKPOINT:**
- [ ] Scope loaded
- [ ] All 3 agent artifacts read
- [ ] Findings extracted from each

---

## Phase 2: SYNTHESIZE - Combine Findings

### 2.1 Aggregate by Severity

Combine all findings across agents:
- **CRITICAL**: Must fix before merge
- **HIGH**: Should fix before merge
- **MEDIUM**: Consider fixing (options provided)
- **LOW**: Nice to have (defer or create issue)

### 2.2 Deduplicate

Check for overlapping findings:
- Same issue reported by multiple agents
- Related issues that should be grouped
- Conflicting recommendations (resolve)

### 2.3 Prioritize

Rank findings by:
1. Severity (CRITICAL > HIGH > MEDIUM > LOW)
2. User impact
3. Ease of fix
4. Risk if not fixed

### 2.4 Compile Statistics

```
Total findings: {n}
- CRITICAL: {n}
- HIGH: {n}
- MEDIUM: {n}
- LOW: {n}

By agent:
- code-review: {n} findings
- test-coverage: {n} findings
- adversarial-review: {n} findings
```

**PHASE_2_CHECKPOINT:**
- [ ] Findings aggregated by severity
- [ ] Duplicates removed
- [ ] Priority order established
- [ ] Statistics compiled

---

## Phase 3: GENERATE - Create Consolidated Artifact

Write to `$ARTIFACTS_DIR/review/consolidated-review.md`:

```markdown
# Consolidated Review: {Work Order PR-ID}

**Date**: {ISO timestamp}
**Agents**: code-review, test-coverage, adversarial-review
**Total Findings**: {count}

---

## Executive Summary

{3-5 sentence overview of PR quality and main concerns}

**Overall Verdict**: {APPROVE | REQUEST_CHANGES | NEEDS_DISCUSSION}

**Auto-fix Candidates**: {n} CRITICAL + HIGH issues can be auto-fixed
**Manual Review Needed**: {n} MEDIUM + LOW issues require decision

---

## Statistics

| Agent | CRITICAL | HIGH | MEDIUM | LOW | Total |
|-------|----------|------|--------|-----|-------|
| Code Review | {n} | {n} | {n} | {n} | {n} |
| Test Coverage | {n} | {n} | {n} | {n} | {n} |
| Adversarial Review | {n} | {n} | {n} | {n} | {n} |
| **Total** | **{n}** | **{n}** | **{n}** | **{n}** | **{n}** |

---

## CRITICAL Issues (Must Fix)

### Issue 1: {Title}

**Source Agent**: {agent-name}
**Location**: `{file}:{line}`
**Category**: {category}

**Problem**:
{description}

**Recommended Fix**:
```typescript
{fix code}
```

**Why Critical**:
{impact explanation}

---

### Issue 2: {Title}

{Same structure...}

---

## HIGH Issues (Should Fix)

### Issue 1: {Title}

{Same structure as CRITICAL...}

---

## MEDIUM Issues (Options for User)

### Issue 1: {Title}

**Source Agent**: {agent-name}
**Location**: `{file}:{line}`

**Problem**:
{description}

**Options**:

| Option | Approach | Effort | Risk if Skipped |
|--------|----------|--------|-----------------|
| Fix Now | {approach} | {LOW/MED/HIGH} | {risk} |
| Create Issue | Defer to separate PR | LOW | {risk} |
| Skip | Accept as-is | NONE | {risk} |

**Recommendation**: {which option and why}

---

## LOW Issues (For Consideration)

| Issue | Location | Agent | Suggestion |
|-------|----------|-------|------------|
| {title} | `file:line` | {agent} | {brief recommendation} |
| ... | ... | ... | ... |

---

## Positive Observations

{Aggregated good things from all agents:
- Well-structured code
- Good error handling in X
- Comprehensive tests for Y
- Clear documentation}

---

## Suggested Follow-up Issues

If not addressing in this PR, create issues for:

| Issue Title | Priority | Related Finding |
|-------------|----------|-----------------|
| "{suggested issue title}" | {P1/P2/P3} | MEDIUM issue #{n} |
| ... | ... | ... |

---

## Next Steps

1. **`cleanup-fix-locally`** will address {n} CRITICAL + HIGH issues on the local worktree branch.
2. **`cleanup-push`** will push the branch.
3. **`cleanup-create-pr`** will create the GitHub PR.
4. **`cleanup-post-review-comments`** will post this consolidated review and the fix report as PR comments.
5. Reviewer should address remaining MEDIUM/LOW issues manually.

---

## Agent Artifacts

| Agent | Artifact | Findings |
|-------|----------|----------|
| Code Review | `code-review-findings.md` | {n} |
| Test Coverage | `test-coverage-findings.md` | {n} |
| Adversarial Review | `adversarial-findings.md` | {n} |

---

## Metadata

- **Synthesized**: {ISO timestamp}
- **Artifact**: `$ARTIFACTS_DIR/review/consolidated-review.md`
- **GitHub posting**: deferred to `cleanup-post-review-comments`
```

**PHASE_3_CHECKPOINT:**
- [ ] Consolidated artifact created
- [ ] All findings included
- [ ] Severity ordering correct
- [ ] Options provided for MEDIUM/LOW

---

## Phase 4: OUTPUT - Confirmation

GitHub PR comment posting is handled by `cleanup-post-review-comments` after the PR is created. No `gh pr comment` call here.

```
✅ Consolidated review artifact created at $ARTIFACTS_DIR/review/consolidated-review.md.
   PR comment will be posted by cleanup-post-review-comments after PR creation.
```

---

## Success Criteria

- **ALL_ARTIFACTS_READ**: All 3 agent findings loaded
- **FINDINGS_SYNTHESIZED**: Combined, deduplicated, prioritized
- **CONSOLIDATED_CREATED**: Master artifact written
- **NO_GITHUB_POST**: GitHub comment NOT posted (correctly deferred)
