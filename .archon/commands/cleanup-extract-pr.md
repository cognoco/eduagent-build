---
description: Parse cleanup-plan.md and extract a specific PR's work order
argument-hint: <PR number, e.g. PR-08 or 08>
---

# Extract Cleanup PR Work Order

**Workflow ID**: $WORKFLOW_ID

---

## Your Mission

Parse `docs/audit/cleanup-plan.md` and extract the complete work order for the requested PR.
Write a structured artifact that downstream agents (with no context) can use to implement the work.

**This step does NOT implement anything** — it only extracts and structures the work order.

---

## Phase 1: PARSE — Identify the PR

### 1.1 Normalize the PR Identifier

The user's input is: `$ARGUMENTS`

Normalize to a two-digit PR number:
- "PR-08" → 08
- "PR-8" → 08
- "08" → 08
- "8" → 08

### 1.2 Read the Cleanup Plan

```bash
cat docs/audit/cleanup-plan.md
```

### 1.3 Find the PR in the Execution Plan

Locate the PR in the "## PR Execution Plan (Stage 3)" table. Extract:

| Field | Source |
|-------|--------|
| **PR number** | `PR` column |
| **Cluster** | `Cluster` column |
| **Phases** | `Phases` column (e.g., "P1+P2") |
| **Summary** | `Summary` column |

### 1.4 Find the Cluster Status Table

The PR's cluster (e.g., "C1", "C3") has a detailed status table under `### C{N} — {title}`.
For each phase listed in the PR row, extract from the cluster table:

| Field | Source |
|-------|--------|
| **Phase ID** | `Phase` column (e.g., "P1") |
| **Description** | `Description` column |
| **Status** | `Status` column (should be `todo` for work we're about to do) |
| **Files-claimed** | `Files-claimed` column (glob/path list) |
| **Notes** | `Notes` column (severity tag, effort estimate, verification commands) |

### 1.5 Extract Verification Commands

From the Notes column, look for `Verify:` instructions. These are the phase-specific
validation commands. Example:
```
Verify: pnpm exec jest --findRelatedTests <changed-files> --no-coverage
```

If no phase-specific verify command exists, the default is:
```
pnpm exec nx run-many -t typecheck
```

### 1.6 Check Dependencies

From "### Key dependencies", check if this PR has upstream dependencies.
If any dependency PR is not yet merged (status != `done`), **WARN** but continue —
the implementer should be aware.

### 1.7 Check Resolved Decisions

If the Notes column references a decision ID (e.g., "Resolved by D-C1-1"),
find it in the "## Resolved Decisions" table and extract the decision text.
The implementer needs this for context.

**PHASE_1_CHECKPOINT:**

- [ ] PR number identified
- [ ] Cluster and phases found
- [ ] All phase details extracted
- [ ] Verification commands collected
- [ ] Dependencies checked
- [ ] Resolved decisions extracted

---

## Phase 2: CONTEXT — Read Codebase Rules

### 2.1 Read CLAUDE.md

```bash
cat CLAUDE.md
```

Extract the rules most relevant to this PR's scope:
- Non-negotiable engineering rules
- Repo-specific guardrails
- Known exceptions (to avoid "fixing" documented exceptions)

### 2.2 Verify Files Exist

For each file in Files-claimed, verify it exists at HEAD:

```bash
# For each file path in the work order
ls -la <file-path>
```

Note any files that don't exist yet (they'll be created) vs. files that
should exist but are missing (possible plan staleness).

**PHASE_2_CHECKPOINT:**

- [ ] CLAUDE.md rules captured
- [ ] All claimed files verified

---

## Phase 3: ARTIFACT — Write Work Order

Write to `$ARTIFACTS_DIR/work-order.md`:

```markdown
# Cleanup Work Order: PR-{NN}

**Generated**: {YYYY-MM-DD HH:MM}
**Workflow ID**: $WORKFLOW_ID
**Source**: docs/audit/cleanup-plan.md

---

## PR Summary

| Field | Value |
|-------|-------|
| **PR** | PR-{NN} |
| **Cluster** | C{N} — {cluster title} |
| **Phases** | {phase list} |
| **Summary** | {from execution plan table} |
| **Estimated effort** | {from Notes} |
| **Dependencies** | {list or "None"} |

---

## Phases

### Phase {N}: {title}

**Description**: {full description from cluster table}
**Status**: {current status}
**Files**:
- `{file1}`
- `{file2}`

**Verification command**:
```bash
{specific command from Notes, or default}
```

**Notes**: {severity, effort, any special instructions}

**Resolved decision**: {if referenced, include D-XXX ID + resolution text}

{Repeat for each phase in this PR}

---

## Dependencies

{If upstream PRs exist:}
- PR-{XX} ({status}) — {what it gates}

{If none:}
No upstream dependencies. This PR is independently startable.

---

## Key CLAUDE.md Rules

{Extracted rules relevant to this PR's file scope}

---

## Files Summary

| File | Action | Phase |
|------|--------|-------|
| `{path}` | CREATE / UPDATE / DELETE | P{N} |

---

## Cross-Coupling Notes

{From the cluster's Cross-coupling section, anything relevant to this PR}
```

**PHASE_3_CHECKPOINT:**

- [ ] Work order artifact written
- [ ] All phases documented with verification commands
- [ ] Dependencies noted
- [ ] CLAUDE.md rules captured

---

## Phase 4: OUTPUT — Report

```markdown
## Work Order Extracted

**PR**: PR-{NN}
**Cluster**: C{N} — {title}
**Phases**: {count}
**Files**: {count}
**Estimated effort**: {from Notes}

### Phases
{numbered list of phase titles}

### Dependencies
{list or "None — independently startable"}

### Artifact
Work order written to: `$ARTIFACTS_DIR/work-order.md`
```

---

## Error Handling

### PR Not Found

If the PR number doesn't exist in the execution plan:
```
ERROR: PR-{NN} not found in docs/audit/cleanup-plan.md
Available PRs: {list from execution plan table}
```

### Phase Status Not Todo

If a phase has status other than `todo`:
- `done` → Skip it, note in work order
- `in-progress` → WARN: "Phase {N} is already in-progress. Proceeding may cause conflicts."
- `blocked` → WARN: "Phase {N} is blocked: {reason}. Check if block has cleared."
