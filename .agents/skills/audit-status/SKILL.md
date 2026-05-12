---
name: audit-status
description: Use when maintaining or inspecting docs/audit/cleanup-plan.md for the artifact-consistency cleanup stream, including refreshing plan-vs-GitHub PR status, detecting stale file claims, listing open deviations, or recording a structured cleanup-plan deviation.
---

# Audit Status

`docs/audit/cleanup-plan.md` is the living source of truth for the artifact-consistency cleanup stream. Do not create it from this skill. If absent, report exactly: `Plan doc docs/audit/cleanup-plan.md does not exist yet. This skill becomes useful once stage-1 produces it. No action taken.`

## Modes

- No argument: refresh status, surface stale claims, list open deviations, summarize state.
- `deviation`: capture a structured deviation entry and optionally propose plan deltas.
- Any other argument: show the valid modes and stop.

## Required Plan Structure

Refuse to mutate the plan if any required region is missing or malformed:

- Cluster sections for C1-C8 plus cleanup-triage with status table columns: `Phase | Description | Status | Owner | PR | Files-claimed | Notes`.
- `## Deviations Log` with entries shaped as `### DEV-NNN - YYYY-MM-DD HH:MM UTC`.
- A top-of-file last-updated marker.

## Read Mode

1. Parse cluster tables into `(cluster, phase, status, owner, pr, files-claimed)`.
2. Parse deviation entries into `(id, timestamp, status, affected)`.
3. For every PR number, refresh GitHub state:

   ```bash
   gh pr view <N> --json number,state,merged,mergedAt,statusCheckRollup,reviewDecision
   ```

   Flag mismatches such as plan `done` but PR open/closed unmerged, plan `in-progress` but PR merged, failing CI, approved PR still marked in-progress, or missing PR.

4. For in-progress rows with `files-claimed`, check staleness:

   ```bash
   git log -1 --format="%cI %h" -- <files-claimed>
   ```

   Flag claims with no commits in the last 24 hours, or globs matching no files.

5. Surface open deviations. Escalate open deviations older than 7 days.
6. Output a tight report with cluster snapshot, discrepancies, open deviations, and at most five recommended next actions.
7. Bump only the top-of-file timestamp. Do not mutate plan rows in read mode.

If `gh` is unavailable or unauthenticated, skip PR refresh and explicitly report that gap instead of failing the entire status run.

## Deviation Mode

Gather these fields before editing:

- Source: cluster and phase discovering the issue.
- Type: `upstream-rework`, `downstream-change`, `new-finding`, `removed-finding`, or `dependency-shift`.
- Affected clusters.
- Trigger: one sentence.
- Evidence: file:line citations, commit refs, grep counts, or PR refs.
- Proposed delta.

Append the next `DEV-NNN` entry to `## Deviations Log`, preserve formatting, and bump last-updated. Ask whether to process now or leave open. If processing now, propose concrete edits per affected cluster, apply only approved edits, then mark the deviation `processed-YYYY-MM-DD` or `rejected-YYYY-MM-DD` with reason.
