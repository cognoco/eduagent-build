# LLM Reliability & UX Audit

**Date:** 2026-04-18
**Status:** Phase 1 — Discovery (no code changes)
**Owner:** Zuzana + Claude
**Companion to:** [`2026-04-18-llm-personalization-audit.md`](2026-04-18-llm-personalization-audit.md)

## Purpose

This audit catalogs a different failure mode than the personalization audit. Where that audit asked "what data is wired into prompts", this one asks "how is the LLM's output trusted, and how does its persona land with real users."

It was triggered by a live-test finding: `[INTERVIEW_COMPLETE]` in the onboarding flow sometimes fails to emit, and when it does, the learner is trapped in the interview loop with no in-session recovery (F-042). That symptom turned out to be a **family** of free-text marker patterns driving real control-flow decisions across the main tutoring loop — not an isolated bug.

Seven findings, ranked by impact. The first is architectural and subsumes several others.

## The central finding: free-text markers drive critical decisions

**The anti-pattern:** a prompt asks the LLM to emit a `[MARKER]` token inside its free-text response, and server code parses the response with `.includes()` or regex to make a state-machine decision.

**Why it fails:** one token drift (the LLM shortens the marker, spells it differently, forgets it, puts it mid-sentence, or wraps it in quotes) breaks the decision. There is no retry. There is no fallback. There is no type system.

**The scope in this codebase:**

| # | Marker | File:line (parser) | Decision driven | Risk |
|---|---|---|---|---|
| 1.1 | `[INTERVIEW_COMPLETE]` | [`interview.ts:234, :280`](../../apps/api/src/services/interview.ts) | Close onboarding interview | **CRITICAL** — no in-session recovery |
| 1.2 | `[PARTIAL_PROGRESS]` | [`exchanges.ts:948`](../../apps/api/src/services/exchanges.ts), [`escalation.ts:108`](../../apps/api/src/services/escalation.ts) | Freeze escalation counter | **HIGH** — wrong escalation |
| 1.3 | `[NEEDS_DEEPENING]` | [`exchanges.ts:943`](../../apps/api/src/services/exchanges.ts) | Queue topic for remediation | **MEDIUM** — pedagogy, not UX |
| 2.1 | `{"notePrompt":true}` (JSON in free text) | [`exchanges.ts:861`](../../apps/api/src/services/exchanges.ts) | Show note-capture UI | **MEDIUM** — safe fallback |
| 2.2 | `{"fluencyDrill":{...}}` (JSON in free text) | [`language-prompts.ts:59`](../../apps/api/src/services/language-prompts.ts), [`exchanges.ts:890`](../../apps/api/src/services/exchanges.ts) | Show drill timer/score UI | **MEDIUM** — safe fallback |

Two JSON-in-free-text patterns are structurally the same anti-pattern as the bracket markers — they smuggle structured data inside an unstructured response and parse with regex. They have safer fallbacks (`null`) but carry the same fragility.

## Detailed findings (with verbatim evidence)

### F1.1 — `[INTERVIEW_COMPLETE]` (CRITICAL — user-trapping)

**Prompt** ([`interview.ts:52–58`](../../apps/api/src/services/interview.ts)):

> "wrap up with a short, encouraging summary of what you learned and an enthusiastic invitation to start learning together — for example 'I've got a great picture of where you are — let's dive in!' Then place the marker `[INTERVIEW_COMPLETE]` on its own line at the very end (after your message). The marker will be hidden from the learner, so your visible text should feel like a natural ending."

**Parser** ([`interview.ts:234`](../../apps/api/src/services/interview.ts)):

```ts
const isComplete = result.response.includes('[INTERVIEW_COMPLETE]');
const cleanResponse = result.response
  .replace('[INTERVIEW_COMPLETE]', '')
  .trim();
```

**Failure mode:** if the LLM drops, shortens, or misspells the marker, `isComplete=false`, the loop never closes, the learner has no recovery. Only the 7-day onboarding-draft TTL eventually expires it — which is a silent delete from the learner's perspective, not a recovery path.

