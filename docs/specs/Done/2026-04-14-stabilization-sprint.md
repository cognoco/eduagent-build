# Stabilization Sprint — Stop the Bug Treadmill

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the three largest files that produce 80% of regressions, eliminate two systemic bug patterns across the codebase, and add integration tests so bugs are caught before they reach the user.

**Architecture:** Pure refactoring — no feature changes, no schema migrations. Every task produces the same runtime behavior as before. Tests must pass after every commit.

> **⚠ Contract change exceptions:** Tasks SC-6 and SC-7 (Phase 2) change the return types of `vocabulary-extract.ts` and `learner-input.ts` to distinguish success from failure. These are intentional contract changes required to fix silent-fallback bugs. Callers must be updated in the same commit.

**Tech Stack:** React Native (Expo Router), Hono API, TanStack Query, Drizzle ORM, Inngest, Jest

**Current state (2026-04-14):**
- 83% of recent mobile commits and 73% of API commits are bug fixes
- 5 open bugs (2×P0, 2×P1, 1×P2) — **not addressed in this sprint** (tracked separately; this sprint prevents *future* bugs through structural improvements)
- Two documented systemic patterns: silent fallbacks (~15 instances) and React state timing gaps (~5 instances)
- Only 1 API integration test exists

**Rollback strategy:** Each Phase 1 extraction is one commit. If a subtle bug surfaces later, use `git bisect` to identify the extraction that broke it, then revert that single commit and re-extract with the fix. If Phase 2 or 3 fails, Phase 1 extractions remain valid independently.

---

## Phase 1: Decompose Monster Files

The three largest files in the codebase are the primary bug factories. Each change to these files risks unintended side effects because no human can reason about 2,000–3,000 lines of interleaved state, effects, and handlers. Decomposing them into focused modules makes each piece independently testable and reviewable.

### Ground Rules for Phase 1

- **No behavior changes.** Every decomposition task must produce identical runtime behavior.
- **Move code, don't rewrite it.** Copy-paste into the new module, then adjust imports.
- **One module per commit.** Each commit extracts exactly one new file.
- **Run tests after every extraction.** The full test suite for the app must pass.
- **Preserve all existing tests.** Only update import paths, never delete or weaken assertions.
- **Unit tests are necessary but not sufficient.** The existing test suite mocks many internals, so "all tests pass" does not guarantee identical runtime behavior. Task 8 adds a manual smoke-test step to catch interaction bugs that unit tests miss.

---

### Task 1: Extract `session-types.ts` from mobile session screen

**Files:**
- Create: `apps/mobile/src/app/(app)/session/session-types.ts`
- Modify: `apps/mobile/src/app/(app)/session/index.tsx`
- Test: `apps/mobile/src/app/(app)/session/index.test.tsx` (import path updates only)

This file has zero React dependencies — it's pure functions, types, and constants. Extracting it is the safest first move.

**What moves:**
- `computePaceMultiplier` (line ~85)
- `getInputModeKey` (line ~98)
- `serializeMilestones` / `serializeCelebrations` (line ~103)
- `MilestoneDots` inline component (line ~113) → rename to `session-ui.tsx` if preferred, but it's 10 lines
- `QuickChipId`, `ContextualQuickChipId`, `MessageFeedbackState`, `PendingSubjectResolution` types
- `CONFIRMATION_BY_CHIP`, `QUICK_CHIP_CONFIG` maps
- `RECONNECT_PROMPT`, `TIMEOUT_PROMPT` constants
- `isTimeoutError`, `errorHasStatus`, `errorHasCode`, `isReconnectableSessionError`
- `getContextualQuickChips`

**Estimated size:** ~240 lines

- [ ] **Step 1: Create `session-types.ts`**

  Copy lines 85–325 from `index.tsx` into the new file. Add all necessary imports (only `@eduagent/schemas` types and React Native `Alert`). Export every function, type, and constant.

- [ ] **Step 2: Update `index.tsx` imports**

  Remove the moved code from `index.tsx`. Add:
  ```typescript
  import {
    computePaceMultiplier, getInputModeKey, serializeMilestones,
    serializeCelebrations, isReconnectableSessionError, getContextualQuickChips,
    RECONNECT_PROMPT, TIMEOUT_PROMPT, CONFIRMATION_BY_CHIP, QUICK_CHIP_CONFIG,
    type QuickChipId, type ContextualQuickChipId, type MessageFeedbackState,
    type PendingSubjectResolution,
  } from './session-types';
  ```

- [ ] **Step 3: Update test imports if needed**

  Grep `index.test.tsx` for any direct references to moved symbols. Update import paths.

