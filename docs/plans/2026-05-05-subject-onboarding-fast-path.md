# Subject Onboarding Fast Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut per-subject onboarding from up to 5 gating screens down to 1 (or 2 for language subjects) by extending the interview's signal-extractor to absorb interest-context + analogy-framing signals and bypassing `interests-context`, `analogy-preference`, `accommodations`, and `curriculum-review` behind a build-time constant.

**Architecture:** Two-phase delivery. Phase 1 is purely additive on the API: extend `SIGNAL_EXTRACTION_PROMPT` (post-hoc, structured-JSON path — NOT the live `INTERVIEW_SYSTEM_PROMPT` envelope, which is tracked separately under F1.1) with three new optional fields, persist them in the JSONB `extractedSignals` column, add a mechanical pace-heuristic, and gate-keep with eval-harness coverage. No routing changes ship in Phase 1. Phase 2 introduces a build-time `ONBOARDING_FAST_PATH` constant on mobile + API; when true, `interview.tsx` `goToNextStep` short-circuits straight to a learning session (or to the slimmed `language-setup` for `four_strands` subjects). Bypassed screens are NOT deleted in this plan — Phase 4 cleanup is gated on a Settings-affordance follow-up spec.

**Tech Stack:** TypeScript, Zod (`@eduagent/schemas`), Drizzle ORM (JSONB columns), Hono (API routes), Inngest (background curriculum persistence), Expo Router (mobile navigation), Jest, the in-house `apps/api/eval-llm/` LLM evaluation harness with `--check-baseline` / `--update-baseline` regression guard.

**Spec:** `docs/specs/2026-05-05-subject-onboarding-fast-path.md`.

**Out of plan scope:** the Settings "Tell the Mentor how you learn best" panel (Phase 3) and screen deletion + accommodation-data migration (Phase 4) get their own specs+plans. The `focused_book` 0-screen target (interview folded into first tutoring turn) is also deferred to a follow-up — for this plan, `focused_book` keeps the interview screen.

---

## Pre-flight — Required user decisions (do NOT skip)

The spec calls out two open questions that block Phase 2. Both are product/UX decisions, not engineering ones, and both must be resolved (in a comment or commit on the spec doc) before Phase 2 starts. Phase 1 can proceed without them.

### Decision 1: `language-setup` for `four_strands` subjects (Open Q1 in spec)

Pick one of:
- **(a)** Keep as-is — accept 2 screens for language subjects.
- **(b)** Slim to single screen with smart defaults: L1 = UI conversation language (`profiles.uiLanguage`), CEFR inferred from session 1 behavior. Recommended in spec.
- **(c)** Defer entirely — Mentor asks in turn 1.

This plan assumes **(a)** (no change to `language-setup` content) for Phase 2 routing. If (b) is picked, an additional task block is needed: replicate the existing `language-setup.tsx` defaults logic but pre-populate from profile + remove the level cards, and update `language-setup.test.tsx`. If (c) is picked, the routing for `four_strands` becomes the same as the generic case (interview → tutoring) and a separate spec is required for the language-pedagogy hand-off. **Pick before starting Task 8.**

### Decision 2: Engagement metric + threshold for Phase 4 gate (Open Q5 in spec)

The spec REQUIRES the metric (and its trigger threshold) be defined before Phase 2 ships, otherwise Phase 4 cleanup ("delete bypassed screens") has no data to trigger from. Candidate primary: time-to-first-tutoring-exchange. Owner + threshold values must be filled into the spec doc. This plan does NOT implement metric collection — the spec leaves rollout staged-by-environment, not per-user A/B — but the decision must be captured so Phase 4 has a gate. **Capture the decision in the spec before merging Task 11 (Phase 2 routing PR).**

---

## File Structure

### Phase 1 — files touched

- `packages/schemas/src/sessions.ts` — extend `extractedInterviewSignalsSchema` with three new optional fields: `interestContext`, `analogyFraming`, `paceHint`.
- `apps/api/src/services/interview-prompts.ts` — extend `SIGNAL_EXTRACTION_PROMPT` body. Do NOT touch `INTERVIEW_SYSTEM_PROMPT`.
- `apps/api/src/services/interview.ts` — add `inferPaceHint(history)` mechanical heuristic; have `extractSignals` call it and merge into the returned object.
- `apps/api/src/services/interview.test.ts` — round-trip tests for new signal fields + pace heuristic unit tests.
- `tests/integration/onboarding.integration.test.ts` — JSONB round-trip test (write extended draft → reload via API → all new fields survive).
- `apps/api/src/inngest/functions/interview-persist-curriculum.ts` — extend the local `ExtractedSignals` type (line ~98) so the cached-vs-fresh check still typechecks.
- `apps/api/eval-llm/flows/interview.ts` — add scenarios that exercise the new signal dimensions (5 personas × 3 dimensions × 2 transcript variants ≥ 30 samples).
- `apps/api/eval-llm/snapshots/interview/*.md` — regenerated snapshots (committed).
- `apps/api/eval-llm/runner/metrics.ts` — extend per-flow signal-distribution tracking to include the new envelope-derived dimensions; commit a baseline JSON.

### Phase 2 — files touched

- `apps/mobile/src/lib/feature-flags.ts` — add `ONBOARDING_FAST_PATH` to `FEATURE_FLAGS` (build-time, hard-coded — `false` for prod, `true` for staging branches/dev).
- `apps/api/src/config.ts` — add a build-time `ONBOARDING_FAST_PATH` flag (read from env, default `false`). Surfaced for any backend behavior the bypass needs (curriculum-pre-fetch, etc.).
- `apps/mobile/src/app/(app)/onboarding/interview.tsx` — modify `goToNextStep` (lines 115–182) to branch on the flag. When `true`: skip `interests-context`, `analogy-preference`, `accommodations`, `curriculum-review`; for non-language subjects route directly into `transitionToSession` (which already starts a learning session); for `four_strands`, route to `language-setup` then to tutoring (the existing `language-setup` already routes to `accommodations`, so `language-setup` itself must also branch on the flag and route directly to tutoring instead).
- `apps/mobile/src/app/(app)/onboarding/language-setup.tsx` — modify `handleContinue` (line ~146) to branch on the flag and skip directly into a learning session instead of routing to `accommodations`.
- `apps/mobile/src/app/(app)/onboarding/interview.test.tsx` — add tests for both flag states.
- `apps/mobile/src/app/(app)/onboarding/language-setup.test.tsx` — add tests for both flag states.
- `apps/mobile/src/app/(app)/onboarding/_layout.test.tsx` — verify removed transitions still type-check / no orphan routes.
- `apps/mobile/e2e/flows/<name>.yaml` (new) — Maestro E2E flow exercising the fast path end-to-end.
- `tests/integration/onboarding.integration.test.ts` — add an integration test asserting that when fast-path is on, a learning session created right after interview-complete reads from the materialized curriculum (curriculum-review hand-off).
- `docs/flows/mobile-app-flow-inventory.md` — annotate (do not delete) entries for the four bypassed screens.

---

## Phase 1 — Prompt + extraction (additive, no routing changes)

### Task 1: Extend `extractedInterviewSignalsSchema` with three optional fields