**Bonus problem:** the prompt literally asks the LLM for "enthusiastic invitation" and prescribes a stock phrase (`"let's dive in!"`). This is both a fragility surface AND the fake-warm tone issue from finding F3 below. Two problems in six lines.

### F1.2 — `[PARTIAL_PROGRESS]` (HIGH — wrong escalation)

**Prompt** ([`escalation.ts:294–297`](../../apps/api/src/services/escalation.ts)):

> "Progress signaling: If the learner's response shows partial understanding — they have part of the concept right but are missing a key piece — include `[PARTIAL_PROGRESS]` on its own line at the end of your response. This tells the system the learner is moving forward and should not be escalated prematurely."

**Two divergent parsers** for the same marker — this is a latent bug:

```ts
// escalation.ts:108 — permissive (matches mid-sentence occurrences)
export function detectPartialProgress(aiResponse: string): boolean {
  return aiResponse.includes('[PARTIAL_PROGRESS]');
}

// exchanges.ts:948 — strict (only matches its own line)
export function detectPartialProgress(response: string): boolean {
  return /(?:^|\n)\[PARTIAL_PROGRESS\]\s*$/.test(response);
}
```

**Failure mode:** `session-exchange.ts:441` uses the **permissive** matcher to decide escalation; `exchanges.ts:948` uses the **strict** matcher to strip the token from the display. So a mid-sentence occurrence triggers a hold but does NOT get stripped, which means the learner sees the literal string `[PARTIAL_PROGRESS]` in the tutor's reply. Log the telemetry on that — it's probably happening already.

### F1.3 — `[NEEDS_DEEPENING]` (MEDIUM — pedagogy only)

**Prompt** ([`escalation.ts:277`](../../apps/api/src/services/escalation.ts), rung-5 exit protocol):

> "End your response with the marker `[NEEDS_DEEPENING]` on its own line (the system will flag this topic for review)."

**Parser** ([`exchanges.ts:943`](../../apps/api/src/services/exchanges.ts)):

```ts
export function detectNeedsDeepening(response: string): boolean {
  return /(?:^|\n)\[NEEDS_DEEPENING\]\s*$/.test(response);
}
```

**Failure mode:** false negative → topic silently not queued for remediation. Safe but wrong. False positive → topic incorrectly queued (and the `MAX_NEEDS_DEEPENING_PER_SUBJECT = 10` cap protects the UX).

### F2.1 — `{"notePrompt": true}` JSON-in-free-text (MEDIUM — graceful fallback)

**Prompt** ([`exchanges.ts:861–880`](../../apps/api/src/services/exchanges.ts)):

> "When you ask this, append a JSON block at the very end of your response on its own line: `{"notePrompt": true}` … The JSON block will be stripped before the learner sees it — they will only see your conversational text."

**Parser:** regex match on `/\n?\{"notePrompt":\s*true(?:,\s*"postSession":\s*true)?\}\s*$/`.

**Failure mode:** graceful — if missing, no note prompt shown. Same pattern class as the markers but lower risk.

### F2.2 — `{"fluencyDrill":{...}}` JSON-in-free-text (MEDIUM — language sessions)

**Prompt** ([`language-prompts.ts:59–67`](../../apps/api/src/services/language-prompts.ts)):

> "When you start a fluency drill … append this JSON on its own line at the very end of your message: `{"fluencyDrill":{"active":true,"durationSeconds":60}}`"

**Parser:** regex match on `/\n?\{"fluencyDrill":\s*\{[^}]*\}\s*\}\s*$/`.

**Failure mode:** graceful — if missing, drill UI silently doesn't activate.

### Near-miss: `detectUnderstandingCheck` mixed marker + free-text phrases

[`exchanges.ts:156–164`](../../apps/api/src/services/exchanges.ts) uses a list that mixes one real marker (`[UNDERSTANDING_CHECK]`) with six natural-language phrases (`'does that make sense'`, `'what do you think'`, `'in your own words'` etc.). Currently only drives behavioral telemetry — not control flow. Safe **today**. But if a future feature routes on `isUnderstandingCheck`, the free-text phrases become a control-flow surface with no reliability guarantee. Either make it a real marker or remove the natural-language entries from the list.

