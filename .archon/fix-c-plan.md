# Archon Fix-C Plan — Cleanup-PR Workflow: Validate-Fix Scope Gap & Notion Filer Fail-Open

**Status**: handoff — agent that owns Archon should pick this up
**Origin**: PR-01 codex run `4fcf7859094e716c167bebe1d6017403` (2026-05-09 19:20-21:32) — workflow stalled at `scope-guard-post-fix`, follow-up filer also failed silently
**Related**: [Fix Plan 1](./fix-1-plan.md) — claude-flavor first-event-timeout (separate issue, separate run)

## Background

PR-01 codex committed phase work cleanly (`119c433c`, files all in scope). During the `validate` node, the verification command `pnpm exec jest --findRelatedTests packages/schemas/src/errors.ts apps/mobile/src/lib/api-errors.ts` pulled in `apps/mobile/src/hooks/use-homework-ocr.test.ts` as a related test. That test was failing on cross-suite `FormData` pollution — a real test-isolation bug exposed by the verification run. The validate node fixed the test (commit `d89fdfc0`, "fix: address validation failures in cleanup PR") and validation.md ended with `Status: FIXED`. Reviewers ran, verdict APPROVE, no critical/high findings.

Then `scope-guard-post-fix` rejected the run because its diff base is `.pre-implement-sha`, so it inherited validate's commit `d89fdfc0` and saw `use-homework-ocr.test.ts` as an "unexpected file." The graceful-handoff Notion P1 filer then also failed: `"NOTION_API_KEY not retrievable from Doppler (project=mentomate config=dev)"`. Right now, with the same `DOPPLER_TOKEN` the daemon is running with, the same Doppler call works fine — so it was a transient hiccup. We have no idea what the actual error was because `append-followup.sh:82` uses `2>/dev/null || true` to swallow it.

Two independent defects. Fix them in either order; they don't depend on each other.

## Fix 1 (PRIMARY) — Scope-guard recognizes validate-fix files

### What's broken

`cleanup-scope-guard.sh` diffs `${base}..HEAD` where `${base}` is the pre-implement SHA. By the time it runs at `scope-guard-post-fix`, that diff includes:

- the implement commit (files claimed by the work-order — fine)
- any commits from `cleanup-validate.md` Phase 3 ("FIX AND COMMIT" — see `.archon/commands/cleanup-validate.md:152-167`)
- any commits from `cleanup-fix-locally.md` (CRITICAL/HIGH reviewer-finding fixes)

The work-order has no way to express "validate may also touch related test files to fix test-isolation bugs exposed by the verification command," so any validate-fix outside the work-order's claimed files trips the guard.

### What to do

**Edit `cleanup-validate.md` Phase 3 to record any files validate touched.** Right after the existing `git add -A` step in the FIX AND COMMIT block (`.archon/commands/cleanup-validate.md:156`), insert:

```bash
# Record files modified by validate so scope-guard can union them with the work-order.
# This is the documented mechanism for validate-fix files (e.g., test-isolation
# fixes exposed by --findRelatedTests). Do NOT use this to add work-order phases
# you forgot — those belong in docs/audit/cleanup-plan.md.
git diff --cached --name-only > "$ARTIFACTS_DIR/.validate-allowed-extras"
```

**Edit `cleanup-scope-guard.sh` to union that file with the work-order's allowed list.** After the existing `allowed_files=` block (`.archon/scripts/cleanup-scope-guard.sh:16-20`), add:

```bash
# Validate may legitimately commit test-infrastructure fixes outside the
# work-order's claimed files (e.g., hardening a related test against
# cross-suite pollution). cleanup-validate.md writes the touched paths here.
extras_file="${artifacts_dir}/.validate-allowed-extras"
if [[ -f "$extras_file" ]]; then
    extras="$(cat "$extras_file" | grep -v '^$' | sort -u)"
    if [[ -n "$extras" ]]; then
        allowed_files="$(printf '%s\n%s\n' "$allowed_files" "$extras" | sort -u)"
        echo "Scope guard: unioned $(echo "$extras" | wc -l | tr -d ' ') validate-fix file(s) into allowed list"
    fi
fi
```

