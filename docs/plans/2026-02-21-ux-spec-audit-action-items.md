# UX Spec Audit — Action Items

**Date:** 2026-02-21
**Source:** 4-agent parallel audit of all mobile screens, components, and design system against `docs/ux-design-specification.md`
**Branch:** `feat/tier2-production-readiness`
**Scope:** 40+ screen files across `(auth)/`, `(learner)/`, `(parent)/`, root routes, plus shared components and design tokens

---

## Executive Summary

The backend is production-ready (900+ unit tests, 7 integration tests, all passing). The mobile UI has correct route structure and navigation, but significant gaps remain between the UX spec's coaching-first vision and what users actually see. The highest-ROI fixes are **wiring components that already exist but aren't used** (AdaptiveEntryCard, SessionCloseSummary) and **fixing data display issues** (UUID topic names, missing time data).

**Counts:** 15 Critical, 23 Medium, 14 Low, 3 Cosmetic gaps across 4 audit streams.

---

## CRITICAL Gaps (15 unique)

| ID | Gap | Screen/Flow | Notes |
|----|-----|-------------|-------|
| C1 | No first-time profile creation funnel — new users land on home with no profile | Root redirect + Sign-up | Breaks the "download to first interaction" journey |
| C2 | Child's first entry missing three-button card ("Homework help" / "Practice for a test" / "Just ask something") | Home screen | Centerpiece of Journey 1 step 4 |
| C3 | Parent setup path entirely missing (simulated dashboard, homework integrity explanation, hand-to-child flow) | Missing screens | Spec highlights this as critical for parent trust |
| C4 | Coaching card not AI-driven or context-aware — no time-of-day, homework prediction, retention-based recommendations. `AdaptiveEntryCard` exists but is never used | Home screen | Core "proactive coach" experience absent |
| C5 | Subject Retention Strip absent — no horizontal strip with fill bars for eager learner | Home screen | Defines the eager learner home experience |
| C6 | `SessionCloseSummary` component unused — built correctly (takeaways, bridge, next check-in) but session-summary screen shows exchange count + escalation rung instead | Session summary | Component exists, just not wired |
| C7 | No mode-specific chat wrappers — homework, practice, freeform use identical ChatShell. No math rendering, no session timers, no Parallel Example styling | Session screen | Session quality and differentiation |
| C8 | Homework requires pre-selecting a subject — spec says camera-first with AI auto-detection | Homework flow | Contradicts "Speed is Survival" principle directly |
| C9 | Three entry points not explicit — no "Practice for a test" button, homework tied to subject selection | Home screen | Core navigation pattern |
| C10 | No recall-after-win or bridge prompt in the actual flow (component exists, not wired) | Session close | "Invisible Bridge" — documented as Story 2.13 for next sprint |
| C11 | Time (hours/minutes) not displayed in parent dashboard — API returns it, UI omits it | Parent dashboard | Dual signal needed to catch session-gaming |
| C12 | Topic cards not tappable in parent subject view — drill-down chain broken at topic level | Parent subject detail | |
| C13 | No session transcript view for parents — the primary homework-integrity trust mechanism is absent | Missing screen | **See escalation note below** |
| C14 | Topic names show truncated UUIDs ("Topic a3f4b2c1") instead of real names in Learning Book | Learning Book | Visible in screenshots, demos, user testing |
| C15 | Compact RetentionSignal is color-only — no text, no accessibilityLabel. Violates spec's "NEVER color alone" non-negotiable | RetentionSignal component | One-line fix |

### Escalated to CRITICAL (was Medium)

| ID | Gap | Reason for Escalation |
|----|-----|-----------------------|
| **C16** | **Child sees full app while parental consent is pending** (was M4) | **COPPA/GDPR compliance issue**, not just UX. A child in EU aged 11-15 or US aged 11-12 accessing the full application before parental consent is approved is regulatory exposure. Must be a gated state. "Auth flow works" and "auth flow is compliant" are not the same thing. |

**Updated CRITICAL count: 16**

---

## MEDIUM Gaps (22 items, after M4 escalation)

### Auth & Onboarding
| ID | Gap |
|----|-----|
| M1 | Sign-up screen missing Google/Apple SSO buttons (only present on sign-in) |
| M2 | Birthdate is optional text input, not a required date picker for persona auto-detection |
| M3 | Persona type manually selected instead of auto-detected from age |
| M5 | No post-sign-up profile creation redirect |
| M6 | No cold-start coaching voice progression (sessions 1-5) |

