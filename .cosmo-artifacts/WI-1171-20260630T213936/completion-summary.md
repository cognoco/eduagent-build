What was done:

Implemented and shipped WI-1171 (Build V2 visibility ceremony and trust affordances). The V2 visibility sharing ceremony now lets a supporter start a link request, lets both parties review and accept the contract, supports supportee-initiated revoke, and explains what is shared, what remains private, and why the visibility exists without introducing proxy semantics.

What changed:

- Added the V2 visibility link creation route at `apps/mobile/src/app/(app)/link/new.tsx`.
- Added the V2 visibility contract review route at `apps/mobile/src/app/(app)/link/[contractId].tsx`.
- Added focused route tests for create, accept, active review, non-party read-only behavior, and revoke URL intent.
- Hid the full-screen link routes from app chrome in `apps/mobile/src/app/(app)/_layout.tsx`.
- Added localized `visibility.link.*` copy in the mobile i18n locale files and refreshed `source-baseline.json`.
- Updated `docs/plans/v2-dossier/07-trigger-flow-logic-map.md` so the trigger-flow dossier reflects the implemented ceremony routes and the remaining upstream-anchor work.
- Addressed PR review feedback: mutation responses now pass through `assertOk`, accept retry uses the narrowed actionable audience, revoke is documented and tested as supportership-edge keyed, the real `formatApiError` runs in link route tests, and both link screens reuse the shared `firstParam` route-param helper.

Verification:

- `pnpm exec jest --runTestsByPath "apps/mobile/src/app/screen-navigation.test.ts" "apps/mobile/src/app/(app)/link/[contractId].test.tsx" "apps/mobile/src/app/(app)/link/new.test.tsx" --runInBand --no-coverage --verbose --forceExit` passed: 3 suites, 88 tests.
- `pnpm exec nx run mobile:typecheck --skip-nx-cache` passed.
- `pnpm check:i18n:jsx-literals` passed.
- `pnpm exec nx run mobile:lint` passed with the repository's existing warning set.
- `git diff --check` passed.
- GitHub PR checks for PR #1746 passed: API Quality Gate, CI main, Flag-ON integration, Claude Code Review, Docs Checks, E2E Web, and Merge completeness check. The `ota-update` job was skipped by workflow rules.
- PR #1746 was squash-merged into `main` at `1e50b0335a3de4999df48415502b51bed805bfbf` on 2026-06-30.

Caveats / Follow-ups:

- The new screens are ready for the ceremony, but the S4 trigger anchors still need upstream wiring into `/link/new` and contract-review deep links; the dossier records that remaining gap.
- Wire the S4 cold-start and approval anchors into the new link creation and contract-review routes.
- Decide whether to handle the final CONSIDER notes in a small cleanup item or leave them for the translation/route-audit pass.
- Claude's final review left only CONSIDER notes: possible translator context for intentionally separate duplicate English copy, and optional extra `link` coverage in the hidden-tab test route array.