- [ ] **Step 4: Run tests**

  ```bash
  cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/session/index.tsx --no-coverage
  ```
  Expected: all existing tests pass unchanged.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/mobile/src/app/\(app\)/session/session-types.ts apps/mobile/src/app/\(app\)/session/index.tsx
  git commit -m "refactor(mobile): extract session-types.ts from session screen [STAB-1.1]"
  ```

---

### Task 2: Extract `use-session-streaming.ts` hook from session screen

**Files:**
- Create: `apps/mobile/src/app/(app)/session/use-session-streaming.ts`
- Modify: `apps/mobile/src/app/(app)/session/index.tsx`
- Test: existing `index.test.tsx` (import path updates only)

This extracts the core SSE streaming pipeline — the most complex and bug-prone logic in the file.

**What moves:**
- `syncHomeworkMetadata` callback (~line 618)
- `ensureSession` callback (~line 863)
- `continueWithMessage` callback (~line 1031) — the core streaming pipeline
- `handleReconnect` callback (~line 1313)
- `scheduleSilencePrompt` callback (~line 795)
- `fetchFastCelebrations` callback (~line 1776)

**Estimated size:** ~500 lines

**Interface:** Custom hook that accepts the state bag + mutation hooks and returns `{ continueWithMessage, handleReconnect, ensureSession, fetchFastCelebrations, scheduleSilencePrompt, syncHomeworkMetadata }`.

> **Design note:** This hook receives many dependencies (~15+ state values and setters). This is a *navigation improvement* (smaller files, greppable boundaries), not a modularity improvement — the hook is still coupled to all the same state. A future iteration could introduce a session state context or reducer to reduce the surface area, but that is out of scope for this sprint.

- [ ] **Step 1: Create the hook file**

  Define the hook signature. Accept all dependencies as a single options object:
  ```typescript
  interface UseSessionStreamingOptions {
    // State refs and setters needed by the streaming pipeline
    activeSessionId: string | null;
    setActiveSessionId: (id: string | null) => void;
    messages: Message[];
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
    // ... all other state the pipeline reads/writes
    // Mutation hooks
    startSession: ReturnType<typeof useStartSession>;
    streamMessage: ReturnType<typeof useStreamMessage>;
    closeSession: ReturnType<typeof useCloseSession>;
    // ... etc
  }
  ```
  Move the 6 callbacks into the hook body. Keep the exact same logic — just change from reading component scope to reading from the options parameter.

- [ ] **Step 2: Wire the hook into `index.tsx`**

  Replace the 6 inline callbacks with the hook call:
  ```typescript
  const { continueWithMessage, handleReconnect, ensureSession, ... } = useSessionStreaming({ ... });
  ```

- [ ] **Step 3: Run tests**

  ```bash
  cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/session/index.tsx --no-coverage
  ```
  Expected: all pass.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/mobile/src/app/\(app\)/session/use-session-streaming.ts apps/mobile/src/app/\(app\)/session/index.tsx
  git commit -m "refactor(mobile): extract use-session-streaming hook from session screen [STAB-1.2]"
  ```

---

### Task 3: Extract `use-subject-classification.ts` hook from session screen

**Files:**
- Create: `apps/mobile/src/app/(app)/session/use-subject-classification.ts`
- Modify: `apps/mobile/src/app/(app)/session/index.tsx`

**What moves:**
- `handleSend` callback (~line 1484) — the main send handler with classification logic
- `openSubjectResolution` callback (~line 999)
- `handleResolveSubject` callback (~line 1346)
- `handleCreateResolveSuggestion` callback (~line 1379)
- `handleCreateSuggestedSubject` callback (~line 1432)

**Estimated size:** ~500 lines

- [ ] **Step 1: Create the hook file**

  Same pattern as Task 2 — options object with all needed state/setters/mutations. Returns `{ handleSend, openSubjectResolution, handleResolveSubject, handleCreateResolveSuggestion, handleCreateSuggestedSubject }`.

  Note: `handleSend` depends on `continueWithMessage` from Task 2's hook. Pass it as a dependency.

- [ ] **Step 2: Wire into `index.tsx` and run tests**

- [ ] **Step 3: Commit**

  ```bash
  git commit -m "refactor(mobile): extract use-subject-classification hook from session screen [STAB-1.3]"
  ```

---

### Task 4: Extract `use-session-actions.ts` hook from session screen

**Files:**
- Create: `apps/mobile/src/app/(app)/session/use-session-actions.ts`
- Modify: `apps/mobile/src/app/(app)/session/index.tsx`

**What moves:**
- `handleEndSession` callback (~line 1880)
- `handleNextProblem` callback (~line 1804)
- `navigateToSessionSummary` callback (~line 1851)
- `handleQuickChip` callback (~line 1984)
- `handleMessageFeedback` callback (~line 2065)
- `handleSaveParkingLot` callback (~line 2142)
- `handleTopicSwitch` callback (~line 2162)
- `handleInputModeChange` callback (~line 967)

**Estimated size:** ~400 lines

- [ ] **Step 1–3:** Same extract → wire → commit pattern.

  ```bash
  git commit -m "refactor(mobile): extract use-session-actions hook from session screen [STAB-1.4]"
  ```

---

### Task 5: Extract `SessionMessageActions.tsx` component

**Files:**
- Create: `apps/mobile/src/app/(app)/session/SessionMessageActions.tsx`
- Modify: `apps/mobile/src/app/(app)/session/index.tsx`

**What moves:**
- `renderMessageActions` function (~line 2555, body ends ~line 2710)

This is currently an inline render function. Extract it as a proper React component with typed props.

**Props interface:**
```typescript
interface SessionMessageActionsProps {
  message: Message;
  isStreaming: boolean;
  quotaError: boolean;
  activeProfile: Profile;
  consumedQuickChipMessageId: string | null;
  latestAiMessageId: string | null;
  messageFeedback: Record<string, MessageFeedbackState>;
  onQuickChip: (chipId: QuickChipId, message: Message) => void;
  onFeedback: (messageId: string, type: string) => void;
  onReconnect: () => void;
}
```

**Estimated size:** ~155 lines

- [ ] **Step 1: Create component, wire, test, commit**

  ```bash
  git commit -m "refactor(mobile): extract SessionMessageActions component [STAB-1.5]"
  ```

