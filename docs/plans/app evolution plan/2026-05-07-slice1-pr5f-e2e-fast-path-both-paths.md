# Slice 1 PR 5f — E2E Coverage For Create-Subject → First Active Prompt (Language + Non-Language)

**Date:** 2026-05-07
**Status:** Draft plan, ready to implement
**Branch:** `app-ev` (next on top of merged Slice 1 Wave 1/2)
**Parent plan:** `2026-05-06-learning-product-evolution-audit.md` § "Recommended Sequencing" / Slice 1 row 5f
**Wave:** Wave 3 — gates Wave 4 (5h deletion). Tests-only PR.
**Size:** S

---

## Goal (from audit)

> E2E: create-subject → first active prompt, language + non-language.

The audit treats Wave 3 as the green-light gate for Wave 4 (deletion). Both onboarding paths — non-language fast-path through `interview.tsx` and language fast-path through `language-setup.tsx` — must be covered by Maestro flows that prove the new behavior end to end before old screens are deleted.

---

## Current state (verified 2026-05-07)

### Existing E2E

`apps/mobile/e2e/flows/onboarding/onboarding-fast-path.yaml:1-103` — covers the **non-language** path (Photosynthesis subject). Asserts:
- Subject created from `home-action-study-new`
- Three interview turns reach `view-curriculum-button`
- Tap into session reaches `chat-input`
- Old preference screens NOT visible: `interests-context-continue`, `analogy-preference-title`, `accommodation-continue`, `curriculum-loading`, `continue-advanced-button`

The flow predates the audit (commit `f9da2998`, original fast-path commit). It does **not** assert anything about the first AI bubble's structure — only that the bypass succeeded.

### Missing

