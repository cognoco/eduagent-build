# V2 Shell Redesign — Codebase Anchors

**Status:** Reference · 2026-06-10 · for the Mentor-Is-The-App shell redesign (`docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md`)
**Scope:** READ-ONLY recon of the CURRENT code the V2 shell strangles. This is the anchor map the S1/S2/S3/S4/S6 mobile plans cite so each downstream plan references REAL files + line anchors instead of inventing them.
**Honor:** §7 hard constraint — all current flag states must not regress: the flags-off legacy guardian 5-tab fallback, the current production V0-on/V1-off mode shells (`apps/mobile/eas.json` sets `EXPO_PUBLIC_ENABLE_MODE_NAV=true` in production), and V1 preview/staging. V2 rides its own flag alongside V0/V1, mirroring the V1 staging pattern, until S6 executes the §13.1 retirement ruling.

> All paths are repo-relative from the monorepo root. Expo Router root is `apps/mobile/src/app/`. Line anchors verified 2026-06-10 against the working tree on the checked-out branch.
>
> **Updated 2026-06-10 for spec amendment** (reward-system anchors, streak/rhythm display anchor, voice/mic input anchor — see §6). **Amended 2026-06-13:** XP/practice points and reflection bonus are retained as earned private learning receipts; only coercive presentation / fragile coupling is removed.

> **Verified audit amendments (2026-06-13).** This anchor map has a few volatile line anchors; prefer symbol anchors when executing. Current branch verification found: `_layout.tsx` mounts `<ModeSwitcher />` around `:614` and the OTA nav env block is around `.github/workflows/ci.yml:397-398`; `ModeSwitcher` will still render under V1+V2 unless S1 explicitly suppresses it with `!FEATURE_FLAGS.MODE_NAV_V2_ENABLED`; S0 `/now` and `mentor_activity_ledger` are already landed in code; and mobile currently defines local `NetworkError`/`UpstreamError` classes, so schema `instanceof` is not a universal truth for transport errors until that refactor lands.

---

## 1. Surface anchor map (file → disposition)

**Disposition legend:** `keep` = survives untouched · `reuse` = shared infra downstream MUST consume, not reinvent · `merge-into-S?` = folds into a phase's new surface · `replace-by-S?` = a phase's new surface supersedes it · `strangle-target` = explicitly dies at §7/S6 (kept flag-isolated until then).

### Navigation & flags (the strangle chassis)

| File | Anchor | What it is | Disposition |
|---|---|---|---|
| `apps/mobile/src/lib/feature-flags.ts` | `:30-31` | `MODE_NAV_V0_ENABLED` (from `EXPO_PUBLIC_ENABLE_MODE_NAV`) / `MODE_NAV_V1_ENABLED` (from `..._V1`). Plain `process.env === 'true'` reads. | reuse (add V2 flag here, §2) |
| `apps/mobile/src/lib/navigation-contract.ts` | `resolveNavigationContract` `:244-508`; tab sets `STUDY_TABS`/`FAMILY_TABS`/`PROXY_TABS`/`LEGACY_GUARDIAN_TABS` `:145-168`; `home.screen` branch `:376-386`; `legacyV0ModeNavActive` `:257-259` | V1 nav contract — tab visibility + `isOwner`/family gates + `canEnter`/`isSurfaced` route guards. | strangle-target (S4 — chip scopes replace shape matrix); keep behind flags until S6 |
| `apps/mobile/src/lib/legacy-navigation-contract.ts` | `resolveTabShape` `:62-77`; `computeModeVisibleTabs` `:93-97`; `resolveShellVisibleTabs` `:151-183` | V0/legacy tab-shape + mode-tab helpers (5-tab guardian, 3/4-tab Study/Family). The flags-off + V0-on production path. | strangle-target (S6 retirement ruling, §13); **must-not-regress floor** until then |
| `apps/mobile/src/hooks/use-navigation-contract.ts` | `useNavigationShellContract` `:142-189`; `useNavigationContract` `:115-122`; `useNavigationHomeContract` `:191-208` | Hooks that wire profile/subscription/proxy/role into the contract + pick V0-vs-V1 path via flags. | extend (S4 adds a V2 branch); shell reads `visibleTabs` from here |
| `apps/mobile/src/app/(app)/_layout.tsx` | `AppLayout` `:136`; `<Tabs>` whitelist around `:612-749`; `FULL_SCREEN_ROUTES` `:60-70`; `HIDDEN_TAB_ROUTES` `:83-100`; gate ordering around `:493-583`; `<ModeSwitcher/>` mount now around `:614` | The Tabs navigator + the whole signed-in gate stack (auth → preview wizard → consent → tabs). Whitelist tab pattern: only `visibleTabs.has(route.name)` renders a tab. | strangle-target shell (S1 mounts V2 as a parallel tab set behind the flag; §2). Gate stack above tabs = keep |
| `apps/mobile/src/lib/app-context.tsx` | `familyCapable` `:60-68`; `derivedMode` `:70-80`; `setMode` `:99-171`; flags-off short-circuits `:64,77,152` | `AppMode` (`study`/`family`) provider + ModeSwitcher backing state. Returns `mode: null` when both flags off. | strangle-target (S4/S7 — ModeSwitcher + proxy die); keep until S6 |
| `apps/mobile/src/components/chrome/ModeSwitcher.tsx` | (file) | The Study/Family global-header switcher. | strangle-target (§7 — replaced by scope chip, S4) |
| `apps/mobile/eas.json` | prod `:11-15` (V0=true only); dev `:21-26` + preview `:37-42` (V0+V1=true) | Build-profile env that sets the nav flags per environment. | reuse (add V2 flag to dev/preview, §2) |
| `.github/workflows/ci.yml` | OTA env now around `:397-398` | Preview-channel OTA duplicates `EXPO_PUBLIC_ENABLE_MODE_NAV(_V1)` because `eas update` ignores build-profile env. | reuse (add V2 flag here for staging OTA, §2) |

