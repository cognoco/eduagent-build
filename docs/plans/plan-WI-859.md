# Plan — WI-859 [QA-03/04] Deterministic chat classifier + subject-picker coverage

## Goal
Replace live-LLM-dependent QA-03/QA-04 evidence with **deterministic** unit/integration
coverage. Tests-as-deliverable. Every variant must be forced via injected mocks (no live
model variance). The seven required variants:

(a) zero candidates + suggested subject  → picker shows "+ Suggested"
(b) no enrolled subjects at all          → resolve fallback / create-only path
(c) one-subject deterministic auto-match → confidence 0.9, needsConfirmation false, NO picker
(d) multi-candidate picker               → picker; learner picks intended subject, NOT silent first-subject
(e) classifier THROW fallback            → catch branch opens resolution
(f) resolve fallback                     → classify empty + no suggestion → resolveSubject called
(g) proxy / no-mutation guard            → isParentProxy / route assertNotProxyMode → 403, no mutation

## Current coverage (verified by reading the files on branch WI-859)

| Variant | api/subject-classify.test | api/subjects.test (route) | mobile/use-classify-subject.test | mobile/use-subject-classification.test | mobile/session/index.test |
|---|---|---|---|---|---|
| a | ✓ (BUG-233) | partial | — | ✓ | ✓ |
| b | n/a (zero-subject path ✓) | — | — | partial (0 cand, not empty subjects) | ✗ |
| c | ✓ (single auto 0.9) | — | — | ✗ | ✗ |
| d | ✓ (sorted multi) | — | — | ✗ | ✓ |
| e | ✓ (throw fallback) | — | — | ✓ | ✓ |
| f | n/a | — | — | ✗ | ✗ |
| g | n/a | route guard only on PUT/PATCH/retry, NOT classify/resolve | — | ✓ (hook) | ✗ |

Service-level (`subject-classify.test.ts`) is already rich → leave it; the WI's deterministic
proof gap is the **route + mobile picker** layers.

## Genuine gaps to fill (surgical, additive — no production-code change)

### 1. `apps/api/src/routes/subjects.test.ts` — proxy guard on classify + resolve (variant g)
Both `/subjects/classify` and `/subjects/resolve` carry `assertNotProxyMode(c)` in source
(`subjects.ts:77,91`) but the proxy describe block only covers language-setup/retry/PATCH.
Add to the existing `[WI-177 / DS-088] subjects proxy-mode guard` describe (reuse `makeProxyApp()`):
- `POST /subjects/classify returns 403 PROXY_MODE in proxy mode` — assert 403, body code `PROXY_MODE`, and `classifySubjectMock` NOT called.
- `POST /subjects/resolve returns 403 PROXY_MODE in proxy mode` — assert 403, code `PROXY_MODE`, `resolveSubjectNameMock` NOT called.
Also add a classify passthrough row proving multi-candidate + suggestion survive the route schema:
- `returns 200 passing through multi-candidate result + suggestedSubjectName` — classifyMock returns 2 candidates + needsConfirmation true + suggestedSubjectName, assert body has both candidates and the suggestion (deterministic schema-passthrough proof for QA-03).

### 2. `apps/mobile/src/components/session/use-subject-classification.test.ts` — variants c, d, f
New describe `WI-859 deterministic classifier variants`:
- **(c)** one-subject deterministic auto-match: classify → `{needsConfirmation:false, candidates:[{s1}], suggestedSubjectName:null}`, availableSubjects `[Math]`. Assert `setClassifiedSubject({subjectId:'s1',...})`, NO `setPendingSubjectResolution`, `continueWithMessage` called with `sessionSubjectId:'s1'`, "Looks like Math." pushed.
- **(d)** multi-candidate picker: classify → 2 candidates needsConfirmation true. Assert `setPendingSubjectResolution` with prompt "This sounds like it could be Math or History. Which one are we working on?" + both candidates; `continueWithMessage` NOT called (returns early into picker). Then drive `handleResolveSubject({s2})` and assert `continueWithMessage` called with `sessionSubjectId:'s2'` (the INTENDED one, not first) — proves no silent first-subject fallback.
- **(f)** resolve fallback: classify → `{candidates:[], suggestedSubjectName:null, needsConfirmation:true}`, resolveSubject.mutateAsync → `{resolvedName:null, suggestions:[{name,description}], displayMessage:'Pick…'}`. Assert `resolveSubject.mutateAsync` called with `{rawInput:text}` and `setPendingSubjectResolution` opened with those `resolveSuggestions`. (freeform `!best && !suggested` branch.)

### 3. `apps/mobile/src/app/(app)/session/index.test.tsx` — variant b (+ b at integration)
New test in the SessionScreen describe:
- **(b)** no enrolled subjects: `mockFetch.setRoute('/subjects', { subjects: [] })`, classify → `{candidates:[], needsConfirmation:true, suggestedSubjectName:null}`, resolve → suggestions. Send a message. Assert the resolution surface renders the create-new escape (`subject-resolution-create-new`) and NO silent session start with a phantom subject. Mirror the existing BUG-234 integration test's harness (`renderSessionScreen`, `mockFetch.setRoute`, `fetchCallsMatching`).

### 4. Docs — closure-proof convention (mirror PR #1242 / WI-853)
- `docs/flows/mobile-app-flow-inventory.md` — annotate QA-03/QA-04 rows: deterministic jest coverage is the closure proof; YAML flows are smoke/historical only.
- `docs/flows/plans/flow-revision-plan-2026-06-17.md` — add a `Remediation update 2026-06-19 (WI-859)` line + flip the QA-03/QA-04 rows to deterministic-covered, matching the doc's existing WI-853 prose style.

## Harness rules (reality + GC1)
- Hook test: reuse `createMockOpts(overrides)`, `mockIsParentProxy`. No new internal jest.mock.
- Route test: services already mocked via `requireActual` + targeted overrides — reuse `classifySubjectMock`/`resolveSubjectNameMock`, `makeProxyApp()`. No new internal mock.
- Integration test: reuse routed-fetch (`mockFetch.setRoute`), no new internal mock.
- Assertions match CURRENT implementation strings/testIDs (read above), never weakened.

## Verification (per step + final)
1. `cd apps/api && pnpm exec jest --findRelatedTests src/routes/subjects.test.ts src/services/subject-classify.test.ts --no-coverage`
2. `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/session/use-subject-classification.test.ts src/app/(app)/session/index.test.tsx --no-coverage`
3. `bash scripts/check-change-class.sh --run` (api typecheck/lint + mobile lint/tsc as routed)
4. Commit via `/commit` from worktree → `gh pr create` → push `HEAD:WI-859` → strict-green.