**Files:**
- Modify: `packages/schemas/src/sessions.ts:46-54`
- Test: `packages/schemas/src/sessions.test.ts` (create if missing — check first with `Glob packages/schemas/src/sessions.test.ts`; if missing, create with just the new tests for the fast-path fields).

- [ ] **Step 1: Check whether a sessions schema test file already exists**

Run: `ls packages/schemas/src/sessions.test.ts 2>/dev/null && echo EXISTS || echo MISSING`

If MISSING, the test file will be created in step 2. If EXISTS, append new tests to the bottom of that file.

- [ ] **Step 2: Write the failing test for new optional signal fields**

If the file does not exist, create `packages/schemas/src/sessions.test.ts` with this content (only the new test cases). If it exists, append the four `it(...)` blocks below into the existing top-level `describe('extractedInterviewSignalsSchema', ...)` block (or wrap in one if the file has no such block):

```typescript
import { describe, it, expect } from '@jest/globals';
import { extractedInterviewSignalsSchema } from './sessions.ts';

describe('extractedInterviewSignalsSchema — fast-path fields', () => {
  it('accepts interestContext as a record of label → context', () => {
    const parsed = extractedInterviewSignalsSchema.safeParse({
      goals: [],
      experienceLevel: 'beginner',
      currentKnowledge: '',
      interests: ['football'],
      interestContext: { football: 'free_time' },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts analogyFraming as one of three values', () => {
    for (const value of ['concrete', 'abstract', 'playful'] as const) {
      const parsed = extractedInterviewSignalsSchema.safeParse({
        goals: [],
        experienceLevel: 'beginner',
        currentKnowledge: '',
        analogyFraming: value,
      });
      expect(parsed.success).toBe(true);
    }
  });

  it('rejects an invalid analogyFraming value', () => {
    const parsed = extractedInterviewSignalsSchema.safeParse({
      goals: [],
      experienceLevel: 'beginner',
      currentKnowledge: '',
      analogyFraming: 'sarcastic',
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts paceHint as { density, chunkSize }', () => {
    const parsed = extractedInterviewSignalsSchema.safeParse({
      goals: [],
      experienceLevel: 'beginner',
      currentKnowledge: '',
      paceHint: { density: 'low', chunkSize: 'short' },
    });
    expect(parsed.success).toBe(true);
  });

  it('all new fields are optional — minimal payload still parses', () => {
    const parsed = extractedInterviewSignalsSchema.safeParse({
      goals: [],
      experienceLevel: 'beginner',
      currentKnowledge: '',
    });
    expect(parsed.success).toBe(true);
  });
});
```

- [ ] **Step 3: Run the failing tests**

Run: `pnpm exec nx test schemas --testPathPattern=sessions.test.ts`
Expected: 5 failing tests (the new fields are not in the schema yet).

- [ ] **Step 4: Add the new optional fields to the schema**

Edit `packages/schemas/src/sessions.ts:46-54`. Replace the existing `extractedInterviewSignalsSchema` block with:

```typescript
// Interest context — narrow the meaning of an extracted interest to school
// vs free-time vs both. The interview prompt infers this when the transcript
// makes the register obvious; ambiguous interests default to 'both'.
export const interestContextValueSchema = z.enum(['school', 'free_time', 'both']);
export type InterestContextValue = z.infer<typeof interestContextValueSchema>;

// Analogy framing — the LLM's read of the learner's preferred analogy register.
// Mentor uses this to bias example choice in early sessions; defaults to
// 'concrete' downstream when missing (safest for ages 11-14 per spec).
export const analogyFramingSchema = z.enum(['concrete', 'abstract', 'playful']);
export type AnalogyFraming = z.infer<typeof analogyFramingSchema>;

// Pace hint — derived MECHANICALLY from transcript message length, not from
// the LLM. `density` reflects how much info the learner packs per turn;
// `chunkSize` reflects how much they tolerate back. Mentor uses both to
// calibrate response density in session 1.
export const paceHintSchema = z.object({
  density: z.enum(['low', 'medium', 'high']),
  chunkSize: z.enum(['short', 'medium', 'long']),
});
export type PaceHint = z.infer<typeof paceHintSchema>;

export const extractedInterviewSignalsSchema = z.object({
  goals: z.array(z.string()),
  experienceLevel: z.string(),
  currentKnowledge: z.string(),
  interests: z.array(z.string()).optional(),
  // Fast-path additions (spec 2026-05-05). All optional — consumers must
  // tolerate missing fields and apply server-side defaults.
  interestContext: z.record(z.string(), interestContextValueSchema).optional(),
  analogyFraming: analogyFramingSchema.optional(),
  paceHint: paceHintSchema.optional(),
});
export type ExtractedInterviewSignals = z.infer<
  typeof extractedInterviewSignalsSchema
>;
```

- [ ] **Step 5: Re-run the tests**

Run: `pnpm exec nx test schemas --testPathPattern=sessions.test.ts`
Expected: All 5 tests pass.

- [ ] **Step 6: Run schemas typecheck**

