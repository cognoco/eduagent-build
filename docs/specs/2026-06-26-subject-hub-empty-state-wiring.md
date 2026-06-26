# Subject-Hub Empty State — State-Aware Wiring

> Status: Draft · 2026-06-26 · Surface: V2 `subject-hub` (mobile) · Owner: TBD
> Scope class: mobile UI + one mobile data hook. No API, no migration, no nav-flag change.

## Problem

The V2 subject-hub renders a single generic card — **"Nothing to study here yet"**
(`apps/mobile/src/app/(app)/subject-hub/[subjectId]/index.tsx:135`) — whenever a
subject resolves to zero active topics and zero chapters
(`index.tsx:113-114`; topics only count from books with `topicsGenerated === true`,
`hooks/use-subject-hub.ts:384`).

That one card stands in for **three genuinely different states**, and recovers from
none of them:

1. **Preparing** — books exist but their topics are still generating
   asynchronously (`services/subject.ts:526-544` → Inngest `subject-prewarm-curriculum.ts`).
   Normal latency window of seconds.
2. **Failed / stuck** — prewarm threw `NonRetriableError('prewarm-empty-topics')`
   or exhausted its 2 retries, or consent/network blocked dispatch
   (`inngest/functions/subject-prewarm-curriculum.ts:77,189`). The book sits at
   `topicsGenerated=false` indefinitely; there is no "failed" marker.
3. **Broad, no book picked** — broad classification persists only book *suggestions*,
   no book rows (`services/subject.ts:601-622`), and routes to `/pick-book`. Backing
   out and re-entering the subject lands here with nothing.

Two aggravators make it look broken rather than transient:

- **No auto-refresh.** `useBooks` has no `refetchInterval` (`hooks/use-books.ts:43`).
  The subjects *list* polls every 3s while `curriculumStatus === 'preparing'`
  (`hooks/use-subjects.ts:99-106`), but the hub's book queries do not. So even the
  normal preparing window shows a static dead-end.
- **Retry does nothing useful.** The empty-state Retry calls `hub.refetch()`
  (`index.tsx:143`) — a re-read. It never triggers regeneration, so a genuinely
  stuck subject returns the identical empty screen on every press.

## Goal

Replace the single generic empty card with a state-aware branch that gives each
state a correct action, reusing the infrastructure that already exists.

## What already exists (this is mostly wiring)

| Asset | Location | Reuse |
|---|---|---|
| Retry endpoint `POST /subjects/:id/retry-curriculum` → `{ dispatched: number }` | `apps/api/src/routes/subjects.ts:174`; service `subject.ts:240`; Inngest `subject-retry-curriculum.ts` | **Server-built, mobile-dormant** (SUBJECT-21, `docs/flows/mobile-app-flow-inventory.md:163`). Add a mobile caller. |
| `curriculumStatus: 'preparing' \| 'ready'` | derived `services/subject.ts:152-186`; consumed `hooks/use-subjects.ts:99-106` | The hub already calls `useSubjects`; read the status off it. |
| Generating animation + slow/timeout state machine | `app/(app)/shelf/[subjectId]/book/[bookId].tsx:1459-1546`, `components/common/MagicPenAnimation` | Reuse a slim inline version in the hub (full extraction optional, see §Out of scope). |
| `pick-book` route | `app/(app)/pick-book` | Existing CTA target for the broad case. |

## What is genuinely new (small)

1. A `useRetryCurriculum(subjectId)` mobile hook calling the existing endpoint.
2. State-branching in the hub empty-state render.
3. Polling the hub's book queries while the subject is preparing.

## Out of scope (do not touch — no regression)

- V0/legacy shelf + library behavior (`shelf/[subjectId]/index.tsx`, `BookCard.tsx`,
  `library.tsx`) — keeps "Build this book" labels and "Study next" suggestions.
- Home preparing hint (`LearnerScreen.tsx:275`).
- Book-detail generating flow (`book/[bookId].tsx`) — unchanged; we reuse, not rewrite.
- Nav flags (V0/V1/V2). This change is inside one V2 screen and does not alter gating.
- Full extraction of the generating UI into a shared `<GeneratingState />` component.
  A slim inline render in the hub is sufficient for this fix; extraction can be a
  follow-up if a third caller appears.
