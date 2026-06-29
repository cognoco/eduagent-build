# WI-706: Docs-only PR bypass for required CI checks

## Root cause

The `main` job in `.github/workflows/ci.yml` runs for ALL pull requests (no
`paths-ignore` on `pull_request`), which means docs-only PRs get the full heavy
CI suite: postgres service startup, `pnpm install`, `drizzle-kit migrate`, all
lint/test/typecheck steps. The comment at `ci.yml:13-17` documents the intent
("docs-only PR pays only the fixed job overhead, not the test suite") but the
actual bypass mechanism is missing.

Gap: there is no `docs_only` output from the change-class router, so the CI has
no machine-readable signal to gate heavy steps on.

If someone ever adds `paths-ignore` to the `pull_request:` trigger to reduce
this overhead, the required `main` context would immediately stop reporting for
docs-only PRs ("Waiting for status to be reported"). The ci.yml comment was
written to prevent that, but leaves the oversight cost in place.

## Which required contexts would go missing on a docs-only diff

If `paths-ignore` is added to `pull_request:` in ci.yml:
- **`main`** (ci.yml `main` job, job key with no `name:` field) — GOES MISSING

Currently reported regardless (no paths filter on pull_request), but fragile.

The other three required checks are independently resilient:
- **`Playwright web smoke`** (`smoke` job, `if: always()`) — always reported
- **`API Quality Gate`** (`api-quality-gate` job, no paths filter) — always reported
- **`Merge completeness check`** (`merge-invariant` job, PRs to main) — always reported

## Fix design

### `scripts/check-change-class.sh`

Add `docs_only` output to `emit_github_output()`:

```bash
# Docs-only: true iff ALL changed files are documentation/meta-only.
# Pattern mirrors the push: paths-ignore in ci.yml:
#   **.md, docs/**, _wip/**, .claude/**, .vscode/**, .idea/**
# Conservative: if BASE_UNRESOLVED (fail-open) → docs_only=false.
local docs_only_val=true
local f
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  case "$f" in
    *.md|docs/*|_wip/*|.claude/*|.vscode/*|.idea/*) ;;
    *) docs_only_val=false; break ;;
  esac
done <<< "$FILES"
echo "docs_only=${docs_only_val}" >> "$out"
```

For the fail-open (`BASE_UNRESOLVED`) branch, emit `docs_only=false` to ensure
full CI runs when the diff base can't be resolved.

### `.github/workflows/ci.yml`

Add ONE new step immediately after "Fetch base branch" (step 2):

```yaml
      # Docs-only PR scope detection — runs before pnpm install so the
      # bypass is decided before any expensive work starts. Outputs
      # steps.scope.outputs.docs_only = true|false via GITHUB_OUTPUT.
      # All heavy steps below are guarded by this output: for docs-only
      # PRs they are skipped, the job exits 0, and the required `main`
      # check is satisfied without postgres/pnpm/migrations/tests.
      - name: Detect scope (docs-only PR bypass)
        id: scope
        if: github.event_name == 'pull_request'
        env:
          BASE_REF: ${{ github.base_ref }}
        run: bash scripts/check-change-class.sh --branch --github-output
```

Then add `if:` guards to all heavy steps. The condition for a step that
currently has NO `if:`:

```
if: steps.scope.outputs.docs_only != 'true'
```

Why this works for all event types:
- **push to main**: `scope` step doesn't run (it's PR-only) → `steps.scope.outputs.docs_only` is
  empty → `'' != 'true'` = `true` → step runs ✓
- **code PR**: scope runs, `docs_only=false` → `'false' != 'true'` = `true` → step runs ✓
- **docs-only PR**: scope runs, `docs_only=true` → `'true' != 'true'` = `false` → step skipped ✓

For steps that already have `if: github.event_name == 'pull_request'`, the
condition becomes:

```
if: github.event_name == 'pull_request' && steps.scope.outputs.docs_only != 'true'
```

### Steps receiving new guards

