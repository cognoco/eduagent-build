# Spec — Subject Onboarding Fast Path

**Status:** Draft
**Date:** 2026-05-05
**Owner:** TBD
**Branch:** TBD
**Supersedes / refines:** Current `create-subject → interview → interests-context → language-setup|analogy-preference → accommodations → curriculum-review` flow

---

## Context

A learner who creates a non-language subject from home with extracted interests currently passes through five screens before any tutoring exchange happens:

```
create-subject → interview → interests-context → analogy-preference → accommodations → curriculum-review → tutoring
```

For an 11+ educational app, that is product-suicide territory. Engagement-first kids/teens apps (Duolingo, Kahoot, Khan Kids) get to first interaction in zero or one deliberate screen. Five gating screens of meta-questions invite bounce before the kid has experienced what the product actually does for them.

Two of those screens compound the problem:

- **`analogy-preference`** asks the learner to declare *how they want analogies framed*. This requires metacognitive awareness about their own learning style. Most adults can't articulate this. A 12-year-old certainly can't — and worse, the answer is something the system can infer for free from what lands in session 1–3.
- **`accommodations`** captures support needs (focus aids, reading-level adjustments, etc.) per subject. But "I have ADHD / I'm dyslexic / I read slowly" are *person* facts, not subject facts. Capturing them once at profile-level is enough. Asking again per subject is friction without payoff.
- **`interests-context`** asks the learner to tag each detected interest as `school | free_time | both`, with `both` auto-defaulted and a Skip path (`apps/mobile/src/app/(app)/onboarding/interests-context.tsx:32-41,90-93,289`). It is one tap to dismiss today — the case for removal is "even one-tap meta-question with no payoff is friction" rather than "metacognitive burden".

The interview itself is already conversational, LLM-driven, and good at extracting interests. With a slightly richer prompt, it can absorb most of the signal these three screens collect — without making the kid answer a single explicit personalization question.

---

## Goals

- For non-language subjects: get from "I want to learn X" to first real tutoring exchange in **at most one deliberate screen** between `create-subject` and tutoring (the interview chat).
- For language subjects (`four_strands`): up to two screens — interview + a slimmed `language-setup` capturing L1 + CEFR. See Open Q1 for the path to a single screen.
- Direct-match cases (`focused_book`): aim for `create-subject → tutoring` with the interview folded into the first tutoring turn. **This is a backend redesign, not a routing tweak — see "What 'interview as first tutoring turn' actually requires" below. Until that section is resolved, treat `create-subject → interview → tutoring` (1 screen) as the floor for focused_book too.**
- Zero forced choices that require metacognition. No "do you prefer concrete vs abstract analogies?" prompts.
- All personalization signals come from one of three sources: extracted from the interview, inferred from in-session behavior, or surfaced on-demand when the user asks.

## Non-goals

- Removing the interview itself. The interview *is* the engagement-first surface; the goal is to make it carry the load, not to delete it.
- Changing **initial profile onboarding** (first-time app setup). This spec is about *per-subject* onboarding only.
- Changing the profile-wide onboarding screens that share the `(app)/onboarding/` route folder: `language-picker.tsx` (UI conversation language) and `pronouns.tsx` (BKT-C.1, age-gated). These are first-time-app gates, not per-subject, and stay untouched.
- Changing parent-side onboarding or parent-driven flows.
- Deciding the fate of `language-setup` for language subjects. Treated as an open question below — likely keep, possibly slim.
- Removing `pick-book` for broad subjects. The book-picker gives the learner agency over what they study; that is value, not friction.

---

## Current vs proposed flow

### Current (verified from code 2026-05-05)

After `create-subject` resolves and creates the subject, routing branches by structure type:

| Path | Sequence |
| --- | --- |
| From chat (`returnTo=chat`) | back to session via `homeHrefForReturnTo` (`apps/mobile/src/app/create-subject.tsx:23,66-69`), *no onboarding* |
| `focused_book` | interview → (interests-context if interests) → analogy-preference → accommodations → curriculum-review → tutoring |
| `broad` | pick-book → interview → ... same tail |
| `four_strands` (language subject) | interview → (interests-context if interests) → **language-setup** → accommodations → curriculum-review → tutoring |
| else | interview → (interests-context if interests) → analogy-preference → accommodations → curriculum-review → tutoring |

Worst case: 5 screens after `create-subject`. Best non-chat case: 3 screens.

### Proposed