**Important guardrails:**

1. The fail-closed check at `cleanup-scope-guard.sh:22-27` ("ERROR: no file paths found in work-order.md") must stay above this addition. Don't move it. We want to fail closed if the work-order is malformed; we only want to ADD validate-fix files to a valid base list.
2. Don't add the same logic for `cleanup-fix-locally.md`. That command is supposed to fix only CRITICAL/HIGH reviewer findings, all of which should be on files already in scope (since reviewers see the implement diff). If fix-locally is touching files outside scope, that's a different problem and we want to know.
3. Don't make the extras file a config option or an env var. It must be written by validate, read by scope-guard, in that exact order. Hard-coded path keeps the audit simple.

### Verify

After the edit, run any cleanup-PR workflow that needs a validate-fix (PR-01 codex shape — implement plus a `--findRelatedTests` check that pulls in a non-claimed test). Two correct outcomes:

1. Validate writes 1+ paths to `$ARTIFACTS_DIR/.validate-allowed-extras` AND scope-guard logs "unioned N validate-fix file(s)" AND the workflow proceeds past `scope-guard-post-fix`.
2. Validate writes nothing to the extras file (no fixes needed) AND scope-guard runs as before.

Negative test: stage a synthetic case where the implement step touches a file outside the work-order's allowed list (e.g., manually `touch` an unclaimed file in the worktree mid-implement). Scope-guard should still reject it because the file came from implement, not validate, and won't appear in `.validate-allowed-extras`.

### Don't do

- Don't change the work-order schema or `docs/audit/cleanup-plan.md` format. The cleanup-plan author shouldn't have to predict which test-infrastructure files will need hardening.
- Don't broaden scope-guard's exempt-paths list (`.archon/`, `.claude/`, `.codex/`). Test files under `apps/`, `packages/`, etc. are NOT exempt; the validate-extras union is the right surgical fix.
- Don't try to re-derive the extras list from git log message conventions. The `fix: address validation failures in cleanup PR` commit message is convenient but commit messages aren't a stable contract.

## Fix 2 (SECONDARY) — `append-followup.sh` Doppler call fails loud

### What's broken

`.archon/scripts/append-followup.sh:82`:

```bash
NOTION_API_KEY="$(doppler secrets get NOTION_API_KEY --plain -p mentomate -c dev 2>/dev/null || true)"
if [[ -z "$NOTION_API_KEY" ]]; then
    echo "ERROR: NOTION_API_KEY not retrievable from Doppler (project=mentomate config=dev)." >&2
```

Same fail-open `|| true` pattern we fixed in 5+ places during PR #188 round 2. The `2>/dev/null` swallows the actual Doppler error (auth, rate limit, network, wrong project) and the `|| true` keeps the script going with an empty key. The downstream branch only sees "key was empty" and emits a generic message that tells us nothing about why.

### What to do

Replace lines 82-84 with:

```bash
# Capture stderr so we know WHY it failed (auth, rate limit, network blip).
# Fail loudly here — the whole point of this script is to file a Notion ticket
# when something goes wrong upstream; if WE go silent the upstream failure is
# invisible to the human.
doppler_err="$(mktemp)"
NOTION_API_KEY="$(doppler secrets get NOTION_API_KEY --plain -p mentomate -c dev 2>"$doppler_err")"
doppler_rc=$?
if (( doppler_rc != 0 )) || [[ -z "$NOTION_API_KEY" ]]; then
    {
        echo "ERROR: NOTION_API_KEY not retrievable from Doppler (project=mentomate config=dev)."
        echo "  Doppler exit code: ${doppler_rc}"
        echo "  Doppler stderr:"
        sed 's/^/    /' < "$doppler_err"
    } >&2
    # Persist for postmortem in artifacts dir if available
    if [[ -n "${ARTIFACTS_DIR:-}" && -d "${ARTIFACTS_DIR}" ]]; then
        cp "$doppler_err" "${ARTIFACTS_DIR}/notion-filer-doppler-error.txt" 2>/dev/null || true
    fi
    rm -f "$doppler_err"
    # Continue with the existing fallthrough (write the body to stderr so the
    # workflow log still surfaces what would have been filed).
    NOTION_API_KEY=""
fi
rm -f "$doppler_err" 2>/dev/null
```

