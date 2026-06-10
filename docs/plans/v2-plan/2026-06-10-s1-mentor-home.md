---
title: S1 — New Mentor Home (Card Feed + Ever-Present Input Bar + Camera + Homework Chip) — Implementation Plan
date: 2026-06-10
profile: ui
spec: docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md
status: draft
---

# S1 — New Mentor Home — Implementation Plan

**Goal:** Ship the new Mentor-tab home — a deterministic `GET /now` card feed (≤3 declinable cards + overflow), an ever-present pinned input bar with a camera button and a Homework quick-chip, and template-rendered ledger-moment cards (no LLM) — mounted behind `MODE_NAV_V2_ENABLED` as additive "screen #89", with V0/V1 nav completely untouched.

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
- **The session screen, homework camera, dictation, practice** (`session/index.tsx`, `homework/camera.tsx`, etc.) — reused as navigation *targets* of the bar/chip, not modified.

---

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
| `components/mentor/NowCardStack.tsx` | Render ≤3 cards; "more / everything waiting" overflow entry; empty + error states |
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
  Do NOT add `mentor`/`subjects`/`journal` to `FULL_SCREEN_ROUTES` (they keep the tab bar) or `HIDDEN_TAB_ROUTES` (they are whitelisted when visible). Leave the `<ModeSwitcher />` mount (`:602`) in place — it returns null under V2 because `app-context` yields `mode: null` when V1 path isn't taken; it is a §7 strangle-target for S4, not S1.
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
    'subject.hub':      (p) => `/(app)/shelf/${p.subjectId}`,
    'subject.topic':    (p) => `/(app)/shelf/${p.subjectId}/book/${p.bookId}/topic/${p.topicId}`,
    'retention.review': (p) => `/(app)/shelf/${p.subjectId}/topic/${p.topicId}/review`,
    'challenge.start':  (p) => `/(app)/shelf/${p.subjectId}/topic/${p.topicId}/challenge`,
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
  > **Path verification at build time:** confirm each concrete path resolves against the real Expo Router tree (`shelf/[subjectId]/index.tsx`, `shelf/[subjectId]/book/[bookId].tsx`, the `review`/`challenge` leaf routes). If a leaf route file does not exist yet in S1 (e.g. a dedicated `/review` screen), map that catalog key to the closest existing entry the S2 hub will own and leave a `// S2: repoint to dedicated route` comment — do NOT invent a new screen in S1. The `session.resume` and `subject.hub`/`subject.topic` paths exist today (`session/index.tsx`, `shelf/[subjectId]/`); `retention.review`/`challenge.start` leaves are S2-owned — until then, route them to `subject.topic` (the topic sheet, which carries review/challenge actions) and annotate.
  **done when:** `apps/mobile/src/lib/now-deep-link.test.ts` (T6a) asserts: `pushNowDeepLink(mockRouter, { route: 'subject.topic', params: { subjectId, bookId, topicId }, chain: ['subject.hub'] })` calls `router.push` **twice** — first the `shelf/<subjectId>` ancestor, then the topic leaf, in that order (cross-stack-chain guarantee); a `session.resume` link with empty `chain` calls `push` once; the path strings interpolate the params. `mockRouter` is a plain `{ push: jest.fn() }` (no internal mock). `cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/now-deep-link.ts --no-coverage` passes.

