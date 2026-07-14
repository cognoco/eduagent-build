# Accessibility Scanner Agent — Findings

**Scope:** `apps/mobile/src` (Expo / React Native, expo-router, ~88 screens) — children's education app (MentoMate / EduAgent). Path-scoped audit, not a PR diff. **All findings classified `[PRE-EXISTING]`.**

---

## Overall A11y Posture Read

**This surface is NOT an unlabeled app — it has had meaningful prior accessibility work and is in noticeably better shape than a never-audited RN codebase usually is.** Concretely:

- `accessibilityLabel` appears in **175** non-test files; `accessibilityRole` in **178**. Of 167 files using `Pressable`/`Touchable`, only **6** lack any label/role, and a heuristic scan for the worst case — an icon-only `Pressable` wrapping a single `<Ionicons>` with no label and no `<Text>` child — found **zero** instances. Icon-only controls (back, send, mic, close, password-eye, dismiss) are consistently labeled.
- The two highest-traffic flows are in good shape on the basics: the chat composer (`ChatShell.tsx`) labels back/send/mic/input and uses `accessibilityState.selected` on the mode toggle; the quiz (`quiz/play.tsx`) labels answer options with `accessibilityState.{selected,disabled}` and pairs correctness with **text** ("Correct" / "Not quite"), not color alone.
- `allowFontScaling={false}` appears **0** times — Dynamic Type is respected app-wide. There are evident traces of deliberate a11y sweeps in comments (`[a11y sweep]`, `ACC-12`, "decorative icon — Pressable parent carries the label").

**Where it falls down is the second tier of screen-reader support — the dynamic/temporal layer:**

1. **Live-region announcements are largely absent from the core loops.** `accessibilityLiveRegion` exists in ~7 files (consent, offline banner, outbox/filing banners) but is **missing from the chat message stream, quiz answer results, the "thinking"/loading states, and toasts.** `AccessibilityInfo.announceForAccessibility()` (the iOS-side equivalent — `accessibilityLiveRegion` is Android-only) appears **0 times anywhere.** So on iOS, *no* dynamic state change is announced to VoiceOver.
2. **The streamed tutor reply is never announced to screen-reader users.** Auto-TTS is deliberately suppressed when a screen reader is detected (correct — it would fight VoiceOver for the audio channel), but nothing replaces it. There is no live region on the bubble and no focus shift, so a blind learner in the single most-used flow has no automatic signal that the tutor responded.
3. **No modal traps VoiceOver focus.** 0 of 13 `<Modal>` files use `accessibilityViewIsModal`; 9 of 13 have no focus management at all.
4. **Form inputs rely on placeholder text or a detached sibling `<Text>` label** rather than `accessibilityLabel` on the input — so once a field is filled (placeholder gone) it announces nothing.

None of these block the app for sighted users; several materially degrade or block it for blind/low-vision learners — which matters more than usual given the minor-learner audience and education-compliance expectations.

---

## [PRE-EXISTING] — CRITICAL

### C1. Streamed tutor messages are never announced to screen-reader users (the core flow)
- **Location:** `components/session/MessageBubble.tsx:232-289` (no live region / role on the AI bubble); `components/session/ChatShell.tsx:413-430` (auto-TTS suppressed under screen reader, with no replacement)
- **WCAG:** 4.1.3 Status Messages; 1.1.1 / 4.1.2 (Name, Role, Value)
- **Issue:** `MessageBubble` renders AI content in a plain `<View>`/`ThemedMarkdown` with **no `accessibilityLiveRegion`, no `accessibilityRole`, and no sender prefix.** When a screen reader is active, `ChatShell`'s auto-TTS effect early-returns (`if (!isVoiceEnabled || screenReaderEnabled) return;`) — correct, to avoid fighting VoiceOver — but nothing announces the new message in its place. There is also no `AccessibilityInfo.announceForAccessibility()` call and no programmatic focus move to the new bubble.
- **User impact:** A blind learner sends a message and receives **silence**. They must manually swipe-explore the screen to discover whether the tutor replied and to find the new text. In the app's single most-used flow, the core interaction is effectively unusable without sighted assistance.
- **Recommendation:** When `screenReaderEnabled`, announce each completed (non-streaming) AI message. On Android set `accessibilityLiveRegion="polite"` on the latest bubble's container; on iOS call `AccessibilityInfo.announceForAccessibility(spokenText)` in the same effect that currently early-returns. Add `accessibilityRole="text"` and a sender-prefixed label to `MessageBubble` so swipe-navigation reads "Tutor: …" / "You: …".
  ```tsx
  // ChatShell — replace the early-return path for screen-reader users:
  useEffect(() => {
    if (!screenReaderEnabled) return;            // TTS path handles the rest
    const last = [...messages].reverse().find(m => m.role === 'assistant' && !m.streaming);
    if (!last || last.id === lastSpokenIdRef.current) return;
    const text = stripEnvelopeJson(last.content).trim();
    if (!text) return;
    lastSpokenIdRef.current = last.id;
    AccessibilityInfo.announceForAccessibility(text);
  }, [messages, screenReaderEnabled]);

  // MessageBubble inner content View:
  <View
    testID="message-ai-content"
    accessibilityRole="text"
    accessibilityLabel={`${isAI ? 'Tutor' : 'You'}: ${displayContent}`}
    {...(Platform.OS === 'android' ? { accessibilityLiveRegion: 'polite' } : {})}
  >
  ```

