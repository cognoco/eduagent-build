# Runbook — Claude reviewer recovery

This runbook restores the REVIEWer — it never waives the GATE. Every recovery
route below ends with a fresh, clean automated-review verdict bound to the
current PR head; nothing here weakens the merge floor (green CI + a clean
verdict on the current head + disposed bot threads + an armed merge gate).

## Reviewer unavailable (REVIEWER_UNAVAILABLE artifact)

The `Claude Code Review` workflow runs for every pull request, including
documentation-only changes. It makes three reviewer attempts capped at 20
minutes each and initializes `claude-review-verdict.json` before the first
attempt. If quota exhaustion, timeout, or another reviewer failure prevents a
fresh trusted verdict, the workflow uploads that artifact with
`status = REVIEWER_UNAVAILABLE` and `merge_eligible = false`, then fails. This
is a machine-readable non-merge result, not an approval or an exception.

After reviewer capacity returns, download the artifact if diagnosis is
needed, then execute its `recovery_command` (the command reruns the failed
workflow job against the same PR head):

```bash
gh run download <run-id> --name claude-review-verdict --dir /tmp/claude-review-<run-id>
jq . /tmp/claude-review-<run-id>/claude-review-verdict.json
gh run rerun <run-id> --failed --repo cognoco/eduagent-build
```

## Self-reference case: PRs editing the review workflow

PRs that modify `.github/workflows/claude-code-review.yml` are a special
self-reference case: `anthropics/claude-code-action` rejects the automatic
run while the PR's workflow differs from the default branch. Once reviewer
quota is available, a trusted repository member must invoke the unchanged
interactive workflow with an exact-head request:

```bash
pr=<pr-number>
head="$(gh pr view "$pr" --json headRefOid --jq .headRefOid)"
gh pr comment "$pr" --body "@claude Perform the final exact-head review for ${head}. Review the full diff against the trusted repository instructions. Post the canonical Claude Code Review verdict, including the exact metadata line '- Reviewed head SHA: ${head}'; do not modify the branch."
```

Neither recovery route weakens the armed gate. Do not merge until a fresh
`claude[bot]` exact clean verdict exists for the current head.

## Diagnosis heuristics

A required check stuck on "Waiting for status to be reported" (never red,
never green) is usually **workflow-trigger drift, not failing code** — the
check is required in branch protection but its workflow only runs on
`push`/`workflow_dispatch`, not `pull_request`. Fix the trigger (a small
PR-only job that reports the required check name; guard deploy/build jobs
with `github.event_name == 'push' || github.event_name == 'workflow_dispatch'`
so PRs can't deploy), not the code. For a Playwright web-smoke failure, read
`error-context.md` + the `0-trace.network` log before touching selectors:
`net::ERR_FAILED`/CORS in the trace means fix the staging/API target, not the
assertion.