- API/idempotency hardening of the retry endpoint (tracked separately by the
  security audit, DS-036). This spec only adds a caller; it does not change rate
  limiting. Note the existing dedup gap so the wiring does not amplify it (§Risks).

---

## Implementation

### Task 1 — Mobile hook: `useRetryCurriculum`

The route param is `:id` (not `:subjectId`) and the response is `{ dispatched: number }`.

`apps/mobile/src/hooks/use-books.ts` (add near `useGenerateBookTopics`):

```typescript
export function useRetryCurriculum(
  subjectId: string | undefined,
): UseMutationResult<{ dispatched: number }, Error, void> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation<{ dispatched: number }, Error, void>({
    mutationFn: async () => {
      if (!subjectId) throw new Error('subjectId is required');
      const res = await client.subjects[':id']['retry-curriculum'].$post({
        param: { id: subjectId },
      });
      await assertOk(res);
      return (await res.json()) as { dispatched: number };
    },
    onSuccess: () => {
      const pid = activeProfile?.id;
      // Re-dispatch flips the subject back to 'preparing'; invalidate so the
      // hub picks up the new status and begins polling books (Task 3).
      void queryClient.invalidateQueries({ queryKey: ['subjects', pid] });
      void queryClient.invalidateQueries({ queryKey: ['books', subjectId, pid] });
    },
  });
}
```

> Confirm the actual `subjects` list query key during implementation
> (`lib/query-keys.ts`) and match it exactly in the invalidation above.

### Task 2 — Expose curriculum status + a state discriminator from the hub

`apps/mobile/src/hooks/use-subject-hub.ts` — the hook already holds `subjectsQuery`.
Derive and return the subject's status and a discriminated empty-state kind so the
screen stays presentational.

```typescript
// inside useSubjectHub, after `data` is computed:
const subject = subjectsQuery.data?.find((s) => s.id === subjectId);
const curriculumStatus = subject?.curriculumStatus ?? null; // 'preparing' | 'ready' | null

// hasUsableData mirrors the screen check today (total>0 || chapters>0).
const hasUsableData =
  !!data && (data.aggregate.total > 0 || data.chapters.length > 0);

const emptyKind: 'none' | 'preparing' | 'stuck' | 'pick-book' = !data
  ? 'none'
  : hasUsableData
    ? 'none'
    : curriculumStatus === 'preparing'
      ? 'preparing'
      : books.length === 0
        ? 'pick-book' // no book rows yet (broad suggestions, or nothing created)
        : 'stuck';    // books exist, status ready, but zero generated topics
```

Return `curriculumStatus` and `emptyKind` from the hook alongside the existing
fields. Add `refetchInterval` wiring in Task 3.

### Task 3 — Auto-poll books while preparing

So the hub resolves to ready without a manual tap. Add a `refetchInterval` to the
hub's `useBooks` call and to the `bookDetail`/`bookSession` `useQueries` *only while
preparing*. Simplest: gate on `curriculumStatus === 'preparing'`.

In `use-subject-hub.ts`, pass the preparing flag into a `refetchInterval` on the
book queries:

```typescript
const PREPARING_POLL_MS = 3000; // match use-subjects.ts

// books query:
const booksQuery = useBooks(subjectId, {
  refetchInterval: () => (isPreparing ? PREPARING_POLL_MS : false),
});
```

`useBooks` currently takes no options object — extend its signature to accept an
optional `{ refetchInterval }` and forward it to `useQuery`. Apply the same
`refetchInterval` to the `bookDetailQueries` / `bookSessionQueries` in `useQueries`.

> `isPreparing` here is `curriculumStatus === 'preparing'`. Because `useSubjects`
> already polls the list every 3s while preparing, the status flips to `ready`
> on its own; the book poll added here is what turns that flip into rendered topics.

### Task 4 — State-aware empty render in the screen

