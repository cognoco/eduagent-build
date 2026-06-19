---
title: S1 — New Mentor Home (Card Feed + Ever-Present Input Bar + Camera + Homework Chip) — Implementation Plan
date: 2026-06-10
profile: ui
spec: docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md
status: draft
---

# S1 — New Mentor Home — Implementation Plan

> Synced to spec amendment 2026-06-10 (§2 P5/P6/P7, §2.1, §3.1, §13.7, §15.14–16/19) and amended 2026-06-13 for earned motivation, lost V1 flows, and the no-surprises dossier proposals (post-auth handoff, V2 homework round-trip, first-session wrap-up).

**Goal:** Ship the new Mentor-tab home — a deterministic `GET /now` card feed (one anchor + ≤2 module cards, every card a tappable action, all declinable; the anchor visually unique) behind a **local-first intent-matcher** that turns typed/spoken bar text into a zero-LLM deterministic jump on a confident route-catalog match and a mentor turn otherwise (§2 P5), an ever-present pinned input bar with a camera button, a Homework quick-chip, and a voice mic (transcription-only), a learner **cold-start card** that owns the anchor slot until first real state (§3.1), the post-auth/consent handoff into that cold-start card, the first V2 homework-camera round-trip back into the conversation thread, template-rendered ledger-moment cards (no LLM), and the earned-motivation home affordances — calm "on track" momentum replacing pressure-style streak display, compact reward receipts after real learning events, a light-practice doorway for quiz games, journey-node advancement at the completion moment, an interim in-conversation micro-celebration (§2 P7 / §2.1), and a first-session wrap-up turn that asks for learner-written "Your Words" and shows the reflection bonus receipt — mounted behind `MODE_NAV_V2_ENABLED` as additive "screen #89", with V0/V1 nav completely untouched.

**Approach:** Additive only. Add the V2 flag in `feature-flags.ts`; branch on it in `useNavigationShellContract` (`use-navigation-contract.ts:142`) to return a three-tab V2 set without touching `resolveNavigationContract` or `legacy-navigation-contract.ts` (§7 no-regress). Build a new `mentor.tsx` Expo Router page (the V2 Mentor tab) that consumes a new typed `useNowFeed()` hook (Hono RPC off `AppType`, TanStack Query, AsyncStorage-persisted for the feed-unavailable fallback). Compose three new presentational components — `NowCardStack` (heir of `CoachBand`), `MentorInputBar` (heir of `HOME_INTENT_ACTIONS` homework/ask-anything), and `LedgerMomentCard` — all persona-unaware, semantic-token-only, every string through `t()`. Every spec §14 S1 failure row renders through the existing `ErrorFallback`/`TimeoutLoader`. **This plan consumes the frozen S0 contract verbatim** (`GET /now`, `NowCard`, `NowDeepLink`, route-catalog keys); it adds no backend and changes no `/now` ranking (S0 owns it).

## Scope