## What already works — the good pattern baseline

These flows already use `response.match(/\{[\s\S]*\}/)` + `JSON.parse` + Zod validation — the correct structured-output pattern. They serve as the template for migrating the marker flows:

| Flow | File |
|---|---|
| EVALUATE assessment | [`evaluate.ts`](../../apps/api/src/services/evaluate.ts) |
| TEACH_BACK rubric | [`teach-back.ts`](../../apps/api/src/services/teach-back.ts) |
| Dictation review + prepare-homework | [`dictation/`](../../apps/api/src/services/dictation/) |
| Session analysis | [`learner-profile.ts:1249`](../../apps/api/src/services/learner-profile.ts) |
| Filing | [`filing.ts`](../../apps/api/src/services/filing.ts) |
| Quiz generation (all 3) | [`quiz/`](../../apps/api/src/services/quiz/) |
| Subject classify / resolve | [`subject-classify.ts`](../../apps/api/src/services/subject-classify.ts) |
| Interview signal extraction | [`interview.ts`](../../apps/api/src/services/interview.ts) (ironically, the second call is clean; only the turn-by-turn completion detection is broken) |
| Book generation, curriculum, vocabulary-extract, language-detect, homework-summary, learner-input, assessments | various |

**There's no technical obstacle to migrating.** Every provider the router talks to (Gemini, OpenAI, Anthropic) supports either tool calling or response-format JSON. The bad pattern is legacy, not unavoidable.

## The migration pattern

Replace every marker with a parallel side-channel in structured output:

```
BEFORE:
  system prompt: "End with [PARTIAL_PROGRESS] on its own line if..."
  response: "Great attempt! The vertex is where the curve turns.\n[PARTIAL_PROGRESS]"
  parser:   response.includes('[PARTIAL_PROGRESS]')  // fragile

AFTER:
  system prompt: "Respond with JSON: {reply, signals: {partial_progress: bool, ...}}"
  response: {"reply": "Great attempt! ...", "signals": {"partial_progress": true}}
  parser:   validated.signals.partial_progress  // typed
```

With a **server-side hard cap** as belt + suspenders: after N exchanges, force `ready_to_finish = true` regardless of what the LLM returned. This makes the state machine fail-safe in the "model never declares done" case.

## Per-finding migration plan

| Finding | Schema field | Server cap | Break test |
|---|---|---|---|
| F1.1 INTERVIEW_COMPLETE | `ready_to_finish: boolean` | After exchange 6, force `true` | Simulate model returning `false` on exchange 7; assert close fires anyway |
| F1.2 PARTIAL_PROGRESS | `signals.partial_progress: boolean` | `MAX_PARTIAL_PROGRESS_HOLDS = 2` already exists — keep | Simulate 3 consecutive holds; assert escalation resumes on 4th |
| F1.3 NEEDS_DEEPENING | `signals.needs_deepening: boolean` | `MAX_NEEDS_DEEPENING_PER_SUBJECT = 10` exists — keep | Simulate 11th flag; assert it's dropped |
| F2.1 notePrompt | `ui_hints.note_prompt: {show, post_session}` | N/A (observational) | Simulate missing → assert UI doesn't appear (current fallback) |
| F2.2 fluencyDrill | `ui_hints.fluency_drill: {active, duration_s?, score?}` | Language sessions only | Simulate malformed → assert drill UI doesn't appear |

Response envelope for the main tutoring loop would look like:

```ts
interface ExchangeResponse {
  reply: string;                     // the message the learner sees
  signals: {
    partial_progress?: boolean;
    needs_deepening?: boolean;
    understanding_check?: boolean;
    ready_to_finish?: boolean;        // for interview; ignored in main loop
  };
  ui_hints?: {
    note_prompt?: { show: boolean; post_session?: boolean };
    fluency_drill?: { active: boolean; duration_s?: number; score?: {correct:number; total:number} };
  };
}
```

Five markers and two JSON-in-free-text patterns collapse into one schema with clear typing. Every existing `.includes()` / regex parser disappears.

## The eval harness can validate this migration

