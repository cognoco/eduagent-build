---
title: Centralize Three Duplication Hotspots (time formatting, read-query hooks, route-context unwrap) — Implementation Plan
date: 2026-05-29
profile: change
status: draft
---

# Centralize Three Duplication Hotspots — Implementation Plan

**Goal:** Remove three independent sources of copy-paste drift — per-screen date/time
formatters (mobile), hand-written read-query boilerplate (mobile), and the inlined
profile/db unwrap in API route handlers — by routing each through a single canonical
helper, and install forward-only guard tests so the drift cannot re-accumulate.

**Approach:** Each finding becomes its own self-contained phase shippable as its own PR
(A = mobile time formatting, B = mobile query hooks, C = API route-context). Within each
phase: (1) build/extend the canonical helper, (2) migrate the duplicate sites, (3) add a
guard test that fails CI on new violations. The phases share no code and can ship in any
order. Where a full mechanical sweep is large (B, C), the canonical helper + guard ship
now and the long-tail sweep is batched and tracked, so no PR is unreviewably large.

## Scope

In scope:
- `apps/mobile/src/lib/format-relative-date.ts` (+ new `apps/mobile/src/hooks/use-time-format.ts`)
- The 14 mobile sites listed in Phase A
- `apps/mobile/src/hooks/use-api-query.ts` (new), the 3 session hooks, `query-keys.ts`
- `apps/api/src/route-utils/route-context.ts` and the 32 route files in Phase C
- `apps/mobile/src/i18n/locales/en.json` (new `time.*` keys)
- New guard tests (one per phase)

Out of scope:
- Changing any rendered behavior except the two explicitly-noted unifications
  (quiz timer `9:05` → `09:05`; duration null-sentinel unification) — see Phase A notes.
- Touching mutation hooks in Phase B (only read/`useQuery` sites are in scope).
- The ~12 webhook/health/seed API routes that have no profile auth (Phase C).
- Adopting a third-party date library (none is installed; we extend the in-repo helper).

---

## Phase A — Mobile time/date formatting (Finding #4)

**Why a parts-split, not "point everyone at the English helper":** the canonical
`formatRelativeDate` (`format-relative-date.ts:10`) returns **hardcoded English**
(`"Today"`, `"Yesterday"`, `"N days ago"`, `"Nd"`, `"Nmo"`, `"Ny"`) and is already used in
~10 places, so it currently renders English to de/es/ja/nb/pl/pt users. The 5 divergent
screens forked it precisely to get i18n + week handling. We therefore separate **pure
computation** (returns a structured part, fully testable, locale-free) from **i18n
presentation** (a hook that maps parts through `t()`). Existing English call-sites keep
identical output via a thin `formatRelativeShort`; the divergent screens move to the i18n
hook. This de-duplicates without forcing an i18n migration of the existing English
call-sites in this PR (that gap is captured as a tracked follow-up, A-followup below).

### Surface map (Phase A)

| File:line | Today | Target |
|---|---|---|
| `lib/format-relative-date.ts:1-30` | canonical module | extend: add `getRelativeDateParts`, `formatRelativeShort`, `formatTimer`, `getDurationParts`; keep `formatMinutes`, `formatRelativeDate` |
| `hooks/use-time-format.ts` | — (new) | `useRelativeDate()`, `useDurationLabel()` i18n hooks |
| `app/(app)/quiz/history.tsx:15-31` | local relative-date | `useRelativeDate()` |
| `app/(app)/progress/saved.tsx:20-35` | local relative-date (takes `t`) | `useRelativeDate()` |
| `app/(app)/my-notes/[kind].tsx:82-101` | local relative-date | `useRelativeDate()` |
| `app/(app)/topic/[topicId].tsx:68-86` | local relative-date + `"Last studied"` prefix | `useRelativeDate()`; keep prefix in JSX |
| `app/(app)/practice/assessment-picker.tsx:14-21` | local relative-date (i18n) | `useRelativeDate()` |
| `components/session/SessionTimer.tsx:4-11` | local MM:SS | `formatTimer()` |
| `components/session/FluencyDrillStrip.tsx:6-10` | local MM:SS (identical) | `formatTimer()` |
| `app/(app)/quiz/play.tsx:52-57` | local MM:SS (minutes not padded) | `formatTimer()` — **unifies to padded `09:05`** |
| `components/library/TopicSessionRow.tsx:14-18` | local sec→min (`Math.floor`) | `useDurationLabel()` |
| `components/progress/RecentSessionsList.tsx:27-32` | local sec→min | `useDurationLabel()` |
| `app/(app)/child/[profileId]/session/[sessionId].tsx:43-47` | local sec→min | `useDurationLabel()` |
| `app/(app)/child/[profileId]/subjects/[subjectId].tsx:47-52` | local sec→min | `useDurationLabel()` |
| `app/(app)/child/[profileId]/topic/[topicId].tsx:41-46` | local sec→min | `useDurationLabel()` |
| `app/(app)/my-notes/[kind].tsx:110-114` | local `formatMinutes(seconds)` (shadows canonical name!) | `useDurationLabel()`; delete local |

