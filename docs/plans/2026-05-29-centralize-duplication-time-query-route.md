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
- The existing English callers of `formatRelativeDate`/`formatMinutes` (~10 sites) — they
  stay on the untouched canonical functions; their i18n gap is A-followup, not this PR.

**Phase A changes rendered date strings — this is intentional, not "no behavior change."**
The earlier draft claimed Phase A had only two pixel changes. That was wrong: the six
migrated screens currently diverge in rounding, bucketing, fallback, and granularity, so
unifying them onto one helper necessarily changes what several of them render. Every change
is enumerated in the **Behavior-change table** below and must be confirmed before coding
(repo rule: spec behavior/failure modes before coding). The remaining out-of-scope items:
- Touching mutation hooks in Phase B (only read/`useQuery` sites are in scope).
- The ~12 webhook/health/seed API routes that have no profile auth (Phase C).
- Adopting a third-party date library (none is installed; we extend the in-repo helper).

---

## Phase A — Mobile time/date formatting (Finding #4)

**Why a parts-split, and what it actually changes:** the canonical
`formatRelativeDate` (`format-relative-date.ts:10`) returns **hardcoded English**
(`"Today"`, `"Yesterday"`, `"N days ago"`, `"Nd"`, `"Nmo"`, `"Ny"`) and is already used in
~10 places, so it currently renders English to de/es/ja/nb/pl/pt users. The migrated screens
did **not** simply fork it for i18n — they each hand-rolled a *different* relative-date
algorithm. Verified divergence (this is why one shared helper must change output):

| Screen | Diff rounding | Buckets after Yesterday | Fallback (far past) |
|---|---|---|---|
| `quiz/history.tsx:15-31` | `Math.round`, midnight-normalized | none (jumps straight to date) | locale **long** date (month long, day, year-if-diff) |
| `my-notes/[kind].tsx:82-101` | `Math.round`, midnight-normalized | none | locale **short** date (month short, day) |
| `progress/saved.tsx:20-35` | `Math.floor`, raw-ms | days-ago (<7), weeks-ago `floor/7` (<30) | locale default date |
| `topic/[topicId].tsx:68-86` | `Math.floor`, raw-ms | days-ago (<7), **"last week" (<14)**, weeks-ago (<30) | locale short date; also a `"Never studied"` null branch |
| `assessment-picker.tsx:14-21` | `Math.floor`, raw-ms | days-ago, **unbounded** | none (renders "300 days ago") |
| `child/[profileId]/index.tsx:48-65` | `Math.floor`, raw-ms | **hours-ago**, days, weeks (<5wk), months (<12) | months/years |

Because these differ in rounding, bucketing, fallback, **and** granularity, unifying them
onto one helper unavoidably changes rendered strings on most of them — see the
**Behavior-change table** below; every change must be UX-confirmed before A3 runs. We
separate **pure computation** (`getRelativeDateParts`, locale-free, fully testable) from
**i18n presentation** (a hook mapping parts through `t()`).

The ~10 existing English callers of `formatRelativeDate`/`formatMinutes` are **left
untouched** — `formatRelativeDate` keeps its exact current `Nd`/`Nmo`/`Ny` output. We do
**not** reimplement it via the new parts (the parts enum deliberately drops the `Nd`/`Nmo`/`Ny`
short form, so it cannot reproduce that output — the earlier `formatRelativeShort` shim was
removed for exactly this reason). Those callers' i18n gap stays as tracked A-followup.

### Surface map (Phase A)

