---
description: Review test coverage quality, identify gaps, and evaluate test effectiveness (pre-PR variant using local diff)
argument-hint: (none — reads from scope artifact)
---

# Cleanup Test Coverage Agent

*Project-local override of `archon-test-coverage-agent`. Operates on the local worktree branch BEFORE the GitHub PR is created. Uses `git diff origin/main...HEAD` instead of `gh pr diff`. See `.archon/spike-plan.md` for context.*

---

## Your Mission

Analyze test coverage for the local worktree branch changes. Identify critical gaps, evaluate test quality, and ensure tests verify behavior (not implementation). Produce a structured artifact with findings and recommendations.

**Output artifact**: `$ARTIFACTS_DIR/review/test-coverage-findings.json`

---

## Phase 1: LOAD - Get Context

### 1.1 Read Scope

```bash
cat $ARTIFACTS_DIR/review/scope.md
```

Note which files are source vs test files, and the Work Order PR identifier.

**CRITICAL**: Check for "OUT OF SCOPE" section. Items listed there are **intentionally excluded** — do NOT flag them as missing test coverage!

### 1.2 Get Local Diff

```bash
git diff "${BASE_BRANCH:-origin/main}...HEAD"
```

(No GitHub PR exists yet; reviews run on the local worktree branch.)

### 1.3 Read Existing Tests

For each new/modified source file, find corresponding test file:

```bash
# Find test files
fd '\.(test|spec)\.ts$' src | head -20
```

**PHASE_1_CHECKPOINT:**
- [ ] Scope loaded
- [ ] Local diff available
- [ ] Source and test files identified
- [ ] Existing test patterns noted

---

## Phase 2: ANALYZE - Evaluate Coverage

### 2.1 Map Source to Tests

For each changed source file:
- Does a corresponding test file exist?
- Are new functions/features tested?
- Are modified functions' tests updated?

### 2.2 Identify Critical Gaps

Look for untested:
- Error handling paths
- Edge cases (null, empty, boundary values)
- Critical business logic
- Security-sensitive code
- Async/concurrent behavior
- Integration points

### 2.3 Evaluate Test Quality

For existing tests, check:
- Do they test behavior or implementation?
- Would they catch meaningful regressions?
- Are they resilient to refactoring?
- Do they follow DAMP principles?
- Are assertions meaningful?

### 2.4 Find Test Patterns

```bash
# Find test patterns in codebase
rg "(describe|it|test)\(" src/ -g '*.test.ts' | head -20
```

**PHASE_2_CHECKPOINT:**
- [ ] Source-to-test mapping complete
- [ ] Critical gaps identified
- [ ] Test quality evaluated
- [ ] Codebase test patterns found

---

## Phase 3: GENERATE - Create Artifact

Write to `$ARTIFACTS_DIR/review/test-coverage-findings.json`:

The output must be valid JSON conforming to `.archon/schemas/findings.schema.json`.

```json
{
  "generated_at": "{ISO 8601 timestamp, e.g. 2026-05-08T14:32:00Z}",
  "pr_id": "{Work Order PR-ID, e.g. PR-08}",
  "source": "test-coverage",
  "verdict": "APPROVE|REQUEST_CHANGES|BLOCK",
  "findings": [
    {
      "id": "TC-1",
      "source": "test-coverage",
      "severity": "HIGH",
      "category": "missing-test|weak-test|implementation-coupled|missing-edge-case",
      "file": "apps/api/src/services/foo.ts",
      "line": null,
      "summary": "Short description of the coverage gap",
      "evidence": "The function doX() at foo.ts:42 has no test. It handles the error path that returns 403. A future change here would be invisible to the test suite.",
      "suggested_fix": "Add a test to foo.test.ts: describe('doX', () => { it('returns 403 when ...', ...) }). Pattern: see bar.test.ts:55-70.",
      "deferrable": false
    }
  ]
}
```

Verdict rules:
- `BLOCK` if any finding has severity `CRITICAL`
- `REQUEST_CHANGES` if any finding has severity `HIGH` (and none are CRITICAL)
- `APPROVE` if all findings are MEDIUM or LOW

`deferrable` is `true` for MEDIUM/LOW gaps that do not need to block merge.

Use IDs `TC-1`, `TC-2`, … One entry per distinct gap. The `evidence` field should quote the untested code snippet and explain what failure mode it risks. The `suggested_fix` should include the test structure (describe/it skeleton) and reference a codebase test pattern.

**PHASE_3_CHECKPOINT:**
- [ ] Artifact file created as valid JSON
- [ ] All findings have id, severity, file, summary
- [ ] evidence quotes the untested code
- [ ] suggested_fix includes test structure and pattern reference
- [ ] verdict matches highest severity

---

## Phase 4: VALIDATE - Check Artifact

### 4.1 Verify JSON is Valid

```bash
cat $ARTIFACTS_DIR/review/test-coverage-findings.json | jq .
```

This must succeed without error. If jq reports a parse error, fix the JSON before proceeding.

### 4.2 Check Required Fields

```bash
jq '{source,verdict,findings_count: (.findings | length)}' \
    $ARTIFACTS_DIR/review/test-coverage-findings.json
```

Verify:
- `source` is `"test-coverage"`
- `verdict` is one of `APPROVE`, `REQUEST_CHANGES`, `BLOCK`
- `findings` array is present (may be empty if coverage is adequate)

**PHASE_4_CHECKPOINT:**
- [ ] `jq .` succeeds — JSON is valid
- [ ] Required fields present
- [ ] No placeholder text remaining in string values

---

## Phase 5: OUTPUT - Human Summary

Output a brief summary for the DAG log (human-readable text — NOT JSON):

```
## Test Coverage Review Complete

**Verdict**: {APPROVE | REQUEST_CHANGES | BLOCK}
**Findings**: {CRITICAL}C / {HIGH}H / {MEDIUM}M / {LOW}L

{If REQUEST_CHANGES or BLOCK, list CRITICAL/HIGH gaps as bullet points with id and summary}

Artifact: $ARTIFACTS_DIR/review/test-coverage-findings.json
```

---

## Success Criteria

- **COVERAGE_MAPPED**: Each source file mapped to tests
- **GAPS_IDENTIFIED**: Missing tests found and classified by severity
- **QUALITY_EVALUATED**: Existing tests assessed
- **ARTIFACT_CREATED**: JSON findings file written and valid
- **VERDICT_SET**: Verdict reflects highest severity found
