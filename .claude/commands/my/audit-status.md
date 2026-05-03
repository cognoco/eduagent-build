# Audit Status — Plan-doc maintenance for the consistency cleanup

Single entrypoint for maintaining `docs/audit/cleanup-plan.md`. Two modes: refresh status (no args) and capture deviation (`deviation` arg). The plan doc is the living source of truth for the artefact-consistency / cleanup work stream; this command keeps it aligned with reality and prevents silent plan-vs-reality drift.

## Arguments

`$ARGUMENTS` — Mode selector:
- (empty) — **Read mode**: refresh PR statuses, surface stale claims, list open deviations, summarize plan state.
- `deviation` — **Deviation mode**: capture a structured deviation entry; optionally propose-and-apply the resulting plan delta.

Any other argument: error out and show this help.

## The plan doc

Path: `docs/audit/cleanup-plan.md` (project-relative; resolve from repo root).

If the file does not exist, report exactly: *"Plan doc `docs/audit/cleanup-plan.md` does not exist yet. This skill becomes useful once stage-1 produces it. No action taken."* and stop. Do **not** create the plan doc — that's a separate stage-1 deliverable.

The plan doc is structured with three regions this skill cares about:

1. **Cluster sections** — one per cluster (C1–C8 plus cleanup-triage). Each cluster contains a status table with rows formatted as:
   ```
   | Phase | Description | Status | Owner | PR | Files-claimed | Notes |
   ```
   - `Status`: one of `todo` / `in-progress` / `blocked` / `review` / `done`
   - `Owner`: agent name or session-id (free-form short string), or empty
   - `PR`: `#NNNN` (GitHub PR number) or empty
   - `Files-claimed`: glob or path list (the "no two agents touching the same files at once" coordination metadata), or empty

2. **Deviations Log** — a clearly-marked `## Deviations Log` section near the bottom. Entries follow:
   ```
   ### DEV-NNN — YYYY-MM-DD HH:MM UTC
   - Source: <agent-name>, executing <cluster + phase>
   - Trigger: <one-sentence>
   - Type: upstream-rework | downstream-change | new-finding | removed-finding | dependency-shift
   - Affected: <C1, C5, …>
   - Evidence: <file:line citations or commit refs>
   - Proposed delta: <prose>
   - Status: open | processed-YYYY-MM-DD | rejected-YYYY-MM-DD
   ```

3. **Last-updated marker** — a top-of-file timestamp the skill bumps on every successful run (read mode bumps it to the run timestamp; deviation mode bumps it after applying or appending).

If any of these regions is missing or malformed, report what's wrong (cite the line) and refuse to mutate the doc. Better to fail loudly than corrupt the source of truth.

---

## Read mode (no arguments)

### Algorithm

Run these phases in order. Stop at the first failure that prevents progress.

#### 1. Locate and parse

- Read `docs/audit/cleanup-plan.md`. If absent → report-and-stop (above).
- Parse all cluster status tables. Build an in-memory list of `(cluster, phase, status, owner, pr, files-claimed)` tuples.
- Parse the Deviations Log section. Build a list of `(id, timestamp, status, affected)` tuples.

#### 2. Refresh PR statuses

For every row whose `pr` field is non-empty:

```bash
gh pr view <N> --json number,state,merged,mergedAt,statusCheckRollup,reviewDecision
```

Compare each PR's actual GitHub state against the plan's claimed status:

| Plan says | gh says | Action |
|---|---|---|
| in-progress | OPEN, all checks PENDING | OK, no flag |
| in-progress | OPEN, any check FAILURE | Flag: "PR #N has failing CI" |
| in-progress | OPEN, all checks SUCCESS, reviewDecision = APPROVED | Suggest moving to `review` or `done` |
| in-progress | MERGED | Suggest moving to `done` |
| review | OPEN, reviewDecision != APPROVED | OK, no flag |
| review | MERGED | Suggest moving to `done` |
| done | OPEN | Flag: "PR #N marked done in plan but still open on GitHub" |
| done | CLOSED (not merged) | Flag: "PR #N marked done in plan but was closed without merging" |
| any | NOT_FOUND (404 from gh) | Flag: "PR #N referenced in plan but not found on GitHub" |

Batch the `gh` calls (parallel where possible) — don't wait sequentially for each.

#### 3. Detect stale file claims

For every row with non-empty `files-claimed` AND status `in-progress`:

```bash
git log -1 --format="%cI %h" -- <files-claimed glob>
```