Run: `pnpm exec nx run schemas:typecheck`
Expected: Clean exit, no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/schemas/src/sessions.ts packages/schemas/src/sessions.test.ts
/commit
```

Suggested message: `feat(schemas): add interestContext, analogyFraming, paceHint to interview signals`

---

### Task 2: Add consumer audit test for additive JSONB tolerance

**Files:**
- Test: `tests/integration/onboarding.integration.test.ts` (extend existing).

The schema-extension consumer audit (spec § "Schema-extension consumer audit") requires a round-trip integration test confirming the JSONB column tolerates the new fields and that none of the consumers use `.parse()` strictly.

- [ ] **Step 1: Find the existing integration test for draft persistence**

Run: `Grep --pattern="extractedSignals" --path=tests/integration/onboarding.integration.test.ts -n`
Expected output: line numbers showing existing test scaffolding to copy from.

- [ ] **Step 2: Write the failing round-trip test**

Append the following test inside the top-level `describe(...)` block in `tests/integration/onboarding.integration.test.ts`. Match the existing harness pattern (db setup, `seedProfile`, etc.) by copying the closest sibling test's setup verbatim — do not invent new helpers.

```typescript
it('round-trips fast-path signals through onboardingDrafts JSONB column', async () => {
  // Setup: seed profile + subject + draft using the same helpers the
  // existing tests in this file use. Insert a draft with the new fields,
  // reload via the GET interview-state endpoint, and assert the new fields
  // survive the JSONB serialization round-trip.
  const { profileId, subjectId } = await seedProfileWithSubject();
  const fullSignals = {
    goals: ['learn calculus'],
    experienceLevel: 'beginner',
    currentKnowledge: 'algebra basics',
    interests: ['football', 'dinosaurs'],
    interestContext: { football: 'free_time', dinosaurs: 'both' },
    analogyFraming: 'concrete',
    paceHint: { density: 'medium', chunkSize: 'short' },
  };
  await insertCompletedDraft({
    profileId,
    subjectId,
    extractedSignals: fullSignals,
    exchangeHistory: [{ role: 'user', content: 'hi' }],
  });

  const res = await app.request(`/api/subjects/${subjectId}/interview`, {
    headers: testAuthHeaders(profileId),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.state.extractedSignals).toEqual(fullSignals);
});
```

If `seedProfileWithSubject` / `insertCompletedDraft` / `testAuthHeaders` do NOT already exist in the file, find the closest equivalents already in use in this test file by reading the file's imports and the first 100 lines, and substitute. Do not create new helpers in this task.

- [ ] **Step 3: Run the test (expected to fail because the schema's `extractedInterviewSignalsSchema.safeParse` in `routes/interview.ts:483` currently strips unknown fields)**

Run: `cd apps/api && pnpm exec jest --config=../../jest.integration.config.cjs --testPathPattern=onboarding.integration -t "round-trips fast-path signals"`
Expected: Test fails because `extractedSignals` returned in the response is missing the three new fields (Zod's default behavior is to silently drop unknown keys when the schema doesn't include them).

NOTE: After Task 1 the schema already accepts the new fields, so this test should now PASS. If it does not, the failure is a real bug — investigate before claiming success. Do not weaken the assertion; if the JSONB driver coerces something (e.g. nested object key ordering), update the assertion to deep-equal the canonical shape, never to strip a field.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/onboarding.integration.test.ts
/commit
```

Suggested message: `test(onboarding): JSONB round-trip for fast-path interview signals`

---

### Task 3: Audit `extractedSignals` consumers for `.parse()` strictness

**Files:**
- Read-only audit. No code edits unless audit surfaces a `.parse()` or `.strict()` call.

The 19 consumer files were enumerated in the spec. This task is a forward-looking audit — finding ANY `.parse(` (not `.safeParse(`) on `extractedInterviewSignalsSchema` would be a blocker because writes from Task 1 onward would throw on legacy drafts that lack the new fields. The schema is fully additive + optional, but `.strict()` would still reject unknowns in the wrong direction.

- [ ] **Step 1: Grep for `.parse(` against the schema**

Run: `Grep --pattern="extractedInterviewSignalsSchema\\.parse\\(" --output_mode=content -n`
Expected: zero matches. If any match appears, replace `.parse(` with `.safeParse(` and route through an `if (parsed.success)` branch matching the pattern in `apps/api/src/routes/interview.ts:435,483`.

- [ ] **Step 2: Grep for `.strict()` chained on the schema**

Run: `Grep --pattern="extractedInterviewSignalsSchema.*strict" --output_mode=content -n`
Expected: zero matches. If any match appears, remove the `.strict()` call — the spec REQUIRES additive tolerance.

- [ ] **Step 3: Confirm `interview-persist-curriculum.ts` `ExtractedSignals` local type is a SUPERSET, not a subset**

Read `apps/api/src/inngest/functions/interview-persist-curriculum.ts:98-103` and confirm the local type `ExtractedSignals` only requires goals/experienceLevel/currentKnowledge/interests. The new fields don't need to be added because the file only reads `goals` and `interests` for cache-warmth and writes the whole `signals` object back as JSONB (which is `Record<string, unknown>` on the way in). No edit required — this is a read-only confirmation.

- [ ] **Step 4: No commit — audit only**

If an issue was found and fixed, that fix gets its own commit with a clear `chore(onboarding): widen extractedSignals consumer to tolerate fast-path fields` message. Otherwise, move to Task 4.

---

### Task 4: Add `inferPaceHint` mechanical heuristic

**Files:**
- Modify: `apps/api/src/services/interview.ts` (add export near `extractSignals`).
- Test: `apps/api/src/services/interview.test.ts` (add new `describe('inferPaceHint', ...)` block).

The pace heuristic is deliberately NOT an LLM call — see spec § "What the interview must absorb", row 4. It's a function of message length over the user turns of the transcript.

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/services/interview.test.ts` (find an existing `describe(...)` for `extractSignals` and add a sibling block):

```typescript
import { inferPaceHint } from './interview.ts';

describe('inferPaceHint', () => {
  it('returns short/low for terse user turns', () => {
    const hint = inferPaceHint([
      { role: 'user', content: 'ok' },
      { role: 'assistant', content: '...' },
      { role: 'user', content: 'idk' },
      { role: 'assistant', content: '...' },
      { role: 'user', content: 'sure' },
    ]);
    expect(hint).toEqual({ density: 'low', chunkSize: 'short' });
  });

  it('returns long/high for verbose user turns', () => {
    const longText = 'I really want to understand this because '.repeat(20);
    const hint = inferPaceHint([
      { role: 'user', content: longText },
      { role: 'assistant', content: '...' },
      { role: 'user', content: longText },
    ]);
    expect(hint).toEqual({ density: 'high', chunkSize: 'long' });
  });

  it('returns medium/medium for typical responses', () => {
    const hint = inferPaceHint([
      {
        role: 'user',
        content: 'I learned some basic algebra last year and want to do harder stuff',
      },
      { role: 'assistant', content: '...' },
      { role: 'user', content: 'I think I get fractions but exponents confuse me' },
    ]);
    expect(hint).toEqual({ density: 'medium', chunkSize: 'medium' });
  });

  it('returns medium/medium when there are no user turns (degenerate input)', () => {
    expect(inferPaceHint([])).toEqual({ density: 'medium', chunkSize: 'medium' });
  });

  it('ignores assistant turns when computing the average', () => {
    const longAssistant = 'verbose assistant '.repeat(50);
    const hint = inferPaceHint([
      { role: 'assistant', content: longAssistant },
      { role: 'user', content: 'ok' },
    ]);
    expect(hint).toEqual({ density: 'low', chunkSize: 'short' });
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `cd apps/api && pnpm exec jest --config=jest.config.ts --testPathPattern=services/interview.test.ts -t "inferPaceHint"`
Expected: all 5 tests fail because `inferPaceHint` is not exported.

- [ ] **Step 3: Implement `inferPaceHint`**

Add to `apps/api/src/services/interview.ts`, near the `extractSignals` function (immediately after the `MAX_EXTRACTED_INTERESTS` / `MAX_TRANSCRIPT_CHARS` constants block, around line 263):

```typescript
// Mechanical pace inference — derived from average user-turn length, not LLM.
// Thresholds chosen against the 5 fixture personas + manual inspection of
// recent prod transcripts (see spec § "What the interview must absorb").
// Tune via tests, not magic numbers in the prompt.
const PACE_SHORT_MAX_CHARS = 25;
const PACE_LONG_MIN_CHARS = 200;

export function inferPaceHint(
  exchangeHistory: ExchangeEntry[]
): { density: 'low' | 'medium' | 'high'; chunkSize: 'short' | 'medium' | 'long' } {
  const userTurns = exchangeHistory.filter((e) => e.role === 'user');
  if (userTurns.length === 0) {
    return { density: 'medium', chunkSize: 'medium' };
  }
  const totalChars = userTurns.reduce((sum, t) => sum + t.content.length, 0);
  const avg = totalChars / userTurns.length;
  if (avg < PACE_SHORT_MAX_CHARS) return { density: 'low', chunkSize: 'short' };
  if (avg >= PACE_LONG_MIN_CHARS) return { density: 'high', chunkSize: 'long' };
  return { density: 'medium', chunkSize: 'medium' };
}
```

- [ ] **Step 4: Re-run the tests**

Run: `cd apps/api && pnpm exec jest --config=jest.config.ts --testPathPattern=services/interview.test.ts -t "inferPaceHint"`
Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/interview.ts apps/api/src/services/interview.test.ts
/commit
```

Suggested message: `feat(interview): add inferPaceHint mechanical heuristic`

---

### Task 5: Extend `SIGNAL_EXTRACTION_PROMPT` to capture the two LLM-inferred fields

**Files:**
- Modify: `apps/api/src/services/interview-prompts.ts:29-45`
- Test: `apps/api/src/services/interview.test.ts` (add tests against `extractSignals` output shape).

Per spec, do NOT touch `INTERVIEW_SYSTEM_PROMPT`. All new signal capture goes in the post-hoc `SIGNAL_EXTRACTION_PROMPT`, which already returns a structured JSON blob and is parsed via `safeParse` at the boundary in `extractSignals` (`interview.ts:264-389`).

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/services/interview.test.ts` inside the existing `describe('extractSignals', ...)` block (or add a sibling if absent — match the file's existing mocking approach for the LLM client). The point is to test the parser, NOT the LLM, so you mock the LLM response.

```typescript
it('parses interestContext, analogyFraming, paceHint when the LLM returns them', async () => {
  // Match the file's existing routeAndCall mock pattern. Find the existing
  // mock setup at the top of the describe block and reuse the same hook.
  mockRouteAndCallReturns({
    response: JSON.stringify({
      goals: ['learn algebra'],
      experienceLevel: 'beginner',
      currentKnowledge: 'arithmetic',
      interests: ['football', 'dinosaurs'],
      interestContext: { football: 'free_time', dinosaurs: 'both' },
      analogyFraming: 'concrete',
    }),
  });

  const signals = await extractSignals([
    { role: 'user', content: 'I love football and dinosaurs and want to learn algebra' },
    { role: 'assistant', content: '...' },
  ]);

  expect(signals.interestContext).toEqual({
    football: 'free_time',
    dinosaurs: 'both',
  });
  expect(signals.analogyFraming).toBe('concrete');
  // paceHint is mechanical, always present
  expect(signals.paceHint).toBeDefined();
});

it('omits interestContext / analogyFraming when the LLM does not emit them', async () => {
  mockRouteAndCallReturns({
    response: JSON.stringify({
      goals: ['learn algebra'],
      experienceLevel: 'beginner',
      currentKnowledge: 'arithmetic',
      interests: ['football'],
    }),
  });
  const signals = await extractSignals([
    { role: 'user', content: 'I want to learn algebra' },
  ]);
  expect(signals.interestContext).toBeUndefined();
  expect(signals.analogyFraming).toBeUndefined();
  expect(signals.paceHint).toBeDefined();
});

it('drops invalid analogyFraming values rather than failing extraction', async () => {
  mockRouteAndCallReturns({
    response: JSON.stringify({
      goals: [],
      experienceLevel: 'beginner',
      currentKnowledge: '',
      analogyFraming: 'sarcastic', // not in the enum
    }),
  });
  const signals = await extractSignals([
    { role: 'user', content: 'hi' },
  ]);
  expect(signals.analogyFraming).toBeUndefined();
});
```

If the file's existing tests do not already use a `mockRouteAndCallReturns` helper, find the actual mock setup pattern (likely a `jest.mock('./llm', () => ...)` at the top) and adapt the test setup to it — do NOT introduce a new mock util in this task.

- [ ] **Step 2: Run the failing tests**

Run: `cd apps/api && pnpm exec jest --config=jest.config.ts --testPathPattern=services/interview.test.ts -t "extractSignals"`
Expected: 3 tests fail because `extractSignals` doesn't read those fields out of the parsed JSON yet, and the new prompt instructions are not in place.

- [ ] **Step 3: Extend `SIGNAL_EXTRACTION_PROMPT`**

Replace `apps/api/src/services/interview-prompts.ts:29-45` with:

```typescript
export const SIGNAL_EXTRACTION_PROMPT = `You are MentoMate's signal extractor. Analyze the interview conversation and extract structured signals.

Return a JSON object with this exact structure:
{
  "goals": ["goal1", "goal2"],
  "experienceLevel": "beginner|intermediate|advanced",
  "currentKnowledge": "Brief description of what the learner already knows",
  "interests": ["short label 1", "short label 2"],
  "interestContext": { "label1": "school|free_time|both", "label2": "school|free_time|both" },
  "analogyFraming": "concrete|abstract|playful"
}

Rules for "interests":
- Short noun phrases (1-3 words) for hobbies, games, media, sports, or subjects the learner mentions with positive affect ("I love", "I'm into", "my favourite is").
- Do NOT include things they dislike, are scared of, or were forced to do.
- Do NOT include generic words like "learning", "school", "math" unless paired with specific context ("chess club", "football team").
- Max 8 items. Return [] if none are clearly stated.

Rules for "interestContext":
- One entry per "interests" label. The KEY must match a label exactly.
- "school" — the learner mentioned this as a school subject, class, club, or homework.
- "free_time" — clearly a hobby, leisure activity, or out-of-school interest.
- "both" — ambiguous, mentioned in both registers, or unclear from context. PREFER "both" when uncertain.
- Omit the entire field if no interests were extracted.

Rules for "analogyFraming":
- Pick ONE value based on the learner's own language style across the transcript.
- "concrete" — talks in physical examples, real-world objects, "like a..." comparisons. SAFE DEFAULT.
- "abstract" — talks in systems, rules, relationships, generalities; comfortable with abstract terms.
- "playful" — uses humor, exaggeration, games, characters, or media references in their own messages.
- Omit the field if the transcript is too thin (under 2 user turns or under 60 total user characters).

Be concise. Extract only what's clearly stated or strongly implied.`;
```

- [ ] **Step 4: Update `extractSignals` to read and validate the new fields**

In `apps/api/src/services/interview.ts`, modify the return statement of `extractSignals` (around lines 377-389). Replace the `return { ... }` block with:

```typescript
const interestContext = (() => {
  if (!parsed.interestContext || typeof parsed.interestContext !== 'object') {
    return undefined;
  }
  const out: Record<string, 'school' | 'free_time' | 'both'> = {};
  for (const [label, value] of Object.entries(parsed.interestContext as Record<string, unknown>)) {
    if (value === 'school' || value === 'free_time' || value === 'both') {
      // Only keep entries whose key matches an extracted interest — drops
      // labels the LLM hallucinated alongside the requested set.
      if (interests.some((i) => i.toLowerCase() === label.toLowerCase())) {
        out[label] = value;
      }
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
})();

const analogyFraming = (() => {
  const v = parsed.analogyFraming;
  return v === 'concrete' || v === 'abstract' || v === 'playful' ? v : undefined;
})();

const paceHint = inferPaceHint(exchangeHistory);

return {
  goals: rawGoals,
  experienceLevel:
    typeof parsed.experienceLevel === 'string' && parsed.experienceLevel
      ? parsed.experienceLevel
      : 'beginner',
  currentKnowledge:
    typeof parsed.currentKnowledge === 'string'
      ? parsed.currentKnowledge
      : '',
  interests,
  ...(interestContext ? { interestContext } : {}),
  ...(analogyFraming ? { analogyFraming } : {}),
  paceHint,
};
```

Also update the `extractSignals` return type signature at the top of the function (around lines 267-272) to include the new optional fields:

```typescript
export async function extractSignals(
  exchangeHistory: ExchangeEntry[],
  options?: { llmTier?: LLMTier }
): Promise<{
  goals: string[];
  experienceLevel: string;
  currentKnowledge: string;
  interests: string[];
  interestContext?: Record<string, 'school' | 'free_time' | 'both'>;
  analogyFraming?: 'concrete' | 'abstract' | 'playful';
  paceHint: { density: 'low' | 'medium' | 'high'; chunkSize: 'short' | 'medium' | 'long' };
}> {
```

The empty-fallback returns inside `extractSignals` (around lines 322-329 and 343-348) ALSO need updating to include `paceHint`, since paceHint is mechanical and always present:

```typescript
return {
  goals: [],
  experienceLevel: 'beginner',
  currentKnowledge: '',
  interests: [],
  paceHint: inferPaceHint(exchangeHistory),
};
```

Apply that change to BOTH fallback `return` blocks inside `extractSignals`.

- [ ] **Step 5: Re-run the tests**

Run: `cd apps/api && pnpm exec jest --config=jest.config.ts --testPathPattern=services/interview.test.ts`
Expected: all `extractSignals` tests pass.

- [ ] **Step 6: Run typecheck**

Run: `pnpm exec nx run api:typecheck`
Expected: clean. The Inngest function (`interview-persist-curriculum.ts:98`) declares `ExtractedSignals` locally — verify its `cached` access path still typechecks. If TS complains about the missing optional fields on the local type, EXTEND the local type, do not weaken the assertion in the Inngest function:

```typescript
type ExtractedSignals = {
  goals: string[];
  experienceLevel: string;
  currentKnowledge: string;
  interests: string[];
  interestContext?: Record<string, 'school' | 'free_time' | 'both'>;
  analogyFraming?: 'concrete' | 'abstract' | 'playful';
  paceHint?: { density: 'low' | 'medium' | 'high'; chunkSize: 'short' | 'medium' | 'long' };
};
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/interview-prompts.ts apps/api/src/services/interview.ts apps/api/src/services/interview.test.ts apps/api/src/inngest/functions/interview-persist-curriculum.ts
/commit
```

Suggested message: `feat(interview): extract interestContext, analogyFraming, paceHint signals`

---

### Task 6: Add eval-harness scenarios for the new dimensions

**Files:**
- Modify: `apps/api/eval-llm/flows/interview.ts`
- Create: snapshot files under `apps/api/eval-llm/snapshots/interview/`

Spec gates Phase 1 on: ≥15 scenarios (5 personas × 3 dimensions), preferably 30 (with 2 transcript variants per persona). The current `interview.ts` flow already enumerates 2 variants per profile (`subject-only` + `subject-book-focus`) — so 5 profiles × 2 variants = 10 base scenarios. Add a third variant per profile that exercises the new signal-extraction prompt downstream of a 3-turn transcript, and add `expectedResponseSchema` against the extended envelope so live-tier validation catches schema regressions.

- [ ] **Step 1: Read the existing flow and confirm the snapshot pattern**

Run: `Read apps/api/eval-llm/flows/interview.ts` (full file, ~150 lines).
Run: `Read apps/api/eval-llm/snapshots/quiz-capitals/11yo-czech-animals.md` (~60 lines) to see the snapshot format.

This is read-only; the goal is to confirm the new variant fits the existing FlowDefinition contract (`scenarioId`, `input`, `enumerateScenarios` shape, optional `expectedResponseSchema`).

- [ ] **Step 2: Add a `signal-extraction-after-3-turns` scenario variant**

Edit `apps/api/eval-llm/flows/interview.ts`. In `enumerateScenarios`, after the existing two-variant array, add a third entry per profile that simulates a 3-turn transcript and exercises the SIGNAL_EXTRACTION_PROMPT path. Because the existing `interviewFlow` definition only exercises the SYSTEM prompt (turn 1), this new variant needs to use the extraction prompt instead. Look at how `flows/session-recap.ts` handles a separate prompt — match that pattern.

If creating a separate flow file is cleaner, create `apps/api/eval-llm/flows/interview-signal-extraction.ts` (modeled on `interview.ts`) that runs `SIGNAL_EXTRACTION_PROMPT` over a 3-turn synthetic transcript per profile, with `expectedResponseSchema` set to:

```typescript
import { extractedInterviewSignalsSchema } from '@eduagent/schemas';
// ...
expectedResponseSchema: extractedInterviewSignalsSchema,
```

Register the new flow in `apps/api/eval-llm/runner/runner.ts` alongside the other flows (find the `flows = [...]` array and append).

- [ ] **Step 3: Run the eval harness in snapshot-only mode**

Run: `pnpm eval:llm --flow interview-signal-extraction`
Expected: harness runs offline against fixtures, produces 5 new snapshot files under `apps/api/eval-llm/snapshots/interview-signal-extraction/`. NO live LLM call yet.

- [ ] **Step 4: Run the live tier against the new flow**

Run: `pnpm eval:llm --live --flow interview-signal-extraction`
Expected: real LLM calls succeed and the responses validate against `extractedInterviewSignalsSchema`. If any sample fails schema validation, the prompt phrasing in Task 5 must be tightened — do NOT loosen the schema.

- [ ] **Step 5: Commit baseline metrics**

Run: `pnpm eval:llm --update-baseline --flow interview-signal-extraction`
This writes a new baseline JSON used by the CI guard. Commit the baseline alongside the snapshots.

- [ ] **Step 6: Commit**

```bash
git add apps/api/eval-llm/flows/interview-signal-extraction.ts apps/api/eval-llm/runner/runner.ts apps/api/eval-llm/snapshots/interview-signal-extraction/ apps/api/eval-llm/baseline*.json
/commit
```

Suggested message: `test(eval-llm): scenarios + baseline for fast-path interview signal extraction`

---

### Task 7: Phase 1 verification gate

- [ ] **Step 1: Run all unit + integration tests for the API**

Run: `pnpm exec nx run api:test`
Expected: green.

Run: `pnpm exec jest --config=jest.integration.config.cjs --testPathPattern=onboarding.integration`
Expected: green, including the new round-trip test from Task 2.

- [ ] **Step 2: Run typecheck across the workspace**

Run: `pnpm exec nx run-many -t typecheck`
Expected: clean.

- [ ] **Step 3: Confirm no consumer was broken**

Re-grep:
Run: `Grep --pattern="extractedSignals" --output_mode=files_with_matches`
Expected: same 19 files as in the spec audit. Read any test files that aren't already passing in step 1 individually.

- [ ] **Step 4: Mark Phase 1 complete**

Phase 1 is shippable on its own: schema is additive, prompt change is additive, no routing changes. If Phase 2 is delayed, Phase 1 still has value (fast-path signals get captured and surface to the bypassed screens unchanged, ready for the Settings affordance to read them later).

---

## Phase 2 — Routing fast path (build-time constant, gated)

**Decisions to confirm BEFORE starting Task 8:**
- Open Q1 (language-setup decision) is captured in the spec.
- Open Q5 (engagement metric) is captured in the spec.

If either is unanswered, stop and ask the user. Do not invent metrics or default the language-setup design.

### Task 8: Add `ONBOARDING_FAST_PATH` build-time flag

**Files:**
- Modify: `apps/mobile/src/lib/feature-flags.ts`
- Modify: `apps/api/src/config.ts` (add the env var)
- Test: `apps/mobile/src/lib/feature-flags.test.ts` (create if missing)

The spec is explicit: this repo has no runtime feature-flag service. The flag is a build-time constant; flipping it requires a code change + OTA + Worker redeploy.

- [ ] **Step 1: Add the mobile flag**

Edit `apps/mobile/src/lib/feature-flags.ts`. Add inside the `FEATURE_FLAGS` object:

```typescript
  // Subject onboarding fast path (spec docs/specs/2026-05-05-subject-onboarding-fast-path.md).
  // When true: bypasses interests-context, analogy-preference, accommodations,
  // curriculum-review screens between interview and tutoring. Build-time only —
  // flipping requires OTA + Worker redeploy. Default false until staging bake.
  ONBOARDING_FAST_PATH: false,
```

- [ ] **Step 2: Add the API config flag**

Edit `apps/api/src/config.ts`. Inside the `envSchema = z.object({...})` block, add:

```typescript
  // Subject onboarding fast path — see mobile feature-flags.ts for context.
  // When 'true', backend pre-warms curriculum so Mentor turn 1 can read it
  // without the user passing through curriculum-review.
  ONBOARDING_FAST_PATH: z.enum(['true', 'false']).default('false'),
```

If the file uses a transform/derive pattern downstream to expose typed config, locate that block and add a derived boolean accessor in the same style as existing entries (do NOT add raw `process.env` reads anywhere else — eslint G4 enforces typed config use).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/lib/feature-flags.ts apps/api/src/config.ts apps/api/src/config.test.ts
/commit
```

Suggested message: `feat(onboarding): add ONBOARDING_FAST_PATH build-time flag (default off)`

---

### Task 9: Branch `interview.tsx`'s `goToNextStep` on the flag

**Files:**
- Modify: `apps/mobile/src/app/(app)/onboarding/interview.tsx:115-182`
- Test: `apps/mobile/src/app/(app)/onboarding/interview.test.tsx`

When `ONBOARDING_FAST_PATH` is true, the post-interview navigation must:
- For non-language subjects: skip `interests-context` + `analogy-preference` + `accommodations` + `curriculum-review`. The screen ALREADY transitions silently into a learning session via `transitionToSession` (lines 239-280) — so the desired behavior is: do NOT call `router.replace` to interests-context, INSTEAD call `transitionToSession()`. Note `transitionToSession` is invoked from elsewhere in the file when `interviewComplete` flips — verify whether `goToNextStep` is on a code path that should now never fire when the flag is on, OR whether `goToNextStep` is the ONLY caller and the fast-path simply replaces its body.
- For `four_strands` subjects (`languageCode` set): keep routing to `language-setup` (Decision 1 = (a)); `language-setup`'s own `handleContinue` is updated in Task 10.

- [ ] **Step 1: Read `interview.tsx` lines 115-280 to map `goToNextStep` callers**

Run: `Grep --pattern="goToNextStep" --path=apps/mobile/src/app/(app)/onboarding/interview.tsx -n`
Expected: see all caller sites and confirm whether `goToNextStep` always runs when interview-complete OR if it's an alternate path. The fast-path branch must produce the same end-state as `transitionToSession` for non-language subjects.

- [ ] **Step 2: Write the failing tests**

Add to `apps/mobile/src/app/(app)/onboarding/interview.test.tsx`. Find the existing test file's setup pattern (it likely already mocks `useRouter`, `useInterviewState`, etc.) and add:

```typescript
import { FEATURE_FLAGS } from '../../../lib/feature-flags';

describe('InterviewScreen — fast-path routing', () => {
  // Each test toggles the read-only constant via jest's module-mock pattern
  // already used for FEATURE_FLAGS in this file. If no existing pattern,
  // mock the entire feature-flags module per test.

  it('routes directly to a learning session for a non-language subject when ONBOARDING_FAST_PATH=true', async () => {
    jest.replaceProperty(FEATURE_FLAGS, 'ONBOARDING_FAST_PATH', true);
    const { router, startSessionMock } = renderInterviewWithCompletedDraft({
      languageCode: undefined,
      extractedSignals: { interests: ['football'], goals: [], experienceLevel: 'beginner', currentKnowledge: '' },
    });
    // Trigger the post-interview navigation pathway
    await fireInterviewComplete();
    expect(router.replace).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(app)/onboarding/interests-context' })
    );
    expect(startSessionMock).toHaveBeenCalledTimes(1);
  });

  it('still routes to interests-context when ONBOARDING_FAST_PATH=false', async () => {
    jest.replaceProperty(FEATURE_FLAGS, 'ONBOARDING_FAST_PATH', false);
    const { router } = renderInterviewWithCompletedDraft({
      languageCode: undefined,
      extractedSignals: { interests: ['football'], goals: [], experienceLevel: 'beginner', currentKnowledge: '' },
    });
    await fireInterviewComplete();
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(app)/onboarding/interests-context' })
    );
  });

  it('still routes to language-setup for four_strands subjects when fast-path is on', async () => {
    jest.replaceProperty(FEATURE_FLAGS, 'ONBOARDING_FAST_PATH', true);
    const { router } = renderInterviewWithCompletedDraft({
      languageCode: 'es',
      extractedSignals: { interests: [], goals: [], experienceLevel: 'beginner', currentKnowledge: '' },
    });
    await fireInterviewComplete();
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(app)/onboarding/language-setup' })
    );
  });
});
```

If the test file doesn't already have helpers like `renderInterviewWithCompletedDraft` or `fireInterviewComplete`, scan the existing tests, copy the closest setup verbatim, and rename inline. Do NOT introduce a new util module.

- [ ] **Step 3: Run the failing tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\\(app\\)/onboarding/interview.test.tsx --no-coverage`
Expected: all 3 fast-path tests fail.

- [ ] **Step 4: Modify `goToNextStep` to branch on the flag**

Edit `apps/mobile/src/app/(app)/onboarding/interview.tsx:115-182`. At the very top of the `goToNextStep` `useCallback` body, add:

```typescript
import { FEATURE_FLAGS } from '../../../lib/feature-flags';
// ...inside the file, top of useCallback:

if (FEATURE_FLAGS.ONBOARDING_FAST_PATH) {
  // Fast path: skip interests-context, analogy-preference, accommodations,
  // curriculum-review. For language subjects, still route to language-setup —
  // L1 + CEFR matter for language pedagogy from turn 1 (see spec Open Q1).
  // For non-language subjects, transition straight into a learning session.
  if (languageCode) {
    router.replace({
      pathname: '/(app)/onboarding/language-setup',
      params: {
        ...baseParams,
        languageCode,
        languageName: languageName ?? '',
      },
    } as never);
    return;
  }
  void transitionToSession();
  return;
}

// ... existing legacy logic from line 125 onward stays unchanged.
```

Update the `useCallback` dependency array to include `transitionToSession`.

- [ ] **Step 5: Re-run the tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\\(app\\)/onboarding/interview.test.tsx --no-coverage`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/app/(app)/onboarding/interview.tsx apps/mobile/src/app/(app)/onboarding/interview.test.tsx
/commit
```

Suggested message: `feat(onboarding): fast-path routing in interview.tsx behind FEATURE_FLAGS.ONBOARDING_FAST_PATH`

---

### Task 10: Branch `language-setup.tsx`'s `handleContinue` on the flag

**Files:**
- Modify: `apps/mobile/src/app/(app)/onboarding/language-setup.tsx:128-163`
- Test: `apps/mobile/src/app/(app)/onboarding/language-setup.test.tsx`

When the flag is on, after `configureLanguageSubject.mutateAsync` succeeds, route into a learning session instead of `accommodations`. Reuse the same `useStartSession`/`useStreamMessage` pattern that `interview.tsx` uses; if that's heavy, the simpler choice is to navigate to a route that creates the session (e.g. `/(app)/session?subjectId=...&autoStart=true`) — but check first what existing route matches.

- [ ] **Step 1: Confirm the destination route used by `interview.tsx`'s `transitionToSession`**

Run: `Grep --pattern="setActiveSessionId" --path=apps/mobile/src/app/(app)/onboarding/interview.tsx -n -A 5`
Expected: shows that `transitionToSession` calls `useStartSession.mutateAsync(...)` then sets local state to render the session phase inline. The same approach won't work in `language-setup` because that screen doesn't host the session UI. Instead, navigate to the standalone session route (`/(app)/session`) the way other places do.

Run: `Grep --pattern="pathname.*'/\\(app\\)/session'" --path=apps/mobile/src --output_mode=content -n -A 3`
Expected: see existing `router.replace({ pathname: '/(app)/session', params: { subjectId, ... } })` invocations to copy.

- [ ] **Step 2: Write the failing tests**

Add to `language-setup.test.tsx`:

```typescript
it('routes to /(app)/session when ONBOARDING_FAST_PATH=true', async () => {
  jest.replaceProperty(FEATURE_FLAGS, 'ONBOARDING_FAST_PATH', true);
  const { getByTestId, router, configureMock } = renderLanguageSetup();
  configureMock.mockResolvedValueOnce({ ok: true });
  fireEvent.press(getByTestId('language-setup-continue'));
  await waitFor(() => expect(router.replace).toHaveBeenCalled());
  expect(router.replace).toHaveBeenCalledWith(
    expect.objectContaining({ pathname: '/(app)/session' })
  );
  expect(router.replace).not.toHaveBeenCalledWith(
    expect.objectContaining({ pathname: '/(app)/onboarding/accommodations' })
  );
});

it('still routes to accommodations when ONBOARDING_FAST_PATH=false', async () => {
  jest.replaceProperty(FEATURE_FLAGS, 'ONBOARDING_FAST_PATH', false);
  const { getByTestId, router, configureMock } = renderLanguageSetup();
  configureMock.mockResolvedValueOnce({ ok: true });
  fireEvent.press(getByTestId('language-setup-continue'));
  await waitFor(() =>
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(app)/onboarding/accommodations' })
    )
  );
});
```

Re-use the existing test file's render helpers; if missing, copy the closest sibling test's setup verbatim.

- [ ] **Step 3: Run the failing tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\\(app\\)/onboarding/language-setup.test.tsx --no-coverage`
Expected: 2 new tests fail.

- [ ] **Step 4: Modify `handleContinue`**

Edit `apps/mobile/src/app/(app)/onboarding/language-setup.tsx`. Add `import { FEATURE_FLAGS } from '../../../lib/feature-flags';` at the top. Replace the `router.replace` block inside `handleContinue` (lines 147-157) with:

```typescript
if (cancelledRef.current) return;
if (FEATURE_FLAGS.ONBOARDING_FAST_PATH) {
  router.replace({
    pathname: '/(app)/session',
    params: {
      mode: 'learning',
      subjectId,
      subjectName: subjectName ?? languageName ?? '',
    },
  } as never);
  return;
}
router.replace({
  pathname: '/(app)/onboarding/accommodations',
  params: {
    subjectId,
    subjectName: subjectName ?? languageName ?? '',
    languageCode: languageCode ?? '',
    languageName: languageName ?? '',
    step: String(Math.min(step + 1, totalSteps)),
    totalSteps: String(totalSteps),
  },
} as never);
```

- [ ] **Step 5: Re-run the tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\\(app\\)/onboarding/language-setup.test.tsx --no-coverage`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/app/(app)/onboarding/language-setup.tsx apps/mobile/src/app/(app)/onboarding/language-setup.test.tsx
/commit
```

Suggested message: `feat(onboarding): fast-path routing in language-setup.tsx behind FEATURE_FLAGS.ONBOARDING_FAST_PATH`

---

### Task 11: Add curriculum hand-off integration test

**Files:**
- Test: `tests/integration/onboarding.integration.test.ts` (extend existing)

Spec § "Curriculum hand-off — verified before Phase 2" requires an integration test asserting that the first tutoring turn references the materialized curriculum without the user passing through curriculum-review. The Inngest function `interview-persist-curriculum.ts` writes topics; the session-creation path reads them. This test exercises that hand-off.

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/onboarding.integration.test.ts`:

```typescript
it('first tutoring session sees the curriculum produced by interview-persist-curriculum', async () => {
  const { profileId, subjectId } = await seedProfileWithSubject();

  // Drive the interview to completion via the API + run the Inngest
  // function inline (the test harness already supports inline-step running
  // for Inngest — confirm by finding any existing test in this file that
  // calls `runInngestStep` or similar).
  await completeInterviewAndPersistCurriculum({
    profileId,
    subjectId,
    transcript: [
      { role: 'user', content: 'I want to learn algebra' },
      { role: 'assistant', content: '...' },
    ],
  });

  // Start a learning session (mimicking the fast-path post-interview transition)
  const startRes = await app.request(`/api/sessions`, {
    method: 'POST',
    headers: { ...testAuthHeaders(profileId), 'content-type': 'application/json' },
    body: JSON.stringify({ subjectId, sessionType: 'learning', inputMode: 'text' }),
  });
  expect(startRes.status).toBe(201);
  const { session } = await startRes.json();

  // Assert the session's resolved topic comes from the curriculum
  const topicsRes = await app.request(`/api/subjects/${subjectId}/curriculum`, {
    headers: testAuthHeaders(profileId),
  });
  const { topics } = await topicsRes.json();
  expect(topics.length).toBeGreaterThan(0);
  expect(session.topicId).not.toBeNull();
  expect(topics.map((t: { id: string }) => t.id)).toContain(session.topicId);
});
```

If `completeInterviewAndPersistCurriculum` doesn't exist as a helper, look for the closest existing harness pattern in the file and inline-construct the equivalent (probably: insert a `completed` draft with extractedSignals, then call `dispatchInterviewPersist` or trigger the Inngest function directly via the test harness).

- [ ] **Step 2: Run the test**

Run: `cd apps/api && pnpm exec jest --config=../../jest.integration.config.cjs --testPathPattern=onboarding.integration -t "first tutoring session sees the curriculum"`
Expected: green if the existing curriculum hand-off works correctly. If RED, the spec's removal of `curriculum-review` exposes a real bug — investigate before proceeding. Common cause: `useStartSession` may rely on a `topicId` being explicitly passed in instead of resolved from the curriculum.

If the test fails because the session-start endpoint returns `topicId: null`, the fix is in the session-start service (likely `apps/api/src/services/session/session-topic.ts`): ensure it picks the first-sortOrder topic from the materialized curriculum when `topicId` is unspecified. That fix needs its own commit and follows the same TDD pattern as the rest of this plan.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/onboarding.integration.test.ts
/commit
```

Suggested message: `test(onboarding): integration test for curriculum hand-off without curriculum-review`

---

### Task 12: Add Maestro E2E flow for the fast path

**Files:**
- Create: `apps/mobile/e2e/flows/onboarding-fast-path.yaml`

The dev/staging build will have `ONBOARDING_FAST_PATH=true`. The E2E flow exercises: launch app → sign in → create-subject → interview (3 turns) → first tutoring exchange. Asserts NONE of the four bypassed screens render.

- [ ] **Step 1: Find the closest existing Maestro flow to model on**

Run: `Glob apps/mobile/e2e/flows/*onboard*.yaml` and `Glob apps/mobile/e2e/flows/*.yaml` (limit 30).
Expected: see the existing onboarding/learning flow patterns. Match the existing structure for: app launch parameters, auth, testID-based selectors.

- [ ] **Step 2: Write the new flow**

Create `apps/mobile/e2e/flows/onboarding-fast-path.yaml` modeled exactly on the closest sibling. Per the user's strict testing memory (`feedback_never_loosen_tests_to_pass`), use `id:` selectors (testIDs already present in `interview.tsx`, `create-subject.tsx`, the session screen). Include:
- `tapOn: id: subject-start-math`
- Wait for `interview` screen testID
- Send 3 messages
- Wait for the LEARNING SESSION testID (check `apps/mobile/src/app/(app)/session.tsx` for the canonical testID — likely something like `session-screen` or `chat-shell`)
- ASSERT: the testIDs `interests-context-continue`, `analogy-preference-continue` (look these up), `accommodations-continue`, `curriculum-review-screen` are NEVER visible during the run. Maestro's `assertNotVisible` is the correct primitive.

- [ ] **Step 3: Run the flow against the local emulator**

Pre-req: `feedback_emulator_issues_doc` says always read `e2e-emulator-issues.md` first. Confirm the local Android emulator is running with the dev build that has `ONBOARDING_FAST_PATH=true`.

Run: `cd apps/mobile && maestro test e2e/flows/onboarding-fast-path.yaml`
Expected: green. If any step fails because a testID doesn't match the actual screen, FIX THE TESTID — never replace `id:` with `text:` (per the user's testing memory).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/e2e/flows/onboarding-fast-path.yaml
/commit
```

Suggested message: `test(e2e): Maestro flow asserting fast-path skips the four bypassed screens`

---

### Task 13: Annotate the flow inventory

**Files:**
- Modify: `docs/flows/mobile-app-flow-inventory.md`

Per spec § "Phase 2", `interests-context`, `analogy-preference`, `accommodations`, `curriculum-review` are NOT deleted in this plan. They become bypassed-but-reachable. The inventory must reflect that.

- [ ] **Step 1: Read the current inventory entries for the four bypassed screens**

Run: `Grep --pattern="interests-context|analogy-preference|accommodations|curriculum-review" --path=docs/flows/mobile-app-flow-inventory.md -n`
Expected: line numbers for each entry.

- [ ] **Step 2: Annotate (do NOT delete) each entry**

For each of the four screens, add a one-line note in their entry:

> **Status (2026-05-05):** Bypassed when `FEATURE_FLAGS.ONBOARDING_FAST_PATH=true` (see `docs/specs/2026-05-05-subject-onboarding-fast-path.md`). Still reachable from legacy routing when the flag is off; deletion gated on Phase 4 + Settings affordance follow-up.

- [ ] **Step 3: Commit**

```bash
git add docs/flows/mobile-app-flow-inventory.md
/commit
```

Suggested message: `docs(flows): annotate fast-path bypassed screens`

---

### Task 14: Phase 2 verification gate

- [ ] **Step 1: Run the full mobile test suite**

Run: `pnpm exec nx run mobile:test`
Expected: green.

- [ ] **Step 2: Run the full API test suite**

Run: `pnpm exec nx run api:test`
Expected: green.

- [ ] **Step 3: Run the integration test pack**

Run: `pnpm exec jest --config=jest.integration.config.cjs --testPathPattern=onboarding.integration`
Expected: green, including Tasks 2 and 11 tests.

- [ ] **Step 4: Run typecheck workspace-wide**

Run: `pnpm exec nx run-many -t typecheck`
Expected: clean.

- [ ] **Step 5: Run the eval-llm baseline check**

Run: `pnpm eval:llm --check-baseline`
Expected: green; baselines committed in Task 6 still match. If drift is reported, investigate (do NOT just `--update-baseline` to make it green — the drift is information).

- [ ] **Step 6: Confirm the Phase 4 gate is documented in the spec**

Re-read `docs/specs/2026-05-05-subject-onboarding-fast-path.md` and confirm Open Q5 (engagement metric) was filled in BEFORE Phase 2 was merged. If empty, that's a spec failure — go back and capture the decision before merging.

---

## Phase 3 + Phase 4 — out of scope for this plan

- **Phase 3 — Settings affordance.** Needs its own spec covering: panel placement (Settings vs. More), copy, edit/clear semantics, which controls (analogy framing? interest context? accommodations?), how parent vs. learner editing differs, Plus-tier gating if applicable, and a fresh test plan. Block Phase 4 until it ships.
- **Phase 4 — Defaults flip + cleanup.** Cannot start until: (a) Phase 3 ships, (b) the engagement metric defined in Open Q5 reports within threshold for ≥2 weeks at 100% in prod, (c) the accommodation-data investigation in spec § "Accommodation data" decides on migration vs. drop. The deletion itself is mechanical (delete 4 route files + their tests + i18n keys + grep for orphans) but irreversible — gate carefully.

## Self-review notes (for the writer)

This plan covers spec §:
- "What the interview must absorb" — Tasks 1, 4, 5.
- "LLM envelope compliance" — Task 5 explicitly does NOT touch `INTERVIEW_SYSTEM_PROMPT`.
- "Schema-extension consumer audit" — Tasks 1, 2, 3, plus the type-update step in Task 5/6.
- "LLM eval coverage" — Task 6.
- "What 'interview as first tutoring turn' actually requires" — explicitly out of plan scope; Phase 2 keeps the interview screen for `focused_book`.
- "Where deferred personalization surfaces" — Phase 3 (deferred).
- "Failure Modes" — covered by integration tests (Tasks 2, 11), unit tests (Tasks 4, 5), and the existing skip-interview path which the fast-path inherits.
- "Migration / rollout — Phase 1" — Tasks 1-7.
- "Migration / rollout — Phase 2" — Tasks 8-14.
- "Migration / rollout — Phase 3 / Phase 4" — explicitly deferred.
- "Curriculum hand-off — verified before Phase 2" — Task 11.
- "Accommodation data — investigation required before Phase 4" — flagged as out of scope.
- "Open questions" — Q1 + Q5 enforced as pre-flight blockers; Q2-Q4 noted but not in scope (spec lean is no change).