| Path | Sequence | Screens after `create-subject` |
| --- | --- | --- |
| From chat | back to session | 0 |
| `focused_book` | interview → tutoring (target: collapse interview into first tutoring turn — see backend section) | 1 (target 0, conditional) |
| `broad` | pick-book → interview → tutoring | 2 |
| `four_strands` (language subject) | interview → language-setup (slimmed) → tutoring | 2 |
| else | interview → tutoring | 1 |

Removed from the gating chain: `interests-context`, `analogy-preference`, `accommodations`, `curriculum-review`.

These screens are not deleted in phase 1 — they are bypassed in the routing layer and remain accessible from Settings (Phase 3, see Migration). Deletion comes once the bypass stabilizes (Phase 4).

---

## What the interview must absorb

To replace the bypassed gating screens, the interview's signal-extraction layer must capture more than it does today.

**Source files (verified 2026-05-05):**
- Prompts: `apps/api/src/services/interview-prompts.ts` — `INTERVIEW_SYSTEM_PROMPT` (live, lines 8-27, returns `{ reply, signals: { ready_to_finish } }`) and `SIGNAL_EXTRACTION_PROMPT` (post-hoc, lines 29-45, returns goals/experienceLevel/currentKnowledge/interests).
- Schema: `extractedInterviewSignalsSchema` in `packages/schemas/src/sessions.ts:46-54`. Today: `goals`, `experienceLevel`, `currentKnowledge` are required; `interests` is optional.
- Persistence: `onboardingDraftSchema.extractedSignals` is `z.record(z.string(), z.unknown())` (`sessions.ts:94`) so the JSONB column tolerates additive fields.

| Signal | Where it gets captured | Fallback if missing |
| --- | --- | --- |
| **Interests** (already extracted) | `SIGNAL_EXTRACTION_PROMPT` — already in shape | Empty list → Mentor asks naturally session 1 |
| **Interest context** (`school | free_time | both`) | Add to `SIGNAL_EXTRACTION_PROMPT`. Default `both`, override only on strong transcript signal. | `both` is the existing safe default |
| **Analogy framing** (concrete / abstract / playful) | Add to `SIGNAL_EXTRACTION_PROMPT`. Inferred from the learner's own language style across the transcript. | Default to *concrete* (safest for ages 11–14) |
| **Pace preference** (chunk size, density) | **Mechanical, not LLM** — derived from message length + read-time estimates over the transcript. Compute server-side at extraction time. | Mentor adapts from in-session engagement (existing behavior) |
| **Soft accommodation hints** (request to repeat, "I don't get it" frequency) | NOT captured upfront. Mentor observes in-session and adapts. | Hard accommodations come from parent profile (existing) |

**Out of scope for the interview prompt:** declared disabilities or learning differences. Those belong in the parent-side profile, where they already live, and are protected by parent consent flow.

### LLM envelope compliance (CLAUDE.md non-negotiable)

CLAUDE.md requires LLM state-machine signals to use `llmResponseEnvelopeSchema`. The current interview's live `{ signals: { ready_to_finish } }` shape is **already drift** (tracked as F1.1 in `project_llm_marker_antipattern.md`). Adding more inferred signals is a chance to fix this, not compound it.

**Decision:** Place all *new* signal capture in the post-hoc `SIGNAL_EXTRACTION_PROMPT` only, where the response is already a structured JSON blob and is parsed via `safeParse` at the boundary. Do **not** add new signal keys to the live `INTERVIEW_SYSTEM_PROMPT` reply — that path will be migrated separately to the canonical envelope under F1.1, and this spec must not block on or duplicate that migration.

Hard cap: every envelope-derived signal must have a server-side default so the flow proceeds even if extraction returns nothing (`extractedInterviewSignalsSchema.safeParse(...)` already returns `success:false` cleanly; see `apps/api/src/routes/interview.ts:435,483`).

### Schema-extension consumer audit (must complete before Phase 1 ships)

`extractedSignals` is referenced in 19 files. Before extending the schema, verify each consumer tolerates additional optional keys:

- API routes that parse from JSONB: `apps/api/src/routes/interview.ts:435,483` (already `safeParse` — safe).
- Service layer: `apps/api/src/services/interview.ts`, `apps/api/src/services/curriculum.ts`.
- Inngest: `apps/api/src/inngest/functions/interview-persist-curriculum.ts` (and its tests).
- Mobile: `apps/mobile/src/hooks/use-interview.ts`, `apps/mobile/src/app/(app)/onboarding/interview.tsx`.
- Tests + integration: `tests/integration/onboarding.integration.test.ts`, `apps/api/src/routes/interview.test.ts`, `apps/api/src/services/interview.test.ts`, `apps/api/src/middleware/metering.test.ts`, `apps/api/src/services/curriculum.test.ts`, `apps/mobile/src/app/(app)/onboarding/interview.test.tsx`, `apps/api/src/inngest/functions/interview-persist-curriculum.{integration.,}test.ts`.