Steps that currently have NO `if:` (add `if: steps.scope.outputs.docs_only != 'true'`):
- dorny/paths-filter (changes)
- pnpm/action-setup
- actions/setup-node
- pnpm install --frozen-lockfile
- Cache Nx local cache
- Enable pgvector extension
- Apply database migrations
- Clean stale TypeScript build artifacts
- pnpm audit (High+, advisory)
- Verify postinstall safety
- Root package.json — no mobile-only deps
- i18n orphan-key check
- i18n hardcoded-JSX-literal check
- i18n keep-list rot check
- i18n staleness check
- Prompt marker-token check
- No-clinical-copy ratchet (G11)
- No-Gemini-runtime ratchet (Phase A)
- Test-only-exports ratchet (G11)
- GitHub workflow supply-chain check
- scripts/* tests
- sync-skills orphan check (advisory)
- apps/api/scripts node:test guards (KV-binding verifier)
- packages/database/scripts node:test guards (db:push guard)
- Quarantine registry valid (WI-536)

Steps that already have `if: github.event_name == 'pull_request'` (extend with `&&`):
- GC1 — no new internal jest.mock
- Migration immutability guard (BUG-886)
- Change-class router (WI-452)
- Lint, test, typecheck, build (PR — affected only)

Steps UNCHANGED:
- checkout (must always run)
- Fetch base branch (PR-only, must run for scope detection)
- Detect scope (new step — must always run)
- Lint, test, typecheck, build (push — all): already `if: github.event_name == 'push'`
- API integration tests: condition on `steps.change-class.outputs.integration` — skipped
  naturally when change-class router is skipped (empty output → false)
- API co-located integration tests: same
- API unit tests (cross-package en.json): same
- Validate AGENTS.md counts: `if: always()` — keep running

## Docs-only path globs

```
*.md         (any markdown at any depth, e.g. README.md, docs/arch.md)
docs/*       (anything in docs/ at any depth — bash case * matches /)
_wip/*       (anything in _wip/ at any depth)
.claude/*    (anything in .claude/ at any depth)
.vscode/*    (anything in .vscode/ at any depth)
.idea/*      (anything in .idea/ at any depth)
```

These mirror the `push: paths-ignore` in ci.yml (which uses `**.md`, `docs/**`,
`.vscode/**`, `.idea/**`, `.claude/**`) plus `_wip/**` (which is NOT in the push
paths-ignore — it triggers push CI, but for PRs it is docs-only).

## Acceptance checks

1. `bash scripts/check-change-class.sh --branch --github-output` (from a
   docs-only branch) emits `docs_only=true`.

2. `bash scripts/check-change-class.sh --branch --github-output` (from a
   branch with code changes) emits `docs_only=false`.

3. The YAML is syntactically valid (`yamllint` or careful visual inspection —
   indentation, `if:` placement, `id: scope` reference).

4. The `scope` step (new) only runs on `pull_request` events; push events skip it
   cleanly and heavy steps run normally (`steps.scope.outputs.docs_only` is empty
   → `!= 'true'` evaluates true).

5. All four required checks are reported for both code PRs and docs-only PRs:
   - `main`: the `main` job always runs (no job-level `if:`); it exits 0 whether
     docs-only (heavy steps skipped) or code PR (all steps run).
   - Others: not affected by this change.

## What cannot be verified locally vs at PR time

**Verifiable locally**:
- `scripts/check-change-class.sh --branch --github-output` output correctness
- YAML syntax (visual inspection or yamllint)
- change-class script correctness for docs-only diffs

**Only verifiable at real PR time**:
- That the required `main` status check IS reported (only GitHub Actions can
  create check runs)
- That branch protection sees the check as "success" and allows merge
- That the postgres service starts but is correctly idle for docs-only PRs
  (no connection attempts to 5432)

## Files changed

1. `scripts/check-change-class.sh` — add `docs_only` to `emit_github_output`
2. `.github/workflows/ci.yml` — add `scope` step + guards on heavy steps