### S1 — Mentor home surfaces

| File | Anchor | What it is | Disposition |
|---|---|---|---|
| `apps/mobile/src/app/(app)/home.tsx` | `HomeScreen` `:17`; branch `:161-169` (`navigationContract.home.screen === 'FamilyHome' ? ParentHomeScreen : LearnerScreen`) | The `home` tab route. Renders Parent vs Learner home off the contract. **App-open landing today.** | replace-by-S1 (new Mentor card-feed home behind V2 flag); branch logic dies with the contract at S4 |
| `apps/mobile/src/components/home/LearnerScreen.tsx` | `HOME_INTENT_ACTIONS` `:70-100`; `CoachBand` use `:309-419`; intent-action grid `:582-634`; subject carousel `:636-688` | Today's learner home: greeting + CoachBand (resume/review/quiz nudge) + 4 intent cards (homework/ask-anything/practice/study-new) + subject carousel + My Notes entry. **Closest existing thing to the `/now` feed** — CoachBand is a single-card next-action; intent cards are the bar's heirs. | merge-into-S1 (CoachBand → `/now` card; homework/ask-anything intents → the bar's camera + Homework chip) |
| `apps/mobile/src/components/home/CoachBand.tsx` | (file); used `LearnerScreen.tsx:567` | Single dismissable "recommended next" card (resume session / relearn / quiz discovery). | reuse/merge-into-S1 (template for a `/now` card) |
| `apps/mobile/src/components/home/ParentHomeScreen.tsx` | (file); rendered `home.tsx:162` | The Family/Parent home surface (child briefings). | strangle-target (§7 — heir is the Support-hub Mentor feed, S4) |
| `apps/mobile/src/app/(app)/session/index.tsx` | imports `:1-120`; `ChatShell` `:21-27`; `useStreamMessage`/`useStartSession`/`useCloseSession` `:30-42`; parking-lot hooks `:41-42` | The conversation screen + input/streaming spine. Where the bar lands. Full-screen route (tab bar hidden). | keep (the bar opens this); reuse for the Mentor-tab conversation moment |
| `apps/mobile/src/app/(app)/homework/camera.tsx` | `:1-50` (CameraView, ImagePicker, OCR, classify-subject) | Homework session entry: photo upload → OCR → `help_me`/`check_answer` problem cards. First-class world-known entry. | keep/reuse (the camera + Homework chip wire here — §3 first-class affordance) |
| `apps/mobile/src/app/(app)/dictation/*` | dir | Dictation-homework session mode. | keep |
| `apps/mobile/src/app/(app)/practice/*` | dir | Practice/assessment entry (one of today's 4 intent cards). | keep (reachable via feed/bar) |

### S2 — Subject hub surfaces

| File | Anchor | What it is | Disposition |
|---|---|---|---|
| `apps/mobile/src/app/(app)/shelf/[subjectId]/index.tsx` | `ShelfScreen` `:25`; aggregate progress `:204-215`; book list `:429`; study-next suggestions `:404-424` | The shelf: books for a subject + aggregate topic progress bar + book suggestions. | merge-into-S2 (shelf + progress merge into one hub, §5) |
| `apps/mobile/src/app/(app)/shelf/[subjectId]/_layout.tsx` | `unstable_settings` `:8-10`; `book/[bookId]` getId `:22-25` | Nested stack seeding `index` for cross-stack deep-push safety (the repo guardrail). | keep/reuse (the `shelf→book→chapter→topic` chain pattern; honor §8.1 ancestor-chain deep links) |
| `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx` | (file) + `_view-models/book-derived-state.ts`, `book-sticky-cta.ts` | Book detail → chapters/topics. | merge-into-S2 (hub max-depth-2 chapter sections, §5.2) |
| `apps/mobile/src/app/(app)/progress/[subjectId]/index.tsx` | (file); layout `_layout.tsx:12-14` `unstable_settings`, `sessions` child `:27` | Per-subject progress overview (topic mastery, sessions). **The `progress/[subjectId]` half the hub absorbs.** | merge-into-S2 (the spec's explicit "shelf + `progress/[subjectId]` merge") |
| `apps/mobile/src/app/(app)/progress/index.tsx` | (file) + `_components/` (LatestReportCard, ProgressStatsChips, RecentFocusCard) | The Progress tab root (self/children scope). | strangle-target / merge-into-S2 (per-subject content → hub; family scope → S4 chip) |
| `apps/mobile/src/app/(app)/subject/[subjectId].tsx` | (file); opened from `shelf` settings `index.tsx:385-390` | Subject settings (rename/archive/delete). | keep (subject-scoped admin; reachable from hub) |
| `apps/mobile/src/app/(app)/topic/[topicId].tsx`, `topic/index.tsx`, `topic/relearn.tsx` | dir | Topic detail + relearn. | merge-into-S2 (topic detail = sheet over hub, §5.3) |
| `apps/mobile/src/app/(app)/library.tsx` | `LibraryScreen` `:1-45`; `LibrarySearchBar` `:44` | The Library tab (cross-subject shelf browser + search). | strangle-target (§7 — tab dies; **browse survives** as a Journal cross-subject archive, EU-6) |
| `apps/mobile/src/components/library/*` (BookCard, SuggestionCard, ShelfRow, LibrarySearchBar) | dir | Reusable library UI primitives. | reuse (in the S2 hub + the Journal archive) |
| `apps/mobile/src/app/(app)/pick-book/[subjectId].tsx` | (file) | Book-picker flow. | keep (reached from hub) |

### S3 — Journal tab + avatar admin surfaces

| File | Anchor | What it is | Disposition |
|---|---|---|---|
| `apps/mobile/src/app/(app)/more/index.tsx` | `MoreScreen` `:35`; settings rows `:126-225`; sign-out `:231-284`; add-child gate `:160` | The More tab (settings/account/notifications/privacy/help/family). | strangle-target (§7 — dissolves; admin moves behind avatar, S3) |
| `apps/mobile/src/app/(app)/more/account.tsx` | (file) | Billing/subscription + account security + mentor-language (owner-gated). | merge-into-S3 (moves behind avatar → account sheet) |
| `apps/mobile/src/app/(app)/more/privacy.tsx` | (file) | Export/delete account + privacy/GDPR (owner-gated). | merge-into-S3 (avatar → privacy; rights-exercise, §6.1) |
| `apps/mobile/src/app/(app)/more/{notifications,accommodation,celebrations,help,security-sessions}.tsx` | dir | Settings sub-screens. | merge-into-S3 (avatar admin sheet) |
| `apps/mobile/src/app/(app)/recaps/index.tsx` | `RecapsScreen` `:15`; `canEnter('recaps')` gate `:22-24`; `[recapId].tsx` | The recaps archive (V1 family-tab surface). | merge-into-S3 (Journal = recaps + notes + mentor memory, §3) |
| `apps/mobile/src/app/(app)/my-notes/index.tsx` | `HUB_ITEMS` `:23-47` (sessions/notes/bookmarks) | The "My Notes" hub — sessions, notes, bookmarks. The You-tab-ish cross-subject notes surface. | merge-into-S3 (cross-subject notes view in Journal, §5.4; "one store two views") |
| `apps/mobile/src/app/(app)/my-notes/[kind].tsx` | (file) | Notes/bookmarks/sessions list by kind. | merge-into-S3 |
| `apps/mobile/src/app/(app)/mentor-memory.tsx` | (file); also `child/[profileId]/mentor-memory.tsx` | Mentor-memory surface ("what the mentor knows about me"). | merge-into-S3 (Journal mentor-memory column, §6.3) |
| `apps/mobile/src/app/session-summary/[sessionId].tsx` | `:1-60`; `useSkipSummary`/`useSubmitSummary`/`useRecallBridge` `:30-36`; summary-draft `:46-50` | The post-session **exit funnel** screen (reflection → summary → filing). | strangle-target (§7/S6 — dissolves into mentor wrap-up turn, **only after** P3 park-and-return eval coverage exists **and** the V2 wrap-up heir preserves learner-written "Your Words", filing/mentor-memory handoff, and the visible 1.5x reflection receipt) |
| `apps/mobile/src/app/session-transcript/[sessionId].tsx` | (file) | Archived transcript viewer. | keep (deep-linkable artifact) |
| `apps/mobile/src/app/(app)/child/[profileId]/*` | dir (index, reports, curriculum, session, subjects, topic, mentor-memory, weekly-report) | The parent→child supporter surfaces (V1 family-child routes). | strangle-target (§7 — replaced by chip person-scopes, S4/S5); structural rendering reuses these read shapes server-masked |

### Shared infra to REUSE (downstream must not reinvent)

| File | Anchor | What it is | Disposition |
|---|---|---|---|
| `apps/mobile/src/components/common/ErrorFallback.tsx` | `ErrorFallback` `:30`; `variant` `'card'`/`'centered'` `:26`; primary/secondary action shape `:4-10` | The standard error fallback (title/message/primary-retry/secondary-back). | reuse (every V2 failure-mode row in spec §14 maps to this) |
| `apps/mobile/src/components/common/TimeoutLoader.tsx` | `TimeoutLoader` `:38`; default `timeoutMs=15000` `:15` | Spinner with timeout → `ErrorFallback`. | reuse (feed/hub/scope loading states) |
| `apps/mobile/src/components/common/index.ts` | `:9,23` | Barrel: `ErrorFallback`, `TimeoutLoader` exported here. | reuse (import path: `'../../components/common'`) |
| `packages/schemas/src/errors.ts` | `ForbiddenError` `:32`; `ResourceGoneError` `:269`; `QuotaExceededError` `:256`; `UnauthorizedError` `:62`; `NetworkError` `:369`; `UpstreamError` `:384`; `RateLimitedError` `:111`; `ConsentRequiredError` `:131`; `NotFoundError`/`ConflictError`/`BadRequestError`; `ERROR_CODES` `:399`; `apiErrorSchema` `:532` | The shared typed-error hierarchy (thrown API-side, caught mobile-side via cross-package `instanceof`). | reuse (single source of truth; do NOT add a parallel mobile copy) |
| `apps/mobile/src/lib/api-errors.ts` | re-exports `:14-40`; `fetchOrThrowNetworkError` `:72` | Re-exports schema errors (no React deps) + the bare-fetch network wrapper. | reuse |
| `apps/mobile/src/lib/api-client.ts` | `customFetch` classification `:185-370`; status→error map (401`:234`, 402`:285`, 403`:305`, 404`:312`, 409`:318`, 410`:336`, 429`:344`, 5xx`:362`); `hc<AppType>` `:372`; single-body-read `:213` | **The API-client error-classification middleware** — classifies HTTP status → typed error ONCE. Screens switch on type, never parse status. | reuse (the §UX-resilience boundary; `/now` + hub fetches go through this client) |
| `apps/mobile/src/lib/api.ts` | `getApiUrl` `:17` | Base-URL resolution for the Hono RPC client. | reuse |
| `apps/mobile/src/lib/format-api-error.ts` | `classifyApiError` `:695`; `recoveryActions` `:299`; `formatApiError` `:748` | Classify-then-format helpers; `recoveryActions` builds `{primary,secondary}` for `ErrorFallback`. | reuse (classify the RAW error first, then format — never string-match the formatted output) |
| `apps/mobile/src/lib/api-client.ts` | `import type { AppType } from '@eduagent/api'` `:11`; `ApiClient` `:145` | The Hono RPC client — **type-only** `AppType` import (zero API runtime in the bundle; the sanctioned mobile→api type dependency). | reuse (new `/now` route is typed off `AppType` automatically) |
| `apps/mobile/src/lib/theme.ts` | `useThemeColors` `:35`; `useTokenVars` `:60`; `useSubjectTint` `:55`; `ThemeContext` `:14` | Semantic-token theme: CSS-var injection via NativeWind `vars()`; no hardcoded hex; persona-unaware. | reuse (all V2 surfaces use semantic tokens / `text-*` `bg-*` classes) |
| `apps/mobile/src/i18n/index.ts` | `SUPPORTED_LANGUAGES` (7) `:23-31`; `resources` `:101-109`; `ensureI18nReady` `:118`; `TranslateKey` `:17` | i18n init + the 7 UI locales. `en.json` at `apps/mobile/src/i18n/locales/en.json`. | reuse (`useTranslation`/`t()`; add new V2 keys to `en.json` same PR) |
| `scripts/check-i18n-orphan-keys.ts` · `check-i18n-jsx-literals.ts` · `i18n-keep.ts` · `i18n-jsx-literals-baseline.json` | (files) | i18n key-health AST walkers (forward/reverse orphans; the hardcoded-JSX-literal ratchet, 361-entry baseline). | reuse/honor (route all V2 copy through `t()`; new JSX literals fail CI) |
| `apps/mobile/src/components/persona-fossil-guard.test.ts` | (file) | Forbids reintroducing `personaFromBirthYear`/`isLearner`/local `Persona`. Use `computeAgeBracket` (`@eduagent/schemas`) for theming only, never gating. | honor (V2 scope is the chip/account-type, not persona) |
| `packages/schemas` | barrel | The shared contract (`@eduagent/schemas`) — error classes, `Profile`, `computeAgeBracket`, `isAdultOwner`. | reuse (don't redefine API-facing types locally) |

### Current S0 primitives already in code (`/now` feed + ledger touch)

| File | Anchor | What it is | Disposition |
|---|---|---|---|
| `packages/database/src/schema/activity-ledger.ts` | `mentorActivityLedger`; `.enableRLS()` current branch | Landed `mentor_activity_ledger` Drizzle table, S0-profile-keyed. Migration `0111_zippy_gateway.sql` creates it; `0112_rls_mentor_activity_ledger.sql` enables RLS + `mentor_activity_ledger_profile_isolation`. | reuse; do not recreate in S0 follow-up |
| `apps/api/src/services/activity-ledger.ts` | `writeActivityMoment`, `markMomentSurfaced` | Landed best-effort ledger writer (`safeWrite` posture) + surfacing marker. | reuse; S5 render-equivalence/audit writes must not rely on best-effort if the write is load-bearing |
| `apps/api/src/services/now-feed.ts` | `ROUTE_CATALOG`, `rankCandidates`, `buildNowFeed`, `buildNowOverflow` | Landed deterministic ranking service and closed route catalog. `rankCandidates()` is the pure seam S3 evals should call. | reuse; S1/S2 must validate route expansion against real mobile routes |
| `apps/api/src/routes/now.ts` | `nowRoutes` | Landed Hono route group for `GET /now` and overflow. | reuse |
| `packages/schemas/src/now-feed.ts` | `nowCardKindSchema`, `nowDeepLinkRouteSchema`, `nowResponseSchema` | Landed shared `/now` contract. `cards` is max 3; `chain` is currently `string[]` on the client schema, so clients must validate before indexing or S0 must tighten it. | reuse; do not invent card kinds such as `quota_exhausted` without S0 schema work |
| `packages/database/src/schema/sessions.ts` | `parkingLotItems` `:306-336`; `explored` boolean `:322` (**no expiry**) | Park-and-return store #1 (P3 backstop, §8.1). | reuse (the `/now` aging-window backstop reads this) |
| `packages/database/src/schema/assessments.ts` | `needsDeepeningTopics` `:163-207`; `status` enum `:178`; `pendingExpiresAt` `:186` | Park-and-return store #2 — has an expiry clock the backstop must reconcile with (§8.1), NOT a competing clock. | reuse |
| `apps/api/src/services/safe-non-core.ts` | `safeWrite()` | Non-throwing Sentry-captured DB-write posture used by `writeActivityMoment()`. | reuse the pattern only when loss is allowed |

---

## 2. V2 flag wiring recommendation

**Goal:** mount the new shell as "screen #89" behind `MODE_NAV_V2_ENABLED`, alongside V0/V1, with zero behavioral change to either when V2 is off. Honor §7: both the flags-off legacy fallback and the current production V0-on/V1-off shell must keep producing today's exact shells.

**Env var:** `EXPO_PUBLIC_ENABLE_MODE_NAV_V2` → flag `MODE_NAV_V2_ENABLED`.

1. **Add the flag in `apps/mobile/src/lib/feature-flags.ts`** directly after line 31, mirroring the existing two:
   ```ts
   MODE_NAV_V2_ENABLED: process.env.EXPO_PUBLIC_ENABLE_MODE_NAV_V2 === 'true',
   ```
   Plain `=== 'true'` read — same shape as V0/V1, so it defaults OFF wherever the env var is unset (prod, local `.env.example`).

2. **Resolution point — `use-navigation-contract.ts`, not the contract files.** The cleanest seam is a NEW top-level branch in `useNavigationShellContract` (`:142-189`): when `FEATURE_FLAGS.MODE_NAV_V2_ENABLED`, return the V2 three-tab set (Mentor/Subjects/Journal) instead of `resolveShellVisibleTabs(...)`. Do **not** edit `resolveNavigationContract` or `legacy-navigation-contract.ts` — leaving both untouched is what guarantees the V0/V1 no-regress. The V2 branch is additive and short-circuits before the V0/V1 logic runs. (S4 later extends this seam with the scope chip; S1–S3 only need the new tab set + new screens behind the flag.)

3. **Tabs layout — `(app)/_layout.tsx`.** The `<Tabs>` whitelist already renders only `visibleTabs.has(route.name)` routes, so a V2 `visibleTabs` of `{mentor, subjects, journal}` plus new `Tabs.Screen` entries for those three route files hides legacy tab buttons. This is not sufficient by itself: `<ModeSwitcher />` is mounted outside the whitelist and gates through the V1 contract, so S1 must render it only when `!FEATURE_FLAGS.MODE_NAV_V2_ENABLED` until S4 replaces it with `<ScopeChip />`. Add a V1+V2+family-capable regression asserting no mode switcher and exactly Mentor/Subjects/Journal tabs; V2-off V0/V1 shells remain unchanged. The avatar admin entry is a header/custom chrome element, not a tab.

4. **`eas.json` profiles** — add `EXPO_PUBLIC_ENABLE_MODE_NAV_V2: 'true'` to `build.development.env` (`:21`) and `build.preview.env` (`:37`) ONLY. Leave `build.production.env` (`:11`) untouched (V2 stays off in prod). This mirrors exactly how V1 is staged (dev+preview on, prod off).

5. **`.github/workflows/ci.yml` OTA step** — add `EXPO_PUBLIC_ENABLE_MODE_NAV_V2: 'true'` to the OTA env block now around `:397-398` (next to the V0/V1 lines), because `eas update` does not read build-profile env. This makes V2 visible on the preview-channel OTA. The former S1+S2 observed-cohort evidence gate was removed as a blocker on 2026-06-14, but preview OTA remains the validation surface for manual/product QA.

**Net effect:** prod = V0-on/V1-off/**V2-off** (unchanged); dev+preview+staging-OTA = V1-and-V2-on (V2 branch wins where it short-circuits). No flag combination removes or alters the V0/V1 code paths.

---

## 3. Shared-component inventory (import paths)

Downstream V2 plans MUST consume these, not rebuild them:

- **Error fallback:** `import { ErrorFallback, TimeoutLoader } from '../../components/common'` (barrel `components/common/index.ts:9,23`). `ErrorFallback` takes `{title, message, primaryAction, secondaryAction, variant: 'card'|'centered'}`. Every spec §14 failure-mode Recovery cell renders through this.
- **Typed errors:** `import { ForbiddenError, ResourceGoneError, QuotaExceededError, UnauthorizedError, RateLimitedError, … } from '@eduagent/schemas'` for shared API-domain errors, or consume the mobile re-export from `'../../lib/api-client'`. Current mobile still defines local `NetworkError` and `UpstreamError` in `apps/mobile/src/lib/api-errors.ts`, so do **not** branch on schema `instanceof NetworkError/UpstreamError` until that refactor lands; use the api-client re-export / `classifyApiError` boundary for transport errors.
- **API client + error classification:** `import { useApiClient } from '../../lib/api-client'`. The client's `customFetch` (`api-client.ts:185-370`) classifies HTTP status → typed error ONCE. Screens switch on the typed error; they must NEVER parse `res.status`. New `/now` + hub calls are typed off `AppType` automatically.
- **Classify-then-format:** `import { classifyApiError, recoveryActions, formatApiError } from '../../lib/format-api-error'`. Call `classifyApiError(rawError)` first; pass the result to `recoveryActions({retry, goBack, goHome})` to get `{primary, secondary}` for `ErrorFallback`. Never string-match `formatApiError` output to branch on type.
- **Hono RPC client (type-only AppType):** `import type { AppType } from '@eduagent/api'` (the one sanctioned mobile→api dependency; `api-client.ts:11`). Type-only — erased at compile time, zero API runtime in the bundle.
- **Theme / semantic tokens:** `import { useThemeColors, useTokenVars, useSubjectTint } from '../../lib/theme'`. Use NativeWind semantic classes (`bg-surface`, `text-text-primary`, `text-h2`, etc.) and CSS vars; NO hardcoded hex; shared components stay persona-unaware (brand-fixed hex only in `*Animation`/`*Celebration` files).
- **i18n:** `import { useTranslation } from 'react-i18next'` → `t('key')`. Add new keys to `apps/mobile/src/i18n/locales/en.json` in the SAME PR. `TranslateKey` type from `'../../i18n'`. Guards: `check-i18n-orphan-keys.ts` (missing/unused), `check-i18n-jsx-literals.ts` (the hardcoded-JSX ratchet — NEW literals fail CI), `i18n-keep.ts` (runtime-dynamic keys).
- **Test patterns:** co-located `*.test.tsx` (no `__tests__/`); run `cd apps/mobile && pnpm exec jest --findRelatedTests <file> --no-coverage`; NO internal `jest.mock('./...')` (GC1 ratchet) — use real impls or `jest.requireActual` overrides; mock only external boundaries (LLM, Stripe, Clerk JWKS, push, email). Honor `persona-fossil-guard.test.ts`.

---

## 4. Screen-collapse inventory (substantiates ~90→~25; feeds Annex A)

Per-phase merge/retire ledger. "Strangle" = kept flag-isolated until §7/S6 executes; the count drop is realized only at S6.

**S1 (Mentor home) — collapses into the card-feed + bar:**
- `home.tsx`, `LearnerScreen.tsx`, `CoachBand.tsx` → one Mentor feed (the `/now` card stack). The 4 `HOME_INTENT_ACTIONS` (`LearnerScreen.tsx:70-100`) collapse: homework + ask-anything → the bar's camera + Homework chip; practice + study-new → feed cards.
- Kept as session entries (reached from feed/bar, not as home destinations): `session/`, `homework/camera.tsx`, `dictation/`, `practice/`.

**S2 (Subject hub) — the worst redundancy cluster, ~5 surfaces → 1 hub:**
- `shelf/[subjectId]/index.tsx` + `shelf/[subjectId]/book/[bookId].tsx` + `progress/[subjectId]/index.tsx` + `progress/[subjectId]/sessions.tsx` + scattered topic screens (`topic/[topicId].tsx`, `topic/index.tsx`) → ONE hub (Next-up block + collapsible chapter sections + topic sheet, §5).
- `library.tsx` (the Library TAB) retires (§7); browse survives as a Journal archive (EU-6). `subject/[subjectId].tsx` (settings) + `pick-book/` kept, reached from hub.

**S3 (Journal + avatar) — the You-tab hodgepodge + More tab die:**
- `more/index.tsx` + `more/account.tsx` + `more/privacy.tsx` + `more/{notifications,accommodation,celebrations,help,security-sessions}.tsx` → avatar admin sheet (owner-gated).
- `recaps/index.tsx` + `my-notes/index.tsx` + `my-notes/[kind].tsx` + `mentor-memory.tsx` → ONE Journal tab (recaps + cross-subject notes + mentor memory, §3/§5.4).
- `session-summary/[sessionId].tsx` (3-screen exit funnel) → dissolves into mentor wrap-up turn, **gated on P3 evals plus the reflection/bonus V2 heir being live** (S6).

**S4 (chip / identity — strangle, not yet collapsed at S1–S3):**
- `navigation-contract.ts` tab-shape matrix + `legacy-navigation-contract.ts` + `app-context.tsx` ModeSwitcher + `ModeSwitcher.tsx` + proxy mode + `child/[profileId]/*` → scope chip + person scopes. These stay alive behind flags until S6 (the must-not-regress floor).

**S6 (cutover):** exit-funnel dissolution executes (post-eval); old tabs + `child/*` retire; the V0-preservation constraint retirement ruling (§13.1) flips, allowing actual deletion. This is where ~90→~25 is realized; before it, V2 screens are additive behind `MODE_NAV_V2_ENABLED`.

---

## 5. Repo guardrails the V2 plans must honor

- **Cross-stack push:** `router.push` to a deep leaf must push the full ancestor chain, or `router.back()` falls through to Home. Any new nested layout with `index` + a deeper dynamic child exports `unstable_settings = { initialRouteName: 'index' }` (see `shelf/[subjectId]/_layout.tsx:8-10`, `progress/[subjectId]/_layout.tsx:12-14`). The `/now` deep-links (§8.1) resolve through a closed route catalog and push full chains.
- **Default exports** only for Expo Router page components.
- **Tests co-located** (no `__tests__/`); package imports through the barrel (`@nx/enforce-module-boundaries`).
- **`@eduagent/schemas` is the shared contract** — no locally-redefined API-facing types.

---

## 6. Spec-amendment anchors (2026-06-10)

Added for the 2026-06-10 spec amendment — three surfaces the new S0-R / S1 / S2 / S3 plan tasks reference. All line anchors verified by reading the target on the checked-out branch 2026-06-10.

### Earned reward system (preserve + re-home target)

> **Audit 2026-06-10: a LIVE end-to-end XP system exists** — schema columns, a server writer wired into a passed-assessment hook, reflection multiplier bookkeeping, quiz points, and live mobile UI readers. The 2026-06-13 product amendment keeps XP/practice points and the 1.5x reflection bonus as **earned private learning receipts**. S0-R may decouple reward bookkeeping from fragile retention-writer side effects, but must not delete reward persistence. S1/S2/S3/S6 cite these anchors to preserve and re-home rewards under the earned-motivation law.

| File | Anchor | What it is | Disposition |
|---|---|---|---|
| `packages/database/src/schema/progress.ts` | `xpLedger` table `:49-93`; `amount` `:64`; `status: xpStatusEnum` `:65`; `verifiedAt` `:69`; `reflectionMultiplierApplied` `:73-75`; `(profile_id, topic_id)` unique index `:89-92` | **XP/practice-points store** — one ledger row per (profile, topic), with reflection-multiplier bookkeeping. Imports `xpStatusEnum` from `./assessments` `:20`. | preserve; S0-R may decouple fragile side effects, S6 must not drop without a replacement reward ledger |
| `packages/database/src/schema/assessments.ts` | `xpStatusEnum = pgEnum('xp_status', …)` `:35-39` (`pending`/`verified`/`decayed`); `assessments.xpStatus` column `:134` | XP-status enum + the per-assessment `xp_status` column it gates. | preserve until a replacement reward-status contract exists |
| `packages/database/src/schema/quiz.ts` | `quizRounds` table `:28`; `xpEarned: integer('xp_earned')` `:46` | Quiz reward column — per quiz-round points earned. | preserve; quiz games remain discoverable in V2 |
| `apps/api/src/services/xp.ts` | `calculateTopicXp` `:35`; `REFLECTION_XP_MULTIPLIER = 1.5` `:22`; `insertSessionXpEntry` `:84-105` (insert `:121-122`, `onConflictDoNothing` target `:132`); `applyReflectionMultiplier` `:168` | **The XP writer service**. `insertSessionXpEntry` computes + inserts a verified XP row when a topic assessment passes; `applyReflectionMultiplier` 1.5×'s it on accepted learner reflection. | preserve; reflection bonus is a V2 carry-forward requirement |
| `apps/api/src/routes/assessments.ts` | `import { insertSessionXpEntry }` `:35`; call site `:231-236` (guarded by `newStatus === 'passed'` `:230`) | Production reward write trigger — fires on a newly-passed assessment inside the assessment-submit transaction. | preserve or replace with equivalent earned-reward write |
| `apps/mobile/src/app/(app)/practice/index.tsx` | `totalXp` aggregate `:335` ([F-035] comment `:334`); rendered via `t('practiceHub.xpLabel', { xp: totalXp })` `:355,:362,:364,:493,:703` | **Live UI reader #1** — the Practice hub sums per-activity `totalXp` and renders it as a label. | re-home under V2 light-practice / reward receipt surfaces |
| `apps/mobile/src/hooks/use-streaks.ts` | `useXpSummary()` `:29-48` (reads `GET /xp` `:38`) | **Live UI reader #2** — TanStack hook fetching the XP summary (`XpSummary` from `@eduagent/schemas`). | preserve/reuse for private earned-reward summaries |
| `apps/mobile/src/app/(app)/shelf/[subjectId]/book/_view-models/book-derived-state.ts` | `xpStatus?: string \| null` field `:21`; `xpStatus === 'verified'` gate `:113` | **Live UI reader #3** — book-detail derived state branches on a topic's `xpStatus`. | re-home into S2 Subject hub progress/state display |
| `apps/mobile/src/components/progress/AccordionTopicList.tsx` | `topic.xpStatus === 'verified'` `:29`; `=== 'decayed'` `:33` | **Live UI reader #4** — progress topic list maps `xpStatus` to a visual badge. | re-home into S2/S3 progress contexts if still useful |
| `packages/schemas/src/progress.ts` | `xpSummarySchema` `:93-101` (`totalXp`/`verifiedXp`/`pendingXp`/`decayedXp`); `topicProgressSchema.xpStatus` `:293`; `dashboardChildSchema.totalXp` `:377`; `challengeCardSchema.xpReward` `:465`; `xpSummaryEndpointResponseSchema` `:757-761` | The shared XP/reward contract (response shapes the readers above consume). | preserve until a replacement earned-reward contract exists |

### Streak/rhythm display (S1 "on track" / momentum signal replaces pressure)

> S1 replaces pressure-style day-count streak display with a forgiving "on track" / momentum signal. Streak data itself stays — `streaks` table `packages/database/src/schema/progress.ts:29`, `useStreaks()` hook `apps/mobile/src/hooks/use-streaks.ts:8` — and may feed rhythm/momentum copy. Do not show loss-framed streak pressure.

| File | Anchor | What it is | Disposition |
|---|---|---|---|
| `apps/mobile/src/app/(app)/progress/_components/ProgressStatsChips.tsx` | streak chip `:64-73` (`testID="progress-streak-count"` `:65`; renders `t('progress.stats.streak', { count: inventory.global.currentStreak })` `:69-71`) | **The primary streak-count display** — a pill in the Progress-tab stats row showing the current day-streak count. | replace-by-S1 (the "on track" badge supersedes this count pill) |
| `apps/mobile/src/components/home/MentorSlot.tsx` | `streakCelebration = child.currentStreak >= STREAK_CELEBRATION_THRESHOLD` `:102`; `t('home.parent.mentorSlot.celebrationStreak', …)` `:108-111` | Parent-home Mentor slot fires a streak-milestone celebration line off a child's streak count. | replace-by-S1 (P7 — celebrate the true state change, not the counter) |

### Voice / mic input (§16 — mic on every input)

> **Audit 2026-06-10: a session-layer voice/mic stack ALREADY EXISTS** (epic-17 voice-first), wired into the conversation composer. §16's "mic on every input" is NOT net-new infra — it generalizes this existing STT button + hook from the session bar to every text input. Deps `expo-speech` + `expo-speech-recognition` are in `apps/mobile/package.json:64-65`. Compliance invariant rides along: transcription-only, never tone/emotion (AI Act Art 5(1)(f); §3.1, §15.16).

| File | Anchor | What it is | Disposition |
|---|---|---|---|
| `apps/mobile/src/components/session/VoiceRecordButton.tsx` | `VoiceRecordButton` `:27` (mic icon `:86`, `testID="voice-record-button"` `:77`); `VoiceTranscriptPreview` `:109` (editable transcript before send `:132-142`) | **The existing mic button** — tap-to-record STT control + a transcript-correction preview. The reusable affordance §16 generalizes. | reuse (the §16 mic on every input is this component, lifted out of the session composer) |
| `apps/mobile/src/hooks/use-speech-recognition.ts` | `useSpeechRecognition` (file); `SpeechRecognitionStatus` `:9-14`; `requestMicrophonePermission` `:30`; `getMicrophonePermissionStatus` `:35` | **The STT hook** — `expo-speech-recognition` wrapper (manual tap start/stop, no VAD); owns mic-permission lifecycle. | reuse (the transcription engine behind every-input mic) |
| `apps/mobile/src/components/session/ChatShell.tsx` | `import { VoiceRecordButton, VoiceTranscriptPreview }` `:24`; `import { useSpeechRecognition }` `:27`; `inputMode` prop `:81`; mount `:1050-1058`; voice/text toggle `:980-998` | **Where voice is wired today** — the conversation composer. This is where the bar lands, so the §16 mic is already present here; S1/S2/S3 extend the same pattern to non-session inputs. | keep/reuse (the existing integration the every-input rollout mirrors) |
| `apps/mobile/src/components/session/SessionInputModeToggle.tsx` | `SessionInputModeToggle` `:16`; `testID="session-input-mode-toggle"` `:25` | Session-start Text/Voice mode selector (FR144). | keep/reuse (the input-mode precedent) |
| `apps/mobile/src/hooks/use-text-to-speech.ts` | (file) | TTS playback companion (voice *output*; not the §16 mic, but part of the same voice stack). | keep |
| `packages/schemas/src/sessions.ts` | `inputModeSchema = z.enum(['text', 'voice'])` `:88`; `InputMode` type `:89` | The shared `text`/`voice` input-mode contract the mic flips. | reuse (don't redefine; new inputs adopt this enum) |
