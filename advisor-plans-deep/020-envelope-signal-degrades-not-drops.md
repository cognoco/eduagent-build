# Plan 020: Stop one malformed signal field from discarding the entire LLM envelope

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans-deep/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 8c049b93f..HEAD -- packages/schemas/src/llm-envelope.ts apps/api/src/services/evaluate.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `8c049b93f`, 2026-07-13

## Why this matters

`llm-envelope.ts` states its own design principle explicitly
(`packages/schemas/src/llm-envelope.ts:32-38`):

> the schema terminates in `.catch(undefined)` so an irrecoverable value
> **drops ONLY this field — never the whole envelope, which would discard the
> valid reply and every state signal.**

**One field violates that principle.** In `evaluateAssessmentSignalSchema`,
`challenge_passed` is a **hard-required boolean with no `.catch()`**. So on an
EVALUATE turn, if the LLM emits the `evaluate_assessment` object but omits or
mistypes `challenge_passed` — a documented failure mode for these models, noted
elsewhere in this very file — the object fails, `signals` fails, and **the entire
envelope fails to parse**. The learner's perfectly good `reply` is thrown away
along with it.

Here is what makes this unambiguous rather than a judgment call: **the server
already handles the missing field.** `apps/api/src/services/evaluate.ts:137-148`:

```ts
 * required `challenge_passed` field is missing — the LLM emitted partial data.
...
// challenge_passed is the only required field — zod enforces boolean, but
if (typeof signal.challenge_passed !== 'boolean') return null;
```

