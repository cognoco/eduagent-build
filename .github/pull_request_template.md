<!--
  Keep this template short and honest. Every section below is required for
  non-trivial PRs (anything that touches tests, services, or routes). For a
  pure-comment / typo PR, "Verified-By: N/A — comment only" is acceptable.
-->

## Summary

<!-- One paragraph. What changed and why. Link the issue/spec if relevant. -->

## Verified-By

<!--
  REQUIRED for any PR that touches code. List the exact commands you ran
  locally and their outcome. "CI will verify" is not acceptable — CI fails
  fast at the first layer and hides downstream breakage. PR #257 shipped
  with 189 broken mobile tests because the author skipped this step.

  For scoped mobile changes, attach the auto-generated receipt:
    - bash scripts/record-test-receipt.sh mobile
    - .test-receipts/mobile.json committed in this PR (fresh within 24h)

  Examples of acceptable Verified-By entries:
    - bash scripts/record-test-receipt.sh mobile - related mobile Jest tests passed; receipt fresh within 24h
    - pnpm exec nx run api:test       — 229 passed, 0 failed
    - bash scripts/check-change-class.sh --run    — all green
-->

- [ ] `pnpm exec tsc --build` — pass
- [ ] `pnpm lint` — pass on affected projects
- [ ] Tests — list the exact command and result:
    - `<command>` — `<N passed, 0 failed>`
- [ ] If mobile TS/TSX files changed: `.test-receipts/mobile.json` committed in this PR and fresh within 24h

## Failure modes considered

<!--
  For non-trivial features/fixes: what could go wrong, and how does the
  change behave? Cite CLAUDE.md "UX Resilience Rules" and "Fix Development
  Rules" if applicable.

  Examples:
    - Network failure → ErrorFallback with retry + back
    - Quota exhausted → typed QuotaExhaustedError → upsell screen
    - Race during sign-out → identity-scoped query keys prevent cross-account leak
-->

## Sweep audit (if claiming a sweep)

<!--
  If your commit message or PR title claims "swept all sites" / "everywhere"
  / "remaining surfaces", paste the grep query and result list. Commit-msg
  hook already enforces this for commits; this section enforces it for PRs.
-->

## Notes for reviewers

<!-- Optional. Anything that helps the reviewer skip dead-end paths. -->