- [ ] **T7: Build `NowCard` — the single declinable card renderer.**
  Create `apps/mobile/src/components/mentor/NowCard.tsx`. Heir of `CoachBand.tsx` (reuse its layout language: rounded card, eyebrow, headline, primary "Continue" + dismiss "×"), but driven by a `NowCard` (from `@eduagent/schemas`) instead of a raw headline. Props: `{ card: NowCard; onContinue: (card) => void; onDecline: (card) => void }`. Copy is resolved from `card.templateKey` + `card.params` via `t()` — the server sends `templateKey` (e.g. `now.unfinished_session.default`) and `params`; the client maps it to an i18n key under `mentorHome.cards.*` and interpolates. NO hardcoded copy, NO hex (semantic tokens / `useThemeColors` only), persona-unaware. "Continue" calls `onContinue(card)` (the screen runs `pushNowDeepLink`); "×" calls `onDecline(card)` (local dismiss, P1).
  Template→key resolution (deterministic map, the *only* place a server `templateKey` becomes UI copy):
  ```ts
  // mentorHome.cards.<kind>.{title,cta} — every templateKey maps to a title key.
  // Unknown templateKey falls back to mentorHome.cards.generic.title (never blank).
  function cardCopyKey(card: NowCard): { title: TranslateKey; cta: TranslateKey } { … }
  ```
  Render the title via `t(titleKey, card.params)` and the CTA via `t(ctaKey)`. Give the card `testID={`now-card-${card.kind}`}`, Continue `testID="now-card-continue"`, dismiss `testID="now-card-dismiss"`.
  **done when:** `apps/mobile/src/components/mentor/NowCard.test.tsx` (T7a) renders an `unfinished_session` card and asserts the title text renders (matches the `en.json` template), that pressing `now-card-continue` calls `onContinue` with the card, and pressing `now-card-dismiss` calls `onDecline` with the card; renders a card with an unknown `templateKey` and asserts it falls back to the generic title (no blank, no crash). Real `i18n` (no mock). `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/mentor/NowCard.tsx --no-coverage` passes; `persona-fossil-guard.test.ts` stays green.

- [ ] **T8: Build `LedgerMomentCard` — template-rendered moment, no LLM.**
  Create `apps/mobile/src/components/mentor/LedgerMomentCard.tsx` for `kind === 'ledger_moment'` cards (spec §2 P4 / §8.2 — rows render from `templateKey` + `params` with **no LLM call**). Same visual language as `NowCard` but informational-styled (lower-emphasis surface token, no urgent primary). Copy from `card.templateKey` (`now.ledger_moment.<kind>` per S0) mapped to `mentorHome.ledger.*` keys + `card.params`. Tapping it runs the card's `deepLink` (via the screen's `pushNowDeepLink`); declining dismisses locally. **No network call, no streaming, no LLM** — this is a pure presentational render of server-supplied template + params. testID `now-ledger-moment`.
  **done when:** `apps/mobile/src/components/mentor/LedgerMomentCard.test.tsx` (T8a) renders a `ledger_moment` card with `templateKey: 'now.ledger_moment.session_filed'` and asserts the template copy renders from `en.json` + params (e.g. the filed topic title), that tapping calls `onContinue`, and — the P4 guard — that the component imports **no** session/LLM/streaming hook (assert by construction: the test renders the component standalone with no API provider and it still renders text, proving zero data-fetch dependency). Real i18n. `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/mentor/LedgerMomentCard.tsx --no-coverage` passes.

- [ ] **T9: Build `NowCardStack` — ≤3 cards + overflow affordance + states.**
  Create `apps/mobile/src/components/mentor/NowCardStack.tsx`. Renders the feed's ≤3 cards (spec §8.1 highlight ceiling, EU-3): map `feed.cards` to `NowCard`/`LedgerMomentCard` by `kind`; below the stack render the **overflow affordance** when `feed.overflowCount > 0` — a "more / everything waiting" row (`testID="now-overflow-entry"`, copy `mentorHome.overflow.more` with `{ count: feed.overflowCount }`) that expands the `useNowOverflow` list inline (or pushes a lightweight overflow view — inline expand is simpler and avoids a new route). Handle the three S1 feed states the screen passes down:
  - **Empty feed** (`cards.length === 0` && `overflowCount === 0`): render the onboarding proposal card (§14 "Empty feed") — a `NowCard`-styled prompt `mentorHome.empty.title` / CTA `mentorHome.empty.cta` that deep-links into subject creation (`/(app)/create-subject` — the existing `CREATE_SUBJECT_FROM_HOME_HREF` from `LearnerScreen.tsx:55`).
  - **Cards present:** render them + overflow.
  - **Error/cached:** the screen (T11) handles error → cached-feed substitution before this component renders; `NowCardStack` itself is pure (props in, cards out) so it is trivially testable.
  Props: `{ feed: NowResponse; overflow: NowOverflowResponse | undefined; dismissedKeys: Set<string>; onContinue; onDecline; onShowOverflow }`. Filter out `dismissedKeys` (the local P1 dismiss set) before slicing.
  **done when:** `apps/mobile/src/components/mentor/NowCardStack.test.tsx` (T9a) asserts: a 3-card feed renders 3 cards and **no** overflow entry when `overflowCount === 0`; a feed with `overflowCount: 5` renders the overflow entry showing "5"; an empty feed renders the onboarding card (`mentorHome.empty.title`); a card whose key is in `dismissedKeys` is not rendered (P1 local-dismiss). Real i18n. `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/mentor/NowCardStack.tsx --no-coverage` passes.

