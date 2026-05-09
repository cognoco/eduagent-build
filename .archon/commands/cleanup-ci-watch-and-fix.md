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

The loop runs in the same worktree the PR was pushed from, but verify before pushing later:

```bash
HEAD_BRANCH=$(git branch --show-current)
echo "Branch: $HEAD_BRANCH"
git status --porcelain
```

The working tree should be clean. If dirty, that's a workflow contract violation — capture and proceed to giveup at Step 9.

---

## Step 2: Watch CI

Bound the watch at ~25 minutes so an indefinitely-pending check can't consume the whole `idle_timeout`:

```bash
log_file="$ARTIFACTS_DIR/ci-attempt-${ITER}.log"
checks_json="$ARTIFACTS_DIR/ci-attempt-${ITER}-checks.json"

# `gh pr checks --watch` blocks until all checks finish; cap with `timeout`.
# Exit codes: 0 all green, 8 any failure, 124 timeout (per `timeout(1)`).
set +e
timeout 1500 gh pr checks "$PR" --watch --interval 30 > "$log_file" 2>&1
watch_rc=$?
set -e

# Snapshot the post-watch check status as JSON for downstream parsing.
gh pr checks "$PR" --json name,state,bucket,link,workflow > "$checks_json" 2>&1 || true
```

### 2.1 If All Green

```bash
if [[ "$watch_rc" -eq 0 ]] || ! jq -e '[.[] | select(.bucket == "fail" or .bucket == "cancel")] | length > 0' "$checks_json" > /dev/null 2>&1; then
    echo "All CI checks green on PR #${PR} after ${ITER} iteration(s)."
    echo "<promise>ALL_CHECKS_GREEN_OR_GIVEUP</promise>"
    exit 0
fi
```

### 2.2 If Timeout

If `watch_rc` is 124 (timeout), record this iteration as `unknown` and proceed to giveup — we cannot reason about a frozen pipeline:

```bash
if [[ "$watch_rc" -eq 124 ]]; then
    classification="unknown"
    failure_signature="watch-timeout:gh-pr-checks-1500s"
    fix_applied="no fix — watch timed out"
    # Skip ahead to Step 9 (giveup) after appending the iteration entry.
fi
```

### 2.3 If Failed — Gather Failed Run Logs

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
   && rg -q 'GC1 VIOLATION|GC1 — no new internal jest\.mock|gc1-allow' "$log_file"; then
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
- **No new internal `jest.mock('./...')` or `jest.mock('../...')`.** GC1 ratchet forbids it. Use `jest.requireActual()` with targeted overrides. Canonical pattern: `apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts`. Never silence with `// gc1-allow:`.
- **No `--no-verify`.** Pre-commit hooks must run.
- **No suppression pragmas.** No `eslint-disable`, no `@ts-ignore`, no `@ts-expect-error` to silence problems. Fix the actual code.
- **For `code-review`: only HIGH-severity findings.** Skip MEDIUM/LOW; defer them via `append-followup.sh` if they need eventual attention.

### Per-classification recipes

**`gc1-ratchet`** — A test added a relative-path `jest.mock`. Open the offending file (extracted from `sig_detail`). Replace the mock with `jest.requireActual()` + targeted override:

```ts
// BEFORE (rejected by ratchet):
jest.mock('./db', () => ({ db: { select: jest.fn() } }));

// AFTER:
jest.mock('./db', () => {
    const actual = jest.requireActual<typeof import('./db')>('./db');
    return { ...actual, db: { ...actual.db, select: jest.fn() } };
});
// gc1-allow: targeted override, retains real type via requireActual
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
violations=$(git diff "origin/${BASE_REF}...HEAD" -- '*.test.ts' '*.test.tsx' \
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

Co-Authored-By: Claude <noreply@anthropic.com>
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

### 9.1 Build Giveup Comment

Use a heredoc + temp file (mirroring `post-review-comments.sh`):

```bash
giveup_body="$ARTIFACTS_DIR/ci-giveup-comment.md"

# Most recent failing-check names
fail_names="$(jq -r '[.[] | select(.bucket == "fail" or .bucket == "cancel") | .name] | unique | join(", ")' "$checks_json" 2>/dev/null || echo "(unknown)")"

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

### Attempts

| # | Classification | Signature | Fix applied |
|---|---|---|---|
${attempts_table}

### Most recent failing checks

${fail_names}

### Latest run log

\`${latest_log}\` (under workflow artifacts directory)

### Why we stopped

$(if [[ "${SAME_FAILURE_TWICE:-0}" -eq 1 ]]; then
    echo "- The same failure signature appeared in two iterations — the previous fix did not resolve it."
elif [[ "$classification" == "unknown" ]]; then
    echo "- Failure could not be classified by the regex rules in this loop."
else
    echo "- Hit the ${ITER}-iteration cap without reaching green CI."
fi)

A human reviewer needs to:
1. Read the latest \`ci-attempt-N.log\` for the raw failure output.
2. Decide whether to retry, escalate the underlying engineering rule, or close the PR.
3. If retrying, push a fix to this branch directly — the loop has exited and won't re-trigger automatically.

A P1 follow-up has been filed in the Notion bug tracker.
MD

gh pr comment "$PR" --body-file "$giveup_body"
echo "Posted giveup comment to PR #${PR}"
```

### 9.2 File Notion P1

Don't fail the workflow on filer error — best-effort with `|| echo ...`:

```bash
./.archon/scripts/append-followup.sh \
    --from cleanup-ci-watch-and-fix \
    --pr "$PR" \
    --severity P1 \
    --platform "CI" \
    --title "CI giveup: ${classification} on PR #${PR}" \
    --body "Cleanup CI watch+fix loop gave up after ${ITER} iteration(s) on PR #${PR}. Last classification: ${classification}. Last signature: ${failure_signature:-n/a}. See \$ARTIFACTS_DIR/ci-attempts.json and ci-attempt-${ITER}.log for full context. PR comment posted with attempt summary." \
    || echo "follow-up filer failed; PR comment posted only"
```

### 9.3 Mark Giveup For Summary Node

```bash
echo "${classification}" > "$ARTIFACTS_DIR/.ci-watch-giveup"
echo "Wrote $ARTIFACTS_DIR/.ci-watch-giveup"
```

The downstream summary node can detect the file's presence and surface the giveup in its report.

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
