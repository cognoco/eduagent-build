# Archon: Fix-B Plan — Eliminate Trailing "Confirm Done" Iterations

**Author handoff for the Archon-managing agent. Read end-to-end before acting.**

**Status: deferred until Fix-A (`fix-A-plan.md`) lands and a paired matrix runs cleanly.** Re-evaluate after that. The savings projection is small enough that this may not be worth the YAML edit if the matrix runs fine without it.

## Background

The `implement` loop in both cleanup workflows occasionally burns an iteration that just confirms "all phases already done" without doing real work. Originally projected ~30-60 min of waste across a 28-PR queue. Reviewer audit reduced that estimate after correcting two evidence errors (see "Why deferred" below). Realistic savings now: ~10 min wall-clock + a few cents in tokens.

This plan adds a deterministic `until_bash` check to the implement loop so completion is detected on the executor side rather than relying on the assistant phrasing the final response correctly.

## Why deferred (don't skip — context for the decision)

Original handoff overstated the case for this fix. After commit-timestamp vs iteration-window audit:

- **PR-03 codex iter 4 was not a trailing confirm.** Commit `89bc1ae6` (P6, "resolve no-route response schemas") lands at 21:10:29 UTC, inside iter 4's window (21:06:51–21:11:30). Iter 4 actually did the P6 work and emitted the promise. The 278s wasn't waste.
- **PR-03's wasted iteration was iter 2** (18 min, no commit) — an in-iter validation-retry that exhausted attempts without ever passing. This fix would not have prevented it; that's a different problem (per-iter retry budget) for another day.
- **PR-02 codex iter 2 (73s) is the only clean trailing-confirm case in last night's data.** One data point, not a trend.

Decision: run the matrix once with Fix-1 alone, count iters-per-PR vs phases-per-PR. Trigger this plan only if the average ratio across PRs is above 1.2. If the ratio stays near 1.0, skip permanently — the cost of touching both workflow YAMLs cleanly is no longer obviously worth ~10 min of savings.

## Design

### Why the original "echo a promise from a shell tool" approach is wrong

The first draft of this fix proposed a shell snippet inside `cleanup-implement-phase.md` that would `echo "<promise>ALL_PHASES_COMPLETE</promise>"` after the final commit. **It would not have worked.** Archon's loop-completion detector at `packages/workflows/src/dag-executor.ts:1881-1882` only appends `msg.type === 'assistant'` events to `fullOutput`. Shell tool stdout never reaches the detector. The promise has to be in the assistant's *text response* — and asking the LLM to reliably phrase its final response with the exact tag string is exactly the failure mode we want to remove.

### The right mechanism: `loop.until_bash`

`dag-executor.ts:2115-2148` shows:

```ts
const signalDetected = detectCompletionSignal(fullOutput, loop.until);
let bashComplete = false;
if (loop.until_bash) {
  // run bash, exit 0 → bashComplete = true
}
const completionDetected = signalDetected || bashComplete;
```

So `until_bash` is a deterministic, executor-side check that is OR'd with the LLM signal detection. Either path can end the loop. We don't depend on the LLM phrasing anything specific.

### YAML change

Add `until_bash` to the `implement` node's `loop:` block in BOTH:

- `.archon/workflows/execute-cleanup-pr-claude.yaml`
- `.archon/workflows/execute-cleanup-pr-codex.yaml`

```yaml
loop:
  prompt: ...                                # existing — unchanged
  until: ALL_PHASES_COMPLETE                 # existing — keep as fallback
  until_bash: |
    work_order_phases=$(rg --no-filename -oP '^### Phase \K[A-Z0-9]+(?=:)' \
      "$ARTIFACTS_DIR/work-order.md" | sort -u)
    done_phases=$(
        rg --no-filename -oP '^## Phase \K[A-Z0-9]+(?=:)' \
          "$ARTIFACTS_DIR/progress.md" 2>/dev/null
        rg --no-filename -oP '^## BLOCKED:\K[A-Z0-9]+$' \
          "$ARTIFACTS_DIR/blocked.md" 2>/dev/null
    )
    done_phases=$(echo "$done_phases" | sort -u)
    remaining=$(comm -23 <(echo "$work_order_phases") <(echo "$done_phases"))
    [[ -z "$remaining" ]]   # exit 0 → loop completes
  max_iterations: 15                         # existing — unchanged
  fresh_context: true                        # existing — unchanged
```

### Snippet correctness — three things the bug-prone draft missed

1. **`rg --no-filename` is mandatory.** Without it, when rg is given multiple files (or even one file when behavior changes by version), it prefixes lines with `path:` — and `comm` won't match phase IDs against `path:P4`. The original draft did NOT have this flag.

2. **`blocked.md` uses a different format than `progress.md`.** Completed phases live as `## Phase <id>: <title> — COMPLETED` in progress.md; blocked phases live as `## BLOCKED:<id>` in blocked.md (no "Phase" prefix). Two separate `rg` patterns are needed; one regex won't catch both. The original draft only matched `## Phase <id>:` and would have ignored blocked phases — a multi-phase PR with one BLOCKED phase would loop forever.

3. **The shell expression must `exit 0` for "complete."** Using `[[ -z "$remaining" ]]` as the last command makes the script's exit code reflect the test result directly. If you wrap it in `if … then exit 0; else exit 1; fi` you achieve the same thing more verbosely; either is fine. **Don't** end the snippet with `echo "$remaining"` — that always exits 0.

### Phase-ID assumptions

The regex `[A-Z0-9]+` matches the phase IDs we currently use (P1, P2, …, P10, AUDIT-TYPES-2.3 wouldn't match — but those are descriptions, not IDs). Audit a few work-orders before landing to make sure the convention holds. If any work-order uses lowercase or hyphens in actual IDs, broaden to `[A-Za-z0-9-]+`.

## Acceptance criteria

After landing, on the next multi-phase PR run:

1. **`iter_count == phase_count`** — count `loop_iteration_completed` events for the implement node and compare with the work-order's phase count.
2. **`completionDetected: true`** on the iteration that landed the final commit (not on a separate trailing iter).
3. **No regression** — every previously-completed phase still gets committed; no phase silently skipped because the comparator under-counted what's done.

Verify by running on one of:

- A single-phase PR (sanity check that 1-iter case still emits completion in iter 1).
- A multi-phase PR with at least 3 phases (the case where the savings actually appear).
- A PR with at least one `BLOCKED` phase if any are available (verifies the blocked.md branch of the comparator).

## Don't

- Don't touch `cleanup-implement-phase.md`'s "Step 6: Check Completion" prompt section. Leave the LLM-side check as a belt-and-suspenders fallback. `until_bash` is a strict improvement, not a replacement.
- Don't unify this with the `until:` value or rename the signal. `until: ALL_PHASES_COMPLETE` stays as a fallback for cases where the LLM does emit it spontaneously.
- Don't change `max_iterations`. The collapsed iteration count is a side-effect of `until_bash` firing earlier, not a config change.
- Don't add `until_bash` to any other loop node (validate, fix-locally, etc.) without separate analysis. This plan is scoped to `implement`.

## Reporting back

After landing:

1. Diff of both YAML files (the two `until_bash` insertions).
2. workflow_run_id and iter count of the verification re-run, plus the corresponding phase count from the work-order so the ratio is auditable.
3. Confirmation that no phase was silently skipped (compare the verification run's commits to the work-order's claimed-files list).
