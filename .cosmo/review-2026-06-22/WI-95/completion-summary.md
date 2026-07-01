**What was done:**
Verified the already-shipped GitHub workflow hardening for WI-95.

**What changed:**
No code changed in this review pass. The shipped fixes are PR #1121 / commit a69c6417b and PR #1165 / commit 579091309, which added trusted author_association checks and removed the unsafe issues:assigned trigger path.

**Verification:**
Workflow inspection confirmed `.github/workflows/claude.yml` gates @claude issue/comment/review branches on OWNER, MEMBER, or COLLABORATOR author_association, omits the assigned trigger, and keeps workflow-level `permissions: {}`. `pnpm run check:github-workflow-security` passed. `pnpm exec jest --config scripts/jest.config.cjs check-github-workflow-security.test.ts --runInBand` passed: 1 test suite passed, 41 tests passed, including the @claude author_association and issues:assigned regression cases.

**Caveats / Follow-ups:**
The Cosmo item was still at Stage=Ready despite the fix already being shipped, so this supervised lifecycle pass is recording verification evidence and moving it to review for closure.