### Learner Experience
| M7 | Homework camera: no subject auto-detection (receives subjectId from home) |
| M8 | Camera preview shows placeholder gray box, not actual captured photo |
| M9 | Parallel Example has no visual distinction from regular chat (Phase 2 visual absent) |

### Parent Dashboard & Learning Book
| M10 | Guided ratio computed but not displayed as dedicated visual signal (text summary includes it) |
| M11 | Retention trend direction (improving/declining) missing — only session-count trend |
| M12 | No per-subject session count in child detail cards |
| M13 | Missing "last practiced" date in Learning Book entries |
| M14 | Missing session count per topic in Learning Book |
| M15 | No ProfileSwitcher component (uses modal route instead) |
| M16 | Parent More screen shares learner More screen (shows Learning Mode toggle — a learner-only concept) |
| M17 | No session history section in topic detail |

### Design System & Components
| M18 | No shared `Button` component — every screen reimplements Pressable styling |
| M19 | Card padding not tokenized — no persona-adaptive density |
| M20 | Inter font not loaded — uses system default instead |
| M21 | No inline math rendering (`react-native-math-view` or KaTeX) |
| M22 | No animations at all — no Reanimated usage, no coaching card transitions, no crossfades |
| M23 | Borderline WCAG AA contrast on learner/parent secondary text (4.4:1 / 4.6:1) |

---

## LOW Gaps (14 items)

| ID | Gap |
|----|-----|
| L1 | Country field missing (only region EU/US/Other) |
| L2 | Theme not applied immediately during profile creation |
| L3 | No specific post-first-session UX messaging |
| L4 | Hardcoded 3-subject limit in Learning Book |
| L5 | Assessment is standalone screen rather than integrated into session chat |
| L6 | Appearance section exposes persona themes directly to all users |
| L7 | `--color-homework-lane` token missing from design tokens |
| L8 | Font size tokens not persona-switchable |
| L9 | Teen light=dark (intentional but no user override option) |
| L10 | Button labels not consistently conversational (app-like vs coach-like) |
| L11 | No ProfileSwitcher in top bar (uses modal) |
| L12 | No reduced-motion support (moot until animations added) |
| L13 | No `accessibilityHint` on interactive elements |
| L14 | No Dashboard variant of RetentionSignal with trend arrow |

---

## COSMETIC (3 items)

| ID | Gap |
|----|-----|
| X1 | Interview opening message wording differs from spec |
| X2 | Orphaned `DashboardCard` component (dead code, unused) |
| X3 | Tab icons are Unicode placeholders (●/◆/≡), not design-system icons |

---

## Component Inventory

### Built (12 of 27)

BaseCoachingCard, CoachingCard, AdaptiveEntryCard **(unused!)**, ParentDashboardSummary, SessionCloseSummary **(unused!)**, ChatShell, MessageBubble, RetentionSignal, DashboardCard **(orphaned)**, PasswordInput, ErrorBoundary, UsageMeter

### Missing (15 of 27)

SubjectRetentionStrip, HomeworkChatWrapper, PracticeChatWrapper, FreeformChatWrapper, TopicCard, LearningBookEntry, RecallChallenge, XPMeter, StreakIndicator, InputMethodPicker, SubscriptionGate, ErrorRecovery, ProfileSwitcher, ParallelExampleView, HomeworkCamera (as reusable component)

---

## What's Working Well

- Design token architecture: 3 personas x 2 color schemes, CSS variable pipeline, Tailwind integration
- Dark mode: fully wired (fixed this session)
- Confidence scoring: aggregates real data from sessionEvents (fixed this session)
- BaseCoachingCard hierarchy: all 4 variants built correctly
- Auth flow: sign-in, SSO, forgot password, consent, delete account
- Navigation: 3 tabs per persona, nav hidden in sessions, auth guards
- Skeleton loading states on dashboard and key screens
- Profile switching functional via modal
- Curriculum review: skip, challenge, start-learning all present
- Session streaming: SSE + token-by-token reveal
- Backend: 900+ unit tests + 7 integration tests, all passing

---

## Implementation Tiers

### Tier 1: Wire What Exists + Quick Fixes (Highest ROI) — COMPLETED

Fixes that connect already-built components to their screens, or fix data display bugs. Minimal new code, maximum visible impact. **Do these before anyone outside the team sees the product.**