If the most recent commit touching those files is >24h old (compare against the row's last edit timestamp from the plan doc's git history if available, or the row's `last-updated` field if present):

Flag: *"Cluster <C>, phase <P> claimed by <owner> with files <files-claimed>, no commits in last 24h — possibly abandoned."*

The 24h threshold is a default; document that it's tunable but don't add a flag for it (KISS).

#### 4. List open deviations

For every Deviations Log entry with status `open`:

Surface: ID, timestamp, source cluster, type, affected clusters, one-line proposed-delta excerpt.

If any `open` deviation is older than 7 days, escalate it: *"DEV-NNN open since <date> — process or reject."*

#### 5. Summarize

Produce a single tight report:

```
# Audit Status — <YYYY-MM-DD HH:MM UTC>

## Cluster status snapshot
- C1 Schema: 1/4 phases done, 1 in-progress (PR #XXX, owner: <name>)
- C2 Tests: …
- …

## Discrepancies (plan vs. reality)
- <flag from step 2 or 3>
- …

## Open deviations
- DEV-001 (2 days old) — <type> affecting <clusters> — <proposed-delta excerpt>
- …

## Recommended next actions
- <ordered list, max 5 items>
```

If there are zero discrepancies and zero open deviations, say so explicitly: *"Plan and reality are aligned. No deviations pending."*

#### 6. Bump last-updated

Edit the plan doc's top-of-file timestamp to the run time. Do **not** otherwise mutate the doc in read mode — apart from the timestamp, read mode is read-only against the doc.

---

## Deviation mode (`$ARGUMENTS = deviation`)

### Algorithm

#### 1. Verify plan doc exists

Same gate as read mode. Report-and-stop if absent.

#### 2. Capture the deviation

Use the AskUserQuestion tool (or normal conversational prompting if AskUserQuestion is unavailable) to gather the six fields. Ask in a single batch where possible:

1. **Source** — which cluster + phase is the discoverer working on? (Free text.)
2. **Type** — pick one: `upstream-rework`, `downstream-change`, `new-finding`, `removed-finding`, `dependency-shift`. (Single-select.)
3. **Affected clusters** — comma-separated list of cluster IDs (e.g., "C1, C5"). (Free text, validated against known cluster IDs.)
4. **Trigger** — one sentence: what was discovered. (Free text.)
5. **Evidence** — file:line citations, commit refs, or grep counts. (Free text, multi-line OK.)
6. **Proposed delta** — what should change in the plan. (Free text, multi-line OK.)

If the discoverer is mid-execution and just wants to log-and-keep-going, accept terse answers and skip step 4 below.

#### 3. Generate the entry

- Read existing Deviations Log entries to find the highest `DEV-NNN` and increment.
- Format the entry per the spec at the top of this file.
- Append it to the Deviations Log section. Preserve newline conventions (one blank line between entries).

#### 4. Optional propose-and-apply

After appending, ask the discoverer:

> "Process this deviation now (walk affected clusters, propose deltas, apply with your approval)? Or leave it open for batch processing later?"

If `process now`:

For each affected cluster (in order), produce a structured delta proposal:

```
Cluster: C5 — Manifest hygiene
Current state in plan: <relevant excerpt>
Proposed change: <specific text edit>
Rationale: <one sentence linking back to the deviation evidence>
```

For each proposed change, ask for approval (single Y/N — accumulate before applying, or apply per-decision; user choice). On approval, apply the edit via `Edit` tool. Mark the deviation entry's status as `processed-<YYYY-MM-DD>`.

If the user rejects a proposed change, mark the deviation entry's status as `rejected-<YYYY-MM-DD>` with a one-line reason captured. Do not retry.

If `leave open`: do nothing further. The entry stays at status `open` and will be surfaced by future `/my:audit-status` (read mode) runs.

#### 5. Bump last-updated

Same as read mode step 6.

---

## Edge cases and graceful degradation

- **`gh` not available / not authenticated** — skip step 2 of read mode; surface the gap in the report ("PR statuses not refreshed: gh CLI unavailable") rather than failing the whole command.
- **Files-claimed glob matches zero files** — surface as a flag: *"Cluster <C> phase <P> claims <files-claimed> but glob matches no files — possibly stale glob."*
- **Plan doc malformed** (e.g., missing required sections, table headers don't match expected schema) — refuse to mutate; report the structural problem with line numbers.
- **Two agents racing on the same row** — read mode is read-only against rows; deviation mode only appends to Deviations Log. The race window is small; if it matters, document the actual race observed and we'll add file-level locking later. Do not preemptively add locking.
- **Deviation mode interrupted mid-prompt** — the entry is only appended at step 3, after all six fields are gathered. If the user bails before step 3, no entry is written. Safe.

---

## Examples

### Example 1: Read mode, healthy state

User: `/my:audit-status`

```
# Audit Status — 2026-05-04 10:32 UTC

## Cluster status snapshot
- C1 Schema: 0/3 phases done, 1 in-progress (PR #156, owner: claude-opus-47)
- C2 Tests: 0/2 phases done
- C3 Mobile nav: 1/1 phases done ✓
- C4 Mobile design: 0/3 phases done
- C5 Manifest: 0/2 phases done, blocked on architectural decision
- C6 apps/api config: 0/4 phases done
- C7 Doc reconciliation: 1/3 phases done (PR #155 merged)
- C8 Track C: 2/10 phases done

## Discrepancies (plan vs. reality)
None.

## Open deviations
None.

## Recommended next actions
1. Review PR #156 (C1 phase 1) — checks pass, ready for review.
2. Resolve C5 architectural decision (blocked >3 days).
```

### Example 2: Deviation mode, mid-flight capture

Agent (mid-C1-execution): `/my:audit-status deviation`

[skill prompts for the six fields, captures responses, appends entry, asks "process now?"]

Agent: "Leave open."

[skill writes entry, bumps timestamp, exits. The deviation surfaces in the next read-mode run.]

### Example 3: Read mode, stale claim detected

```
## Discrepancies (plan vs. reality)
- Cluster C4, phase 1 claimed by claude-sonnet-46 with files `apps/mobile/src/app/(app)/session/index.tsx`, no commits in last 36h — possibly abandoned.
- PR #157 (C2 phase 0) marked `done` in plan but still OPEN on GitHub.

## Recommended next actions
1. Confirm with claude-sonnet-46 whether C4 phase 1 work is still active; otherwise unset Owner.
2. Investigate PR #157 — should it be re-merged, or does the plan need correction?
```

---

## Notes for callers

- This skill is **idempotent** in read mode (same result if run twice in a row, modulo the timestamp bump).
- This skill is **append-only** in deviation mode against the Deviations Log; it never deletes or rewrites existing entries.
- Cluster section edits in propose-and-apply happen via the `Edit` tool — they leave a clean diff and inherit standard hooks/lint behaviour. The skill never bypasses those.
- This skill does **not** run `git add`, `git commit`, or `git push`. The plan doc edits are file-system changes; committing them is a separate decision (use `/my:commit`).