| File:line | Today | Target |
|---|---|---|
| `lib/format-relative-date.ts:1-39` | canonical module | extend: add `getRelativeDateParts`, `formatTimer`, `getDurationParts`; keep `formatMinutes` and `formatRelativeDate` **byte-for-byte unchanged** |
| `hooks/use-time-format.ts` | — (new) | `useRelativeDate()`, `useDurationLabel()` i18n hooks |
| `app/(app)/quiz/history.tsx:15-31` | local relative-date | `useRelativeDate()` |
| `app/(app)/progress/saved.tsx:20-35` | local relative-date (takes `t`) | `useRelativeDate()` |
| `app/(app)/my-notes/[kind].tsx:82-101` | local relative-date | `useRelativeDate()` |
| `app/(app)/topic/[topicId].tsx:68-86` | local relative-date + `"Last studied"` prefix + `"Never studied"` null branch | `useRelativeDate()`; keep prefix + null branch in JSX (the hook takes a non-null iso) |
| `app/(app)/practice/assessment-picker.tsx:14-21` | local relative-date (i18n), unbounded days-ago | `useRelativeDate()` |
| `components/session/SessionTimer.tsx:4-11` | local MM:SS | `formatTimer()` |
| `components/session/FluencyDrillStrip.tsx:6-10` | local MM:SS (identical) | `formatTimer()` |
| `app/(app)/quiz/play.tsx:52-57` | local MM:SS (minutes not padded) | `formatTimer()` — **unifies to padded `09:05`** |
| `components/library/TopicSessionRow.tsx:14-18` | local sec→min (`Math.floor`) | `useDurationLabel()` |
| `components/progress/RecentSessionsList.tsx:27-32` | local sec→min | `useDurationLabel()` |
| `app/(app)/child/[profileId]/session/[sessionId].tsx:43-47` | local sec→min | `useDurationLabel()` |
| `app/(app)/child/[profileId]/subjects/[subjectId].tsx:47-52` | local sec→min | `useDurationLabel()` |
| `app/(app)/child/[profileId]/topic/[topicId].tsx:41-46` | local sec→min | `useDurationLabel()` |
| `app/(app)/my-notes/[kind].tsx:110-114` | local `formatMinutes(seconds)` (shadows canonical name!) | `useDurationLabel()`; delete local |

**Verified sites deliberately NOT migrated in this PR** (recorded so the next contributor
doesn't read the omission as oversight):
- `app/(app)/my-notes/[kind].tsx:103-108` `formatInlineDate` — a plain `toLocaleDateString`
  with **no relative logic**. It is not a relative-date duplicate; folding it into
  `useRelativeDate()` would convert absolute dates into relative phrases (a behavior change
  with no de-dup value). Leave it. The A5 guard's banned idioms (day-diff math, `padStart`,
  `/60`) do not match it, so it does not trip the guard.
- `app/(app)/child/[profileId]/index.tsx:48-65` — a relative formatter with **hours-ago**
  granularity ("3 hours ago") that the part model intentionally omits (no other screen needs
  sub-day resolution). Forcing it into the shared helper would either drop the hours bucket
  (behavior regression) or pollute the enum for one caller. Tracked as **A-followup-2**, not
  this PR.

**Canonical signatures** (add to `lib/format-relative-date.ts`):

```ts
export type RelativeDatePart =
  | { unit: 'today' }
  | { unit: 'yesterday' }
  | { unit: 'days'; value: number }   // 2–6
  | { unit: 'lastWeek' }              // 7–13 days  → "last week" (covers topic's special case)
  | { unit: 'weeks'; value: number }  // 14–29 days → value = Math.round(diff/7) ∈ {2,3,4}
  | { unit: 'date'; iso: string };    // ≥30 days → caller renders toLocaleDateString

// Pure, locale-free. CANONICAL ALGORITHM (chosen deliberately — see Behavior-change table):
// midnight-normalize both dates, then diffDays = Math.round((todayMidnight - thenMidnight)/86_400_000).
// This is the more-correct calendar-day diff; the raw-ms Math.floor used by 4 of the screens
// has a late-night/DST off-by-one that this fixes (a flagged behavior change, not a bug we keep).
export function getRelativeDateParts(isoDate: string, now: Date = new Date()): RelativeDatePart;

export type DurationPart =
  | { unit: 'none' }              // null | <=0
  | { unit: 'under1' }            // 0 < seconds < 60
  | { unit: 'minutes'; value: number }   // Math.round(seconds/60), min 1
  | { unit: 'hoursMinutes'; hours: number; minutes: number };
export function getDurationParts(seconds: number | null | undefined): DurationPart;

// Always MM:SS, both sides zero-padded to 2.
export function formatTimer(totalSeconds: number): string;
```

