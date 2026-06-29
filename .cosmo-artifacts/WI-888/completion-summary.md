**What was done:** Fixed WI-888 in the editable `zdx-marketplace` source checkout, not the installed plugin cache.

**What changed:** The Cosmo review DoD parser now accepts markdown lifecycle section headings without trailing colons, and the Cosmo QA claim extractor now scopes summary-derived claims to the latest Completion Summary so older page prose does not become stale commit, file, or test evidence. Updated `plugins/cosmo/skills/review/dod.ts`, `plugins/cosmo/skills/review/dod.test.ts`, `plugins/cosmo/skills/qa/claims.ts`, and `plugins/cosmo/skills/qa/claims.test.ts`. Bumped Cosmo plugin metadata to version 0.6.2 in `.claude-plugin/marketplace.json`, `plugins/cosmo/.claude-plugin/plugin.json`, and `plugins/cosmo/.codex-plugin/plugin.json`.

**Verification:** Red-focused regression run failed before the implementation on the new WI-888 parser and QA tests. After the fix, `C:\Tools\bun\bun.exe test plugins/cosmo/skills/review/dod.test.ts plugins/cosmo/skills/qa/claims.test.ts` passed. Broader Cosmo verification with `C:\Tools\bun\bun.exe test plugins/cosmo` passed. `claude plugin validate plugins/cosmo` passed.

**Caveats / Follow-ups:** Marketplace `main` has an unrelated untracked `.codex-marketplace-install.json` outside the WI-888 worktree; it was not touched.
