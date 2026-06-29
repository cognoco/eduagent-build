WI-943 checkpoint

Current status:
- Local commit exists: fab1e06141129a9647fbc17e99beee51866c0b42 (`fix(mobile): add subject empty state [WI-943]`).
- Completion summary exists: C:\Dev\Projects\Products\Apps\eduagent-build\.cosmo-artifacts\WI-943\completion-summary.md.
- Worktree status before push attempt was clean.

Changed files:
- apps/mobile/src/components/support/PersonScopeStructuralSubjects.tsx
- apps/mobile/src/components/support/PersonScopeStructuralSubjects.test.tsx
- apps/mobile/src/i18n/locales/de.json
- apps/mobile/src/i18n/locales/en.json
- apps/mobile/src/i18n/locales/es.json
- apps/mobile/src/i18n/locales/ja.json
- apps/mobile/src/i18n/locales/nb.json
- apps/mobile/src/i18n/locales/pl.json
- apps/mobile/src/i18n/locales/pt.json

Verification status:
- Focused Jest regression passed: 1 suite, 1 test.
- i18n checks passed: check:i18n, check:i18n:orphans, check:i18n:jsx-literals.
- Mobile lint passed.
- Direct mobile TypeScript check passed.
- git diff --check passed.
- Commit hooks passed.

Exact blocker:
- `git push origin HEAD:WI-943` did not complete before the 10-minute command timeout, and no remote SHA was confirmed in this session.

Commands already run:
- `git commit ...` produced commit fab1e06141129a9647fbc17e99beee51866c0b42.
- `git push origin HEAD:WI-943` timed out.

Next command to run:
- From C:\Dev\Projects\Products\Apps\eduagent-build\.worktrees\WI-943, run `git push origin HEAD:WI-943`, then confirm with `git ls-remote origin refs/heads/WI-943`.

Safe-to-keep:
- Yes. Code changes are committed locally and verified; only the remote push remains.
