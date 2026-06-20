---
name: old-notion
description: Use when working the EduAgent "Issue Tracker – Open" Notion backlog as a batch shepherd — picking parallelizable bugs, fanning out worktree-isolated fix subagents, acting as the reviewer gate, merging trustworthy-green PRs, and finalizing + moving each bug Open→Resolved in Notion. Trigger on "work the Notion bug list", "next batch of bugs", "shepherd the open issues", "fix some open issues and merge them", or any resume of the standing reviewer-gate loop.
---

# Old Notion — Open-Issue Batch Shepherd ("Shepherd-of-One")

The standing, user-approved workflow for burning down the EduAgent/MentoMate
**"Issue Tracker – Open"** Notion backlog. You are the **coordinator and
reviewer gate**: you select work, fan out isolated fix subagents, verify their
work yourself, merge only on trustworthy-green, and finalize each bug in Notion.

> **Authority & scope.** This loop is pre-approved for **batches of ~5**. The
> subagents commit + push + open PRs **only inside their own user-authorized,
> worktree-isolated flow** — that is the one sanctioned override of "subagents
> never commit / never open PRs." Nothing here authorizes merging without the
> reviewer gate, switching the main tree's branch, or running OTA.

## The loop (one batch)

1. **Select ~5 bugs** from the Open list (see *Selection*).
2. **Fan out** one fix subagent per bug, each in its own git worktree (see
   *Subagent brief*). Send all 5 in a single message so they run in parallel.
3. **Reviewer gate** each returned PR (see *Reviewer gate*).
4. **Merge** each PR the moment it is trustworthy-green (see *Merge*).
5. **Finalize in Notion**: set close fields, then **move Open→Resolved**.
6. **Clean up** the worktree + remote branch.
7. **Report** the batch ledger and **confirm before the next batch**.

## Selection

Pull the current Open list fresh — **do not trust a cached triage JSON**, it
goes stale the moment a batch lands (resolved bugs keep appearing until moved).
Re-query the Open data source, or at minimum exclude every bug you finalized
this session by page ID.

Pick bugs that are:

- **Disjoint** — no two touch the same file/service, so parallel worktrees never
  conflict. Two bugs in the same service area (e.g. two challenge-round bugs, two
  resend-webhook bugs) → take **one** this batch, defer the sibling.
- **API-only** — `apps/api` / `packages`. Skip mobile (i18n, a11y, perf-render),
  CI/deploy YAML, dependency bumps, and sprawling cross-cutting refactors — those
  want a human or a dedicated session, not a fan-out.
- **Bounded** — a clear single-service fix with a writable regression test.
- **Mixed risk is fine** — a couple mechanical + a couple needing care reviews well.

## Subagent brief (template)

Each subagent gets a **fully self-contained** brief — it cannot see this skill or
the conversation. Always include:

- **The bug**: Notion page ID + title + your read of the root cause, and an
  explicit "**Investigate FIRST, don't assume** — if it's already handled or out
  of scope, STOP and report that instead of inventing a fix."
- **Worktree**: from repo root, `bash scripts/setup-worktree.sh <branch>` creates
  `.worktrees/<branch>/` off `origin/main` + `pnpm install` + `pnpm env:sync`.
  `env:sync` mutates `apps/mobile/eas.json` — **leave it UNSTAGED, never commit
  it**. All work happens inside the worktree dir.
- **TDD red→green**: write the regression test FIRST, confirm it FAILS on current
  code, then fix, then confirm GREEN. Co-locate tests (no `__tests__/` folders).
- **Test integrity** (non-negotiable): no weakened assertions; **no `jest.mock`
  of internal code that can run** — mock only true external boundaries (LLM via
  the router/`routeAndCall`, Stripe, Clerk JWKS, push, email, Inngest framework,
  Sentry SDK, the clock). Use a hand-built fake `Database` at the boundary.
- **GC1/GC6**: no NEW relative-path `jest.mock('./…')`/`jest.mock('../…')`; if
  editing a test file carrying internal mocks, convert to `jest.requireActual` +
  targeted overrides **or** record a deferral (file paths + count) in the
  commit/PR body.
- **Validate** from the worktree: `cd apps/api && pnpm exec jest <file>
  --no-coverage`, `pnpm exec tsc -p apps/api/tsconfig.json --noEmit`, `pnpm exec
  eslint <changed files>`. If a prompt changed, `pnpm eval:llm` (Tier 1) and stage
  the regenerated snapshots.
- **Migrations**: next sequential number; any drop/destructive change needs a
  `## Rollback` section in the PR body. Apply to dev DB only — never staging/prod.
- **Commit**: load `.agents/skills/commit/SKILL.md` and follow it. Stage only own
  files. commitlint types: `feat fix docs chore refactor cfg plan zdx` (**NOT
  `test`**); the commit-msg hook also rejects the literal word **"sweep"**. Let
  hooks run. The **only** sanctioned bypass is the Windows `@nx/expo` / `tsc
  --build` cold-cache false-fail → `SKIP_PRE_PUSH=1 git push` **after** confirming
  `nx run api:typecheck` (or direct `tsc`) is green (MMT-ADR-0019). Never bypass a
  real failure.
- **PR**: `gh pr create --base main --head <branch> --title "fix: …" --body "…"`.
  Body = What/Why, Fix, Verification (red→green + typecheck/lint), migration +
  Rollback if any, GC6 deferral if any.
- **Hard stops**: do NOT merge; do NOT touch other worktrees; do NOT switch the
  main tree's branch; do NOT run OTA.