`formatMinutes(min)` and `formatRelativeDate(iso)` stay exported **unchanged** — same
implementation, same `Nd`/`Nmo`/`Ny` output. The ~10 existing callers are untouched. We do
**not** alias `formatRelativeDate` to the new parts model: the parts enum has no `Nd`/`Nmo`/
`Ny` unit, so it cannot reproduce that output. (Migrating those 10 callers to i18n is
A-followup, deliberately out of scope here.)

**i18n hook** (`hooks/use-time-format.ts`):

```ts
export function useRelativeDate(): (iso: string) => string;     // maps RelativeDatePart via t('time.relative.*')
export function useDurationLabel(): (seconds: number | null) => string | null;  // maps DurationPart via t('time.duration.*')
```

**en.json keys to add** (under `time`): `relative.today`, `relative.yesterday`,
`relative.daysAgo` (`"{{count}} days ago"`), `relative.lastWeek` (`"last week"`, no
interpolation — maps the `lastWeek` part), `relative.weeksAgo` (`"{{count}} weeks ago"`),
`duration.under1` (`"<1 min"`), `duration.minutes` (`"{{count}} min"` + singular companion
`duration.minutesOne` `"1 min"`), `duration.hoursMinutes` (`"{{hours}}h {{minutes}}m"`),
`duration.none` (`"—"`). Run `pnpm translate` after, confirm
`scripts/check-i18n-staleness.ts` and `scripts/check-i18n-orphan-keys.ts` pass.

**Orphaned per-screen keys must be deleted in the same task as the migration.** Migrating a
screen off its hand-rolled formatter strands its old keys, and `check-i18n-orphan-keys.ts`
runs reverse-orphan (unused-key) detection **default-on** — so A3 fails its own "checker
passes" gate unless these are removed in the same commit. Known orphans to delete (grep each
for zero remaining `t(` references first):
`progress.saved.dateToday` / `dateYesterday` / `dateDaysAgo` / `dateWeeksAgo`;
`assessment.studiedToday` / `studiedYesterday` / `studiedDaysAgo`;
`quiz.history.dateToday` / `dateYesterday`. (Verified live: `progress.saved.dateWeeksAgo`
exists at `en.json:1514` region; the rest are referenced from the screens listed in the
surface map.)

**Unification decisions baked in (no further input needed):**
- Duration null/zero sentinel unifies to `t('time.duration.none')` → `"—"` everywhere
  (replaces the current mix of `"—"`, `"--"`, `""`, `null`). Callers that need to hide the
  row entirely on null can branch on the returned value being the none-string, but default
  render is `"—"`.
- `quiz/play.tsx` timer changes from `9:05` to `09:05` (padded minutes) to match the two
  other timers.

### Behavior-change table (Phase A — MUST be UX-confirmed before A3)

Unifying six different algorithms onto one helper changes rendered output. Each row is a
**user-visible** change; none is a pure refactor. Confirm acceptable before migrating.

| Screen | Today (example: 4 days ago) | After unification | Change class |
|---|---|---|---|
| `quiz/history.tsx` | locale long date ("October 24, 2026") | "4 days ago" | section headers become relative |
| `my-notes/[kind].tsx` | locale short date ("Oct 24") | "4 days ago" | absolute → relative |
| `progress/saved.tsx` | "4 days ago" (already) | "4 days ago" | unchanged at 4d; boundary shifts only (round vs floor) |
| `topic/[topicId].tsx` | "Last studied 4 days ago" | "Last studied 4 days ago" | unchanged at 4d; far-past fallback now ≥30d not ≥30d-floor |
| `assessment-picker.tsx` | "300 days ago" | locale date | unbounded days-ago now caps to a date past 29 days |
| (all 4 floor-based screens) | `Math.floor` raw-ms boundary | `Math.round` midnight-normalized | the Yesterday↔"2 days ago" boundary moves; late-night off-by-one fixed |

If any of these is undesirable for a given screen, the resolution is to keep that screen on
its own formatter (and exclude it from A3), **not** to silently parameterize the helper into
six variants. Decide per-screen before coding.