---

### Task 6: Extract `SessionAccessories.tsx` component

**Files:**
- Create: `apps/mobile/src/app/(app)/session/SessionAccessories.tsx`
- Modify: `apps/mobile/src/app/(app)/session/index.tsx`

**What moves:**
- `subjectResolutionAccessory` JSX block (~lines 2308–2445)
- `homeworkModeChips` JSX block (~lines 2447–2543)
- `sessionAccessory` composition (~lines 2548–2553)
- `sessionToolAccessory` JSX block (~lines 2273–2306)

**Estimated size:** ~300 lines

- [ ] **Step 1: Create component, wire, test, commit**

  ```bash
  git commit -m "refactor(mobile): extract SessionAccessories component [STAB-1.6]"
  ```

---

### Task 7: Extract `SessionModals.tsx` component

**Files:**
- Create: `apps/mobile/src/app/(app)/session/SessionModals.tsx`
- Modify: `apps/mobile/src/app/(app)/session/index.tsx`

**What moves:**
- Parking Lot modal (~lines 2924–3016)
- Topic Switcher modal (~lines 3017–3117)

**Estimated size:** ~220 lines

- [ ] **Step 1: Create component, wire, test, commit**

  ```bash
  git commit -m "refactor(mobile): extract SessionModals component [STAB-1.7]"
  ```

---

### Task 8: Verify session screen decomposition is complete

After Tasks 1–7, `session/index.tsx` should be reduced to orchestration only: route param extraction, hook composition, and the `<ChatShell>` render tree.

> **Line count note:** Estimated extractions total ~2,275 lines from 3,135. The residual will be ~800–860 lines, not 300–400. The target is **under 900 lines**. If it's still over 900, identify what else can be extracted before proceeding.

- [ ] **Step 1: Count lines**

  ```bash
  wc -l apps/mobile/src/app/\(app\)/session/index.tsx
  ```
  Expected: under 900 lines.

- [ ] **Step 2: Run full session test suite**

  ```bash
  cd apps/mobile && pnpm exec jest session --no-coverage
  ```
  Expected: all tests pass.