Action item before Phase 1 merges: grep each file for `.parse(` vs `.safeParse(` against `extractedInterviewSignalsSchema` and confirm none use `.strict()`. Add a round-trip test that writes a draft with the new fields, reloads via API, and asserts they survive.

### LLM eval coverage (Phase 1 gating)

Inferring analogy framing and interest context from a 3-4 exchange interview is a thin signal source. Phase 1 merges only when:

- New eval scenarios are added to `apps/api/eval-llm/` for each new dimension across the 5 fixture personas (ages 11–17). Minimum: 5 personas × 3 dimensions = 15 scenarios; preferably 2 transcript variants per persona for spread.
- Signal-distribution baselines are committed via `pnpm eval:llm --update-baseline` and a CI check runs `--check-baseline` (per `project_eval_llm_signal_metrics.md`).
- Live tier (`pnpm eval:llm --live`) passes schema validation against the extended `expectedResponseSchema`.

---

## What "interview as first tutoring turn" actually requires (focused_book 0-screen path)

The proposal to collapse `focused_book` to `create-subject → tutoring` is **not a routing change** — it merges two distinct backends:

- The interview persists exchanges in the `onboarding_drafts` table (`packages/schemas/src/sessions.ts:89-99`) and runs through `apps/api/src/routes/interview.ts` with the diagnostic `INTERVIEW_SYSTEM_PROMPT` (capped at 3-4 exchanges, ends with `ready_to_finish`).
- Tutoring writes to `learning_sessions` and uses the Mentor pedagogy prompt (different framing, different cap, no `ready_to_finish` signal).
- Curriculum materialization runs in `apps/api/src/inngest/functions/interview-persist-curriculum.ts`, triggered when an interview draft completes. The `curriculum-review` screen today reads what that Inngest function produced; if curriculum-review is removed, Mentor turn 1 must read from the same materialized curriculum at session start.

For phase 2 of this spec, the focused_book path keeps the interview screen (= 1 screen). The 0-screen target is **explicitly deferred** to a follow-up spec that must answer:

1. Which table holds the conversation — `onboarding_drafts`, `learning_sessions`, or a new join?
2. Which prompt drives turn 1 — the diagnostic interview prompt is wrong for tutoring (it asks "what do you already know" and wraps up after 3-4 turns); a new "warm framed first tutoring turn" prompt is required.
3. When does curriculum materialization fire if there is no separate interview-complete event?
4. How does signal extraction run if the conversation is "tutoring" semantically?

Until that follow-up spec lands, do not ship a focused_book path that skips the interview screen.

## Where deferred personalization surfaces

Just because we don't *gate* on these doesn't mean they vanish. The principle (matches existing memory `feedback_quiet_defaults_over_friction`): *surface controls only when sought*.

1. **Mentor in-session adaptation.** Already happens. The Mentor watches engagement signals and adjusts. After this redesign, it carries more weight.
2. **"Tell the Mentor how you learn best" affordance.** New always-available panel in **Settings** (and repeated in **More**). Exposes the same controls the deleted screens collected — analogy framing, interest context, pace, accommodations — as opt-in adjustments. Power users / parents can find it; casual users never see it.
3. **Parent-side profile.** Canonical place for declared accommodations. No change.
4. **Mentor probes when ambiguous.** If session 1 produces no clear signal in a dimension, the Mentor asks naturally ("Want me to use shorter examples?") rather than gating with an upfront screen.

---

## Failure Modes

