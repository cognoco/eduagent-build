# CI Troubleshooting

Recurring local/CI failure modes and their fixes. Add a section when a failure
recurs and its fix is non-obvious from the error text.

## Phantom @nx/enforce-module-boundaries errors

**Symptom.** ESLint reports `@nx/enforce-module-boundaries` violations such as
"Static imports of lazy-loaded libraries are forbidden" (or a "lazy-loaded
library" error) on a file that has **no dynamic imports** on disk. The file
looks correct, but lint keeps failing — typically when committing.

**Cause.** The `@nx/enforce-module-boundaries` ESLint rule reads NX's cached
**project graph** to decide which libraries are lazy-loaded. That cache can go
stale: if a file once used a dynamic type import (e.g.
`import('@eduagent/schemas').Type`) and was later fixed to a static
`import type { Type } from '@eduagent/schemas'`, the cached graph can still
classify the library as lazy-loaded and flag the now-static import.

**Fix.** Clear the NX project-graph cache (and stop the daemon), then re-run
lint / retry the commit:

```bash
pnpm exec nx reset
```

After the reset the rule re-derives the project graph from the current source,
and the phantom error disappears.

**Related gotcha.** `lint-staged`'s stash/restore cycle can revert fixes made
between commit attempts. After a failed commit, verify your fixes are still on
disk before retrying.