- [ ] **T10: Build `MentorInputBar` — pinned bar + camera + Homework chip (EU-5).**
  Create `apps/mobile/src/components/mentor/MentorInputBar.tsx` — the ever-present bar (spec §3 "two entry channels"; §3 EU-5 layout floor). Heir of the `HOME_INTENT_ACTIONS` homework + ask-anything intents (`LearnerScreen.tsx:70-100`). Three affordances, all reachable without scrolling (pinned at the bottom of `mentor.tsx`):
  1. **Text entry** (a tappable input that opens the session screen — `router.push('/(app)/session')`, the existing conversation spine; S1 does not build inline chat, it routes to `session/index.tsx`). testID `mentor-bar-input`.
  2. **Camera button** → `router.push('/(app)/homework/camera')` (the existing first-class homework entry, `homework/camera.tsx`). testID `mentor-bar-camera`.
  3. **Homework quick-chip** → same `/(app)/homework/camera` target, labelled `mentorHome.bar.homeworkChip` — the permanent one-tap homework affordance (§3, §15.4). testID `mentor-bar-homework-chip`.
  Props: `{ onOpenSession; onOpenCamera; onOpenHomework }` (the screen wires these to `router.push` so the bar stays presentational/testable). LLM-down handling: an `unavailable?: boolean` prop — when true, the text entry shows the honest-unavailable message (`mentorHome.bar.unavailable`) and is non-submitting, but camera + chip stay live (§14 "LLM down" — feed/tabs/homework still work). Semantic tokens only; persona-unaware; all copy via `t()`.
  **done when:** `apps/mobile/src/components/mentor/MentorInputBar.test.tsx` (T10a) asserts: tapping `mentor-bar-camera` calls `onOpenCamera`; tapping `mentor-bar-homework-chip` calls `onOpenHomework`; tapping `mentor-bar-input` calls `onOpenSession`; with `unavailable` true the input renders the unavailable copy and the camera + chip handlers still fire (LLM-down resilience). Real i18n. `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/mentor/MentorInputBar.tsx --no-coverage` passes.