**Canonical signatures** (add to `lib/format-relative-date.ts`):

```ts
export type RelativeDatePart =
  | { unit: 'today' }
  | { unit: 'yesterday' }
  | { unit: 'days'; value: number }   // 2–6
  | { unit: 'weeks'; value: number }  // 1–3  (7–27 days)
  | { unit: 'date'; iso: string };    // ≥28 days → caller renders toLocaleDateString

// Pure, locale-free, midnight-normalized calendar-day diff via Math.round (matches canonical).
export function getRelativeDateParts(isoDate: string, now: Date = new Date()): RelativeDatePart;

// Back-compat: identical English output to today's formatRelativeDate, implemented via parts.
export function formatRelativeShort(isoDate: string, now?: Date): string;

export type DurationPart =
  | { unit: 'none' }              // null | <=0
  | { unit: 'under1' }            // 0 < seconds < 60
  | { unit: 'minutes'; value: number }   // Math.round(seconds/60), min 1
  | { unit: 'hoursMinutes'; hours: number; minutes: number };
export function getDurationParts(seconds: number | null | undefined): DurationPart;

// Always MM:SS, both sides zero-padded to 2.
export function formatTimer(totalSeconds: number): string;
```

`formatMinutes(min)` and `formatRelativeDate(iso)` stay exported unchanged (10 existing
callers depend on them; `formatRelativeDate` becomes a one-line alias of
`formatRelativeShort`).

**i18n hook** (`hooks/use-time-format.ts`):

```ts
export function useRelativeDate(): (iso: string) => string;     // maps RelativeDatePart via t('time.relative.*')
export function useDurationLabel(): (seconds: number | null) => string | null;  // maps DurationPart via t('time.duration.*')
```

**en.json keys to add** (under `time`): `relative.today`, `relative.yesterday`,
`relative.daysAgo` (`"{{count}} days ago"`), `relative.weeksAgo`
(`"{{count}} weeks ago"` + `relative.weeksAgoOne` companion `"last week"`),
`duration.under1` (`"<1 min"`), `duration.minutes` (`"{{count}} min"` + singular companion
`duration.minutesOne` `"1 min"`), `duration.hoursMinutes` (`"{{hours}}h {{minutes}}m"`),
`duration.none` (`"—"`). Run `pnpm translate` after, confirm
`scripts/check-i18n-staleness.ts` and `scripts/check-i18n-orphan-keys.ts` pass.

**Unification decisions baked in (no further input needed):**
- Duration null/zero sentinel unifies to `t('time.duration.none')` → `"—"` everywhere
  (replaces the current mix of `"—"`, `"--"`, `""`, `null`). Callers that need to hide the
  row entirely on null can branch on the returned value being the none-string, but default
  render is `"—"`.
- `quiz/play.tsx` timer changes from `9:05` to `09:05` (padded minutes) to match the two
  other timers. This is the only visible pixel change in Phase A.

### Tasks (Phase A)

