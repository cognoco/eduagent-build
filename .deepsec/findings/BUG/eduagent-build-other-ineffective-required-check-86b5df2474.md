# [BUG] Required 'smoke' status check is a structural no-op on every pull_request (always green via 'skipped')

**File:** [`.github/workflows/e2e-web.yml`](https://github.com/cognoco/eduagent-build//blob/main/.github/workflows/e2e-web.yml#L45-L229) (lines 45, 46, 47, 48, 75, 224, 228, 229)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-ineffective-required-check`

## Owners

**Suggested assignee:** `vetinari@zaf.fleet` _(via last-committer)_

## Finding

The changes job short-circuits `should-run=false` for ALL pull_request events at lines 45-49, before any file-diff logic. run-smoke gates on `should-run == 'true'` (line 75), so it is always SKIPPED on PRs. The smoke gate job (lines 213-232) — which the comment at lines 209-212 calls 'the required status check on branch protection' — only fails on run-smoke result `failure`/`cancelled` (line 224); a `skipped` result falls through to the `should-run == 'false'` branch (line 228) and exits 0. Net effect: if `smoke` is a required check, it is GREEN for every PR regardless of changed files, so the Playwright web smoke suite never gates any PR and reviewers get false confidence that E2E ran. This appears intentional for fork PRs (the comment explains secrets must not flow to forks, hence workflow_dispatch-after-review) — and indeed fork PRs receive empty secrets and run-smoke is correctly skipped. The gap is that SAME-REPO PRs, where secrets are available and execution is trusted, also get zero E2E coverage, and the 'required status check' framing masks that. Not attacker-exploitable on its own (CI's lint/test/typecheck/integration checks still gate PRs); reported as a correctness/false-confidence defect. Borderline HIGH_BUG if branch protection treats this as a meaningful E2E gate.

## Recommendation

Distinguish fork from same-repo PRs instead of disabling on all PRs: replace the blanket pull_request early-exit with a fork check (e.g. proceed when `github.event.pull_request.head.repo.fork == false`, skip otherwise) so same-repo PRs run the smoke suite and the required check exercises real coverage. If E2E is deliberately post-merge/dispatch-only, drop the 'required status check' framing so the team does not over-trust a check that never runs.

## Revalidation

**Verdict:** true-positive

Confirmed in the current file. The changes job writes should-run=false and exits 0 for ALL pull_request events (L45-48), before any file-diff logic. run-smoke is gated `if: needs.changes.outputs.should-run == 'true'` (L75), so on every PR its result is `skipped`. The smoke gate job (`if: always()`) exits 1 only when `needs.changes.result != 'success'` (L220-222, which guards detector crashes) or when run-smoke result is failure/cancelled (L224-226); a `skipped` run-smoke is neither, so control reaches the `should-run == 'false'` branch (L228) and the gate exits 0. Net effect: if `smoke` is a branch-protection-required check it is green on every PR regardless of changed files, and the Playwright web smoke suite gates nothing — including same-repo PRs where execution and secrets are trusted. This is a genuine correctness/false-confidence defect, not attacker-exploitable on its own (lint/typecheck/unit/integration checks still gate PRs). BUG is the appropriate severity: there is no in-repo evidence that `smoke` is actually wired as a meaningful required E2E gate in branch protection (only the in-file comment asserts it), so HIGH_BUG would overstate the blast radius. It is distinct from Finding 1 (different location: gate/skip logic vs secret env blocks; different class: ineffective gate vs claimed secret exposure), so not a duplicate — rather, this finding's correctness is precisely what makes Finding 1 a false positive.

## Recent committers (`git log`)

- Lord Vetinari <vetinari@zaf.fleet> (2026-05-29)
- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-23)