- [ ] **Step 3: Run typecheck**

  ```bash
  cd apps/mobile && pnpm exec tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 4: Manual smoke test**

  Unit tests mock many internals and cannot guarantee identical runtime behavior (see Ground Rules). Run the app on device/emulator and manually verify:
  - Start a learning session → send a message → receive streamed response
  - Use quick chips, subject classification, homework mode
  - End session → see summary screen
  - Parking lot and topic switcher modals open/close correctly

  If any behavior differs from pre-decomposition, investigate before proceeding.

- [ ] **Step 5: Commit verification marker (if all green)**

  ```bash
  git commit --allow-empty -m "verify: session screen decomposition complete — under 900 lines [STAB-1.8]"
  ```

---

### Task 9: Decompose `apps/api/src/services/session.ts` into focused modules

**Files to create:**
| New file | Contents | Est. lines |
|----------|----------|------------|
| `services/session/session-cache.ts` | In-process `SessionStaticContextCacheEntry` LRU cache, all cache helpers | ~200 |
| `services/session/session-lifecycle.ts` | `startSession`, `getSession`, `closeSession`, `closeStaleSessions`, `getSessionCompletionContext`, `getSessionTranscript`, `SubjectInactiveError`, `SessionExchangeLimitError` | ~400 |
| `services/session/session-exchange.ts` | `prepareExchangeContext`, `persistExchangeResult`, `processMessage`, `streamMessage`, `ExchangeBehavioralMetrics`, `checkExchangeLimit`, `mergeMemoryContexts` | ~500 |
| `services/session/session-events.ts` | `insertSessionEvent`, `recordSystemPrompt`, `recordSessionEvent`, `flagContent`, `setSessionInputMode`, mapper functions | ~200 |
| `services/session/session-summary.ts` | `getSessionSummary`, `skipSummary`, `submitSummary` | ~200 |
| `services/session/session-homework.ts` | `syncHomeworkState`, `getHomeworkTrackingMetadata` | ~150 |
| `services/session/session-context-builders.ts` | `computeActiveSeconds`, `buildBookLearningHistoryContext`, `buildHomeworkLibraryContext`, `formatLearningRecency`, `perGapCap` | ~250 |
| `services/session/session-book.ts` | `getBookSessions`, `backfillSessionTopicId`, `BookSession` | ~80 |
| `services/session/index.ts` | Barrel re-export of all public symbols | ~30 |

**Modify:**
- `apps/api/src/services/session.ts` → delete after extraction (replaced by `session/` directory)
- `apps/api/src/routes/sessions.ts` → update imports to `./session` barrel
- Any other files importing from `../services/session` → update to `../services/session` (barrel resolves)

- [ ] **Step 1: Create the `session/` directory and extract `session-cache.ts`**

  Move cache-related code (lines ~86–289). All functions are internal helpers except `resetSessionStaticContextCache` (used in tests).

- [ ] **Step 2: Run API tests**

  ```bash
  pnpm exec nx run api:test -- --findRelatedTests src/services/session.ts --no-coverage
  ```

- [ ] **Step 3: Commit**

  ```bash
  git commit -m "refactor(api): extract session-cache.ts from session service [STAB-1.9a]"
  ```

- [ ] **Step 4–17: Extract remaining 7 modules one at a time**

  For each module: extract → update imports in consumers → run tests → commit. Follow the same pattern. One module per commit:
  - `session-context-builders.ts` [STAB-1.9b]
  - `session-events.ts` [STAB-1.9c]
  - `session-lifecycle.ts` [STAB-1.9d]
  - `session-exchange.ts` [STAB-1.9e]
  - `session-summary.ts` [STAB-1.9f]
  - `session-homework.ts` [STAB-1.9g]
  - `session-book.ts` [STAB-1.9h]

- [ ] **Step 18: Create barrel `index.ts`, delete old `session.ts`, update all imports**

  ```bash
  # Find all files importing from the old path
  grep -r "from.*services/session['\"]" apps/api/src/ --include="*.ts" -l
  ```
  Update each import. The barrel re-exports everything, so consumers don't need to change which symbols they import — only the path.

- [ ] **Step 19: Run full API test suite + typecheck**

  ```bash
  pnpm exec nx run api:test --no-coverage && pnpm exec nx run api:typecheck
  ```

- [ ] **Step 20: Commit barrel + cleanup**

  ```bash
  git commit -m "refactor(api): complete session service decomposition — 8 focused modules [STAB-1.9]"
  ```

---

### Task 10: Decompose `apps/api/src/services/billing.ts` into focused modules

**Files to create:**
| New file | Contents | Est. lines |
|----------|----------|------------|
| `services/billing/subscription-core.ts` | Subscription CRUD, Stripe linking, free provisioning, quota pool read/write | ~440 |
| `services/billing/metering.ts` | `decrementQuota`, `incrementQuota` — the hot path | ~140 |
| `services/billing/trial.ts` | Trial expiry, soft-landing, bulk cron helpers, date-range queries | ~460 |
| `services/billing/top-up.ts` | Top-up credit purchase, remaining balance, idempotency, expiry queries | ~180 |
| `services/billing/tier.ts` | `handleTierChange`, `getUpgradePrompt`, `getTopUpPriceCents` — pure logic | ~160 |
| `services/billing/family.ts` | Family member CRUD, pool status, cancellation cascade, profile limits | ~340 |
| `services/billing/revenuecat.ts` | RevenueCat webhook handlers, timestamp ordering, activation | ~250 |
| `services/billing/index.ts` | Barrel re-export | ~30 |

Same methodology as Task 9: extract one module at a time → run tests → commit.

- [ ] **Steps 1–14:** One module per extraction cycle. Start with `metering.ts` (the hot path, most isolated).

  Commit tags: [STAB-1.10a] through [STAB-1.10g]

- [ ] **Step 15: Barrel, cleanup, full test + typecheck**

  ```bash
  pnpm exec nx run api:test --no-coverage && pnpm exec nx run api:typecheck
  ```

- [ ] **Step 16: Commit**

  ```bash
  git commit -m "refactor(api): complete billing service decomposition — 7 focused modules [STAB-1.10]"
  ```

---

## Phase 2: Fix Systemic Bug Patterns

Two patterns account for ~20 known bug instances. Fixing them systematically (not one-by-one) eliminates the most common regression class.

### Ground Rules for Phase 2

- **Fix the pattern, not just the instance.** After fixing each instance, grep for the same pattern to ensure nothing was missed.
- **Every fix gets a test** that proves the bug path is handled. This is a break test — it must fail before the fix and pass after.
- **Tag commits** with the finding ID from this plan (e.g., `[SF-1]` for Silent Fallback #1).
- **Line numbers are pre-Phase-1 references.** Phase 1 extracts ~2,275 lines from `session/index.tsx` and reorganizes `session.ts` and `billing.ts` into directories. All line numbers below were recorded against the pre-decomposition codebase. **Locate each symbol by grep/symbol name, not by line number.**

---

### Task 11: Fix silent `void mutateAsync` calls (Pattern SF)

**Instances to fix:**

| ID | File | Line | What's wrong |
|----|------|------|-------------|
| SF-1 | `apps/mobile/src/app/(app)/home.tsx` | 78 | `void markCelebrationsSeen.mutateAsync()` — no catch |
| SF-2 | `apps/mobile/src/app/(app)/child/[profileId]/index.tsx` | 167 | Same pattern — `void markCelebrationsSeen.mutateAsync()` |

**Fix pattern:** Wrap in try/catch with at minimum a `console.error` (celebrations are non-critical, so a toast is optional — but the error must not be silently swallowed). Since celebrations are best-effort, the fix is:

```typescript
// Before (broken):
void markCelebrationsSeen.mutateAsync({ viewer: 'learner' });

