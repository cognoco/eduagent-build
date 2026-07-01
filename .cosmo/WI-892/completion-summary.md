## Completion Summary

**What was done:** Fixed the Cosmo lifecycle deadlock where appended historical completion summaries could keep stale QA claims alive after a later re-finalize.

**What changed:** Added `plugins/cosmo/lib/completion-summary.ts` so downstream readers can focus on the latest completion summary, then updated `plugins/cosmo/skills/qa/claims.ts` and `plugins/cosmo/skills/review/dod.ts` to use it. Added regression coverage in `plugins/cosmo/skills/qa/claims.test.ts` and `plugins/cosmo/skills/review/dod.test.ts`. Bumped the Cosmo plugin manifests for the marketplace package.

**Verification:** Ran `bun test plugins/cosmo/skills/qa/claims.test.ts plugins/cosmo/skills/review/dod.test.ts`, `bun test plugins/cosmo`, `claude plugin validate plugins/cosmo`, `claude plugin validate .`, `git diff --check`, and a focused secret-pattern scan; all completed successfully.

**Caveats / Follow-ups:** No pull request was opened per batch rules. The unrelated marketplace root `.codex-marketplace-install.json` file was left untracked and unstaged.