The harness I built supports this directly. The `FlowDefinition` type can be extended:

```ts
interface FlowDefinition<Input> {
  // existing fields...
  /** Optional — if set, Tier 2 live runs validate the response against it. */
  expectedResponseSchema?: ZodType;
}
```

Tier 2 live runs with a break-test matrix (see per-finding break tests above) prove the new contract holds before shipping. This is exactly the safety net your `feedback_fix_verification_rules.md` mandates: "Every fix tagged CRITICAL or HIGH in a security or data-integrity context must include at least one negative-path test."

## Other LLM-UX findings (not prompt-parsing anti-patterns)

These came from the same user-test pass but aren't part of the marker scan. Summarized because they belong in this audit rather than the personalization one.

### F3 — Tone register is fake-warm for kids

The exchange prompt opens with `"You are MentoMate, a personalised learning mate"`. The interview wrap-up prescribes `"enthusiastic invitation to start learning together"` and the stock phrase `"let's dive in!"`. For learners 11–17 these register as performative — kids detect over-performed warmth.

Three specific changes, all in [`exchanges.ts:buildSystemPrompt`](../../apps/api/src/services/exchanges.ts) + [`interview.ts`](../../apps/api/src/services/interview.ts):

| Current | Problem | Better |
|---|---|---|
| "I'm your learning mate" | Kids over 10 notice the cutesiness | "Hi, I'm here to help" |
| "Let's dive in!" | Corporate-onboarding energy | "You're all set. Ready?" |
| "Nice! That's exactly it." (every correct answer) | Condescending on the 5th repetition | Vary: "Yep, that's right", "Correct.", silence |
| "enthusiastic invitation" | Prompt asks for enthusiasm | Let the model be calm |

Also: the `getAgeVoice()` mapping at [`exchanges.ts`](../../apps/api/src/services/exchanges.ts) uses the same coarse 3-bucket `child/adolescent/adult` that the personalization audit flagged. An 11yo and a 13yo get the same tone register; they shouldn't.

**Measurable by the eval harness.** Tier 2 live runs on the 5-profile matrix would show the fake-warm output immediately and prove before/after tuning.

### F4 — "I'm done" button on every AI-driven screen

Already a rule (`feedback_human_override_everywhere.md`). The interview currently has only the LLM-chosen path to the curriculum. Add a secondary "I'm ready to start learning" button visible after ~3 exchanges that fires the same navigation. Same pattern for the Ask chat (already has it), homework, and dictation.

Mobile-layer work. Out of API-prompt scope but lives here because it's the UX partner of F1.1.

### F5 — Error messages in persona voice, not HTTP layer

Symptom from the test: a 422 error surfaced as "Subject is not configured for language learning" — a DB-column name, shown to a learner mid-onboarding. Your existing rule `Classify Errors Before Formatting` covers this at the API layer; the missing half is the UI layer rendering the typed error in persona voice with a concrete recovery button (e.g. "This subject isn't set up for language learning yet — want to try the standard path?" with a button that does that).

### F6 — Structured "I don't know" behavior — already exists, generalize it

[`use-subject-classification.ts:377`](../../apps/mobile/src/hooks/use-subject-classification.ts) shows the good pattern — when the LLM's topic classification has ambiguous candidates, the UI asks the user to pick. Generalize: every LLM response with `confidence < high` should surface an "Is this right?" tap target.

Note that the session-analysis prompt already asks the model for a `"confidence": "low" | "medium" | "high"` field. So the signal exists — the missing piece is downstream code that USES it for UI decisions rather than just writing it to the DB.

### F7 — Shorten the interview (3–5 → 2–3 exchanges)

One-line change to [`interview.ts:52`](../../apps/api/src/services/interview.ts). Attention budget is the scarcest resource in kid-facing products.

**Boundary condition to check:** [`learner-profile.ts:1236`](../../apps/api/src/services/learner-profile.ts) currently requires `conversationEvents.length >= 3` before running session analysis. If the interview shortens to 2 exchanges, post-interview analysis won't fire. Either lower that threshold, or keep 3-minimum for post-session but allow 2 for interview specifically.

