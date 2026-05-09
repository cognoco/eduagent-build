---
description: Watch CI on the just-created cleanup PR, classify failures, fix locally, push, repeat — capped at 3 iterations with same-failure-twice early stop and Notion P1 giveup.
argument-hint: (none — reads PR number from $ARTIFACTS_DIR/.pr-number)
---

# Cleanup CI Watch + Fix Loop

You are an autonomous agent running inside an Archon `loop:` node that fires AFTER the cleanup workflow has pushed the branch, opened a PR, and posted review comments. Your job: drive CI to green or escalate cleanly.

**Hard caps**: 3 iterations total (enforced both by `max_iterations: 3` on the loop node and by your own bookkeeping in `ci-attempts.json`). Same-failure-twice → escalate immediately. `idle_timeout: 1800000` (30 min) is the per-iteration ceiling — bound CI watching with `timeout 1500` (~25 min) so a stuck check doesn't eat the entire budget.

**Tool preferences**: `rg` for code search, `fd` for file finding. Use `gh` for GitHub interaction, `jq` for JSON.

**This command does NOT invoke `/my:fix-ci`.** That command is human-driven; this one is loop-driven and follows different constraints (cleanup-fix-locally rules, GC1 ratchet, no new test files, no `--no-verify`).

---

## Step 1: Load Context

### 1.1 PR Number

```bash
pr_file="$ARTIFACTS_DIR/.pr-number"
if [[ ! -f "$pr_file" ]]; then
    echo "ERROR: $pr_file not found — create-pr node must run before this loop." >&2
    echo "Workflow contract violation; exiting cleanly." >&2
    echo "<promise>ALL_CHECKS_GREEN_OR_GIVEUP</promise>"
    exit 0
fi
PR="$(cat "$pr_file")"
echo "Watching CI for PR #${PR}"
```

### 1.2 Attempt History

```bash
attempts_file="$ARTIFACTS_DIR/ci-attempts.json"
if [[ ! -f "$attempts_file" ]]; then echo '[]' > "$attempts_file"; fi
ITER=$(( $(jq 'length' "$attempts_file") + 1 ))
echo "Iteration ${ITER} of 3"
```

Each entry in `ci-attempts.json` has shape:
```json
{
  "iteration": 1,
  "classification": "lint",
  "failure_signature": "lint:no-unused-vars:apps/api/src/routes/foo.ts",
  "fix_applied": "removed unused import in apps/api/src/routes/foo.ts"
}
```

### 1.3 Verify We Are On The PR Branch

The loop runs in the same worktree the PR was pushed from. Capture branch + worktree state for later use, but do NOT treat a dirty worktree as a fatal precondition — only remote CI determines green/fail status:

```bash
HEAD_BRANCH=$(git branch --show-current)
echo "Branch: $HEAD_BRANCH"

# Capture worktree dirtiness as informational state; checked again only before
# Step 7 (commit + push). Remote CI is the source of truth for the loop's verdict.
WORKTREE_DIRTY=0
if [[ -n "$(git status --porcelain)" ]]; then
    WORKTREE_DIRTY=1
    echo "WARNING: worktree is dirty (informational; not a failure)." >&2
    git status --porcelain >&2
fi
```

Dirty-worktree handling rule:
- Before Step 2 (remote CI poll/watch) and Step 2.1 (success-fast on green): dirtiness is a soft warning only.
- Before Step 7 (commit + push of a fix): dirtiness blocks the push, because we can't safely push a targeted fix on top of leftover scratch files. In that case the iteration records `fix_applied: "worktree dirty — cannot safely commit fix"` and falls through to Step 8 / Step 9.

---

## Step 2: Check Remote CI (Source Of Truth)

Remote CI status is the canonical signal for this loop. Always poll it FIRST, before doing anything else with the worktree. The local worktree state never short-circuits this check.

### 2.0 Immediate Status Poll (No Watching Yet)