Keep the rest of the script's existing behavior (the existing `if [[ -z "$NOTION_API_KEY" ]]` fallthrough should still run, since we set it to "" on failure). The script's job after this is unchanged: if no key, write the body to stderr so the workflow log still shows what would have been filed.

### Verify

1. **Happy path:** unchanged. Run any cleanup-PR workflow that triggers a follow-up filer (e.g., PR-04 shape with intentional scope violation). Notion ticket lands as before.
2. **Auth failure:** temporarily corrupt the daemon's `DOPPLER_TOKEN` (set to a known-bad value), trigger a workflow that fires the filer. Expected: stderr now contains the actual Doppler error message; `notion-filer-doppler-error.txt` is in the artifacts dir; the script still falls through to its existing "no key, write body to stderr" path so the workflow doesn't crash.
3. **Network failure:** can't easily simulate, but spot-check that `doppler_rc` propagates through (set `DOPPLER_API_HOST=https://nonexistent.invalid` for one run).

### Don't do

- Don't make this fail the workflow if Doppler is down. Filing a Notion ticket is a graceful-handoff convenience; the upstream failure that triggered it is the real problem and should still surface to the human via stderr + scope-violation.md.
- Don't sweep the `2>/dev/null || true` pattern across other scripts in this PR. PR #188 round 2 already covered the cleanup-PR scripts; this is the one that was missed because it's invoked from inside the scope-guard's failure path. If you find more, file separately — don't bundle.

## Stranded work: PR-01 codex

The PR-01 codex run's work is intact and good — branch `archon/thread-07235ded` (worktree at `~/.archon/workspaces/cognoco/eduagent-build/worktrees/archon/thread-07235ded`) has:

```
d89fdfc0 fix: address validation failures in cleanup PR
119c433c refactor(schemas): move quota and gone errors to schemas
```

Reviewer verdict was APPROVE, no CRITICAL/HIGH findings. Three options for the user (NOT for the agent doing this fix — flag this in the handoff report):

- **(a) Push and PR manually now.** Work is good, reviewers approved. One-line `git push -u origin archon/thread-07235ded && gh pr create ...`. Doesn't depend on either fix landing.
- **(b) Wait for fix 1 to land, then re-run PR-01 codex from scratch.** Cleaner audit trail, more expensive (another full workflow run including model time). Tests fix 1 on a known-failing input.
- **(c) Update `docs/audit/cleanup-plan.md` PR-01's claimed-files to include `apps/mobile/src/hooks/use-homework-ocr.test.ts` and re-run.** Cheap but sets a bad precedent — the plan author would have to predict every related-test fix.

Recommendation: (a) for the work itself; (b) as the verification of fix 1.

## Sequencing

Either fix can land first; they don't conflict. If you have to pick:

- **Fix 1 first** if the user wants to re-run the matrix soon. It unblocks the codex flavor on PR-01-shaped runs, which is the immediate need.
- **Fix 2 first** if the user is filing other follow-ups via this script in the meantime and the silent-failure mode is masking other issues.

## Acceptance criteria

- **Fix 1 done when:** a clean re-run of any PR-01-codex-shaped workflow (work-order with verification command that pulls in non-claimed related tests) reaches `summary` without scope-guard rejection, AND `.archon/artifacts/runs/<rid>/.validate-allowed-extras` contains the validate-touched paths, AND scope-guard logs the union count.
- **Fix 2 done when:** a deliberately-failed Doppler call (corrupted DOPPLER_TOKEN, single run) produces a workflow log containing the actual Doppler error message AND `notion-filer-doppler-error.txt` lands in the artifacts dir.

## Reporting back

After both fixes:

1. Diffs of `cleanup-validate.md`, `cleanup-scope-guard.sh`, and `append-followup.sh`.
2. The workflow_run_id of the verification run for fix 1 (so we can audit the `.validate-allowed-extras` file and the scope-guard log line).
3. A short note on the deliberate-failure test for fix 2: which Doppler error message landed in the artifacts dir.
4. Whether you used the same commit for both fixes or split them — if split, in what order.