`apps/mobile/src/app/(app)/subject-hub/[subjectId]/index.tsx` — replace the single
`EmptyStateCard` branch (`index.tsx:135-151`) with a switch on `hub.emptyKind`.
Wire the stuck-case primary action to `useRetryCurriculum`, and the broad case to
`/pick-book`.

```tsx
const retryCurriculum = useRetryCurriculum(subjectId);

// ...inside QueryStateView, replacing the current empty branch:
{hubData && hub.emptyKind === 'preparing' ? (
  <SubjectHubPreparing testID="subject-hub-preparing" />
) : hubData && hub.emptyKind === 'stuck' ? (
  <EmptyStateCard
    variant="centered"
    testID="subject-hub-stuck"
    title={t('subjectHub.stuck.title')}
    message={t('subjectHub.stuck.message')}
    primaryAction={{
      label: t('subjectHub.stuck.retry'),
      onPress: () => retryCurriculum.mutate(),
      loading: retryCurriculum.isPending,
      testID: 'subject-hub-stuck-retry',
    }}
    secondaryAction={{
      label: t('common.goBack'),
      onPress: goBack,
      testID: 'subject-hub-stuck-back',
    }}
  />
) : hubData && hub.emptyKind === 'pick-book' ? (
  <EmptyStateCard
    variant="centered"
    testID="subject-hub-pick-book"
    title={t('subjectHub.pickBook.title')}
    message={t('subjectHub.pickBook.message')}
    primaryAction={{
      label: t('subjectHub.pickBook.cta'),
      onPress: () =>
        router.push({
          pathname: '/(app)/pick-book',
          params: { subjectId },
        } as Href),
      testID: 'subject-hub-pick-book-cta',
    }}
    secondaryAction={{
      label: t('common.goBack'),
      onPress: goBack,
      testID: 'subject-hub-pick-book-back',
    }}
  />
) : hubData ? (
  <View className="flex-1" testID="subject-hub-screen">
    <SubjectHub {...} />
  </View>
) : null}
```

`SubjectHubPreparing` is a slim inline component (or local render) reusing
`MagicPenAnimation` + the "Writing your book…"-style copy from
`book/[bookId].tsx:1459-1546`. It needs no buttons in the happy path because Task 3
auto-resolves it; optionally surface a slow/timeout escape that calls
`retryCurriculum.mutate()` after ~30–60s, mirroring the book-detail state machine.

### Task 5 — i18n keys

Add under `subjectHub` in `apps/mobile/src/i18n/locales/en.json` and run
`pnpm translate`:

```jsonc
"preparing": {
  "title": "Building your curriculum…",
  "message": "We're writing your first topics. This usually takes a few seconds.",
  "slow": "Still working — almost there."
},
"stuck": {
  "title": "We couldn't finish setting this up",
  "message": "Tap retry and we'll generate your topics again.",
  "retry": "Retry"
},
"pickBook": {
  "title": "Choose your first book",
  "message": "Pick a book to start studying this subject.",
  "cta": "Browse books"
}
```

The old `subjectHub.empty.{title,message}` keys become unreferenced — remove them in
the same PR so the i18n orphan checker (`scripts/check-i18n-orphan-keys.ts`) stays
green.

---

## Acceptance criteria

1. A subject mid-generation (`curriculumStatus === 'preparing'`) shows the building
   state, **not** a dead-end, and **auto-advances** to topics once generation
   completes — without the user pressing anything (Task 3 poll).
2. A stuck subject (status ready, zero generated topics, ≥1 book) shows an
   actionable retry that calls `POST /subjects/:id/retry-curriculum`; on success the
   subject returns to the preparing state and resolves.
3. A broad subject with only suggestions (zero book rows) shows a "Choose your first
   book" CTA that routes to `/pick-book`, not a dead-end.
4. The ready path is unchanged.
5. V0/V1 library, Home, and book-detail behavior are byte-for-byte unchanged.

## Tests

- `subject-hub/[subjectId]/index.test.tsx` — extend with three new cases asserting
  each `emptyKind` renders its testID and primary action. The stuck case must assert
  the mutation fires (use the real `useRetryCurriculum` against a mocked **external
  boundary only** — the Hono client / `fetch` — never a `jest.mock` of internal
  hooks; GC1/GC6).
