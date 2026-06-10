# WI-571 Implementation Plan — WP-W1-spine

**Work type:** Mixed — carve is behavior-preserving refactor (design-doc + AC checklist);
engine/router/judge scaffold is greenfield (TDD).

**Frozen source:** master plan §1 "WP-W1-spine" + ADRs 0013/0014/0016.

---

## Acceptance Criteria (from WI-571 bundle brief)

- [ ] AC-1: `session-exchange.ts` decomposed into the three slices (router / spine / judge)
- [ ] AC-2: Engine/router/judge spine exists and is unit-exercised
- [ ] AC-3: Structured envelope (`llmResponseEnvelopeSchema`) parse path present (via `parseEnvelope()`)
- [ ] AC-4: No prompt drift — eval harness snapshot before/after must be identical
- [ ] AC-5: `resolveExchangeLlmRouting()` keeps flowing — routing behavior is NOT changed

---

## Scope

**In:**
- Carve `resolveExchangeLlmRouting` + `ExchangeLlmRouting` interface + routing constants
  from `session-exchange.ts` → new `session-exchange-router.ts`
- Carve `resolveReadyToFinish` + hard-cap logic
  from `session-exchange.ts` → new `session-exchange-spine.ts`
- Scaffold new `services/policy-engine/` directory with:
  - `engine.ts` — policy engine stub (two-primitive model per MMT-ADR-0013)
  - `router.ts` — exchange router stub (3-param key per MMT-ADR-0014)
  - `judge.ts` — safety/judge stub (vendor-independent, non-reasoning per MMT-ADR-0016)
  - `envelope-surface.ts` — EnvelopeSurface registry (moves from `services/llm/envelope.ts`)
  - `index.ts` — barrel
- Unit tests for each scaffold module (TDD — tests first, red → green)
- Keep `parseEnvelope()` from `services/llm/envelope.ts` (AC-3 — already present, must remain accessible)
- Update `session-exchange.ts` imports to re-export from the carved modules (no behavior change)
- Update `session-exchange/index.ts` barrel to maintain all existing exports

**Out:**
- Per-domain enforcement (W2/W3 obligations)
- Routing behavior changes
- Any change to `apps/api/src/services/llm/router.ts` (sibling WI-572 surface — do not touch)
- Any change to `apps/api/src/services/session/session-exchange-*.integration.test.ts`
  (integration tests — no behavior change means these are unchanged)

---

## Step 1 — Run eval harness baseline BEFORE any code change

```bash
cd .worktrees/WI-571 && pnpm eval:llm 2>&1 | tail -5
```

Record snapshot file names. These become the "before" baseline. The carve must not change them.

Verify: ✓ snapshots written; no prompt drift.

---

## Step 2 — Unit tests first for engine/router/judge scaffold (TDD red)

Write test files BEFORE the implementation files. Each test imports from the future module
path and verifies the structural contract only (type safety, module shape, correct re-exports).

### 2a. `services/policy-engine/engine.test.ts`

Tests:
- `evaluatePolicyCell()` returns an object with `prohibited: boolean` + `consentRequired: boolean`
- called with unknown age/residence → returns most-restrictive defaults (prohibited=false but
  consentRequired=true per ADR-0013 §3 default-for-unknown)
- module exports `evaluatePolicyCell` function

### 2b. `services/policy-engine/router.test.ts` (exchange-level router, NOT `llm/router.ts`)

Tests:
- `resolveExchangeRouter()` returns `{ model, serviceProvider, servingRegion }` shape
- fallback path: when eligibility set is empty → throws `NoEligibleModelError`
- module exports `resolveExchangeRouter`, `NoEligibleModelError`

### 2c. `services/policy-engine/judge.test.ts`

Tests:
- `resolveJudgeConfig()` returns `{ model, vendorIndependent: true, reasoningMode: 'off' }`
- vendorIndependent flag means vendor must differ from tutorVendor input
- module exports `resolveJudgeConfig`

### 2d. `services/policy-engine/index.test.ts`

Tests:
- re-exports `evaluatePolicyCell`, `resolveExchangeRouter`, `resolveJudgeConfig`, `NoEligibleModelError`

Run tests — ALL FAIL (red). Record failure count.

---

## Step 3 — Carve routing slice from session-exchange.ts (refactor, no behavior change)

**Source:** `session-exchange.ts` lines 193–275 (ExchangeLlmRouting interface + resolveExchangeLlmRouting + resolveChallengeRoundLlmRoutingRung + routing constants)

### 3a. Create `services/session/session-exchange-router.ts`

Move (cut-and-paste exactly, no edits):
```
// routing constants (GEMINI_ADVANCED_MODEL_MIN_RUNG + reason strings)
// ExchangeLlmRouting interface
// resolveExchangeLlmRouting()
// resolveChallengeRoundLlmRoutingRung()
```

Imports needed in new file:
```ts
import type { SubscriptionTier } from '@eduagent/schemas';
import type { EscalationRung, LlmProviderPolicy, PreferredLlmProvider } from '../llm';
import type { LLMTier } from '../subscription';
import type { ChallengeRoundSessionState } from '@eduagent/schemas';
```

