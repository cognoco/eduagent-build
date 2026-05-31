# Mobile l10n + a11y Review — `apps/mobile/src` — Prioritized Summary (2026-05-30)

Coordinator's re-prioritization of the localization-scanner + accessibility-scanner, with
manual verification. Raw: [`localization-scanner.md`](./localization-scanner.md),
[`accessibility-scanner.md`](./accessibility-scanner.md).

**Scope:** path-scoped audit of `apps/mobile/src` (~88 screens). The mobile app was essentially
un-audited before this run. Not a PR diff — all findings [PRE-EXISTING].

**Headline:** both surfaces show prior investment (i18n is live with perfect 7-locale key parity;
static a11y labels exist in ~175/178 files) — but each has a **systemic gap in a layer no guard
covers**: l10n = hardcoded English that never enters `t()`; a11y = dynamic/temporal announcements
(streamed text, results, loading, modals) that screen readers never receive.

---

## P1 — Should fix

### A11Y-C1. Screen-reader users get silence in the most-used flow (streamed tutor replies)
- **Source:** accessibility-scanner (CRITICAL) · **Systemic root verified:** `announceForAccessibility` is used **0 times** app-wide.
- In the active learning session, auto-TTS is (correctly) suppressed under VoiceOver/TalkBack —
  but **nothing replaces it**: no live region, no focus shift, no `announceForAccessibility`. A
  blind learner sends a message and hears nothing back. The product's core loop is unusable with
  a screen reader.
- **Why P1 (the agent's CRITICAL, normalized):** it's a real, total failure of the main flow for
  blind users of a children's-education app — ethically and compliance-relevant — but it's a
  known-cohort accessibility gap, not a crash/breach/data-loss, so P1 not P0 in the cross-domain
  scale. It is the **highest-value mobile fix** because one systemic change fixes four findings.
- **Systemic fix (covers C1 + H1 + H3 + H4):** add an iOS announce path —
  `AccessibilityInfo.announceForAccessibility()` (it appears nowhere today; existing
  `accessibilityLiveRegion` usages are Android-only) — and wire it to: streamed tutor messages,
  quiz answer results, loading/"thinking"/scoring states, and the session-confirmation toast.

### L10N-1. ~358 hardcoded English strings render English to every non-English locale (unguarded class)
- **Source:** localization-scanner · **Verified:** `sign-in.tsx` = **0** `t()` calls; `book/[bookId].tsx` = **47** `<Text>` to **1** `t()`.
- i18n is live and key parity is perfect (all 7 `*.json` = 1906 keys, 0 missing-key defects). The
  entire problem is the documented unguarded gap: **≈358 hardcoded user-visible English sites
  across 59 of ~88 screens** (~383 strings) that never enter `t()`, so the German/Spanish/etc.
  user sees English. Class breakdown: 163 `<Text>` children, **110 `accessibilityLabel=` literals**
  (these are *also* an a11y leak — VoiceOver speaks English to every locale), 35 `label=`,
  12 `placeholder=`, 7 `title=`, 6 `message=`, 25 `platformAlert()` native dialogs.
- **Two screens are systemically un-internationalized**, not incidentally leaky:
  `app/(auth)/sign-in.tsx` (0 `t()` in the whole primary auth screen) and
  `shelf/[subjectId]/book/[bookId].tsx` (~98% hardcoded). Worst by count:
  `session-summary/[sessionId].tsx` (44), `book/[bookId].tsx` (43), `sign-in.tsx` (22),
  `topic/[topicId].tsx` (21), `sign-up.tsx` (19).
- **Why P1:** it silently defeats the entire shipped localization for 6 locales on the screens
  that matter most (auth is the first thing a non-English user sees). The count is a *floor*
  (single-word / lowercase-leading leaks undercounted).
- **Fix:** route strings through `t()` + add keys, **auth-first** remediation order; **land the
  Phase 3 JSX-literal ratchet** CLAUDE.md already specifies so the gap stops growing. The 110
  hardcoded `accessibilityLabel`s should be fixed in the same pass (kills an l10n *and* an a11y
  defect at once).

---

## P2 — Worth noting

### Accessibility (dynamic layer — same systemic root as C1)
- **H1** quiz answer results (correct/wrong + revealed answer) not announced. *(folded into the announce-path fix)*
- **H2** **0 of 13 modals** use `accessibilityViewIsModal` (verified); 9/13 have no focus
  management → VoiceOver wanders behind the overlay. Add `accessibilityViewIsModal` + focus-on-open.
- **H3** loading/busy states unannounced in 31/50 `ActivityIndicator` files (incl. session
  "thinking", quiz scoring). *(announce-path fix)*
- **H4** session-confirmation toast invisible to screen readers. *(announce-path fix)*
- **M1–M4 / L1–L2** form inputs rely on placeholder/detached `Text` instead of
  `accessibilityLabel`; `AnimatedSplash` + `BrandCelebration` not marked `accessible={false}`
  (screen-reader noise); 6 text-`Pressable`s miss `accessibilityRole="button"`; small verification
  badge + 10px labels.

### Localization
- **29 manual-pluralization sites** (`count === 1 ? 'word' : 'words'`) — doubly broken: hardcoded
  English **and** a binary plural model that's wrong for Polish (3 forms). Use i18next plurals.
- **4 `toLocaleDateString('en-US', …)` hardcodes** (incl. `format-note-source.ts`, which also
  hardcodes the "From session ·" byline). Use `undefined`/`i18n.language` like the ~31 correct sites.

---

## Verified clean (defenses working)

- **a11y:** NOT an unlabeled app — `accessibilityLabel`/`Role` in ~175/178 files; **zero**
  unlabeled icon-only `Pressable`s (the worst RN offender); back/send/mic/close/password-eye
  consistently labeled; quiz options use `accessibilityState`; correctness uses text not
  color-only; `allowFontScaling={false}` appears nowhere (Dynamic Type respected app-wide).
  Documented CLAUDE.md exceptions (brand hex in `*Animation`/`*Celebration`, semantic tokens)
  respected, not misflagged.
- **l10n:** perfect 7-locale key parity (1906 keys each); **0** ellipsis-interpolation fallbacks;
  **0** concatenated-`t()` fragments; no `Alert.alert` literals (app uses `platformAlert`);
  intentional conversation-vs-UI language divergence correctly NOT flagged; ~31 date formatters
  correctly locale-aware.

## Cross-finding note
The **110 hardcoded `accessibilityLabel` literals** sit in BOTH agents' findings — they leak
English to screen readers (a11y) *and* bypass i18n (l10n). Fix once, in the auth-first `t()` pass.

## Tooling caveat
Both agents: shell `rg` is shadowed by an RTK hook mapping it to BSD grep; both used the real
binary (`/opt/homebrew/bin/rg`). Coordinator re-verified the four headline claims with it.

## Severity summary (agent scale)
a11y: 1 critical / 4 high / 4 medium / 2 low · l10n: ~358 hardcoded-literal sites + 29 plural + 4 date
