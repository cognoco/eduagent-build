# Do the four local pre-push harness failures share a cause?

**WI-3066 (pre-push harness shared-cause spike) determination.** Analysis only — no fixes
were executed and none of the four items was modified.

The four items under examination, by ID and name, since every later reference is by ID
alone:

| ID | Name |
|---|---|
| **WI-1791** | Local pre-push jest failures: `jest.spyOn(global,'fetch')` in four api suites |
| **WI-1862** | Local pre-push jest harness: gemini `clearTimeout` under fake timers + inngest worker-env 500 |
| **WI-2806** | env-sync writes `DOPPLER_CONFIG=stg` into `.env.development.local`, breaking the test DB loader |
| **WI-3065** | Provide a disposable local Postgres on dev hosts for the database suites |

Also referenced: **WI-3058** (pre-push threshold fallback flips test-selection kind —
merged `22c1909`), **WI-2887** (staging `DATABASE_URL` privilege finding, operator-held),
and **WI-2232** / **WI-1556** (BID-50's items parked behind the pre-push blocker).

- **Author:** `shepherd:claude:bid-58-ci-infra` (BID-58, CI and dev-infra integrity)
- **Date:** 2026-08-05
- **Host class exercised:** Lancre — Linux, Node v22.23.2 (the repo's required major), pnpm 10.19.0
- **Repo state:** `origin/main` at the time of measurement, worktree cut from `b0c34714d`

## Answer in one paragraph

The four do **not** share one cause. They are **three** causes, and one of the four is
misattributed. WI-1791 (fetch-spy suite failures) and WI-1862 (gemini fake-timers +
inngest worker-env) share a single cause — **host Node major** — and collapse into one
fix. WI-2806 (env-sync stamps a stg config) is a separate cause, **config provenance**,
and its close is valid for the surface it was scoped to. WI-3065 (disposable local
Postgres) is filed as *missing infrastructure*,
but on this host that claim **cannot currently be true or false**, because the provenance
guard from WI-2806's residual refuses before any database connection is ever attempted.
WI-3065 is therefore **not independent** — it is sequenced behind that residual, and
scheduling it first would buy infrastructure to satisfy a check that never runs.

## Status check, before anything else

The spike's framing is "before any of them is scheduled". That premise is now partly
overtaken and the PgM should know it first:

| Item | Stage | Resolution | Resolved |
|---|---|---|---|
| WI-1791 | **Closed** | Done | 2026-07-11 |
| WI-1862 | **Closed** | Done | 2026-07-18 |
| WI-2806 | **Closed** | Done | 2026-08-01 |
| WI-3065 | Captured | — | — |

Only WI-3065 is schedulable. For the other three the live question is not "when do we
schedule this" but "did the close hold" — which is what the mechanisms below establish.

## Mechanism per item, as measured

### WI-1791 and WI-1862 — one cause: host Node major

Both were recorded on **Ramtop (macOS)**; WI-1862 names **Node 26** explicitly. The
candidate to test was whether the host's Node major, rather than repo code, is the
differentiator. It is cheap to test: run the exact named suites on a host at the repo's
required Node 22.

All six suites named across the two items **pass** on Lancre (Node v22.23.2), run
individually through the api Jest config:

| Suite | Named by | Result on Node 22 |
|---|---|---|
| `apps/api/src/services/llm/providers/anthropic.test.ts` | WI-1791 (fetch spy) | 26 passed, 26 total |
| `apps/api/src/services/llm/providers/gemini.test.ts` | WI-1791 + WI-1862 (fetch spy, clearTimeout under fake timers) | 38 passed, 38 total |
| `apps/api/src/middleware/jwt.test.ts` | WI-1791 | 47 passed, 47 total |
| `apps/api/src/middleware/auth.maxage.test.ts` | WI-1791 (fetch spy) | 2 passed, 2 total |
| `apps/api/src/routes/inngest.test.ts` | WI-1862 (worker-env 500) | 6 passed, 6 total |

Independent corroboration, and it is strong: WI-1862's own fix commit `24dfc0807` is
titled *"quarantine two Node-26-only pre-push jest false positives"*. The repo already
classified these as Node-26-only. This spike's contribution is the positive control — the
same suites on Node 22, unquarantined, pass — which converts "suspected Node-env" into
measured.

**Classification: shared cause, host environment, not repo code.** Neither is a defect in
the suites. The `gemini.test.ts` case is the crisp one: WI-1791 blames a fetch-spy
incompatibility and WI-1862 blames `clearTimeout` under fake timers in the *same file*,
and both disappear together when the Node major changes. Two symptoms, one cause.

### WI-2806 — separate cause: config provenance. Close is valid; a residual remains.

`packages/test-utils/src/lib/load-database-env.ts` resolves a database for tests in this
order: use `process.env.DATABASE_URL` if already set; otherwise read
`.env.<env>.local`, and if that file supplies a `DATABASE_URL`, read its
`DOPPLER_CONFIG` / `DOPPLER_ENVIRONMENT` provenance markers and pass them to
`assertLocalDopplerSource`, which refuses anything not a local dev config.

**The generator still stamps `stg`, today.** The `.env.development.local` in a worktree
created by `scripts/setup-worktree.sh` on 2026-08-04 at 20:53, cut from a tree that
already contained WI-2806's fix, carries:

```
DOPPLER_CONFIG="stg"
DOPPLER_ENVIRONMENT="stg"
```

That is not a regression, and WI-2806 should not be reopened on this evidence alone.
Its fix commit `74fd106` touched `apps/api/jest.config.cjs`,
`apps/api/jest.integration.config.cjs`, `scripts/api-integration-routing.test.ts`,
`tests/integration/api-database-env-setup.ts` and `tests/integration/api-setup.ts` — it
took the *decouple the api suites from the marker* route, **not** the *stamp dev markers*
route. Measured against its own stated blast radius, it worked: the five api suites above
all pass on this host **with the `stg` markers present**, so the "357 API suites refused"
symptom does not reproduce.

**The residual is real and is not tracked anywhere.** `packages/database/jest.setup.ts`
still calls `loadDatabaseEnv`, so every suite in that package still hits
`assertLocalDopplerSource` and is refused. Measured: **36 suites failed, 0 tests
executed** — the failure occurs during setup, before any test body runs.

### WI-3065 — misattributed. Not independent; sequenced behind the residual above.

WI-3065 is filed as *no local Postgres for the `packages/database` suites*. On this host
that diagnosis is **unproven and currently unprovable**: the refusal above happens at
config-resolution time and no connection is ever attempted. Whether a local Postgres is
needed cannot be observed until the provenance refusal is cleared.

This matters because the same guard line is what the original SS-1 write-up quoted as
evidence that those suites "require a live Postgres". The quoted refusal
(`load-database-env.ts:63`) is the *provenance* refusal, not a connection failure. The
conflation is easy to make and I made it myself in WI-3058's completion evidence — see
Correction below.

## Groups, and what that implies for scheduling

| Group | Items | Cause | Collapses? |
|---|---|---|---|
| A | WI-1791, WI-1862 | Host Node major (Node 26 vs required 22) | **Yes — one fix** |
| B | WI-2806 | Config provenance: generator stamps `stg` | Independent cause |
| C | WI-3065 | Filed as missing infrastructure; undiagnosable until B's residual clears | **Sequenced behind B, not independent** |

**Recommendation to the PgM:**

1. **Group A needs no repo fix — it needs Node 22 on the affected host.** The remedy is
   already proven on a second host class: Lancre runs a user-level Node 22 via mise, and
   the six suites pass there. Provisioning Node 22 on Ramtop should retire both items'
   symptoms together and make WI-1862's quarantine removable. Worth confirming the
   quarantine is removed rather than left permanent, or the repo keeps carrying a
   suppression for a host condition that no longer exists.
2. **Open a new item for the WI-2806 residual** — `packages/database` suites remain
   refused by the provenance guard, which is outside the closed item's scope and is
   tracked nowhere today. Do not reopen WI-2806; its close was honest for what it covered.
3. **Do not schedule WI-3065 until that residual is resolved.** Once the guard stops
   refusing, WI-3065's premise becomes testable for the first time, and it may shrink or
   evaporate. Buying local-Postgres provisioning now would be buying infrastructure for a
   check that never executes.
4. **Reduced urgency, for sizing:** WI-3058 (pre-push threshold fallback flips test-selection kind) landed on 2026-08-04 (`22c1909`), so the
   `>100`-file fallback no longer selects `@eduagent/database` at all. The *accidental*
   route into these suites is closed, which is what WI-3065's own description predicted
   would happen. What remains is the genuine case — someone really changes database
   source — which is rarer.

## Safety flag — do not adopt WI-2806's recorded workaround as the fix

WI-2806 records a per-worktree workaround of flipping both markers to `dev`, and offers
"make the env generation stamp dev markers" as a fix direction. **Both make the guard
accept a credential whose provenance is genuinely staging** rather than making the
provenance correct. The guard exists precisely to stop tests running against shared
staging, and this is adjacent to WI-2887 (staging `DATABASE_URL` privilege findings,
operator-held, no-rotation-until-MVP). The correct fix is for the generator to supply a
genuinely local/dev config, or for the loader to resolve the Doppler config
independently of a self-declared stamp — not to relabel a staging credential. Flagging
only; this spike executes nothing.

## The shared symptom the item cares about: SKIP_PRE_PUSH as routine bypass

**This cannot be quantified cheaply, and per the spike's own bound I am saying so rather
than expanding scope.** The reason is structural: the bypass emits a single audit line to
the terminal and stderr at push time and is **never persisted** — not to a file, not to
the commit, not to the remote. There is no retrievable event to count.

The obvious proxies do not work. Of 50 commits on `main` since 2026-05-07, 6 mention
`SKIP_PRE_PUSH` and essentially all mention `no-verify` — but inspection shows these are
overwhelmingly documentation and roadmap commits *quoting the doctrine*, not records of a
bypass being used. A message-text grep measures how often the repo discusses bypassing,
which is close to the opposite of what the item asks.

What can be said on the evidence that exists, without inventing a number: three of the
four items each record a bypass as their *standing workaround*, and WI-1791 records that
every api-touching push from the affected host required a bypass ruling. That is
qualitative and it is enough to support the item's concern — a gate that fails often
enough to be routinely turned off supplies no assurance — but it does not support a rate.

**If a rate is genuinely wanted, it needs a mechanism, not an analysis:** have the bypass
branch append to a tracked audit file, or emit a Cosmo finding occurrence, so the next
question of this kind is answerable from data. That is a separate item and I have not
opened one.

## Correction to WI-3058's completion evidence

WI-3058 (pre-push threshold fallback flips test-selection kind; merged `22c1909`, currently in Reviewing) states in its completion summary and PR
that the `packages/database` suites "require a live Postgres", citing that all 36 fail
inside `jest.setup.ts` as proof. The failure is real and the citation is accurate, but the
**mechanism is misattributed**: those suites fail at the WI-2806 provenance refusal, not
at a connection attempt. The distinction does not affect WI-3058's fix or its acceptance
criteria — the excluded suites do demand host state the machine cannot satisfy either way,
and excluding them from the fallback is correct regardless of which of the two blocks
first. It does affect the *explanation*. Raised here, and reported to the orchestrator,
rather than quietly amended, so the reviewer sees it with the item still open.

## Bound of this determination

One host class was exercised: Linux with Node 22. The macOS/Node-26 side is inferred from
the items' own records plus the positive control here, not re-measured on Ramtop — I do
not have that host. The Group A conclusion would be strengthened by running the same six
suites on Ramtop before and after a Node 22 provisioning; that is the one cheap check I
could not perform.
