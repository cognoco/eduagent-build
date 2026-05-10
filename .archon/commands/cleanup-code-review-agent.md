---
description: Review code quality, CLAUDE.md compliance, and detect bugs (pre-PR variant using local diff)
argument-hint: (none — reads from scope artifact)
---

# Cleanup Code Review Agent

*Project-local override of `archon-code-review-agent`. Operates on the local worktree branch BEFORE the GitHub PR is created. Uses `git diff origin/main...HEAD` instead of `gh pr diff`. See `.archon/spike-plan.md` for context.*

---

## Your Mission

Review the local worktree branch changes for code quality, CLAUDE.md compliance, patterns, and bugs. Produce a structured artifact with findings, fix suggestions with multiple options, and reasoning.

**Output artifact**: `$ARTIFACTS_DIR/review/code-review-findings.json`

---

## Phase 1: LOAD - Get Context

### 1.1 Read Scope

```bash
cat $ARTIFACTS_DIR/review/scope.md
```

Note:
- Changed files list
- CLAUDE.md rules to check
- Focus areas
- Work Order PR identifier (e.g., PR-08)

**CRITICAL**: Check for "OUT OF SCOPE" section in the scope manifest. Items listed there are **intentionally excluded** — do NOT flag them as bugs or missing features!

### 1.2 Get Local Diff

```bash
git diff origin/main...HEAD
```

(No GitHub PR exists yet; reviews run on the local worktree branch.)

### 1.3 Codebase Rules

CLAUDE.md is already loaded into your system prompt — do not re-read it.
Reference its coding standards, patterns, and rules when assessing the diff.

**PHASE_1_CHECKPOINT:**
- [ ] Scope loaded
- [ ] Local diff available
- [ ] CLAUDE.md rules noted

---

## Phase 2: ANALYZE - Review Code

### 2.1 Check CLAUDE.md Compliance

For each changed file, verify:
- Import patterns match project style
- Naming conventions followed
- Error handling patterns correct
- Type annotations complete
- Testing patterns followed

### 2.2 Detect Bugs

Look for:
- Logic errors
- Null/undefined handling issues
- Race conditions
- Memory leaks
- Security vulnerabilities
- Off-by-one errors
- Missing error handling

### 2.3 Check Code Quality

Evaluate:
- Code duplication
- Function complexity
- Proper abstractions
- Clear naming
- Appropriate comments

### 2.4 Pattern Matching

For each issue found, search codebase for correct patterns:

```bash
# Find similar patterns in codebase
rg "pattern" src/ -g '*.{ts,tsx}' | head -5
```

### 2.5 Check for Primitive Duplication

For each new interface, class, type alias, or utility module introduced in the diff:

1. Search for similar existing abstractions:

```bash
# Replace {Name} with the new abstraction's name
rg "(interface|class|type) {Name}" packages/ -g '*.{ts,tsx}' | head -10
```

2. Flag if the new abstraction duplicates or closely overlaps an existing one.
3. Flag if a new utility function reimplements logic already available in a shared package.
4. Note findings in the CLAUDE.md Compliance section with verdict: **EXTENDS** (extends existing primitive) or **DUPLICATE** (redundant with existing) or **NEW** (genuinely new, no existing primitive).

**PHASE_2_CHECKPOINT:**
- [ ] CLAUDE.md compliance checked
- [ ] Bugs identified
- [ ] Quality issues noted
- [ ] Patterns found for fixes
- [ ] Primitive duplication checked

---

## Phase 3: GENERATE - Create Artifact

Write to `$ARTIFACTS_DIR/review/code-review-findings.json`:

The output must be valid JSON conforming to `.archon/schemas/findings.schema.json`.

```json
{
  "generated_at": "{ISO 8601 timestamp, e.g. 2026-05-08T14:32:00Z}",
  "pr_id": "{Work Order PR-ID, e.g. PR-08}",
  "source": "code-review",
  "verdict": "APPROVE|REQUEST_CHANGES|BLOCK",
  "findings": [
    {
      "id": "CR-1",
      "source": "code-review",
      "severity": "HIGH",
      "category": "bug|style|performance|security|pattern-violation",
      "file": "apps/mobile/src/foo.tsx",
      "line": 42,
      "summary": "Short description of the issue",
      "evidence": "The code at line 42 does X which violates Y — include the problematic snippet and why it matters",
      "suggested_fix": "Change X to Y per the pattern in Z — include corrected code snippet and codebase reference",
      "deferrable": false
    }
  ]
}
```

Verdict rules:
- `BLOCK` if any finding has severity `CRITICAL`
- `REQUEST_CHANGES` if any finding has severity `HIGH` (and none are CRITICAL)
- `APPROVE` if all findings are MEDIUM or LOW

`deferrable` is `true` for MEDIUM/LOW findings that do not need to block merge.

Include one entry per distinct finding. Findings that cover multiple locations should be split into separate entries with distinct IDs (`CR-1`, `CR-2`, …). Each `evidence` field should quote the problematic code or grep output so the reader has full context without re-reading the diff.

**PHASE_3_CHECKPOINT:**
- [ ] Artifact file created as valid JSON
- [ ] All findings have id, severity, file, summary
- [ ] evidence and suggested_fix populated for each finding
- [ ] verdict matches highest severity

---

## Phase 4: VALIDATE - Check Artifact

### 4.1 Verify JSON is Valid

```bash
cat $ARTIFACTS_DIR/review/code-review-findings.json | jq .
```

This must succeed without error. If jq reports a parse error, fix the JSON before proceeding.

### 4.2 Check Required Fields

```bash
jq '{source,verdict,findings_count: (.findings | length)}' \
    $ARTIFACTS_DIR/review/code-review-findings.json
```

Verify:
- `source` is `"code-review"`
- `verdict` is one of `APPROVE`, `REQUEST_CHANGES`, `BLOCK`
- `findings` array is present (may be empty if no issues found)

**PHASE_4_CHECKPOINT:**
- [ ] `jq .` succeeds — JSON is valid
- [ ] Required fields present
- [ ] No placeholder text remaining in string values

---

## Phase 5: OUTPUT - Human Summary

Output a brief summary for the DAG log (human-readable text — NOT JSON):

```
## Code Review Complete

**Verdict**: {APPROVE | REQUEST_CHANGES | BLOCK}
**Findings**: {CRITICAL}C / {HIGH}H / {MEDIUM}M / {LOW}L

{If REQUEST_CHANGES or BLOCK, list CRITICAL/HIGH findings as bullet points with id and summary}

Artifact: $ARTIFACTS_DIR/review/code-review-findings.json
```

---

## Success Criteria

- **CONTEXT_LOADED**: Scope and local diff read successfully
- **ANALYSIS_COMPLETE**: All changed files reviewed
- **ARTIFACT_CREATED**: JSON findings file written and valid
- **PATTERNS_INCLUDED**: Each finding's evidence/suggested_fix references codebase patterns
- **VERDICT_SET**: Verdict reflects highest severity found
