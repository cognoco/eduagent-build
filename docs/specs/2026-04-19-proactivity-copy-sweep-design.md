# Proactivity Copy Sweep — Hardcoded String Rewrites

**Status:** Draft
**Date:** 2026-04-19
**Builds on:** Live UX probe of web preview (TestKid profile, kid persona), Phase-3 LLM tuning context on `improvements` branch
**Scope:** Rewrite 7 hardcoded client strings that drive the "LLM isn't proactive enough" perception, plus two adjacent UX-copy fixes. No LLM prompt changes, no eval-harness dependency, no architectural change.

---

## Problem Statement

A live probe of the web preview (Ask, Learn, Homework flows, 11-year-old "TestKid" profile) surfaced a recurring pattern: **several of the moments that feel passive and non-proactive are not LLM outputs at all — they are hardcoded client strings, rendered before the LLM ever speaks.**

Three of the most visible examples:

1. **Ask greeting** — "Hey again! What's on your mind today?" (returning kid) or "What's on your mind? I'm ready when you are." (new kid). Requires the learner to generate a question from scratch with no lanes or scaffolding.
2. **Resume banner** — "Welcome back - your session is ready." Blind to what the kid was actually doing. The kid has to scroll up to remember their own context.
3. **Subject classification ack** — "Got it, this sounds like ${candidate.subjectName}." Rendered by the mobile client as a fake assistant bubble with `isSystemPrompt: true` at [use-subject-classification.ts:364](../../apps/mobile/src/app/\(app\)/session/_helpers/use-subject-classification.ts#L364). Tentative ("sounds like") vs the spec's intended confident "is about" wording at [epics.md:5146](../specs/epics.md#L5146).

Secondary findings in the same live probe that fit this sweep's scope:

4. **Continue card subtitle** — "Mathematics · Addition and Subtraction of Whole Numbers". Pure taxonomy metadata. No indication of where the kid left off, no invitation hook.
5. **Homework camera screen** — "AI tutor" jargon in body copy ("so your AI tutor can help you work through them"). Violates the project's `no_jargon_kid_language` principle.

## Goals

- Rewrite the 7 specific hardcoded strings (listed in Scope below) with copy that actively offers lanes, acknowledges state when known, and avoids passive "what do you want?" voids.
- Add optional context to the Continue card so it names *what* the kid was working on, not just the subject label.
- Remove the "AI tutor" jargon from the Homework camera screen.
- Ship all changes in a single small PR, fully testable with unit tests, with zero dependency on eval-harness runs.

## Non-Goals

- **No LLM prompt changes.** Any text that flows from `buildSystemPrompt` or any other server-side LLM prompt is out of scope. Those live in Direction B (a separate tuning track) and require the `exchanges.ts` eval-harness extension.
- **No architectural changes.** The Ask redesign (see [docs/specs/2026-04-19-ask-flow-redesign.md](2026-04-19-ask-flow-redesign.md)) is orthogonal. All strings in this spec are explicitly documented as *unchanged by* that redesign — no collision.
- **No book-picker copy.** The `/pick-book/:subjectId` page renders LLM-generated per-subject book cards (emoji + title + description). That copy is a prompt-level finding, tracked as follow-up in Direction B. See Out-of-Scope.
- **No new UI surfaces.** No new buttons, no new flows, no new routes. Only text rewrites plus one small API field addition (Continue-card context, scope-branched below).

---

## Copy Principles

All rewrites in this spec follow these rules, derived from the live-probe observations:

1. **Never ask the learner to generate cold.** Passive prompts like "What's on your mind?" force the kid to come up with a topic from nothing. A proactive rewrite either (a) offers 1-2 concrete lanes, or (b) references state the app already knows (last topic, recent subject).
2. **Reference state when available.** If the app knows the learner was just asking about primes, say so. Don't make the kid retrieve that from their own memory.
3. **No register baby-talk.** Product is strictly 11+. Avoid diminutives and treat-you-like-a-kindergartener framing. The copy should work for a 14-year-old without feeling condescending.
4. **No app jargon.** Never use "AI tutor", "the model", "the system" in kid-facing copy. Prefer "I" or "your tutor" or the persona voice.
5. **Length discipline.** Every rewrite should be shorter than 20 words. Two sentences max. Proactivity is NOT achieved by adding text — it is achieved by replacing empty prompts with specific invitations.
6. **Forward action per state.** Every copy rendering must be paired with at least one interactive element (enforced by the existing UX dead-end audit).

---

## Scope

### The 7 hardcoded strings

| # | File | Line | Surface | Current string |
|---|---|---|---|---|
| C1 | [apps/mobile/src/components/session/sessionModeConfig.ts](../../apps/mobile/src/components/session/sessionModeConfig.ts#L68) | 68 | Freeform input placeholder | `"What's on your mind?"` |
| C2 | [apps/mobile/src/components/session/sessionModeConfig.ts](../../apps/mobile/src/components/session/sessionModeConfig.ts#L69) | 69 | Freeform opening message (new learner) | `"What's on your mind? I'm ready when you are."` |
| C3 | [apps/mobile/src/components/session/sessionModeConfig.ts](../../apps/mobile/src/components/session/sessionModeConfig.ts#L104) | 104 | Freeform familiar-session (returning learner) | `"Hey again! What's on your mind today?"` |
| C4 | [apps/mobile/src/components/session/sessionModeConfig.ts](../../apps/mobile/src/components/session/sessionModeConfig.ts#L112) | 112 | Freeform familiar-session (nth-return variant) | `"What's on your mind? I'm ready when you are."` |
| C5 | [apps/mobile/src/app/(app)/session/index.tsx](../../apps/mobile/src/app/\(app\)/session/index.tsx#L1006) | 1006 | Resume banner (any mode) | `"Welcome back - your session is ready."` |
| C6 | [apps/mobile/src/app/(app)/session/_helpers/use-subject-classification.ts](../../apps/mobile/src/app/\(app\)/session/_helpers/use-subject-classification.ts#L315-L316) | 315-316 | First-message greeting (freeform path, pre-Ask-redesign) | New: `"Hey! What would you like to learn about? You can ask me anything."` / Returning: `"Hey! What's on your mind today?"` |
| C7 | [apps/mobile/src/app/(app)/session/_helpers/use-subject-classification.ts](../../apps/mobile/src/app/\(app\)/session/_helpers/use-subject-classification.ts#L364) | 364 | Subject classification acknowledgment (non-freeform modes after Ask redesign ships) | `"Got it, this sounds like ${candidate.subjectName}."` |

### Adjacent copy/UI fixes

- **U1 — Continue card subtitle:** Currently renders `${subject} · ${topicTitle}` on the home screen. Needs additional context about progress state (scope-branched: cheap version vs real version).
- **U2 — Homework camera screen body copy:** Currently `"We need your camera to photograph homework problems so your AI tutor can help you work through them step by step."` → remove "AI tutor" jargon.

### What stays the same

- The two-button home screen (Learn + Ask) — their labels and navigation targets are not touched.
- The intent card wording on the home screen subtitle tags — not touched.
- The Go back / I'm Done / Switch topic / Park it button labels — already action-forward.
- All LLM-generated text (teaching turns, book-picker cards, subject-picker descriptions).
- The Ask redesign's FR-ASK series — unaffected; this spec's rewrites are in the explicitly-out-of-scope set of that spec.

---

## Rewrite Candidates

For each string, 2-3 candidate rewrites with rationale. Final copy choice is reviewer's call.

### C1 — Freeform input placeholder

**Current:** `"What's on your mind?"`

The placeholder inside the text input is a micro-prompt but sets expectations. Keep it very short (it's grayed-out inline text).

**Candidates:**
- A. `"Ask me something"` (4 words, direct verb, no cognitive load)
- B. `"Type a question…"` (matches "Ask" card label)
- C. `"What do you want to figure out?"` (slightly longer, more invitational, matches principle #1)

**Recommendation:** A. Shortest, verb-first, can't be misread as passive.

### C2 — Freeform opening message (new learner)

**Current:** `"What's on your mind? I'm ready when you are."`

This is the LLM's apparent voice before it has heard anything. "I'm ready when you are" is deferential-but-empty — it pushes cognitive load back on the kid.

**Candidates:**
- A. `"Hi! Ask me anything — a question, something confusing from school, or just something you're curious about."` (19 words, three concrete lanes)
- B. `"Hey! I can help with homework, explain something from class, or dig into anything you're wondering about — what's up?"` (20 words, three outcome-framed lanes)
- C. `"Hi — what do you want to figure out today? You can ask me about something specific, or tell me what's got you curious."` (24 words, invitation + two lanes)

**Recommendation:** A. Shortest, three lanes, kid-language.

### C3 — Freeform familiar-session (returning learner, default path)

**Current:** `"Hey again! What's on your mind today?"`

This is the most visible passive moment in the whole app — the first thing a returning kid sees when they tap Ask.

**Candidates:**
- A. `"Welcome back! Got a question, or want to pick up where we left off?"` (13 words, two lanes — relies on app knowing "where we left off" and the LLM being able to reference it)
- B. `"Welcome back — ask me something, or want me to throw you an interesting question to chew on?"` (17 words, two lanes — the second lane is a bot-initiated challenge)
- C. `"Welcome back! What do you want to figure out today?"` (10 words, single invitation with a concrete verb)

**Recommendation:** A if the Continue-card context (U1) is implemented first. Otherwise B — it's active without depending on state.

### C4 — Freeform familiar-session (nth-return variant)

**Current:** `"What's on your mind? I'm ready when you are."`

Same passivity as C2. Copy can be identical to C3 — there's no functional reason to differentiate "returning" vs "nth-returning" here.

**Recommendation:** Use the same chosen wording as C3. If keeping a variant, shorten to `"Hey again — what do you want to dig into?"` (9 words).

### C5 — Resume banner

**Current:** `"Welcome back - your session is ready."`

This banner fires when a kid backgrounded a session and returned within the 30-minute window. It's the single biggest missed opportunity for proactive recall.

**Candidates:**
- A. `"Welcome back — you were exploring {lastTopicTitle}. Pick up there?"` (8 words + template, requires session state available to banner)
- B. `"Welcome back — your session is ready to go."` (copy-edit only; no state dependency)
- C. `"Welcome back — {exchangeCount} messages in. Want to keep going?"` (pulls message count from session state)

**Recommendation:** A. The data is already on the session record — injecting the topic title is a 1-line client change. This is the single highest-ROI rewrite in the spec.

### C6 — First-message greeting (freeform path, pre-Ask-redesign)

**Current (new learner):** `"Hey! What would you like to learn about? You can ask me anything."`
**Current (returning learner):** `"Hey! What's on your mind today?"`

The "new learner" variant already offers a lane ("learn about"). The "returning learner" variant is flat.

This strings may become dead code when the Ask redesign ships (the redesign removes the classification call on the freeform path). If the Ask redesign lands first, skip editing these; otherwise edit for the interim window.

**Candidates for returning:**
- A. Match C3's chosen copy.
- B. `"Hey — what do you want to figure out?"` (7 words)

**Recommendation:** A. Consistency across all freeform entry points.

### C7 — Subject classification acknowledgment

**Current:** `"Got it, this sounds like ${candidate.subjectName}."`

The spec at [epics.md:5146](../specs/epics.md#L5146) says:

> AI acknowledges naturally ("Got it, this is about [Subject].")

Current code uses "sounds like" (tentative). Spec says "is about" (confident). This is a small but real drift. Also — "Got it" is confident-then-hedged, which reads weird.

**Candidates:**
- A. `"Got it — this is about ${candidate.subjectName}."` (align to spec wording)
- B. `"Starting a ${candidate.subjectName} session."` (drops the conversational framing; more UI-y)
- C. `"${candidate.subjectName} it is — let's go."` (more casual, kid-language; some risk of reading as robotic with unusual subject names)

**Recommendation:** A. Aligns to the existing spec decision; minimal risk.

**Note:** After the Ask redesign ships, this string is only rendered by non-freeform flows (Learn with a typed subject that requires disambiguation). So it stays live. Per the Ask redesign, [use-subject-classification.ts](../../apps/mobile/src/app/\(app\)/session/_helpers/use-subject-classification.ts) — "No changes to the hook itself — it's still used by non-freeform modes."

### U1 — Continue card subtitle

**Current render:** `${subject} · ${topicTitle}` (e.g., "Mathematics · Addition and Subtraction of Whole Numbers")

Two possible scope levels, your pick:

**Cheap version (client-only, 1-line change):**
- Just reformat the existing data: `"Continue {subject} — {topicTitle}"` → `"Pick up {topicTitle}"` or `"More {topicTitle}"`
- No API change. Just drops the subject label, treats the topic as the hook.

**Real version (API-extended):**
- Extend `GET /v1/progress/continue` to return a new field, `continueHint: string | null`, populated from the most recent session's last LLM exchange or topic progress. Format: "We were working on {specific-thing}."
- Client renders: `"Continue — {continueHint}"` when present, falls back to current format when null.
- Requires a 1-3 line API addition + client wiring. Tiny, but real.

**Recommendation:** **Real version.** The passivity of "Addition and Subtraction of Whole Numbers" as a hook is precisely what this sweep is trying to fix; the cheap version only partially addresses it.

### U2 — Homework camera screen

**Current:** `"We need your camera to photograph homework problems so your AI tutor can help you work through them step by step."`

"AI tutor" violates `no_jargon_kid_language`. Also "AI" exposes plumbing.

**Candidates:**
- A. `"We need your camera to take a picture of your homework so I can help you work through it."` (drop "AI tutor", first-person persona)
- B. `"Snap a picture of your homework and I'll help you solve it step by step."` (outcome-first)
- C. `"Your camera lets me see your homework so I can walk you through it."` (shorter, purpose-driven)

**Recommendation:** B. Outcome-first matches the Homework card's home-screen copy ("Snap a photo, get help") and the persona's first-person voice.

---

## Files Affected

### Mobile (modify)

| File | Change |
|---|---|
| [apps/mobile/src/components/session/sessionModeConfig.ts](../../apps/mobile/src/components/session/sessionModeConfig.ts) | C1 (L68), C2 (L69), C3 (L104), C4 (L112) — four string edits |
| [apps/mobile/src/app/(app)/session/index.tsx](../../apps/mobile/src/app/\(app\)/session/index.tsx) | C5 (L1006) — resume banner string edit; if U1 real version chosen, wire the `continueHint` prop into the banner template |
| [apps/mobile/src/app/(app)/session/_helpers/use-subject-classification.ts](../../apps/mobile/src/app/\(app\)/session/_helpers/use-subject-classification.ts) | C6 (L315-316), C7 (L364) — three string edits |
| [apps/mobile/src/components/home/LearnerScreen.tsx](../../apps/mobile/src/components/home/LearnerScreen.tsx) *(or wherever the Continue card renders)* | U1 — Continue card subtitle format (if real version: consume `continueHint` from `/progress/continue` response) |
| [apps/mobile/src/app/(app)/homework/camera.tsx](../../apps/mobile/src/app/\(app\)/homework/camera.tsx) | U2 — camera-permission body copy rewrite |

### Mobile (test)

All existing snapshot/integration tests that assert the old strings (there's already a test at [use-subject-classification.test.ts:77](../../apps/mobile/src/app/\(app\)/session/_helpers/use-subject-classification.test.ts#L77) that hard-codes `"Hey! What's on your mind today?"`) must be updated in the same PR. New tests added per the Testing Strategy section below.

### API (modify — only if U1 real version chosen)

| File | Change |
|---|---|
| `apps/api/src/routes/progress.ts` *(path approximate; the route is `GET /v1/progress/continue`)* | Extend response schema with `continueHint?: string \| null`. Populate from the most recent session's final assistant message (first sentence) OR from the topic's progress state (whichever is cleaner given existing shape). |
| `packages/schemas` | Extend `continueResponseSchema` with the new optional field. |

### Schema

**No database schema changes.** `continueHint` is computed at request time, not persisted.

---

## Copy Principles Compliance Table

| String | Offers lanes? | References state? | Kid-language? | Under 20 words? |
|---|---|---|---|---|
| C1 (placeholder) | — *(placeholders don't)* | N/A | ✓ | ✓ |
| C2 (opening new) | ✓ (3 lanes) | N/A *(new learner has no state)* | ✓ | ✓ |
| C3 (returning) | ✓ (2 lanes) | ✓ *(optional, if U1 lands)* | ✓ | ✓ |
| C4 (nth return) | ✓ | ✓ | ✓ | ✓ |
| C5 (resume banner) | ✓ (Pick up / explore new) | ✓ *(topic title)* | ✓ | ✓ |
| C6 (first-greeting) | ✓ | ✓ | ✓ | ✓ |
| C7 (subject ack) | — *(acknowledgment only, not a prompt)* | ✓ | ✓ | ✓ |
| U1 (Continue card) | ✓ (the card itself is the CTA) | ✓✓ | ✓ | ✓ |
| U2 (homework) | ✓ (Allow Camera / Go back) | N/A | ✓ *("I" not "AI tutor")* | ✓ |

---

## Failure Modes

| State | Trigger | Learner sees | Recovery |
|---|---|---|---|
| `continueHint` is null | API returns null (no prior session, or no recoverable context) | Continue card falls back to current format `"{subject} · {topicTitle}"` | No recovery needed — graceful degradation |
| `continueHint` is very long (> 60 chars) | LLM-generated summary exceeds display budget | Truncated with ellipsis at ~60 chars, full text available via screen reader | Ellipsis is soft — card remains tappable |
| C5 template has no `lastTopicTitle` state | Session state object missing the topic name | Falls back to `"Welcome back — your session is ready to go."` (C5 candidate B) | Code-level: null-check before template substitution. Unit-test this branch. |
| Translation / localization | A future localization pass encounters new strings | New strings must be passed through the existing i18n key system (no hardcoded user-facing copy) | Coordinate with whoever owns i18n keys during implementation |

---

## Testing Strategy

| What | How | Verified by |
|---|---|---|
| All rewritten strings are rendered | Update existing snapshot tests and the hard-coded assertion at `use-subject-classification.test.ts:77` | `test: use-subject-classification.test.ts:"greeting strings match new copy"` |
| C5 template null-safety | Unit test: render resume banner with `lastTopicTitle = null` → falls back to C5 candidate B | `test: session/index.test.tsx:"resume banner falls back when no last topic"` |
| C5 template with data | Unit test: render with `lastTopicTitle = "prime numbers"` → shows "you were exploring prime numbers" | `test: session/index.test.tsx:"resume banner references last topic when present"` |
| U1 cheap version | Unit test: Continue card renders `"Pick up {topicTitle}"` given standard subject+topic state | `test: LearnerScreen.test.tsx:"Continue card uses topic as hook"` |
| U1 real version (if chosen) | Integration test: API returns `continueHint`, client renders it; API returns null, client falls back | `test: LearnerScreen.test.tsx:"Continue card uses continueHint when present"` + `test: progress.test.ts:"continue endpoint returns continueHint"` |
| U2 copy | Snapshot test: homework camera-permission screen snapshot includes new copy | `test: homework/camera.test.tsx:"camera permission copy excludes AI jargon"` |
| No jargon regression | Repo-level grep guard (ESLint rule or CI check): `"AI tutor"` must not appear in any `apps/mobile` file except test assertions | `test: ci:"no AI tutor jargon in user-facing copy"` |
| String registry coherence | If a centralized strings registry is introduced, snapshot the full table to catch accidental reverts | `test: session/strings.test.ts:"all session mode strings snapshot"` |

---

## Implementation Plan

This spec should feed into the writing-plans skill to produce a concrete implementation plan. Anticipated structure:

1. Decide U1 scope (cheap vs real) — 5 min review decision
2. Finalize chosen candidate for each string — 10 min review decision
3. Write new unit tests for C5 null-safety and U1 branches — small
4. Apply all string edits + test updates — small
5. Add no-jargon CI guard — small
6. Run mobile lint/typecheck/test — required per project rules
7. Manual smoke on Expo web preview — 5 min

---

## Out of Scope

- **Book-picker page copy** (`/pick-book/:subjectId`) — the 8 per-subject book cards with emojis and descriptions. That copy is LLM-generated (Programming subject picker produced: "🐈 Code with Scratch: Build Your First Games!" + similar for 7 more) and its register skews 8-11 not 11-17. Tracked for Direction B (prompt-level tuning). Not this sweep.
- **Home-screen intent card copy** — "Ask" / "Get answers to any question" / "Learn" / "Start a new subject or pick one" / etc. The Ask card subtitle will need revisiting if the Ask redesign changes behavior (the subtitle promise is actually accurate post-redesign). Tracked as an Ask-redesign integration item.
- **Any LLM prompt text** — including `exchanges.ts:buildSystemPrompt`, `learner-profile.ts:SESSION_ANALYSIS_PROMPT`, and the other 7 LLM surfaces in [docs/specs/2026-04-18-llm-personalization-audit.md](2026-04-18-llm-personalization-audit.md). Those require the `exchanges.ts` eval-harness extension (see [docs/plans/2026-04-19-exchanges-harness-wiring.md](../plans/2026-04-19-exchanges-harness-wiring.md)).
- **Voice-mode copy** — this sweep is for text-mode readable UI. Voice-mode TTS phrasing is a separate prompt/pipeline concern.
- **Localization / i18n** — if strings are currently hardcoded in English only, this spec keeps them English-only. Any future localization pass would need to extract all strings (including the new ones) through the i18n key system.

---

## Coordination with the Ask Redesign

The [Ask redesign spec](2026-04-19-ask-flow-redesign.md) explicitly states (in its "What Stays the Same" section):

> Opening messages in `sessionModeConfig.ts` — unchanged

So this sweep's edits to C1–C4 do not collide with the Ask redesign.

The redesign's "Files Affected" list does touch [session/index.tsx](../../apps/mobile/src/app/\(app\)/session/index.tsx) (for hook-call removal) and [use-subject-classification.ts](../../apps/mobile/src/app/\(app\)/session/_helpers/use-subject-classification.ts) (hook unchanged, but its call site moves). This creates a small coordination point with C5 (same file, different lines) and C6 (the hook may be called less often post-redesign). Recommended order:

- **Ship this sweep first** if feasible — it's smaller, non-blocking, and gives users an immediate proactivity win.
- **If Ask redesign ships first**, revisit C6: the freeform path's first-message greeting is rendered less often (no classification runs on first message), but the copy is still used in non-freeform entry points.

Neither order creates merge hazards. Both orders converge to the same end state.

---

## Related Documents

- [docs/specs/2026-04-19-ask-flow-redesign.md](2026-04-19-ask-flow-redesign.md) — Ask flow redesign (Direction C)
- [docs/specs/2026-04-18-llm-personalization-audit.md](2026-04-18-llm-personalization-audit.md) — the 9 LLM prompt surfaces + tuning backlog (Direction B)
- [docs/plans/2026-04-19-exchanges-harness-wiring.md](../plans/2026-04-19-exchanges-harness-wiring.md) — eval harness extension for `exchanges.ts` (prerequisite for Direction B)
- Memory: `feedback_no_jargon_kid_language.md` (constraint), `feedback_never_lock_topics.md` (philosophy), `project_llm_audit_2026_04_18.md` (context)
