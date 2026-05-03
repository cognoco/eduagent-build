# Direction B — Prompt Tuning for the Main Tutoring Loop

**Status:** Draft
**Date:** 2026-04-19
**Builds on:** [docs/specs/2026-04-18-llm-personalization-audit.md](2026-04-18-llm-personalization-audit.md), live UX probe of web preview (2026-04-19, TestKid profile), EXCH harness merge (`82c59107`)
**Prerequisites satisfied:** Exchanges eval harness now wired (`82c59107`), BKT-C.1/C.2 personalization pipeline end-to-end (`7d0e7b8d` + `18418c08`)
**Scope:** Five tuning changes to `buildSystemPrompt` in [apps/api/src/services/exchanges.ts](../../apps/api/src/services/exchanges.ts) plus one memory-block change in [apps/api/src/services/learner-profile.ts](../../apps/api/src/services/learner-profile.ts). Each change is independently shippable and independently testable via the EXCH harness. No UI changes, no new API routes.

---

## Problem Statement

A live web-preview probe (2026-04-19, kid persona on `TestKid`) tested the Ask / Learn / Homework flows and captured real LLM outputs. Three observations matter for this spec:

### Observation 1 — prompt instructions exist but aren't obeyed

The system prompt at [exchanges.ts:230-245](../../apps/api/src/services/exchanges.ts#L230-L245) explicitly tells the LLM:

> "Be warm but calm — don't over-perform. Vary acknowledgment when the learner gets something right (a simple 'yes, that's it', 'correct', or moving straight to the next idea all work). Silence after a correct answer is fine — not every right answer needs praise."

In live sessions, the LLM still opens replies with "That's a great question!" and follows correct answers with "That's correct!" — the exact praise filler the prompt forbids. The instruction is present but not effective.

Three candidate causes (not mutually exclusive):
- **Dilution** — the instruction is buried around line 245 of a ~700-line prompt, after many other sections. Transformer attention to early tokens is well-documented.
- **Default model behavior** — Gemini 2.5 Flash (the default at rungs 1-2) is tuned for helpful-and-enthusiastic across the board. Negative instructions ("do NOT say X") work less reliably than positive constraints ("reply in at most 2 sentences; never begin with an interjection").
- **Competing instructions** — the prompt elsewhere encourages warmth and check-ins. The LLM resolves the tension in favor of the positive framing.

### Observation 2 — pronunciation hints leak into text mode

Captured example (11yo kid, text-mode Ask session, prime-number question):

> "A prime number (say: prym NUM-ber) is a whole number greater than 1..."

Phonetic pronunciation guides in parentheses are valuable in voice mode (TTS actually reads them), but in text mode they read as babying. The prompt has a VOICE MODE block at [exchanges.ts:574](../../apps/api/src/services/exchanges.ts#L574) conditioning on `context.inputMode === 'voice'` — adds brevity rules, forbids markdown. There is **no symmetric text-mode block** that forbids pronunciation guides.

### Observation 3 — no self-modulation on streak

Captured sequence:
- Kid: "how do you know if a number is prime"
- LLM: defines + quizzes on 5
- Kid: "no" (correct)
- LLM: "That's correct!" + next quiz on 4

The LLM runs a linear drill. It does not notice "kid answered instantly, on the first try" as a signal to offer an escalation or a scope choice. The kid has access to UI chips (Too hard / Explain differently / Hint / Switch topic) that compensate, but the **LLM never volunteers the equivalent proactive offer**. The proactive load sits entirely on the UI; the prompt treats teaching as a one-way ladder.

### Plus: the existing audit's unmet P0/P1 items

The personalization audit ([docs/specs/2026-04-18-llm-personalization-audit.md](2026-04-18-llm-personalization-audit.md)) flagged four tuning opportunities on Surface 1 (exchanges) that were scoped for Phase 3 but haven't all shipped:

- **A)** Inject strengths alongside struggles into the memory block — currently 0% of strengths are surfaced to the prompt
- **B)** Inject active urgency signal (`urgency_boost_reason`) — captured by session-analysis, not reinjected
- **C)** Re-inject last session's summary + parking-lot questions at next session start — captured, not reinjected
- **D)** Audit age bracketing for the 11+ product constraint

