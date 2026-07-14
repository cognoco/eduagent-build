# Plan 014: Close the under-18 vendor bypass in the legacy LLM fallback selector

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans-deep/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 8c049b93f..HEAD -- apps/api/src/services/llm/router.ts apps/api/src/config.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `8c049b93f`, 2026-07-13

## Why this matters

Gemini/Vertex are **banned for all under-18 learners** (MMT-ADR-0016 §10.1 /
MMT-ADR-0014). The primary model selector enforces this. **The legacy fallback
selector cannot enforce it, because it never receives the learner's age.**

`getFallbackConfig` — the fallback used when the primary provider fails — takes
no `ageBracket` parameter at all. When an Anthropic or OpenAI primary fails
transiently (or its circuit opens) and Gemini is registered, it returns a Gemini
config unconditionally. For a minor, that is exactly the vendor the ban exists
to prevent, reached on the degraded path, with **no test that would catch it**.

Two facts make this urgent rather than theoretical:

1. **The safe path is not the default.** `LLM_ROUTING_V2_ENABLED` defaults to
   `'false'` in `apps/api/src/config.ts:190`. Production explicitly sets it to
   `true` (so production is safe *today*), but any environment that does not
   explicitly set it — a new preview environment, a local run, a misconfigured
   worker, or an incident rollback — silently takes the age-blind legacy path.
2. **Gemini is registered independently of the flag.** `middleware/llm.ts:114-121`
   registers Gemini whenever `GEMINI_API_KEY` is present, regardless of V2. So
   the safety property currently rests on a single boolean, not on the key's
   absence. (The model register at `docs/registers/llm-models/master.md:127`
   confirms removing the key is a *separate, not-yet-done* defense-in-depth step.)

The same blindness also means a Challenge-Round **grader** call falling back on
the legacy path can be served by an unvetted vendor, since `getFallbackConfig`
keys only on `primary.provider` and never on `capability`.

The fix is small and additive: give the legacy selector the age it needs, and
gate it the same way the primary selector already does.

## Current state

### The file
`apps/api/src/services/llm/router.ts` (~2275 lines) — the only file that needs
a code change.

### The primary selector DOES gate on age — this is your model

`router.ts:862-868` (signature) and `:908-910` (the gate):

```ts
function getModelConfig(
  rung: EscalationRung,
  llmTier: LLMTier = 'standard',
  preferredProvider?: PreferredLlmProvider,
  providerPolicy: LlmProviderPolicy = 'default',
  capability: LlmCapability = 'text',
  ageBracket?: AgeBracket,          // <-- has the age
): ModelConfig {
  ...
  if (isUnder18AgeBracket(ageBracket)) {
    return approvedTextFallbackConfig(rung, llmTier);   // <-- never Gemini
  }
```

Helpers already present and already exported-in-file:

- `router.ts:858-860`:
  ```ts
  function isUnder18AgeBracket(ageBracket?: AgeBracket): boolean {
    return ageBracket === 'child' || ageBracket === 'adolescent';
  }
  ```
- `router.ts:816+` — `approvedTextFallbackConfig(rung, llmTier)` returns only
  approved vendors (cerebras → anthropic → …). It is the function the primary
  path already trusts for minors.
- `router.ts:645`:
  ```ts
  const FALLBACK_FORBIDDEN: ReadonlySet<string> = new Set(['gemini', 'vertex']);
  ```

### The legacy fallback selector does NOT gate on age — this is the bug

`router.ts:1025-1035` — note the **absence** of `ageBracket`:

```ts
function getFallbackConfig(
  primary: ModelConfig,
  rung: EscalationRung,
  providerPolicy: LlmProviderPolicy = 'default',
  llmTier: LLMTier = 'standard',
  capability: LlmCapability = 'text',
): ModelConfig | null {
  if (routingV2Enabled) {
    return getFallbackConfigV2(primary, llmTier, capability);   // <-- V2: safe
  }

  if (providerPolicy === 'gemini_only') {
    return null;
  }
  ...
```

`router.ts:1053-1070` — the legacy branch that hands back Gemini:

