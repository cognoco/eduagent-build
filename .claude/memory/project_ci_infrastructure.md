---
name: CI infrastructure — NX Cloud, path filters, E2E APK caching
description: CI optimizations merged 2026-04-03. NX Cloud connected, E2E APK caching cuts 20 min, path filters skip irrelevant jobs. Husky pre-commit runs tsc --build.
type: project
---

**CI/CD optimizations (PRs #100, #103, merged 2026-04-03):**

1. **NX Cloud** connected to dedicated project — enables remote caching and task distribution for CI
2. **E2E APK caching** (PR #100) — cache debug APK keyed on mobile source + schemas + lock file. On cache hit, skips prebuild + JS bundle + Gradle (~20 min saved). Maestro starts in ~5 min instead of ~25.
3. **Maestro CLI caching** across runs
4. **Concurrency group** — cancels stale E2E runs on new push
5. **Smart change detection** — classifies changed files by type:
   - Test-only/docs/configs → skip E2E entirely
   - API-only source → skip mobile Maestro
   - Shared packages → trigger both suites
   - Schedule/dispatch → always run everything
6. **Path filters** on CI workflows — skip duplicate quality gate on push-to-main deploys, deduplicate integration tests
7. **Code review workflow** ignores specific paths (avoids noisy reviews on docs/config changes)

**Husky pre-commit (revised 2026-04-03):**
- Runs `tsc --build` (incremental) — catches cross-project type errors for all commit sources
- Claude Code PreToolUse tsc hook removed (redundant with Husky)
- Also runs lint-staged + surgical tests (only tests related to staged files)

**Mailmap** (added 2026-04-03): `.mailmap` file maps different Git identities to canonical commit identity.

**Why:** E2E and native builds were the #1 CI bottleneck. Smart change detection + APK caching cut most runs significantly.

**How to apply:** CI is self-optimizing now. When making CI changes, respect the path filter patterns. When debugging CI, check `check-changes` job output first — it determines which downstream jobs run.