### Tasks (Phase A)

- [ ] **A1:** Add the three new pure functions (`getRelativeDateParts`, `getDurationParts`,
  `formatTimer`) + `RelativeDatePart`/`DurationPart` types to `lib/format-relative-date.ts`.
  Leave `formatRelativeDate` and `formatMinutes` **byte-for-byte unchanged** (do NOT alias or
  reimplement them). — done when: new unit test `format-relative-date.test.ts` covers every
  part branch (today / yesterday / 2–6 days / lastWeek 7–13 / weeks 14–29 / date ≥30;
  none / under1 / minutes rounding / hoursMinutes; timer padding incl. single-digit minutes)
  and is green; a snapshot/equality test asserts `formatRelativeDate` output is identical to
  pre-PR for a fixed date fixture; existing callers still typecheck with no edits.
- [ ] **A2:** Add `hooks/use-time-format.ts` with `useRelativeDate`/`useDurationLabel`, and
  add the `time.*` keys to `en.json`. — done when: `pnpm translate` run, `pnpm exec tsc
  --noEmit` (mobile) green, and `check-i18n-orphan-keys` + `check-i18n-staleness` pass.
- [ ] **A3:** After the Behavior-change table is UX-confirmed, migrate the 5 relative-date
  screens to `useRelativeDate()`, deleting each local formatter AND its now-orphaned en.json
  keys (see the orphan list above) in the same commit. — done when: each file's local
  relative-date function is gone; the orphaned per-screen keys are removed and
  `check-i18n-orphan-keys` (reverse-orphan, default-on) passes; the files' related tests
  (`pnpm exec jest --findRelatedTests <file>`) are green and their assertions are **updated
  to the new rendered strings** from the Behavior-change table (not left asserting the old
  output); `topic` keeps its `"Last studied"` prefix and `"Never studied"` null branch in
  JSX, not in the helper.
- [ ] **A4:** Migrate the 3 timer sites to `formatTimer()` and the 6 duration sites to
  `useDurationLabel()`; delete the local `formatMinutes(seconds)` in `my-notes/[kind].tsx`.
  — done when: related jest suites green; grep shows no remaining local `padStart(2, '0')`
  MM:SS or `/ 60)` minute math in those 9 files.
- [ ] **A5:** Add guard test `lib/format-relative-date.guard.test.ts` scanning
  `apps/mobile/src/**` (excluding `format-relative-date.ts`, `use-time-format.ts`, and
  `*.test.*`) for the banned idioms — `(1000 * 60 * 60 * 24)` day-diff math, `padStart(2,
  '0')` adjacent to a `:` template, and `Math.round(/* seconds */ / 60)` / `Math.floor(…/ 60)`
  minute math. **The day-diff constant is NOT exclusively a display idiom** — verified live, it
  legitimately remains in 4 non-formatting files after A3: `child/[profileId]/reports.tsx:33`
  (countdown to next run), `lib/progress.ts:22` (streak derivation),
  `lib/retention-utils.ts:32` (review scheduling), and
  `shelf/[subjectId]/book/_view-models/book-derived-state.ts:37` (view-model). The guard must
  carry these four as a named `KNOWN_NON_DISPLAY` allowlist (with a one-line reason each) and
  assert zero matches **outside** it — a bare "zero matches anywhere" assertion cannot pass.
  Adding a new file to the allowlist requires a reason, mirroring the i18n-keep pattern. Note
  `child/[profileId]/index.tsx` is intentionally unmigrated (A-followup-2) but uses
  `1000 * 60 * 60` (hours), not the day constant, so it does not trip this guard. — done when:
  test passes after A3/A4 with the allowlist, and fails when any one migrated site is reverted
  (verify by temporary revert).

### Tracked follow-up (not this PR)
- **A-followup:** the ~10 existing callers of `formatRelativeDate` still render hardcoded
  English. Migrating them to `useRelativeDate()` closes the English-to-all-locales i18n gap.
  Capture as a Notion work item; do NOT bundle into Phase A (it would double the diff and
  mixes a behavior fix into a de-dup refactor).