### 3b. In `session-exchange.ts`, replace the cut block with re-exports:
```ts
// [WI-571] Routing helpers carved to session-exchange-router.ts (WP-W1-spine)
export {
  ExchangeLlmRouting,  // type
  resolveExchangeLlmRouting,
  resolveChallengeRoundLlmRoutingRung,
} from './session-exchange-router';
```

Keep the constants internal to session-exchange-router.ts (they are not exported today).

Verification:
```bash
cd .worktrees/WI-571/apps/api && npx jest --testPathPatterns="session-exchange.test" --no-coverage
```
All 72 tests must still pass.

---

## Step 4 — Carve spine slice from session-exchange.ts (refactor, no behavior change)

**Source:** `session-exchange.ts` lines 132–165 (resolveReadyToFinish + JSDoc)

### 4a. Create `services/session/session-exchange-spine.ts`

Move (cut-and-paste exactly):
```ts
// resolveReadyToFinish()
// MAX_INTERVIEW_EXCHANGES is already imported from session-exchanges — keep import
```

Imports needed in new file:
```ts
import { MAX_INTERVIEW_EXCHANGES } from './session-crud';
```

### 4b. In `session-exchange.ts`, replace with re-export:
```ts
export { resolveReadyToFinish } from './session-exchange-spine';
```

Verification:
```bash
cd .worktrees/WI-571/apps/api && npx jest --testPathPatterns="session-exchange.test" --no-coverage
```
All 72 tests must still pass.

---

## Step 5 — Implement engine/router/judge scaffold (TDD green)

### 5a. Create `services/policy-engine/engine.ts`

```ts
// ---------------------------------------------------------------------------
// Policy Engine — two-primitive model (MMT-ADR-0013)
//
// Scaffold for WP-W1-spine (WI-571). W2/W3 obligations land enforcement here.
// Today: returns the safe-default (most-restrictive) for all inputs because
// the policy_rules / policy_cells tables are not yet populated (WP-W1-schema
// created the schema; C2-B compliance-population workstream fills the data).
// ---------------------------------------------------------------------------

export interface PolicyKnowledge {
  age: 'known' | 'unknown';
  residence: 'known' | 'unknown';
}

export interface PolicyCellResult {
  /** Whether a prohibition-floor rule blocks this cell (unconditional). */
  prohibited: boolean;
  /** Whether this cell requires an active consent-edge to proceed. */
  consentRequired: boolean;
}

/**
 * Evaluate the policy cell for (age × residence × knowledge).
 *
 * Default-for-unknown = most-restrictive (MMT-ADR-0013 §3):
 *   - unknown age → treat as sub-13 → consentRequired: true
 *   - unknown residence → treat as strictest regime → consentRequired: true
 *
 * W2/W3 will wire real DB reads into this function once the policy tables
 * are populated by the C2-B compliance-population workstream.
 */
export function evaluatePolicyCell(knowledge: PolicyKnowledge): PolicyCellResult {
  if (knowledge.age === 'unknown' || knowledge.residence === 'unknown') {
    return { prohibited: false, consentRequired: true };
  }
  // Future: query policy_cells / policy_rules tables.
  return { prohibited: false, consentRequired: false };
}
```

### 5b. Create `services/policy-engine/router.ts` (exchange-level router stub)

```ts
// ---------------------------------------------------------------------------
// Exchange Router stub — 3-param runtime key (MMT-ADR-0014)
//
// Scaffold for WP-W1-spine (WI-571). The full vetting pipeline + allowed_models
// table are populated by the vetting-research workstream (WP-4). Today: throws
// NoEligibleModelError when the eligibility set is empty (fail-closed by default).
//
// NOTE: This is the POLICY-ENGINE-LEVEL router (picks a model row from the
// vetted + policy-filtered set). It is DISTINCT from services/llm/router.ts
// (the LLM call dispatcher that routes the actual HTTP request to a provider).
// ---------------------------------------------------------------------------

export class NoEligibleModelError extends Error {
  constructor(reason?: string) {
    super(reason ?? 'No eligible model in the policy-filtered set');
    this.name = 'NoEligibleModelError';
  }
}

export interface ExchangeRouterInput {
  /** Rows from allowed_models filtered by the policy engine's eligibility output. */
  eligibleRows: ReadonlyArray<{
    model: string;
    serviceProvider: string;
    servingRegion: string;
  }>;
}

export interface ExchangeRouterResult {
  model: string;
  serviceProvider: string;
  servingRegion: string;
}

/**
 * Pick a model row from the policy-filtered eligibility set.
 *
 * v1 strategy: first row (tier-ordered by the vetting pipeline).
 * Fallback: throws NoEligibleModelError (fail-closed).
 *
 * W3 (WP-W3-envelope-router) will harden the fallback tiers here.
 */
export function resolveExchangeRouter(
  input: ExchangeRouterInput,
): ExchangeRouterResult {
  const first = input.eligibleRows[0];
  if (!first) {
    throw new NoEligibleModelError();
  }
  return {
    model: first.model,
    serviceProvider: first.serviceProvider,
    servingRegion: first.servingRegion,
  };
}
```

