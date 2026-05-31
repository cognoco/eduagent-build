---
title: Resumable Practice State - Implementation Plan
date: 2026-05-31
profile: code
spec: docs/audits/2026-05-31-logical-gap-audit.md
status: draft
gap_ids: [practice-1, practice-2, practice-4]
---

# Resumable Practice State - Implementation Plan

**Goal:** Preserve in-progress quiz and dictation practice across app kills and
make "save" language honest: either a practice activity is resumable, or the UI
says it is final.

**Approach:** Build a small practice-recovery layer parallel to tutoring-session
recovery. Quiz rounds already have server-side round IDs but mobile play state
and answers are volatile; dictation playback has only in-memory data. Persist
minimal resumable state on each step, surface one resume target on practice/home,
and keep terminal "finish" behavior distinct from pause/resume.

> **Adversarial review applied 2026-05-31.** This plan was challenged before
> execution. Findings are folded in below; the IDs (e.g. `[HIGH-1]`) are cited
> inline where a decision or task was changed. A handful of findings depend on
> code facts that could not be verified at review time (tooling was degraded) —
> those are collected in **Open Questions** and MUST be resolved before T1
> starts, not during it.

## Decisions Locked By Review

These resolve forks the draft left open. They are load-bearing for every task.

1. **Storage = `AsyncStorage`, not `SecureStore`.** `[HIGH-1]` Practice markers
   hold a quiz's question order + answered results (T2) and a dictation's full
   sentence array (T4). On Android, `expo-secure-store` is backed by
   keystore-encrypted storage with a small practical per-value ceiling (~2 KB)
   and is slow for large blobs — a 20-question round or a multi-sentence
   dictation can blow past that and fail writes mid-practice. Quiz answers and
   dictation text are **not secrets** (no credentials, no PII beyond the
   learner's own work), so SecureStore buys nothing and costs reliability. Use
   the same `AsyncStorage` + `KEY_PREFIX` pattern already shipped in
   `apps/mobile/src/lib/summary-draft.ts` (`KEY_PREFIX = 'summary-draft'`,
   `summary-draft.ts:5`) — reuse, do not reinvent. The Expo-safe-character rule
   in the draft's T1 was a SecureStore constraint and is dropped; AsyncStorage
   keys have no such limit (we still keep keys boring: ASCII, `:`-delimited).
2. **New module: `apps/mobile/src/lib/practice-recovery.ts`.** `[HIGH-2]` The
   draft's "session-recovery.ts OR a new practice-recovery.ts" fork is resolved
   to a new module so practice recovery cannot regress tutoring-session
   recovery. If `session-recovery.ts` exists, factor any genuinely shared
   helpers (key building, profile-scope guard) into a tiny shared util rather
   than extending the session module in place. (Existence of
   `session-recovery.ts` is an Open Question — see below.)
3. **Marker is profile-scoped in the KEY, and re-validated on read.**
   `[HIGH-3]` Cross-account local-state leakage is a *known shipped bug class*
   in this app (sign-out `profileId` leak fixed in `237bcbf6c`;
   `profile_scope.ownership_mismatch` audit log at `profile-scope.ts:160`;
   `signOutWithCleanup` centralized). The marker key embeds the active
   `profileId` so a read for profile B can never return profile A's marker, AND
   the read path re-checks `marker.profileId === activeProfileId` as defense in
   depth before surfacing a resume card. This is the same belt-and-suspenders
   pattern the leak fix established.
4. **One marker per profile, spanning both kinds.** `[MEDIUM-1]` v1 keeps a
   single most-recent marker per profile; starting any new practice replaces it
   after confirmation. Accepted limitation: a learner cannot hold an in-progress
   quiz *and* dictation simultaneously — the second start evicts the first. This
   is an explicit product trade-off, not an oversight; the home resume card
   shows only the single most-recent activity.

## Marker Schema

`[HIGH-4]` The draft specified "validates marker shape with a shared schema"
without saying what the schema is — the marker is the contract for the whole
feature, so it is written out here (Zod, colocated with the store; export the
inferred type for callers):

```ts
// apps/mobile/src/lib/practice-recovery.ts
import { z } from 'zod';

export const PRACTICE_MARKER_VERSION = 1;

const quizMarker = z.object({
  kind: z.literal('quiz'),
  roundId: z.string(),
  questionOrder: z.array(z.string()),      // stable IDs, not indices
  currentIndex: z.number().int().nonnegative(),
  answered: z.array(z.object({
    questionId: z.string(),
    choiceId: z.string(),
    correct: z.boolean(),
  })),
});

const dictationMarker = z.object({
  kind: z.literal('dictation'),
  dictationId: z.string(),                 // generation/completion key
  language: z.string(),
  sentences: z.array(z.string()),
  currentSentenceIndex: z.number().int().nonnegative(),
  // see [MEDIUM-3]: decide whether learner transcription is also restored
});

export const practiceMarkerSchema = z.object({
  schemaVersion: z.literal(PRACTICE_MARKER_VERSION),
  profileId: z.string(),
  createdAt: z.string(),                    // ISO; drives TTL
  updatedAt: z.string(),                    // ISO; bumped on each step write
  payload: z.discriminatedUnion('kind', [quizMarker, dictationMarker]),
});

export type PracticeMarker = z.infer<typeof practiceMarkerSchema>;
```

`schemaVersion` is what makes the "old app version" failure mode (below)
deterministic: a bumped version fails `safeParse` and the marker is cleared,
rather than half-restoring a stale shape.

## Scope

In scope:
- `apps/mobile/src/lib/practice-recovery.ts` (new — see Decision 2)
- `apps/mobile/src/lib/session-recovery.ts` (only if shared helpers are extracted)
- `apps/mobile/src/app/(app)/quiz/_layout.tsx`
- `apps/mobile/src/app/(app)/quiz/play.tsx`
- `apps/mobile/src/app/(app)/quiz/[roundId].tsx`
- `apps/mobile/src/app/(app)/dictation/playback.tsx`
- Dictation data context/provider files.
- `apps/mobile/src/components/home/LearnerScreen.tsx`
- `apps/mobile/src/app/(app)/practice/**`
- API quiz routes/services only if answer-progress persistence needs server
  support. If it does, the write goes through a service (not the route handler)
  and durable follow-up work (if any) goes through Inngest — bare
  fire-and-forget from a route handler is forbidden by `CLAUDE.md`.

Out of scope:
- Changing quiz scoring rules for completed rounds.
- Long-term history of abandoned practice attempts.
- Homework OCR/session flows.
- Cross-device practice resume. This plan persists local device resume state
  unless server-side support is explicitly required by a task.
- Holding more than one active practice marker per profile (see Decision 4).

## Product Decisions

- Quiz "Save & finish" currently means submit partial results as final.
  `[HIGH-5]` Because T2 *does* implement quiz app-kill resume, the in-app modal
  action becomes a true **"Pause and resume later"** that writes the same marker
  without completing the round — it should not stay terminal once resume exists.
  The draft's "rename it unless true resume is implemented" was a false choice:
  T2 builds resume, so T3 is no longer either/or (see revised T3). A separate,
  explicit **"Finish now"** terminal action remains available for users who want
  to submit partial results and be done.
- Quiz app-kill resume restores the active round and locally answered question
  states when possible. If local answer state is missing but the server round is
  still active, resume starts at the first unanswered question with clear copy.
- Dictation resume stores generated dictation metadata and current sentence
  index locally. No audio auto-recording is introduced.
- Only one practice recovery marker per profile is needed for v1 (Decision 4);
  starting a new quiz/dictation replaces the old marker after confirmation.

## Staleness / TTL

`[HIGH-6]` The draft referenced "Resume after TTL" and "stale round clear"
without defining the window — that is an unimplementable placeholder. Define:

- **Quiz:** the server round is the source of truth. On resume, T2 re-fetches
  the round; if the server reports it completed/expired/not-found, the marker is
  cleared and the learner sees the expired state. The client does **not** invent
  a TTL it cannot enforce — staleness is whatever the server says. (Confirm the
  server round lifetime — Open Question Q4.)
- **Dictation:** no server round, so apply a client TTL of **7 days** from
  `createdAt`; older markers are treated as expired and cleared on read. (Number
  is a starting point; adjust if product wants shorter.)

## Tasks

- [ ] **T1: Add a typed practice recovery store.** Done when:
  `practice-recovery.ts` writes profile-scoped markers to AsyncStorage using the
  `summary-draft.ts` KEY_PREFIX pattern, embeds `profileId` in the key, validates
  with `practiceMarkerSchema` on every read, supports `quiz` and `dictation`
  kinds, and clears on `safeParse` failure. Public API: `writeMarker`,
  `readMarker(activeProfileId)`, `clearMarker(activeProfileId)`. Unit tests cover
  write/read/clear, **profile mismatch (marker for A not returned for B)**,
  corrupt marker, and schema-version mismatch.

- [ ] **T2: Persist quiz progress during play.** Done when:
  quiz play writes the round ID, question order, current index, and answered
  results after each check; process-kill/remount can reconstruct the round from
  the server and local marker; missing/stale rounds clear the marker with a
  clear recovery message (staleness defined by the server — see TTL section).
  Tests cover active round resume and stale round clear. Covers `practice-1`.

- [ ] **T3: Make the quiz modal a true pause + keep an explicit finish.** Done
  when: `[HIGH-5]` the in-app modal offers **"Pause and resume later"** (writes
  the marker, leaves the round incomplete) and a distinct **"Finish now"**
  (submits partial results as final, clears the marker). No visible action
  implies future completion while actually finalizing. Tests cover both paths:
  pause leaves an active marker + active server round; finish clears the marker +
  completes the round. Covers `practice-4`.
  > NOTE: the draft offered "either true pause OR just rename the copy." Renaming
  > alone is rejected — T2 already builds the resume machinery, so wiring the
  > modal to it is nearly free and removes the dishonest-label problem the audit
  > flagged, instead of papering over it.

- [ ] **T4: Persist dictation playback progress.** Done when:
  dictation generation/playback writes enough local state to restore sentences,
  language, completion key, and current sentence index after app kill; replay
  starts from the next unplayed sentence; intentional exit asks whether to keep
  or discard progress. `[MEDIUM-3]` If dictation captures learner-authored
  transcription (not just playback position), that text is restored too —
  otherwise "resume" silently discards the learner's work and reproduces the
  exact dishonesty this plan exists to fix. Confirm the dictation data model
  (Open Question Q3) and restore whatever the learner authored. Tests cover
  resume, discard, and corrupt marker. Covers `practice-2`.

- [ ] **T5: Add practice resume entry points.** Done when:
  practice/home surfaces show a resume card for the active practice marker,
  tapping it routes to the **full ancestor chain** for quiz or dictation
  (`CLAUDE.md` cross-stack rule: a direct push to a leaf synthesizes a 1-deep
  stack and `router.back()` falls through to Home), and starting a different
  practice activity warns before replacing the marker. `[MEDIUM-2]` Name the
  exact chains: quiz → push `quiz` then `quiz/[roundId]`/`play`; dictation →
  push `dictation` then `dictation/playback`. Verify `quiz/_layout.tsx` and the
  dictation layout export `unstable_settings = { initialRouteName: 'index' }` as
  the cross-stack safety net. Tests cover navigation **target creation**; the
  back-stack behavior (does `router.back()` land on the practice list, not Home)
  is verified manually / via E2E because a unit test on the target string does
  not exercise the navigation stack.

- [ ] **T6: Add cleanup on completion and sign-out/profile switch.** Done when:
  completed quiz/dictation clears its marker, `signOutWithCleanup` also clears
  practice markers (extend the existing centralized cleanup — do not add a second
  sign-out path), and switching profiles never shows another profile's practice
  resume. `[HIGH-7]` **Break test required** (this is the cross-account-leak
  surface, `CLAUDE.md` Fix Development Rules): write a marker as profile A,
  switch to profile B, assert no resume card and `readMarker(B)` returns null;
  then revert the key-scoping line and confirm the test fails (red-green). Also:
  sign out, assert all practice markers are gone.

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Marker corrupt or from old app version | `safeParse` fails (incl. `schemaVersion` mismatch) | Resume card cleared silently with optional toast | Start a new practice activity |
| Server quiz round abandoned/expired | Server reports round completed/expired/not-found on resume | "This quiz expired" state | Start a new round |
| Dictation content missing after app kill | Marker incomplete or fails schema | "This dictation cannot be resumed" | Start a new dictation |
| Dictation marker older than TTL | `createdAt` > 7 days | Resume card not shown; marker cleared on read | Start a new dictation |
| Resume card points at an already-completed round | `[MEDIUM-4]` completion-clear failed, then resume tapped | On open, server says round complete → marker cleared, routed to results/new-round | Start a new round |
| User starts new practice with old marker | New round/dictation requested | Replace-progress confirmation | Continue old or replace |
| Profile switch | Different active profile | No other profile marker shown (key-scoped + read-revalidated) | Switch back to original profile |
| Storage write fails | AsyncStorage error | Non-blocking warning after current action | Continue current in-memory practice |

> Silent clear of a corrupt/stale marker is acceptable here: the
> "silent-recovery-without-escalation-is-banned" rule in `CLAUDE.md` is scoped
> to billing/auth/webhook code, which practice recovery is not. No structured
> metric is required for marker GC.

## Open Questions (resolve against code BEFORE T1)

`[VERIFY]` These were asserted by the draft but not confirmable at review time
(tooling degraded). Each must be answered by reading the code, not assumed:

- **Q1 — Does `apps/mobile/src/lib/session-recovery.ts` actually exist?** The
  "parallel to tutoring-session recovery" framing assumes it does. If it does,
  copy its storage/scoping/TTL conventions for consistency; if it does not, the
  "parallel layer" rationale is moot and `summary-draft.ts` is the only prior
  art to mirror.
- **Q2 — Exact current quiz modal copy + handler.** T3 assumes the action is
  "Save & finish" and that it submits the round as final. Confirm the literal
  string and that `onPress` completes the server round before rewriting it.
- **Q3 — Dictation data model.** Where do generated sentences live (in-memory
  state vs context vs server)? Is learner transcription captured at all? This
  decides what T4 must restore (drives `[MEDIUM-3]`).
- **Q4 — Server quiz round lifetime.** Is there an existing server TTL/expiry on
  a round? The quiz staleness rule depends on it.
- **Q5 — `signOutWithCleanup` location + current cleared keys.** Confirm the
  central cleanup site so T6 extends it rather than forking a second sign-out
  path.

## Verification

Focused checks (note the `(app)` path segments are quoted — bare parens are a
grouping operator in PowerShell and will mis-parse otherwise):

```powershell
Push-Location apps/mobile
pnpm exec jest --findRelatedTests `
  "src/app/(app)/quiz/_layout.tsx" `
  "src/app/(app)/quiz/play.tsx" `
  "src/app/(app)/dictation/playback.tsx" `
  "src/components/home/LearnerScreen.tsx" --no-coverage
pnpm exec jest --testPathPattern practice-recovery --no-coverage
pnpm exec tsc --noEmit
Pop-Location
```

If quiz API persistence changes are needed:

```powershell
pnpm exec nx run api:test --testPathPattern=quiz
pnpm exec nx test:integration api
```
