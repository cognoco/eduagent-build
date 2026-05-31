# [BUG] Unreachable analyze-step branch contains a latent script-injection sink (workflow_run.pull_requests[0].base.ref)

**File:** [`.github/workflows/e2e-ci.yml`](https://github.com/cognoco/eduagent-build//blob/main/.github/workflows/e2e-ci.yml#L49-L68) (lines 49, 54, 65, 66, 68)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-dead-code-latent-injection`

## Owners

**Suggested assignee:** `vetinari@zaf.fleet` _(via last-committer)_

## Finding

In the check-changes job's analyze step, line 66 builds `PR_BASE="${{ github.event.workflow_run.pull_requests[0].base.ref }}"` by interpolating a PR base branch name directly into the shell. This is inside the `if [ "${{ github.event.workflow_run.event }}" = "pull_request" ]` block (lines 65-72). That block is UNREACHABLE: the earlier guard at lines 49-54 already does `if event_name == 'workflow_run' && workflow_run.event == 'pull_request' -> exit 0`, and the schedule/dispatch guard (57-62) exits before line 65 too. So every path that survives to line 65 has `workflow_run.event != 'pull_request'`, making the condition always false. Consequently the interpolation is not currently exploitable. It is reported because (a) the only thing making it safe is control-flow ordering — if the early `exit 0` is ever removed or reordered, this becomes a live script-injection sink, and (b) `base.ref` is partially attacker-influenced (a fork author chooses the PR base branch). git ref charset limits the payload, but raw interpolation of any event field into a shell is the wrong pattern. Note this job only has `contents: read`/`actions: read` and no secrets, so even a live version would be limited blast radius, but check-changes does check out untrusted `head_sha` (line 43).

## Recommendation

Delete the dead block (lines 65-75). If diff-against-base is ever needed for a non-fork context, pass the branch name through an `env:` var (`env: PR_BASE: ${{ github.event.workflow_run.pull_requests[0].base.ref }}`) and reference `"${PR_BASE}"` in the shell, never inline `${{ }}` interpolation.

## Revalidation

**Verdict:** true-positive

Confirmed accurate as stated — a correctly-classified latent BUG, not a live vuln. Both reviewers verified the analyze step (lines ~65-75) assigns `PR_BASE="${{ github.event.workflow_run.pull_requests[0].base.ref }}"`, interpolating an attacker-influenceable PR base-branch name directly into shell, inside an `if [ … workflow_run.event = pull_request ]` block. That block is unreachable because the earlier guard (lines 49-54) already `exit 0`s for exactly that condition, so any execution that reaches line 65 has `workflow_run.event != pull_request` and the condition is always false. Hence it is not currently exploitable, and the check-changes job holds only `contents: read`/`actions: read` with no secrets, bounding blast radius even hypothetically. It is correctly reported as latent: the only thing making it safe is control-flow ordering, and raw `${{ }}`-into-shell interpolation is the wrong pattern. BUG severity is right; remediation is to delete the dead block or use an `env:`-var indirection.

## Recent committers (`git log`)

- Lord Vetinari <vetinari@zaf.fleet> (2026-05-23)
- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-23)