In scope:
- `apps/mobile/src/lib/feature-flags.ts` — add `MODE_NAV_V2_ENABLED` (one line after `:31`)
- `apps/mobile/src/hooks/use-navigation-contract.ts` — additive V2 branch in `useNavigationShellContract` (`:142`)
- `apps/mobile/src/app/(app)/_layout.tsx` — register `mentor` / `subjects` / `journal` `Tabs.Screen` entries; add the three to `FULL_SCREEN_ROUTES` exclusion is NOT needed (they are tabs); `subjects`/`journal` are S1 stubs (S2/S3 fill them)
- `apps/mobile/src/app/(app)/mentor.tsx` — NEW V2 Mentor-tab page (the card feed + pinned bar)
- `apps/mobile/src/app/(app)/subjects.tsx`, `apps/mobile/src/app/(app)/journal.tsx` — NEW minimal stub pages (so the V2 tab set has three real routes; content is S2/S3)
- `apps/mobile/src/hooks/use-now-feed.ts` — NEW typed `/now` + `/now/overflow` fetch hooks + AsyncStorage feed cache
- `apps/mobile/src/components/mentor/NowCardStack.tsx` — NEW card-stack (≤3, declinable, deep-link push, overflow entry)
- `apps/mobile/src/components/mentor/NowCard.tsx` — NEW single-card renderer (template-driven copy)
- `apps/mobile/src/components/mentor/LedgerMomentCard.tsx` — NEW template-rendered ledger-moment card (no LLM)
- `apps/mobile/src/components/mentor/MentorInputBar.tsx` — NEW pinned bar: text entry + camera button + Homework chip
- `apps/mobile/src/components/mentor/index.ts` — NEW barrel
- `apps/mobile/src/lib/now-deep-link.ts` — NEW client-side deep-link expander (closed route catalog → full ancestor-chain `router.push` sequence)
- `apps/mobile/src/lib/now-feed-cache.ts` — NEW AsyncStorage read/write for the last-good feed (feed-unavailable fallback)
- `apps/mobile/src/lib/bar-intent-match.ts` — NEW local-first intent-matcher (§2 P5): typed/spoken text → confident closed-route-catalog match (deterministic jump, zero LLM) or a miss (mentor turn); falls back to buttons when uncertain
- `apps/mobile/src/app/(app)/_lib/auth-redirect.ts` plus the profile/consent post-gate callers — V2 post-auth handoff: no setup wizard / subject picker before the Mentor cold-start card
- `apps/mobile/src/app/(app)/homework/camera.tsx` and `apps/mobile/src/app/(app)/homework/_view-models/homework-session-params.ts` — V2 homework source/return params for the Mentor-thread round-trip
- `apps/mobile/src/app/(app)/session/_view-models/session-route-params.ts` and `apps/mobile/src/app/(app)/session/index.tsx` — V2 image-bubble handoff, help/check buttons, and first-session wrap-up turn
- `apps/mobile/src/components/session/use-subject-classification.ts` — V2 conversational mentor-turn subject resolution: carry the typed `rawInput` from `mentor.tsx`; no turn-1 library-grid gate; mentor-voiced inline disambiguation on genuine ambiguity; silent create-from-suggestion; always-visible override (T25). V0/V1 picker path untouched.
- `apps/mobile/src/components/mentor/ColdStartCard.tsx` — NEW learner cold-start anchor card (§3.1): input bar + three fill-not-fire example chips at equal visual weight; self-destructs on first real state
- `apps/mobile/src/components/mentor/OnTrackBadge.tsx` — NEW calm "on track" badge replacing streak display on the home (§2 P7 / §2.1)
- `apps/mobile/src/components/mentor/RewardReceiptCard.tsx` — NEW compact earned-reward receipt (practice points/XP, reflection bonus, personal best, mastery delta) rendered only after real learning events
- `apps/mobile/src/components/mentor/LightPracticeAffordance.tsx` — NEW low-pressure "something lighter?" doorway to built quiz/practice games (Capitals, Guess Who, vocabulary, dictation where available)
- `apps/mobile/src/components/mentor/MentorCelebration.tsx` — NEW interim in-conversation micro-celebration styling (bubble motion / warm burst around the mentor's words), fired at the completion moment (§2.1 channel 4)
- `apps/mobile/src/lib/first-real-state.ts` — NEW deterministic predicate: has the learner created first real state (first subject OR first completed exchange)? Keys cold-start self-destruction (§3.1)
- `apps/mobile/src/i18n/locales/en.json` — NEW `mentorHome.*` keys + `tabs.mentor/subjects/journal` keys (same PR)
- `apps/mobile/eas.json` — add `EXPO_PUBLIC_ENABLE_MODE_NAV_V2: 'true'` to `development.env` + `preview.env` only
- `.github/workflows/ci.yml` — add `EXPO_PUBLIC_ENABLE_MODE_NAV_V2: 'true'` to the OTA env block (`:325`)
- Co-located `*.test.tsx` for each new component/hook/lib (paths in `## Tests`)

Out of scope (must NOT change):
- **`apps/mobile/src/lib/navigation-contract.ts` and `apps/mobile/src/lib/legacy-navigation-contract.ts`** — zero edits. The V2 branch lives only in the hook (`use-navigation-contract.ts`), short-circuiting before V0/V1 logic. This is what guarantees the §7 V0/V1 no-regress.
- **`apps/mobile/eas.json` `production.env`** — untouched (V2 stays off in prod; prod = V0-on / V1-off / V2-off, unchanged).
- **`home.tsx`, `LearnerScreen.tsx`, `CoachBand.tsx`, `ParentHomeScreen.tsx`** — the V0/V1 `home` tab and its children are NOT edited or deleted. `CoachBand` is a *template reference* for `NowCard`, not a file to modify. `mentor.tsx` is a parallel route; `home.tsx` keeps rendering for V0/V1.
- **The `/now` ranking, the activity ledger table, the route catalog, or any backend** — S0 owns them. S1 only *consumes* the frozen contract. If a card needs a field `GET /now` does not return, the gap is an S0 change, not an S1 invention.
- **Subjects-hub content (S2), Journal content (S3), supporter scopes / scope chip (S4).** `subjects.tsx`/`journal.tsx` ship as honest "coming-in-S2/S3" stubs so the three-tab set is real; their content is later phases.
- **Core OCR/problem parsing/tutoring internals in homework/session/dictation/practice** — no rewrite. S1 touches the homework camera and session route only for the V2 source/return params, same-thread image bubble, help/check buttons, and first-session wrap-up framing (T22–T24). Dictation/practice remain reused navigation targets.
- **Reward persistence and ledger writes — NOT in S1.** The 2026-06-13 amendment keeps XP/practice points, the 1.5x reflection bonus, quiz scores/personal bests, mastery counts, weekly deltas, and rhythm/momentum as private earned learning receipts. S1 consumes existing reward summaries/ledger moments where S0/S0-R expose them and renders compact receipts (T20); it does not remove `retention_cards.xpStatus`, `xp_ledger`, `services/xp.ts`, or any SRS writer. Coercive presentation dies here: no leaderboards, public comparison, guilt/loss streak pressure, random rewards, or rewards as the main feed object.
- **The mentor character (avatar / named persona) — S3 / a separate brand project (§2.1, owner: Zuzana).** S1's celebration is the *interim* carrier only — the conversation surface itself (T18). Do NOT build an avatar, idle animation, or named character; "real and feel alive" is S3's deliverable.
- **The conversational LLM path, safety tripwire, and metering — only the conversational fate of the bar (§2 P5) touches these, and S1 routes that fate to the existing `session/index.tsx` spine (which already owns tripwire + metering).** S1 builds the *local* intent-matcher (deterministic jump) and the button fallback; it does not re-implement tripwire/metering — those tax only the conversational path, inside the session screen S1 reuses.

---

## Verified audit amendments (2026-06-13)

These amendments are source-verified against the current branch and override stale task snippets below.

1. **V2 must suppress legacy chrome, not just legacy tabs.** `_layout.tsx` currently mounts `<ModeSwitcher />` outside the tab whitelist, and `ModeSwitcher` reads the V1 navigation contract. S1 must render `<ModeSwitcher />` only when `!FEATURE_FLAGS.MODE_NAV_V2_ENABLED` until S4 replaces it with `<ScopeChip />`. Add a V1+V2+family-capable regression asserting no `mode-switcher-container` and exactly Mentor/Subjects/Journal tabs.
2. **The V2 tab presentation type needs a real type plan.** `ShellHomeTabPresentation` currently allows legacy title keys only; the snippet using `titleKey: 'tabs.mentor' satisfies ShellHomeTabPresentation` will fail unless S1 either defines a local widened V2 presentation type in `use-navigation-contract.ts` or explicitly permits the minimal contract-type edit.
3. **Deep-link builders must target existing Expo Router routes.** Current route tree has `/(app)/session` and `/(app)/topic/[topicId]`; it does not have `/(app)/sessions/[sessionId]` or nested `shelf/[subjectId]/book/[bookId]/topic/[topicId]` leaves. `retention.review` and `challenge.start` lack enough params for the old proposed paths. S1 must map `session.resume` to `/(app)/session?sessionId=...`, `subject.topic` to `/(app)/topic/[topicId]`, validate every `deepLink.chain` key before indexing, and explicitly defer or add dedicated review/challenge leaves. Fix the empty-feed create-subject target to the actual route (`/create-subject` / current app-level path), not a nonexistent `/(app)/create-subject`.
4. **Signed-in defaults must land on Mentor under V2.** T22 must cover every current default/fallback entry, not only `auth-redirect.ts`: root `app/index.tsx`, `(auth)/_layout.tsx`, `(auth)/sign-in.tsx`, and `(app)/_layout.tsx`. Prefer one helper returning `/(app)/mentor` under V2 and `/(app)/home` otherwise.
5. **The `>2s` feed fallback must be executable.** Spec §14 requires cached feed fallback for `/now` errors or slow responses. Add a 2s timer path while the request is still in flight, and a fake-timer test for "loading >2s + cache exists".
6. **The bar matcher cannot jump to unsupported shell routes yet.** The landed S0 route enum has no `progress`, `subjects`, or `journal` shell keys. Either extend S0 with explicit shell route keys before S1 uses examples like "show my progress", or make `matchBarIntent(text, candidates/context)` only match route keys that are currently valid.
7. **Do not invent `NowCard.kind='quota_exhausted'`.** The S0 schema rejects it. Quota/upgrade rendering must use an existing typed error/session path or become an explicit S0 contract addition before S1 consumes it.
8. **Do not overload homework `source`.** Existing homework capture source is `camera | gallery`. Use a separate param such as `entrySource=mentor` or `returnTo=mentor`, and add a helper mapping `returnTo=mentor` back to `/(app)/mentor`.
9. **Local card dismissal resets on a new feed.** `dismissedKeys` must clear when `feed.generatedAt` or another stable feed identity changes. Add dismiss -> new feed -> same card reappears coverage.
10. **S2 handoff:** S2 Next-up reads `useLearningResumeTarget` / the resume-target source, not `useNowFeed`. S3 Journal may consume `useNowFeed` or its successor for ledger moments.

## Surface map (files × responsibility)

| File | Responsibility |
|---|---|
| `lib/feature-flags.ts` | `MODE_NAV_V2_ENABLED` flag read (`EXPO_PUBLIC_ENABLE_MODE_NAV_V2 === 'true'`) |
| `hooks/use-navigation-contract.ts` | V2 short-circuit branch → three-tab `visibleTabs` + V2 home presentation |
| `app/(app)/_layout.tsx` | Register `mentor`/`subjects`/`journal` `Tabs.Screen`; whitelist auto-hides legacy tabs |
| `app/(app)/mentor.tsx` | V2 Mentor tab page — feed + pinned bar layout (EU-5 floor), failure-mode orchestration |
| `app/(app)/subjects.tsx`, `journal.tsx` | S1 stub pages (real routes so the tab set works; content = S2/S3) |
| `hooks/use-now-feed.ts` | `useNowFeed()` + `useNowOverflow()` — typed Hono RPC, TanStack Query, cache hydration |
| `lib/now-feed-cache.ts` | `readCachedNowFeed()` / `writeCachedNowFeed()` — AsyncStorage last-good feed (profile-scoped) |
| `lib/now-deep-link.ts` | `pushNowDeepLink(router, deepLink)` — expand closed catalog key + chain into ordered `router.push` calls |
| `lib/bar-intent-match.ts` | `matchBarIntent(text)` — local-first intent → `{ kind: 'jump', deepLink } \| { kind: 'mentor' } \| { kind: 'uncertain' }` over the closed route catalog (§2 P5); zero LLM on a jump |
| `app/(app)/_lib/auth-redirect.ts` + post-gate callers | V2-on post-auth/consent/profile handoff sends the learner straight to the Mentor cold-start card; no welcome tour/setup wizard/subject picker first |
| `app/(app)/homework/camera.tsx` + `homework/_view-models/homework-session-params.ts` | Existing camera with V2 `entrySource=mentor` / `returnTo=mentor` params; OCR/retry internals stay owned by the existing homework flow |
| `app/(app)/session/_view-models/session-route-params.ts` + `session/index.tsx` | Conversation-thread receiver for homework images; renders image bubble, help/check buttons, and first-session wrap-up turn |
| `components/session/use-subject-classification.ts` (V2 branch) + `mentor.tsx` text-pass | V2 mentor-turn subject resolution: carry typed `rawInput`; no turn-1 grid gate; inline disambiguation on genuine ambiguity; silent-create on new subject; always-visible override (T25). V0/V1 picker untouched. |
| `lib/first-real-state.ts` | `hasFirstRealState(profile/feed)` — deterministic predicate keying cold-start self-destruction (§3.1) |
| `components/mentor/ColdStartCard.tsx` | Cold-start anchor: input bar + 3 fill-not-fire chips at equal weight; homework dual-path reply; placeholder rotation (§3.1) |
| `components/mentor/OnTrackBadge.tsx` | Calm "on track" / rhythm badge — replaces pressure-style streak display on the home (§2 P7 / §2.1); may reflect real due-work/rhythm state, never guilt/loss pressure. |
| `components/mentor/RewardReceiptCard.tsx` | Compact earned-reward receipt after a real event: reflection bonus, practice points/XP, quiz personal best, or mastery delta. Private, deterministic, never leaderboard/public. |
| `components/mentor/LightPracticeAffordance.tsx` | Low-pressure doorway to built lighter practice: Capitals, Guess Who, vocabulary, dictation where route/catalog support exists. |
| `components/mentor/MentorCelebration.tsx` | Interim micro-celebration: joyful bubble motion / warm burst around the mentor's words, at the completion moment (§2.1 ch.4) |
| `components/mentor/NowCardStack.tsx` | Render one anchor + ≤2 modules (≤3 highlight ceiling); "more / everything waiting" overflow entry; anchor visually unique (quota/402 never matches it); empty + error states |
| `components/mentor/NowCard.tsx` | One card: template copy + Continue (deep-link) + Decline (P1) |
| `components/mentor/LedgerMomentCard.tsx` | `kind='ledger_moment'` card, template-rendered, NO LLM |
| `components/mentor/MentorInputBar.tsx` | Pinned bar: text → session, camera button, Homework chip (EU-5) |
| `components/mentor/index.ts` | Barrel for the four mentor components |
| `i18n/locales/en.json` | `mentorHome.*`, `tabs.mentor/subjects/journal` copy |
| `eas.json` / `ci.yml` | V2 flag staging (dev + preview + OTA only) |

**`NowCard.kind` → render + deep-link mapping (the card-type table the components implement, all keys from the frozen S0 contract):**

| `kind` | Rendered by | `deepLink.route` (S0 catalog) | Decline (P1) semantics |
|---|---|---|---|
| `unfinished_session` | `NowCard` | `session.resume` | dismiss for session (re-surfaces if still active) |
| `retention_due` | `NowCard` | `retention.review` | snooze (re-surfaces next due tick) |
| `parked_item` | `NowCard` | `subject.topic` / `session.resume` | dismiss (backstop/overflow keeps it reachable) |
| `needs_deepening` | `NowCard` | `subject.topic` | dismiss |
| `challenge_ready` | `NowCard` | `challenge.start` | dismiss |
| `ledger_moment` | `LedgerMomentCard` | `subject.hub` / `subject.topic` | dismiss (informational; lowest urgency) |

> **S1 decline = client-local dismissal only.** In a learner (Me) scope every proposal is harmless to dismiss (spec §2 P1); S1 implements decline as *hide-this-card-locally-for-this-feed-render* (a local `dismissedKeys` set keyed on `kind`+`deepLink.params`), NOT a server write. The card re-appears on the next `/now` fetch if the underlying condition persists, which satisfies P1 "always declinable" without a backend mutation. (Supporter acknowledge/snooze with server persistence — EU-8 — is an S4/S5 concern; S1 is Me-scope only.)

---

## Tasks

- [ ] **T1: Add the `MODE_NAV_V2_ENABLED` feature flag (mobile read).**
  In `apps/mobile/src/lib/feature-flags.ts`, add one entry directly after the `MODE_NAV_V1_ENABLED` line (`:31`), mirroring the existing two plain reads:
  ```ts
  MODE_NAV_V2_ENABLED: process.env.EXPO_PUBLIC_ENABLE_MODE_NAV_V2 === 'true',
  ```
  Plain `=== 'true'` so it defaults OFF wherever the env var is unset (prod, local `.env.example`). The API-side name was already reserved in S0 (`config.ts`, S0 T9) — this is the consuming mobile flag.
  **done when:** `apps/mobile/src/lib/feature-flags.test.ts` (extend if present, else create — T1a) asserts `FEATURE_FLAGS.MODE_NAV_V2_ENABLED === false` when `EXPO_PUBLIC_ENABLE_MODE_NAV_V2` is unset, and that the key exists on the `FEATURE_FLAGS` object. `cd apps/mobile && pnpm exec tsc --noEmit` passes.

- [ ] **T2: Add the additive V2 three-tab branch in `useNavigationShellContract`.**
  In `apps/mobile/src/hooks/use-navigation-contract.ts`, add a NEW top-level short-circuit at the **start** of `useNavigationShellContract` (`:142`), before the V1 subscription/`resolveShellVisibleTabs` logic runs. When `FEATURE_FLAGS.MODE_NAV_V2_ENABLED`, return a V2 shell contract with `visibleTabs = V2_TABS` (a new `ReadonlySet<string>` of `['mentor','subjects','journal']`) and a fixed `homeTabPresentation` for the Mentor tab. Do **NOT** edit `resolveNavigationContract`, `resolveShellVisibleTabs`, or any file in `legacy-navigation-contract.ts` / `navigation-contract.ts`. The branch is purely additive — when V2 is off, the function behaves byte-identically to today.
  Define the V2 set and presentation as module-level consts in this hook file (not in the contract files):
  ```ts
  const V2_TABS: ReadonlySet<string> = new Set(['mentor', 'subjects', 'journal']);

  // V2 Mentor tab presentation. iconName reuses an existing TabIcon glyph
  // ('Home' is already mapped in _layout.tsx TabIcon). titleKey/labelKey are
  // new mentorHome-adjacent tabs.* keys added in T9.
  const V2_HOME_PRESENTATION = {
    titleKey: 'tabs.mentor',
    accessibilityLabelKey: 'tabs.mentorLabel',
    iconName: 'Home',
  } as const satisfies ShellHomeTabPresentation;
  ```
  Branch shape (add at the top of the hook body, before the existing `const subscription = ...` so the V1 subscription query never fires under V2):
  ```ts
  export function useNavigationShellContract(): NavigationShellContract {
    if (FEATURE_FLAGS.MODE_NAV_V2_ENABLED) {
      // V2 short-circuit — three-tab shell, no mode/proxy/tab-shape matrix.
      // Returns a minimal contract: tabs + home presentation. The scope chip,
      // supporter scopes, and contract gates are an S4 extension of this seam.
      // We still need a NavigationContract for `contract`/`proxy` consumers;
      // reuse the data-scope contract (no subscription dependency) so V2 does
      // not pull V1 family/proxy resolution.
      const { contract, proxy } = useNavigationHomeContract();
      return {
        contract,
        homeTabPresentation: V2_HOME_PRESENTATION,
        proxy,
        visibleTabs: V2_TABS,
      };
    }
    // …existing V0/V1 body unchanged below…
  }
  ```
  (Rationale for reusing `useNavigationHomeContract`: it already resolves a `contract` + `proxy` with `enabled: true` and no V1-gated subscription, so the V2 branch gets a valid `NavigationContract` for downstream `contract`/`proxy` consumers without re-deriving the tab-shape matrix. The hooks-order rule is satisfied because both branches call hooks unconditionally at their top — see T2 note below.)
  > **Hooks-order note:** React forbids conditional hook calls. To keep the call order stable, hoist the flag read to a `const v2 = FEATURE_FLAGS.MODE_NAV_V2_ENABLED;` and call **both** `useNavigationHomeContract()` and the existing V1 hooks unconditionally, then `return` the V2 object early when `v2`. Concretely: call `useNavigationHomeContract()` near the top (it is already called elsewhere in the tree, cheap), call the existing V1 chain, and select which result to return based on `v2`. The V1 subscription query stays `enabled: FEATURE_FLAGS.MODE_NAV_V1_ENABLED` (already false under V2-only staging where V1 may also be on — both can be on; V2 wins the return). Do not early-return before the existing hook calls.
  **done when:** `apps/mobile/src/hooks/use-navigation-contract.test.ts` (extend/create — T2a) renders the hook with `MODE_NAV_V2_ENABLED` mocked `true` (mock the `feature-flags` module value as an external-config boundary, NOT an internal service) and asserts `visibleTabs` deep-equals `new Set(['mentor','subjects','journal'])` and `homeTabPresentation.titleKey === 'tabs.mentor'`; and with the flag `false` asserts the result is **unchanged** from today (the legacy `visibleTabs` still resolves — a regression guard for §7). `cd apps/mobile && pnpm exec tsc --noEmit` passes.

- [ ] **T3: Register the three V2 tab screens in `(app)/_layout.tsx`.**
  Add three `Tabs.Screen` entries (`mentor`, `subjects`, `journal`) inside the existing `<Tabs>` block (alongside `home`/`library`/etc. at `:659-734`). The dynamic `screenOptions` whitelist (`:613-614`, `isVisible = visibleTabs.has(route.name)`) already hides every route not in `visibleTabs`, so when V2 is off these three carry `href:null` automatically and create no phantom tabs; when V2 is on, the legacy `home`/`library`/`recaps`/`progress`/`more`/`own-learning` tabs auto-hide because they are absent from `V2_TABS`. Each new entry mirrors the existing `home` entry's option shape (title via `t()`, `tabBarButtonTestID`, `tabBarAccessibilityLabel`, `tabBarIcon`). Use existing `TabIcon` glyphs: `mentor`→`Home`, `subjects`→`Book`, `journal`→`Recaps`.
  ```tsx
  <Tabs.Screen
    name="mentor"
    options={{
      title: t('tabs.mentor'),
      tabBarButtonTestID: 'tab-mentor',
      tabBarAccessibilityLabel: t('tabs.mentorLabel'),
      lazy: true,
      tabBarIcon: ({ focused }) => <TabIcon name="Home" focused={focused} />,
    }}
  />
  <Tabs.Screen
    name="subjects"
    options={{
      title: t('tabs.subjects'),
      tabBarButtonTestID: 'tab-subjects',
      tabBarAccessibilityLabel: t('tabs.subjectsLabel'),
      tabBarIcon: ({ focused }) => <TabIcon name="Book" focused={focused} />,
    }}
  />
  <Tabs.Screen
    name="journal"
    options={{
      title: t('tabs.journal'),
      tabBarButtonTestID: 'tab-journal',
      tabBarAccessibilityLabel: t('tabs.journalLabel'),
      tabBarIcon: ({ focused }) => <TabIcon name="Recaps" focused={focused} />,
    }}
  />
  ```
  Do NOT add `mentor`/`subjects`/`journal` to `FULL_SCREEN_ROUTES` (they keep the tab bar) or `HIDDEN_TAB_ROUTES` (they are whitelisted when visible). Suppress the `<ModeSwitcher />` mount under V2 (`_layout.tsx` currently mounts it outside the tab whitelist) by rendering it only when `!FEATURE_FLAGS.MODE_NAV_V2_ENABLED`; it is not enough to return a three-tab set because the switcher reads the V1 contract independently.
  **done when:** Visual check — with `EXPO_PUBLIC_ENABLE_MODE_NAV_V2=true` in the dev build, the tab bar shows exactly three tabs (Mentor / Subjects / Journal) and none of the six legacy tabs; with the flag off, the tab bar is byte-identical to today (manual side-by-side on a dev client, plus the T2a regression assertion). `cd apps/mobile && pnpm exec tsc --noEmit` passes.

- [ ] **T4: Implement the client-side feed cache (`now-feed-cache.ts`).**
  Create `apps/mobile/src/lib/now-feed-cache.ts` for the §14 "Feed unavailable → cached last feed" recovery. Persist the **last successful** `NowResponse` per profile in AsyncStorage (mirroring the profile-scoped persister convention in `query-persister.ts:36-47`, and the read/parse/validate posture of `summary-draft.ts:64-103`). Validate on read with `nowResponseSchema` from `@eduagent/schemas` so a corrupt/old blob can never crash the feed. Best-effort writes (swallow + Sentry, like `summary-draft.ts:26-41`).
  ```ts
  import AsyncStorage from '@react-native-async-storage/async-storage';
  import { nowResponseSchema, type NowResponse } from '@eduagent/schemas';
  import { Sentry } from './sentry';

  const KEY_PREFIX = 'now-feed-cache';
  // A cached feed older than this is too stale to show as "your last feed".
  export const NOW_FEED_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

  function cacheKey(profileId: string): string {
    return `${KEY_PREFIX}::${profileId}`;
  }

  export async function writeCachedNowFeed(
    profileId: string,
    feed: NowResponse,
  ): Promise<void> {
    try {
      await AsyncStorage.setItem(cacheKey(profileId), JSON.stringify(feed));
    } catch (err) {
      Sentry.captureException(err, { tags: { feature: 'now_feed_cache', op: 'write' } });
    }
  }

  export async function readCachedNowFeed(
    profileId: string,
    now = Date.now(),
  ): Promise<NowResponse | null> {
    let raw: string | null = null;
    try {
      raw = await AsyncStorage.getItem(cacheKey(profileId));
    } catch (err) {
      Sentry.captureException(err, { tags: { feature: 'now_feed_cache', op: 'read' } });
      return null;
    }
    if (!raw) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    const result = nowResponseSchema.safeParse(parsed);
    if (!result.success) return null;
    const generated = new Date(result.data.generatedAt).getTime();
    if (!Number.isFinite(generated) || now - generated > NOW_FEED_CACHE_TTL_MS) {
      return null;
    }
    return result.data;
  }
  ```
  **done when:** `apps/mobile/src/lib/now-feed-cache.test.ts` (T4a) asserts: a written feed round-trips through read; a feed older than `NOW_FEED_CACHE_TTL_MS` returns `null`; a corrupt JSON blob returns `null` (no throw); a blob failing `nowResponseSchema` returns `null`. AsyncStorage is mocked via the existing jest AsyncStorage mock (external-boundary, allowed); `nowResponseSchema` is the **real** schema (no internal mock). `cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/now-feed-cache.ts --no-coverage` passes.

- [ ] **T5: Implement the typed `/now` fetch hooks (`use-now-feed.ts`).**
  Create `apps/mobile/src/hooks/use-now-feed.ts` with `useNowFeed()` and `useNowOverflow()`, both typed off the Hono RPC client (`useApiClient`, `api-client.ts:173`) — `AppType` makes `client.now.$get` typed automatically once S0's route lands. Follow the `use-dashboard.ts:78-121` pattern: `combinedSignal` timeout, `assertOk`, profile-scoped `queryKey`. On every successful fetch, mirror into the cache (T4). On error, surface `previousData` (TanStack `placeholderData`) so the screen can fall back; the screen reads the cache for a cold-start miss. Keep `staleTime` short (feed is "now") but cache via `gcTime` + the AsyncStorage mirror.
  ```ts
  import { useQuery, type UseQueryResult } from '@tanstack/react-query';
  import { nowResponseSchema, nowOverflowResponseSchema,
    type NowResponse, type NowOverflowResponse } from '@eduagent/schemas';
  import { useApiClient } from '../lib/api-client';
  import { useProfile } from '../lib/profile';
  import { combinedSignal } from '../lib/query-timeout';
  import { assertOk } from '../lib/assert-ok';
  import { writeCachedNowFeed } from '../lib/now-feed-cache';

  export function useNowFeed(): UseQueryResult<NowResponse> {
    const client = useApiClient();
    const { activeProfile } = useProfile();
    const profileId = activeProfile?.id;
    return useQuery({
      queryKey: ['now-feed', profileId],
      queryFn: async ({ signal: qs }): Promise<NowResponse> => {
        const { signal, cleanup } = combinedSignal(qs);
        try {
          // S0 serves only scope=self; client never sends another value.
          const res = await client.now.$get({ query: { scope: 'self' } }, { init: { signal } });
          await assertOk(res);
          const data = nowResponseSchema.parse(await res.json());
          if (profileId) void writeCachedNowFeed(profileId, data);
          return data;
        } finally {
          cleanup();
        }
      },
      enabled: !!profileId,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    });
  }

  export function useNowOverflow(enabled: boolean): UseQueryResult<NowOverflowResponse> {
    const client = useApiClient();
    const { activeProfile } = useProfile();
    const profileId = activeProfile?.id;
    return useQuery({
      queryKey: ['now-overflow', profileId],
      queryFn: async ({ signal: qs }): Promise<NowOverflowResponse> => {
        const { signal, cleanup } = combinedSignal(qs);
        try {
          const res = await client.now.overflow.$get({ query: { scope: 'self' } }, { init: { signal } });
          await assertOk(res);
          return nowOverflowResponseSchema.parse(await res.json());
        } finally {
          cleanup();
        }
      },
      enabled: enabled && !!profileId,
    });
  }
  ```
  (If S0's Hono route path segment for `GET /now/overflow` types as `client.now.overflow.$get`, use that; if S0 registered it as a flat `/now/overflow` string path the RPC client exposes it as shown. Confirm against the generated `AppType` when S0 lands — the route *key* is fixed by S0, this hook only consumes it.)
  **done when:** `apps/mobile/src/hooks/use-now-feed.test.tsx` (T5a) mounts `useNowFeed` with a stubbed `useApiClient` returning a fixed `NowResponse` JSON (the API client is the external HTTP boundary — stub its fetch, not an internal module) and asserts: the hook returns the parsed feed; `writeCachedNowFeed` is invoked with the profileId + feed on success; a rejected fetch leaves `isError` true and does not throw. `nowResponseSchema` is the real schema. `cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-now-feed.ts --no-coverage` passes.

- [ ] **T6: Implement the client-side deep-link expander (`now-deep-link.ts`).**
  Create `apps/mobile/src/lib/now-deep-link.ts` exporting `pushNowDeepLink(router, deepLink)`. The S0 `NowDeepLink` carries `{ route, params, chain }` where `chain` is the ordered ancestor **route-catalog keys** that must be pushed before the leaf (the cross-stack-push rule — a bare leaf push from another tab synthesizes a 1-deep stack and `router.back()` falls through to Home; see CLAUDE.md "cross-tab `router.push`" rule and `01-codebase-anchors.md` §5). Map each catalog key to its concrete Expo Router path, build each ancestor's path from `params`, push the chain, then push the leaf. This is the single place catalog keys become real paths on the client.
  ```ts
  import type { Router } from 'expo-router';
  import type { NowDeepLink, NowDeepLinkRoute } from '@eduagent/schemas';

  // Catalog key → concrete Expo Router path builder. Mirrors the S0
  // ROUTE_CATALOG keys EXACTLY (server emits only these keys).
  const PATH_BUILDERS: Record<NowDeepLinkRoute, (p: Record<string, string>) => string> = {
    'session.resume':   (p) => `/(app)/session?sessionId=${p.sessionId}`,
    'subject.hub':      (p) => `/(app)/subject-hub/${p.subjectId}`,
    'subject.topic':    (p) => `/(app)/topic/${p.topicId}`,
    'retention.review': (p) => `/(app)/topic/${p.topicId}`,
    'challenge.start':  (p) => `/(app)/topic/${p.topicId}`,
  };

  export function pushNowDeepLink(
    router: Pick<Router, 'push'>,
    deepLink: NowDeepLink,
  ): void {
    // Push every ancestor in chain order first, then the leaf, so router.back()
    // walks subject.hub → tab root instead of falling through to Home.
    for (const ancestorKey of deepLink.chain) {
      router.push(PATH_BUILDERS[ancestorKey](deepLink.params) as never);
    }
    router.push(PATH_BUILDERS[deepLink.route](deepLink.params) as never);
  }
  ```
  > **Path verification at build time:** confirm each concrete path resolves against the real Expo Router tree. Current routes include `session/index.tsx` and `topic/[topicId].tsx`; they do not include `sessions/[sessionId]` or nested `shelf/[subjectId]/book/[bookId]/topic/[topicId]` leaves. `subject.hub` points to the S2 `subject-hub/[subjectId]` route once S2 lands; if S1 ships before S2, gate subject-hub cards or temporarily map to the existing shelf route with a failing TODO test that forces the S2 repoint. `retention.review`/`challenge.start` do not have dedicated leaves yet, so route them to `subject.topic` until those leaves are explicitly added.
  **done when:** `apps/mobile/src/lib/now-deep-link.test.ts` (T6a) asserts: `pushNowDeepLink(mockRouter, { route: 'subject.topic', params: { subjectId, topicId }, chain: ['subject.hub'] })` calls `router.push` **twice** — first the S2 `subject-hub/<subjectId>` ancestor, then the existing `topic/<topicId>` leaf, in that order (cross-stack-chain guarantee); a `session.resume` link with empty `chain` calls `push` once; unknown/missing chain keys throw or return a typed failure before indexing `PATH_BUILDERS`. `mockRouter` is a plain `{ push: jest.fn() }` (no internal mock). `cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/now-deep-link.ts --no-coverage` passes.

- [ ] **T7: Build `NowCard` — the single declinable card renderer.**
  Create `apps/mobile/src/components/mentor/NowCard.tsx`. Heir of `CoachBand.tsx` (reuse its layout language: rounded card, eyebrow, headline, primary "Continue" + dismiss "×"), but driven by a `NowCard` (from `@eduagent/schemas`) instead of a raw headline. Props: `{ card: NowCard; variant?: 'anchor' | 'module'; onContinue: (card) => void; onDecline: (card) => void }` — `variant` (default `'module'`) controls anchor-vs-module styling per the P6 budget (T9: only the anchor slot gets `'anchor'`; quota/upgrade cards are always `'module'`). The completion-moment arc props (`arcState`, `onCompleted`) are **added in T19** — keep this prop name stable. Copy is resolved from `card.templateKey` + `card.params` via `t()` — the server sends `templateKey` (e.g. `now.unfinished_session.default`) and `params`; the client maps it to an i18n key under `mentorHome.cards.*` and interpolates. NO hardcoded copy, NO hex (semantic tokens / `useThemeColors` only), persona-unaware. "Continue" calls `onContinue(card)` (the screen runs `pushNowDeepLink`); "×" calls `onDecline(card)` (local dismiss, P1).
  Template→key resolution (deterministic map, the *only* place a server `templateKey` becomes UI copy):
  ```ts
  // mentorHome.cards.<kind>.{title,cta} — every templateKey maps to a title key.
  // Unknown templateKey falls back to mentorHome.cards.generic.title (never blank).
  function cardCopyKey(card: NowCard): { title: TranslateKey; cta: TranslateKey } { … }
  ```
  Render the title via `t(titleKey, card.params)` and the CTA via `t(ctaKey)`. Give the card `testID={`now-card-${card.kind}`}`, Continue `testID="now-card-continue"`, dismiss `testID="now-card-dismiss"`.
  **done when:** `apps/mobile/src/components/mentor/NowCard.test.tsx` (T7a) renders an `unfinished_session` card and asserts the title text renders (matches the `en.json` template), that pressing `now-card-continue` calls `onContinue` with the card, and pressing `now-card-dismiss` calls `onDecline` with the card; renders a card with an unknown `templateKey` and asserts it falls back to the generic title (no blank, no crash). Real `i18n` (no mock). `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/mentor/NowCard.tsx --no-coverage` passes; `persona-fossil-guard.test.ts` stays green.

- [ ] **T8: Build `LedgerMomentCard` — template-rendered moment, no LLM.**
  Create `apps/mobile/src/components/mentor/LedgerMomentCard.tsx` for `kind === 'ledger_moment'` cards (spec §2 P4 / §8.2 — rows render from `templateKey` + `params` with **no LLM call**). Same visual language as `NowCard` but informational-styled (lower-emphasis surface token, no urgent primary) — `ledger_moment` is the lowest-urgency kind, so it is **always a module, never the anchor** (it is never `feed.cards[0]`), consistent with the P6 anchor-uniqueness rule (T9). Like `NowCard` it is still an *action* (P6 action-not-announcement): tapping it runs the card's `deepLink` (via the screen's `pushNowDeepLink`); declining dismisses locally. Copy from `card.templateKey` (`now.ledger_moment.<kind>` per S0) mapped to `mentorHome.ledger.*` keys + `card.params`. **No network call, no streaming, no LLM** — this is a pure presentational render of server-supplied template + params. testID `now-ledger-moment`.
  **done when:** `apps/mobile/src/components/mentor/LedgerMomentCard.test.tsx` (T8a) renders a `ledger_moment` card with `templateKey: 'now.ledger_moment.session_filed'` and asserts the template copy renders from `en.json` + params (e.g. the filed topic title), that tapping calls `onContinue`, and — the P4 guard — that the component imports **no** session/LLM/streaming hook (assert by construction: the test renders the component standalone with no API provider and it still renders text, proving zero data-fetch dependency). Real i18n. `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/mentor/LedgerMomentCard.tsx --no-coverage` passes.

- [ ] **T9: Build `NowCardStack` — one anchor + ≤2 modules + overflow affordance + states (P6 budget).**
  Create `apps/mobile/src/components/mentor/NowCardStack.tsx`. Renders the feed as **one anchor + ≤2 modules** (spec §2 P6 module-discipline budget = the §8.1 ≤3 highlight ceiling, EU-3): the first card (`feed.cards[0]`) is the **anchor**, rendered with a visually-distinct anchor treatment (its own emphasis surface token, larger focal position); the remaining ≤2 are modules. Map `feed.cards` to `NowCard`/`LedgerMomentCard` by `kind`; below the stack render the **overflow affordance** when `feed.overflowCount > 0` — a "more / everything waiting" row (`testID="now-overflow-entry"`, copy `mentorHome.overflow.more` with `{ count: feed.overflowCount }`) that expands the `useNowOverflow` list inline (or pushes a lightweight overflow view — inline expand is simpler and avoids a new route).
  **P6 anchor-uniqueness (compliance posture, not taste — §2 P6, vulnerable-consumer / DSA Art 25/28 / AADC):** no module card — *especially* a quota / 402 / upgrade module synthesized from the typed error/session path — ever shares the anchor's color, size, or focal position. Pass an explicit `variant: 'anchor' | 'module'` to `NowCard`/`LedgerMomentCard` so a module can never be rendered with anchor styling. Do not invent a `NowCard.kind='quota_exhausted'`; S0 rejects that kind unless a schema change lands first. The anchor is whichever `/now` card S0 ranked first; S1 never promotes an upgrade/payment affordance into the anchor slot.
  **P6 action-not-announcement (§2 P6):** every card S1 renders must read as a tappable next step — there is no announcement-only render path. `NowCard`/`LedgerMomentCard` always carry a primary action (Continue / tap-through `deepLink`); a card with no actionable `deepLink` is a malformed feed row and is dropped (not rendered as inert narration — non-actionable narration belongs in the Journal ledger, never the feed).
  Handle the three S1 feed states the screen passes down:
  - **Empty feed** (`cards.length === 0` && `overflowCount === 0`): render the onboarding proposal card (§14 "Empty feed") — a `NowCard`-styled prompt `mentorHome.empty.title` / CTA `mentorHome.empty.cta` that deep-links into subject creation (`/(app)/create-subject` — the existing `CREATE_SUBJECT_FROM_HOME_HREF` from `LearnerScreen.tsx:55`).
  - **Cards present:** render them + overflow.
  - **Error/cached:** the screen (T11) handles error → cached-feed substitution before this component renders; `NowCardStack` itself is pure (props in, cards out) so it is trivially testable.
  Props: `{ feed: NowResponse; overflow: NowOverflowResponse | undefined; dismissedKeys: Set<string>; onContinue; onDecline; onShowOverflow }`. Filter out `dismissedKeys` (the local P1 dismiss set) before slicing.
  **done when:** `apps/mobile/src/components/mentor/NowCardStack.test.tsx` (T9a) asserts: a 3-card feed renders 1 anchor + ≤2 modules and **no** overflow entry when `overflowCount === 0`; a feed with `overflowCount: 5` renders the overflow entry showing "5"; an empty feed renders the onboarding card (`mentorHome.empty.title`); a card whose key is in `dismissedKeys` is not rendered (P1 local-dismiss); the anchor card (`feed.cards[0]`) renders with `variant='anchor'` and every other card with `variant='module'` (P6 budget); a synthetic 402/quota affordance rendered from the typed error/session path is always a `module` and never receives the anchor `variant`/emphasis token, asserting the **anchor-uniqueness compliance check** (no module shares the anchor's color/size/focal position); a card with no `deepLink` is **not** rendered (P6 action-not-announcement — feed never shows inert narration). Real i18n. `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/mentor/NowCardStack.tsx --no-coverage` passes.

- [ ] **T10: Build `MentorInputBar` — pinned bar + camera + Homework chip + voice mic (EU-5, §16).**
  Create `apps/mobile/src/components/mentor/MentorInputBar.tsx` — the ever-present bar (spec §3 "two entry channels"; §3 EU-5 layout floor). Heir of the `HOME_INTENT_ACTIONS` homework + ask-anything intents (`LearnerScreen.tsx:70-100`). Four affordances, all reachable without scrolling (pinned at the bottom of `mentor.tsx`):
  1. **Text entry** — the bar IS the mentor field (§2 P5 "one input, two fates"). On submit, the screen runs the **local intent-matcher** (T16, `matchBarIntent`): a confident closed-route-catalog match → a deterministic `pushNowDeepLink` jump with **no LLM call**; a miss → open the session screen (`router.push('/(app)/session')`, the existing conversation spine — S1 does not build inline chat); uncertain → fall back to the **buttons** (the cold-start chips / quick-chips, T17). The bar never sits an LLM between the user and a deterministic jump. testID `mentor-bar-input`.
  2. **Camera button** → `router.push('/(app)/homework/camera')` (the existing first-class homework entry, `homework/camera.tsx`). testID `mentor-bar-camera`.
  3. **Homework quick-chip** → same `/(app)/homework/camera` target, labelled `mentorHome.bar.homeworkChip` — the permanent one-tap homework affordance (§3, §15.4). testID `mentor-bar-homework-chip`.
  4. **Voice mic (§16 "voice input everywhere")** → a mic affordance on the input that captures speech and **transcribes it into the same text field** (then runs the same two-fates path on submit). **Compliance invariant: transcription-only — never tone/emotion analysis (AI Act Art 5(1)(f) posture).** The mic produces a string and nothing else; no affect/tone signal is derived, emitted, or stored. testID `mentor-bar-mic`.
  Props: `{ onSubmitText; onOpenCamera; onOpenHomework; onTranscript }` (the screen wires `onSubmitText`/`onTranscript` to the intent-matcher and `onOpenCamera`/`onOpenHomework` to `router.push` so the bar stays presentational/testable). LLM-down handling: an `unavailable?: boolean` prop — when true, the text entry shows the honest-unavailable message (`mentorHome.bar.unavailable`) for the *conversational* fate, but **deterministic bar jumps still work** (they cost no LLM call) and camera + chip + mic stay live (§14 "LLM down" — feed/tabs/homework still work). Semantic tokens only; persona-unaware; all copy via `t()`.
  **done when:** `apps/mobile/src/components/mentor/MentorInputBar.test.tsx` (T10a) asserts: tapping `mentor-bar-camera` calls `onOpenCamera`; tapping `mentor-bar-homework-chip` calls `onOpenHomework`; submitting text calls `onSubmitText` with the text; the mic affordance (`mentor-bar-mic`) is present and, on a stubbed transcript, calls `onTranscript` with the **string only** (assert the transcript payload is a plain string — no tone/emotion field — the §16 transcription-only invariant); with `unavailable` true the input renders the unavailable copy for the conversational fate yet a deterministic-jump submit still fires (no LLM dependency) and the camera + chip + mic handlers still fire (LLM-down resilience). Real i18n. `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/mentor/MentorInputBar.tsx --no-coverage` passes.

- [ ] **T11: Build the `mentor.tsx` page — feed + pinned bar layout + failure-mode orchestration.**
  Create `apps/mobile/src/app/(app)/mentor.tsx` (default export — it is an Expo Router page). This is the V2 Mentor tab. Layout honoring the **EU-5 floor**: a scrollable feed region (`NowCardStack`) and a **pinned** `MentorInputBar` anchored to the bottom (absolute/flex-end so camera + Homework chip are reachable without scrolling past the feed). On a **school-day / weekday-evening heuristic**, surface the Homework chip *above* the card stack as a highlighted prompt (§3): compute the heuristic with the existing `getTimeOfDay` + `now.getDay()` helpers (`lib/greeting.ts:42,52` — Monday–Friday + afternoon/evening = school-day-evening), and when true render a one-line "Homework?" highlight above `NowCardStack` (still also pinned in the bar). Orchestrate state:
  - `const { data: feed, isLoading, isError } = useNowFeed();` + `useNowOverflow(showOverflow)`.
  - `isLoading` (cold, no cache) → `TimeoutLoader` (`primaryAction = refetch`, `secondaryAction = go to Subjects`).
  - `isError` (or `>2s` per §14) → read `readCachedNowFeed(profileId)`; if a cached feed exists, render it **plus** a deterministic local "continue where you left off" card (synthesized client-side from the cached `unfinished_session` card if present, else a `mentorHome.fallback.continue` card that deep-links to the last session); if no cache, render `ErrorFallback` (variant `card`, primary `retry`→`refetch`, secondary `go to Subjects`) — built via `recoveryActions` from `format-api-error.ts:299`. Tabs stay functional throughout (§14).
  - LLM-down is not distinguishable at the feed layer (feed is deterministic, no LLM) — the bar's `unavailable` is driven by a session-availability probe if one exists, else defaults false; the feed itself never degrades on LLM outage (§14 "LLM down": feed/hubs/Journal all still work).
  - **Cold-start anchor (§3.1, T17):** when `!hasFirstRealState(feed/profile)` (`first-real-state.ts`, T17), render `ColdStartCard` **in the anchor slot** instead of the `/now` anchor card — the anchor slot is never empty and never shows a fake proposal. Once first real state exists the cold-start card dies forever and `/now` proposals own the slot. (The empty-feed onboarding card in `NowCardStack`, T9, applies only *after* cold-start has died — an established learner who archived everything is not re-greeted as a newbie.)
  - **"On track" rhythm badge (§2 P7 / §2.1, T15):** render `OnTrackBadge` in the header region where a pressure-style streak chip would otherwise sit. It may reflect real due-work/rhythm state, but never guilt/loss pressure, leaderboard rank, or public comparison.
  - **Earned reward receipt (§2.1, T20):** when the current feed/session event includes an earned receipt (practice points/XP, reflection bonus, quiz personal best, mastery delta), render `RewardReceiptCard` as a subordinate moment under the anchor or inside `LedgerMomentCard`. It is never the anchor and never a reason to push a paid/quota action.
  - **Light practice doorway (§2.2, T21):** render `LightPracticeAffordance` as a low-pressure "something lighter?" entry when the feed is thin, after a declined heavy card, or when fatigue/fallback state is inferred. It links to built game/practice routes (Capitals, Guess Who, vocabulary, dictation where available) without cluttering the main card budget.
  - **Bar two-fates wiring (§2 P5, T16):** wire `onSubmitText(text)` / `onTranscript(text)` → `matchBarIntent(text)` (T16): `jump` → `pushNowDeepLink(router, result.deepLink)` (deterministic, **no LLM call**); `mentor` → `router.push('/(app)/session')` (the conversational fate, which alone pays tripwire/metering inside `session/index.tsx`); `uncertain` → surface the BUTTONS (the cold-start chips / quick-chips) rather than guessing.
  - **Completion-moment arc + celebration (§2.1, T18/T19):** on a card-completion callback, advance the anchor `NowCard`'s arc (T19) and fire `MentorCelebration` (T18) in the same beat.
  - Wire `onContinue(card)` → `pushNowDeepLink(router, card.deepLink)`; `onDecline(card)` → add `cardKey(card)` to a local `dismissedKeys` state set; `onOpenCamera/Homework` → `router.push` the respective routes; `onShowOverflow` → `setShowOverflow(true)`.
  Use `useNavigationContract()` only if a gate is needed; S1 Me-scope needs none (no owner gating on the feed itself). Classify any caught error with `classifyApiError` (the RAW error, never the formatted string — CLAUDE.md "Classify errors before formatting").
  **done when:** `apps/mobile/src/app/(app)/mentor.test.tsx` (T11a) asserts, with `useNowFeed` driven via a stubbed API client (external boundary): (a) a happy feed (with first real state) renders `NowCardStack` with cards + the pinned `MentorInputBar` (`mentor-bar-camera`, `mentor-bar-homework-chip`, and `mentor-bar-mic` present in the tree, i.e. reachable — EU-5/§16) + the `OnTrackBadge` (T15); (b) a profile with **no first real state** renders `ColdStartCard` in the anchor slot (§3.1, T17) and **not** the `/now` anchor card; (c) a bar route-phrase submit (e.g. "show my progress") triggers a deterministic `pushNowDeepLink` and makes **no LLM/network call** (T16 — assert via a spied router + no api-client call); (d) an error with a populated cache renders the cached cards + a "continue where you left off" fallback card and does NOT show a dead-end; (e) an error with empty cache renders `ErrorFallback` with a working retry; (f) tapping a card's Continue triggers `pushNowDeepLink`; (g) an earned reward event renders a subordinate `RewardReceiptCard` and never promotes it to the anchor; (h) a fatigue/thin-feed state renders the `LightPracticeAffordance` with Capitals and Guess Who reachable. Real i18n, real `ErrorFallback`/`NowCardStack`/`MentorInputBar`/`ColdStartCard`/`OnTrackBadge`/`RewardReceiptCard`/`LightPracticeAffordance` (no internal mocks). `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/(app)/mentor.tsx --no-coverage` passes; `persona-fossil-guard.test.ts` green.

- [ ] **T12: Ship the `subjects.tsx` + `journal.tsx` S1 stub pages.**
  Create `apps/mobile/src/app/(app)/subjects.tsx` and `apps/mobile/src/app/(app)/journal.tsx` as default-export Expo Router pages so the three-tab V2 set has three real routes (a missing route file would make the tab dead). Each renders an honest placeholder: a centered heading + body via `t('mentorHome.subjectsStub.title')` / `t('mentorHome.journalStub.title')` ("Subjects hub arrives next" / "Your Journal arrives soon") and a single CTA back to the Mentor tab. NO real content — content is S2 (`subjects`) and S3 (`journal`). Semantic tokens, `t()` copy, persona-unaware. These stubs are themselves S2/S3 strangle targets.
  **done when:** `apps/mobile/src/app/(app)/subjects.test.tsx` + `journal.test.tsx` (T12a) each render the page and assert the stub heading renders (from `en.json`) and that the page has a default export (Expo Router page contract). Real i18n. `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/(app)/subjects.tsx src/app/(app)/journal.tsx --no-coverage` passes.

- [ ] **T13: Add all S1 i18n keys to `en.json` (same PR — JSX-literal ratchet).**
  Add to `apps/mobile/src/i18n/locales/en.json` every key the S1 surfaces use, so no hardcoded JSX literal ships (the `check-i18n-jsx-literals.ts` ratchet fails new literals, and `check-i18n-orphan-keys.ts` fails a `t()` whose key is missing). Required keys (group under a new `mentorHome` namespace + `tabs.*` additions):
  - `tabs.mentor`, `tabs.mentorLabel`, `tabs.subjects`, `tabs.subjectsLabel`, `tabs.journal`, `tabs.journalLabel`
  - `mentorHome.cards.unfinished_session.title` (`{{topicTitle}}`-interpolated) + `.cta`; same for `retention_due`, `parked_item`, `needs_deepening`, `challenge_ready`; `mentorHome.cards.generic.title` + `.cta` (the unknown-templateKey fallback, T7)
  - `mentorHome.ledger.session_filed.title`, `.topic_mastered.title`, `.recap_ready.title`, `.snapshot_ready.title`, `.needs_deepening_added.title` (template-rendered, T8; mirror the S0 `LedgerKind` set)
  - `mentorHome.overflow.more` (`{{count}}`), `mentorHome.empty.title`, `mentorHome.empty.cta`, `mentorHome.fallback.continue` (the feed-unavailable "continue where you left off" card)
  - `mentorHome.bar.placeholder` (input hint), `mentorHome.bar.homeworkChip`, `mentorHome.bar.unavailable` (conversational-fate LLM-down), `mentorHome.bar.cameraLabel`, `mentorHome.bar.micLabel` (voice mic, T10/§16)
  - `mentorHome.homeworkPrompt` (the school-day-evening above-feed highlight, T11)
  - `mentorHome.subjectsStub.title`, `mentorHome.journalStub.title`, `mentorHome.backToMentor` (stub CTAs, T12)
  - `mentorHome.onTrack.label`, `.dueCleared`, `.reviewsDue` (the calm rhythm badge — replaces pressure-style streak display, T15 / §2 P7)
  - `mentorHome.rewards.heading`, `.practicePoints`, `.reflectionBonus`, `.quizPersonalBest`, `.masteryDelta`, `.privateLabel` (compact earned reward receipts, T20 / §2.1; include no-variable companions for optional topic/score fields)
  - `mentorHome.lightPractice.prompt`, `.capitals`, `.guessWho`, `.vocabulary`, `.dictation`, `.fatigueReason` (lighter practice doorway, T21 / §2.2)
  - `mentorHome.coldStart.caption`, `.orJustType`, `.chipHomework`, `.chipLearn`, `.chipAsk`, `.homeworkReply` (instant dual-path camera+keep-chatting), `.firstSessionTeach` (once-only end-of-first-session line), and `.placeholderRotation.*` (rotating examples incl. navigational, e.g. "Try: show my progress") — the cold-start card (T17 / §3.1)
  - `mentorHome.homework.imageAlt`, `.helpMeSolve`, `.checkMyAnswer`, `.sameThreadReturn` (V2 homework round-trip, T23)
  - `mentorHome.wrapUp.recap`, `.ownChoiceCredit`, `.yourWordsPrompt`, `.yourWordsSubmit`, `.reflectionSaved`, `.reflectionBonusReceipt`, `.laterSessionCta` (first-session wrap-up, T24 / §2.2)
  - `mentorHome.cards.<kind>.arcDue`, `.arcAdvancing`, `.arcMastered` (the completion-moment journey-arc labels, T19 / §2.1)
  - `mentorHome.celebration.title`, `.ownChoice` (own-choice attribution, never obedience) — the interim micro-celebration (T18 / §2.1)
  Provide a no-variable companion where a `{{var}}` is optional, per CLAUDE.md "Variable-interpolation fallbacks" (e.g. `mentorHome.cards.unfinished_session.titleNoTopic` when `topicTitle` is absent). **Proposal/CTA copy uses the calm default tone pending OD-1 (the §13.7 assertiveness dial); S1 ships one copy set only — see the OPEN DECISION block.** Do NOT run `pnpm translate` in this plan (locale fan-out is a follow-up); English keys are the gate.
  **done when:** `cd apps/mobile && pnpm exec tsx ../../scripts/check-i18n-orphan-keys.ts` reports zero forward orphans for the new `mentorHome.*`/`tabs.*` keys (every `t()` in T7–T12 resolves), and `pnpm exec tsx ../../scripts/check-i18n-jsx-literals.ts` reports no NEW baseline violations from the S1 components. (Run from repo root per the script's CWD expectations; the exact invocation matches the `ci.yml` "i18n hardcoded-JSX-literal check" step.)

- [ ] **T14: Stage the V2 flag in `eas.json` + `ci.yml` (dev/preview/OTA only).**
  - In `apps/mobile/eas.json`, add `"EXPO_PUBLIC_ENABLE_MODE_NAV_V2": "true"` to `build.development.env` (`:21-26`) and `build.preview.env` (`:37-42`) ONLY. Leave `build.production.env` (`:11-15`) untouched — V2 stays off in prod (prod remains V0-on / V1-off / V2-off).
  - In `.github/workflows/ci.yml`, add `EXPO_PUBLIC_ENABLE_MODE_NAV_V2: 'true'` to the preview-channel OTA env block (currently around `:397-398`, alongside the existing `EXPO_PUBLIC_ENABLE_MODE_NAV(_V1)` lines), because `eas update` does not read build-profile env — this makes V2 visible on the preview-channel OTA (the S1+S2 evidence-gate validation surface).
  This mirrors exactly how V1 is staged. No flag combination removes or alters the V0/V1 code paths.
  **done when:** `eas.json` `production.env` is unchanged (diff shows only `development.env` + `preview.env` gained the V2 line); `ci.yml` OTA env block gained exactly one V2 line next to the V0/V1 lines. `git diff --stat` shows only `eas.json` + `ci.yml` touched for this task. (Config-only; verified by reading the diff, no runtime test.)

- [ ] **T15: Replace pressure-style streak display with the calm "on track" rhythm badge on the home (§2 P7 / §2.1).**
  Create `apps/mobile/src/components/mentor/OnTrackBadge.tsx` — a calm, glanceable rhythm badge that replaces the old pressure-style streak display on the V2 home. The badge reflects a true state derived **deterministically** from the already-fetched `/now` feed (e.g. no overdue `retention_due` anchor, or a small real due-review count). It may show a compact real number such as "3 reviews due" when that number directly explains the current state; it must never show a streak run, XP total, leaderboard, loss warning, public rank, or "break your streak" pressure. Copy `mentorHome.onTrack.*`; semantic tokens; persona-unaware; `t()` only. Render it in the `mentor.tsx` header region (T11) where a pressure-style streak chip would otherwise sit. This is a **display-only** change: S1 removes no reward persistence or backend column.
  **done when:** `apps/mobile/src/components/mentor/OnTrackBadge.test.tsx` (T15a) asserts: the badge renders the `mentorHome.onTrack.label` copy from deterministic input; a due-review input may render the due count; the component renders no streak run, XP total, leaderboard/rank, loss-warning, or public-comparison copy/testID; and the component imports no streak source. Real i18n. `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/mentor/OnTrackBadge.tsx --no-coverage` passes; `persona-fossil-guard.test.ts` green.

- [ ] **T16: Build the local-first bar intent-matcher (`bar-intent-match.ts`) — §2 P5 "one input, two fates".**
  Create `apps/mobile/src/lib/bar-intent-match.ts` exporting `matchBarIntent(text): BarIntentResult`, the **local-first** classifier that sits in front of the bar so the LLM never stands between the user and their data or a feature (spec §2 P5). It resolves a confident match through the **closed S0 route catalog** (the same frozen keys `session.resume` / `subject.hub` / `subject.topic` / `retention.review` / `challenge.start` as `now-deep-link.ts`, T6) into a `NowDeepLink`, with no network and no LLM call:
  ```ts
  import type { NowDeepLink } from '@eduagent/schemas';

  export type BarIntentResult =
    | { kind: 'jump'; deepLink: NowDeepLink }   // confident match → deterministic jump, zero LLM
    | { kind: 'mentor'; text: string }          // miss → a mentor turn (the conversational fate)
    | { kind: 'uncertain'; text: string };      // low confidence → fall back to BUTTONS (chips/quick-chips)

  export function matchBarIntent(text: string): BarIntentResult { … }
  ```
  Match is **local and deterministic** (keyword/route-phrase table over the closed catalog — e.g. "show my progress" / "review …" / "challenge …"); it never calls an LLM, never hits the network, never touches quota. A confident match returns a `jump` resolved to a route-catalog `deepLink` (the screen runs `pushNowDeepLink`, T6/T11 — same expander, no second mapper). A clear non-route utterance returns `mentor` (the screen opens the session spine — the conversational fate, which is the only fate that pays the safety-tripwire + metering tax, both owned by `session/index.tsx`). **Uncertain → `uncertain`, which the screen handles by surfacing the BUTTONS** (the cold-start chips / quick-chips, T17) rather than guessing — intent classification falls back to buttons when uncertain (§2 P5). Every capability keeps its deterministic tap-path regardless; the matcher only adds a fast lane.
  **done when:** `apps/mobile/src/lib/bar-intent-match.test.ts` (T16a) asserts: a route-phrase input (e.g. "show my progress") returns `{ kind: 'jump', deepLink }` whose `route` is a closed-catalog key — and the test asserts **no LLM/network client is referenced** (the function takes a plain string and returns synchronously with no async/fetch — a **bar jump triggers no LLM call**, asserted by construction: the module imports no api-client/LLM symbol and `matchBarIntent` is synchronous); a clearly-conversational input returns `{ kind: 'mentor' }`; an ambiguous input returns `{ kind: 'uncertain' }` (**uncertain intent falls back to buttons** — the screen's documented handling). No internal mocks (pure function over the real schema types). `cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/bar-intent-match.ts --no-coverage` passes.

- [ ] **T17: Build the learner `ColdStartCard` — anchor-slot input + three fill-not-fire chips (§3.1).**
  Create `apps/mobile/src/components/mentor/ColdStartCard.tsx` and `apps/mobile/src/lib/first-real-state.ts`. The cold-start card **takes the anchor slot** day one (spec §3.1): ONE container holding the input bar (text + mic, reused from `MentorInputBar`/T10 affordances or a shared sub-component) and three example chips — `[📷 Homework help]` / `[✨ Learn something]` / `[💬 Ask a question]` — at **equal visual weight** with the input.
  - **Chips FILL, never fire (§3.1 rule 1 / §15.15).** Tapping a chip types its words into the input and lights the send arrow; the learner completes the send themselves. Chips NEVER navigate or auto-submit. **Equal visual weight is coupled to fill-semantics — never decouple** (if a chip navigated, equal weight would silently make the card a four-way first-screen choice = the Duolingo failure). Encode the coupling in the component contract: the chip handler is `onFill(text)` (sets the input value), there is no `onNavigate` chip path.
  - **Caption + framing (§3.1 rules 2–3):** one caption `mentorHome.coldStart.caption` ("Tell me anything — homework, a question, or something you want to learn. I'll take you there."); the chips sit under an explicit `mentorHome.coldStart.orJustType` ("…or just type") so they read as **examples**, not the boundary.
  - **Self-destruction keyed to FIRST REAL STATE (§3.1) — not first app-open, not "zero state".** `first-real-state.ts` exports `hasFirstRealState(input): boolean` = first subject created OR first completed exchange exists (derived from `/now` feed signals / profile, deterministic, no LLM). The card renders only while `!hasFirstRealState(...)`; once real state exists it dies forever (an established learner who later archives everything is **not** re-greeted — they have history). The kid who opens, stares, and closes gets the **same** warm card tomorrow. Chips **persist until the cold-start state dies** (not a one-shot splash).
  - **Homework dual-path (§3.1 — the fill-don't-fire stress test):** `[📷 Homework help]` fills + sends like the others; the mentor's reply is **instant and dual-path** — `mentorHome.coldStart.homeworkReply` ("Sure thing — snap a picture of it 📷. Or if you'd rather just ask, tell me about it here.") with the **camera as a big tappable affordance inside the reply** and chat continuing underneath. **NO conversational preamble** ("what subject is it?" first = the failure mode). **Latency/directness is an ACCEPTANCE CRITERION, not styling:** the camera affordance appears in the reply immediately, with no LLM round-trip gating its appearance (the dual-path reply is a deterministic template, not an LLM turn).
  - **Placeholder rotation (§3.1 teaching durability 2 / §15.15):** the input placeholder rotates examples **including navigational ones** (`mentorHome.coldStart.placeholderRotation.*`, e.g. "Try: show my progress") — teaches that the box also *goes places*.
  - **End-of-first-session line (§3.1 teaching durability 3):** the once-only in-character line `mentorHome.coldStart.firstSessionTeach` ("next time, just tell me what you need — anything") is emitted **once**, at the end of the first session. T17 supplies the copy key; T24 supplies the session wrap-up call site, so this is no longer a parked `// S3` annotation.
  Semantic tokens; persona-unaware; `t()` only; equal-weight chips use a shared chip-and-input token, never a per-chip emphasis that breaks equal weight.
  **done when:** `apps/mobile/src/components/mentor/ColdStartCard.test.tsx` (T17a) asserts: tapping a chip calls `onFill` with the chip's phrase and does **NOT** navigate/submit (assert no router push, no submit handler fired — the fill-not-fire law); the three chips and the input render with the **same** size/weight token (assert equal-weight coupling — the chips and input share the weight token, none carries an anchor/emphasis variant); the homework chip fill produces the dual-path reply containing a camera affordance with **no preceding "what subject" preamble** (assert the reply's first actionable element is the camera, latency-as-criterion proxy: the reply is a synchronous template render, no async LLM gate); and `apps/mobile/src/lib/first-real-state.test.ts` (T17b) asserts `hasFirstRealState` is true given a first subject / first completed exchange and false for an opened-but-empty profile (self-destruct keyed to first real state, not first open). Real i18n. `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/mentor/ColdStartCard.tsx src/lib/first-real-state.ts --no-coverage` passes; `persona-fossil-guard.test.ts` green.

- [ ] **T18: Build the interim in-conversation micro-celebration (`MentorCelebration.tsx`) — §2.1 channel 4.**
  Create `apps/mobile/src/components/mentor/MentorCelebration.tsx` — the **interim** carrier of the embodied micro-celebration (spec §2.1 channel 4; there is **no avatar yet** — the carrier is the conversation surface itself). It styles a mentor message so the celebratory message **arrives joyfully** — bubble motion / a small warm burst around the mentor's words — **in the same beat as the journey node lighting** (T19). One-shot, tied to the event; never an accumulative token, never engineered-random (§2.1 governing law). **Credit is attributed to the learner's OWN CHOICE** (copy frames "you decided to tackle it today — that paid off", never "good job doing what I said"); copy keys `mentorHome.celebration.*`. This is animation/styling of an existing mentor bubble only — it builds **no avatar / named character** (that is S3 + the separate brand project, owner Zuzana — see Scope "out"). Reuse the celebration-component brand-hex exception convention (CLAUDE.md: `*Celebration.tsx` may carry annotated brand hex inside the animation) — annotate the brand intent; otherwise semantic tokens. Persona-unaware; copy via `t()`. **Cross-reference S3** for the future mentor character; **cross-reference §2.1 / S0-R** for the reward-boundary cleanup — do NOT duplicate that work here.
  **done when:** `apps/mobile/src/components/mentor/MentorCelebration.test.tsx` (T18a) asserts: given a completion event it renders the mentor message with the celebratory styling/motion applied (assert the celebratory wrapper/testID `mentor-celebration` is present and wraps the mentor copy); the copy attributes the win to the learner's own choice (renders `mentorHome.celebration.*` own-choice copy, not obedience copy); it fires **one-shot per event** (a second render of the same resolved event does not re-trigger — no accumulation). Real i18n. `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/mentor/MentorCelebration.tsx --no-coverage` passes; `persona-fossil-guard.test.ts` green.

- [ ] **T19: Advance the anchor card's journey arc at the completion moment (§2.1 channel 2).**
  Wire the anchor `NowCard` (T7) so that **the journey moves under the finger** (spec §2.1 channel 2): when the learner completes the suggested action (e.g. the review on a `retention_due` anchor), the anchor card's arc visibly advances **at that moment** — the node lights, "review due" → "mastered" — and the §2.1 channel-4 celebration (T18) fires **in the same beat**. S1 does NOT recompute mastery (S0-R / the SRS core owns state); S1 renders the **state-change transition** the next `/now` feed already reflects, plus an optimistic in-card arc advance on the completion callback so the change is felt at the completion moment rather than after a refetch. Add an `onCompleted`/arc-state prop to `NowCard` and an `arcState: 'due' | 'advancing' | 'mastered'` render so the node-lighting transition is expressible. The arc advance is **truth-caused** (driven by the real completion event / `/now` delta), never a decorative animation untethered from a real state change (§2.1: "alive means truth-caused"). Copy keys `mentorHome.cards.*.arc*`.
  **done when:** `apps/mobile/src/components/mentor/NowCard.test.tsx` (extend T7a) asserts: a `retention_due` anchor card given `arcState='due'` renders the "review due" arc; firing the completion callback advances the rendered arc to `advancing`/`mastered` (node lights at the completion moment, not on remount); the celebration (T18) is triggered in the same callback (assert the celebration trigger fires within the completion handler). The arc only advances on a real completion event (no auto-advance on mount — truth-caused). Real i18n. `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/mentor/NowCard.tsx --no-coverage` passes.

- [ ] **T20: Build `RewardReceiptCard` — compact private earned-reward receipts (§2.1 amended 2026-06-13).**
  Create `apps/mobile/src/components/mentor/RewardReceiptCard.tsx`. It renders only after a real learning event or ledger moment: practice points/XP earned, the 1.5x reflection bonus, a quiz score/personal best, a topic/mastery delta, or a weekly momentum delta handed in by `/now`/ledger data. It is a **receipt**, not a goal object: subordinate styling, never the anchor, no random reward, no leaderboard, no public comparison, no paywall/quota CTA, no loss pressure. It may be embedded under `LedgerMomentCard` or rendered as a small row beneath the current anchor. Props are data-only, for example:
  ```ts
  type RewardReceipt =
    | { kind: 'practice_points'; amount: number; topicTitle?: string }
    | { kind: 'reflection_bonus'; multiplier: 1.5; totalXp: number }
    | { kind: 'quiz_personal_best'; game: 'capitals' | 'guess_who'; score: number }
    | { kind: 'mastery_delta'; mastered: number; weeklyDelta?: number };
  ```
  Use existing reward/ledger data; do not create a new backend write in S1. Copy keys live under `mentorHome.rewards.*`; semantic tokens; persona-unaware.
  **done when:** `apps/mobile/src/components/mentor/RewardReceiptCard.test.tsx` (T20a) asserts: each receipt kind renders the earned value; the reflection bonus renders the 1.5x multiplier; quiz personal best distinguishes Capitals and Guess Who; missing optional topic/weekly fields use no-variable copy; and the component renders no leaderboard/rank/public-comparison/paywall/loss-pressure copy or testID. Real i18n. `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/mentor/RewardReceiptCard.tsx --no-coverage` passes.

- [ ] **T21: Build `LightPracticeAffordance` — discoverable built quiz games without feed clutter (§2.2 amended 2026-06-13).**
  Create `apps/mobile/src/components/mentor/LightPracticeAffordance.tsx`. It is a compact "something lighter?" doorway surfaced when the feed is thin, a learner declines a heavier card, the bar intent is uncertain, or a fatigue/fallback state is inferred. It links to already-built lighter practice routes without taking the anchor slot: Capitals (`testID="quiz-capitals"` route), Guess Who (`testID="quiz-guess-who"` route), vocabulary, and dictation where available. If a route-catalog key is missing, route through the existing quiz/practice index rather than inventing a new screen; leave the direct route as an S0/S2 catalog follow-up. The component must be discoverable from the Mentor tab and callable by the mentor conversationally, but it must not turn the main feed into a game lobby.
  **done when:** `apps/mobile/src/components/mentor/LightPracticeAffordance.test.tsx` (T21a) asserts: the prompt renders; Capitals and Guess Who actions are present and call the passed navigation callback with stable route IDs/deep links; fatigue/thin-feed reason copy is optional and non-guilt; the component renders no leaderboard/public-rank/streak-pressure copy; and it can be hidden when no supported routes exist. `mentor.tsx` T11a covers that the affordance appears in at least one fatigue/thin-feed state. Real i18n. `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/mentor/LightPracticeAffordance.tsx --no-coverage` passes.

- [ ] **T22: Wire the V2 post-auth / consent handoff into the Mentor cold-start card (no-surprises GAP 1).**
  Update the post-gate landing helper(s) around `apps/mobile/src/app/(app)/_lib/auth-redirect.ts` and the profile/consent completion callers so that, when `MODE_NAV_V2_ENABLED` is true and the learner is eligible for the V2 shell, the first app surface after sign-up, profile creation, or a consent gate clearing is `/(app)/mentor` with `ColdStartCard` owning the anchor slot. Do **not** add a welcome tour, setup wizard, subject picker, or new "choose your path" route. One confirmation beat is allowed only inside the Mentor surface, not as a separate pre-Mentor screen. V2-off behavior remains byte-identical to today's post-gate routing.
  **done when:** `apps/mobile/src/app/(app)/_lib/auth-redirect.test.ts` (T22a, or the existing post-gate routing test if that is the local home) asserts: V2-on learner after profile/consent completion resolves to `/(app)/mentor`; no `/(app)/create-subject`, legacy `/(app)/home`, or subject-picker route is inserted before the Mentor card; V2-off keeps today's target; and an opened-but-empty profile still renders `ColdStartCard` via T11/T17 rather than being treated as completed onboarding. Real routing helpers, mocked only at the Expo Router boundary.

- [ ] **T23: Frame the first homework camera round-trip as one V2 conversation thread (no-surprises GAP 2).**
  Extend `apps/mobile/src/app/(app)/homework/camera.tsx`, `homework/_view-models/homework-session-params.ts`, `session/_view-models/session-route-params.ts`, and the session entry receiver so the Mentor bar/reply opens the existing camera with a V2 source/return contract (for example `entrySource=mentor` plus `returnTo=mentor` / the session-thread return target). Do not overload the existing homework capture `source` enum, which is camera/gallery-oriented. After capture, the learner lands back in the session thread with the image rendered as their image bubble, followed by deterministic first-response actions: **help me solve this** and **check my answer**. OCR/upload/retry/local-retain internals remain owned by the existing homework flow; this task owns only the V2 route params, return target, image-bubble rendering, and "same conversation" continuity. There is no "what subject is it?" preamble before the camera or before the first help/check choice.
  **done when:** route-param tests around `homework-session-params.ts` / `session-route-params.ts` (T23a) assert the V2 `entrySource`/`returnTo` params round-trip; `session/index.tsx` tests assert the captured image appears as the learner image bubble with help/check buttons in the same thread; the first actionable response contains no subject-picking preamble; back/finish returns to the Mentor tab when `returnTo=mentor`; and V2-off legacy camera/session behavior is unchanged.

- [ ] **T24: Add the first-session conversational wrap-up turn with learner-written reflection (no-surprises GAP 3 / §2.2).**
  Extend the session completion path in `apps/mobile/src/app/(app)/session/index.tsx` so that, under V2 and on the learner's first completed session/exchange, the final mentor turn replaces the legacy three-screen exit-funnel feel with one conversational wrap-up. It contains: an honest one-line recap, credit attributed to the learner's own choice, the once-only teaching line from T17 (`mentorHome.coldStart.firstSessionTeach`), a **Your Words** prompt asking the learner to write what they learned, save/file behavior that preserves that learner-authored text for mentor memory/session signal, the 1.5x reflection bonus receipt via `RewardReceiptCard`, and the truth-caused `MentorCelebration` from T18. Do not delete `session-summary/[sessionId].tsx` here; S6 deletes it only after this heir is live and covered.
  **done when:** `apps/mobile/src/app/(app)/session.test.tsx` or the local session completion test (T24a) asserts: first V2 completion renders the wrap-up turn in the thread; the learner can submit "Your Words"; the submitted text is passed to the existing summary/session-memory filing boundary where available; the 1.5x reflection receipt renders; `MentorCelebration` fires once; the teach line appears once and never repeats for later sessions; V2-off still uses today's completion path. If the persistence boundary is not directly injectable in the existing test harness, add a view-model test that proves the payload sent to the existing boundary includes the learner-authored reflection text.

- [x] **T25: V2 conversational mentor turn — resolve the subject without a turn-1 grid gate, and never silently mis-commit on ambiguity (§3.1 "first subject through the conversation"; the conversational sibling of T23).** Inside `MMT-ADR-0021` (subject still resolved up front; topic still deferred to `FILING_CONFIG.minFreeformExchanges`; no placeholder topic minted). The *defer-the-subject* alternative is **`MMT-ADR-0023` (Proposed)** — out of scope here.

  **The leak this closes.** A `matchBarIntent` `mentor` result (`bar-intent-match.ts`, T16) routes to the session via `mentor.tsx` `handleSubmitText`, but today it (a) **drops the typed text** — the push carries only `entrySource`/`returnTo`, not `result.text` — so the learner re-types into an empty session; and (b) for a learner with no/ambiguous subject the session's first-message path (`apps/mobile/src/components/session/use-subject-classification.ts`) either opens the full subject-library **grid gate** (`:555`, `:584`, `:596`) and **blocks chat** (`:434` "Pick the subject first…"), or **silently auto-commits a wrong subject** (`:528-549`, the confident-single path — real failure: "analysis" → English). The session cannot exist without a subject (`use-session-streaming.ts:342`; `learning_sessions.subjectId`/`session_events.subjectId` are `NOT NULL`), so the subject must be resolved on turn 1 — this task makes that resolution **non-blocking and non-silent-on-ambiguity**, V2-only.

  - **Carry the typed text into the session.** In `mentor.tsx` `handleSubmitText`, the `kind === 'mentor'` branch pushes `/(app)/session` with `rawInput: result.text` (and `mode: 'freeform'`) so the learner's message becomes the first exchange (`session/index.tsx` already reads `rawInput` → `use-session-streaming.ts:299,725`), instead of being dropped.
  - **V2-gate the new behavior** on the V2 mentor entry (`entrySource === 'mentor'` / `FEATURE_FLAGS.MODE_NAV_V2_ENABLED`). V0/V1 keep today's grid-picker path **byte-identically** (the §7 / hard-constraint no-regress). Encode the gate as an explicit branch in `use-subject-classification.ts`, not a rewrite of the legacy path.
  - **Resolution under V2 — three paths, never the library grid, never a blocking wall:**
    1. **Unambiguous confident classification** → silent auto-pick + proceed (today's `:528-549` "Looks like {Subject}." stays, but only as a **non-blocking system line that arrives with the teaching**, never a question).
    2. **Genuine ambiguity** (multiple candidates, or low confidence) → a **mentor-voiced inline disambiguation** of the top 2–3 candidates as conversational chips ("Maths — analysis" / "English — analysis" / "+ something new"), rendered in-thread — **not** the full subject-library grid and **not** a "pick the subject first" block. Selecting a chip proceeds; the learner can also keep typing. This is content disambiguation scoped to real ambiguity, distinct from the banned turn-1 "what subject is it?" setup gate.
    3. **Brand-new subject inferred** (zero existing candidates + a `suggestedSubjectName`) → **silently create** from the suggested name and proceed (reuse the homework auto-create pattern, `camera.tsx:290-304`). No picker. **(Freeform only — see the homework carve-out below.)**
  - **Always-visible, non-blocking override.** On every auto-pick (paths 1 and 3) keep the existing "wrong subject?" affordance (`showWrongSubjectChip`) visible and obvious, so a confident **mis**-pick ("analysis" → English) is one tap to correct. **Honest limitation (documented, not hidden):** under this approach a *confidently-wrong* single classification still slips past disambiguation; the override is the only catch. Eliminating that class is `MMT-ADR-0023` (deferral) — do **not** attempt it here by tuning the classifier ("a stronger guesser" is rejected, ADR-0023 Alt. 2).
  - **Homework / camera carve-out (conservative ladder, ruled 2026-06-19).** The same V2 mentor entry now also covers homework/camera launched from the mentor bar (`isV2MentorEntry = MODE_NAV_V2_ENABLED && entrySource === 'mentor'`, dropping the freeform-only clause), so the grid never gates a deferred-no-match homework turn either. But homework writes **durable evidence** and **OCR can misread**, so the homework path **never silently creates** — it is a tiered, non-blocking ladder: (1) confident single → auto-pick + override chip; (2) several equally-good candidates → narrow top-2–3 disambiguation chips (asking is correct here, not a failure); (3) zero match + a `suggestedSubjectName` → a **tap-to-create card** (`"+ {name}"`, narrow, no grid, **no** silent create); (4) zero + no name but `resolveSubject` yields a name/suggestions → those new-subject cards (still not the grid); (5) **floor — genuinely no signal** → the learner's own subjects as quick-picks **plus** type-to-create, non-blocking and last-resort only (collapses to type-to-create when no subjects are enrolled). The full subject grid survives **only** as tier 5, reframed and non-blocking — never the turn-1 gate. The DB `subjectId NOT NULL` invariant means homework still cannot start subjectless; lifting that floor is `MMT-ADR-0023` (out of scope).
  - **Stay inside ADR-0021.** Subject still resolved up front (events need `subjectId`); the **topic** stays deferred to `FILING_CONFIG.minFreeformExchanges`; no placeholder/provisional topic minted (ADR-0021 Decision 1). T25 changes *how* the subject is resolved, not *that* it is.

  **done when:** `apps/mobile/src/components/session/use-subject-classification.test.ts` (T25a) asserts, with the V2 mentor entry: (1) a no-subject first message with **multiple/low-confidence** candidates renders the **inline disambiguation** (top 2–3 candidate chips + "new subject") and does **NOT** render the full subject-library grid and does **NOT** block sending (`pendingSubjectResolution` "pick the subject first" wall not shown under V2); (2) an **unambiguous** message auto-picks silently and proceeds, override chip present; (3) a **zero-candidate + suggested-name** message silently creates the subject and proceeds (no picker); (4) the V0/V1 path is **unchanged** (legacy grid/block still renders with the V2 gate off — a §7 regression guard). Plus `apps/mobile/src/app/(app)/mentor.test.tsx` (extends T11a) asserts a `kind:'mentor'` submit pushes the session with `rawInput` set to the typed text (carried, not dropped). No internal mocks (real classification view-model + real i18n; mock only the API client's HTTP layer + the `feature-flags` value). `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/session/use-subject-classification.ts src/app/(app)/mentor.tsx --no-coverage` passes; `cd apps/mobile && pnpm exec tsc --noEmit` passes.

---

## Open decision (blocks the copy-template task only)

> **OD-1 — Assertiveness dial (spec §13.7; owner: product / Zuzana). Blocks S1 COPY TEMPLATES ONLY — not the build.**
> The default tone of the mentor's proposals and who moves it is **not yet ruled**. Recommendation on the table (spec §13.7): a **calm default** (invitation, not summons — no deadline means "study now" reads as nagging); a **two-position user-set dial** (*relaxed / push me*) set **conversationally** (the mentor asks at a natural moment, "want me to be strict with you?") and mirrored in settings; **never age-inferred** (profiling-adjacent for minors); mechanics are **dial-independent** (honesty, the P6 budget, no guilt copy — and per §2.1, strict NEVER withholds warmth); **two positions, not a slider** (each extra position multiplies copy templates across the 10 conversation languages).
> **S1 handling until ruled:** all S1 home proposal copy (the `mentorHome.cards.*` proposal/CTA strings, T13) uses the **calm default** pending the ruling. S1 ships **one** copy set (calm default) and does **not** build the two-position dial, the conversational "want me to be strict?" moment, or the settings mirror — those are gated behind this decision. Only the copy-template surface (T13) waits on OD-1; every other S1 task proceeds. If the ruling lands as the two-position dial, the second ("push me") copy set + the dial mechanics are a follow-up (S1.1 or folded into S3 settings), not a re-architecture.

---

## Role-noun (frozen for all S1 copy)

> **Role-noun = "mentor" everywhere (spec §15.19 / §13.7-adjacent). No age-split "mate".** All S1 copy — `mentorHome.*` strings, the cold-start caption, the celebration copy, tab labels — uses **"mentor"** as the single role-noun (T13 keys already namespaced `mentorHome.*`). The under-18 rename to "mate" was considered and rejected (the pun is English-only; "mate" claims peer-intimacy the product must *earn*; renaming at the 18th birthday breaks continuity). Warmth comes from the future **mentor character's NAME** (§2.1 / S3), not a role rename — do NOT introduce an age-split or alternate role-noun anywhere in S1.

---

## Tests

All co-located (no `__tests__/`). Run each with `cd apps/mobile && pnpm exec jest --findRelatedTests <file> --no-coverage`. NO internal `jest.mock('./...')` / `jest.mock('../...')` (GC1) — use real components/schemas/i18n; mock ONLY external boundaries (the API client's HTTP layer, AsyncStorage via the existing jest mock, Sentry, the `feature-flags` env value). `persona-fossil-guard.test.ts` must stay green for every component touched.

- **T1a** `lib/feature-flags.test.ts` — `MODE_NAV_V2_ENABLED` defaults false; key exists.
- **T2a** `hooks/use-navigation-contract.test.ts` — V2-on → three-tab set + `tabs.mentor` presentation; V2-off → unchanged legacy `visibleTabs` (the §7 regression guard).
- **T4a** `lib/now-feed-cache.test.ts` — round-trip; TTL expiry → null; corrupt JSON → null; schema-fail → null.
- **T5a** `hooks/use-now-feed.test.tsx` — parsed feed returned; cache mirror on success; rejected fetch → `isError`, no throw.
- **T6a** `lib/now-deep-link.test.ts` — `subject.topic` pushes ancestor `subject-hub/<subjectId>` then existing `topic/<topicId>` leaf (chain order); empty-chain pushes once; param interpolation; missing/unknown chain keys fail before indexing.
- **T7a** `components/mentor/NowCard.test.tsx` — title renders from template; Continue/Decline callbacks; unknown templateKey → generic fallback.
- **T8a** `components/mentor/LedgerMomentCard.test.tsx` — template render + params; tap → onContinue; renders standalone with no data provider (P4 no-LLM guard by construction).
- **T9a** `components/mentor/NowCardStack.test.tsx` — anchor + ≤2 modules, no overflow at count 0; overflow entry shows count; empty → onboarding card; `dismissedKeys` filters a card; anchor renders `variant='anchor'`, others `variant='module'`; a quota/upgrade card is always a `module`, never anchor styling (P6 anchor-uniqueness compliance check); a card with no `deepLink` is not rendered (P6 action-not-announcement).
- **T10a** `components/mentor/MentorInputBar.test.tsx` — camera/chip callbacks; text submit calls `onSubmitText`; mic present and `onTranscript` payload is a plain string with no tone/emotion field (§16 transcription-only); `unavailable` → conversational unavailable copy yet deterministic-jump submit + camera/chip/mic still fire.
- **T11a** `app/(app)/mentor.test.tsx` — happy feed renders stack + pinned bar (camera + chip + mic reachable, EU-5) + the "on track" badge (T15); cold-start state (no first real state) renders `ColdStartCard` in the anchor slot; error+cache → cached cards + continue-where-you-left-off, no dead-end; error+no-cache → `ErrorFallback` with working retry; a bar route-phrase submit triggers a deterministic `pushNowDeepLink` with no LLM call (T16); card Continue → `pushNowDeepLink`; earned reward event → subordinate `RewardReceiptCard`; fatigue/thin-feed state → `LightPracticeAffordance` with Capitals + Guess Who reachable.
- **T12a** `app/(app)/subjects.test.tsx` + `journal.test.tsx` — stub heading renders; default export present.
- **T13** i18n: `check-i18n-orphan-keys.ts` zero forward orphans; `check-i18n-jsx-literals.ts` no new violations.
- **T15a** `components/mentor/OnTrackBadge.test.tsx` — renders the "on track" label; may render a real due-review count; renders no streak run, XP total, leaderboard/rank, loss-warning, or public-comparison copy/testID.
- **T16a** `lib/bar-intent-match.test.ts` — route phrase → `{kind:'jump'}` over the closed catalog with no LLM/network reference (synchronous, no api-client import — bar jump triggers no LLM call); conversational → `{kind:'mentor'}`; ambiguous → `{kind:'uncertain'}` (button fallback).
- **T17a/T17b** `components/mentor/ColdStartCard.test.tsx` + `lib/first-real-state.test.ts` — chip tap fills (no fire/navigate); chips + input share the equal-weight token (coupled to fill-semantics); homework chip → dual-path reply with camera affordance, no "what subject" preamble; `hasFirstRealState` true on first subject/exchange, false on opened-but-empty (self-destruct keyed to first real state).
- **T18a** `components/mentor/MentorCelebration.test.tsx` — celebratory wrapper present around the mentor copy; copy attributes the win to the learner's own choice (not obedience); one-shot per event (no re-trigger / no accumulation).
- **T19a** (extends **T7a**) `components/mentor/NowCard.test.tsx` — `retention_due` anchor advances arc on the completion callback (node lights at the moment, not on remount); celebration fires in the same handler; no auto-advance on mount (truth-caused).
- **T20a** `components/mentor/RewardReceiptCard.test.tsx` — practice points, 1.5x reflection bonus, quiz personal best, and mastery delta receipts render as private earned-credit receipts; no leaderboard/public-rank/paywall/loss-pressure copy.
- **T21a** `components/mentor/LightPracticeAffordance.test.tsx` — "something lighter?" prompt renders; Capitals + Guess Who actions route; fatigue copy is non-guilt; hides cleanly when no supported routes exist.
- **T22a** `app/(app)/_lib/auth-redirect.test.ts` (or existing post-gate routing test) — V2-on post-auth/consent/profile completion lands on `/(app)/mentor`; no setup wizard/subject picker/legacy home target before the Mentor card; V2-off target unchanged.
- **T23a** route-param/session tests around `homework-session-params.ts`, `session-route-params.ts`, and `session/index.tsx` — V2 homework source/return params round-trip; captured photo renders as learner image bubble; help/check buttons are first response; no subject-picking preamble; Mentor is the return target.
- **T24a** `app/(app)/session.test.tsx` or the local session completion test — first V2 completion renders the conversational wrap-up; learner submits "Your Words"; reflection text reaches the filing/memory boundary; 1.5x receipt renders; celebration fires once; teach line appears once; V2-off completion path unchanged.
- **T25a** `components/session/use-subject-classification.test.ts` + (extends **T11a**) `app/(app)/mentor.test.tsx` — under the V2 mentor entry: ambiguous/low-confidence → inline disambiguation chips (no full library grid, no "pick the subject first" block); unambiguous → silent auto-pick + override chip; zero-candidate + suggestion → silent create (no picker, **freeform**); V2-off → legacy grid/block unchanged (§7 guard); a `kind:'mentor'` bar submit pushes the session with `rawInput` = the typed text (carried, not dropped). **Homework/camera ladder (V2 mentor entry, `effectiveMode !== 'freeform'`):** several equally-good candidates → narrow disambiguation chips (not the grid); zero + suggestion → **tap-to-create card, NO silent create**; tier-5 floor (no signal) → enrolled quick-picks + type-to-create (type-only when no enrolled subjects); single uncertain candidate → auto-pick + chip with the image preserved; V2-off homework zero-match → legacy grid unchanged (§7 guard). Real view-model + i18n; mock only the API HTTP layer + `feature-flags`.

**Run gates before commit:**
- `cd apps/mobile && pnpm exec tsc --noEmit` (mobile typecheck — the `@nx/expo` plugin overflows on Windows, run jest/tsc/eslint directly per project memory `project_nx_expo_plugin_bug`).
- `pnpm exec nx lint mobile` (or eslint directly if the plugin overflows).
- Each `*.test.tsx` above via `jest --findRelatedTests`.
- The two i18n scripts (T13).
- Visual check on a dev client with `EXPO_PUBLIC_ENABLE_MODE_NAV_V2=true`: three tabs; Mentor feed renders cards + pinned bar; camera + Homework chip reachable without scrolling; flag-off build shows today's exact shell.

> **No integration test in S1.** S1 adds no API route (S0 owns `/now` and its integration test). The mobile↔api contract is exercised via the typed Hono RPC client + `nowResponseSchema.parse` at the hook boundary (T5), which fails loudly if S0's response shape drifts.

---

## Self-review

**Spec coverage** (each S1 requirement → task):
- V2 flag wiring + screen-#89 additive mount, no V0/V1 edits (§7, anchors §2) → T1 (flag), T2 (hook branch — contract files untouched), T3 (tab registration), T14 (eas/ci staging). Scope "out" pins navigation-contract.ts / legacy-navigation-contract.ts as no-edit.
- Mentor-tab content: feed = app-known, bar+camera+Homework chip+mic = world-known (§3, §16) → T9 (`NowCardStack`), T10 (`MentorInputBar`).
- App-open = card feed, glanceable, opt-in chat (option A, §3) → T11 (`mentor.tsx` renders the feed; chat is a `router.push` to `session/`, not auto-opened).
- **§2 P5 "one input, two fates" — local-first intent-matcher, deterministic jump (zero LLM) vs mentor turn, button fallback when uncertain** → T16 (`matchBarIntent` over the closed route catalog, synchronous/no-LLM) + T10 (bar two-fates submit wiring) + T11 (jump→`pushNowDeepLink`, mentor→session, uncertain→buttons). T16a asserts a bar jump triggers no LLM call; ambiguous→buttons.
- **§2 P6 "module discipline is a hard budget" — one anchor + ≤2 modules, every card an action, anchor visually unique (quota/402 subordinate; minors compliance posture)** → T9 (anchor vs module `variant`, quota card always a module, no-`deepLink` card dropped) + T9a (anchor-uniqueness compliance check; action-not-announcement check).
- **§2 P7 / §2.1 earned motivation + noticing — private earned receipts survive, pressure mechanics die; "on track" rhythm replaces pressure streak; journey arc advances at completion; interim in-conversation celebration; credit to learner's own choice** → T15 (`OnTrackBadge` replaces pressure-style streak display but may show real due-work counts) + T20 (`RewardReceiptCard` preserves XP/practice points, reflection bonus, quiz personal bests, mastery deltas as compact private receipts) + T19 (anchor arc advances at the completion moment, truth-caused) + T18 (`MentorCelebration` interim carrier, own-choice copy, one-shot). Reward persistence = retained/S0-R boundary, not removed here; mentor character = S3 (Scope "out").
- **§2.2 lost V1 quiz-game discovery — Capitals + Guess Who stay discoverable without cluttering Mentor** → T21 (`LightPracticeAffordance` surfaces "something lighter?" from thin/fatigue/decline states and routes to existing quiz games) + T11a coverage.
- **§3.1 learner cold-start — cold-start card owns the anchor slot until first real state; chips fill not fire; equal-weight↔fill coupling; post-auth handoff lands there; homework dual-path no preamble (latency = acceptance criterion); placeholder rotation; end-of-first-session line** → T17 (`ColdStartCard` + `first-real-state.ts`) + T22 (post-auth/consent handoff) + T11 (renders it in the anchor slot when `!hasFirstRealState`). T17a/b assert fill-not-fire, equal-weight coupling, homework dual-path, self-destruct keyed to first real state; T22a asserts no pre-Mentor setup screen.
- **No-surprises dossier GAP 2 — first homework camera round-trip described in V2 terms** → T23 (camera source/return params + session image bubble + deterministic help/check buttons) + T23a coverage.
- **No-surprises dossier GAP 3 / §2.2 reflection-for-bonus — first-session wrap-up turn replaces the exit-funnel feel before S6 deletion** → T24 (learner-written Your Words prompt, filing/memory payload, 1.5x receipt, once-only teach line, one-shot celebration) + T24a coverage.
- **Screenshot-bug gap / §3.1 "first subject through the conversation" — the general typed `mentor` turn must resolve the subject without a turn-1 library-grid gate and without a silent mis-commit on ambiguity ("analysis" → English); the homework sibling is T23, the post-auth sibling is T22** → T25 (carry `rawInput`; V2-gated no-grid resolution: silent on unambiguous, mentor-voiced inline disambiguation on ambiguity, silent-create on new subject, always-visible override; inside `MMT-ADR-0021`, deferral alternative `MMT-ADR-0023`) + T25a coverage.
- **§15.15 "chips fill, cards fire" permanent interaction law — chips type into the input (recurs with state-aware content), proposal cards stay one-tap, never decouple equal-weight from fill** → T17 (cold-start chips fill via `onFill`, no `onNavigate` path) + T9 (proposal cards stay one-tap direct actions) + the cross-cutting rule below.
- **§16 voice input everywhere — mic on the home input; transcription-only, never tone/emotion analysis (AI Act Art 5(1)(f))** → T10 (`mentor-bar-mic`, `onTranscript` string-only) + T10a transcription-only assertion.
- **§13.7 assertiveness dial — OPEN DECISION, blocks S1 copy templates only; calm default pending the ruling** → OD-1 block + T13 (calm-default copy, one set only). Build proceeds; only the copy-template surface waits.
- **§15.19 role-noun = "mentor" everywhere, no age-split "mate"** → the "Role-noun (frozen for all S1 copy)" block + T13 (`mentorHome.*` keys, "mentor" only). Warmth from the future character's name (§2.1/S3), not a rename.
- EU-5 layout floor — camera + Homework chip reachable without scrolling; pinned bar; school-day/weekday-evening Homework highlight (§3) → T10 (bar) + T11 (pinned layout + `getTimeOfDay`/`getDay` heuristic) + T11a assertion (chip reachable).
- ≤3 highlight ceiling + overflow affordance "more/everything waiting" (§8.1, EU-3) → T9 (`NowCardStack` slices ≤3, renders overflow when `overflowCount>0`) + T5 (`useNowOverflow`).
- Every card declinable (§2 P1) → T7/T8 Decline callback + T11 local `dismissedKeys` (documented as client-local for Me scope; server-persisted snooze is S4/S5).
- Template-rendered ledger-moment cards, NO LLM (§2 P4 / §8.2) → T8 (`LedgerMomentCard`, pure presentational) + T8a no-data-provider guard.
- deepLink push via full ancestor chain from the route catalog (§8.1, cross-stack-push) → T6 (`pushNowDeepLink` pushes `chain` then leaf) + T6a chain-order assertion.
- §14 S1 failure modes:
  - Feed-unavailable → cached last feed + deterministic "continue where you left off" + `ErrorFallback` (retry primary, Subjects secondary) → T4 (cache) + T11 (orchestration) + T11a (b/c).
  - Empty feed → onboarding proposal card → T9 (`NowCardStack` empty state) + `mentorHome.empty.*` (T13).
  - LLM-down → bar honest-unavailable, feed/tabs still work → T10 (`unavailable` prop) + T11 (feed never degrades on LLM outage).
  - Homework photo fails → local retain + inline retry → reuses the EXISTING `homework/camera.tsx` OCR/retry internals, while T23 owns only the V2 source/return params and same-thread session framing.
  - Parked item via backstop+overflow → S0 ranking owns the backstop; S1 surfaces it via the overflow affordance (T9) — assertion that a parked item is reachable lives in S0's `buildNowOverflow` test; S1 renders whatever `/now/overflow` returns.
- i18n keys for all copy, same PR → T13 (all keys enumerated) + every component uses `t()` (no JSX literals — ratchet-enforced).
- Reuse anchors: `CoachBand`/`HOME_INTENT_ACTIONS` templated off (T7/T10), `ErrorFallback`/`TimeoutLoader` (T11), typed Hono RPC `AppType` (T5), `home.tsx:161` landing left intact for V0/V1 (Scope "out").
- Out of scope honored: Subjects hub (S2 — `subjects.tsx` is a stub, T12), Journal (S3 — `journal.tsx` stub), supporter scopes (S4), `/now` ranking (S0).

**Name consistency:** flag `MODE_NAV_V2_ENABLED` / env `EXPO_PUBLIC_ENABLE_MODE_NAV_V2`; hooks `useNowFeed`, `useNowOverflow`; components `NowCardStack`, `NowCard`, `LedgerMomentCard`, `MentorInputBar`, `OnTrackBadge`, `RewardReceiptCard`, `LightPracticeAffordance`, `ColdStartCard`, `MentorCelebration`; libs `pushNowDeepLink`, `readCachedNowFeed`/`writeCachedNowFeed`, `matchBarIntent` (returning `BarIntentResult` with `kind: 'jump'|'mentor'|'uncertain'`), `hasFirstRealState`; post-gate helper seam `auth-redirect.ts`; V2 homework/session params `entrySource=mentor`, `returnTo=mentor`, `homeworkReturnTarget`, `sessionImageBubble`; first-session wrap-up copy/data seam `mentorHome.wrapUp.*` / `Your Words`; `NowCard` `variant: 'anchor'|'module'` + `arcState: 'due'|'advancing'|'mastered'`; page `mentor.tsx` (route name `mentor`), stubs `subjects.tsx`/`journal.tsx`; tab set `V2_TABS = {mentor,subjects,journal}`; i18n `mentorHome.*` (incl. `mentorHome.onTrack.*`, `mentorHome.rewards.*`, `mentorHome.lightPractice.*`, `mentorHome.coldStart.*`, `mentorHome.homework.*`, `mentorHome.wrapUp.*`, `mentorHome.celebration.*`, `mentorHome.cards.*.arc*`) + `tabs.{mentor,subjects,journal}`. Schema names consumed verbatim from S0: `NowResponse`, `NowCard`, `NowDeepLink`, `NowDeepLinkRoute`, `NowOverflowResponse`, `nowResponseSchema`, `nowOverflowResponseSchema`, route-catalog keys `session.resume`/`subject.hub`/`subject.topic`/`retention.review`/`challenge.start`, card kinds `unfinished_session`/`retention_due`/`parked_item`/`needs_deepening`/`challenge_ready`/`ledger_moment`. All used identically across tasks, the card-type table, the tests, and the cross-plan handoff below.

**Deferred-decision scan:** decline semantics decided (client-local dismiss for Me scope, T-note); overflow rendering decided (inline expand, not a new route, T9); school-day heuristic decided (Mon–Fri + afternoon/evening via `getTimeOfDay`+`getDay`, T11); feed-unavailable fallback decided (cached feed → ErrorFallback, with a synthesized continue card, T11); empty-feed onboarding target decided (`/(app)/mentor` under V2 via T22; legacy `/(app)/create-subject` only where V2 is off); `retention.review`/`challenge.start` leaf-route gap decided (route to `subject.topic` sheet until S2 builds the dedicated leaves, T6 note); cold-start self-destruct trigger decided (first real state = first subject OR first completed exchange, `hasFirstRealState`, T17, **not** first app-open); intent-match fallback decided (uncertain → buttons, never a guess, T16); first homework round-trip decided (existing camera, V2 source/return params, session image bubble, help/check buttons, T23); first-session wrap-up decided (conversation turn with learner-authored reflection + 1.5x receipt, T24). **One genuinely open decision is surfaced, not guessed: OD-1 (the §13.7 assertiveness dial), which blocks the S1 copy-template surface (T13) only — S1 ships the calm-default copy set pending the product ruling.** No "TBD"/"handle appropriately" remain.

**Cross-plan names introduced (for S2/S3 consistency):**
- **Feed hook:** `useNowFeed()` (+ `useNowOverflow(enabled)`) in `apps/mobile/src/hooks/use-now-feed.ts` — the single typed `/now` consumer; S2's hub "Next up" block and S3's Journal both read the same `/now` source via this hook (or a scope-parametrized successor S4 adds), never a second client.
- **Card-stack component:** `NowCardStack` (with `NowCard` / `LedgerMomentCard` children) in `apps/mobile/src/components/mentor/` — S2's hub "Next up" block reuses `NowCard` (same `/now` card source per spec §5.1); S4 extends it with scope-aware rendering, never forks it.
- **Deep-link expander:** `pushNowDeepLink` in `apps/mobile/src/lib/now-deep-link.ts` — the one place catalog keys become Expo Router paths; S2/S4 add catalog keys to its `PATH_BUILDERS` in lockstep with S0's `ROUTE_CATALOG`, never a parallel mapper.
- **V2 tab set + flag seam:** `V2_TABS` and the `useNavigationShellContract` V2 branch — S2/S3 fill `subjects.tsx`/`journal.tsx`; S4 extends *this* branch with the scope chip, never the legacy contract files.
- **Intent-matcher seam:** `matchBarIntent` in `apps/mobile/src/lib/bar-intent-match.ts` — the single local-first classifier in front of the bar (§2 P5); it resolves jumps through the same closed route catalog as `pushNowDeepLink`, never a parallel mapper. S4 extends it for scope-aware intents (e.g. "how is Emma doing?") in lockstep with S0's `ROUTE_CATALOG`, never forks it.
- **On-track badge:** `OnTrackBadge` in `apps/mobile/src/components/mentor/` — the §2 P7 calm rhythm surface that replaces pressure-style streak display; S2/S3 may reuse it on hub/Journal headers, never re-introducing loss-pressure streaks, leaderboards, or public ranking.
- **Reward receipt:** `RewardReceiptCard` in `apps/mobile/src/components/mentor/` — the compact private receipt for XP/practice points, reflection bonus, quiz personal bests, and mastery deltas; S2/S3 can reuse it where those receipts belong in hub/Journal history.
- **Light practice doorway:** `LightPracticeAffordance` in `apps/mobile/src/components/mentor/` — the "something lighter?" entry to Capitals, Guess Who, vocabulary, and dictation; S2 can place subject-scoped versions without turning the main feed into a game list.

---

## Cross-cutting interaction law — "chips fill, cards fire" (§15.15, permanent)

> This is a **permanent product law**, not an S1-only rule — encoded here because S1 introduces the surfaces it first governs:
> - **Suggestion chips near the input ALWAYS type into it** (fill), never navigate or auto-submit. The mechanic recurs for the life of the product with state-aware content (e.g. "Review photosynthesis" appearing as words in the box). In S1 this is the cold-start chips (T17) via `onFill`; there is no `onNavigate` chip path anywhere.
> - **Proposal CARDS stay one-tap direct actions** (fire). In S1 this is `NowCard`/`LedgerMomentCard` Continue/tap-through (T7/T8/T9).
> - **Equal chip/input visual weight is COUPLED to fill-semantics — never decouple them.** Equal weight is honest only because chips are pre-typed phrases of the one input (autocomplete made visible); if a chip ever navigated, equal weight would silently turn a card into a multi-way first-screen choice (the Duolingo failure §3.1 guards against). Any future contributor adding a chip MUST wire it to fill, or change the visual weight in the same change — the two move together.
> - **Teaching durability (§3.1):** the placeholder rotates examples including navigational ones (T17, `placeholderRotation.*`); the mentor teaches "just tell me what you need — anything" once, in character, at end of first session (T17, `firstSessionTeach`).
