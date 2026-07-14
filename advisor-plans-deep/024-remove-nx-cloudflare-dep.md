# Plan 024: Remove the unused `@naxodev/nx-cloudflare` dependency (and the Next.js tree it drags in)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans-deep/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 8c049b93f..HEAD -- package.json nx.json apps/api/project.json`
> If any in-scope file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat it
> as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (code) / **MED** (docs — see the reconciliation tail in Step 4)
- **Depends on**: none
- **Category**: dependencies
- **Planned at**: commit `8c049b93f`, 2026-07-13
- **Audit finding**: #9

## Why this matters

`@naxodev/nx-cloudflare` is declared in the root `package.json` and **used by
nothing**. It is not in `nx.json`'s plugin list, no `project.json` target invokes
its executors, and no workflow references it. The API deploys via plain `wrangler`
through `nx:run-commands`.

It is not free. It pulls in **`next@14.2.35`** — the entire Next.js dependency tree
— into a monorepo with no Next.js app, and that tree accounts for **5 of the repo's
30 high-severity advisories**. Removing one unused devDependency line therefore
retires a sixth of the repo's high advisories and a large slice of install
footprint, with zero code change.

**Read this before you assume the audit is wrong:** a prior dependency audit
(`docs/audit/2026-07-08-wi-1181-dependency-lockfile-hygiene.md`) lists this package
as *"Direct root dev dependency; **retained**."* That is **not** a decision to keep
it after evaluating whether it is used. WI-1181's scope was **lockfile hygiene** —
separating orphaned lockfile cruft from live declared dependencies. It classified
`@naxodev/nx-cloudflare` as a genuine declared direct dependency (therefore not
lockfile cruft to be pruned) and moved on. It never asked "does anything import or
invoke this?" That question is what this plan answers, and the answer is no.

The sharper problem is that **the docs disagree with the code**. `architecture.md`
states that `project.json` targets use `@naxodev/nx-cloudflare` executors for
build/deploy. They do not — every target is `nx:run-commands`. So this is not just
a dead dependency; it is a dead dependency the documentation still presents as the
deployment mechanism. Deleting the package without fixing those lines would leave
the docs describing a plugin that is not installed.

## Current state

### The declaration

`package.json:75`:

```json
    "@naxodev/nx-cloudflare": "^5.0.0",
```

### It is in no plugin list

`nx.json` plugins, in full:

```
@nx/js/typescript
@nx/eslint/plugin
@nx/jest/plugin
@nx/expo/plugin
```

No `@naxodev/nx-cloudflare`.

### It backs no target

`apps/api/project.json` — every target's executor:

```
serve:            nx:run-commands
build:            nx:run-commands
deploy:           nx:run-commands
test:integration: nx:run-commands
integration-api:  nx:run-commands
```

Not one `@naxodev/nx-cloudflare:*` executor. The deploy path is plain `wrangler`
wrapped in `nx:run-commands`.

### Every reference in the repo

```
rg -n 'naxodev|nx-cloudflare' --iglob '!pnpm-lock.yaml' .
```

returns exactly this — one declaration and six **documentation** mentions:

```
package.json:75                  "@naxodev/nx-cloudflare": "^5.0.0",
docs/specs/epics.md:313          ARCH-2: … `@naxodev/nx-cloudflare` 6.0.0 for Workers deployment
docs/architecture.md:170         | @naxodev/nx-cloudflare | 5.0.x | `^5.0.0` in root devDependencies…
docs/architecture.md:234         `project.json` targets use `@naxodev/nx-cloudflare` executors for build/deploy, or `nx:run-commands` wrapping `wrangler dev` / `wrangler deploy`.
docs/architecture.md:531         - **API**: Cloudflare Workers via `@naxodev/nx-cloudflare` (fallback: Hono on Railway via Docker)
docs/architecture.md:1663        - Nx 22.2.0 + `@naxodev/nx-cloudflare` 5.0.x — version-compatible, plugin actively maintained
docs/project_context.md:32       | Nx | 22.2.0 | `@naxodev/nx-cloudflare` 5.0.x for Workers deployment. |
docs/audit/2026-07-08-…-hygiene.md   (the WI-1181 rows quoted above)
```

Zero references in source, in `nx.json`, in any `project.json`, in any workflow.

Note `epics.md:313` claims version **6.0.0** while `package.json` pins **^5.0.0** —
the docs are not merely stale, they are internally inconsistent about a package
nobody uses.

### What it costs

`docs/audit/2026-07-08-wi-1181-dependency-lockfile-hygiene.md:21`:

> `next@14.2.35` | Upstream-blocked transitive dependency. |
> `@naxodev/nx-cloudflare@5.0.2` -> `next@14.2.35`. … `pnpm why next` points to the
> Nx Cloudflare plugin chain.

The audit correctly identified Next.js as *upstream-blocked* — you cannot fix
Next's advisories from here. What it did not notice is that the **upstream itself
is optional**. Remove the plugin and the whole chain goes with it.