---

## [PRE-EXISTING] — HIGH

### H1. Quiz answer result (correct / wrong + revealed answer) is not announced
- **Location:** `app/(app)/quiz/play.tsx:946-1001` (result block); feedback `<Text testID="quiz-answer-feedback">` at `:992`
- **WCAG:** 4.1.3 Status Messages
- **Issue:** When an answer is checked, a result block appears (`PolarStar` celebration, "Correct"/"Not quite" text at `:998-1000`, and the revealed correct answer at `:982-988`) but the block carries **no `accessibilityLiveRegion` and triggers no focus shift or `announceForAccessibility`.** Correctness is correctly conveyed by text (not color-only — good), but a screen-reader user isn't told the result occurred.
- **User impact:** A blind learner taps an answer and hears nothing back. They cannot tell if they were right, what the correct answer was, or that a "See results / One more" choice appeared — they must blindly re-explore the screen after every question.
- **Recommendation:** Wrap the result container (`:947`) with `accessibilityLiveRegion="polite"` (Android) and call `AccessibilityInfo.announceForAccessibility()` with a composed string ("Correct! The answer was X" / "Not quite — the answer was X") when `answerState` transitions to `correct`/`wrong`. Optionally move accessibility focus to the result heading.

### H2. Modals do not trap VoiceOver focus (`accessibilityViewIsModal` missing everywhere)
- **Location:** all 13 `<Modal>` files; worst (no focus management at all): `app/(app)/library.tsx`, `app/(app)/more/account.tsx`, `app/(app)/dictation/playback.tsx`, `components/library/TopicPickerSheet.tsx`, `components/nudge/NudgeUnreadModal.tsx`, `components/nudge/NudgeActionSheet.tsx`, `components/common/ProfileSwitcher.tsx`, `components/parent/MetricInfoDot.tsx`, `components/session/SessionModals.tsx`
- **WCAG:** 2.4.3 Focus Order; 1.3.2 Meaningful Sequence
- **Issue:** No modal sets `accessibilityViewIsModal={true}` on its content container. On iOS, VoiceOver can swipe out of the modal into the (still-present) screen behind it. None move accessibility focus into the modal on open, and none restore focus to the triggering control on close. (Android back-dismissal works — `onRequestClose` is wired — and close buttons are labeled, so this is degradation, not a full block.)
- **User impact:** A VoiceOver user opening a sheet (profile switcher, topic picker, nudge list, session parking-lot) may have focus left on the now-obscured background, then swipe through invisible content behind the overlay. Disorienting and easy to operate the wrong control.
- **Recommendation:** Add `accessibilityViewIsModal={true}` to each modal's top content `<View>`. On open, set focus to the modal title with `AccessibilityInfo.setAccessibilityFocus(reactTag)`; on close, restore focus to the opener. Consider a shared `<A11yModal>` wrapper so all 13 sites get this consistently.