- No language-path E2E. `apps/mobile/e2e/flows/onboarding/` has no companion to `onboarding-fast-path.yaml` covering the language-subject route through `language-setup` → `startFirstCurriculumSession` → `/(app)/session`.
- No assertion in either flow that the first active prompt actually arrived (5b's first-turn rule).

### Code paths under test

- **Non-language fast path:** `interview.tsx:176-190` → `transitionToSession()` → `/(app)/session`.
- **Language fast path:** `interview.tsx:177-185` → `language-setup.tsx:192-208` → `startFirstCurriculumSession.mutateAsync()` → `router.replace('/(app)/session')`.

---

## Files to change

- `apps/mobile/e2e/flows/onboarding/onboarding-fast-path.yaml` — extend with first-prompt evidence assertion.
- `apps/mobile/e2e/flows/onboarding/onboarding-fast-path-language.yaml` — new file, language-path companion.
- (Possibly) `apps/mobile/e2e/flows/_setup/seed-and-sign-in.yaml` or a new seed scenario if `onboarding-complete` doesn't already produce a profile in a non-English device locale. To be confirmed during implementation.

**No source-code changes.** This is a tests-only PR.

---

## Implementation steps

1. **Extend `onboarding-fast-path.yaml`.** After the existing tap on `view-curriculum-button` and the `extendedWaitUntil chat-input` step (line 89-92), add:
   - **[HIGH-1 fix — source change required]** `MessageBubble` (`apps/mobile/src/components/session/MessageBubble.tsx`) has no per-role per-index testID. The outer `renderMessageItem` view also carries no testID. Available session testIDs are `thinking-indicator`, `outbox-pending-indicator`, `message-collapse-toggle`, `chat-messages` (FlatList container), and `chat-empty-state` — none identify a completed assistant message by position. Two options: (a) add `testID={`message-bubble-${msg.role}-${index}`}` to the `<MessageBubble>` call in `ChatShell.tsx` renderMessageItem (this is a source change — the "no source-code changes" constraint must be relaxed for this PR) and assert `id: "message-bubble-assistant-0"`; or (b) assert via Maestro text matching as described below. Do NOT simply skip this assertion — it is the only evidence the session produced a learner-prompting first reply.
   - Lightweight content assertion: Maestro regex matching requires the `~` prefix — use `text: "~.*\\?"` (not `".*\\?$"`). Example step: `- assertVisible:\n    text: "~.*\\?"` — this matches any visible text ending with `?`. Combine with a whitelist OR: `"~.*(what|how|why|which|tell me|try|answer|explain|\\?).*"`.
2. **Create `onboarding-fast-path-language.yaml`.** Mirror structure of `onboarding-fast-path.yaml` but:
   - Subject name: `"Italian basics"` (or whatever produces `pedagogyMode === 'four_strands'` in the existing seed scenario).
   - Three interview turns mirror the non-language flow **including the `tapOn: view-curriculum-button` step** — **[HIGH-2]** `goToNextStep()` (which routes to `language-setup`) is only triggered by tapping `view-curriculum-button` (`interview.tsx:891`). The `language-setup` screen will NOT appear until this tap happens. The YAML must follow the same `extendedWaitUntil view-curriculum-button` → `tapOn view-curriculum-button` pattern as the non-language flow before waiting for `language-setup`.
   - After tapping `view-curriculum-button`, wait for `language-setup-continue` — **[MEDIUM-2 fix]** `language-setup-screen` does NOT exist as a testID in `language-setup.tsx`. Use `language-setup-continue` (verified at `language-setup.tsx:398`).
   - On `language-setup`, assert native-language pre-selection — **[HIGH-3 fix]** the correct testID pattern is `native-language-${option.code}` (e.g., `native-language-nb`), NOT `language-setup-native-nb`. See `language-setup.tsx:333`: `testID={`native-language-${option.code}`}`.
   - Submit `language-setup-continue`; wait for `chat-input` on the session screen.
   - Same first-prompt evidence assertion as non-language flow (see HIGH-1 fix above).
   - Same not-visible assertions for the four legacy preference screens.
3. **Confirm seed scenario.** Verify `SEED_SCENARIO=onboarding-complete` produces a profile able to create both a non-language subject (Photosynthesis) and a language subject (Italian). If only one is supported, add a sibling scenario (e.g., `onboarding-complete-language`) in `apps/api/src/services/test-seed.ts`.
4. **Run both flows on local dev-client + Maestro Cloud.** Capture run output in PR description.

---

## Out of scope (other PRs)

- Strict assertion that the first reply ends with exactly one learner action (5b's prompt rule). Strict structural assertion belongs at the eval-harness layer (`apps/api/eval-llm/`), not in E2E — LLM output isn't deterministic enough for E2E. The heuristic regex is sufficient evidence for "the bypass led to a learner-prompting message."
- Deletion of any onboarding screens or routes. PR 5h owns that.
- Changes to source code of `interview.tsx`, `language-setup.tsx`, `create-subject.tsx`. Source remains untouched.

---

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| First-prompt regex matches non-prompt text | LLM happens to end first bubble with no `?` and no whitelist verb | Flow fails | Inspect bubble content, broaden whitelist or relax to "any non-empty bubble"; do not weaken to bypass-only assertion (see Tests Must Reflect Reality § 4 in `CLAUDE.md`) |
| Maestro Cloud can't render Norwegian locale | Device profile hardcoded to en-US | `language-setup-native-nb` not pre-selected | Either (a) add a Maestro `setLocale: nb` step, (b) accept en-default in this flow and add a separate locale-default test elsewhere |
| Language seed scenario missing | `SEED_SCENARIO=onboarding-complete` doesn't produce a language-eligible profile | Subject create fails or routes incorrectly | Add `onboarding-complete-language` seed scenario in `test-seed.ts` |
| Flake from 30-second `chat-input` timeout on language path | LLM cold start exceeds 30s | Flow times out | Bump timeout to 45s for language flow; do not skip the assertion |

---

## Verification

- Run both flows locally: `cd apps/mobile && pnpm e2e:dev-client onboarding/onboarding-fast-path.yaml` and `… onboarding/onboarding-fast-path-language.yaml`.
- Run on Maestro Cloud against staging build.
- **Red-green check** (per `feedback_fix_verification_rules`): temporarily revert PR 5c locally so `ONBOARDING_FAST_PATH` defaults to `false`, confirm both flows now FAIL (long-path screens become visible). Restore. This proves the assertions actually exercise fast-path behavior, not just any-onboarding behavior.

---

## Risk and rollback

- **Blast radius:** zero at runtime (tests-only). Flake risk on language path's LLM cold start; mitigated by extended timeouts.
- **Rollback:** revert the PR. Existing non-language flow returns to its narrower assertion; no language coverage. Wave 4 (5h) blocked until 5f re-lands.
- **Cannot break:** any production code path. No source files touched.

---

## Wave dependencies

- **Depends on (already shipped):** 5a, 5b, 5c, 5d, 5e, 5g, 5i.
- **Parallel-safe with:** 5j (different files — `mentor-memory.tsx`).
- **Blocks:** 5h (Wave 4 deletion needs 5f green to start its 14-day deadline). Slice 1.5a (topic-probe) is independent of 5f.

---

## Adversarial Review (2026-05-07)

### Pass 1 — Must address before writing YAML

**[HIGH-1] `chat-bubble-assistant-0` testID does not exist — first-prompt assertion has no anchor**
- Evidence: `apps/mobile/src/components/session/MessageBubble.tsx` — no per-role per-index `testID` prop anywhere in the component. `ChatShell.tsx:223-257` `renderMessageItem` wraps `<MessageBubble>` in an unstyled `<View>` with no `testID` either. The full testID inventory for session components is: `thinking-indicator`, `outbox-pending-indicator`, `message-collapse-toggle`, `chat-messages`, `chat-empty-state`, `chat-input`, `chat-shell-back`. None identify a specific completed assistant message.
- Proposed fix: Either (a) add `testID={`message-bubble-${msg.role}-${index}`}` to the `<MessageBubble>` call in `ChatShell.tsx` renderMessageItem — a minimal source change that makes this PR not strictly tests-only — and assert `id: "message-bubble-assistant-0"`; or (b) use Maestro text regex (`assertVisible: text: "~.*\\?"`) to match any question-ending text visible on screen after `chat-input` appears. Option (b) avoids the source change but is LLM-output-dependent and inherently flaky. Decision needed before writing YAML.

**[HIGH-2] Language YAML flow missing `tapOn: view-curriculum-button` — will timeout**
- Evidence: `interview.tsx:891` — `view-curriculum-button` is a `Pressable` with `onPress={goToNextStep}`. `goToNextStep` at line 177-186 is what calls `router.replace('/(app)/onboarding/language-setup')`. The `language-setup` screen never renders unless `goToNextStep` fires. Step 2 of this plan says "After interview submit, expect `language-setup` to appear" — but the 3rd Enter key does NOT trigger routing; only tapping `view-curriculum-button` does. If YAML skips that tap, the flow waits forever.
- Proposed fix: Language YAML must replicate the full non-language sequence: `extendedWaitUntil view-curriculum-button` → `assertNotVisible` guards → `tapOn view-curriculum-button` → `extendedWaitUntil language-setup-continue`. Inserted into Step 2 above.

**[HIGH-3] Wrong testID pattern for native-language assertion**
- Evidence: `language-setup.tsx:333` — `testID={`native-language-${option.code}`}`. Plan documents `language-setup-native-{nb|en}`. These are different strings. `language-setup-native-nb` will never be found; `native-language-nb` is the correct selector.
- Proposed fix: Replace all `language-setup-native-*` references in the YAML with `native-language-*`. Fixed in Step 2 above.

### Pass 2 — Safer follow-up tightening

**[MEDIUM-1] Maestro regex syntax missing `~` prefix**
- Evidence: No existing flow in `apps/mobile/e2e/flows/` uses text regex assertions, so there is no in-repo precedent to copy. Maestro's documented syntax for regex text matching is `text: "~<pattern>"`. Plan Step 1 writes `text: ".*\\?$"` — without `~`, this is a literal string match that will always fail on real LLM output.
- Proposed fix: Any regex content assertion must use `text: "~.*\\?"` (or similar). Fixed in Step 1 above.

**[MEDIUM-2] `language-setup-screen` testID doesn't exist**
- Evidence: Full `testID` grep of `language-setup.tsx` yields: `language-setup-guard-home`, `language-setup-back`, `language-setup-calibration-title`, `language-setup-error-retry`, `language-setup-error-cancel`, `native-language-${option.code}`, `native-language-other-input`, `language-setup-continue`. No `language-setup-screen`.
- Proposed fix: Use `language-setup-continue` (already present as fallback in original plan). Remove the non-existent `language-setup-screen` reference. Fixed in Step 2 above.

### Out of scope / acknowledged

- The "no source-code changes" framing in the original plan may need to be relaxed if HIGH-1 is resolved via option (a). That is an acceptable trade-off: a 1-line `testID` addition to `ChatShell.tsx` is low-risk and gives stable E2E anchors for all future session flows.
- Seed scenario gap for language subjects (Step 3) is flagged but correctly deferred to implementation-time verification. The `onboarding-complete` seed (`test-seed.ts:524-528`) creates "General Studies" — language subject eligibility depends on LLM subject classification of the input name, which is non-deterministic. If the seed needs a language-specific scenario, that is a small `test-seed.ts` addition.
- The red-green check in Verification is solid and should not be removed.