// After (fixed):
markCelebrationsSeen.mutateAsync({ viewer: 'learner' }).catch((err) => {
  console.error('[Celebrations] Failed to mark seen:', err);
});
```

- [ ] **Step 1: Write failing test for SF-1 (`home.tsx`)**

  In `home.test.tsx`, add a test that mocks `markCelebrationsSeen.mutateAsync` to reject and verifies no unhandled promise rejection occurs. Use `jest.spyOn(console, 'error')` to verify the error is logged.

- [ ] **Step 2: Run test — expect fail (unhandled rejection)**

- [ ] **Step 3: Apply fix in `home.tsx`**

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Repeat for SF-2 in `child/[profileId]/index.tsx`**

- [ ] **Step 6: Grep for remaining `void.*mutateAsync` across the codebase**

  ```bash
  grep -rn "void.*mutateAsync" apps/mobile/src/ --include="*.tsx" --include="*.ts"
  ```
  Fix any additional instances found.

- [ ] **Step 7: Commit**

  ```bash
  git commit -m "fix(mobile): handle errors on fire-and-forget mutations [SF-1, SF-2] [STAB-2.1]"
  ```

---

### Task 12: Fix silent `?? []` fallbacks on query data (Pattern SQ)

**Instances to fix:**

| ID | File | Line | What's wrong |
|----|------|------|-------------|
| SQ-1 | `hooks/use-all-books.ts` | 35 | `subjectsQuery.data ?? []` masks query errors |
| SQ-2 | `app/(app)/pick-book/[subjectId].tsx` | 64 | `suggestionsQuery.data ?? []` — empty suggestions on error |
| SQ-3 | `app/(app)/shelf/[subjectId]/book/[bookId].tsx` | 228 | `sessionsQuery.data ?? []` — empty session history on error |
| SQ-4 | `app/(app)/child/[profileId]/index.tsx` | 162 | `pendingCelebrations.data ?? []` — low severity, celebrations |
| SQ-5 | `app/(app)/session/index.tsx` | 2981 | `parkingLot.data ?? []` — empty parking lot on error |

**Fix approach:** For each instance, decide based on criticality:
- **Critical data** (SQ-1, SQ-2, SQ-3): Check `query.isError` and render an error state with retry. Use the existing error-state pattern from the codebase.
- **Non-critical data** (SQ-4, SQ-5): Keep `?? []` but add a comment documenting the deliberate choice. Log the error.

- [ ] **Step 1: Fix SQ-1 in `use-all-books.ts`**

  Return error state when `subjectsQuery.isError` is true so consumers can render a retry UI. **This changes the hook's return shape** — grep for all consumers (`grep -rn "useAllBooks" apps/mobile/src/`) and add error-state handling in each.

- [ ] **Step 2: Fix SQ-2 in `pick-book/[subjectId].tsx`**

  Show inline error text + retry button when `suggestionsQuery.isError`.

- [ ] **Step 3: Fix SQ-3 in `shelf/[subjectId]/book/[bookId].tsx`**

  Show "Could not load session history" + retry.

- [ ] **Step 4: Document SQ-4 and SQ-5 as intentional**

  Add `// Celebrations are best-effort — empty on error is acceptable` and similar comments.

- [ ] **Step 5: Run related tests**

  ```bash
  cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-all-books.ts src/app/\(app\)/pick-book/\[subjectId\].tsx src/app/\(app\)/shelf/\[subjectId\]/book/\[bookId\].tsx --no-coverage
  ```

- [ ] **Step 6: Commit**

  ```bash
  git commit -m "fix(mobile): surface query errors instead of silent empty arrays [SQ-1–5] [STAB-2.2]"
  ```

---

### Task 13: Fix bare catch blocks that swallow errors (Pattern SC)

**Instances to fix:**

| ID | File | Line | What's wrong |
|----|------|------|-------------|
| SC-1 | `app/session-summary/[sessionId].tsx` | 211 | Bare `catch {}` on `handleSubmit` — user gets no feedback |
| SC-2 | `app/(app)/session/index.tsx` | 1797 | `fetchFastCelebrations` returns `[]` on error — silent |
| SC-3 | `hooks/use-push-token-registration.ts` | 54 | Catch only logs in `__DEV__` — silent in prod |
| SC-4 | `hooks/use-rating-prompt.ts` | 104 | Catch only logs in `__DEV__` — silent in prod |
| SC-5 | `app/(auth)/sign-in.tsx` | 519, 633, 797 | Auth errors logged in dev only — prod users see nothing |
| SC-5b | `app/(auth)/sign-up.tsx` | 186, 218 | Same pattern as SC-5 — `__DEV__`-only error logging in auth flow |
| SC-6 (API) | `services/vocabulary-extract.ts` | 91 | `console.warn` then returns `[]` — caller can't distinguish empty vs failure |
| SC-7 (API) | `services/learner-input.ts` | 127 | LLM failure returns success-shaped fallback object |

**Fix approach by severity:**

- **SC-1 (HIGH):** Show Alert or inline error when summary submission fails. The user is actively trying to submit — silence is unacceptable.
- **SC-5, SC-5b (HIGH):** Auth errors must always show user-visible feedback. Replace `__DEV__`-gated `console.warn` with `Alert.alert` in all locations across both `sign-in.tsx` (3 locations) and `sign-up.tsx` (2 locations).
- **SC-6, SC-7 (MEDIUM — contract change):** Return a result type that distinguishes success from failure (e.g., `{ ok: true, data } | { ok: false, error }`), or throw so the caller can handle it. **⚠ These change the function's return type.** Before modifying, grep for all callers and update them in the same commit:
  - `grep -rn "vocabularyExtract\|extractVocabulary" apps/api/src/ --include="*.ts"`
  - `grep -rn "classifyLearnerInput\|learnerInput" apps/api/src/ --include="*.ts"`
- **SC-2, SC-3, SC-4 (LOW):** Add production-visible `console.error` at minimum. These are best-effort features, but total silence masks debugging.

- [ ] **Step 1: Write test for SC-1 — verify error feedback on failed summary submit**

  In `session-summary/[sessionId].test.tsx`, mock `submitSummary.mutateAsync` to reject. Assert that an Alert or error text is rendered.

- [ ] **Step 2: Fix SC-1 — add error handling in `handleSubmit` catch block**

