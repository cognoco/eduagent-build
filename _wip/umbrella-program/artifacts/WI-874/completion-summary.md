# Completion Summary — WI-874 ([ACCOUNT-06/09/10/11] Complete account settings provider and native branch coverage)

What was done:
Added deterministic jest coverage (or documented a genuine external boundary) for the four account-settings "pass-with-issues" rows that were previously source-checked only, and updated the master flow plan (`docs/flows/plans/flow-revision-plan-2026-06-17.md`) rows to cite the new coverage. Delivered via PR #1311, squash-merged to `main`.

What changed:
- ACCOUNT-06 (avatar/media): NEW `apps/mobile/src/components/account/AccountAvatar.test.tsx` covering the render branch — `avatarUrl` present → `<Image>` with the profile uri; `avatarUrl` null → initials fallback ("AB"); empty name → "?" placeholder; long name → first-two-word initials ("MJ"); `activeProfile === null` → renders null; press → routes to `/(app)/account`. Investigation confirmed there is no avatar-upload/image-picker UI anywhere in the account flow (profiles use initials only), so this render path is the only "media" branch.
- ACCOUNT-10 (export regional/provider): extended `apps/mobile/src/app/(app)/more/privacy.test.tsx` with the `Platform.OS === 'web'` Blob/anchor download branch (asserts `mentomate-data-export.json` filename, `createObjectURL`/`revokeObjectURL`, anchor `click()`, no fall-through to native Share) plus the `if (!doc) return` no-document web guard. Cleanup restores `Platform.OS`, `document`, and `globalThis.URL` symmetrically.
- ACCOUNT-09 (age/security boundary): no new test needed — boundary logic is already deterministically covered (`packages/schemas/src/age.test.ts` at ages 12/13/17/18/19 + null birthYear; `apps/mobile/src/lib/navigation-contract.test.ts` `showAccountSecurity`/`showAddChild` gates incl. #807 null-birthYear regression; `more/account.test.tsx` owner/non-owner security wiring). Flow-plan Note updated from "source-checked" to cite these suites.
- ACCOUNT-11 (delete confirmation/provider): no new client test — the confirmation state machine is fully covered in `apps/mobile/src/app/delete-account.test.tsx`. The deletion-confirmation email (server-side Inngest/email provider) is a true external boundary documented as blocked.
- Files: `apps/mobile/src/components/account/AccountAvatar.test.tsx` (new), `apps/mobile/src/app/(app)/more/privacy.test.tsx`, `docs/flows/plans/flow-revision-plan-2026-06-17.md`, `_plan-WI-874.md` (+314/-5). No production code changed.

Verification:
- AccountAvatar.test.tsx: 6/6 tests pass. privacy.test.tsx: 16/16 tests pass (incl. 2 new web-branch tests).
- Mobile `tsc --noEmit`: clean. `eslint` on touched files: clean. `check:i18n:orphans` + i18n staleness: no findings. No new internal `jest.mock()` (GC1 clean) — new test uses only bare-specifier boundary mocks (`react-i18next`, `expo-router`).
- PR #1311 strict-green confirmed via per-run-ID queries (3 consecutive stable reads): all required checks SUCCESS — CI ("main"), API Quality Gate, Merge completeness check, E2E Web ("Playwright web smoke"). claude-review verdict: APPROVED, review green, 0 must-fix, 0 should-fix.
- Squash-merged to main as commit 070b4c54d051f080b2a0dbbc70bcfb19b7e245bd (2026-06-20).

Caveats / Follow-ups:
- The non-required `Flag-ON integration (IDENTITY_V2_ENABLED)` lane fails on this PR — but it fails identically on the pre-rebase commits and is an API identity-v2 integration suite that a test-only mobile diff cannot affect (pre-existing, allowed-red; UNSTABLE merge state was solely due to it).
- Branch was rebased onto latest `main` to incorporate the parallel WI-875 (accommodation picker/badge coverage), which had edited the same flow-plan file; the ACCOUNT-08 (WI-875) row and ACCOUNT-09/10/11 (WI-874) rows were merged so both coexist.
- claude-review raised 2 CONSIDER (non-blocking): `_plan-WI-874.md` at repo root (the executor protocol mandates `_plan-WI-NN.md` in the worktree; safe to delete post-merge as a session artifact) and a two-line import merge in AccountAvatar.test.tsx (cosmetic). Neither addressed as they are not blockers.