- [ ] **A1:** Add the four pure functions + `RelativeDatePart`/`DurationPart` types to
  `lib/format-relative-date.ts` and make `formatRelativeDate` delegate to
  `formatRelativeShort`. — done when: new unit test `format-relative-date.test.ts` covers
  every part branch (today/yesterday/2–6 days/1–3 weeks/≥28 days; none/under1/minutes
  rounding/hoursMinutes; timer padding incl. single-digit minutes) and is green; existing
  callers of `formatRelativeDate`/`formatMinutes` still typecheck with no edits.
- [ ] **A2:** Add `hooks/use-time-format.ts` with `useRelativeDate`/`useDurationLabel`, and
  add the `time.*` keys to `en.json`. — done when: `pnpm translate` run, `pnpm exec tsc
  --noEmit` (mobile) green, and `check-i18n-orphan-keys` + `check-i18n-staleness` pass.
- [ ] **A3:** Migrate the 5 relative-date screens to `useRelativeDate()`, deleting each
  local formatter. — done when: each file's local relative-date function is gone; the
  files' related tests (`pnpm exec jest --findRelatedTests <file>`) are green; `topic`
  keeps its `"Last studied"` prefix in JSX, not in the helper.
- [ ] **A4:** Migrate the 3 timer sites to `formatTimer()` and the 6 duration sites to
  `useDurationLabel()`; delete the local `formatMinutes(seconds)` in `my-notes/[kind].tsx`.
  — done when: related jest suites green; grep shows no remaining local `padStart(2, '0')`
  MM:SS or `/ 60)` minute math in those 9 files.
- [ ] **A5:** Add guard test `lib/format-relative-date.guard.test.ts` that scans
  `apps/mobile/src/**` (excluding `format-relative-date.ts`, `use-time-format.ts`, and
  `*.test.*`) for the banned idioms — `(1000 * 60 * 60 * 24)` day-diff math, `padStart(2,
  '0')` adjacent to a `:` template, and `Math.round(/* seconds */ / 60)` / `Math.floor(…/
  60)` minute math — and asserts **zero** matches. — done when: test passes after A3/A4 and
  fails when any one migrated site is reverted (verify by temporary revert).

### Tracked follow-up (not this PR)
- **A-followup:** the ~10 existing callers of `formatRelativeShort`/`formatRelativeDate`
  still render hardcoded English. Migrating them to `useRelativeDate()` closes the
  English-to-all-locales i18n gap. Capture as a Notion work item; do NOT bundle into Phase A
  (it would double the diff and mixes a behavior fix into a de-dup refactor).

---

## Phase B — Mobile read-query hooks (Finding #5)

Two distinct wins, smallest-first:

**B-part-1: collapse the 3 near-identical session hooks.** `use-book-sessions.ts`,
`use-topic-sessions.ts`, `use-subject-sessions.ts` are ~95% identical; they differ only in
params (2 vs 2 vs 1), the Hono RPC path called, the `queryKey` prefix, and the return type.
`use-topic-sessions` additionally defines `TopicSession` locally instead of importing from
`@eduagent/schemas` — a schema-contract gap to fix in the same task.

**B-part-2: a `useApiQuery` wrapper** to absorb the read-query boilerplate replicated at 88
`queryFn`/96 `combinedSignal` sites. No such wrapper exists today; the only shared piece is
`combinedSignal` (`lib/query-timeout.ts`). Ship the wrapper + migrate the 3 session hooks
(proving the abstraction) + a guard ratchet now; sweep the remaining read hooks in tracked
batches (the long tail is mechanical but too large to review in one PR).

### Surface map (Phase B)

| File | Today | Target |
|---|---|---|
| `hooks/use-api-query.ts` | — (new) | `useApiQuery<TResp, TData>` wrapper |
| `hooks/use-book-sessions.ts` | full boilerplate | thin call to `useApiQuery` |
| `hooks/use-topic-sessions.ts` | full boilerplate + local `TopicSession` | thin call; import `TopicSession` from schemas |
| `hooks/use-subject-sessions.ts` | full boilerplate | thin call to `useApiQuery` |
| `packages/schemas/src/...` | — | add/confirm `TopicSession` export |
| `lib/query-keys.ts` | partial registry | add `book-sessions`/`topic-sessions`/`subject-sessions` key factories |

**Wrapper signature** (`hooks/use-api-query.ts`):