- **Report back**: PR # + URL, branch, commit SHA(s), files changed, the
  red→green test name(s) + how RED-then-GREEN was confirmed, migration (number +
  rollback), validation results, GC6 deferral, reviewer caveats.

Default subagent model = the strong tier (these are real bugfixes needing
reasoning — concurrency, transactions, webhook semantics). Reserve the light tier
only for genuinely mechanical fixes.

## Reviewer gate

Trust the **branch contents, not the agent's claims**. Depth is **risk-triaged**:
deep for billing / auth / security / concurrency / migrations; lean for mechanical
fixes. For each PR:

1. `gh pr diff <n>` — read the actual diff. Check the test is a real red→green
   regression (not a weakened or tautological assertion), the fix targets the root
   cause, ownership/`profileId` scoping is preserved, no internal mocks added, no
   `eas.json` staged, migrations carry Rollback.
2. `gh pr checks <n>` — **required checks** (`main`, `API Quality Gate`, `Merge
   completeness check`) must be **green**. Non-required/flaky and **ignorable**:
   `Flag-ON integration (IDENTITY_V2_ENABLED)`, `claude-review`, `run-smoke`,
   `ota-update`, `CodeRabbit`, `Playwright web smoke`.
   - `main` and `Flag-ON integration` **share one workflow run**. A "Process
     completed with exit code 1" in `gh run view <runId>` may belong to the Flag-ON
     job, not `main`. Confirm the specific job's steps:
     `gh api repos/cognoco/eduagent-build/actions/jobs/<jobId> -q '.steps[] |
     "\(.number) \(.name) => \(.conclusion)"'`.
   - `mergeStateStatus`: CLEAN/UNSTABLE = mergeable (UNSTABLE = a non-required
     check failing); BLOCKED = a required check pending/failing; UNKNOWN = GitHub
     recomputing (re-poll).
3. **claude-review is advisory**: green = it *ran* (findings may still exist — read
   the body); red = it did NOT run (token/timeout/crash or a broken review
   workflow — investigate, never round red up to "approved"). Read findings via
   `gh api repos/cognoco/eduagent-build/issues/<n>/comments -q '.[].body'`. Comments
   accumulate — the **last** is the latest verdict. Fix MUST_FIX / SHOULD_FIX before
   merge.
4. **Environmental flake markers to ignore** in CI logs: `VOYAGE_API_KEY not
   available`, `No provider registered for: openai`, `gemini quota exceeded`,
   `[safe-send] non-core … 401 Event key not found`, `relation "accounts"/"…" does
   not exist` (local dev-DB drift — see `project_dev_schema_drift_trap`).

## Merge

When required-green + claude-review findings cleared:
`gh pr merge <n> --squash`. Capture the squash merge commit SHA.

## Finalize in Notion (then move)

Set the close properties on the bug's page via **REST PATCH** (property shapes
below), then **move** the page to the Resolved data source via the **MCP move
tool** (a REST `parent` PATCH no-ops for cross-data-source moves):

- Property PATCH: `gh api -X PATCH` won't help here — use the Notion REST API /
  `notion-update-page` MCP with:
  - `Status` (status): `{"status":{"name":"Done"}}`
  - `Implementation Status` (select): `{"select":{"name":"Done"}}`
  - `Resolution` (rich_text): `{"rich_text":[{"text":{"content":"…"}}]}`
  - `Fixed In` (rich_text): PR # + squash commit SHA
  - `Resolved` (date): `{"date":{"start":"YYYY-MM-DD"}}`
- Move: MCP `notion-move-pages` with
  `new_parent: {type:"database_id", database_id:"<Resolved DB>"}`. NOTE: the
  Resolved target is a **database_id**, NOT a data_source_id — passing it as
  `data_source_id` fails 400 "Could not load new parent … or missing edit
  permission". Use `type:"database_id"`.

Never mark Done without a verified fix + resolution text. Never reopen a Done
item — file a new linked `Type=Issue` regression instead.

## Clean up

```
git -C <repo root> worktree remove --force .worktrees/<branch>   # or rm -rf if node_modules locks
git -C <repo root> worktree prune
git push origin --delete <branch>
```

Confirm gone in `git worktree list`.

## Key IDs & gotchas

- **Notion targets**: Open data source `3598bce9-1f7c-814d-85cc-000b0d329788`
  (query the Open list here). Resolved **database** `b8ce802f-1126-4a2f-a123-be5f888cbb23`
  (move target; pass as `type:"database_id"` — confirmed-working 2026-06-20).
- **Repo**: `cognoco/eduagent-build`. Required checks for `main`: `main`, `API
  Quality Gate`, `Merge completeness check`.
- **`gh pr edit --body` is broken repo-wide** (Projects-classic GraphQL
  deprecation). Workaround: `gh api -X PATCH repos/cognoco/eduagent-build/pulls/<n>
  --input <payload.json>` with `{"body":"…"}`. `gh pr create --body` works fine.
- **Windows**: `nx` is broken by an upstream `@nx/expo` stack-overflow — run
  jest/tsc/eslint directly. `SKIP_PRE_PUSH=1` is the only sanctioned hook bypass,
  for the documented cold-cache false-fail, after typecheck is green.
- **Secrets**: project secrets via **Doppler**; Notion token via Infisical/estate
  env (already in env — never print it, never write it to a tracked file).

## After the batch

Report the ledger (each bug → PR # → merge SHA → Notion finalized + moved →
worktree cleaned), then **confirm with the user before starting the next batch**.