| Priority | ID | Action | Effort | Status |
|----------|-----|--------|--------|--------|
| 1 | C14 | **Fix topic names in Learning Book** — return real names from retention API instead of UUIDs. | S | DONE — `retention-data.ts` returns `topicTitle` from `curriculumTopics.title`; `book/index.tsx` uses it |
| 2 | C16 | **Gate app access when consent is pending** — COPPA/GDPR compliance. | M | DONE — `ConsentPendingGate` in `(learner)/_layout.tsx` blocks access when `consentStatus` is PENDING/PARENTAL_CONSENT_REQUESTED. `consentStatus` added to Profile schema. |
| 3 | C4, C2 | **Wire `AdaptiveEntryCard` into home screen** — three-button entry for teen persona. | M | DONE — `home.tsx` renders `AdaptiveEntryCard` for teen persona with "Homework help" / "Practice for a test" / "Just ask something" actions |
| 4 | C6, C10 | **Wire `SessionCloseSummary` into session-summary screen** — takeaways pattern replaces internal metrics. | M | DONE — `session-summary/[sessionId].tsx` shows learner-friendly takeaways (bullet list), removed escalation rung labels |
| 5 | C15 | **Fix compact RetentionSignal** — accessibility fix. | XS | DONE — `accessibilityLabel` + `accessibilityRole="text"` added to `RetentionSignal.tsx` |
| 6 | C11 | **Display time in parent dashboard** — dual signal (sessions + time). | S | DONE — `ParentDashboardSummary.tsx` accepts `totalTimeThisWeek`/`totalTimeLastWeek`, formats as "Xh Ym", `dashboard.tsx` passes data through |

### Tier 2: Missing Screens & Core Flows — COMPLETED

New screens and flows that the spec requires and no workaround exists for.

| Priority | ID | Action | Effort | Status |
|----------|-----|--------|--------|--------|
| 1 | C13 | **Build parent session transcript view** — full conversation history with "Guided" markers on rung >= 3 exchanges. | L | DONE — `getChildSessions()` + `getChildSessionTranscript()` in dashboard service, 2 new API endpoints, transcript screen at `/(parent)/child/[profileId]/session/[sessionId].tsx`, 8 new tests (38 total dashboard tests) |
| 2 | C8 | **Homework camera-first flow** — camera opens without subject. Subject picker appears inline after OCR. | L | DONE — `subjectId`/`subjectName` params optional in camera.tsx, inline subject picker in result phase, backward-compatible when subject pre-provided |
| 3 | C1, M5 | **First-time user funnel** — empty subjects → redirect to onboarding. | M | DONE — `home.tsx` detects empty subjects on first load, redirects to `/create-subject` → interview → curriculum-review → "Start learning" or "Explore first" |
| 4 | C12 | **Make topic cards tappable** in parent subject view. | S | DONE — `<View>` → `<Pressable>` in `[subjectId].tsx`, new topic detail screen at `/(parent)/child/[profileId]/topic/[topicId].tsx` |
| 5 | C3 | **Parent setup simulated dashboard** — demo mode with preview banner + CTA. | L | DONE — `useDashboard` hook already had demo fallback; added DemoBanner, explanatory subtitle, "Link your child's account" CTA in `dashboard.tsx` |
| 6 | C5 | **Subject Retention Strip** — horizontal scrollable chip strip. | M | DONE — Horizontal ScrollView with retention chips between coaching card and subjects list in `home.tsx` |
| 7 | C9 | **Three-button entry for children** | M | DONE — Completed in Tier 1 as part of C4/C2 (AdaptiveEntryCard wiring) |

### Tier 3: Session & Chat Quality — COMPLETED

Mode-specific experience and content rendering that differentiates EduAgent from a generic chat wrapper.

| Priority | ID | Action | Effort | Status |
|----------|-----|--------|--------|--------|
| 1 | C7 | **Mode-specific chat wrappers** — Config-driven mode differentiation (subtitles, placeholders, timer, question counter). | L | DONE — `sessionModeConfig.ts` with per-mode config, `SessionTimer` for practice, `QuestionCounter` for homework, `placeholder` prop added to ChatShell |
| 2 | M21 | **Inline math rendering** — LaTeX-to-Unicode formatter (zero-dependency). | M | DONE — `math-format.ts` covers superscripts, subscripts, fractions, symbols, Greek letters. 38 unit tests. Applied to AI messages in MessageBubble |
| 3 | M6 | **Cold-start coaching voice** — sessions 1-5 progressively warmer greetings. | S | DONE — `getOpeningMessage()` in sessionModeConfig, 4 tiers: first session (welcoming) → early (building familiarity) → familiar (casual) → veteran (brief) |
| 4 | M9 | **Parallel Example visual treatment** — guided message styling. | M | DONE — `escalationRung` on ChatMessage, MessageBubble renders `bg-primary-soft` + accent border + label ("Step-by-step" / "Let me show you" / "Teaching mode") for rung >= 3 |
| 5 | M22 | **Animation system** — Reanimated animations. | L | DONE — Reanimated already installed (v4.1.6). `AnimatedEntry` (fade+slide) and `AnimatedFade` wrappers. Staggered cascade on home screen. Slide-in on message bubbles |