### H3. Loading / busy states are not announced (systemic — 31 of 50 `ActivityIndicator` files)
- **Location:** 31 of 50 non-test files using `ActivityIndicator` have no live region or busy state. Notable in core flows: `quiz/play.tsx:1072-1078` ("Scoring round…"), session "thinking" indicator (`ChatShell.tsx:819-826`, `DeskLampAnimation`), various save/submit spinners. (Auth is a good counter-example: `sign-in.tsx:1073` labels its indicator "Signing you in".)
- **WCAG:** 4.1.3 Status Messages
- **Issue:** Spinners render with no `accessibilityLabel`, no `accessibilityState={{ busy: true }}`, and no live-region text. The session "thinking" bubble has `accessibilityLabel="Thinking"` on the *dots* (`MessageBubble.tsx:93`) but the `ChatShell` desk-lamp footer spinner (`:819`) is unlabeled.
- **User impact:** Blind users get no feedback that the app is working after they act (send a message, submit a quiz round, save a profile). The UI appears frozen; they may retry or abandon.
- **Recommendation:** Pair each meaningful spinner with a live-region status (`<View accessibilityLiveRegion="polite"><Text>{loadingMessage}</Text></View>`) and/or `AccessibilityInfo.announceForAccessibility()`. For the chat thinking state, announce "Tutor is thinking" when `showThinking` flips true.

### H4. Confirmation toast is invisible to screen readers
- **Location:** `app/(app)/session/_components/ConfirmationToast.tsx:12-22`
- **WCAG:** 4.1.3 Status Messages
- **Issue:** The toast is a plain `<View>`/`<Text>` with no `accessibilityLiveRegion`/`accessibilityRole="alert"`. Used in the active session for transient confirmations.
- **User impact:** Actions that confirm only via a toast (e.g. "Saved", "Added to library") give a blind user no feedback that the action succeeded.
- **Recommendation:** Add `accessibilityLiveRegion="assertive"` (Android) on the toast container and call `AccessibilityInfo.announceForAccessibility(message)` when it appears. (Pattern already used correctly in `components/common/OfflineBanner.tsx:21` and `FilingFailedBanner.tsx:81`.)

---

## [PRE-EXISTING] — MEDIUM

### M1. Form inputs lack `accessibilityLabel`; visible labels are detached siblings
- **Location:** `app/(auth)/sign-in.tsx:1401-1416` (email), `app/(auth)/sign-up.tsx:595-605` (email); pattern recurs in profile/save-wizard forms. (Password fields are exempt — `PasswordInput.tsx:58` does it correctly.)
- **WCAG:** 1.3.1 Info and Relationships; 4.1.2 Name, Role, Value
- **Issue:** A visible `<Text>Email</Text>` sits above the `<TextInput>`, but in React Native a sibling `<Text>` is **not** programmatically associated with the input (no `htmlFor`/`id` linkage). The input's only accessible name is its `placeholder` ("you@example.com") — which disappears once the user types. A screen reader re-focusing a filled field then announces an unnamed edit field.
- **User impact:** Blind users navigating back through a partially completed form can't tell which field is which once values are entered.
- **Recommendation:** Add `accessibilityLabel="Email"` (etc.) directly to each `TextInput`. Mirror the `PasswordInput` pattern across all auth/profile forms.

### M2. Decorative animations not hidden from screen readers (noise)
- **Location:** `components/AnimatedSplash.tsx`, `components/common/BrandCelebration.tsx` (neither sets `accessible={false}` / `importantForAccessibility="no-hide-descendants"`)
- **WCAG:** 1.1.1 Non-text Content (decorative content should be hidden)
- **Issue:** Per CLAUDE.md, `*Animation`/`*Celebration`/`AnimatedSplash` components should be `accessible={false}` or carry a meaningful label. Most siblings comply (`DeskLampAnimation`, `MagicPenAnimation`, `CheckmarkPopAnimation`, `CelestialCelebration` — which transitively covers `PolarStar`), but `AnimatedSplash` and `BrandCelebration` do not.
- **User impact:** VoiceOver/TalkBack may stop on and verbalize the internal SVG/animated nodes of a purely decorative celebration or splash, adding confusing noise during a celebratory moment.
- **Recommendation:** Add `accessible={false}` (or `importantForAccessibility="no-hide-descendants"` on Android) to the root container of `AnimatedSplash.tsx` and `BrandCelebration.tsx`. If a celebration conveys "Correct!" semantically, instead give the root a single meaningful `accessibilityLabel` and hide descendants.

