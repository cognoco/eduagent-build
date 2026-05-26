# Telemetry Sweep + Session Route Shrink - Current Plan

> **Status (2026-05-25):** Still useful, but only as a narrowed follow-up. Phase A, the telemetry isolation sweep, is closed in the current repo. Keep its closure notes here for audit context, but do not use the old 2026-05-14 truth table for implementation. Phase B is still useful as a session-route maintainability pass: `apps/mobile/src/app/(app)/session/index.tsx` is 1,309 LOC, still has no `_view-models/` directory, and still owns several pure derived selectors that can move without changing behavior.

**Original date:** 2026-05-14
**Updated:** 2026-05-25
**Current branch audited:** `tier-rework`
**Current worktree state:** dirty with unrelated API/mobile/schema changes. Preserve them; this plan update only owns this markdown file.

## Usefulness Check

**Decision:** Keep this plan active, but narrow it.

The original plan mixed two concerns:

| Concern | Current status | What to do now |
|---|---|---|
| Telemetry isolation sweep | Done. `safeSend()` exists, `safe-non-core.guard.test.ts` exists, and current docs describe the non-core/core dispatch split. | Treat as closed history. Future dispatch work should follow current guard tests and `docs/project_context.md`, not the stale line table below. |
| Route shrinking | Partially done. The session route is no longer the largest route, but remains complex and central. | Keep a session-specific finish pass focused on pure view-model extraction and header/render chrome extraction. |
| Whole-app route shrink campaign | Still valid, but too broad for the first execution pass. | Track the best follow-up candidates here, then split each large surface into its own branch/PR when executed. Current largest production route files are listed below. |

Current largest production `.tsx` route files, excluding tests:

| LOC | Route file |
|---:|---|
| 2652 | `apps/mobile/src/app/(app)/_layout.tsx` |
| 2070 | `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx` |
| 2047 | `apps/mobile/src/app/(app)/subscription.tsx` |
| 1748 | `apps/mobile/src/app/(app)/homework/camera.tsx` |
| 1545 | `apps/mobile/src/app/session-summary/[sessionId].tsx` |
| 1475 | `apps/mobile/src/app/(auth)/sign-in.tsx` |
| 1431 | `apps/mobile/src/app/(app)/progress/index.tsx` |
| 1309 | `apps/mobile/src/app/(app)/session/index.tsx` |

## Phase A - Closed Telemetry Isolation

`safeSend()` is the current pattern for non-core Inngest dispatches:

- Helper: `apps/api/src/services/safe-non-core.ts` (128 LOC)
- Core/non-core ratchet: `apps/api/src/services/safe-non-core.guard.test.ts` (380 LOC)
- Orphan-dispatch ratchet: `apps/api/src/inngest/orphan-dispatcher.guard.test.ts` (732 LOC)
- Current rule source for agents: `docs/project_context.md`
- Claude runtime also has the detailed rule in `CLAUDE.md`
- `AGENTS.md` does not yet carry the detailed `safeSend()` paragraph; that drift is tracked in `docs/plans/2026-05-25-agents-claude-md-merge-plan.md`

Do not reopen the original 14-site migration table. It was correct for `origin/main` at `2143bb56e` on 2026-05-14, but the repo has moved on. For future telemetry changes, run the guard tests and inspect current call sites with:

```powershell
rg -n "safeSend|core-send|inngest\.send" apps/api/src -g "*.ts"
pnpm exec jest apps/api/src/services/safe-non-core.guard.test.ts --runInBand --no-coverage
pnpm exec jest apps/api/src/inngest/orphan-dispatcher.guard.test.ts --runInBand --no-coverage
```

## Phase B2 - Session Route Finish Pass

`apps/mobile/src/app/(app)/session/index.tsx` is not the biggest route anymore, so the old `<600 LOC` target is no longer worth chasing in one risky PR. The useful goal is:

- **Target for next pass:** reduce `session/index.tsx` from 1,309 LOC to under 900 LOC.
- **Stretch target:** under 750 LOC only if the extraction stays mechanical and tests stay green.
- **Behavior:** no UX, copy, navigation, API, or LLM behavior changes.
- **Placement:** route-specific helpers live under underscore directories below `app/(app)/session/` so Expo Router ignores them. Shared reusable components stay in `apps/mobile/src/components/session/`.