- [ ] **T11: Build the `mentor.tsx` page — feed + pinned bar layout + failure-mode orchestration.**
  Create `apps/mobile/src/app/(app)/mentor.tsx` (default export — it is an Expo Router page). This is the V2 Mentor tab. Layout honoring the **EU-5 floor**: a scrollable feed region (`NowCardStack`) and a **pinned** `MentorInputBar` anchored to the bottom (absolute/flex-end so camera + Homework chip are reachable without scrolling past the feed). On a **school-day / weekday-evening heuristic**, surface the Homework chip *above* the card stack as a highlighted prompt (§3): compute the heuristic with the existing `getTimeOfDay` + `now.getDay()` helpers (`lib/greeting.ts:42,52` — Monday–Friday + afternoon/evening = school-day-evening), and when true render a one-line "Homework?" highlight above `NowCardStack` (still also pinned in the bar). Orchestrate state:
  - `const { data: feed, isLoading, isError } = useNowFeed();` + `useNowOverflow(showOverflow)`.
  - `isLoading` (cold, no cache) → `TimeoutLoader` (`primaryAction = refetch`, `secondaryAction = go to Subjects`).
  - `isError` (or `>2s` per §14) → read `readCachedNowFeed(profileId)`; if a cached feed exists, render it **plus** a deterministic local "continue where you left off" card (synthesized client-side from the cached `unfinished_session` card if present, else a `mentorHome.fallback.continue` card that deep-links to the last session); if no cache, render `ErrorFallback` (variant `card`, primary `retry`→`refetch`, secondary `go to Subjects`) — built via `recoveryActions` from `format-api-error.ts:299`. Tabs stay functional throughout (§14).
  - LLM-down is not distinguishable at the feed layer (feed is deterministic, no LLM) — the bar's `unavailable` is driven by a session-availability probe if one exists, else defaults false; the feed itself never degrades on LLM outage (§14 "LLM down": feed/hubs/Journal all still work).
  - Wire `onContinue(card)` → `pushNowDeepLink(router, card.deepLink)`; `onDecline(card)` → add `cardKey(card)` to a local `dismissedKeys` state set; `onOpenSession/Camera/Homework` → `router.push` the respective routes; `onShowOverflow` → `setShowOverflow(true)`.
  Use `useNavigationContract()` only if a gate is needed; S1 Me-scope needs none (no owner gating on the feed itself). Classify any caught error with `classifyApiError` (the RAW error, never the formatted string — CLAUDE.md "Classify errors before formatting").
  **done when:** `apps/mobile/src/app/(app)/mentor.test.tsx` (T11a) asserts, with `useNowFeed` driven via a stubbed API client (external boundary): (a) a happy feed renders `NowCardStack` with cards + the pinned `MentorInputBar` (both `mentor-bar-camera` and `mentor-bar-homework-chip` present in the tree, i.e. reachable — EU-5); (b) an error with a populated cache renders the cached cards + a "continue where you left off" fallback card and does NOT show a dead-end; (c) an error with empty cache renders `ErrorFallback` with a working retry; (d) tapping a card's Continue triggers `pushNowDeepLink` (assert via a spied router). Real i18n, real `ErrorFallback`/`NowCardStack`/`MentorInputBar` (no internal mocks). `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/(app)/mentor.tsx --no-coverage` passes; `persona-fossil-guard.test.ts` green.

- [ ] **T12: Ship the `subjects.tsx` + `journal.tsx` S1 stub pages.**
  Create `apps/mobile/src/app/(app)/subjects.tsx` and `apps/mobile/src/app/(app)/journal.tsx` as default-export Expo Router pages so the three-tab V2 set has three real routes (a missing route file would make the tab dead). Each renders an honest placeholder: a centered heading + body via `t('mentorHome.subjectsStub.title')` / `t('mentorHome.journalStub.title')` ("Subjects hub arrives next" / "Your Journal arrives soon") and a single CTA back to the Mentor tab. NO real content — content is S2 (`subjects`) and S3 (`journal`). Semantic tokens, `t()` copy, persona-unaware. These stubs are themselves S2/S3 strangle targets.
  **done when:** `apps/mobile/src/app/(app)/subjects.test.tsx` + `journal.test.tsx` (T12a) each render the page and assert the stub heading renders (from `en.json`) and that the page has a default export (Expo Router page contract). Real i18n. `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/(app)/subjects.tsx src/app/(app)/journal.tsx --no-coverage` passes.