### 5c. Create `services/policy-engine/judge.ts`

```ts
// ---------------------------------------------------------------------------
// Safety / Judge stub — vendor-independent, non-reasoning (MMT-ADR-0016)
//
// Scaffold for WP-W1-spine (WI-571). The actual model picks live in
// docs/registers/llm-models/master.md (register data, not ADR).
// Today: resolveJudgeConfig() returns the structural contract shape only;
// W3 (WP-W3-envelope-router) wires real model selection.
// ---------------------------------------------------------------------------

export interface JudgeConfigInput {
  /** The tutor model's vendor (e.g. 'anthropic', 'openai'). */
  tutorVendor: string;
}

export interface JudgeConfig {
  /**
   * Judge must be vendor-independent of the tutor (MMT-ADR-0016 §2).
   * The actual model identifier is register data.
   */
  vendorIndependent: true;
  /** Judge always runs in non-reasoning mode (MMT-ADR-0016 §2). */
  reasoningMode: 'off';
  /** The vendor constraint: must differ from tutorVendor. */
  vendorConstraint: string;
}

/**
 * Resolve the structural constraints for the judge role.
 *
 * Does NOT return a specific model — that is register data in
 * docs/registers/llm-models/master.md. Returns the constraint shape
 * that W3 (WP-W3-envelope-router) will use when wiring real model selection.
 */
export function resolveJudgeConfig(input: JudgeConfigInput): JudgeConfig {
  return {
    vendorIndependent: true,
    reasoningMode: 'off',
    vendorConstraint: `!${input.tutorVendor}`,
  };
}
```

### 5d. Create `services/policy-engine/index.ts`

```ts
export { evaluatePolicyCell } from './engine';
export type { PolicyKnowledge, PolicyCellResult } from './engine';
export { resolveExchangeRouter, NoEligibleModelError } from './router';
export type { ExchangeRouterInput, ExchangeRouterResult } from './router';
export { resolveJudgeConfig } from './judge';
export type { JudgeConfigInput, JudgeConfig } from './judge';
```

Verification:
```bash
cd .worktrees/WI-571/apps/api && npx jest --testPathPatterns="policy-engine" --no-coverage
```
All scaffold tests must PASS (green).

---

## Step 6 — Verify parseEnvelope path is reachable from new modules (AC-3)

AC-3 requires the envelope parse path be present. `parseEnvelope()` already exists in
`services/llm/envelope.ts` and is callable from the new engine/router/judge scaffold.

Add one test to `services/policy-engine/engine.test.ts` that imports `parseEnvelope`
from `../../services/llm/envelope` and calls it with a well-formed envelope — this
verifies the import path is wired and the parse path is accessible from the spine directory.

```ts
import { parseEnvelope } from '../../llm/envelope';
// ... in test:
it('envelope parse path reachable from policy-engine scaffold', () => {
  const result = parseEnvelope(
    '{"reply":"hello","signals":{"partial_progress":false}}',
    'unknown',
  );
  expect(result.ok).toBe(true);
});
```

---

## Step 7 — Run eval harness AFTER (no prompt drift)

```bash
cd .worktrees/WI-571 && pnpm eval:llm 2>&1 | tail -5
```

Verify: snapshot content identical to Step 1 baseline.
Stage snapshot files alongside the code change in the commit.

---

## Step 8 — Run full session-exchange + policy-engine tests

```bash
cd .worktrees/WI-571/apps/api && npx jest --testPathPatterns="session-exchange|policy-engine" --no-coverage
```

Expected: 72 session-exchange tests + new policy-engine tests all pass.

---

## Step 9 — Typecheck + lint

```bash
cd .worktrees/WI-571 && pnpm exec nx run api:typecheck && pnpm exec nx run api:lint
```

---

## Step 10 — Commit via /commit, push, open PR

---

## File Map

| File | Action | Notes |
|---|---|---|
| `apps/api/src/services/session/session-exchange.ts` | Modify | Replace carved blocks with re-exports |
| `apps/api/src/services/session/session-exchange-router.ts` | Create | Carved routing slice |
| `apps/api/src/services/session/session-exchange-spine.ts` | Create | Carved spine slice (resolveReadyToFinish) |
| `apps/api/src/services/policy-engine/engine.ts` | Create | Policy engine stub |
| `apps/api/src/services/policy-engine/router.ts` | Create | Exchange router stub |
| `apps/api/src/services/policy-engine/judge.ts` | Create | Safety/judge stub |
| `apps/api/src/services/policy-engine/index.ts` | Create | Barrel |
| `apps/api/src/services/policy-engine/engine.test.ts` | Create | TDD |
| `apps/api/src/services/policy-engine/router.test.ts` | Create | TDD |
| `apps/api/src/services/policy-engine/judge.test.ts` | Create | TDD |
| `apps/api/src/services/policy-engine/index.test.ts` | Create | TDD |
| `apps/api/eval-llm/snapshots/*.json` | Modify | Staged (no content change) |

**NOT touched:**
- `apps/api/src/services/llm/router.ts` (sibling WI-572 surface)
- Any integration test files
- Any mobile files