```bash
log_file="$ARTIFACTS_DIR/ci-attempt-${ITER}.log"
checks_json="$ARTIFACTS_DIR/ci-attempt-${ITER}-checks.json"

# One non-blocking snapshot first. We only fall into `--watch` if there are
# still-pending checks; if the run is already terminal we skip the wait.
# Fail-closed: a `gh pr checks` error means we cannot reason about CI state,
# so don't paper over it with `|| true` (which would silently produce
# has_pending=0/has_failed=0 and emit a false ALL_CHECKS_GREEN_OR_GIVEUP).
if ! gh pr checks "$PR" --json name,state,bucket,link,workflow > "$checks_json" 2>&1; then
    echo "ERROR: failed to fetch PR checks for #${PR}" >&2
    exit 1
fi

has_pending=$(jq -e '[.[] | select(.bucket == "pending")] | length > 0' "$checks_json" > /dev/null 2>&1 && echo 1 || echo 0)
has_failed=$(jq  -e '[.[] | select(.bucket == "fail" or .bucket == "cancel")] | length > 0' "$checks_json" > /dev/null 2>&1 && echo 1 || echo 0)
```

### 2.1 If All Green (Success-Fast)

If the immediate snapshot shows no pending and no failed checks, we are done — regardless of whether the local worktree is dirty:

```bash
if [[ "$has_pending" -eq 0 && "$has_failed" -eq 0 ]]; then
    if [[ "${WORKTREE_DIRTY:-0}" -eq 1 ]]; then
        echo "NOTE: All CI checks green on PR #${PR}, but local worktree is dirty (informational)." >&2
    fi
    echo "All CI checks green on PR #${PR} after ${ITER} iteration(s)."
    echo "<promise>ALL_CHECKS_GREEN_OR_GIVEUP</promise>"
    exit 0
fi
```

### 2.2 If Pending — Wait With `--watch`

Only fall into the blocking watch when at least one check is still pending. Bound it at ~25 minutes so an indefinitely-pending check can't consume the whole `idle_timeout`:

```bash
watch_rc=0
if [[ "$has_pending" -eq 1 ]]; then
    # `gh pr checks --watch` blocks until all checks finish; cap with `timeout`.
    # Exit codes: 0 all green, 8 any failure, 124 timeout (per `timeout(1)`).
    set +e
    timeout 1500 gh pr checks "$PR" --watch --interval 30 > "$log_file" 2>&1
    watch_rc=$?
    set -e

    # Refresh post-watch snapshot. Same fail-closed rule as the immediate poll.
    if ! gh pr checks "$PR" --json name,state,bucket,link,workflow > "$checks_json" 2>&1; then
        echo "ERROR: failed to refresh PR checks for #${PR} after watch" >&2
        exit 1
    fi

    # Re-evaluate green after the watch returns. Compute pending and failed
    # explicitly rather than treating a jq parse failure as "no failed = green".
    pending_after_watch=$(jq '[.[] | select(.bucket == "pending")] | length' "$checks_json")
    failed_after_watch=$(jq '[.[] | select(.bucket == "fail" or .bucket == "cancel")] | length' "$checks_json")
    if [[ "$pending_after_watch" -eq 0 && "$failed_after_watch" -eq 0 ]]; then
        if [[ "${WORKTREE_DIRTY:-0}" -eq 1 ]]; then
            echo "NOTE: All CI checks green on PR #${PR} after watch, but local worktree is dirty (informational)." >&2
        fi
        echo "All CI checks green on PR #${PR} after ${ITER} iteration(s)."
        echo "<promise>ALL_CHECKS_GREEN_OR_GIVEUP</promise>"
        exit 0
    fi
fi
```

### 2.3 If Watch Timed Out

If `watch_rc` is 124 (timeout), record this iteration as `unknown` and proceed to giveup — we cannot reason about a frozen pipeline. The reason for giveup is "CI never reached a terminal state," not anything to do with the worktree:

```bash
if [[ "$watch_rc" -eq 124 ]]; then
    classification="unknown"
    failure_signature="watch-timeout:gh-pr-checks-1500s"
    fix_applied="no fix — watch timed out"
    GIVEUP_REASON="ci-frozen"
    # Skip ahead to Step 9 (giveup) after appending the iteration entry.
fi
```

### 2.4 If Failed — Gather Failed Run Logs