- `use-subject-hub.test` — unit cases for the `emptyKind` discriminator across
  (preparing) × (books=0 vs books≥1) × (hasUsableData).
- Verify the preparing→ready transition refetches books (poll wiring) with a fake
  timer advancing past `PREPARING_POLL_MS`.

## Risks

- **Retry endpoint is not idempotent before its LLM call** (security audit DS-036,
  `subject-retry-curriculum.ts`). The mutation here is user-triggered (one button),
  and the Inngest function holds a 15-min single-flight claim, so duplicate-press
  amplification is bounded — but do **not** add automatic retry-on-timeout that fires
  the endpoint unattended without first confirming the dedup gap is acceptable.
  Prefer a user-tap retry over an auto-retry loop.
- Adding a book `refetchInterval` only while preparing avoids a permanent polling
  cost; confirm it disables (`return false`) the instant status flips to ready.

## Rollback

Pure additive UI + one hook; no schema, no migration. Revert the PR to restore the
single generic empty card. No data loss.

---

## Post-ship review — end-user lens (2026-06-26)

> This spec is **implemented and shipped** (code matches §Implementation; the
> stalled-retry escape that §Task 4 marked "optional" was actually built —
> `components/subject-hub/SubjectHubPreparing.tsx`). The findings below are the
> gap between *shipped-and-OK* and *great for the learner*, captured from an
> adversarial review of the running code. **Update 2026-06-26:** Pass-1 (HIGH-1/2/3)
> and Pass-2 (MEDIUM-1/2/3, LOW-1) were subsequently implemented via the corrected
> Tier A cut — see "Implemented 2026-06-26" at the end of this section.

### Root cause — why the failure UX is wrong, not just slow

The HIGH findings below are **one defect, three symptoms: there is no persisted
curriculum-generation lifecycle state.** Generation *is* a state machine
(`dispatched → generating → ready | failed-empty | failed-exhausted |
consent-blocked`) and `subject-prewarm-curriculum.ts` sits at every transition —
but the **only** fact written to the DB is the success terminal
(`topicsGenerated = true` + topic rows). Failure is Sentry-logged and discarded
(`subject-prewarm-curriculum.ts:188-201`, `retries: 2` exhaustion at line 77,
consent-block at line 150-151). `topicsGenerated` simply stays `false`.

Because "in progress", "failed", and "blocked" all collapse into *the absence of
that one boolean*, every layer reverse-engineers lifecycle from artifacts, each
with a different incomplete heuristic:

| Layer | Homemade definition of state | Evidence |
|---|---|---|
| API status derivation | `ready` = any generated book **or** any suggestion; else `preparing`. **No `failed`.** | `services/subject.ts:152-186` |
| Hub | adds `stuck` / `pick-book`, inferred from book *counts* | `hooks/use-subject-hub.ts:524-533` |
| Preparing UI | adds a **60s stopwatch** to *guess* "failed" because no failed flag exists | `components/subject-hub/SubjectHubPreparing.tsx:9-10,46-50` |
| Retry endpoint | `stuck` = books with `topicsGenerated=false` — a **different set** than the hub's | `services/subject.ts:249-261` |

That divergence is the root cause: HIGH-1 must guess failure with a timer (the
real signal was thrown away); HIGH-2 lets retry target an empty set the hub still
calls "stuck"; HIGH-3 never modeled failure as a *renderable state*. Shortening
the timer treats the symptom; it cannot make the copy honest or the retry
truthful, because the client still has no authoritative signal.

### Pass 1 — must address to be *great* (root-cause fix preferred)

**[HIGH-1]** A genuinely failed subject shows reassuring-but-false copy
("This usually takes a few seconds" → "almost there") for a full 60s before any
escape, instead of the honest `stuck` UI built for exactly this case.
- Evidence: failure ⇒ status `'preparing'` not `'ready'`
  (`services/subject.ts:152-186`); copy `i18n/locales/en.json:3063-3066`;
  `STALLED_THRESHOLD_MS = 60_000` (`SubjectHubPreparing.tsx:9-10`).