### Repo conventions

- Secrets are managed through Doppler; deployment is `wrangler`. Nothing here
  touches either.
- CI is the authoritative gate.
- Applied migrations are immutable — irrelevant here, but do not let a lockfile
  change tempt you into any `drizzle-kit` command.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Prove it's unused | `rg -n 'naxodev\|nx-cloudflare' --iglob '!pnpm-lock.yaml' .` | only `package.json:75` + docs |
| Why is it installed | `pnpm why @naxodev/nx-cloudflare` | direct root devDependency only |
| Why is Next installed | `pnpm why next` | chain runs through nx-cloudflare |
| Reinstall | `pnpm install` | lockfile updates, exit 0 |
| Advisory count | `pnpm audit --audit-level=high` | high count drops by ~5 |
| Full graph still resolves | `pnpm exec nx graph --file=/tmp/graph.json` | exit 0 |
| API build | `pnpm exec nx run api:build` | exit 0 |

## Scope

**In scope:**
- `package.json` — remove the `@naxodev/nx-cloudflare` line.
- `pnpm-lock.yaml` — the resulting lockfile change (generated, not hand-edited).
- **The doc lines that claim it is the deploy mechanism** —
  `docs/architecture.md:170, 234, 531, 1663`; `docs/project_context.md:32`;
  `docs/specs/epics.md:313`. These are **in scope by necessity**: removing the
  package while leaving the docs asserting it deploys the API would be worse than
  leaving both alone.

**Out of scope (do NOT touch):**
- The deploy pipeline itself. `wrangler` already does the work; this plan changes
  **nothing** about how the API ships.
- `apps/api/project.json` targets. They are already correct — that is the point.
- The other advisories in `pnpm audit`. The audit established that essentially none
  are production-reachable and they trace to build/dev tooling. This plan removes
  the one slice that is genuinely removable; it does not open a general
  advisory-chasing exercise.
- The `docs/audit/2026-07-08-…` file itself. It is a **historical record** of what
  that audit found. Do not rewrite history; if anything, the new finding supersedes
  it going forward.
- Adding a replacement Cloudflare plugin. YAGNI — `wrangler` works.

## Git workflow

- Branch from `main`: `advisor/024-remove-nx-cloudflare-dep`
- Conventional commits (e.g. `chore(deps): drop unused @naxodev/nx-cloudflare`).
- Do NOT push or open a PR unless explicitly instructed.

## Steps

### Step 1: Prove non-use before removing anything

```
rg -n 'naxodev|nx-cloudflare' --iglob '!pnpm-lock.yaml' .
jq -r '.plugins[]? | if type=="object" then .plugin else . end' nx.json
jq -r '.targets | to_entries[] | "\(.key): \(.value.executor // "inferred")"' apps/api/project.json
rg -rn 'naxodev|cloudflare' .github/workflows/
```

Expected: the package appears **only** in `package.json:75` and in docs. No plugin
entry, no executor, no workflow reference.

**If any `project.json` target or workflow *does* use an `@naxodev/*` executor,
STOP.** The dependency is live and this plan is void.

Record the current advisory count for the before/after claim:

```
pnpm audit --audit-level=high
```

### Step 2: Remove the declaration and reinstall

Delete the line from `package.json`, then:

```
pnpm install
```

This rewrites `pnpm-lock.yaml`. **Do not hand-edit the lockfile** — let the package
manager generate it.

**Verify**:
```
pnpm why @naxodev/nx-cloudflare   # → not found
pnpm why next                      # → not found (or no longer via this chain)
```

If `next` is *still* installed, read the new `pnpm why next` output carefully:
something else depends on it, the "5 high advisories" claim does not hold, and you
should report that before going further.

### Step 3: Prove nothing broke

The dependency is unused, so nothing *should* break — prove it rather than assume it:

```
pnpm exec nx graph --file=/tmp/graph.json   # the project graph still resolves
pnpm exec nx run api:build                  # the API still builds
pnpm exec nx run api:typecheck
pnpm exec nx run api:lint
pnpm exec nx run-many -t typecheck
```

**Verify**: all exit 0.

The `nx graph` check is the important one: if a plugin were silently contributing
inferred targets, its removal would show up there, not in a build.

**Verify the win**:
```
pnpm audit --audit-level=high
```
The high-severity count should drop by ~5 versus the Step-1 baseline. **Record both
numbers in the PR description.** If the count does not drop, the finding's central
claim is wrong — report it; do not quietly ship a null change.

### Step 4: Reconcile the documentation (this is not optional)

The docs currently tell a reader that `@naxodev/nx-cloudflare` deploys the API.
After Step 2 the package does not exist. Fix each line to describe **what the repo
actually does** — deploy via `wrangler` wrapped in `nx:run-commands`:

- `docs/architecture.md:170` — the dependency-table row. Remove it.
- `docs/architecture.md:234` — currently *"`project.json` targets use
  `@naxodev/nx-cloudflare` executors for build/deploy, or `nx:run-commands`
  wrapping `wrangler dev` / `wrangler deploy`."* Only the second half was ever true.
  Rewrite to state the `nx:run-commands` + `wrangler` path as **the** mechanism.
- `docs/architecture.md:531` — *"**API**: Cloudflare Workers via
  `@naxodev/nx-cloudflare`"* → Cloudflare Workers via `wrangler`.
- `docs/architecture.md:1663` — the version-compatibility note. Remove it.
- `docs/project_context.md:32` — the Nx table row. Drop the plugin clause.
- `docs/specs/epics.md:313` — ARCH-2. **This one is a decision record.** Do not
  silently rewrite history: strike the plugin clause and note that the plugin was
  never wired and was removed, rather than pretending ARCH-2 always said `wrangler`.

**Verify**:
```
rg -n 'naxodev|nx-cloudflare' --iglob '!pnpm-lock.yaml' .
```
→ matches **only** in `docs/audit/2026-07-08-…-hygiene.md` (the historical audit
record, deliberately preserved).

### Step 5: Validate

**Verify**, all of:
- `pnpm exec nx run-many -t typecheck` → exit 0
- `pnpm exec nx run-many -t lint` → exit 0
- `pnpm exec nx run api:build` → exit 0
- `pnpm audit --audit-level=high` → high count down ~5 from baseline
- `rg -n 'naxodev' --iglob '!pnpm-lock.yaml' .` → only the historical audit doc

## Test plan

There is no new test to write — removing an unused dependency has no behaviour to
assert. The verification is the build/graph/typecheck sweep in Step 3, plus the
advisory-count delta.

The one thing that genuinely needs a human eye is **deployment**. Nothing in the
code path changes, but the docs claimed otherwise, and a dependency removal that
touches deploy tooling deserves a real check:

- Confirm CI's deploy job still runs green on this branch (or, if deploy only fires
  on `push` to `main`, confirm the job's `wrangler` invocation does not reference
  the plugin — Step 1's workflow grep already proves this).
- Do **not** trigger a production deploy to test this. The workflow grep is
  sufficient evidence.

## Done criteria

ALL must hold:

- [ ] `@naxodev/nx-cloudflare` removed from `package.json`
- [ ] `pnpm-lock.yaml` regenerated by `pnpm install` (not hand-edited)
- [ ] `pnpm why @naxodev/nx-cloudflare` → not found
- [ ] `pnpm why next` → not found, or demonstrably via an unrelated chain (reported)
- [ ] `pnpm exec nx graph` resolves; `api:build`, `api:typecheck`, `api:lint` all exit 0
- [ ] `pnpm exec nx run-many -t typecheck` exits 0
- [ ] High-advisory count dropped versus the Step-1 baseline; **both numbers in the PR description**
- [ ] All six doc lines reconciled to describe the real (`wrangler`) mechanism
- [ ] `rg -n 'naxodev'` (excluding the lockfile) matches only the historical audit doc
- [ ] No change to `apps/api/project.json`, to any workflow, or to the deploy pipeline
- [ ] `advisor-plans-deep/README.md` status row updated

## STOP conditions

Stop and report — do not improvise — if:

- Step 1 finds **any** `project.json` target or workflow using an `@naxodev/*`
  executor. The dependency is live; this plan is void.
- `next` survives the removal via some other chain. The headline benefit
  (5 high advisories) then does not hold, and the change is merely tidy rather than
  valuable — worth reporting before spending more time on it.
- `pnpm install` changes far more of the lockfile than the nx-cloudflare/Next
  subtree. A dependency removal should be a *subtraction*; broad churn means
  something else resolved differently and needs eyes.
- Any build, typecheck, or graph command that passed before now fails. Report the
  failure; do not "fix" it by re-adding the package.
- You find yourself editing the deploy workflow or `project.json`. Out of scope —
  the whole premise is that they never used this plugin.

## Maintenance notes

- **Why WI-1181 is not a contradiction**: that audit's question was *"is this
  lockfile entry orphaned cruft?"* — answer, no, it is a declared direct dependency.
  This plan's question is *"is that declared dependency actually used?"* — answer,
  also no. Both are correct; they are different questions. Worth stating plainly in
  the PR description so a reviewer who remembers WI-1181 does not bounce it.
- **What a reviewer should scrutinize**: the doc changes, not the code change. The
  code change is a deleted line. The risk is leaving `architecture.md` describing a
  deployment mechanism that no longer exists — which is exactly the failure mode
  that produced this finding in the first place.
- **The generalisable lesson**: `architecture.md:234` described the deploy path as
  *"uses plugin executors, **or** `nx:run-commands` wrapping wrangler"*. That "or"
  is where the rot got in — a doc that describes both options never has to be
  wrong, and therefore never gets corrected. Docs should describe what the repo
  **does**, not what it **could** do.