- **A-followup-2:** `child/[profileId]/index.tsx:48-65` needs an **hours-aware** relative
  formatter (the part model omits sub-day granularity). Either extend the part enum with an
  `hours` unit behind this caller, or give it a dedicated `useRelativeDateTime()` hook.
  Capture as a Notion work item.

---

## Phase B — Mobile read-query hooks (Finding #5)

Two distinct wins, smallest-first:

**B-part-1: collapse the 3 near-identical session hooks.** `use-book-sessions.ts`,
`use-topic-sessions.ts`, `use-subject-sessions.ts` are ~95% identical; they differ only in
params (2 vs 2 vs 1), the Hono RPC path called, the `queryKey` prefix, and the return type.
`use-topic-sessions` additionally defines `TopicSession` locally instead of importing from
`@eduagent/schemas` — a schema-contract gap to fix in the same task. **Verified state:**
`BookSession`, `SubjectSession`, `GetBookSessionsResponse`, `GetSubjectSessionsResponse` all
live in `packages/schemas/src/subjects.ts:848-876`, but there is **no** exported
`TopicSession` type there — there is a `TopicSessionsResponse` (and `topicSessionsResponseSchema`)
in `packages/schemas/src/notes.ts:136`. So B1 must either export the element type of that
existing schema or add a `TopicSession` to `subjects.ts` alongside its siblings; it must NOT
assume a `TopicSession` already exists. Confirm the local interface
(`{ id; sessionType; durationSeconds: number | null; createdAt }`, `use-topic-sessions.ts:7-12`)
matches the chosen schema's element shape before deleting it.

**B-part-2: a `useApiQuery` wrapper** to absorb the read-query boilerplate. `combinedSignal`
appears **134 times across 36 files** in `apps/mobile/src` (verified live — this includes
mutation callbacks and the `lib/query-timeout.ts` definition itself, so the read-query subset
is smaller; the earlier "88/96" figures were estimates, do not treat them as exact). The B5
guard snapshots the **actual** count at implementation time, so the baseline is
self-correcting — but the prose count is illustrative, not authoritative. No such wrapper
exists today; the only shared piece is `combinedSignal` (`lib/query-timeout.ts`). Ship the
wrapper + migrate the 3 session hooks
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

## Self-review notes (revised after adversarial review, 2026-05-29)
- Spec coverage: findings #4/#5/#6 map to phases A/B/C. Phase A's relative-date surface is
  larger than first audited — six divergent formatters, not "5 i18n forks." Two are
  deliberately excluded with reasons (`my-notes` `formatInlineDate`, `child/[profileId]/index.tsx`
  → A-followup-2); the rest are in the surface map and the Behavior-change table.
- **Behavior changes are real and enumerated.** The earlier "only two pixel changes" claim
  was false: unifying six algorithms changes rendered output on most migrated date screens
  (rounding, bucketing, fallback, granularity all differed). See the Behavior-change table —
  it is a coding gate, requires UX confirmation, and migrated tests must assert the new
  strings (per CLAUDE.md "match assertions to current behavior").
- **No `formatRelativeShort` shim.** The original back-compat claim was impossible (the part
  enum cannot emit `Nd`/`Nmo`/`Ny`). `formatRelativeDate` is left untouched instead; its i18n
  gap is A-followup.
- Decisions made here (not deferred to implementer): timer padding, duration null sentinel,
  the part enum + canonical rounding, the orphan-key cleanup obligation, the guard allowlist,
  and the migrate-now-vs-track-later boundaries. The one item that is **not** auto-decided —
  by design — is per-screen acceptance of the Behavior-change table, which needs UX sign-off.
- Phase C verified exact: 199 inline unwraps / 32 files, 220 `c.get('db')`; `profileMeta` is
  `ProfileMeta | undefined` at `route-context.ts:31`; additive return is safe.
- Name consistency: `getRelativeDateParts`/`formatTimer`/`getDurationParts`/`useRelativeDate`/
  `useDurationLabel`/`useApiQuery`/`withProfile` used identically across surface maps,
  signatures, and tasks (`formatRelativeShort` removed everywhere).