```bash
mapfile -t failed_runs < <(
    jq -r '.[] | select(.bucket == "fail" or .bucket == "cancel") | .link' "$checks_json"
)

# Logs from each failed run get appended into the same log file so the classifier sees one corpus.
for url in "${failed_runs[@]}"; do
    # url shape: https://github.com/<owner>/<repo>/actions/runs/<run-id>/job/<job-id>
    run_id="$(printf '%s\n' "$url" | sed -E 's|.*/runs/([0-9]+)/.*|\1|')"
    [[ -z "$run_id" ]] && continue
    {
        echo ""
        echo "=== run ${run_id} (${url}) ==="
        gh run view "$run_id" --log-failed 2>&1 || gh run view "$run_id" --log 2>&1 || echo "(could not fetch logs for run ${run_id})"
    } >> "$log_file"
done

echo "Failed run logs concatenated into: $log_file"
```

---

## Step 3: Classify (Deterministic, Regex-Based)

Walk the log and assign exactly one classification. Order of precedence (first match wins):

1. **`gc1-ratchet`** — log contains both `jest.mock` AND a GC1 ratchet message. Mirrors the local check from `cleanup-validate.md` Phase 2.5.
2. **`code-review`** — a check named like `Claude Code Review` / `claude-review` is in the failed set.
3. **`typecheck`** — log contains `error TS\d{4}` or `tsc` failures.
4. **`lint`** — log contains eslint output (rule IDs in brackets, or the literal token `eslint`).
5. **`test`** — jest failure markers (`FAIL `, `● `, `Tests:.*failed`).
6. **`build`** — `Build failed`, `error during build`, `webpack:` errors not matching above.
7. **`flake`** — same step succeeded on a retry within the same attempt (rare; detect via duplicate run names with mixed buckets).
8. **`unknown`** — nothing matched; route directly to giveup at Step 9.

```bash
classification="unknown"

# 1. GC1 ratchet
if rg -q 'jest\.mock' "$log_file" \
   && rg -q 'GC1 VIOLATION|GC1 — no new internal jest\.mock' "$log_file"; then
    classification="gc1-ratchet"

# 2. Code review check failed
elif jq -e '[.[] | select(.bucket == "fail") | .name | test("(?i)claude.?code.?review|claude.?review")] | any' "$checks_json" > /dev/null 2>&1; then
    classification="code-review"

# 3. Typecheck
elif rg -q 'error TS[0-9]{4}|tsc.*\bfailed\b|Type error:' "$log_file"; then
    classification="typecheck"

# 4. Lint
elif rg -q 'eslint|✖ [0-9]+ problem|Lint errors found|@typescript-eslint/' "$log_file"; then
    classification="lint"

# 5. Test
elif rg -q 'FAIL\s|●\s|Tests:.*failed' "$log_file"; then
    classification="test"

# 6. Build
elif rg -q 'Build failed|error during build|webpack.*error|nx.*build.*failed' "$log_file"; then
    classification="build"

# 7. Flake — only if we see duplicate run names with both pass and fail buckets
elif jq -e '
    [.[] | .name] as $names
    | [.[] | select(.bucket == "pass") | .name] as $passed
    | [.[] | select(.bucket == "fail") | .name] as $failed
    | ($passed | map(. as $n | $failed | index($n)) | map(select(. != null)) | length > 0)
' "$checks_json" > /dev/null 2>&1; then
    classification="flake"

else
    classification="unknown"
fi

echo "Classification: ${classification}"
```

---

## Step 4: Compute Failure Signature + Same-Failure-Twice Check

Build a signature unique enough to detect "the previous fix didn't help":