```ts
  if (primary.provider === 'anthropic' && providers.has('gemini')) {
    const isLight = rung <= 2;
    return {
      provider: 'gemini',
      model: isLight ? 'gemini-2.5-flash' : 'gemini-2.5-pro',
      maxTokens: MIN_REPLY_MAX_TOKENS,
      ...shared,
    };
  }

  if (primary.provider === 'openai' && providers.has('gemini')) {
    const isLight = rung <= 2;
    return {
      provider: 'gemini',
      model: isLight ? 'gemini-2.5-flash' : 'gemini-2.5-pro',
      maxTokens: MIN_REPLY_MAX_TOKENS,
      ...shared,
    };
  }
```

### The V2 selector is correct — do NOT change it

`getFallbackConfigV2` (`router.ts:1115+`) excludes banned vendors with an
explicit guard at `router.ts:1176` (`if (FALLBACK_FORBIDDEN.has(cfg.provider)) continue;`)
and fails closed (returns `null`, caller raises `CircuitOpenError`). It is
already right. Leave it alone.

### The call sites that must pass the age through

Four production call sites, all currently dropping the age:

- `router.ts:1649` and `router.ts:1689` — inside `routeAndCall`
- `router.ts:2080` and `router.ts:2161` — inside `routeAndStream`

They all look like this (`router.ts:1649-1655`):

```ts
      const fallbackConfig = getFallbackConfig(
        config,
        rung,
        _options?.providerPolicy,
        _options?.llmTier,
        capability,
      );
```

`_options` already carries the age bracket (it is what `getModelConfig` is given
on the primary path in the same functions) — so the value is in scope at every
one of these four sites. Confirm this by reading the `getModelConfig(...)` call
in the same function and using the identical expression.

Plus one test-only helper that should also thread it, so tests can exercise the
gate: `getFallbackConfigForTest` at `router.ts:1188-1204`.

### Repo conventions