| State | Trigger | User sees | Recovery |
| --- | --- | --- | --- |
| Interview LLM extraction fails | Network error during interview | Standard chat error UI ("Try Again") | Existing recovery — failure is non-blocking, tutoring starts with neutral defaults |
| Interview returns empty `extractedSignals` | Kid sends 1–2 generic messages then closes | Tutoring starts with neutral defaults | Mentor probes for missing signals organically in early sessions |
| Interview misclassifies (wrong analogy framing inferred) | Wrong heuristic from limited data | Mentor uses wrong framing for first 1–2 turns | Two safety nets: (a) Mentor adapts from in-session engagement, (b) "Tell the Mentor how you learn best" affordance lets user correct anytime |
| Kid skips interview entirely | Hardware back / close button | Tutoring starts with no captured signal | Existing skip path preserved; Mentor falls back to defaults + probes |
| Language subject (`four_strands`) | `languageCode` set after resolve | Routes to slimmed `language-setup` (still capturing L1 + CEFR) | See open question — may further slim or defer |
| Parent enables accommodation later | Profile update mid-flow | Mentor picks up new flag at next session start | Existing flag-load behavior preserved |
| Power user wants explicit upfront control | Tech-aware parent setting up child | After Settings affordance ships: Settings → "Tell the Mentor how you learn best" exposes all controls. Phase 2 → Settings-spec gap: no upfront affordance available; defer cleanup of bypassed screens until panel ships. | See Phase 3/4 acceptance gate in Migration |
| Routing rollback needed | Engagement metrics regress in staging or prod | Code change flipping `ONBOARDING_FAST_PATH=false` → mobile OTA + Worker redeploy returns the original 5-screen flow | Bypassed screens are not deleted until Phase 4; revert is by code, not by runtime toggle |
| Curriculum-review removed but learner wants to confirm plan | Used to like the "Here's your plan, hit Start" mini-commitment | First Mentor turn opens with plan summary + "ready?" | Same content delivered as conversational beat instead of separate screen |

---

## Migration / rollout

**Note on rollout mechanism.** This repo has no runtime feature-flag service (no LaunchDarkly / Statsig / similar; CLAUDE.md and project memory reference none). "Toggle off" is therefore not available as a hot rollback. Phase 2 ships as code behind a build-time constant (`ONBOARDING_FAST_PATH = true | false`) — flipping it requires a code change + mobile OTA (per `project_eas_update_ota.md`, JS-only changes deploy in ~5 min) plus a Worker redeploy for the API side. A/B testing with per-user assignment is **out of scope** for this spec; the rollout is staged-by-environment (staging → prod) with revert-by-OTA as the rollback.

**Phase 1 — Prompt + extraction (1–2 days)**
- Extend `SIGNAL_EXTRACTION_PROMPT` in `apps/api/src/services/interview-prompts.ts` to capture interest context (`school | free_time | both`) and analogy framing (`concrete | abstract | playful`). Do **not** modify `INTERVIEW_SYSTEM_PROMPT` — see "LLM envelope compliance".
- Compute pace preference mechanically server-side from transcript message length / read-time. No LLM change for pace.
- Extend `extractedInterviewSignalsSchema` in `packages/schemas/src/sessions.ts` with the new fields, all optional with safe defaults. Run the consumer audit listed above.
- Add round-trip test through `onboarding_drafts` JSONB persistence.
- LLM eval harness: add scenarios per "LLM eval coverage" above; commit signal-distribution baselines.
- No routing changes yet. Existing screens still gate.

**Phase 2 — Routing fast path (2–3 days)**
- Build-time constant `ONBOARDING_FAST_PATH` in mobile + API. Default `false` in prod, `true` in staging.
- `interview.navigateForward` (`apps/mobile/src/app/(app)/onboarding/interview.tsx:115`) checks the constant: when `true`, bypasses `interests-context`, `analogy-preference`, `accommodations`, `curriculum-review` and routes straight to the first tutoring session.
- For language subjects: routes interview → `language-setup` → tutoring (still 2 screens; see Open Q1).
- For `focused_book`: still routes through interview (1 screen) — see "What 'interview as first tutoring turn' actually requires".
- Tests: update unit tests for both constant states; add E2E flow covering the fast path.

**Phase 3 — Settings affordance (deferred to follow-up spec)**
- The "Tell the Mentor how you learn best" Settings panel (fields, copy, IA placement, edit/clear semantics, test plan) is large enough to deserve its own spec. Phase 2 ships without it: bypassed screens are temporarily unreachable from Settings, accepting that gap as a 1–2 sprint risk while the Settings spec lands.
- Acceptance gate: Phase 4 cleanup (deletion) does **not** start until the Settings affordance is shipped, so power users always have a path to the same controls.

**Phase 4 — Defaults flip + cleanup (after stable bake)**
- Flip default to `ONBOARDING_FAST_PATH=true` in prod once Phase 2 has run in staging without regressions.
- Engagement metrics for the bake must be defined **before Phase 2 starts** (see Open Q5). Without a defined metric and threshold, "stable bake" is a vibes call and Phase 4 cannot trigger.
- After ≥2 weeks at 100% in prod with metrics meeting threshold and the Settings affordance shipped: delete `interests-context.tsx`, `analogy-preference.tsx`, `accommodations.tsx`, `curriculum-review.tsx` route files + tests + i18n keys.
- Update `docs/flows/mobile-app-flow-inventory.md`.