Items A, B, C were partially addressed by `buildMemoryBlock` enrichment in commit `413ece4f` (strengths + urgency_boost_reason surfaced), but verification in the harness is still pending, and the session-summary re-injection has not shipped. Item D is still open — the prompt at [exchanges.ts:244](../../apps/api/src/services/exchanges.ts#L244) still names a 9-year-old and an adult as calibration anchors, both out of the 11+ product's range.

---

## Architectural Notes

Two honest observations before the design:

**The 700-line prompt is itself an architectural smell.** `buildSystemPrompt` at [exchanges.ts:218-572](../../apps/api/src/services/exchanges.ts#L218-L572) assembles ~15 conditional sections depending on context. Instructions buried mid-prompt compete for attention. No spec in this document fixes that — we patch specific lines. If prompt-compliance issues persist after Observation-1's fixes, the next lever is **restructuring the prompt into a small identity preamble + ordered skill sections**, not more text inside the current structure. Flagged as follow-up.

**Model choice is a lever this spec doesn't pull.** If Observation 1's compliance issues persist after the prompt edits, the honest next step is either (a) promoting tone-critical calls to premium tier (Claude Sonnet 4.6, which obeys nuanced tone instructions more reliably per the routing table in [llm/router.ts](../../apps/api/src/services/llm/router.ts)) or (b) adjusting the router-level preamble. Both are out of scope here but noted as downstream options if the harness shows prompt edits alone don't move the needle.

---

## Goals

- Reduce praise-filler (`"That's a great question!"`, `"That's correct!"`) in the tutoring loop — measured via eval-harness snapshots and live Tier-2 runs.
- Eliminate phonetic pronunciation guides in text-mode replies. Preserve them in voice mode.
- Introduce self-modulation: after 3-4 correct-in-a-row answers at the same difficulty, the LLM proactively offers an escalation or scope choice instead of continuing the drill.
- Surface `strengths`, `urgency_boost_reason`, and last-session summary in the memory block passed to `buildSystemPrompt`. Verify through behavior-harness assertions (prompt assembled with these fields contains expected anchor text).
- Rephrase the age-calibration paragraph in the base system prompt for the strict 11+ product (no 9yo, no adult anchor).
- Each change is independently shippable. The spec supports per-change rollout.

## Non-Goals

- **No architectural refactor of the 700-line prompt.** Restructuring into preamble + sections is a separate spec if prompt-compliance issues persist after these edits.
- **No new model-routing changes.** If Gemini Flash doesn't comply with the tuned prompt, the response is a separate discussion (routing changes, model upgrades, router preamble edits) — not this spec.
- **No UI changes.** Self-modulation is an LLM-text behavior in this spec. Future surfacing as structured escalation signals in the response envelope ([docs/specs/2026-04-18-llm-response-envelope.md](2026-04-18-llm-response-envelope.md)) would change the UI contract; out of scope here.
- **No U1 "real version".** The natural-language Continue-card `continueHint` was explicitly deferred from the copy sweep spec to Direction B. It is a **new** prompt surface (not a change to `buildSystemPrompt`), so it gets its own sub-spec within Direction B — not bundled into this one.
- **No changes to router-preamble personalization.** BKT-C.1/C.2 pipeline (conversation_language + pronouns) is already live end-to-end.
- **No changes to the 8 other LLM surfaces** (quiz-capitals, quiz-vocab, quiz-guess-who, dictation-generate, dictation-review, dictation-prepare-homework, filing, session-analysis). Those have their own backlog items in the audit; each warrants its own tuning pass.

---

## Scope Overview

| # | Change | File(s) | Audit ref | Harness flow | Independent? |
|---|---|---|---|---|---|
| B.1 | Elevate & tighten tone compliance | [exchanges.ts:230-245](../../apps/api/src/services/exchanges.ts#L230-L245) | (new finding) | `flows/exchanges` | ✓ |
| B.2 | Forbid pronunciation in text mode | [exchanges.ts:~574](../../apps/api/src/services/exchanges.ts#L574) (mirror the voice block) | (new finding) | `flows/exchanges` | ✓ |
| B.3 | Self-modulation on correct-streak | [exchanges.ts:buildSystemPrompt](../../apps/api/src/services/exchanges.ts#L218), plus new context field | (new finding) | `flows/exchanges` + new fixture | ✓ (with the fixture work) |
| B.4 | Session-summary re-injection in memory block | [learner-profile.ts:buildMemoryBlock](../../apps/api/src/services/learner-profile.ts) | Audit item C | `flows/exchanges` | ✓ |
| B.5 | Age-calibration rephrase for 11+ | [exchanges.ts:244](../../apps/api/src/services/exchanges.ts#L244), plus `getAgeVoice` anchors | Audit item D | `flows/exchanges` | ✓ |

Items A (strengths) and B (urgency) from the audit were addressed in commit `413ece4f` for the data plumbing. **This spec adds the harness-verification step for them** (B.4 covers it as part of the same memory-block work), to close the loop on the audit's P0/P1.

---

## B.1 — Elevate & tighten tone compliance

### Current state

The identity section ([exchanges.ts:228-237](../../apps/api/src/services/exchanges.ts#L228-L237)) is the first thing the LLM sees after `isLanguageMode` branching. It includes the "don't over-perform" instruction. Despite being near the top, the subsequent ~500 lines dilute attention, and Gemini Flash's default enthusiasm wins.

### Target behavior

The LLM acknowledges correct answers with minimal words (`"Right."` / `"Yes."`) or silence + next-step, at least 70% of the time across a fixed set of correct-answer fixtures. Praise-filler openers (`"That's a great question!"`, `"Great!"`, `"Awesome!"`, `"Excellent!"`, `"Perfect!"`) are rare — target < 10% of turns.

### Prompt change (approximate)

Rewrite the tone paragraph from its current narrative form into a **negative constraint list** at the top, followed by a short warmth anchor. Negative constraints are more model-reliable than exhortations.

Approximate diff intent (final wording tuned in implementation):

```text
-Be warm but calm — don't over-perform. Vary acknowledgment when the learner gets
-something right (a simple "yes, that's it", "correct", or moving straight to the
-next idea all work). Silence after a correct answer is fine — not every right
-answer needs praise.

+CRITICAL TONE CONSTRAINTS:
+- NEVER begin a response with: "That's a great question", "Great!",
+  "Awesome!", "Excellent!", "Perfect!", or similar filler openers.
+- When the learner answers correctly, use a single minimal acknowledgment
+  ("Yes.", "Right.", "Correct.") OR move straight to the next step without
+  an acknowledgment. Do not chain acknowledgment + restatement + praise.
+- Do not restate the learner's correct answer back to them before continuing
+  (the learner knows what they said).
+- Warmth is fine in the flow of teaching; performed enthusiasm is not.
```

### Risk

Over-correcting to a flat, robotic register. The eval harness must snapshot a diverse set of turns (correct, incorrect, question, emotional) and verify warmth is preserved in non-acknowledgment contexts.

### Verification

New harness scenario fixture: `fixtures/exchange-histories.ts::correctAnswerStreak` — a session history where the learner has just answered a math question correctly. The test runs the flow and asserts the generated reply:

- Does NOT start with any banned filler opener (regex on first 6 words).
- Is under 40 words.
- Is NOT just a restatement of the learner's answer.

Tier-1 (snapshot) catches regression; Tier-2 (`--live`) validates the edited prompt's actual compliance rate across 10 seeded variations of the correct-answer fixture. Report per-turn pass rate.

### Failure modes

| State | Trigger | Observable | Recovery |
|---|---|---|---|
| Compliance rate stays below target after prompt edit | Model still produces filler openers in > 30% of Tier-2 samples | Tier-2 run logs | Escalate to router-preamble changes or promote tone-critical calls to premium tier (Claude Sonnet 4.6). Both out of scope here; flagged as follow-up. |
| Register becomes robotic | Tier-2 warmth-sample (emotional-response fixture) returns terse cold replies | Snapshot review | Soften the warmth anchor; add explicit "use warmth when the learner seems unsure or discouraged" as a positive instruction. |

### Telemetry

Emit `app/llm.tone_check` event on each exchange with `{ sessionId, firstSixWords, wordCount, startsWithFiller: boolean }`. Populates a dashboard for drift detection post-launch.

---

## B.2 — Forbid pronunciation in text mode

### Current state

The prompt has a conditional VOICE MODE block at [exchanges.ts:574-578](../../apps/api/src/services/exchanges.ts#L574-L578) that tightens brevity and forbids markdown. It does NOT mirror the inverse — text mode has no instruction about pronunciation guides — so the LLM defaults to including them, at least for younger-sounding contexts.

### Target behavior

In text mode (`context.inputMode !== 'voice'` or undefined), the LLM never emits phonetic pronunciation guides in parentheses (e.g., `"prime (say: prym)"`). In voice mode, they stay — TTS reads them usefully.

**Exception:** language-learning subjects where pronunciation IS the teaching point. Detect via `context.pedagogyMode === 'four_strands'` (which indicates language learning).

### Prompt change

Add a symmetric TEXT MODE block near the VOICE MODE block:

```text
+  // Text mode — mirror of the voice-mode block, different constraints.
+  // Only applies when pedagogy is not four_strands (where pronunciation IS
+  // the teaching content).
+  if (context.inputMode !== 'voice' && !isLanguageMode) {
+    sections.push(
+      'TEXT MODE: The learner is reading, not listening. ' +
+        'Do NOT include phonetic pronunciation guides in parentheses ' +
+        '(e.g., "prime (say: prym)"). The learner can read the word. ' +
+        'Pronunciation guides belong in voice mode only.'
+    );
+  }
```

### Risk

Low. This is a narrow negative constraint on a specific formatting pattern.

### Verification

New fixture: `fixtures/exchange-histories.ts::textModeVocabTerm` — a math session where the LLM is about to introduce a technical term (e.g., "factor", "prime", "denominator"). The test asserts the reply does NOT match the regex `/\([^)]*(?:say:|pronounced:?)[^)]*\)/i`.

Second fixture: `voiceModeVocabTerm` — same setup but `inputMode: 'voice'`. Reply **may** contain pronunciation guides (assertion: not forbidden — this is a permission check, not a requirement).

Third fixture: `languageLearningSession` — a Spanish vocabulary session with `pedagogyMode: 'four_strands'`, text mode. Pronunciation guides ARE allowed (exception). Reply may contain them.

### Failure modes

| State | Trigger | Observable | Recovery |
|---|---|---|---|
| Language session in text mode loses pronunciation help | Four-strands text-mode exclusion misfires | Language-learning fixture regresses | The exception condition needs the `!isLanguageMode` guard verified in the fixture. Unit test the `buildSystemPrompt` output contains/excludes the TEXT MODE block correctly for each combination of `inputMode` × `pedagogyMode`. |
| LLM still emits pronunciation guides | Prompt added but not obeyed | Tier-2 snapshots show `/\(say:/` matches in text-mode replies | Same escalation path as B.1 — router-preamble or premium tier. |

### Telemetry

Emit `app/llm.text_mode_pronunciation_leak` on each text-mode exchange where the response regex matches. Counter useful for drift detection.

---

## B.3 — Self-modulation on correct-streak

### Current state

`ExchangeContext` contains `exchangeCount` (number of completed exchanges), but no signal about the **learner's answer-quality streak**. The prompt runs linearly: `exchangeCount === 0` triggers a fun-fact opener ([exchanges.ts:292-313](../../apps/api/src/services/exchanges.ts#L292-L313)), subsequent turns get no adaptive guidance.

### Target behavior

When the learner has given 3 or more consecutive correct answers at the same rung/topic, the LLM's next reply should include one of:

- An offer to escalate difficulty: *"You've got the basics. Want a harder one?"*
- An offer to change scope: *"You're fast at these. Want to learn the shortcut for big numbers?"*
- An offer to move on: *"Ready to try a different kind of problem?"*

The LLM should do this **naturally, in the flow of the reply**, not as a separate meta-question. The offer is a micro-phrase, not a lane-change modal. Teaching continues if the learner doesn't take the offer.

### Prompt change + context addition

Two interlocking changes:

**(a) Context addition (`ExchangeContext`):**

```ts
+  /**
+   * Consecutive-correct-at-same-rung streak. Computed server-side from
+   * recent exchange history. Values: 0 = no streak (or just answered
+   * incorrectly), n > 0 = n consecutive correct answers at the current
+   * escalation rung. Reset when rung changes or on any incorrect answer.
+   */
+  correctStreak?: number;
```

Computed in `session-exchange.ts::prepareExchangeContext` by walking recent `session_events` and counting consecutive `correctAnswer: true` events at the current `escalationRung`. Capped at 5 (no need to distinguish 5 from 10).

**(b) Prompt instruction section:**

```ts
+  // Adaptive escalation — when the learner is clearly on top of the
+  // current rung, offer a choice before mechanically drilling further.
+  if (context.correctStreak && context.correctStreak >= 3) {
+    sections.push(
+      `ADAPTIVE ESCALATION: The learner has answered ${context.correctStreak} ` +
+        'consecutive questions correctly at this level. Do NOT simply ask ' +
+        'another same-level question. Instead, in the natural flow of your ' +
+        'reply, offer one of:\n' +
+        '  (a) a harder version of the same concept ("Want a trickier one?"),\n' +
+        '  (b) a different angle or shortcut ("Want the fast way to check primes?"),\n' +
+        '  (c) transition to a related concept ("Ready for something different?").\n' +
+        'Make the offer a single short phrase, not a separate meta-question. ' +
+        'If the learner declines or does not engage with the offer, continue ' +
+        'teaching at the current level.'
+    );
+  }
```

### Risk

- **Over-firing:** LLM interrupts every turn with "want a harder one?" once the streak hits 3. Mitigation: streak resets on rung change. Also: harness fixture tests streak=3 offer and streak=4 offer; Tier-2 reviews for over-enthusiasm.
- **Under-firing:** LLM ignores the instruction. Mitigation: same compliance concern as B.1; may need router-preamble or model-tier escalation.
- **Computation cost:** `correctStreak` requires a walk of recent exchange events per prepare-exchange call. Likely under 10ms given existing DB indexes on session_events. Verify.

### Verification

New harness fixtures:
- `correctStreak_3`: session history with 3 consecutive correct answers. Assert reply contains at least one of: "trickier", "harder", "shortcut", "different" — OR contains `?` in the first 15 words (the offer takes the form of a question).
- `correctStreak_0`: recent incorrect answer. Assert reply does NOT contain escalation phrasing.
- `correctStreak_3_declined`: streak of 3 followed by learner's "nah, keep going" → next reply should resume same-level teaching, not push again.

### Failure modes

| State | Trigger | Observable | Recovery |
|---|---|---|---|
| `correctStreak` computation wrong | Server-side walk counts incorrectly (e.g., miscounts skipped turns) | Unit test | Pure-function unit test with fixture event streams; assert returned count per scenario. |
| LLM ignores the escalation instruction | Prompt added but Gemini Flash doesn't act on it | Tier-2 harness shows reply with no offer on streak=3 fixture | Same escalation path as B.1 (router-preamble, premium tier). |
| LLM over-fires the offer | LLM inserts "want a harder one?" on every turn once streak ≥ 3 | Tier-2 shows offer on streak=3, 4, 5 consecutively with learner not responding | Tighten the instruction to "offer at most once per streak; if the learner declines or ignores, do not re-offer until the streak resets." |
| Streak computation impacts prepare-exchange latency | Slow query on large session_events table | Observe request-duration metric | Use covering index; cache per-session; precompute on event write. Fallback: skip streak field, treat as 0. |

### Telemetry

Emit `app/llm.escalation_offered` on replies where the prompt injected the adaptive section AND the response contains offer keywords (`/trickier|harder|shortcut|different/i`). Counter validates the offer is actually being made.

---

## B.4 — Session-summary re-injection in memory block

### Current state

`buildMemoryBlock` in [learner-profile.ts](../../apps/api/src/services/learner-profile.ts) returns a `{text, entries[]}` block with interests (recently split by context in commit `413ece4f`), struggles, strengths (added in `413ece4f`), communication notes, and `urgency_boost_reason` (added in `413ece4f`). It does NOT include the last session's `session_summaries.content` field.

Audit item C: "Re-inject last session's summary + parking-lot questions at next session start." Neither is currently in the memory block.

### Target behavior

When a learner starts a new session on an existing subject/topic:
- The memory block includes a section: `"Last session: {summary content}"` — surfaced only if a summary exists for a session within the last N days on this subject.
- The memory block includes a section: `"You parked these questions last time: {question1}; {question2}"` — surfaced only if parking-lot items exist.

The LLM sees this at session start and can reference it naturally: *"Welcome back — last time we were working on fractions. Want to finish that, or try something new?"*

### Data plumbing

- `session_summaries` table has `content` per session. Query: most recent complete session by profile + subject, within last 14 days.
- `parking_lot_items` table has `question` + `session_id`. Query: items with `status='parked'` for this learner's recent sessions on this subject.

Both queries are additions to the data fetched by `session-exchange.ts::prepareExchangeContext`. They feed a new optional field on `MemoryBlockProfile`:

```ts
+  // Last session's LLM-written summary (if any within the freshness window).
+  // Used by buildMemoryBlock to surface "Last session: ..." in the block.
+  lastSessionSummary?: {
+    content: string;
+    sessionId: string;
+    createdAt: Date;
+  } | null;
+
+  // Parked questions from recent sessions (up to 5).
+  parkedQuestions?: Array<{ question: string; sessionId: string }>;
```

### Prompt change

Update `buildMemoryBlock` to emit two new sections after the interests block:

```ts
+  if (profile.lastSessionSummary) {
+    const text = `- Last session summary: ${profile.lastSessionSummary.content}`;
+    addSection(text, {
+      kind: 'session_summary',
+      text,
+      sourceSessionId: profile.lastSessionSummary.sessionId,
+      sourceEventId: null,
+    });
+  }
+  if (profile.parkedQuestions && profile.parkedQuestions.length > 0) {
+    const questions = profile.parkedQuestions.slice(0, 5).map(q => q.question).join('; ');
+    const text = `- Parked questions from recent sessions: ${questions}`;
+    addSection(text, {
+      kind: 'parked_question',
+      text,
+      sourceSessionId: profile.parkedQuestions[0].sessionId,
+      sourceEventId: null,
+    });
+  }
```

No edit to `buildSystemPrompt` itself — `learnerMemoryContext` is already included in the prompt at [exchanges.ts:393-395](../../apps/api/src/services/exchanges.ts#L393-L395).

### Risk

- **Prompt-length blowout:** summaries can be long. Cap at ~200 chars per summary; if longer, truncate with ellipsis. Total memory block cap already exists; verify it still fits.
- **Stale summaries:** session_summaries are LLM-generated and can be off. If a summary misrepresents a session, it propagates as "truth" into the next session. Freshness window (14 days) limits damage.
- **Privacy — multi-learner profiles:** `session_summaries` is scoped per learner profile; no cross-learner leakage. Verify via `createScopedRepository(profileId)` pattern.

### Verification

Harness-level: new fixture `profiles.ts::returningLearnerWithSummary` — a profile with a recent session_summary and two parked questions. Assert the generated system prompt text contains `"Last session summary:"` and `"Parked questions"`.

Behavior test (harness Tier-2): start a session for this fixture and assert the LLM's opening reply references the last topic or asks about the parked questions (soft assertion — at least one of the summary's key nouns appears in the reply).

Integration: unit test on `buildMemoryBlock` with the new fields; assert section ordering and cap enforcement.

### Failure modes

| State | Trigger | Observable | Recovery |
|---|---|---|---|
| Memory block too long | Summary + interests + struggles exceeds cap | `learnerMemoryContext.length` exceeds limit | Per-section truncation with priority: keep interests + struggles + strengths first, trim summary next, trim parked questions last. |
| Summary is misleading | LLM-generated session_summary was inaccurate | Kid complains or contradicts | Session_summary generation is in learner-profile.ts:SESSION_ANALYSIS_PROMPT — separate tuning concern. Outside this spec. |
| Freshness window edge case | Summary exists but is 15 days old | Not surfaced (correct); kid sees no session recall | No recovery needed — intentional cutoff. |
| No summary exists (new subject) | First session on a topic | No "Last session" line in memory block | Correct behavior; no action. |

### Telemetry

`app/llm.memory_block_size` emits `{ sessionId, sizeBytes, sectionCount, truncated: boolean }` on every session start. Dashboard catches blowout.

---

## B.5 — Age-calibration rephrase for strict 11+

### Current state

[exchanges.ts:244](../../apps/api/src/services/exchanges.ts#L244):

> "A 9-year-old needs short sentences and everyday analogies. A 16-year-old needs precision and real-world context. An adult needs efficiency and respect for existing knowledge."

Product is strictly 11+. "9-year-old" and "adult" are out of range. The scale implicitly treats 11 as closer to 9 than to 16 — which is not the design intent for the 11+ product.

Related: `getAgeVoice` at [exchanges.ts:756](../../apps/api/src/services/exchanges.ts#L756) has a 4-tier mapping that still reads a raw `birthYear`. Already tightened by Agent 2's dead-code cleanup (`970a82a5`) for dictation, but the exchanges prompt hasn't been recalibrated.

### Target behavior

Replace the 9yo/16yo/adult calibration with 12yo/15yo/17yo anchors, aligned to the 11-17 range. No out-of-range references in the base prompt.

### Prompt change

```text
-'A 9-year-old needs short sentences and everyday analogies. A 16-year-old
- needs precision and real-world context. An adult needs efficiency and
- respect for existing knowledge. ' +

+'A 12-year-old wants short sentences, concrete examples, and casual
+ language. A 15-year-old wants real-world context and can handle more
+ precise vocabulary. A 17-year-old wants efficient explanations and
+ can work with abstract reasoning. Calibrate the age-voice section
+ below to the specific learner — these are anchors, not categories. ' +
```

Also audit `getAgeVoice` for any remaining "adult" references that serve as calibration anchors in prompt text. Adult branches exist for safety routing (via `resolveAgeBracket`'s null-birthYear fallback) and are retained as defense-in-depth — but the prompt TEXT emitted by `getAgeVoice` should not use "adult" as a learner anchor.

### Risk

Minimal. This is a text rephrase.

### Verification

Harness-level: assert the generated system prompt text does NOT contain the strings `"9-year-old"`, `"10-year-old"`, or `"an adult"` when the fixture's birthYear indicates a minor (which is all fixtures in `profiles.ts`).

Behavior test: Tier-2 on a fixture with birthYear → ageYears=17, assert reply does not use register more suited to younger learners (soft heuristic — check for diminutives, overly simple vocabulary).

### Failure modes

| State | Trigger | Observable | Recovery |
|---|---|---|---|
| Residual "adult" in `getAgeVoice` output | Fallback path when `birthYear = null` returns adult text | Unit test | Add defense-in-depth — `getAgeVoice` should still return safe generic text when called with null birthYear, but the text anchored against "adult" as a learner type should be removed. |
| LLM still produces kindergarten-register for 11yo | Age recalibration in prompt doesn't change model behavior | Tier-2 review | Less likely than Observations 1/2 because model-side age-adaptation is strong. If seen, same escalation path. |

### Telemetry

No new telemetry required. Age register is covered by the tone snapshots under B.1.

---

## Sequencing & Dependencies

The five changes have the following dependencies:

```
B.5 (age text) ──────────────┐
                             ├──→ Ship as one PR OR five PRs. Independent.
B.2 (text-mode block) ───────┤
                             │
B.1 (tone constraints) ──────┤
                             │
B.4 (memory block) ──────────┤    (requires data-plumbing in session-exchange.ts;
                             │     largest change; ship second)
                             │
B.3 (correctStreak) ─────────┘    (requires new context field + computation;
                                   ship last — highest risk of streak-calc bugs)
```

**Suggested order:**
1. **B.5** first (trivial text rephrase, zero risk, immediate calibration improvement).
2. **B.2** second (narrow negative constraint with unambiguous text-mode semantics).
3. **B.1** third (tone compliance — baseline improvement against which later changes can be measured).
4. **B.4** fourth (memory block — medium-risk, depends on data plumbing).
5. **B.3** fifth (self-modulation — highest risk; new context field; fixture work).

Alternatively, B.1 + B.2 + B.5 can ship as a single "prompt-text sweep" PR; B.3 and B.4 each get their own PR because they involve context/data changes.

---

## Testing Strategy

All five changes verify through the EXCH harness ([apps/api/eval-llm/flows/exchanges.ts](../../apps/api/eval-llm/flows/exchanges.ts) + [exchanges.test.ts](../../apps/api/eval-llm/flows/exchanges.test.ts)), with a mix of Tier-1 (snapshot-only) and Tier-2 (live LLM) runs.

| What | Tier-1 (snapshot) | Tier-2 (live, `--live`) |
|---|---|---|
| B.1 tone compliance | Snapshot assembled-prompt contains new tone constraints | Across 10 correct-answer fixture variants: ≥70% of replies use minimal-acknowledgment register; <10% use banned filler openers |
| B.2 text-mode pronunciation | Snapshot: `textModeVocabTerm` fixture's prompt contains TEXT MODE block; `voiceModeVocabTerm` does NOT; `languageLearningSession` does NOT | Across text-mode vocab fixtures: 0 replies match `/\(say:/` regex |
| B.3 self-modulation | Snapshot: `correctStreak_3` fixture's prompt contains ADAPTIVE ESCALATION section; `correctStreak_0` does NOT | Across streak-3 fixtures: ≥70% of replies contain escalation-offer keywords or end with a choice-offer question |
| B.4 memory-block injection | Snapshot: `returningLearnerWithSummary` fixture's prompt contains "Last session summary:" and "Parked questions" | Across returning-learner fixtures: ≥80% of opening replies reference the last topic's key noun or ask about parked questions |
| B.5 age calibration | Snapshot: assembled prompt for any fixture does NOT contain "9-year-old", "10-year-old", or "an adult" as learner anchors | N/A — text rephrase, no behavioral check beyond B.1's register snapshots |

**Unit tests** (separate from harness):

- `session-exchange.test.ts`: `computeCorrectStreak` pure function returns expected counts for seeded event streams (B.3).
- `learner-profile.test.ts`: `buildMemoryBlock` emits expected sections + respects cap (B.4).
- `exchanges.test.ts`: `buildSystemPrompt` output structure tests for each condition combination (B.2 conditional on `inputMode` × `pedagogyMode`).

**Rollout monitoring:**

Each change's telemetry events feed a dashboard. Pre-launch: baseline numbers from current prod behavior. Post-launch: compare new numbers to baseline. Regressions trigger rollback.

Suggested baselines to capture before any B.* change ships:
- Praise-filler rate (B.1): regex match rate across 7 days of production logs.
- Text-mode pronunciation leak rate (B.2): regex match rate across 7 days.
- Escalation-offer rate (B.3): currently ~0%; baseline is trivial.
- Memory block size (B.4): distribution of `learnerMemoryContext.length`.

---

## Rollback

Each change is a discrete commit-and-revert:
- B.1, B.2, B.5 — pure text edits to `exchanges.ts`. Revert is a 1-commit operation.
- B.4 — memory block edits + new data fields. Revert: restore the prior `MemoryBlockProfile` and `buildMemoryBlock`; data-plumbing in `session-exchange.ts` stops populating new fields.
- B.3 — new `correctStreak` field + prompt section. Revert: remove both. No DB migration to unwind.

No irreversible operations in any change.

---

## Out of Scope

- **Router preamble changes.** If compliance issues persist after prompt edits, next lever is router-level. Separate spec.
- **Model-tier promotion.** Moving tone-critical calls to Claude Sonnet 4.6 (premium). Separate cost/quality analysis.
- **Response-envelope migration.** The structured `{reply, signals, ui_hints, confidence}` envelope at [docs/specs/2026-04-18-llm-response-envelope.md](2026-04-18-llm-response-envelope.md) is the longer-term replacement for marker-based state transitions. Orthogonal to this spec's tuning; this spec does not change the response shape.
- **The 8 other prompt surfaces** (quiz-capitals, quiz-vocab, quiz-guess-who, dictation-generate, dictation-review, dictation-prepare-homework, filing, session-analysis). Each has its own tuning backlog in the personalization audit.
- **U1 real version (continueHint natural-language summary).** New prompt surface. Gets its own sub-spec within Direction B, not bundled here.
- **Prompt architectural refactor** (preamble + ordered skill sections). If B.1's compliance doesn't move the needle, this becomes the next spec.
- **Session_summary generation tuning** (the LLM that writes summaries for session-analysis.ts). Its output feeds B.4; if summaries are inaccurate, the fix is upstream, not here.

---

## Related Documents

- [docs/specs/2026-04-18-llm-personalization-audit.md](2026-04-18-llm-personalization-audit.md) — full LLM surface map + P0/P1 backlog. Items A, B, C, D map to this spec's B.4 and B.5.
- [docs/specs/2026-04-18-llm-reliability-ux-audit.md](2026-04-18-llm-reliability-ux-audit.md) — marker anti-patterns; F1.2 hotfix already shipped; F1.1 interview-complete migration is a downstream concern.
- [docs/specs/2026-04-18-llm-response-envelope.md](2026-04-18-llm-response-envelope.md) — the structured-output migration that would eventually carry self-modulation signals into the UI.
- [docs/specs/2026-04-19-proactivity-copy-sweep-design.md](2026-04-19-proactivity-copy-sweep-design.md) — Direction A (sibling track, client copy).
- [docs/specs/2026-04-19-ask-flow-redesign.md](2026-04-19-ask-flow-redesign.md) — Direction C (Ask redesign).
- [docs/plans/2026-04-19-exchanges-harness-wiring.md](../plans/2026-04-19-exchanges-harness-wiring.md) — EXCH harness implementation plan (now merged; prerequisite satisfied).
- Memory: `project_llm_audit_2026_04_18.md`, `project_eval_llm_harness.md`, `project_llm_marker_antipattern.md`.
