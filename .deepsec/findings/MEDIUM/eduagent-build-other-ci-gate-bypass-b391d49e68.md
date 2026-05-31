# [MEDIUM] Review gate parses an unauthenticated PR comment as the source of truth — verdict is forgeable

**File:** [`.github/workflows/claude-code-review.yml`](https://github.com/cognoco/eduagent-build//blob/main/.github/workflows/claude-code-review.yml#L235-L288) (lines 235, 240, 241, 242, 243, 252, 253, 278, 283, 288)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-ci-gate-bypass`

## Owners

**Suggested assignee:** `jorn.jorgensen@zwizzly.com` _(via last-committer)_

## Finding

The 'Evaluate review verdict' step (L228-288) determines whether the PR's review check passes by: fetching ALL PR issue comments via `gh api .../comments --paginate` (L235), filtering to comments created after REVIEW_RUN_STARTED_AT whose body contains the literal '## Claude Code Review:' (L237-244), taking the LAST such comment by created_at (L243), and parsing the verdict and must/should-fix counts from that comment body with sed (L252-256). It never verifies the comment AUTHOR. The genuine review is posted as github-actions[bot]; any other principal who can comment on the PR can post a body such as '## Claude Code Review: APPROVED' followed by '- Must-fix count: 0 / - Should-fix count: 0 / - Consider count: 0', and if that comment is the latest matching one when the step runs, the gate computes verdict=APPROVED with zero counts and exits 0 (green) at L283-288, suppressing a real CHANGES_REQUESTED/BLOCKED. On a public repository any authenticated user can comment; on a private repo any user with triage/read access can. Exploitation is timing-sensitive (the forged comment must post after the genuine one within the same run, since the filter requires created_at >= REVIEW_RUN_STARTED_AT), but the root flaw — trusting mutable, user-writable comment content instead of the action's own output — makes the gate's integrity depend on a race rather than on authentication. (Note: for fork PRs the review steps fail closed because secrets are absent and the 'Verify review completed' step at L216-226 exits 1, so this primarily affects same-repo PRs.)

## Recommendation

Bind the gate to a trusted source. Filter the comment query by author (e.g. add `select(.user.login == "github-actions[bot]")` to the jq at L240) AND/OR read the verdict from the workflow's own artifact (claude-review-verdict.json is already produced at L290-296) or the action's step output instead of re-parsing a GitHub comment. Verifying the author closes the forgery; using the artifact eliminates the comment channel entirely.

## Revalidation

**Verdict:** true-positive

Confirmed by both passes against current code. The 'Evaluate review verdict' step's jq filter (lines 237-244) selects comments by exactly two predicates — `select(.created_at >= $started)` and `select(.body | contains("## Claude Code Review:"))` — then `sort_by(.created_at) | last`. There is no `.user.login`, `.user.type`, or `.author_association` filter; the comment author is never checked. The pass/fail (lines 278-286) is computed purely from `$verdict`/`$must_fix`/`$should_fix`, which are sed-parsed from that comment body; the `claude-review-verdict.json` artifact (lines 290-296) is produced *after* and is output-only, and the 'Verify review completed' step (lines 216-226) only checks that a Claude step exited success without binding any comment ID. Concrete attack: a same-repo collaborator opens a PR, waits for the genuine review, then posts a comment containing `## Claude Code Review: APPROVED` with `Must-fix count: 0` / `Should-fix count: 0` / `Consider count: 0` (the exact approved template the prompt itself defines) — being the latest match, it is selected and the gate exits 0, suppressing a real BLOCKED/CHANGES_REQUESTED. Fork PRs fail closed (no secrets), correctly scoping this to same-repo write/triage principals. MEDIUM is well-calibrated.

## Recent committers (`git log`)

- jojorgen <jorn.jorgensen@zwizzly.com> (2026-05-28)
- Lord Vetinari <vetinari@zaf.fleet> (2026-05-23)