### F8 — Show the LLM's memory with sources

The mentor-memory screen exists but `buildMemoryBlock()` composes opaque strings like `"The learner keeps struggling with X"`. Each memory item should carry `{text, sourceSessionId, sourceEventId}` so:

- Kids can tap to see where the tutor "learned" something — builds healthy AI skepticism
- Parents get GDPR transparency
- Prompt-injection attempts become inspectable — alignment with your `feedback_llm_prompt_injection_surfacing.md` rule

Schema change to the memory block serialization; minor downstream UI work.

## Prioritized backlog

### P0 — Critical, fix soon

1. **F1.1 INTERVIEW_COMPLETE migration** — structured output + exchange cap. Covers F-042. Single-flow scope, immediate win. Blocked pattern for every other marker migration.
2. **F1.2 PARTIAL_PROGRESS divergent matchers** — trivial hotfix: unify both to the strict regex version. This is a present bug leaking raw tokens to learners. Should ship regardless of the larger migration.

### P1 — High, batch after P0

3. **F1.2 + F1.3 migration** to structured signals in the main exchange response envelope. Done together since both live on the same response.
4. **F3 tone pass** — rewrite the "learning mate" / "dive in" / "enthusiastic" phrases in exchanges + interview. Validate with Tier 2 harness runs on the 11/12/13/15/17yo profile matrix. Cheap, high-impact.

### P2 — Medium

5. **F2.1 + F2.2** note-prompt and fluency-drill migrations — same envelope as F1.2/F1.3, done at the same time.
6. **F6 confidence-aware UI** — surface low/medium confidence as a tap target. Schema exists, code doesn't yet.
7. **F7 shorten interview** (and lower the post-analysis threshold to match).
8. **F5 persona-voice errors** — typed error → UI render. Mobile-side.

### P3

9. **F8 memory-with-sources** — structured memory entries with back-links.
10. **F4 "I'm done" button** sweep across all AI-driven screens.
11. **Near-miss cleanup** — either remove the natural-language phrases from `UNDERSTANDING_CHECK_PATTERNS` or keep `[UNDERSTANDING_CHECK]` as the only entry.

## Relationship to the personalization audit

These audits share findings on age-bucketing (both call out the coarse `child/adolescent/adult` split) but otherwise cover non-overlapping failure modes:

- **Personalization audit** — "why does the 12yo dinosaur kid get the same generic prompt as the 16yo French-literature kid?"
- **Reliability audit** (this one) — "why does the tutor sometimes never finish the interview, and why does it sometimes say `[PARTIAL_PROGRESS]` out loud?"

Both should ship. Phase 3 tuning should sequence them — the reliability fixes are higher-priority because they're UX failures, not UX unfairnesses.

## Open questions

1. **Migration provider strategy** — do we use tool-calling where providers support it (more rigid, more reliable), or `response_format: json_schema` (simpler, recent Gemini/OpenAI feature), or fall back to "LLM returns JSON in plain text" with regex extraction (the current `filing`/`quiz` pattern)? Each has different reliability/provider-coverage trade-offs.
2. **Rollout cadence** — do we migrate all markers in one release, or one marker per release so rollback is precise? I'd lean "one per release" given the pattern touches the main tutoring loop.
3. **Telemetry during migration** — during rollout, does the system log every case where the old-parser result and new-parser result disagree? That's how we'd confirm no silent regressions.
4. **Break-test infrastructure** — Tier 2 live LLM calls burn credits. Do we run break tests on every PR, nightly, or only pre-release?

## What's next

Depending on how you want to attack this:

- **Fast path:** fix F1.2 divergent matchers as a standalone bugfix (15 min), then start F1.1 INTERVIEW_COMPLETE migration as the reference implementation (~1 session).
- **Planned path:** treat the migration as an architecture change, write an implementation plan covering the full envelope, review, ship.
- **Validation-first path:** extend the eval harness with `expectedResponseSchema` + break-test support first, then each migration gets validated before ship.

I recommend the **validation-first path** because every one of these findings ships risk to learners actively using the app; the harness pays for itself on the first migration.
