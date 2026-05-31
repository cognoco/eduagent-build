# [BUG] Untrusted deep-link homeworkProblems JSON parsed without schema validation

**File:** [`apps/mobile/src/app/(app)/session/_view-models/session-route-params.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/mobile/src/app/(app)/session/_view-models/session-route-params.ts#L73-L75) (lines 73, 74, 75)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** low  •  **Slug:** `other-input-validation`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

getSessionRouteParams() (line 75) feeds the raw `homeworkProblems` route param into parseHomeworkProblems() (apps/mobile/src/components/homework/problem-cards.ts:198), which does `JSON.parse(rawValue) as HomeworkProblem[]` and returns `parsed.map((problem) => ({ ...problem, selectedMode: problem.selectedMode ?? null }))` with no validation that each element is an object containing a string `text`. The session route is reachable via the app's `mentomate://` deep-link scheme (see the deep-link threat model documented in _hooks/_image-uri-allowlist.ts), so `homeworkProblems` is attacker-influenceable input. A crafted payload such as `?mode=homework&homeworkProblems=[1,2,3]` or an array of objects missing `text` yields homework-problem entries with `text === undefined`. Downstream, getHomeworkProblemText() (problem-cards.ts:191) calls `problem.text.trim()` and other consumers treat `text` as a string, producing a TypeError. The error is caught by SessionErrorBoundary, so impact is a degraded/broken session screen rather than data loss or a security boundary break — but it violates the repo norm that untrusted input must be validated with @eduagent/schemas (cf. weeklyReportDetailResponseSchema.parse used on the report path). This is a robustness gap, not an exploitable vulnerability: the deep link targets the victim's own session and cannot read cross-profile data or escape the app.

## Recommendation

Validate the parsed array against a Zod schema (e.g. `z.array(homeworkProblemSchema)`) inside parseHomeworkProblems before mapping; drop elements whose `text` is not a non-empty string, and fall back to the single-problem/fallbackProblemText path when validation fails. This matches the codebase's established 'validate untrusted input with @eduagent/schemas' pattern.

## Revalidation

**Verdict:** true-positive

Confirmed reachable and crash-inducing, with the impact correctly bounded. getSessionRouteParams (line 75) passes rawParams.homeworkProblems straight to parseHomeworkProblems (problem-cards.ts:198-225), which does `JSON.parse(rawValue) as HomeworkProblem[]` and, if the result is a non-empty array, returns `parsed.map(p => ({...p, selectedMode: p.selectedMode ?? null}))` with NO per-element validation. A crafted deep link `mentomate://...session?mode=homework&homeworkProblems=[1,2,3]` (or `[{}]`) yields elements where spreading a primitive/empty object produces `{selectedMode: null}` with `text === undefined`. The session route IS deep-link reachable — the sibling _hooks/_image-uri-allowlist.ts documents exactly this (`mentomate://` scheme, `mode=homework&...` deep link). session/index.tsx consumes getSessionRouteParams (line 204), seeds homeworkProblemsState from it (line 360), and computes activeHomeworkProblem = homeworkProblemsState[currentProblemIndex] (line 641). At render, SessionAccessory→HomeworkModeChips (SessionAccessories.tsx:512/527) reaches line 389 `{activeHomeworkProblem?.text.slice(0, 70) ?? ''}` — the optional chain guards activeHomeworkProblem (which is defined: `{selectedMode:null}`), NOT `.text`, so `undefined.slice(0,70)` throws a TypeError during render (mode==='homework', length>0, problemExpanded defaults true). SessionScreen wraps SessionScreenInner in <SessionErrorBoundary> (lines 132-138), so the result is a degraded session screen, not an OS crash, data loss, or cross-profile read — exactly as the finding states. Note: the finding cited getHomeworkProblemText (problem-cards.ts:191) as the crash site, which is actually only used in tests, but its general claim ('other consumers treat text as a string, producing a TypeError') is borne out by the real live site at SessionAccessories.tsx:389. The defect (unvalidated parse of attacker-influenceable input violating the repo's @eduagent/schemas validation norm) is genuine; BUG severity / robustness framing is correct.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-26)
