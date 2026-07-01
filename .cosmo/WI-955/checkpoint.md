# WI-955 Checkpoint

**Current status:** Worktree `.worktrees\WI-955` was repaired/recreated with Windows Git, `git -C .worktrees\WI-955 status --short --branch` works, and Cosmo fetch passed the repo guard for Project `MentoMate` / repo `cognoco/eduagent-build`. WI-955 is claimed.

**Scope correction:** The transient `apps/mobile/eas.json` change came from `pnpm env:sync` during worktree setup and is unrelated to the MentorInputBar mic-button bug. It has been restored. Current branch is `WI-955`; current status is clean before bug implementation.

**Expected bug scope:** `apps/mobile/src/components/mentor/MentorInputBar.tsx` and `apps/mobile/src/components/mentor/MentorInputBar.test.tsx`.

**Current implementation state:** Scope is corrected. Current worktree diff is only `apps/mobile/src/components/mentor/MentorInputBar.tsx` and `apps/mobile/src/components/mentor/MentorInputBar.test.tsx`. The mic button no longer fabricates a transcript from the typed draft; it is disabled until real STT is wired. The focused test now asserts that typed submit still works and mic press does not call `onTranscript`.

**Verification so far:** Red run: `pnpm exec jest src/components/mentor/MentorInputBar.test.tsx --runInBand --no-coverage` failed because `onTranscript` was called with `"show topic"` / `"continue session-1"`. Green run after fix: same command passed, 3 tests / 1 suite. Targeted lint passed: `pnpm exec eslint apps/mobile/src/components/mentor/MentorInputBar.tsx apps/mobile/src/components/mentor/MentorInputBar.test.tsx`, with the known Nx ProjectGraph cache warning.

**Do not commit/push/complete yet:** Coordinator explicitly asked not to commit, push, or complete in this correction pass.