**Accommodation data — investigation required before Phase 4**
The `accommodations.tsx` screen persists data somewhere. Before deleting the route, identify:
(a) which table/column accommodations are written to, (b) whether they are per-subject or merge to profile, (c) what to do with rows captured before the bypass. If accommodations are per-subject and the new model is profile-only, Phase 4 must include a data migration or an explicit "drop, no migration" decision documented per CLAUDE.md "Schema And Deploy Safety" Rollback rule.

**Curriculum hand-off — verified before Phase 2**
Removing `curriculum-review.tsx` is safe only if Mentor session 1 reads the materialized curriculum produced by `apps/api/src/inngest/functions/interview-persist-curriculum.ts`. Phase 2 acceptance includes a test asserting that the first tutoring turn references the curriculum without the user passing through curriculum-review.

**Rollback procedure**
- Phase 1 schema additions are additive and safe to leave in place even if Phase 2 reverts.
- Phase 2 routing change reverts via OTA (mobile) + Worker redeploy (API) flipping the constant. No data loss; `extractedSignals` schema remains additive.
- Phase 4 cleanup is irreversible (deletion). Gate: ≥2 weeks at 100% in prod, defined metric within threshold, Settings affordance shipped.

---

## Open questions

1. **`language-setup` for language subjects — keep, slim, or defer?**
   L1 (native language) and CEFR level genuinely matter for language pedagogy from turn 1. Three options:
   (a) Keep as-is — 1 extra screen for language subjects only is acceptable.
   (b) Slim to single screen with smart defaults: L1 = UI conversation language, CEFR inferred from session 1 behavior.
   (c) Defer entirely — Mentor asks in turn 1.
   Recommend (b). Action item: pick before phase 2.
   **Phase 2 decision (2026-05-05):** Use option (a), keep `language-setup` as-is for this implementation. This preserves the 2-screen language-subject path while fast-pathing the generic path; slimming is deferred to a follow-up spec.

2. **`pick-book` for broad subjects — still needed?**
   Currently a kid who creates "Math" picks one book before tutoring. Alternative: dive into Mentor and let it scaffold book selection conversationally.
   Lean toward keeping. Book-picker gives explicit agency over scope; that's value, not friction.

3. **Should `interests-context` survive as an opt-in mid-interview clarifier?**
   If the interview *strongly detects* an interest but is genuinely unsure of context (school vs hobby), surface a single-tap clarifier inline ("Is soccer for school or just for fun?"). Don't make it a full screen.
   Recommend yes — but as inline interview UI, not a separate route.

4. **`curriculum-review` — collapse into Mentor turn 1, or remove entirely?**
   The "Here's your plan, hit Start" mini-commitment may have value as anticipation-building. Easiest path: Mentor's opening message includes a 2-line plan summary + "ready to start?" Conversational beat, no extra screen.

5. **Engagement metrics — hard gate, must be defined before Phase 2 starts**
   Phase 4 (deletion) cannot trigger without a defined metric and threshold. Candidate primary: time from `create-subject` → first tutoring exchange. Candidate secondaries: subject-creation completion rate, session-1 message count, day-2 retention. Per-user A/B is out of scope — comparison is staging-baseline vs staging-with-fast-path, then prod-pre-flip vs prod-post-flip windows. **Owner + threshold values must be filled in before Phase 2 merges.**
   **Phase 4 gate decision (2026-05-05):** Owner: product/UX analytics owner for onboarding. Primary metric: median time from tapping create-subject submit to first learner-visible tutoring exchange. Threshold: fast-path median must be at least 60% lower than the prod pre-flip baseline, with no worse than a 2 percentage point regression in subject-creation completion rate and no worse than a 5% regression in day-2 return among learners who create a subject. Bake window: at least 2 weeks at 100% prod before deletion.

---

## Out of scope

- Initial profile / first-time-app onboarding redesign.
- Parent-side onboarding redesign.
- Web flow differences (defer; redesign is mobile-first).
- Whether to delete the deprecated screens permanently or retain them flag-gated indefinitely (decided in phase 4 based on data).
- Onboarding for shared / proxy profiles (parents creating subjects on behalf of children).

---

## References

- Current flow trace: walked through code 2026-05-05; sources `apps/mobile/src/app/(app)/onboarding/*.tsx`, `apps/mobile/src/app/create-subject.tsx`.
- Project memory `feedback_quiet_defaults_over_friction` — principle alignment.
- Project memory `feedback_never_lock_topics`, `feedback_human_override_everywhere` — principle alignment for the always-available settings affordance.
- CLAUDE.md → "UX Resilience Rules" — failure mode requirement.
- LLM eval harness: `apps/api/eval-llm/` + `pnpm eval:llm`.