- Why: re-creates the "looks broken, not transient" feeling this spec set out to
  kill (§Problem), now with a 60s comforting lie on top. All-ages audience skews
  impatient.
- **Root-cause fix (preferred):** persist the lifecycle (see §Follow-up Tier A) so
  the hub routes `failed → stuck` instantly — no timer, no false promise.
- Interim within-scope fix: drop `STALLED_THRESHOLD_MS` to ~30s on this surface
  (normal prep is "a few seconds") and soften copy so it never *promises*
  ("almost there" → "Still working on it…").

**[HIGH-2]** Retry can dispatch nothing and give zero feedback — the original
"Retry does nothing" grievance (§Problem), relocated inside the fix.
- Evidence: `retryCurriculumForSubject` only dispatches `topicsGenerated=false`
  books and returns the count (`services/subject.ts:249-261`); the `stuck` branch
  is reachable via a `topicsGenerated=true` book yielding zero *active* topics
  (`use-subject-hub.ts:84-86,524-533`), where that set is empty ⇒ `dispatched: 0`.
  `useRetryCurriculum.onSuccess` ignores the return value
  (`hooks/use-books.ts:265-275`), flips to `preparing`, polls, and resolves back
  to the same dead screen.
- **Root-cause fix (preferred):** one shared lifecycle definition (Tier A) means
  hub and retry agree on "stuck/failed"; retry cannot target an empty set.
- Interim within-scope fix: read `dispatched` in `onSuccess`; on `0`, do not
  pretend-prepare — show a terminal message or route to `/pick-book`.

**[HIGH-3]** No `onError` on the retry mutation — a failed retry (network, 500,
quota) is indistinguishable from a working one; violates the UX Resilience Rules
(classify + fallback at the client boundary).
- Evidence: `useRetryCurriculum` has `onSuccess` only (`hooks/use-books.ts:256-275`);
  the screen calls `mutate()` with no error surface (`index.tsx:160-166`).
- Fix: add `onError` → surface a toast/inline error with a retry affordance
  (reuse the shared error/toast pattern). Still required even after Tier A, but
  Tier A removes its *dominant* burden by rendering failure from persisted state
  rather than an ephemeral mutation rejection.

### Pass 2 — tightening toward delightful

**[MEDIUM-1]** `emptyKind` ordering can flash "Choose your first book" during
initial classification. Code orders `books.length === 0 → 'pick-book'` *above*
`isPreparing` (`use-subject-hub.ts:526-533`), diverging from §Task 2's
preparing-first order. A subject mid-classification (no book rows / no suggestions
yet ⇒ status `preparing`) briefly renders the pick-book CTA → a `pick-book` that
may itself be empty. Fix: gate on `!isPreparing && books.length === 0`, or verify
`pick-book` renders its own loading state for not-yet-ready suggestions.

**[MEDIUM-2]** The preparing state never names the subject or conveys motion.
"Building your curriculum…" is generic; `subjectName` is already in hand
(`use-subject-hub.ts:467`). "Building your **Algebra** curriculum…" is near-free
personalization that turns a spinner into a moment.

**[MEDIUM-3]** State transitions (`building → slow → stalled`) aren't announced to
screen readers — no `accessibilityLiveRegion` on the status text
(`SubjectHubPreparing.tsx:63-79`). A VoiceOver/TalkBack learner gets a silent
screen that changes under them.

**[LOW-1]** Two verbs for one action: `subjectHub.preparing.retry` = "Try again"
(`en.json:3067`) vs `subjectHub.stuck.retry` = "Retry" (`en.json:3072`).
Standardize across the surface.

### What the implementation gets right (acknowledged)

- `useRetryCurriculum` scopes invalidation to `subjectId + profileId`
  (`hooks/use-books.ts:265-273`) — no cross-account cache bleed.
- Polling self-disables on `ready` and on unmount; `refetchIntervalInBackground`
  defaults off, so a backgrounded stuck subject won't poll forever
  (`use-subject-hub.ts:399-404`).
- The stalled-retry escape (§Task 4 "optional") was actually built
  (`SubjectHubPreparing.tsx`) — better than the written spec.