- [ ] **Step 3: Fix SC-5 + SC-5b — replace `__DEV__` guards with Alert.alert in sign-in.tsx (3 locations) and sign-up.tsx (2 locations)**

- [ ] **Step 4: Fix SC-6 — make `vocabulary-extract.ts` return a result type or throw; update all callers**

- [ ] **Step 5: Fix SC-7 — make `learner-input.ts` return a result type or throw; update all callers**

- [ ] **Step 6: Fix SC-2, SC-3, SC-4 — add `console.error` in production catch paths**

- [ ] **Step 7: Grep for remaining `__DEV__.*console.warn` in catch blocks**

  ```bash
  grep -rn "__DEV__.*console.warn\|console.warn.*__DEV__" apps/mobile/src/ --include="*.ts" --include="*.tsx"
  ```
  Fix any additional instances.

- [ ] **Step 8: Run affected tests**

- [ ] **Step 9: Commit**

  ```bash
  git commit -m "fix: surface errors from bare catch blocks and dev-only logging [SC-1–7] [STAB-2.3]"
  ```

---

### Task 14: Fix React state timing gaps with `useRef` locks (Pattern RT)

**Instances to fix:**

| ID | File | Line | What's wrong |
|----|------|------|-------------|
| RT-1 | `shelf/[subjectId]/book/[bookId].tsx` | 128 | `generateMutation.isPending` is sole guard — no ref lock |

**Already fixed (for reference — verify these are still in place):**
- `session-summary/[sessionId].tsx:64` — `submitInFlight` + `skipInFlight` refs ✓
- `shelf/[subjectId]/index.tsx:50` — `filingInFlight` ref ✓
- `pick-book/[subjectId].tsx:87` — `filingInFlight` ref ✓

**Fix pattern:**
```typescript
// Before (racy):
const handleGenerate = useCallback(async () => {
  if (generateMutation.isPending) return;
  await generateMutation.mutateAsync(...);
}, [generateMutation.isPending]);

// After (safe):
const generateInFlight = useRef(false);
const handleGenerate = useCallback(async () => {
  if (generateInFlight.current || generateMutation.isPending) return;
  generateInFlight.current = true;
  try {
    await generateMutation.mutateAsync(...);
  } finally {
    generateInFlight.current = false;
  }
}, []);
```

- [ ] **Step 1: Write test for RT-1**

  Simulate rapid double-tap by calling `handleGenerate` twice before the first resolves. Assert `mutateAsync` is called exactly once.

- [ ] **Step 2: Fix RT-1 — add `useRef` lock**

- [ ] **Step 3: Verify existing fixes are still in place**

  ```bash
  grep -n "InFlight\|inFlight" apps/mobile/src/app/session-summary/ apps/mobile/src/app/\(app\)/shelf/ apps/mobile/src/app/\(app\)/pick-book/
  ```

- [ ] **Step 4: Grep for remaining `isPending.*return` guards without ref locks**

  ```bash
  grep -rn "isPending.*return\|if.*isPending" apps/mobile/src/ --include="*.tsx" | grep -v "test\|__DEV__\|disabled"
  ```
  Review each and add ref locks where the guard protects an `async` mutation path.

- [ ] **Step 5: Run tests + commit**

  ```bash
  git commit -m "fix(mobile): add useRef locks to prevent mutation double-fire [RT-1] [STAB-2.4]"
  ```

---

### Task 15: Sweep — verify no remaining instances of any pattern

- [ ] **Step 1: Run comprehensive pattern sweep**

  ```bash
  # Silent fire-and-forget
  grep -rn "void.*mutateAsync" apps/mobile/src/ --include="*.tsx" --include="*.ts"

  # Dev-only error logging
  grep -rn "__DEV__.*console\.\(warn\|error\)" apps/mobile/src/ --include="*.tsx" --include="*.ts" | grep -i "catch\|error\|fail"

  # Bare catch blocks
  grep -rn "catch.*{" apps/mobile/src/ --include="*.tsx" --include="*.ts" -A2 | grep -E "^\s*//|^\s*$|^\s*}" | head -30

  # isPending-only guards
  grep -rn "\.isPending\)" apps/mobile/src/ --include="*.tsx" | grep "return"
  ```

- [ ] **Step 2: Fix any newly discovered instances**

- [ ] **Step 3: Commit sweep results**

  ```bash
  git commit -m "fix: pattern sweep — no remaining silent fallbacks or state timing gaps [STAB-2.5]"
  ```

---

## Phase 3: Add Integration Tests

The API has 116 test files but only 1 true integration test. Unit tests mock the database and services, so they can't catch bugs where service interactions produce unexpected results. Integration tests hit real database operations and verify end-to-end behavior.

### Ground Rules for Phase 3

- **Integration tests use a real test database** — no `jest.mock` of internal services or database.
- **Each test file tests one workflow end-to-end** — setup → action → verify DB state.
- **Use the existing `test-seed.ts` helpers** for fixture data. Note: `test-seed.ts` is a 1,500-line E2E scenario seeder. For lightweight per-test setup, prefer direct Drizzle inserts with inline fixture data, using `test-seed.ts` only for complex multi-entity scenarios.
- **Tests must be independent** — each test creates its own data, no shared mutable state between tests.
- **Name files `*.integration.test.ts`** so they can be run separately from unit tests.
- **Follow the infrastructure pattern in `filing.integration.test.ts`** — this is the one existing integration test. Use its database connection setup, transaction wrapping, and cleanup approach as the template for all new integration tests.