Current session-local files:

| LOC | File |
|---:|---|
| 176 | `session/_components/SessionErrorBoundary.tsx` |
| 111 | `session/_components/MessageActionsRenderer.tsx` |
| 51 | `session/_components/MessageActionsRenderer.test.tsx` |
| 27 | `session/_components/ConfirmationToast.tsx` |
| 146 | `session/_hooks/_image-uri-allowlist.test.ts` |
| 127 | `session/_hooks/use-session-recovery.ts` |
| 114 | `session/_hooks/use-image-base64.ts` |
| 92 | `session/_hooks/use-bookmark-handler.ts` |
| 89 | `session/_hooks/_image-uri-allowlist.ts` |
| 39 | `session/_lib/confidence-copy.ts` |

`session/_view-models/` does not exist yet.

### Step 1 - Add Pure View-Model Helpers

Create `apps/mobile/src/app/(app)/session/_view-models/session-derived-state.ts`.

Move only pure calculations first. The file should not import React, Expo Router hooks, TanStack Query hooks, mutation hooks, SecureStore, analytics, or UI components. Start with these helpers:

```ts
import type { ChatMessage } from '../../../../components/session';

export function countLearnerMessages(messages: readonly ChatMessage[]): number {
  return messages.filter((message) => message.role === 'user' && !message.isAutoSent).length;
}

export function getLearnerTurnCount(args: {
  userMessageCount: number;
  exchangeCount: number;
}): number {
  return Math.max(args.userMessageCount, args.exchangeCount);
}

export function getLatestAiMessageId(args: {
  messages: readonly ChatMessage[];
  isStreaming: boolean;
}): string | null {
  if (args.isStreaming) return null;
  return (
    [...args.messages]
      .reverse()
      .find((message) => message.role === 'assistant' && !message.streaming)?.id ?? null
  );
}

export function countPersistedAiResponses(messages: readonly ChatMessage[]): number {
  return messages.filter(
    (message) =>
      message.role === 'assistant' &&
      !message.streaming &&
      !message.isSystemPrompt &&
      !!message.eventId,
  ).length;
}
```

Then add the subject/session derivation in the same file:

```ts
export function deriveSessionSubjectState(args: {
  classifiedSubject: { subjectId: string; subjectName: string } | null;
  routeSubjectId: string | undefined;
  routeSubjectName: string | undefined;
  transcriptSubjectId: string | undefined;
  activeSessionSubjectId: string | undefined;
  routeTopicId: string | undefined;
  transcriptTopicId: string | undefined;
  activeSessionTopicId: string | undefined;
}): {
  effectiveSubjectId: string;
  effectiveSubjectName: string | undefined;
  noteSubjectId: string | undefined;
  noteTopicId: string | undefined;
} {
  const effectiveSubjectId =
    args.classifiedSubject?.subjectId ?? args.routeSubjectId ?? '';
  return {
    effectiveSubjectId,
    effectiveSubjectName:
      args.classifiedSubject?.subjectName ?? args.routeSubjectName,
    noteSubjectId:
      effectiveSubjectId ||
      args.transcriptSubjectId ||
      args.activeSessionSubjectId ||
      undefined,
    noteTopicId:
      args.routeTopicId ??
      args.transcriptTopicId ??
      args.activeSessionTopicId ??
      undefined,
  };
}
```

Add `apps/mobile/src/app/(app)/session/_view-models/session-derived-state.test.ts` with table tests for:

- no messages
- auto-sent homework message excluded from learner count
- streaming suppresses latest AI message id
- persisted assistant count excludes system prompts and streaming messages
- classified subject wins over route subject
- note subject falls back to transcript, then active session

### Step 2 - Move Route Param Normalization

Create `apps/mobile/src/app/(app)/session/_view-models/session-route-params.ts`.

Move the current route-param normalization out of the screen:

- `firstParam(rawImageUri)`, `firstParam(rawImageMimeType)`, `firstParam(rawReturnTo)`, `firstParam(rawReturnId)`
- `gaps` JSON parsing with the current `slice(0, 8)` cap
- `mode ?? 'freeform'`
- OCR/capture-source normalization
- `parseHomeworkProblems(homeworkProblems)`
- `initialProblemText`
- `homeHrefForReturnTo(returnTo, returnId)`
- `chatBackFallback`

The helper should accept the raw `useLocalSearchParams()` return value and return a plain object. Keep router calls and `Href` casts in `index.tsx`; the helper should not import `useRouter()`.

Expected route reduction: about 80-120 LOC.

### Step 3 - Extract Header And Top Chrome

Create `apps/mobile/src/app/(app)/session/_components/SessionScreenChrome.tsx`.

Move the JSX currently owned by these constants:

- `endSessionButton`
- `headerRight`
- `subtitle`
- `classifyErrorChip`
- `topicHeaderStrip`
- `skipWarmupChip`
- `headerBelow`

Keep the logic inputs explicit. The component should receive already-derived booleans/strings and callbacks rather than reaching into session hooks itself.

The exported surface should look like this:

```ts
export function SessionScreenChrome(props: {
  activeSessionId: string | null;
  isClosing: boolean;
  isStreaming: boolean;
  showFilingPrompt: boolean;
  modeSubtitle: string;
  showTimer: boolean;
  milestoneCount: number;
  pendingClassification: boolean;
  classifyError: string | null;
  sessionExpired: boolean;
  resumedBanner: boolean;
  topicName: string | undefined;
  apiChecked: boolean;
  isApiReachable: boolean;
  showSkipWarmup: boolean;
  isSkippingWarmup: boolean;
  onEndSession: () => void;
  onHomeBack: () => void;
  onRetryClassification: () => void;
  onChangeTopic: () => void;
  onSkipWarmup: () => void;
}): {
  headerRight: React.ReactNode;
  headerBelow: React.ReactNode;
  subtitle: string;
}
```

If returning JSX from a helper object feels awkward during implementation, split it into three named components instead:

- `SessionHeaderRight`
- `SessionHeaderBelow`
- `getSessionSubtitle`

Do not add a new card wrapper or change visual spacing.

### Step 4 - Re-check Whether More Extraction Is Worth It

After Steps 1-3, count the route again:

```powershell
(Get-Content -LiteralPath 'apps/mobile/src/app/(app)/session/index.tsx').Count
```

If it is under 900 LOC, stop. If it is still above 900 LOC, the next mechanical extraction is the transcript hydration effect at lines 616-677 into `session/_hooks/use-session-transcript-hydration.ts`. Do not extract `useSessionStreaming`, `useSubjectClassification`, or `useSessionActions` again; those already live outside the route and are large enough to need their own plans.

## Next Route Candidates

These are maintainability candidates discovered during the 2026-05-25 repo check. Do not include them in the Phase B2 session-route PR unless the session work is already complete and the worktree is clean. Each route should get its own branch/PR or a small paired PR when the behavioral surface is tightly related.

| Wave | Route | Current size | Hook signal | Why it belongs on the roadmap | Execution note |
|---|---|---:|---:|---|---|
| 2 | `apps/mobile/src/app/(app)/homework/camera.tsx` | 1748 LOC | 53 hook hits | Directly feeds the session flow and likely has extractable camera/OCR/review state. | Good near-term follow-up after `session/index.tsx`; keep camera permissions, OCR, subject classification, and problem review as separate units. |
| 3 | `apps/mobile/src/app/session-summary/[sessionId].tsx` | 1545 LOC | 20 hook hits | Same learning-session lifecycle; cleanup here reduces friction around close/summary/bookmark/rating changes. | Pair nicely after session cleanup, but keep notification/rating/proxy-child behavior covered by screen tests. |
| 4 | `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx` | 2070 LOC | 72 hook hits | High maintainability payoff across Library/book/topic/note workflows. | Make this a separate library/book route-decomposition plan; too much domain surface for the session-route PR. |

Explicitly keep these out of this plan's execution scope for now:

| Route | Current size | Why separate |
|---|---:|---|
| `apps/mobile/src/app/(app)/_layout.tsx` | 2652 LOC | Auth/navigation/consent/profile shell. Tracked in docs/plans/2026-05-26-app-shell-layout-decomposition.md. |
| `apps/mobile/src/app/(app)/subscription.tsx` | 2047 LOC | Billing and entitlement UX. High-risk enough to isolate from learning-flow refactors. |
| `apps/mobile/src/app/(app)/progress/index.tsx` | 1431 LOC | Progress dashboard domain. Worth tracking, but lower priority than session-adjacent routes. |

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Expo Router route pollution returns | New helper file is added directly under `app/(app)/session/` without an underscore directory | Console warnings about missing default export, possible route tree noise | Move the helper into `_view-models/`, `_hooks/`, `_components/`, or out of `app/` entirely |
| View-model extraction changes behavior | Helper silently changes fallback order for subject/topic/session values | Notes, topic switcher, or session summary links point at the wrong subject/topic | Keep table tests for every fallback order before replacing inline logic |
| Header extraction changes UX | New chrome component changes spacing, disabled state, or subtitle precedence | Session header looks different or retry/skip chips disappear | Snapshot by behavior through existing `session/index.test.tsx`; do not add visual redesign |
| Tests become more brittle | Large mocked `index.test.tsx` gains more implementation assertions | Refactors fail for harmless prop reshuffles | Add pure unit tests for view-model helpers and keep screen tests focused on user-visible behavior |
| Follow-up route shrink gets bundled into Phase B2 | The roadmap candidates are treated as part of the session-route PR | Review becomes too broad; regressions are hard to attribute | Execute Wave 2+ in separate branches/PRs after the session route is under its target |
| Telemetry work gets reopened from stale data | Someone follows the old 2026-05-14 call-site table | They edit dispatch sites that no longer match current code | Use current guard tests and `rg`, not the archived table |
| AGENTS/CLAUDE drift hides `safeSend()` from Codex-style agents | `AGENTS.md` still lacks detailed safeSend wording | Agents touching API dispatches may miss the rule unless they read `docs/project_context.md` | Finish the separate AGENTS/CLAUDE merge plan; do not solve it in this route-shrink PR |

## Verification

For this doc update:

```powershell
git diff -- docs/plans/2026-05-14-telemetry-sweep-and-route-shrink.md
```

For the future Phase B2 code pass:

```powershell
cd apps/mobile
pnpm exec jest --findRelatedTests "src/app/(app)/session/index.tsx" --no-coverage
pnpm exec jest "src/app/(app)/session/_view-models/session-derived-state.test.ts" --runInBand --no-coverage
pnpm exec tsc --noEmit
```

If Phase B2 touches shared session components in `apps/mobile/src/components/session/`, also run their related tests:

```powershell
cd apps/mobile
pnpm exec jest --findRelatedTests "src/components/session/SessionFooter.tsx" "src/components/session/SessionAccessories.tsx" "src/components/session/ChatShell.tsx" --no-coverage
```

No API integration test is required for the route-shrink pass unless it changes API contracts or server dispatches.

## Rollback

Phase A is already shipped. Do not roll it back through this plan.

Phase B2 is a mobile refactor with no schema, migration, or data changes. Roll back by reverting the route extraction commit. Because the work is intentionally mechanical, any failing behavior test should be fixed by restoring the exact previous inline fallback order or JSX prop value.

## Out Of Scope

- Redoing the safeSend migration or changing core/non-core dispatch policy.
- Backporting `safeSend()` wording into `AGENTS.md`; use `docs/plans/2026-05-25-agents-claude-md-merge-plan.md`.
- Executing the follow-up route candidates in the Phase B2 session-route PR.
- Shrinking app shell, billing, or progress routes (`_layout.tsx`, subscription, progress).
- Moving shared session components from `apps/mobile/src/components/session/`.
- Changing session UX, copy, analytics event names, LLM routing, or streaming behavior.
- Splitting the large shared hooks (`use-session-streaming.ts`, `use-subject-classification.ts`, `use-session-actions.ts`) without separate tests and a separate plan.