```ts
import type { QueryKey, UseQueryResult } from '@tanstack/react-query';

export function useApiQuery<TResponse, TData = TResponse>(opts: {
  queryKey: QueryKey;
  enabled?: boolean;                 // ANDed with !!activeProfile internally
  fetch: (signal: AbortSignal) => Promise<Response>;
  select: (json: TResponse) => TData;
}): UseQueryResult<TData>;
```

Internals encapsulate the exact repeated block (representative original at
`use-settings.ts:38-59`): `combinedSignal(querySignal)` → `try { res = await fetch(signal);
await assertOk(res); return select(await res.json()) } finally { cleanup() }`, with
`enabled: (opts.enabled ?? true) && !!activeProfile`. `useProfile()`/`useApiClient()` are
read inside the wrapper so call-sites stop repeating them.

Each session hook collapses to e.g.:

```ts
export function useSubjectSessions(subjectId: string | undefined) {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  return useApiQuery<GetSubjectSessionsResponse, SubjectSession[]>({
    queryKey: queryKeys.subjectSessions(subjectId, activeProfile?.id),
    enabled: !!subjectId,
    fetch: (signal) => client.subjects[':subjectId'].sessions.$get(
      { param: { subjectId: subjectId! } }, { init: { signal } }),
    select: (data) => data.sessions,
  });
}
```

### Tasks (Phase B)

- [ ] **B1:** Confirm whether `@eduagent/schemas` already exports a `TopicSession` shape;
  if not, add it (mirroring `BookSession`/`SubjectSession`) and re-export through the
  package barrel. — done when: `import { TopicSession } from '@eduagent/schemas'` typechecks
  and the local interface in `use-topic-sessions.ts` is deleted.
- [ ] **B2:** Add `useApiQuery` in `hooks/use-api-query.ts` with a co-located test that
  exercises: success path returns `select(json)`; `assertOk` rejection propagates; `enabled`
  false ANDs with profile; `cleanup()` runs on both success and error. — done when: the test
  is green (mock only the external boundary — the Hono client `$get`/Response — never
  internal modules; per GC1).
- [ ] **B3:** Add the three session key factories to `lib/query-keys.ts` preserving the
  exact existing prefixes (`'book-sessions'`, `'topic-sessions'`, `'subject-sessions'`) and
  member order so TanStack cache identity and invalidation are unchanged. — done when:
  `queryKeys.bookSessions(...)` etc. exist and return arrays byte-identical to the current
  inline literals.
- [ ] **B4:** Rewrite the 3 session hooks as thin `useApiQuery` calls using the new key
  factories. — done when: each file ≤ ~12 lines; `pnpm exec jest --findRelatedTests` for the
  three hooks and any screen that consumes them is green; a manual diff confirms the emitted
  `queryKey` and returned data shape are unchanged.
- [ ] **B5:** Add guard test `hooks/use-api-query.guard.test.ts` that counts read-query
  sites still inlining the boilerplate (`combinedSignal(` inside a `queryFn`, i.e. excluding
  mutation callbacks) across `apps/mobile/src/hooks/**`, snapshots the **current** count as a
  baseline constant, and fails if the count **increases**. — done when: test passes at the
  post-B4 count and fails if a new inline `queryFn` boilerplate hook is added (verify by
  temporarily adding one).

### Tracked follow-up (not this PR)
- **B-followup:** sweep the remaining ~85 read-query hooks onto `useApiQuery`, in batches by
  folder (e.g. `hooks/`, then feature dirs), each batch its own commit verified by that
  batch's related jest suites. Record as a Notion work item with the baseline count from B5
  as the burn-down target. The B5 ratchet guarantees the backlog only shrinks.

---

## Phase C — API route-context unwrap (Finding #6)

`withProfile(c)` (`route-utils/route-context.ts:47`) returns `{ db, profileId, user }` and
was introduced (2026-05-03 governance audit, item H4) to replace the per-handler unwrap,
but is used in only 2 of ~34 auth-requiring route files (`assessments.ts`,
`challenge-round.ts`, 9 call-sites). The inline idiom `requireProfileId(c.get('profileId'))`
appears **199 times** across **32 files**; `const db = c.get('db')` 220 times.

