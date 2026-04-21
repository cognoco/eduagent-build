# Proactivity Copy Sweep — Hardcoded String Rewrites

**Status:** Draft (revised after review)
**Date:** 2026-04-19
**Builds on:** Live UX probe of web preview (TestKid profile, kid persona), Phase-3 LLM tuning context on `improvements` branch
**Scope:** Rewrite 7 hardcoded client strings that drive the "LLM isn't proactive enough" perception, plus two adjacent UX-copy fixes. No LLM prompt changes, no eval-harness dependency, no architectural change. **Tactical patch over a known architectural issue** (see Architectural Note below).

---

## Changelog

**v2 (2026-04-19, post-review):** Revised in response to a thorough critique. Summary of changes:

- **U1 downgraded to the "cheap version"** (pure-client reformat). The "real version" (API-extended `continueHint`) is an LLM surface in disguise (the only honest data source is a fresh LLM summary call) and belongs in Direction B, not a "no prompt changes" sweep. Deferred explicitly.
- **C3 Candidate A removed.** "Pick up where we left off" is a false promise in Ask's greeting — Ask's LLM chain has no awareness of the home-screen Continue card's state. Promising continuity the LLM can't deliver is worse than the original passivity.
- **C2 Candidate C removed.** Violated the length principle at 24 words. While removing the candidate, the principle itself was revised (see Copy Principles).
- **Copy Principle #5 replaced.** "< 20 words" was arbitrary and led to multi-lane menus that add cognitive load inside a flow. Replaced with "minimal scaffolding once inside the flow" — shorter, sharper invitations are preferred over multi-lane menus when the entry card already named the purpose.
- **C7 recommendation flipped.** Keep "sounds like", not "is about". The classifier can be wrong; the tentative phrasing invites correction. Aligning to [epics.md:5146](epics.md#L5146) without questioning whether that epic got the UX right was weak. The epic is flagged for re-review.
- **Architectural Note added.** The hardcoded client strings are fake assistant bubbles (`isSystemPrompt: true`) — the app fabricates assistant turns to avoid cold-start blank chat. This sweep paints over that; it does not fix it. Fix tracked as follow-up.
- **C6 committed to the interim window.** Ask-redesign implementation is a multi-week effort (plan at [docs/plans/2026-04-19-ask-flow-redesign.md](../plans/2026-04-19-ask-flow-redesign.md)); copy sweep is days. C6 edits become dead code when Ask redesign lands. Throwaway justified by time-to-ship on the proactivity feel.
- **Testing Strategy rewritten** — behavior assertions (given-state → rendered-output) replace string-match regression tests. Revert-guard tests labeled as such.
- **CI "no AI tutor" guard dropped.** A grep for one phrase is the wrong tool for a no-jargon principle. Copy-registry with human review is the right tool; flagged as follow-up, not this sweep.
- **Failure Modes extended** with the missing row: "learner accepts a context-referencing lane but the LLM has no restored context." Recovery: don't offer the lane unless the context is verifiably present. Drives C3-A removal.
- **"Single small PR" claim now honest.** With U1 dropped to cheap version, the PR is genuinely small — all edits in `apps/mobile`, no schema, no API.

---

## Architectural Note

The strings this spec rewrites are not ordinary UI copy — they are **fake assistant bubbles**. [use-subject-classification.ts:364](../../apps/mobile/src/app/\(app\)/session/_helpers/use-subject-classification.ts#L364) sets `isSystemPrompt: true` and injects the string into the message list as if the model had said it. The opening-message strings in [sessionModeConfig.ts](../../apps/mobile/src/components/session/sessionModeConfig.ts) play the same role: they render as assistant turns before the LLM has produced anything.

**The right architectural fix is not in this spec.** Ideally the app would move these greetings out of the message stream — into a chat-header subtitle, a soft onboarding label, or a non-bubble UI element that doesn't pretend to be the LLM. That change has i18n, accessibility, and animation implications worth its own spec.

**This sweep is a tactical patch.** Polishing the fake bubble's copy reinforces the architecture. That's a known trade-off; the alternative (do nothing until the architectural fix ships) leaves the passive feel in place for the full duration of the architectural work.

**Follow-up (separate spec):** Investigate migrating these hardcoded-assistant-turn greetings into UI-layer elements that don't masquerade as LLM outputs. Not in scope here. Tracked as a follow-up for whoever owns the session chat component.

---

## Problem Statement

A live probe of the web preview (Ask, Learn, Homework flows, 11-year-old "TestKid" profile) surfaced a recurring pattern: **several of the moments that feel passive and non-proactive are not LLM outputs at all — they are hardcoded client strings, rendered before the LLM ever speaks.**

Three of the most visible examples:

1. **Ask greeting** — "Hey again! What's on your mind today?" (returning kid) or "What's on your mind? I'm ready when you are." (new kid). Requires the learner to generate a question from scratch with no lanes or scaffolding.
2. **Resume banner** — "Welcome back - your session is ready." Blind to what the kid was actually doing. The kid has to scroll up to remember their own context.
3. **Subject classification ack** — "Got it, this sounds like ${candidate.subjectName}." Rendered by the mobile client as a fake assistant bubble with `isSystemPrompt: true` at [use-subject-classification.ts:364](../../apps/mobile/src/app/\(app\)/session/_helpers/use-subject-classification.ts#L364).

Secondary findings in the same live probe that fit this sweep's scope:

4. **Continue card subtitle** — "Mathematics · Addition and Subtraction of Whole Numbers". Pure taxonomy metadata. No indication of where the kid left off, no invitation hook.
5. **Homework camera screen** — "AI tutor" jargon in body copy ("so your AI tutor can help you work through them"). Violates the project's `no_jargon_kid_language` principle.

## Goals

- Rewrite the 7 specific hardcoded strings (listed in Scope below) with copy that actively offers a single concrete invitation or references state the app can verifiably produce.
- Reformat the Continue card subtitle to hook on the **topic** instead of the abstract subject, using data that already exists on the client.
- Remove the "AI tutor" jargon from the Homework camera screen.
- Ship all changes in a single small PR, fully testable with unit tests in `apps/mobile`, with zero dependency on eval-harness runs, zero schema changes, zero API contract changes.

## Non-Goals

- **No LLM prompt changes.** Any text that flows from `buildSystemPrompt` or any other server-side LLM prompt is out of scope. Those live in Direction B (a separate tuning track) and require the `exchanges.ts` eval-harness extension.
- **No API/schema changes.** The "real version" of the Continue card enhancement — adding a natural-language `continueHint` field to `/v1/progress/continue` — has been deferred. The only honest source of such a string is a fresh LLM call (echoing the last assistant sentence is the cross-surface injection anti-pattern; structured topic progress has no natural-language field). That belongs in Direction B's prompt-and-harness work, not in a client copy sweep.
- **No architectural fix of fake assistant bubbles.** See the Architectural Note above.
- **No book-picker copy.** The `/pick-book/:subjectId` page renders LLM-generated per-subject book cards. That copy is a prompt-level finding, tracked as follow-up in Direction B.
- **No new UI surfaces.** No new buttons, no new flows, no new routes.

---

## Copy Principles (revised)

All rewrites in this spec follow these rules, derived from the live-probe observations and from review feedback:

1. **Never ask the learner to generate cold.** Passive prompts like "What's on your mind?" force the kid to come up with a topic from nothing. A proactive rewrite either (a) offers a single concrete invitation with a clear verb, or (b) references state the app can verifiably produce.
2. **Reference state only when the surface owns the state.** The home-screen Continue card knows the last topic. The Ask greeting does not. Referencing state on a surface that can't access it produces promises the next turn can't keep — worse than not referencing at all.
3. **No register baby-talk.** Product is strictly 11+. Avoid diminutives and treat-you-like-a-kindergartener framing. The copy should work for a 14-year-old without feeling condescending.
4. **No app jargon.** Never use "AI tutor", "the model", "the system" in kid-facing copy. Prefer first-person persona ("I") or no-subject framing.
5. **Minimal scaffolding once inside the flow.** The entry card already named the flow's purpose ("Get answers to any question" / "Start a new subject"). Multi-lane menus inside the flow add cognitive cost; short, action-verb invitations are stronger. When in doubt, shorter wins. 3-word invitations often beat 19-word triplets.
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

- **U1 — Continue card subtitle reformat (cheap version only, client-side).** The home-screen Continue card currently renders `${subject} · ${topicTitle}`. The cheap version drops the subject label and leads with the topic as the invitation hook. No API change. No schema change. **The "real version" (natural-language `continueHint`) is explicitly deferred to Direction B — see Non-Goals.**
- **U2 — Homework camera screen body copy.** Currently `"so your AI tutor can help you work through them"` → remove "AI tutor" jargon; use first-person persona.

### What stays the same

- The two-button home screen (Learn + Ask) — their labels and navigation targets are not touched.
- The intent card wording on the home screen subtitle tags.
- The Go back / I'm Done / Switch topic / Park it button labels — already action-forward.
- All LLM-generated text (teaching turns, book-picker cards, subject-picker descriptions).
- The Ask redesign's FR-ASK series — unaffected; this spec's rewrites are in the explicitly-out-of-scope set of that spec.

---

## Rewrite Candidates

For each string, candidate rewrites with rationale. Final copy choice is reviewer's call during the implementation-plan phase.

### C1 — Freeform input placeholder

**Current:** `"What's on your mind?"`

Placeholder inside the text input is a micro-prompt and sets expectations. Keep very short (grayed-out inline text).

**Candidates:**
- A. `"Ask me something"` (3 words, direct verb, no cognitive load)
- B. `"Type a question…"` (matches Ask card label)
- C. `"What do you want to figure out?"` (7 words, more invitational)

**Recommendation:** **A.** Shortest, verb-first, can't be misread as passive.

### C2 — Freeform opening message (new learner)

**Current:** `"What's on your mind? I'm ready when you are."`

This is the LLM's apparent voice before it has heard anything. "I'm ready when you are" is deferential-but-empty — it pushes cognitive load back on the kid. The Ask card's subtitle already told the kid this is the "Get answers to any question" flow, so this opener doesn't need to re-explain.

**Candidates:**
- A. `"Hi! Ask me anything."` (4 words, direct verb; leverages the entry-card context)
- B. `"Hey — what are you curious about?"` (7 words, curiosity-framing invitation)

**Recommendation:** **A.** Under the revised Principle #5, multi-lane menus are anti-proactive once inside a flow. The entry card already scoped the space; the greeting's job is to invite, not to re-enumerate.

### C3 — Freeform familiar-session (returning learner, default path)

**Current:** `"Hey again! What's on your mind today?"`

This is the most visible passive moment in the whole app — the first thing a returning kid sees when they tap Ask. **Per review feedback, any "pick up where we left off" lane has been removed from this surface: the Ask greeting cannot deliver on that promise. Ask sessions and Learn sessions have separate context chains; offering continuity that the next LLM turn can't honor creates a worse experience than the original passivity.**

**Candidates:**
- A. `"Hey again — what are you curious about?"` (7 words, invitation without false-state reference)
- B. `"Welcome back! Ask me anything."` (5 words, direct)
- C. `"Hey — want to throw me a question?"` (7 words, casual framing that normalizes asking)

**Recommendation:** **A.** Curiosity framing maps directly to what Ask is for; no promises the next turn can't keep.

### C4 — Freeform familiar-session (nth-return variant)

**Current:** `"What's on your mind? I'm ready when you are."`

Same passivity as C2. No functional reason to differentiate "returning" vs "nth-returning" here.

**Recommendation:** Use the same wording as C3-A. Consolidation beats variant management for strings this similar.

### C5 — Resume banner

**Current:** `"Welcome back - your session is ready."`

This banner fires when a kid backgrounded a session and returned within the 30-minute window. The resume banner lives in [session/index.tsx](../../apps/mobile/src/app/\(app\)/session/index.tsx) and has access to the active session's `topicTitle` (client-side state). That's different from C3 — here, the surface owns the state.

**Candidates:**
- A. `"Welcome back — you were exploring {topicTitle}. Keep going?"` (template, requires `topicTitle` present; falls back when null)
- B. `"Welcome back — pick up where you left off?"` (generic; no template)
- C. `"Welcome back! Ready to keep going?"` (shortest; no state reference)

**Recommendation:** **A** when `topicTitle` is present, falling back to **C** when null. The data is already on the session record; the template branch is a 1-line client change and has a clean null recovery (see Failure Modes).

**Why this is OK for C5 but not C3:** C5 renders on the active session's own screen, with the active session's `topicTitle` already hydrated in client state. C3 renders on the Ask entry — a *different* session (often a fresh one), whose future LLM turn has no access to whatever the kid was previously doing. C5's state reference is honest; C3's would be fabricated.

### C6 — First-message greeting (freeform path, pre-Ask-redesign)

**Current (new learner):** `"Hey! What would you like to learn about? You can ask me anything."`
**Current (returning learner):** `"Hey! What's on your mind today?"`

**These strings will become dead code when the Ask redesign ships** (the redesign removes the classification call on the freeform path). The Ask-redesign implementation plan at [docs/plans/2026-04-19-ask-flow-redesign.md](../plans/2026-04-19-ask-flow-redesign.md) is a multi-week effort; this copy sweep is days.

**Decision:** Edit C6 for the interim window. The edits become dead code when the Ask redesign lands. The throwaway is justified by faster time-to-ship on the proactivity feel; the delta between "live-with-passive-copy-for-weeks" and "polish-then-throw-away" favors polish.

**Candidates:**
- Match C3-A (returning) and C2-A (new). Consistency beats variant curation.

**Recommendation:** **Match C3-A / C2-A**. Accept that these specific lines will disappear when the Ask redesign ships.

### C7 — Subject classification acknowledgment

**Current:** `"Got it, this sounds like ${candidate.subjectName}."`

The spec at [epics.md:5146](epics.md#L5146) specifies a confident phrasing: `"Got it, this is about [Subject]."` I initially recommended aligning to the epic. **Review feedback — rightly — pushed back: "sounds like" is defensible because the classifier is not infallible, and the tentative phrasing invites correction. "This is about X" puts the onus on the kid to contradict the app.**

**Revised recommendation:** **Keep "sounds like".** Rationale:

- The classifier's confidence distribution is not uniformly high; the tentative hedge is UX-protective when it's wrong.
- "Sounds like" is conversational — kids can reply "no, actually" naturally. "This is about X" demands a bigger register shift to contradict.
- The epic's wording [epics.md:5146](epics.md#L5146) was written without explicit UX consideration of the confidence-error case. Flag the epic line for re-review in a follow-up; do not treat epic wording as UX authority without scrutiny.

**Alternative (adds complexity, only if confidence data justifies):** Confidence-conditional phrasing — `confidence > 0.9 → "is about"`, else `"sounds like"`. Currently no data on which threshold buckets produce classifier-error rates; if a future analysis shows classifier correctness > 95% for high-confidence buckets, reconsider.

**Small tweak:** Drop the leading "Got it" — it reads as confident-then-hedged. Replace with just: `"This sounds like ${candidate.subjectName}."` or `"Looks like ${candidate.subjectName}."`

**Recommendation:** `"Looks like ${candidate.subjectName}."` — tentative (preserves the hedge), removes the tonal contradiction of "Got it".

### U1 — Continue card subtitle (cheap version only)

**Current render:** `${subject} · ${topicTitle}` (e.g., "Mathematics · Addition and Subtraction of Whole Numbers")

**Scope:** Client-side reformat only. No API change, no schema change.

**Candidates:**
- A. `"Pick up {topicTitle}"` — topic as the invitation hook, subject dropped
- B. `"{topicTitle}"` — even barer, topic is the whole subtitle (the Continue card's icon + "Continue" header already carry the verb)
- C. Keep subject as label-small: `{subject}` rendered as a small label above a larger `{topicTitle}` (two-line layout, no copy change but visual hierarchy shift)

**Recommendation:** **A** for minimum disruption to the existing single-line layout. **B** if the designer confirms single-topic is visually sufficient. **C** is a layout change, which is adjacent-scope; noting but not owning here.

**Deferred to Direction B — real version:** A natural-language `continueHint` ("We were checking if 5 is prime") requires a fresh LLM call to produce. That's an LLM surface. Direction B is the right home for it. The eval harness needs to cover `exchanges.ts` first (see [docs/plans/2026-04-19-exchanges-harness-wiring.md](../plans/2026-04-19-exchanges-harness-wiring.md)).

### U2 — Homework camera screen

**Current:** `"We need your camera to photograph homework problems so your AI tutor can help you work through them step by step."`

"AI tutor" violates `no_jargon_kid_language`. Also "AI" exposes plumbing.

**Candidates:**
- A. `"We need your camera to take a picture of your homework so I can help you work through it."` (first-person persona, drop jargon)
- B. `"Snap a picture of your homework and I'll help you solve it step by step."` (outcome-first, mirrors the home-screen Homework card's subtitle "Snap a photo, get help")
- C. `"Your camera lets me see your homework so I can walk you through it."` (shorter, purpose-driven)

**Recommendation:** **B.** Outcome-first, first-person, matches home-card register.

---

## Files Affected

### Mobile (modify)

| File | Change |
|---|---|
| [apps/mobile/src/components/session/sessionModeConfig.ts](../../apps/mobile/src/components/session/sessionModeConfig.ts) | C1 (L68), C2 (L69), C3 (L104), C4 (L112) — four string edits |
| [apps/mobile/src/app/(app)/session/index.tsx](../../apps/mobile/src/app/\(app\)/session/index.tsx) | C5 (L1006) — resume banner template with null-safe fallback on `topicTitle` |
| [apps/mobile/src/app/(app)/session/_helpers/use-subject-classification.ts](../../apps/mobile/src/app/\(app\)/session/_helpers/use-subject-classification.ts) | C6 (L315-316), C7 (L364) — three string edits |
| [apps/mobile/src/components/home/LearnerScreen.tsx](../../apps/mobile/src/components/home/LearnerScreen.tsx) *(or wherever the Continue card renders)* | U1 — Continue card subtitle reformat (client-only, cheap version) |
| [apps/mobile/src/app/(app)/homework/camera.tsx](../../apps/mobile/src/app/\(app\)/homework/camera.tsx) | U2 — camera-permission body copy rewrite |

### Mobile (test)

All existing tests that assert the old strings (there's already a test at [use-subject-classification.test.ts:77](../../apps/mobile/src/app/\(app\)/session/_helpers/use-subject-classification.test.ts#L77) that hard-codes `"Hey! What's on your mind today?"`) must be updated in the same PR. New behavior tests added per the Testing Strategy section below.

### API / Schema

**None.** U1 cheap version is client-only. `continueHint` field is deferred to Direction B.

---

## Copy Principles Compliance Table

| String | Cold-generation avoided? | State referenced honestly? | Kid-language? | Minimal scaffolding? |
|---|---|---|---|---|
| C1 (placeholder) | ✓ | N/A | ✓ | ✓ |
| C2 (opening new) | ✓ | N/A | ✓ | ✓ (A is 4 words, not a triple-lane) |
| C3 (returning) | ✓ | ✓ — no false state reference | ✓ | ✓ |
| C4 (nth return) | ✓ | ✓ | ✓ | ✓ |
| C5 (resume banner) | ✓ | ✓ — state is on this surface | ✓ | ✓ |
| C6 (first-greeting) | ✓ | ✓ | ✓ | ✓ |
| C7 (subject ack) | N/A | ✓ (tentative, acknowledges classifier uncertainty) | ✓ | ✓ |
| U1 (Continue card) | ✓ | ✓ — topic name is already client-known | ✓ | ✓ |
| U2 (homework) | ✓ (action-verb) | N/A | ✓ (first-person, no "AI tutor") | ✓ |

---

## Failure Modes

| State | Trigger | Learner sees | Recovery |
|---|---|---|---|
| C5 `topicTitle` is null | Session state object missing the topic name | Falls back to C5 Candidate C (`"Welcome back! Ready to keep going?"`) | Null-check before template substitution. Unit-test both branches. |
| C5 template with data | Active session state has `topicTitle` | Renders `"Welcome back — you were exploring {topicTitle}. Keep going?"` | Normal path — test with representative topic names |
| Resume banner learner accepts pickup lane but LLM has no restored context | Kid taps "Keep going?" but server-side session state not fully hydrated (partial resume, race condition) | LLM's next turn is generic — not a recovery, a degraded experience | **Prevention:** only render the pickup lane when the active session has hydrated `topicTitle`. If hydration is still in-flight, show the null-safe fallback C5 Candidate C instead of the templated version. Never render the pickup lane on hope. |
| C7 classifier returned wrong subject | Kid asked about rivers, classifier returned "Literature" | "Looks like Literature." — kid replies "no, actually it's Geography" | Tentative phrasing is the recovery affordance. A confident phrasing ("This is about Literature") would force the kid into higher register to contradict. |
| C7 classifier confidence very low | Borderline classification (e.g., 0.6) | Same "Looks like {X}." rendering | Tentative phrasing handles the full confidence range acceptably. Confidence-conditional phrasing (see C7 Alternative) deferred until classifier-error data justifies complexity. |
| Localization / i18n | Future localization pass encounters new strings | New strings pass through the existing i18n key system | Coordinate with whoever owns i18n keys during implementation |
| Ask-redesign lands before this sweep | Ask redesign ships first | C6 edits were throwaway; no learner impact | Already priced in (see C6 section). Accept sunk copy-edit time as the price of earlier proactivity improvement. |

**No dead-end states.** Every surface where copy is rendered has a forward action (Send button, CTA, tap target).

---

## Testing Strategy

Tests fall into two categories. **Behavior tests** verify that given a specified state, the rendered output matches expected structure or content. **Revert guards** are plain string-match assertions that fail only if someone reverts the copy; they catch accidental regressions but don't verify correctness.

| What | How | Verified by | Test kind |
|---|---|---|---|
| C5 template with `topicTitle` | Render resume banner with mocked session state including `topicTitle = "prime numbers"` → assert rendered text contains `"prime numbers"` and the phrase structure `"Welcome back — you were exploring"` | `test: session/index.test.tsx:"resume banner references last topic when present"` | Behavior |
| C5 template null-safe fallback | Render with `topicTitle = null` (or missing) → assert rendered text matches the fallback copy exactly, does NOT contain the templated phrase | `test: session/index.test.tsx:"resume banner falls back when no last topic"` | Behavior |
| C5 partial-hydration protection | Render with `topicTitle` undefined (loading state) → assert fallback copy is used, not the templated version | `test: session/index.test.tsx:"resume banner uses fallback during hydration"` | Behavior (prevents the Failure-Modes "learner accepts pickup lane but no context" issue) |
| U1 card formatting | Render Continue card with representative `subject` + `topicTitle` state → assert the chosen candidate's structure is rendered; assert `subject` is NOT in the primary line (the whole point of the edit) | `test: LearnerScreen.test.tsx:"Continue card leads with topic"` | Behavior |
| C7 tentative phrasing preserved | Render classification ack with a sample subject name → assert the rendered copy starts with "Looks like" (or chosen tentative phrasing), not "Got it, this is about" | `test: use-subject-classification.test.ts:"classification ack is tentative"` | Behavior — protects the UX decision against accidental revert to the confident phrasing |
| U2 no "AI tutor" string in homework body | Render homework camera-permission screen → assert "AI tutor" substring is NOT present in rendered text | `test: homework/camera.test.tsx:"camera permission copy excludes AI jargon"` | Behavior (narrow — only asserts one specific jargon term) |
| Updated copy renders at all | Update existing snapshot tests (e.g., the hardcoded assertion at [use-subject-classification.test.ts:77](../../apps/mobile/src/app/\(app\)/session/_helpers/use-subject-classification.test.ts#L77)) to match the new strings | `test: use-subject-classification.test.ts:"greeting strings match new copy"` | **Revert guard** — change-detector, not correctness test. Labeled as such so reviewers don't read it as behavior verification. |

**Deliberately NOT in this testing strategy:**
- A CI grep guard for "AI tutor" or similar jargon. Single-phrase regex catches one phrase and false-positives on tests and i18n keys. The right durable tool is a copy registry with human review; flagged as a follow-up (see Out of Scope).

---

## Implementation Plan

This spec should feed into the writing-plans skill to produce a concrete implementation plan. Anticipated structure:

1. Finalize chosen candidate for each of C1–C7, U1, U2 — review decisions (roughly 10 minutes)
2. Apply all string edits in the five listed files
3. Add the new behavior tests (C5 null-safe branches, U1 card, C7 phrasing preservation, U2 narrow jargon check)
4. Update existing tests that assert the old strings — revert-guard class
5. Run mobile lint/typecheck/test — required per project rules
6. Manual smoke on Expo web preview — 5 minutes

**Expected PR size:** ~5 files modified, ~4 new behavior tests, ~1-3 existing-test updates. All in `apps/mobile`. Single PR, single reviewer pass, no cross-package contract changes.

---

## Out of Scope

- **Book-picker page copy** (`/pick-book/:subjectId`) — LLM-generated per-subject book cards with emoji + title + description. Copy register skews 8-11 not 11-17. Tracked for Direction B (prompt-level tuning).
- **The real version of U1** — natural-language `continueHint` in `/v1/progress/continue`. Only honest data source is a fresh LLM call. Direction B scope; requires `exchanges.ts` eval harness (see [docs/plans/2026-04-19-exchanges-harness-wiring.md](../plans/2026-04-19-exchanges-harness-wiring.md)).
- **The architectural fix for fake assistant bubbles** — moving hardcoded greetings out of the message stream into UI-layer elements. Separate spec.
- **Home-screen intent card copy** — "Ask" / "Learn" card labels and subtitles. The Ask card subtitle ("Get answers to any question") will need revisiting in the Ask-redesign integration.
- **A centralized copy registry + no-jargon governance** — the durable fix for "AI tutor"-class leaks is registry + human review, not per-phrase regex. Noted as follow-up; not this sweep.
- **Any LLM prompt text** — including `buildSystemPrompt`, `SESSION_ANALYSIS_PROMPT`, and the 7 other LLM surfaces in [docs/specs/2026-04-18-llm-personalization-audit.md](2026-04-18-llm-personalization-audit.md).
- **Voice-mode copy** — text-mode scope only.
- **Localization / i18n** — English-only in this pass; future localization extracts all strings including the new ones.

---

## Coordination with the Ask Redesign

The [Ask redesign spec](2026-04-19-ask-flow-redesign.md) explicitly states:

> Opening messages in `sessionModeConfig.ts` — unchanged

So C1–C4 do not collide with the Ask redesign.

C6 is different: the Ask redesign's plan ([docs/plans/2026-04-19-ask-flow-redesign.md](../plans/2026-04-19-ask-flow-redesign.md)) removes the freeform classification call, making the C6 greeting strings dead code on the freeform path. **This spec commits to editing C6 anyway for the interim window** (copy-sweep ships in days; Ask-redesign implementation is multi-week). The edits become throwaway when Ask redesign lands. Justified by the earlier proactivity improvement during the interim.

C7 is unaffected by Ask redesign — `use-subject-classification.ts` remains live for non-freeform modes.

No merge hazards in either sequencing order.

---

## Related Documents

- [docs/specs/2026-04-19-ask-flow-redesign.md](2026-04-19-ask-flow-redesign.md) — Ask flow redesign (Direction C)
- [docs/plans/2026-04-19-ask-flow-redesign.md](../plans/2026-04-19-ask-flow-redesign.md) — Ask-redesign implementation plan (the multi-week effort C6 is timed against)
- [docs/specs/2026-04-18-llm-personalization-audit.md](2026-04-18-llm-personalization-audit.md) — the 9 LLM prompt surfaces + tuning backlog (Direction B)
- [docs/plans/2026-04-19-exchanges-harness-wiring.md](../plans/2026-04-19-exchanges-harness-wiring.md) — eval harness extension for `exchanges.ts` (prerequisite for Direction B and U1 real version)
- Memory: `feedback_no_jargon_kid_language.md` (constraint), `feedback_never_lock_topics.md` (philosophy), `feedback_llm_prompt_injection_surfacing.md` (why echoing LLM output across surfaces is an anti-pattern), `project_llm_audit_2026_04_18.md` (context)
