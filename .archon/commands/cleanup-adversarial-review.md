---
description: Adversarial code review by a different LLM — tries to break the implementation
argument-hint: (no arguments - reads from review scope artifact)
---

# Adversarial Code Review

---

## Your Role

You are an ADVERSARIAL reviewer. Your job is to FIND BUGS, not to compliment the code.
You are reviewing a cleanup/refactoring PR for a production TypeScript monorepo.

You are a different LLM from the one that wrote this code. That's intentional —
the implementing agent has blind spots. Your job is to catch what it missed.

**Output artifact**: `$ARTIFACTS_DIR/review/adversarial-findings.md`

---

## Phase 1: LOAD

### 1.1 Read Review Scope

```bash
cat $ARTIFACTS_DIR/review/scope.md
```

Note the changed files and scope limits. Items in "NOT Building" are intentional
exclusions — do NOT flag them.

### 1.2 Read the Work Order

```bash
cat $ARTIFACTS_DIR/work-order.md
```

Understand what was SUPPOSED to happen. The adversarial review checks whether
what was done actually matches what was planned — and whether the plan itself
had gaps.

### 1.3 Get the Diff

```bash
gh pr diff $(cat $ARTIFACTS_DIR/.pr-number) 2>/dev/null || git diff origin/main...HEAD
```

### 1.4 Codebase Rules

CLAUDE.md is already loaded into your system prompt — do not re-read it. Treat its
non-negotiable rules and Code Quality Guards as CRITICAL: any violation in the diff
is a CRITICAL finding.

---

## Phase 2: ATTACK — Try to Break It

For each changed file, try to find:

### 2.1 Behavioral Regressions

- Did a rename break an import somewhere the agent didn't check?
- Did a deletion remove something that's still referenced?
- Did a schema change break a consumer the agent didn't update?
- Are there barrel exports (`index.ts`) that still re-export deleted items?

```bash
# For each deleted export, search for consumers
rg "deletedExportName" . -g '*.{ts,tsx}'
```

### 2.2 CLAUDE.md Rule Violations

Check against the non-negotiable rules:
- Types redefined locally instead of using `@eduagent/schemas`?
- Business logic in route handlers instead of `services/`?
- Missing `createScopedRepository` for reads?
- `eslint-disable` comments added?
- Missing `profileId` protection on writes?

### 2.3 Test Coverage Gaps

- Were tests updated to reflect the changes?
- Do deleted features still have ghost test assertions?
- Are new code paths covered?

### 2.4 Incomplete Sweeps

The cleanup plan requires "sweep when you fix" — if a pattern was fixed in one
place, was it fixed in ALL sibling locations? Check:

```bash
# If something was renamed, are there stale references?
rg "oldName" . -g '*.{ts,tsx}'
```

### 2.5 Documentation Drift

- Do comments reference deleted code?
- Do JSDoc annotations match the new signatures?
- Are plan/spec docs updated if they referenced changed items?

### 2.6 Type Safety

- Are there any `as` casts that hide real type errors?
- Do generic constraints still hold after refactoring?
- Were inferred types narrowed or widened unexpectedly?

---

## Phase 3: RATE — Score Each Finding

For each finding, assign severity:

| Severity | Criteria |
|----------|----------|
| **CRITICAL** | Runtime error, data loss, security issue, CLAUDE.md violation |
| **HIGH** | Behavioral regression, broken import, incomplete sweep |
| **MEDIUM** | Test gap, documentation drift, style inconsistency |
| **LOW** | Minor naming issue, comment quality, optional improvement |

---

## Phase 4: ARTIFACT

Write to `$ARTIFACTS_DIR/review/adversarial-findings.md`:

```markdown
# Adversarial Review Findings

**Reviewer**: Codex (adversarial)
**PR**: #{pr-number}
**Generated**: {YYYY-MM-DD HH:MM}

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | {N} |
| HIGH | {N} |
| MEDIUM | {N} |
| LOW | {N} |

**Verdict**: {PASS — no CRITICAL/HIGH | NEEDS FIXES — has CRITICAL/HIGH}

---

## Findings

### [{severity}] {title}

**File**: `{path}:{line}`
**Category**: {regression | rule-violation | test-gap | incomplete-sweep | type-safety | doc-drift}
**Evidence**: {what you found — include grep output, file contents, specific line references}

**Suggested fix**:
{specific, actionable fix description}

---

{Repeat for each finding}

## What Passed

{Brief note on what was done well — keep it to 2-3 sentences max.
This section exists so the synthesizer knows what NOT to re-check.}
```

---

## Phase 5: OUTPUT

```markdown
## Adversarial Review Complete

**Verdict**: {PASS | NEEDS FIXES}
**Findings**: {CRITICAL}C / {HIGH}H / {MEDIUM}M / {LOW}L

{If NEEDS FIXES, list the CRITICAL/HIGH findings as bullet points}

Artifact: `$ARTIFACTS_DIR/review/adversarial-findings.md`
```