```bash
case "$classification" in
    gc1-ratchet)
        # First offending file in the violation block
        sig_detail="$(rg -m 1 -oE "[a-zA-Z0-9_./-]+\.(test|spec)\.(ts|tsx)" "$log_file" || echo "unknown-file")"
        ;;
    code-review)
        # First HIGH-severity finding's file:line, if extractable
        sig_detail="$(rg -m 1 -oE 'severity[^A-Za-z]*HIGH.*?[a-zA-Z0-9_./-]+:[0-9]+' "$log_file" || echo "review-high")"
        ;;
    typecheck)
        sig_detail="$(rg -m 1 -oE 'error TS[0-9]{4}' "$log_file" || echo "tsc")"
        ;;
    lint)
        sig_detail="$(rg -m 1 -oE '[a-z-]+/[a-z-]+(?=\W*$)|@typescript-eslint/[a-z-]+' "$log_file" || echo "eslint")"
        ;;
    test)
        sig_detail="$(rg -m 1 -oE '●\s+[^\n]{0,80}' "$log_file" | head -c 80 || echo "test")"
        ;;
    build)
        sig_detail="$(rg -m 1 -oE 'Build failed[^\n]*|error during build[^\n]*' "$log_file" | head -c 80 || echo "build")"
        ;;
    flake)
        sig_detail="flake-suspected"
        ;;
    unknown)
        # Hash first 5 lines of failure section to detect identical unknowns.
        sig_detail="$(head -n 50 "$log_file" | sha256sum | cut -c1-12)"
        ;;
esac

failure_signature="${classification}:${sig_detail}"
echo "Failure signature: ${failure_signature}"

# Same-failure-twice early stop
prev_match=$(jq --arg sig "$failure_signature" \
    '[.[] | select(.failure_signature == $sig)] | length' \
    "$attempts_file")

if [[ "$prev_match" -gt 0 ]]; then
    echo "Same-failure-twice detected: ${failure_signature} already attempted." >&2
    classification="unknown"  # force giveup path
    fix_applied="same-failure-twice — escalating without further fix attempt"
    SAME_FAILURE_TWICE=1
fi
```

If `SAME_FAILURE_TWICE=1`, jump to Step 8 (append entry) and Step 9 (giveup). Do NOT attempt another fix.

If `classification == "unknown"` and not from same-failure-twice, also jump to Step 8 + Step 9.

If `classification == "flake"`, log "flake suspected, no code change" and jump to Step 8 (append entry) — no fix, no push, but the iteration counts toward the 3-cap.

---

## Step 5: Apply Fix (Skip For Flake / Unknown / Same-Failure-Twice)

### Constraints (non-negotiable, from `cleanup-fix-locally.md`)

- **No new test files.** If a fix would require creating a `*.test.ts` / `*.test.tsx` file, defer via `append-followup.sh` instead.
- **No new internal `jest.mock('./...')` or `jest.mock('../...')`** — except the `jest.requireActual()` real-type-preserving pattern below, which legitimately requires `// gc1-allow: <reason>` *on the same line as the `jest.mock(` call* (the ratchet grep is line-by-line). Canonical pattern: `apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts`. Never use `// gc1-allow:` as a silence shortcut for a failing internal mock — refactor the test to use `requireActual` with targeted overrides, or remove the mock entirely.
- **No `--no-verify`.** Pre-commit hooks must run.
- **No suppression pragmas.** No `eslint-disable`, no `@ts-ignore`, no `@ts-expect-error` to silence problems. Fix the actual code.
- **For `code-review`: only HIGH-severity findings.** Skip MEDIUM/LOW; defer them via `append-followup.sh` if they need eventual attention.

### Per-classification recipes

**`gc1-ratchet`** — A test added a relative-path `jest.mock`. Open the offending file (extracted from `sig_detail`). Replace the mock with `jest.requireActual()` + targeted override:

```ts
// BEFORE (rejected by ratchet):
jest.mock('./db', () => ({ db: { select: jest.fn() } }));

// AFTER — gc1-allow MUST be on the same line as jest.mock( for the ratchet grep to skip it:
jest.mock('./db', () => {  // gc1-allow: targeted override, retains real type via requireActual
    const actual = jest.requireActual<typeof import('./db')>('./db');
    return { ...actual, db: { ...actual.db, select: jest.fn() } };
});
```