- Security fixes require a **red-green-revert break test** (AGENTS.md → "Fix
  Development Rules").
- Tests are co-located. No `__tests__/` folders.
- Mocking the LLM at the `routeAndCall` boundary is an **allowed** external
  mock; do not add internal `jest.mock('./...')` (GC1 ratchet).
- The existing fallback-compliance tests live in
  `apps/api/src/services/llm/router.fallback-compliance.test.ts` — follow their
  structure.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck API | `pnpm exec nx run api:typecheck` | exit 0 |
| Lint API | `pnpm exec nx run api:lint` | exit 0 |
| Router tests | `pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/services/llm --no-coverage` | all pass |
| Gemini-runtime guard | `pnpm exec tsx scripts/check-no-gemini-runtime.ts` | exit 0 |
| LLM eval snapshots | `pnpm eval:llm` | exit 0, no unexpected drift |

`pnpm eval:llm` (Tier 1) is required because this file is under
`apps/api/src/services/llm/` — the repo's prompt/routing eval harness gates it.
This change should produce **zero** snapshot drift; if it produces drift, that
is a signal you changed behavior you did not intend to.

## Scope

**In scope:**
- `apps/api/src/services/llm/router.ts`
- `apps/api/src/services/llm/router.fallback-compliance.test.ts` (break tests)

**Out of scope (do NOT touch):**
- `getFallbackConfigV2` — already correct; it is your reference, not your target.
- The **primary**-path legacy behavior for adults. Adults may still legitimately
  fall back to Gemini on the legacy path. Do **not** globally ban Gemini from the
  legacy selector — that would change adult routing and is a product decision,
  not a bug fix. Gate on **age**, not on vendor-for-everyone.
- `middleware/llm.ts` provider registration. Removing `GEMINI_API_KEY` is a
  separate, register-tracked defense-in-depth step (see
  `docs/registers/llm-models/master.md:127`); it is not this plan.
- The streaming-vs-non-streaming retry asymmetry (`router.ts:1456-1486`) — it is
  deliberate and carries an explicit "do not fix" note.
- The per-isolate circuit breaker — a documented, accepted MVP tradeoff.

## Git workflow

- Branch from `main`: `advisor/014-llm-fallback-age-gate`
- Conventional commits (e.g. `fix(llm): gate legacy fallback on age bracket`).
- Do NOT push or open a PR unless explicitly instructed.

## Steps

### Step 1: Write the break test FIRST, and watch it fail

In `apps/api/src/services/llm/router.fallback-compliance.test.ts`, add a case
that pairs a **minor** with a **legacy-path fallback**:

```ts
it('[WI-XXXX] never falls back to Gemini for an under-18 learner on the legacy path', () => {
  setLlmRoutingV2Enabled(false);          // legacy path — the default!
  // register anthropic + gemini providers (see existing tests in this file)
  const primary = /* an anthropic ModelConfig */;

  const fallback = getFallbackConfigForTest(primary, 3, {
    ageBracket: 'child',                  // <-- the new param
  });

  expect(fallback?.provider).not.toBe('gemini');
  expect(fallback?.provider).not.toBe('vertex');
});
```

Repeat for `ageBracket: 'adolescent'` and for an **openai** primary (both legacy
branches at `router.ts:1053` and `:1062` hand back Gemini).

Note the existing test at `router.fallback-compliance.test.ts:162-173` currently
*asserts the opposite* for the flag-off case — but it does so **without an age**,
which is precisely the blind spot. Do not delete that test; it documents adult
behavior. Your new tests add the age dimension it cannot express today.

**Verify**: these new tests **MUST FAIL** now — they will not even typecheck
until Step 2 adds the parameter. That is expected; a compile error here counts
as "red".

### Step 2: Thread `ageBracket` into `getFallbackConfig` and gate it

Change the signature (`router.ts:1030`) to accept the age as a 6th parameter,
mirroring `getModelConfig`'s ordering:

```ts
function getFallbackConfig(
  primary: ModelConfig,
  rung: EscalationRung,
  providerPolicy: LlmProviderPolicy = 'default',
  llmTier: LLMTier = 'standard',
  capability: LlmCapability = 'text',
  ageBracket?: AgeBracket,
): ModelConfig | null {
  if (routingV2Enabled) {
    return getFallbackConfigV2(primary, llmTier, capability);
  }

  // Under-18 learners may never be served by a FALLBACK_FORBIDDEN vendor
  // (Gemini/Vertex), on the primary path OR the degraded fallback path
  // (MMT-ADR-0016 §10.1). The legacy selector below can hand back Gemini, so
  // gate it here exactly as getModelConfig() gates the primary path.
  if (isUnder18AgeBracket(ageBracket)) {
    return approvedTextFallbackConfig(rung, llmTier);
  }

  if (providerPolicy === 'gemini_only') {
    return null;
  }
  ...
```

Placement matters: **after** the V2 dispatch (V2 is already safe and must keep
its own logic) and **before** every legacy branch, so no legacy branch can be
reached with a minor's context.

**Belt-and-braces**: `approvedTextFallbackConfig` must never return a forbidden
vendor. Assert that rather than assuming it — add to your test:

```ts
expect(FALLBACK_FORBIDDEN.has(approvedTextFallbackConfig(3, 'standard').provider)).toBe(false);
```

If that assertion fails, STOP and report — the primary path's minor gate would
be broken too, which is a much bigger finding.

### Step 3: Pass the age at all four production call sites

At `router.ts:1649`, `:1689`, `:2080`, `:2161`, add the age argument. Use the
**same expression** the sibling `getModelConfig(...)` call in that same function
uses — do not invent a new one:

```ts
      const fallbackConfig = getFallbackConfig(
        config,
        rung,
        _options?.providerPolicy,
        _options?.llmTier,
        capability,
        _options?.ageBracket,     // <-- added
      );
```

Also thread it through the test helper `getFallbackConfigForTest`
(`router.ts:1188-1204`) by adding `ageBracket?: AgeBracket` to its `opts` and
forwarding it — your Step-1 test depends on this.

**Verify**: `pnpm exec nx run api:typecheck` → exit 0.
**Verify**: `grep -c "ageBracket" apps/api/src/services/llm/router.ts` increased
by at least 6 (1 signature + 1 gate + 4 call sites).

### Step 4: Red-green-revert

1. Run the router tests → the new age tests **PASS**.
2. Comment out the `isUnder18AgeBracket` gate you added in Step 2.
3. Re-run → the new age tests **FAIL** (a minor now resolves to Gemini).
4. Restore the gate. Re-run → **PASS**.

State the result of this sequence in the PR description. AGENTS.md requires it
for security-class fixes.

### Step 5: Full validation

**Verify**, all of:
- `pnpm exec nx run api:typecheck` → exit 0
- `pnpm exec nx run api:lint` → exit 0
- `pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/services/llm --no-coverage` → all pass, including the pre-existing adult-fallback test at `router.fallback-compliance.test.ts:162-173` (it must still pass — adults are unaffected)
- `pnpm exec tsx scripts/check-no-gemini-runtime.ts` → exit 0
- `pnpm eval:llm` → exit 0 with **no** snapshot drift

## Test plan

New tests in `apps/api/src/services/llm/router.fallback-compliance.test.ts`:

1. legacy path (`setLlmRoutingV2Enabled(false)`) + `ageBracket: 'child'` + anthropic primary + gemini registered → fallback is **not** gemini/vertex.
2. Same, `ageBracket: 'adolescent'`.
3. Same, **openai** primary (the second legacy Gemini branch).
4. Same, `capability: 'grader'` — a grader-capability fallback for a minor is also not a forbidden vendor.
5. **Adult unchanged**: legacy path + `ageBracket: 'adult'` + anthropic primary → still resolves to gemini (proves you did not over-fix and change adult routing).
6. `approvedTextFallbackConfig` never returns a `FALLBACK_FORBIDDEN` provider.

Follow the existing structure in `router.fallback-compliance.test.ts` (provider
registration helpers, `setLlmRoutingV2Enabled`).

## Done criteria

ALL must hold:

- [ ] `pnpm exec nx run api:typecheck` exits 0
- [ ] `pnpm exec nx run api:lint` exits 0
- [ ] All `apps/api/src/services/llm` tests pass
- [ ] `pnpm exec tsx scripts/check-no-gemini-runtime.ts` exits 0
- [ ] `pnpm eval:llm` exits 0 with no snapshot drift
- [ ] `getFallbackConfig` accepts `ageBracket` and gates on `isUnder18AgeBracket` before any legacy branch
- [ ] All four production call sites (`router.ts` ~1649, ~1689, ~2080, ~2161) pass the age through
- [ ] The break test provably fails when the gate is reverted (Step 4 performed, result stated in PR description)
- [ ] Test 5 (adult still reaches gemini on the legacy path) passes — proving adult routing is unchanged
- [ ] `advisor-plans-deep/README.md` status row updated

## STOP conditions

Stop and report — do not improvise — if:

- `_options?.ageBracket` is **not** in scope at any of the four call sites. Do not
  invent a new plumbing route or thread a fresh parameter down from the route
  handler; report what you found instead. (The primary-path `getModelConfig` call
  in the same function proves the age is available — if it isn't, this plan's
  assumption is wrong.)
- `approvedTextFallbackConfig` can return `gemini` or `vertex`. That would mean
  the **primary** path's minor gate is also broken — a strictly larger finding
  that needs its own decision. Stop and report it.
- The adult-fallback test (`router.fallback-compliance.test.ts:162-173`) starts
  failing. That means you banned Gemini globally rather than gating on age.
  Re-read the Scope section.
- `pnpm eval:llm` shows snapshot drift. This change should be behavior-neutral
  for every non-minor path; drift means you changed more than intended.

## Maintenance notes

- **What a reviewer should scrutinize**: that the gate sits *after* the V2
  dispatch and *before* every legacy branch, and that adult routing is provably
  unchanged (test 5).
- **The deeper issue this does not fix**: the safe path is still not the default —
  `LLM_ROUTING_V2_ENABLED` defaults to `'false'` (`config.ts:190`). After this
  plan, the legacy path is *safe for minors*, so the default is no longer a
  safety cliff. But flipping the default to `'true'`, and then removing
  `GEMINI_API_KEY` entirely (the register's stated next step,
  `docs/registers/llm-models/master.md:127`), remain the real end state. Consider
  filing both as follow-ups.
- **Future interaction**: any new provider added to `FALLBACK_FORBIDDEN` is
  automatically honored by the V2 path (it loops and `continue`s on the set) but
  **not** by the legacy path, which hardcodes its branches. If a third forbidden
  vendor is ever added, re-check the legacy selector.
- The grader/capability blindness (`getFallbackConfig` keys only on
  `primary.provider`, never on `capability`) is *mitigated* by this age gate for
  minors, but a grader fallback for an adult can still land on an unvetted vendor.
  That is a narrower, separate finding — deliberately not fixed here.
