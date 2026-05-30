# [BUG] mobile-maestro (secret-bearing, executes checked-out code) gates only on a job output, with no independent trigger guard

**File:** [`.github/workflows/e2e-ci.yml`](https://github.com/cognoco/eduagent-build//blob/main/.github/workflows/e2e-ci.yml#L183-L279) (lines 183, 211, 215, 279)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-fragile-single-layer-gate`

## Owners

**Suggested assignee:** `vetinari@zaf.fleet` _(via last-committer)_

## Finding

The mobile-maestro job (line 180) checks out `github.event.workflow_run.head_sha` (line 215) and then executes code from that tree (`pnpm install` with postinstall scripts, `expo prebuild`, `gradlew assembleDebug`, `maestro test`) while holding secrets EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY_PREVIEW (line 211) and TEST_SEED_SECRET (line 279). Its only gate is `if: needs.check-changes.outputs.run-mobile-e2e == 'true'` (line 183). Security is therefore fully delegated to the check-changes analyze step, which sets that output to false for `workflow_run + pull_request` (fork) events. Today this is SAFE: fork PRs trigger CI with `workflow_run.event == 'pull_request'`, hit the line 49-54 short-circuit, and mobile-maestro is skipped; fork pushes never trigger the upstream CI at all. But the defense is single-layer and not self-evident — a reviewer reading mobile-maestro's `if:` alone cannot tell that untrusted code can't reach the secrets, and any future edit to check-changes silently removes the gate. Contrast mobile-ci.yml, which re-asserts `workflow_run.event == 'push' && head_repository.full_name == github.repository` at every privileged job. This is a defense-in-depth / auditability gap, not a currently-exploitable issue.

## Recommendation

Add an explicit trigger guard to mobile-maestro's `if:`, e.g. `needs.check-changes.outputs.run-mobile-e2e == 'true' && (github.event_name != 'workflow_run' || (github.event.workflow_run.event == 'push' && github.event.workflow_run.head_repository.full_name == github.repository))`, mirroring mobile-ci.yml. Also add a comment at the line 43/215 checkouts noting that no checked-out code may be executed before the fork short-circuit (e.g. never introduce a `uses: ./local-action` step in check-changes before the guard).

## Revalidation

**Verdict:** true-positive

Confirmed as a legitimate defense-in-depth BUG (not currently exploitable). mobile-maestro's only gate is `if: needs.check-changes.outputs.run-mobile-e2e == 'true'` (line 183); it checks out `github.event.workflow_run.head_sha || github.sha` (line 215), writes `secrets.TEST_SEED_SECRET` into apps/api/.dev.vars (lines ~277-279), and executes checked-out code (pnpm install, expo prebuild, gradlew, maestro). The current defense holds only because the check-changes short-circuit keeps run-mobile-e2e=false for PR-triggered workflow_run (see e2e#1). The valid concern is that, unlike mobile-ci.yml — which re-asserts `workflow_run.event == 'push' && head_branch == 'main' && head_repository.full_name == github.repository` directly on its privileged job — mobile-maestro has no independent per-job trigger guard. The protection is single-layer and implicit, so a future edit to check-changes could silently expose the secret-bearing job. This is the accurate counterpart to the false-positive e2e#1: same mechanism, but e2e#4 correctly characterizes the real state (safe-but-fragile) rather than claiming exploitability — so the two are not duplicates. BUG/hardening severity is appropriate; add the explicit per-job trigger guard.

## Recent committers (`git log`)

- Lord Vetinari <vetinari@zaf.fleet> (2026-05-23)
- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-23)