If the test was added on a brand-new test file, delete the test (since constraint #1 forbids new test files in this loop) and file the coverage gap via `append-followup.sh --severity P2`.

**`code-review`** — Fetch findings, address only HIGH:

```bash
# Repository slug from gh
SLUG="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
gh api "repos/${SLUG}/pulls/${PR}/reviews"  > "$ARTIFACTS_DIR/ci-attempt-${ITER}-reviews.json"
gh api "repos/${SLUG}/pulls/${PR}/comments" > "$ARTIFACTS_DIR/ci-attempt-${ITER}-comments.json"

# Extract HIGH findings (heuristic — adjust to your reviewer's format)
jq '.[] | select(.body | test("(?i)severity.*high|HIGH:|\\[HIGH\\]"))' \
    "$ARTIFACTS_DIR/ci-attempt-${ITER}-reviews.json" \
    "$ARTIFACTS_DIR/ci-attempt-${ITER}-comments.json" \
    > "$ARTIFACTS_DIR/ci-attempt-${ITER}-high-findings.json" || true
```

Read the findings file, apply each HIGH fix, skip MEDIUM/LOW.

**`typecheck`** — Read the failing file at the line in the `error TSxxxx` message. Common root causes: removed an import, renamed an export, type drift between `@eduagent/schemas` and a local consumer. Fix the actual type — never `@ts-ignore`.

```bash
# Re-run locally on the affected package (faster feedback)
pnpm exec nx run-many -t typecheck --files <changed-paths> 2>&1 | tail -30
```

**`lint`** — Apply the rule's fix. If the rule is auto-fixable, run the package's lint:fix; if not, fix by hand. Never `eslint-disable`.

```bash
# Examples:
# - "no-unused-vars" → delete the unused symbol, or use it
# - "import/order" → reorder
# - eduagent G1/G4/G5 (custom rules) → fix per CLAUDE.md guidance
pnpm exec nx run-many -t lint 2>&1 | tail -30
```

**`test`** — Read the failing test name from `sig_detail`. Determine: is the test wrong (assertion is stale) or is the implementation wrong (behavior changed)? Fix the actual cause. Never weaken a test to make it pass.

```bash
# Find the test file from the failure marker
test_file="$(rg -m 1 -oE '[a-zA-Z0-9_./-]+\.test\.(ts|tsx)' "$log_file" | head -1)"
echo "Failing test in: $test_file"
```

**`build`** — Read the build error. Common root causes: missing dep declaration, broken barrel export, circular import. Fix the actual cause; rebuild locally to confirm.

**`flake`** — Do NOT modify any code. Just record the iteration and let the next iteration retry CI.

### Track changed files for Step 6

Maintain a list of files touched during the fix:

```bash
changed_files=()
# ... edit files, append each path to changed_files ...
```

---

## Step 6: Re-Validate Locally (Skip For Flake / Unknown / Same-Failure-Twice)

Before staging, re-run the same checks `cleanup-validate.md` enforces. Do NOT push if these fail; record `fix_applied: "local validation rejected"` in the iteration entry and let the next iteration try again.

### 6.1 Typecheck (workspace or scoped)

```bash
pnpm exec nx run-many -t typecheck 2>&1 | tail -30
```

### 6.2 Lint

```bash
pnpm exec nx run-many -t lint 2>&1 | tail -30
```

### 6.3 Tests related to changed files

```bash
if [[ ${#changed_files[@]} -gt 0 ]]; then
    pnpm exec jest --findRelatedTests "${changed_files[@]}" --no-coverage 2>&1 | tail -30
fi
```

### 6.4 GC1 Ratchet (CI-parity)

Mirror the recipe from `cleanup-validate.md` Phase 2.5:

```bash
BASE_REF="${BASE_REF:-main}"
# Separate the diff call from the grep pipeline so a ref-resolution failure
# is fatal, not silently "clean". (GC1 parity with cleanup-validate.md.)
if ! diff_output=$(git diff "origin/${BASE_REF}...HEAD" -- '*.test.ts' '*.test.tsx'); then
    echo "GC1 check failed: could not diff against origin/${BASE_REF}" >&2
    fix_applied="local validation rejected (GC1 diff resolution failed)"
    LOCAL_VALIDATION_FAILED=1
    diff_output=""
fi
violations=$(printf '%s\n' "$diff_output" \
    | grep -E '^\+[^+]' \
    | grep -E "jest\.mock\(['\"\`]\.\.?/" \
    | grep -iv 'gc1-allow' \
    || true)
if [ -n "$violations" ]; then
    echo "GC1 VIOLATION introduced by ci-watch fix; aborting push:" >&2
    echo "$violations" >&2
    fix_applied="local validation rejected (GC1 ratchet)"
    LOCAL_VALIDATION_FAILED=1
fi
```

If any of 6.1–6.4 fails, set `LOCAL_VALIDATION_FAILED=1`, skip Step 7, append the iteration entry at Step 8, and exit normally (next iteration retries).

---

## Step 7: Commit + Push (Skip For Flake / Unknown / Same-Failure-Twice / Local Failure)

This is the workflow's authorized commit point (see CLAUDE.md "Subagents must never run git add..." exception for structured-workflow commits).

### 7.0 Refuse To Push From A Dirty Worktree

This is the only point in the loop where worktree dirtiness is fatal — it would be unsafe to commit and push a targeted fix on top of unknown leftover state. Re-check freshly (a previous step may have cleaned it):

```bash
# Compute the set of files in `git status --porcelain` whose paths are NOT in changed_files[].
# Any such file is a leftover (scratch, build artifact, or unrelated edit) — pushing on top of
# unknown state is unsafe.
unexpected_dirty=""
while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    # `git status --porcelain` lines: "XY path"; rename lines have "orig -> new" — take the new path.
    p="$(printf '%s\n' "$line" | sed -E 's|^.. (.*-> )?(.*)$|\2|')"
    is_known=0
    for cf in "${changed_files[@]:-}"; do
        if [[ "$p" == "$cf" ]]; then is_known=1; break; fi
    done
    if [[ "$is_known" -eq 0 ]]; then
        unexpected_dirty+="${line}"$'\n'
    fi
done < <(git status --porcelain)

if [[ -n "$unexpected_dirty" ]]; then
    echo "ERROR: worktree is dirty with files this fix did not touch; refusing to push." >&2
    printf '%s' "$unexpected_dirty" >&2
    fix_applied="worktree dirty — cannot safely commit fix"
    LOCAL_VALIDATION_FAILED=1
    GIVEUP_REASON="worktree-dirty-blocks-push"
    # Fall through: skip the rest of Step 7, append iteration in Step 8, decide in Step 9.
fi
```

If `LOCAL_VALIDATION_FAILED=1` was set above, skip 7.1–7.3 and proceed to Step 8.

### 7.1 Stage only the files you edited

Never `git add -A` blind. Stage explicitly:

```bash
git add "${changed_files[@]}"
git status --porcelain  # verify no scratch/.pr-body/$ARTIFACTS_DIR files staged
```

If anything from `$ARTIFACTS_DIR/`, `*.scratch.md`, `*.tmp.md`, or `.pr-body.md` shows in the staged set, `git reset HEAD -- <path>` it.

### 7.2 Commit (no `--no-verify`)

```bash
summary="<one-line summary of fix — e.g. 'remove unused import in apps/api/src/routes/foo.ts'>"
cat > "$ARTIFACTS_DIR/ci-attempt-${ITER}-commit-msg.txt" <<CMSG
fix(ci): ${classification} — ${summary}

Iteration ${ITER}/3 of cleanup-ci-watch-and-fix loop on PR #${PR}.
See ci-attempts.json and ci-attempt-${ITER}.log under the workflow artifacts.

Co-Authored-By: Archon <archon@anthropic.com>
CMSG
git commit -F "$ARTIFACTS_DIR/ci-attempt-${ITER}-commit-msg.txt"
```

If the pre-commit hook fails: read the output, fix the underlying issue, re-stage, retry once. After two failures, abort the iteration — set `fix_applied="commit hook rejected"`, skip the push, fall through to Step 8 with no green resolution, and let the next iteration try fresh. Do NOT use `--no-verify`.

### 7.3 Push

```bash
git push
```

If `git push` fails (rejected, network, etc.), record `fix_applied: "push failed"` and let the next iteration retry.

---

## Step 8: Append Iteration Entry

Always append, regardless of which branch above ran:

```bash
jq --argjson iter "$ITER" \
   --arg cls "$classification" \
   --arg sig "$failure_signature" \
   --arg fix "${fix_applied:-applied ${classification} fix}" \
   '. += [{iteration: $iter, classification: $cls, failure_signature: $sig, fix_applied: $fix}]' \
   "$attempts_file" > "${attempts_file}.tmp" && mv "${attempts_file}.tmp" "$attempts_file"

echo "Iteration ${ITER} appended to ${attempts_file}"
```

---

## Step 9: Decide — Continue Loop Or Giveup

Trigger giveup when ANY of:

1. `ITER >= 3` (3 iterations consumed).
2. `SAME_FAILURE_TWICE == 1`.
3. `classification == "unknown"`.

```bash
GIVEUP=0
if [[ "$ITER" -ge 3 ]] || [[ "${SAME_FAILURE_TWICE:-0}" -eq 1 ]] || [[ "$classification" == "unknown" ]]; then
    GIVEUP=1
fi

if [[ "$GIVEUP" -eq 0 ]]; then
    echo "Iteration ${ITER} done; loop continues for another round."
    # Do NOT emit the promise tag — let the loop run again.
    exit 0
fi
```

### 9.1 Classify The Giveup Reason

Distinguish "CI was actually failing and we couldn't fix it" (real CI failure → P1) from "we never observed remote CI failing — something blocked us locally" (operational issue → PR comment only, no P1):

```bash
# Re-poll CI one last time so the giveup comment reflects current state, not stale data.
gh pr checks "$PR" --json name,state,bucket,link,workflow > "$checks_json" 2>&1 || true
ci_currently_failing=$(jq -e '[.[] | select(.bucket == "fail" or .bucket == "cancel")] | length > 0' "$checks_json" > /dev/null 2>&1 && echo 1 || echo 0)

# GIVEUP_REASON may already be set from Step 2.3 (ci-frozen) or Step 7.0 (worktree-dirty-blocks-push).
# If unset, derive it from the loop state.
if [[ -z "${GIVEUP_REASON:-}" ]]; then
    if [[ "${SAME_FAILURE_TWICE:-0}" -eq 1 ]]; then
        GIVEUP_REASON="same-failure-twice"
    elif [[ "$classification" == "unknown" ]]; then
        GIVEUP_REASON="unclassifiable-failure"
    elif [[ "$ITER" -ge 3 ]]; then
        GIVEUP_REASON="iteration-cap"
    else
        GIVEUP_REASON="other"
    fi
fi

# Only file P1 when remote CI actually shows failures we couldn't fix. Operational
# blockers (worktree dirty, watch timeout) get a PR comment but no Notion ticket —
# they are workflow infrastructure issues, not engineering work to escalate.
case "$GIVEUP_REASON" in
    same-failure-twice|iteration-cap|unclassifiable-failure)
        FILE_P1=1
        ;;
    ci-frozen|worktree-dirty-blocks-push|other)
        # ci-frozen: indeterminate, not a confirmed failure. worktree-dirty: operational.
        # Only file P1 if CI is currently observably failing.
        if [[ "$ci_currently_failing" -eq 1 ]]; then
            FILE_P1=1
        else
            FILE_P1=0
        fi
        ;;
    *)
        FILE_P1=0
        ;;
esac
```

### 9.2 Build Giveup Comment

Use a heredoc + temp file (mirroring `post-review-comments.sh`):

```bash
giveup_body="$ARTIFACTS_DIR/ci-giveup-comment.md"

# Most recent failing-check names (may be empty when giveup was operational, not CI-driven).
fail_names="$(jq -r '[.[] | select(.bucket == "fail" or .bucket == "cancel") | .name] | unique | join(", ")' "$checks_json" 2>/dev/null)"
[[ -z "$fail_names" ]] && fail_names="(none — remote CI was not in a failing state at giveup)"

# Last 3 attempts (or fewer)
attempts_table="$(jq -r '
    .[-3:] | map("| \(.iteration) | \(.classification) | `\(.failure_signature)` | \(.fix_applied) |") | .[]
' "$attempts_file")"

# Latest log file path (relative to repo)
latest_log="$(ls -1t "$ARTIFACTS_DIR"/ci-attempt-*.log 2>/dev/null | head -1 | sed "s|$PWD/||")"

cat > "$giveup_body" <<MD
## Cleanup CI watch loop — needs human attention

PR: #${PR}
Loop: \`cleanup-ci-watch-and-fix\` — gave up after ${ITER} iteration(s).
Giveup reason: \`${GIVEUP_REASON}\`

### Attempts

| # | Classification | Signature | Fix applied |
|---|---|---|---|
${attempts_table}

### Most recent failing checks

${fail_names}

### Latest run log

\`${latest_log}\` (under workflow artifacts directory)

### Why we stopped

$(case "$GIVEUP_REASON" in
    same-failure-twice)
        echo "- The same failure signature appeared in two iterations — the previous fix did not resolve it."
        ;;
    unclassifiable-failure)
        echo "- Failure could not be classified by the regex rules in this loop."
        ;;
    iteration-cap)
        echo "- Hit the ${ITER}-iteration cap without reaching green CI."
        ;;
    ci-frozen)
        echo "- \`gh pr checks --watch\` timed out (~25 min) — remote CI never reached a terminal state."
        echo "- Note: this is an indeterminate result, not a confirmed CI failure. Re-check the PR before assuming it is broken."
        ;;
    worktree-dirty-blocks-push)
        echo "- Local worktree was dirty with files unrelated to the fix; the loop refused to push on top of unknown state."
        echo "- Note: remote CI status was \\\`$([[ "$ci_currently_failing" -eq 1 ]] && echo failing || echo "green or pending")\\\` at giveup — separate from the worktree issue."
        ;;
    *)
        echo "- Loop ended without reaching green CI."
        ;;
esac)

A human reviewer needs to:
1. Read the latest \`ci-attempt-N.log\` for the raw failure output (if any).
2. Decide whether to retry, escalate the underlying engineering rule, or close the PR.
3. If retrying, push a fix to this branch directly — the loop has exited and won't re-trigger automatically.

$([[ "$FILE_P1" -eq 1 ]] && echo "A P1 follow-up has been filed in the Notion bug tracker." || echo "No Notion P1 was filed — this giveup was an operational/indeterminate condition, not a confirmed CI failure.")
MD

gh pr comment "$PR" --body-file "$giveup_body"
echo "Posted giveup comment to PR #${PR}"
```

### 9.3 File Notion P1 (Only When CI Is Actually Failing)

Skip the filer entirely for operational giveups (dirty worktree, frozen CI without a confirmed failure). Don't fail the workflow on filer error — best-effort with `|| echo ...`:

```bash
if [[ "$FILE_P1" -eq 1 ]]; then
    ./.archon/scripts/append-followup.sh \
        --from cleanup-ci-watch-and-fix \
        --pr "$PR" \
        --severity P1 \
        --platform "CI" \
        --title "CI giveup: ${classification} on PR #${PR}" \
        --body "Cleanup CI watch+fix loop gave up after ${ITER} iteration(s) on PR #${PR}. Giveup reason: ${GIVEUP_REASON}. Last classification: ${classification}. Last signature: ${failure_signature:-n/a}. See \$ARTIFACTS_DIR/ci-attempts.json and ci-attempt-${ITER}.log for full context. PR comment posted with attempt summary." \
        || echo "follow-up filer failed; PR comment posted only"
else
    echo "Skipping Notion P1 — giveup reason '${GIVEUP_REASON}' is operational, not a confirmed CI failure."
fi
```

### 9.4 Mark Giveup For Summary Node

```bash
# First line: classification (back-compat). Second line: giveup reason. Third: filed-P1 flag.
{
    echo "${classification}"
    echo "reason=${GIVEUP_REASON}"
    echo "filed_p1=${FILE_P1}"
} > "$ARTIFACTS_DIR/.ci-watch-giveup"
echo "Wrote $ARTIFACTS_DIR/.ci-watch-giveup"
```

The downstream summary node can detect the file's presence and surface the giveup in its report. The `reason=` and `filed_p1=` lines let downstream nodes distinguish CI-failure giveups from operational ones.

---

## Step 10: Check Completion

Whether we ended green at Step 2.1 or escalated at Step 9, the loop is done. Emit the promise tag:

<promise>ALL_CHECKS_GREEN_OR_GIVEUP</promise>

Exit 0. The Archon loop engine matches `until: ALL_CHECKS_GREEN_OR_GIVEUP` and stops.

---

## Output

Keep working output minimal — do NOT narrate every step. The downstream summary node reads `ci-attempts.json` and `.ci-watch-giveup` directly. Final stdout should include:

- Iteration number
- Classification
- Failure signature
- Whether you fixed-and-pushed, deferred (flake / local validation rejection), or gave up
- The literal `<promise>ALL_CHECKS_GREEN_OR_GIVEUP</promise>` line when the loop should terminate (only on green or giveup; not on continue-iteration).

---

## Success Criteria

- **CI green** within ≤ 3 iterations, OR
- **Clean giveup**: PR comment posted, Notion P1 filed, `.ci-watch-giveup` marker written, promise tag emitted.
- **Constraint compliance**: no new test files, no new internal `jest.mock`, no `--no-verify`, no suppression pragmas, no MEDIUM/LOW review-finding chasing.
- **State machine integrity**: every iteration appended to `ci-attempts.json`; same-failure-twice always escalates immediately rather than burning another iteration.