The consumer is *written for* the missing-field case and fails safe (returns
`null` → no evaluation → no mastery granted, which is the conservative outcome
AGENTS.md's server-owned mastery policy demands). But the schema makes that
branch **unreachable**, because it destroys the whole envelope before the server
ever sees the signal.

So today: a partial EVALUATE signal costs the learner their entire reply. After
this fix: the reply survives, the signal is dropped, and the server takes the
already-implemented conservative path.

## Current state

### The offending field

`packages/schemas/src/llm-envelope.ts:153-169`:

```ts
const evaluateAssessmentSignalSchema = z.preprocess(
  optionalObjectInput,
  z
    .object({
      challenge_passed: z.preprocess(nullToUndefined, z.boolean()),   // <-- required, no .catch()
      flaw_identified: z.preprocess((value) => {
        if (typeof value !== 'string') return undefined;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      }, z.string().max(1000).optional()),
      quality: z.preprocess((value) => {
        if (typeof value !== 'number') return undefined;
        return Math.max(0, Math.min(5, Math.round(value)));
      }, z.number().int().min(0).max(5).optional()),
    })
    .optional(),
);
```

Note the two sibling fields (`flaw_identified`, `quality`) *are* `.optional()`
and preprocess-guarded. Only `challenge_passed` is hard.

### The correct sibling, in the same file

`packages/schemas/src/llm-envelope.ts:190-206` —
`teachBackAssessmentSignalSchema` makes **every** field optional/catchable:

```ts
const teachBackAssessmentSignalSchema = z.preprocess(
  optionalObjectInput,
  z
    .object({
      completeness: teachBackScoreSchema,
      accuracy: teachBackScoreSchema,
      clarity: teachBackScoreSchema,
      overall_quality: teachBackScoreSchema,
      weakest_area: teachBackWeakestAreaSchema,
      gap_identified: z.preprocess(/* ... */, z.string().max(1000).nullable().optional()),
    })
    .optional(),
);
```

### The server already fails safe on a missing value

`apps/api/src/services/evaluate.ts:137-148` (excerpted above) and a second guard
at `evaluate.ts:261`:

```ts
  if (typeof obj['challenge_passed'] !== 'boolean') return null;
```

Both return `null` — "no evaluation" — which grants no mastery. That is the
conservative default AGENTS.md requires ("Challenge Round mastery policy is
server-owned and conservative").

### The related-but-DIFFERENT case — read carefully

`packages/schemas/src/llm-envelope.ts:272-279`:

```ts
export const challengeRoundEvaluationItemSchema = z.object({
  concept: z.string().min(1).max(200),
  result: z.enum(['solid', 'partial', 'missing', 'misconception']),
  evidence: z.string().min(1).max(500),
  answerEventId: z.string().uuid(),
  learnerQuote: z.string().min(1).max(500),
  correction: z.string().min(1).max(500).optional(),
});
```

`answerEventId` and `learnerQuote` are required **on purpose**. The docstring
immediately above (`:268-271`) says the note-drafter "MUST refuse to use any item
where these are missing" — it is an **anti-hallucination guarantee** (HIGH-6).

**Do NOT make these fields optional.** That would weaken a safety contract. The
problem here is only the *blast radius*: one malformed item in the array currently
kills the whole envelope. The correct fix is to **drop the bad item, keep the
good ones, keep the envelope** — while still never *using* a bad item. See Step 3.

### Repo conventions

- `@eduagent/schemas` is the shared contract; the fix belongs there.
- Every envelope signal must have a **server-side hard cap** so a flow terminates
  even if the LLM never emits the signal (AGENTS.md). This fix *strengthens* that
  posture — it moves a failure from "envelope dies" to "server applies its
  conservative default".
- Tests are co-located. No `__tests__/` folders. No internal `jest.mock('./...')`.
- Changing files under `packages/schemas` that feed LLM prompts/routing means the
  **eval harness must run** (`pnpm eval:llm`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Envelope tests | `pnpm exec jest --config apps/api/jest.config.cjs packages/schemas/src/llm-envelope.test.ts --no-coverage` | all pass |
| Evaluate service tests | `pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/services/evaluate --no-coverage` | all pass |
| Typecheck API | `pnpm exec nx run api:typecheck` | exit 0 |
| Lint API | `pnpm exec nx run api:lint` | exit 0 |
| LLM eval (Tier 1) | `pnpm eval:llm` | exit 0, no unexpected drift |

## Scope

**In scope:**
- `packages/schemas/src/llm-envelope.ts` — `challenge_passed`, and the per-item resilience of the `challenge_round_evaluation` array.
- `packages/schemas/src/llm-envelope.test.ts` — the regression tests.

**Out of scope (do NOT touch):**
- **`answerEventId` / `learnerQuote` requiredness** on
  `challengeRoundEvaluationItemSchema`. They are a deliberate anti-hallucination
  guarantee. Make the *array* resilient; never make these fields optional.
- `apps/api/src/services/evaluate.ts` — its `typeof !== 'boolean' → return null`
  guards are already correct and are what makes this fix safe. Leave them.
- `parseEnvelope` / `parseEnvelopeRaw` in `apps/api/src/services/llm/envelope.ts`.
  They already fail closed correctly (return a discriminated `{ok: false}`, never
  throw).
- The prompt text in `exchange-prompts.ts` that instructs the LLM to emit
  `challenge_passed`. It should still *ask* for the field — we are hardening
  against the LLM disobeying, not giving it permission to.
- Any other signal schema. Do not do a speculative sweep making everything
  optional; that would erode real contracts.

## Git workflow

- Branch from `main`: `advisor/020-envelope-signal-degrades-not-drops`
- Conventional commits (e.g. `fix(schemas): degrade partial EVALUATE signal instead of dropping the envelope`).
- Do NOT push or open a PR unless explicitly instructed.

## Steps

### Step 1: Write the failing tests FIRST

In `packages/schemas/src/llm-envelope.test.ts`:

```ts
it('[WI-XXXX] keeps the reply when evaluate_assessment omits challenge_passed', () => {
  const raw = JSON.stringify({
    reply: 'Nice work — tell me more about why that step follows.',
    signals: {
      evaluate_assessment: { quality: 4 },   // challenge_passed MISSING
    },
  });

  const result = llmResponseEnvelopeSchema.safeParse(JSON.parse(raw));

  expect(result.success).toBe(true);
  expect(result.data?.reply).toContain('Nice work');
  // the malformed signal is dropped, not the envelope
  expect(result.data?.signals?.evaluate_assessment?.challenge_passed).toBeUndefined();
});

it('[WI-XXXX] keeps the reply when challenge_passed is the wrong type', () => {
  // same, but challenge_passed: 'yes'  (a string)
});
```

**Verify**: both **MUST FAIL** now — `success` will be `false`, proving the whole
envelope is currently discarded.

Read the existing tests in `llm-envelope.test.ts` (39K — it is thorough) and match
their structure and helpers.

### Step 2: Make `challenge_passed` degrade instead of detonate

`packages/schemas/src/llm-envelope.ts:157`:

```ts
      // Non-critical for envelope survival: a missing/mistyped verdict must drop
      // ONLY this field, never the whole envelope (see the file's design
      // principle above). The server already fails safe on a non-boolean —
      // evaluate.ts:146 and :261 both `return null` (no evaluation, no mastery
      // granted), which is the conservative default the mastery policy requires.
      challenge_passed: z
        .preprocess(nullToUndefined, z.boolean())
        .optional()
        .catch(undefined),
```

`.optional()` handles absence; `.catch(undefined)` handles a wrong type. Both are
needed — `.optional()` alone still throws on `'yes'`.

**Verify**: `pnpm exec nx run api:typecheck` → exit 0. The `EvaluateAssessmentSignal`
type now has `challenge_passed?: boolean | undefined`, which is exactly what
`evaluate.ts:146`'s `typeof … !== 'boolean'` guard already expects.

### Step 3: Make the challenge-round evaluation ARRAY drop bad items, not the envelope

Find where `challengeRoundEvaluationItemSchema` is used as an array (around
`llm-envelope.ts:374-377`). Today one malformed item fails the whole array and
therefore the whole envelope.

Change the **array** — **not** the item's field requirements — so a bad item is
discarded and the good ones survive:

```ts
challenge_round_evaluation: z
  .array(challengeRoundEvaluationItemSchema.catch(undefined as never))
  .transform((items) => items.filter((i) => i != null))
  .optional()
  .catch(undefined),
```

If that exact Zod shape is awkward in the installed version, an equivalent and
clearer form is a `z.preprocess` that filters the raw array to only items which
individually `safeParse` successfully, then parses the filtered array normally.
**Use whichever is cleanest — the requirement is behavioral, not syntactic:**

- a malformed item is **dropped**;
- well-formed items in the same array **survive**;
- the envelope and its `reply` **survive**;
- `answerEventId` / `learnerQuote` remain **required on every item that survives**
  (the anti-hallucination guarantee is untouched — a bad item is discarded, never
  passed downstream with missing provenance).

Add a test proving all four properties, especially the last one.

**Verify**: a mixed array (one valid item, one missing `learnerQuote`) parses to
exactly **one** item, and the envelope succeeds.

### Step 4: Confirm the server's conservative path actually runs

This is the step that proves the fix is safe rather than merely permissive.

Read `apps/api/src/services/evaluate.ts:137-148`. With `challenge_passed` now
possibly `undefined`, confirm the guard `if (typeof signal.challenge_passed !== 'boolean') return null;`
is reached and returns `null` — i.e. **no mastery is granted** on a partial signal.

Add a test in the evaluate service's co-located test file asserting:
"an EVALUATE signal without `challenge_passed` yields no evaluation and grants no
mastery."

**If any code path treats `undefined` as truthy or as a pass, STOP** — that would
convert this fix into a mastery-granting bug, which is far worse than the problem
it solves.

**Verify**: `pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/services/evaluate --no-coverage` → all pass.

### Step 5: Red-green-revert, then validate

1. Run the envelope tests → new tests **PASS**.
2. Revert `challenge_passed` to the hard `z.boolean()`.
3. Re-run → the new tests **FAIL** (envelope discarded).
4. Restore. Re-run → **PASS**.

**Verify**, all of:
- `pnpm exec jest --config apps/api/jest.config.cjs packages/schemas/src/llm-envelope.test.ts --no-coverage` → all pass
- `pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/services/evaluate --no-coverage` → all pass
- `pnpm exec nx run api:typecheck` → exit 0
- `pnpm exec nx run api:lint` → exit 0
- `pnpm eval:llm` → exit 0, **no snapshot drift** (this change alters no prompt text)

## Test plan

In `packages/schemas/src/llm-envelope.test.ts`:

1. `evaluate_assessment` present, `challenge_passed` **missing** → envelope parses, `reply` intact, `challenge_passed` is `undefined`.
2. `challenge_passed` is a **string** (`'yes'`) → same as above (caught, not thrown).
3. `challenge_passed: true` → still parses to `true` (**no regression** on the happy path).
4. `challenge_round_evaluation` with one valid + one invalid item → envelope parses, exactly the **valid** item survives.
5. Every surviving `challenge_round_evaluation` item still has `answerEventId` and `learnerQuote` (the guarantee holds).

In the evaluate service's co-located test:

6. An EVALUATE signal without `challenge_passed` → no evaluation recorded, **no mastery granted**.

Do NOT add internal `jest.mock('./...')`.

## Done criteria

ALL must hold:

- [ ] `packages/schemas/src/llm-envelope.test.ts` passes, including all 5 new cases
- [ ] The evaluate-service test proving "partial signal → no mastery granted" passes
- [ ] `pnpm exec nx run api:typecheck` exits 0
- [ ] `pnpm exec nx run api:lint` exits 0
- [ ] `pnpm eval:llm` exits 0 with **no** snapshot drift
- [ ] A malformed `evaluate_assessment` no longer fails the envelope (test 1 proves it, and it provably fails when reverted — Step 5)
- [ ] `challengeRoundEvaluationItemSchema`'s `answerEventId` and `learnerQuote` are **still required** (`grep -A6 'challengeRoundEvaluationItemSchema = z.object' packages/schemas/src/llm-envelope.ts` shows no `.optional()` on either)
- [ ] `apps/api/src/services/evaluate.ts` is **unmodified**
- [ ] `advisor-plans-deep/README.md` status row updated

## STOP conditions

Stop and report — do not improvise — if:

- **Any code path treats a missing `challenge_passed` as a pass.** The whole
  premise of this fix is that the server already fails safe. If it does not, this
  change would start granting mastery on partial LLM output — strictly worse than
  the bug. Verify before shipping.
- You find yourself making `answerEventId` or `learnerQuote` optional. That
  weakens the HIGH-6 anti-hallucination guarantee. Re-read Scope.
- `pnpm eval:llm` shows snapshot drift. This change touches no prompt text, so
  drift means you changed more than intended.
- You are tempted to apply `.catch()` broadly across every signal schema "for
  consistency". Do not. Some fields are required for good reason; each one needs
  the same "does the consumer fail safe?" analysis you did in Step 4.

## Maintenance notes

- **The rule this encodes**: an envelope field may be *required for the signal to
  be acted on*, but must never be *required for the envelope to parse*. The reply
  belongs to the learner; a model's failure to emit a telemetry/state field should
  never cost them their turn. `teachBackAssessmentSignalSchema` already gets this
  right and is the model to follow.
- **What a reviewer should scrutinize**: Step 4. The safety of this change rests
  entirely on the server treating `undefined` as "no verdict", not as "passed".
- **Worth a follow-up audit**: sweep the remaining signal schemas in
  `llm-envelope.ts` for other hard-required fields, and for each ask "if the LLM
  omits this, does the learner lose their reply?" This plan fixes the one confirmed
  instance; a systematic pass would catch siblings. Do **not** bundle that sweep
  into this PR — each field needs its own consumer analysis.
- **Why this matters more over time**: the model register routes different tiers to
  different vendors, and instruction-following on structured output varies by model.
  A schema that detonates on partial output makes the whole product only as reliable
  as its least obedient model.