### Test Boundary Contract

Mock only true external boundaries. Keep everything internal real.

| Boundary | Treatment | Why |
|----------|-----------|-----|
| **LLM router** (`services/llm/router.ts`) | **Mock** | Non-deterministic, slow, costly. Mock at the router level, not at individual provider SDKs. |
| **Stripe** | **Mock** | External payment API. |
| **Clerk JWKS / auth verification** | **Mock** | External auth provider. |
| **RevenueCat webhooks** | **Mock** | External subscription provider. |
| **Push notification services** | **Mock** | External delivery. |
| **Email providers** | **Mock** | External delivery. |
| **Database (Drizzle/Neon)** | **Real** | The whole point of integration tests. |
| **Repositories / services** | **Real** | Internal business logic — never mock. |
| **Inngest function handlers** | **Real (called directly)** | Call the handler function directly, not through the Inngest runtime. This tests the handler logic + DB interactions without requiring an Inngest dev server. |

> **Lesson learned (PR CI cascade):** Tests that implicitly depend on fallback behavior (e.g., `parseSummaryEvaluation` auto-accepting unevaluated summaries) will silently break when that fallback is fixed. When mocking the LLM boundary, ensure test assertions don't depend on the *shape* of the mock's fallback — assert on the explicit mock return value instead.

---

### Task 16: Add session lifecycle integration test

**Files:**
- Create: `apps/api/src/services/session/session-lifecycle.integration.test.ts`

**Test cases:**

```typescript
describe('Session lifecycle (integration)', () => {
  // Setup: seed a profile + subject + topic
  // Mock: LLM router (processMessage and closeSession call the LLM — mock per Test Boundary Contract)

  it('starts a session and records a session_start event', async () => {
    // Call startSession → verify session row in DB + session_start event
  });

  it('rejects starting a session on an inactive subject', async () => {
    // Archive the subject → call startSession → expect SubjectInactiveError
  });

  it('processes a message exchange and persists both events', async () => {
    // Start session → processMessage → verify user_message + ai_response events in DB
  });

  it('enforces the 50-exchange limit', async () => {
    // Seed a session with exchangeCount=49 → processMessage → OK
    // processMessage again → expect SessionExchangeLimitError
  });

  it('closes a session and creates a summary row', async () => {
    // Start + exchange + close → verify session status=completed + sessionSummaries row exists
  });

  it('closeStaleSessions batch-closes old sessions', async () => {
    // Seed two sessions: one with recent activity, one 3h old
    // Call closeStaleSessions(2h cutoff) → verify only the old one is closed
  });
});
```

- [ ] **Step 1: Write the first test (start session)**

- [ ] **Step 2: Run it against test database**

  ```bash
  cd apps/api && pnpm exec jest session-lifecycle.integration --no-coverage --testTimeout=30000
  ```

- [ ] **Step 3: Write remaining tests one at a time, running after each**

- [ ] **Step 4: Commit**

  ```bash
  git commit -m "test(api): add session lifecycle integration tests [STAB-3.1]"
  ```

---

### Task 17: Add billing/metering integration test

**Files:**
- Create: `apps/api/src/services/billing/metering.integration.test.ts`

**Test cases:**

```typescript
describe('Quota metering (integration)', () => {
  // Setup: seed account + subscription + quota pool

  it('decrements monthly quota atomically', async () => {
    // Set usedThisMonth=5, monthlyLimit=10 → decrementQuota → verify usedThisMonth=6
  });

  it('enforces daily cap', async () => {
    // Set usedToday=dailyLimit → decrementQuota → expect quota_exceeded result
  });

  it('falls back to top-up credits when monthly quota exhausted', async () => {
    // Set usedThisMonth=monthlyLimit, add a top-up pack with 5 remaining
    // decrementQuota → verify top-up remaining decreased by 1
  });

  it('increments quota back on LLM failure (no underflow)', async () => {
    // Set usedThisMonth=0 → incrementQuota → verify usedThisMonth stays 0 (GREATEST guard)
  });

  it('concurrent decrements do not over-consume', async () => {
    // Set remaining=1 → fire 5 concurrent decrementQuota calls via Promise.all
    // Exactly 1 should succeed, 4 should get quota_exceeded
    // ⚠ This test requires real concurrent DB connections (not sequential awaits).
    // Use Promise.all with separate DB connections or transactions.
    // May need a longer testTimeout and retry tolerance for CI flakiness.
    // If consistently flaky, convert to a sequential atomicity test instead.
  });
});
```

- [ ] **Steps 1–4:** Same pattern as Task 16.

  ```bash
  git commit -m "test(api): add billing metering integration tests [STAB-3.2]"
  ```

---

### Task 18: Add auth/profile scoping integration test

**Files:**
- Create: `apps/api/src/services/auth-scoping.integration.test.ts`

**Test cases:**

```typescript
describe('Profile data scoping (integration)', () => {
  // Setup: seed two profiles under different accounts

  it('profile A cannot read profile B sessions', async () => {
    // Create session for profile B → getSession as profile A → expect null or forbidden
  });

  it('profile A cannot read profile B subjects', async () => {
    // Create subject for profile B → getSubject as profile A → expect null or forbidden
  });

  it('scoped repository enforces profileId on all reads', async () => {
    // Create data for profile B → use createScopedRepository(profileA) → verify empty results
  });

  it('delete subject scoped to subjectId prevents cross-subject deletion', async () => {
    // Regression test for the fix in commit a75ef375
    // Profile A has subject X and Y → delete vocab for X → verify Y vocab is untouched
  });
});
```