- [ ] **T13: Add all S1 i18n keys to `en.json` (same PR — JSX-literal ratchet).**
  Add to `apps/mobile/src/i18n/locales/en.json` every key the S1 surfaces use, so no hardcoded JSX literal ships (the `check-i18n-jsx-literals.ts` ratchet fails new literals, and `check-i18n-orphan-keys.ts` fails a `t()` whose key is missing). Required keys (group under a new `mentorHome` namespace + `tabs.*` additions):
  - `tabs.mentor`, `tabs.mentorLabel`, `tabs.subjects`, `tabs.subjectsLabel`, `tabs.journal`, `tabs.journalLabel`
  - `mentorHome.cards.unfinished_session.title` (`{{topicTitle}}`-interpolated) + `.cta`; same for `retention_due`, `parked_item`, `needs_deepening`, `challenge_ready`; `mentorHome.cards.generic.title` + `.cta` (the unknown-templateKey fallback, T7)
  - `mentorHome.ledger.session_filed.title`, `.topic_mastered.title`, `.recap_ready.title`, `.snapshot_ready.title`, `.needs_deepening_added.title` (template-rendered, T8; mirror the S0 `LedgerKind` set)
  - `mentorHome.overflow.more` (`{{count}}`), `mentorHome.empty.title`, `mentorHome.empty.cta`, `mentorHome.fallback.continue` (the feed-unavailable "continue where you left off" card)
  - `mentorHome.bar.placeholder` (input hint), `mentorHome.bar.homeworkChip`, `mentorHome.bar.unavailable` (LLM-down), `mentorHome.bar.cameraLabel`
  - `mentorHome.homeworkPrompt` (the school-day-evening above-feed highlight, T11)
  - `mentorHome.subjectsStub.title`, `mentorHome.journalStub.title`, `mentorHome.backToMentor` (stub CTAs, T12)
  Provide a no-variable companion where a `{{var}}` is optional, per CLAUDE.md "Variable-interpolation fallbacks" (e.g. `mentorHome.cards.unfinished_session.titleNoTopic` when `topicTitle` is absent). Do NOT run `pnpm translate` in this plan (locale fan-out is a follow-up); English keys are the gate.
  **done when:** `cd apps/mobile && pnpm exec tsx ../../scripts/check-i18n-orphan-keys.ts` reports zero forward orphans for the new `mentorHome.*`/`tabs.*` keys (every `t()` in T7–T12 resolves), and `pnpm exec tsx ../../scripts/check-i18n-jsx-literals.ts` reports no NEW baseline violations from the S1 components. (Run from repo root per the script's CWD expectations; the exact invocation matches the `ci.yml` "i18n hardcoded-JSX-literal check" step.)

- [ ] **T14: Stage the V2 flag in `eas.json` + `ci.yml` (dev/preview/OTA only).**
  - In `apps/mobile/eas.json`, add `"EXPO_PUBLIC_ENABLE_MODE_NAV_V2": "true"` to `build.development.env` (`:21-26`) and `build.preview.env` (`:37-42`) ONLY. Leave `build.production.env` (`:11-15`) untouched — V2 stays off in prod (prod remains V0-on / V1-off / V2-off).
  - In `.github/workflows/ci.yml`, add `EXPO_PUBLIC_ENABLE_MODE_NAV_V2: 'true'` to the preview-channel OTA env block (`:325`, alongside the existing `EXPO_PUBLIC_ENABLE_MODE_NAV(_V1)` lines `:326-327`), because `eas update` does not read build-profile env — this makes V2 visible on the preview-channel OTA (the S1+S2 evidence-gate validation surface).
  This mirrors exactly how V1 is staged. No flag combination removes or alters the V0/V1 code paths.
  **done when:** `eas.json` `production.env` is unchanged (diff shows only `development.env` + `preview.env` gained the V2 line); `ci.yml` OTA env block gained exactly one V2 line next to the V0/V1 lines. `git diff --stat` shows only `eas.json` + `ci.yml` touched for this task. (Config-only; verified by reading the diff, no runtime test.)

---

## Tests

All co-located (no `__tests__/`). Run each with `cd apps/mobile && pnpm exec jest --findRelatedTests <file> --no-coverage`. NO internal `jest.mock('./...')` / `jest.mock('../...')` (GC1) — use real components/schemas/i18n; mock ONLY external boundaries (the API client's HTTP layer, AsyncStorage via the existing jest mock, Sentry, the `feature-flags` env value). `persona-fossil-guard.test.ts` must stay green for every component touched.

- **T1a** `lib/feature-flags.test.ts` — `MODE_NAV_V2_ENABLED` defaults false; key exists.
- **T2a** `hooks/use-navigation-contract.test.ts` — V2-on → three-tab set + `tabs.mentor` presentation; V2-off → unchanged legacy `visibleTabs` (the §7 regression guard).
- **T4a** `lib/now-feed-cache.test.ts` — round-trip; TTL expiry → null; corrupt JSON → null; schema-fail → null.
- **T5a** `hooks/use-now-feed.test.tsx` — parsed feed returned; cache mirror on success; rejected fetch → `isError`, no throw.
- **T6a** `lib/now-deep-link.test.ts` — `subject.topic` pushes ancestor `shelf/<id>` then leaf (chain order); empty-chain pushes once; param interpolation.
- **T7a** `components/mentor/NowCard.test.tsx` — title renders from template; Continue/Decline callbacks; unknown templateKey → generic fallback.
- **T8a** `components/mentor/LedgerMomentCard.test.tsx` — template render + params; tap → onContinue; renders standalone with no data provider (P4 no-LLM guard by construction).
- **T9a** `components/mentor/NowCardStack.test.tsx` — 3 cards + no overflow at count 0; overflow entry shows count; empty → onboarding card; `dismissedKeys` filters a card.
- **T10a** `components/mentor/MentorInputBar.test.tsx` — camera/chip/input callbacks; `unavailable` → unavailable copy + camera/chip still fire.
- **T11a** `app/(app)/mentor.test.tsx` — happy feed renders stack + pinned bar (camera + chip reachable, EU-5); error+cache → cached cards + continue-where-you-left-off, no dead-end; error+no-cache → `ErrorFallback` with working retry; card Continue → `pushNowDeepLink`.
- **T12a** `app/(app)/subjects.test.tsx` + `journal.test.tsx` — stub heading renders; default export present.
- **T13** i18n: `check-i18n-orphan-keys.ts` zero forward orphans; `check-i18n-jsx-literals.ts` no new violations.

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
- Mentor-tab content: feed = app-known, bar+camera+Homework chip = world-known (§3) → T9 (`NowCardStack`), T10 (`MentorInputBar`).
- App-open = card feed, glanceable, opt-in chat (option A, §3) → T11 (`mentor.tsx` renders the feed; chat is a `router.push` to `session/`, not auto-opened).
- EU-5 layout floor — camera + Homework chip reachable without scrolling; pinned bar; school-day/weekday-evening Homework highlight (§3) → T10 (bar) + T11 (pinned layout + `getTimeOfDay`/`getDay` heuristic) + T11a assertion (chip reachable).
- ≤3 highlight ceiling + overflow affordance "more/everything waiting" (§8.1, EU-3) → T9 (`NowCardStack` slices ≤3, renders overflow when `overflowCount>0`) + T5 (`useNowOverflow`).
- Every card declinable (§2 P1) → T7/T8 Decline callback + T11 local `dismissedKeys` (documented as client-local for Me scope; server-persisted snooze is S4/S5).
- Template-rendered ledger-moment cards, NO LLM (§2 P4 / §8.2) → T8 (`LedgerMomentCard`, pure presentational) + T8a no-data-provider guard.
- deepLink push via full ancestor chain from the route catalog (§8.1, cross-stack-push) → T6 (`pushNowDeepLink` pushes `chain` then leaf) + T6a chain-order assertion.
- §14 S1 failure modes:
  - Feed-unavailable → cached last feed + deterministic "continue where you left off" + `ErrorFallback` (retry primary, Subjects secondary) → T4 (cache) + T11 (orchestration) + T11a (b/c).
  - Empty feed → onboarding proposal card → T9 (`NowCardStack` empty state) + `mentorHome.empty.*` (T13).
  - LLM-down → bar honest-unavailable, feed/tabs still work → T10 (`unavailable` prop) + T11 (feed never degrades on LLM outage).
  - Homework photo fails → local retain + inline retry → reuses the EXISTING `homework/camera.tsx` flow (Scope "out": camera not modified); S1's responsibility ends at routing to it, the retain/retry lives in the camera screen already.
  - Parked item via backstop+overflow → S0 ranking owns the backstop; S1 surfaces it via the overflow affordance (T9) — assertion that a parked item is reachable lives in S0's `buildNowOverflow` test; S1 renders whatever `/now/overflow` returns.
- i18n keys for all copy, same PR → T13 (all keys enumerated) + every component uses `t()` (no JSX literals — ratchet-enforced).
- Reuse anchors: `CoachBand`/`HOME_INTENT_ACTIONS` templated off (T7/T10), `ErrorFallback`/`TimeoutLoader` (T11), typed Hono RPC `AppType` (T5), `home.tsx:161` landing left intact for V0/V1 (Scope "out").
- Out of scope honored: Subjects hub (S2 — `subjects.tsx` is a stub, T12), Journal (S3 — `journal.tsx` stub), supporter scopes (S4), `/now` ranking (S0).

**Name consistency:** flag `MODE_NAV_V2_ENABLED` / env `EXPO_PUBLIC_ENABLE_MODE_NAV_V2`; hooks `useNowFeed`, `useNowOverflow`; components `NowCardStack`, `NowCard`, `LedgerMomentCard`, `MentorInputBar`; libs `pushNowDeepLink`, `readCachedNowFeed`/`writeCachedNowFeed`; page `mentor.tsx` (route name `mentor`), stubs `subjects.tsx`/`journal.tsx`; tab set `V2_TABS = {mentor,subjects,journal}`; i18n `mentorHome.*` + `tabs.{mentor,subjects,journal}`. Schema names consumed verbatim from S0: `NowResponse`, `NowCard`, `NowDeepLink`, `NowDeepLinkRoute`, `NowOverflowResponse`, `nowResponseSchema`, `nowOverflowResponseSchema`, route-catalog keys `session.resume`/`subject.hub`/`subject.topic`/`retention.review`/`challenge.start`, card kinds `unfinished_session`/`retention_due`/`parked_item`/`needs_deepening`/`challenge_ready`/`ledger_moment`. All used identically across tasks, the card-type table, the tests, and the cross-plan handoff below.

**Deferred-decision scan:** decline semantics decided (client-local dismiss for Me scope, T-note); overflow rendering decided (inline expand, not a new route, T9); school-day heuristic decided (Mon–Fri + afternoon/evening via `getTimeOfDay`+`getDay`, T11); feed-unavailable fallback decided (cached feed → ErrorFallback, with a synthesized continue card, T11); empty-feed onboarding target decided (`/(app)/create-subject`, T9); `retention.review`/`challenge.start` leaf-route gap decided (route to `subject.topic` sheet until S2 builds the dedicated leaves, T6 note). No "TBD"/"handle appropriately" remain.

**Cross-plan names introduced (for S2/S3 consistency):**
- **Feed hook:** `useNowFeed()` (+ `useNowOverflow(enabled)`) in `apps/mobile/src/hooks/use-now-feed.ts` — the single typed `/now` consumer; S2's hub "Next up" block and S3's Journal both read the same `/now` source via this hook (or a scope-parametrized successor S4 adds), never a second client.
- **Card-stack component:** `NowCardStack` (with `NowCard` / `LedgerMomentCard` children) in `apps/mobile/src/components/mentor/` — S2's hub "Next up" block reuses `NowCard` (same `/now` card source per spec §5.1); S4 extends it with scope-aware rendering, never forks it.
- **Deep-link expander:** `pushNowDeepLink` in `apps/mobile/src/lib/now-deep-link.ts` — the one place catalog keys become Expo Router paths; S2/S4 add catalog keys to its `PATH_BUILDERS` in lockstep with S0's `ROUTE_CATALOG`, never a parallel mapper.
- **V2 tab set + flag seam:** `V2_TABS` and the `useNavigationShellContract` V2 branch — S2/S3 fill `subjects.tsx`/`journal.tsx`; S4 extends *this* branch with the scope chip, never the legacy contract files.
