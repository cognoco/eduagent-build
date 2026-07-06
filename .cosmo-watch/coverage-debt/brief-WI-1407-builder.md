# WI-1407 Builder Brief

Runtime: Codex executor.
Type: Builder.
Model/effort requested by shepherd dispatch: `gpt-5.5`, `medium`.
Workspace: `C:\Dev\Projects\Products\Apps\eduagent-build\.worktrees\WI-1407`
Claimant: `codex:builder:WI-1407`

Read these first:
- `AGENTS.md`
- `_quartet/roles/executor/executor-protocol.md`
- `_quartet/roles/executor/builder.md`
- `.agents/skills/commit/SKILL.md`
- `.agents/skills/test-driven-development/SKILL.md`
- `.agents/skills/verification-before-completion/SKILL.md`

Hard rails:
- Do not read or write `_quartet/working/lanes/**/_state/*`.
- Do not read or write Clacks channel files (`inbox.jsonl`, `outbox.jsonl`) or monitor manifests.
- If `_state` content is surfaced passively by tooling, ignore it and do not use it.
- Do not merge any PR. Do not self-close the WI.
- Stop and report before any destructive shared-infra step.
- Keep all code work inside `.worktrees/WI-1407`; before every commit, verify `git rev-parse --show-toplevel` is the WI-1407 worktree, not the shared checkout.

Phase 0 claim:
1. Use `/cosmo:execute` mechanics via the local deterministic writer, not hand-edited Notion.
2. Suggested artifact dir: `.workitem-artifacts/WI-1407`.
3. Fetch with `--supervised`, then claim as `codex:builder:WI-1407`.
4. After claiming, directly verify the WI has `Stage=Executing`, `Claimed By=codex:builder:WI-1407`, and non-empty `Claim Expires`. If `Claim Expires` is empty, stop and report.

WI:
- `WI-1407` — Consent/profile gate coverage gaps (save-wizard adult gate + mentor-memory screen-wiring privacy writes)
- Stage at dispatch: Ready.
- Execution Path: Assisted.
- Effort: M.

Refined acceptance criteria:
1. Add a focused `ProfileBasicsStep` component regression test for target `child` or `both` where the parent birth year resolves under 18: Continue remains disabled, `save-basics-adult-required` renders, and pressing Continue does not call `client.profiles.$post`.
2. Add self `MentorMemoryScreen` screen-level tests for `memoryConsentStatus: 'pending'` that press grant and decline and assert `useGrantMemoryConsent().mutateAsync` receives `{ consent: 'granted' }` and `{ consent: 'declined' }` without `childProfileId`.
3. Add self `MentorMemoryScreen` screen-level tests for injection toggle and clear-all: toggling the saved-notes switch calls `useToggleMemoryInjection().mutateAsync` with the new value, and confirming clear-all calls `useDeleteAllMemory().mutateAsync({})`.
4. Add or update a save-wizard Maestro flow for a minor-owner rejection path, but mark the evidence as `verify-at-e2e-run` unless an emulator/dev-client run actually executes it: enter a child/both save target with an under-18 parent birth year, assert `save-basics-adult-required` is visible, and assert the flow does not advance to `save-confirm-land`.
5. Red-green-revert evidence: prove at least one new regression test fails when the protected behavior is reverted locally, either by removing `adultGatePasses` from `ProfileBasicsStep.canSubmit` or disconnecting one mentor-memory screen handler from its mutation; restore the code, rerun the relevant Jest targets, and record failing-then-green evidence. Do not claim Maestro evidence unless the device run actually happened.

Known surface-read from researcher:
- `apps/mobile/src/app/(app)/_components/save-wizard/ProfileBasicsStep.tsx`
- `apps/mobile/src/app/(app)/_components/save-wizard/ProfileBasicsStep.test.tsx`
- `apps/mobile/src/app/(app)/_layout.test.tsx`
- `apps/mobile/src/app/(app)/mentor-memory.tsx`
- `apps/mobile/src/app/(app)/mentor-memory.test.tsx`
- `apps/mobile/src/hooks/use-learner-profile.test.ts`
- `apps/mobile/src/components/memory-consent-prompt.test.tsx`
- `apps/mobile/e2e/flows/onboarding/preview-parent.yaml`
- `apps/mobile/e2e/flows/onboarding/preview-both-child-first.yaml`

Quality bar:
- Follow TDD for the new tests.
- No internal mocks beyond existing test-boundary patterns; respect GC1/GC6.
- Run the relevant targeted Jest suites after changes. At minimum include `ProfileBasicsStep.test.tsx` and `mentor-memory.test.tsx`; include any touched save-wizard route/layout tests if changed.
- Run the repo change-class validation appropriate for touched files before PR.
- If you add Maestro YAML but cannot run it on a device/emulator, state `verify-at-e2e-run` in completion evidence and do not claim it passed.

Deliverable:
- Commit and push your branch using the repo commit skill.
- Open a PR for WI-1407.
- Drive CI and automated review to strict green if possible.
- Once the PR is green, run `/cosmo:execute complete` to move WI-1407 to Reviewing with a parser-clean completion summary and Fixed In. Then report back.
- If blocked, report the blocker and current state. No progress narration.