### Tier 4: Polish & Completeness — COMPLETED

Items that improve quality but don't block core flows.

| Priority | ID | Action | Effort | Status |
|----------|-----|--------|--------|--------|
| 1 | M18 | **Shared Button component** — primary/secondary/tertiary variants with loading + disabled states | M | DONE — `Button.tsx` in common components, exported from barrel |
| 2 | M20 | **Load Inter font** — 4 weights loaded via expo-font + SplashScreen | S | DONE — Inter 400/500/600/700, tailwind fontFamily mapped, FOUT prevented |
| 3 | M1 | **SSO buttons on sign-up screen** — Google + Apple (iOS only) | S | DONE — Same `useSSO` pattern as sign-in, "or continue with email" divider |
| 4 | M2, M3 | **Birthdate date picker + persona auto-detection** | M | DONE — Native date picker (iOS modal, Android dialog), `detectPersona()` auto-sets TEEN/LEARNER/PARENT from age, birthdate now required |
| 5 | M16 | **Separate parent More screen** — removed Learning Mode toggle, added Family section | S | DONE — Dedicated `(parent)/more.tsx` replacing re-export |
| 6 | M23 | **WCAG contrast audit** — secondary text darkened to pass AA | S | DONE — Learner `#78716c`→`#6b6560` (4.8:1), Parent `#64748b`→`#5c6b82` (5.0:1) |
| 7 | X3 | **Replace Unicode tab icons** with Ionicons | S | DONE — Both learner + parent layouts use `@expo/vector-icons` Ionicons |
| 8 | M13, M14 | **Learning Book enrichment** — last-practiced + session count | M | DONE — `lastReviewedAt` exposed from API, `repetitions` used as session count, "X days ago" display |
| 9 | M15 | **ProfileSwitcher in top bar** — inline dropdown with backdrop | M | DONE — Absolute-positioned dropdown, returns null for single profile, 11 tests |
| 10 | M17 | **Session history in topic detail** — past sessions linked to transcript | M | DONE — Client-side filter of `useChildSessions` by topicId, tappable → transcript |
| 11 | M11 | **Retention trend direction** — snapshot heuristic (strong vs weak+fading) | L | DONE — `calculateRetentionTrend()` in dashboard service, badge in ParentDashboardSummary, 6 new tests |
| 12 | M19 | **Tokenize card padding** — persona-adaptive (teen 20px, learner 16px, parent 14px) | S | DONE — `--spacing-card-padding` CSS variable, `p-card` utility class |

---

## Effort Key

| Size | Meaning |
|------|---------|
| XS | < 1 hour. One-line fix or config change. |
| S | 1-3 hours. Single file change, straightforward. |
| M | Half day to full day. Multiple files, some design decisions. |
| L | 1-3 days. New screen/component, API changes, testing. |

---

## Cross-Cutting Concerns

### Compliance (act on immediately)
- **C16 (consent gating)** is not a UX polish item — it's a regulatory requirement. COPPA and GDPR mandate that data processing for minors requires verifiable parental consent BEFORE the service is used. The current flow allows full app access while consent is pending. This must be gated regardless of sprint priority.

### Unused Components (quick wins)
- `AdaptiveEntryCard` and `SessionCloseSummary` were built to spec but never integrated. Wiring them is the single highest-ROI action — the components match the spec exactly, they just need to replace the current implementations on their respective screens.

### Data Display (trust signals)
- UUID topic names (C14) and missing time data (C11) are the most visible "unfinished" signals. Both are trivial API-side fixes with large perceptual impact.

### Parent Value Proposition
- The parent experience has the most critical gaps relative to the spec's vision. The "5-second glance" dashboard works but is incomplete (no time, no transcript drill-down). The transcript view (C13) is the spec's primary trust mechanism — it's what converts "trust us" into "see for yourself." Prioritize parent screens after Tier 1 quick fixes.