### M3. Tappables with text children but no `accessibilityRole="button"`
- **Location:** `components/session/ChallengeOfferCard.tsx:26,35,44`; `components/session/DraftedNoteReview.tsx:52,71,80`; `components/guards/RequireFamilyContext.tsx:101,112`; `components/common/GateContent.tsx` (full-bleed `w-full` Pressables)
- **WCAG:** 4.1.2 Name, Role, Value
- **Issue:** These `Pressable`s wrap visible `<Text>`, so RN derives an accessible *name* and they are announced — but without `accessibilityRole="button"` they aren't announced as buttons, and on some configurations the "double-tap to activate" affordance hint is weaker.
- **User impact:** A screen-reader user hears the label (e.g. "Accept challenge") but not that it's an actionable button, reducing confidence/discoverability. (Lower severity precisely because the text label *is* announced.)
- **Recommendation:** Add `accessibilityRole="button"` to each. These are the only 6 tappable-bearing files in the whole tree missing any label/role, so this is a small, finite sweep.

### M4. Escalation-style / verification badges convey state with color + tiny text but no role
- **Location:** `components/session/MessageBubble.tsx:239-256` (escalation banner, color-coded primary/info/success), `:271-277` (verification badge, `text-success` ✓), `:128-168` (ESCALATION_STYLES color map)
- **WCAG:** 1.4.1 Use of Color (partially mitigated); 4.1.2
- **Issue:** The escalation banner pairs color with an icon **and** a text label ("Step-by-step", "Teaching mode") — so it is *not* color-only (good). The wrapping `<View>` carries `accessibilityLabel="Guided response"` (`:242`) but the specific level text isn't part of the bubble's announced content stream in an obvious order, and the verification badge ✓ relies on a 10px `text-success` string. Low-vision users may miss the 10px badge.
- **User impact:** Low-vision learners may not perceive the small green verification badge; the "Guided response" generic label loses the specific escalation level a sighted user sees.
- **Recommendation:** Fold the escalation level label into the bubble's accessible description, and increase the verification badge from `text-[10px]` to a Dynamic-Type-scaling size or add an icon. Keep color as reinforcement, not the sole channel.

---

## [PRE-EXISTING] — LOW

### L1. Decorative leading icons inside labeled banners not hidden
- **Location:** `components/nudge/NudgeBanner.tsx:51` (heart icon inside a labeled Pressable); similar decorative `<Ionicons>` inside labeled rows elsewhere
- **WCAG:** 1.1.1 Non-text Content
- **Issue:** The parent `Pressable` is announced via its `<Text>` children, but the leading `heart-outline` icon is not marked decorative. Minor noise, not a blocker.
- **Recommendation:** Optionally wrap purely decorative leading icons with `accessibilityElementsHidden`/`importantForAccessibility="no"`. Low priority — RN usually skips bare `<Ionicons>` glyphs anyway.

### L2. Tiny 10px text in a few badges/labels
- **Location:** `components/home/CoachBand.tsx:45`, `components/home/SubjectTile.tsx:70`, `components/session/ChatShell.tsx:728,748` (progress/dev labels), `components/session/MessageBubble.tsx:274` (verification badge)
- **WCAG:** 1.4.4 Resize Text (these *do* scale — no `allowFontScaling={false}` — so impact is limited)
- **Issue:** `text-[10px]` is below comfortable minimums for low-vision users; though it scales with Dynamic Type, the small base size compounds in dense UI.
- **Recommendation:** Prefer a semantic caption token (e.g. `text-caption`) over hardcoded `text-[10px]` for any user-facing (non-dev-only) string. ChatShell's are largely dev-only (`__DEV__`) and can be ignored.

---

## Notes / Verification Caveats

- **Documented exceptions respected:** Brand-fixed hex inside `*Animation`/`*Celebration`/`AnimatedSplash`/`MentomateLogo` is allowed per CLAUDE.md and was **not** flagged as a color issue. The semantic-token / persona-unaware rules were honored — color findings (M4) are about color-as-sole-signal, not token usage.
- **`accessibilityLiveRegion` is Android-only.** Several existing usages (consent, offline, outbox banners) cover Android but have **no iOS counterpart** (`announceForAccessibility` is absent app-wide). Any live-region fix above should add the iOS `AccessibilityInfo.announceForAccessibility()` call too, or VoiceOver users still get nothing. This is the single highest-leverage systemic fix.
- **Tooling note:** `rg` returned 0 matches for every query in this environment (an `rtk` proxy wrapper intercepts/breaks it); all counts above were produced with `grep`/`find`/`awk`. Counts are file-level unless stated. Heuristic awk scans (icon-only unlabeled Pressables) can have false negatives across unusual multi-line JSX, but the strong overall labeling rate makes large misses unlikely.
- **Not exhaustively rendered:** contrast (finding M4, L2) was assessed from token/size usage in code, not from rendered pixels; precise ratios were not measured.