Adoption gaps to design around (all confirmed):
1. **`parentProfileId` rename** — ~34 sites across 5 files (`consent.ts`, `dashboard.ts`,
   `learner-profile.ts`, `onboarding.ts`, `recaps.ts`) bind the value to `parentProfileId`,
   not `profileId`. Solved by destructure-rename: `const { profileId: parentProfileId, db }
   = withProfile(c)`.
2. **`profileMeta` is also needed** (145+ reads) and `withProfile` doesn't return it.
   Confirmed `profileMeta` is `ProfileMeta | undefined` in context (`route-context.ts:31`),
   so we **add it to `withProfile`'s return** as `ProfileMeta | undefined` — handlers that
   don't need it ignore it; handlers that do stop writing the separate `c.get('profileMeta')`.
3. **Some handlers need only one value** (e.g. a validation-only `requireProfileId`) — those
   stay inline; `withProfile` over-extracts there. Not a sweep target.

**New `withProfile` signature:**

```ts
export function withProfile<E extends RouteEnv>(c: Context<E>): {
  db: Database;
  profileId: string;          // requireProfileId — throws if absent
  user: AuthUser;
  profileMeta: ProfileMeta | undefined;
};
```

### Tasks (Phase C)

- [ ] **C1:** Extend `withProfile` to also return `profileMeta: c.get('profileMeta')`, and
  update its doc comment + the existing co-located test (if any) to cover the new field. —
  done when: `apps/api` typecheck green; `assessments.ts`/`challenge-round.ts` still compile
  unchanged (additive return); `pnpm exec nx run api:test` for the route-context test green.
- [ ] **C2:** Add guard test `route-utils/route-context.guard.test.ts` that counts inline
  `requireProfileId(c.get('profileId'))` occurrences across `apps/api/src/routes/**`
  (non-test `.ts`), snapshots the current count (199) as a baseline constant, and fails if
  the count **increases**. — done when: test passes at 199 and fails when a new inline is
  added (verify by temporary add). This satisfies the CLAUDE.md "sweep-when-you-fix" rule
  (option a: guard + sweep) for the batches we do, and (option b: tracked deferral) for the
  remainder.
- [ ] **C3:** Sweep the highest-density route files onto `withProfile` first — the files
  with the most inline sites (start with `sessions.ts` and the next 4 by count). Each file
  is one commit. Use destructure-rename for `parentProfileId` files. — done when: per file,
  `pnpm exec nx run api:test` for that route's suite is green AND
  `pnpm exec nx test:integration api` (the integration suite the hooks skip) is green — auth
  scoping regressions only show in integration tests; decrement the C2 baseline by the number
  of sites removed in the same commit so the guard stays exact.

### Tracked follow-up (not this PR)
- **C-followup:** sweep the remaining route files (the long tail of the 32) onto
  `withProfile`, one file per commit, decrementing the C2 baseline each time. Record as a
  Notion work item. The C2 ratchet prevents new inlines while the backlog burns down.

---

## Cross-phase verification

- Each phase ships independently; no shared files, so PR order is free.
- Phase A: mobile typecheck + i18n checks + related jest suites + guard test.
- Phase B: mobile typecheck + related jest suites (hooks + consuming screens) + guard test.
- Phase C: `nx run api:test` **and** `nx test:integration api` (auth scoping) + guard test.
- All three guard tests are forward-only ratchets, satisfying the "sweep when you fix"
  rule: we sweep the high-value sites now and the guard forbids regression while the tracked
  follow-ups burn down the long tails.

## Self-review notes (done)
- Spec coverage: each of findings #4/#5/#6 maps to phase A/B/C; every duplicate site from
  the verification audit appears in a surface map.
- No deferred decisions: unification choices (timer padding, null sentinel), the parts-vs-
  English split, the `withProfile` profileMeta addition, and the migrate-now-vs-track-later
  boundaries are all decided here, not left to the implementer.
- Name consistency: `getRelativeDateParts`/`formatRelativeShort`/`formatTimer`/
  `getDurationParts`/`useRelativeDate`/`useDurationLabel`/`useApiQuery`/`withProfile` used
  identically across surface maps, signatures, and tasks.