- [ ] **Steps 1–4:** Same pattern.

  ```bash
  git commit -m "test(api): add auth/profile scoping integration tests [STAB-3.3]"
  ```

---

### Task 19: Add Inngest session-completed pipeline integration test

**Files:**
- Create: `apps/api/src/inngest/functions/session-completed.integration.test.ts`

**Approach:** Call the Inngest function handler directly (not through the Inngest runtime). Import the handler function, construct the event payload and step utilities manually, and invoke it against the real database. Mock the LLM boundary per the Test Boundary Contract above. This tests the handler's business logic and DB interactions without requiring an Inngest dev server.

**Test cases:**

```typescript
describe('session-completed Inngest pipeline (integration)', () => {
  // Setup: seed a completed session with exchanges
  // Mock: LLM router (returns deterministic curriculum/retention data)
  // Real: database, repositories, all internal services

  it('generates curriculum updates after session completion', async () => {
    // Call handler with session.completed event payload → verify curriculum rows updated
  });

  it('generates retention cards from session exchanges', async () => {
    // Call handler → verify retentionCards rows created
  });

  it('handles sessions with zero meaningful exchanges gracefully', async () => {
    // Session with 0 exchanges → call handler → no errors, no spurious data created
  });
});
```

- [ ] **Steps 1–4:** Same pattern.

  ```bash
  git commit -m "test(api): add session-completed Inngest integration tests [STAB-3.4]"
  ```

---

### Task 20: Final verification — full CI check

- [ ] **Step 1: Run all tests**

  ```bash
  pnpm exec nx run-many -t test
  ```

- [ ] **Step 2: Run all typechecks**

  ```bash
  pnpm exec nx run-many -t typecheck
  ```

- [ ] **Step 3: Run all linters**

  ```bash
  pnpm exec nx run-many -t lint
  ```

- [ ] **Step 4: Verify integration tests run independently**

  ```bash
  cd apps/api && pnpm exec jest --testPathPattern="integration" --no-coverage
  ```

- [ ] **Step 5: Commit verification marker**

  ```bash
  git commit --allow-empty -m "verify: stabilization sprint complete — all phases green [STAB-3.5]"
  ```

---

## Appendix A: File Size Targets After Phase 1

| File (before) | Lines (before) | Estimated extraction | Target (after) |
|---------------|----------------|---------------------|----------------|
| `session/index.tsx` (mobile) | 3,135 | ~2,275 lines across 7 files | ~800–900 (orchestrator + remaining render logic) |
| `services/session.ts` (API) | 2,383 | All → 8 modules | Deleted → 8 modules, largest ~500 |
| `services/billing.ts` (API) | 1,775 | All → 7 modules | Deleted → 7 modules, largest ~460 |

## Appendix B: Systemic Pattern Instance Count

| Pattern | Instances before | Instances after Phase 2 |
|---------|-----------------|------------------------|
| Silent `void mutateAsync` | 2 confirmed + unknown | 0 |
| Silent `?? []` on query data | 5 | 0 (3 fixed, 2 documented as intentional) |
| Bare catch / dev-only logging | 8 (7 original + SC-5b sign-up.tsx) | 0 |
| `isPending`-only mutation guards | 1 confirmed + unknown | 0 |
| **Total** | **~16+** | **0** |

## Appendix C: Integration Test Coverage After Phase 3

| Workflow | File | Test count |
|----------|------|-----------|
| Session lifecycle | `session-lifecycle.integration.test.ts` | 6 |
| Billing/metering | `metering.integration.test.ts` | 5 |
| Auth/profile scoping | `auth-scoping.integration.test.ts` | 4 |
| Session-completed pipeline | `session-completed.integration.test.ts` | 3 |
| **Total new integration tests** | | **18** |

## Appendix D: Execution Order & Dependencies

```
Phase 1 (can be parallelized within)
├── Tasks 1–8:  Mobile session screen decomposition (sequential — each builds on prior)
├── Task 9:     API session service decomposition (independent of Tasks 1–8)
└── Task 10:    API billing service decomposition (independent of Task 9)

Phase 2 (depends on Phase 1 completing — file paths change)
├── Task 11: void mutateAsync fixes
├── Task 12: ?? [] fallback fixes
├── Task 13: Bare catch block fixes
├── Task 14: useRef lock fixes
└── Task 15: Pattern sweep

Phase 3 (can start after Phase 1 API tasks complete)
├── Task 16: Session lifecycle integration test
├── Task 17: Metering integration test
├── Task 18: Auth scoping integration test
├── Task 19: Inngest pipeline integration test
└── Task 20: Final verification
```

**Parallelization opportunities:**
- Tasks 1–8 and Task 9 can run in parallel (different apps)
- Tasks 9 and 10 can run in parallel (different services)
- Phase 3 Tasks 16–19 can each run in parallel (independent test files)
- Phase 2 must wait for Phase 1 (file paths and line numbers will have changed)

**Infrastructure prerequisites for Phase 3:**
- All integration tests require a test database connection (follow `filing.integration.test.ts` pattern)
- Tasks 16 and 19 require LLM router mocks (session lifecycle calls LLM via `processMessage`)
- Task 19 calls Inngest handler functions directly — no Inngest dev server required
- Task 17's concurrent test may need adjusted timeouts or retry tolerance for CI
