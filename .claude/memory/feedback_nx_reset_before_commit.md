---
name: NX cache causes phantom lint failures
description: NX module boundaries eslint rule uses a cached project graph — stale cache triggers false "lazy-loaded library" errors on commit. Run `pnpm exec nx reset` to clear.
type: feedback
originSessionId: 9bdb1ed7-5f67-4a1f-b7a2-263760df9489
---
When `@nx/enforce-module-boundaries` reports "Static imports of lazy-loaded libraries are forbidden" but the file on disk has no dynamic imports, the NX project graph cache is stale.

**Why:** The NX eslint plugin caches its analysis of which libraries are lazy-loaded. If a file previously used `import('@eduagent/schemas').Type` (dynamic type import) and was later fixed to use a static `import type { Type }`, the cache still thinks the library is lazy-loaded.

**How to apply:** Before committing when you see phantom NX boundary errors:
1. Run `pnpm exec nx reset` to clear the daemon + cache
2. Then `git add -A && git commit`

Also: lint-staged's stash/restore cycle can revert fixes made between commit attempts. Always verify fixes are intact after a failed commit before retrying.