### Implemented 2026-06-26 — Tier A (corrected cut: persist terminal, derive transient)

> Built and validated (migration `0123_pink_lionheart.sql`; API typecheck +
> 97 API / 43 mobile tests green; eslint, i18n, migration-immutability clean).
> The original Tier A draft above proposed a 5-value `topics_status` enum
> (`pending | generating | ready | failed | consent_blocked`). An adversarial
> review caught that this **over-persists**, and the cut was corrected before
> merge. Recorded here so the draft above is not mistaken for what shipped.

**What changed vs. the draft, and why:**

1. **Persist only the terminal failure; derive everything transient.** Added just
   two nullable columns to `curriculum_books`: `failed_reason` (text) + `failed_at`
   (timestamptz). A book is *failed* ⟺ `failed_at IS NOT NULL AND topics_generated
   = false`; *ready* stays derived from `topics_generated` (no redundant `'ready'`
   shadow that could drift); *preparing* is simply "neither". We did **not**
   persist `generating`/`pending`: an in-flight flag is liveness-coupled — a worker
   that dies mid-run (deploy, timeout, OOM, the Inngest SDK-block stale-deploy trap
   this repo has hit) would strand the row "in progress" forever with no
   reconciler, re-creating the exact "stuck looks like in-progress" disease in the
   DB. Failure is monotonic and self-healing: set on terminal failure, cleared on
   the next retry-claim / successful (re)generation.

2. **"One authoritative failure signal," not "single source of truth."** Subject
   status is still *derived* over the per-book set (`getSubjectCurriculumStatuses`).
   The win is that every derivation now reads one signal (`failed_at`) instead of
   four divergent heuristics — not the elimination of derivation. The cross-cutting
   contract is bounded: adding `'failed'` to `curriculumStatus` touches its 4
   consumers (`subject.ts` producer, `use-subjects.ts` poll, `LearnerScreen.tsx`
   Home hint, `use-subject-hub.ts` hub); the first three branch on `=== 'preparing'`
   so `'failed'` falls through safely (verified). The book-level `topics_generated`
   "usable" signal is **not** subsumed.

3. **Consent-blocked is NOT a curriculum failure.** It is owned by the consent gate
   (a retry cannot grant consent). The prewarm/retry functions write nothing on the
   consent path; the book stays derived-"preparing" so the hub never offers a futile
   Retry button for a parent-consent problem.

**Where it landed:**
- Schema/migration: `failed_reason` + `failed_at` on `curriculum_books`
  (`0123_pink_lionheart.sql`, purely additive — Rollback = drop the two nullable
  columns; no data loss, values re-derive on next generation).
- `persistBookTopics` clears `failed_reason`/`failed_at` on success (all 3 sites).
- `subject-prewarm-curriculum.ts` / `subject-retry-curriculum.ts`: set
  `failed_at`+`failed_reason` on empty-topics (`empty_topics`) and via `onFailure`
  on retry-exhaustion (`generation_error`); retry-claim *clears* failure (→ derives
  back to preparing); consent path writes nothing.
- `getSubjectCurriculumStatuses` surfaces `'failed'` (no ready content AND any book
  with `failed_at` set); `subjectCurriculumStatusSchema += 'failed'`.
- Hub (`use-subject-hub.ts`): `emptyKind` routes `failed → stuck` instantly
  (timer is now a backstop, not the primary path) and is preparing-first (fixes
  MEDIUM-1 flash).
- HIGH-2: `useRetryCurriculum.onSuccess` is dispatched-aware — `dispatched: 0` no
  longer fakes a preparing cycle; the screen routes to pick-book.
- HIGH-3: screen surfaces retry failure via the shared `platformAlert` +
  `formatApiError` pattern (classify at the boundary).
- Pass-2: subject-name personalization (MEDIUM-2), `accessibilityLiveRegion`
  (MEDIUM-3), retry-verb standardized to "Try again" (LOW-1).

This dissolves HIGH-1 + HIGH-2 and demotes HIGH-3 (failure now renders from
persisted state, not an ephemeral mutation rejection).
