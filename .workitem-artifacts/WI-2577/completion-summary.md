# WI-2577 completion summary

## What was done

Verified the reported fault — "the later-phases Playwright project never receives the V2 build-time flags from any invocation path" — is Already Fixed at the current execution base, and returned evidence instead of a change. The fix landed 2026-06-21 in the ancestor commit recorded in Fixed In (chore(e2e-web): wire V2 nav-shell posture into e2e export + CI) and is present verbatim on current origin/main. The flag path was traced empirically end-to-end, not inferred from the project name: apps/mobile/playwright.config.ts defines webServer once at config root (shared by every project including later-phases, which adds no env override); it spawns e2e-web/helpers/serve-exported-web.mjs, whose overrideEnvFiles step calls applyExpoPublicEnvOverrides (serve-exported-web-env.mjs) to replace-or-append EXPO_PUBLIC_ENABLE_MODE_NAV, the V1 and V2 siblings, and the E2E flag into the env files Expo actually reads before the web export runs — so whatever the invoking shell sets is what lands in the exported bundle.

## What changed

Nothing in source. A worktree was created for the investigation, verified zero-diff against origin/main, and removed. Every maintained later-phases invocation was enumerated: the only Playwright web CI workflow (.github/workflows/e2e-web.yml) never targets later-phases (its smoke job runs the v2-release project plus the five declared legacy smoke lanes per tools/quarantine/run-smoke-lanes.cjs), leaving the two documented commands in apps/mobile/e2e-web/README.md as the maintained later-phases invocations — both of which already export all three nav flag values as true before invoking. The explicit V0/V1 matrix commands outside the release project were left untouched.

## Verification

Ran the config-level regression coverage locally with the node test runner against serve-exported-web-env.test.mjs and its sibling serve-exported-web-control.test.mjs: every case passed with zero failures, covering replace-or-append behaviour for all four flag keys plus absence passthrough when no flag is set. Confirmed the ancestor commit is reachable from current origin/main via git merge-base ancestry. Per the batch gate on WI-2593 (technical redaction not yet effective), no seeded Playwright web run was executed and no credential-bearing report, trace, screenshot, video, or test-results artifact was generated; verification stayed at the config and helper-test level, which the item's own AC-4 sanctions.

## Caveats / Follow-ups

later-phases remains deliberately outside CI invocation (README-documented manual runs only), so V2 web-journey execution for j29, j31, and j32 becomes exercisable once WI-2593's redaction control is effective; historical artifact deletion and credential rotation remain out of scope per AC-5.
