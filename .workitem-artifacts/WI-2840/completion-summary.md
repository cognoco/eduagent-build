# WI-2840 completion summary

## What was done

Bound Claude review findings to an exact-head manifest generated from GitHub's pull-files API, and made any finding path outside that manifest fail closed as `REVIEW_SCOPE_CORRUPTION`.

## What changed

- The workflow captures the PR head before and after paginated pull-file retrieval and writes the authoritative manifest inside the trusted-base checkout.
- The reviewer prompt reads that manifest and records the exact reviewed head.
- After every writable Claude action attempt, the workflow rebuilds the manifest from GitHub before the evaluator can trust it, so a prompt-injected reviewer cannot widen its own scope.
- The evaluator preserves trusted-bot and run-start freshness selection, adds exact-head selection, parses finding-table paths, checks declared counts/polarity, and authorizes only complete clean approvals whose finding scope is valid.
- A behavioral fixture executes the workflow's actual shell steps for the PR #2664 normal-merge incident and the required variants.
- The workflow-security checker now ratchets both the prompt-facing capture and post-review refresh, their pre- and post-capture head checks, refresh ordering, freshness/head selection, prompt, comparison, and fail-closed exit wiring.

## Verification

See `verification.md` and `red-green.md`. The full 59-suite script gate and change-class fast validation passed; live PR #2664 evidence still reproduces eight authoritative paths versus three out-of-scope finding paths.

## Caveats / Follow-ups

- Claude review availability remains an external capacity gate. A missing exact-head verdict or token-exhausted run remains blocking and will be retried, never self-waived.
- Open PR #2581 (`origin/WI-2718`) overlaps `.github/workflows/claude-code-review.yml`, `scripts/check-github-workflow-security.ts`, and `scripts/check-github-workflow-security.test.ts`. Its `validateClaudeReviewContract` and fixture block occupy the same checker/test region as WI-2840's `validateClaudeReviewScopeContract`, so a textual merge conflict is likely if both land without refresh. WI-2840 does not take its all-PR trigger, bounded-attempt, timeout, initializer/recovery artifact, fallback-sequence, or AGENTS changes. `scripts/claude-review-scope-workflow.test.ts` and all WI-2840 lifecycle artifacts are unique. Landing order and any conflict reconciliation with PR #2581 belong to the shepherd.
- Independent inherited residue: `bash scripts/validate-doc-versions.sh` reports a mobile-test count mismatch against `AGENTS.md`; WI-2840 does not change that unrelated documentation.
