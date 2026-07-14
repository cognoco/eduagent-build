---
title: "S2-03 — docs/canon/principles.md Extraction Draft"
status: DRAFT (Wave-0 paper artifact — NOT applied)
date: 2026-07-14
repo: cognoco/eduagent-build
stream: Stream 2 — Deferred Estate-Canon Drain (PRG-20)
source-of-intent: _wip/umbrella-program/stream-2-backlog.md (§ Inventory, "Size-ceiling outcome", 2026-06-13)
next-wi: S2-04 (the actual landing — NOT yet authorized)
---

> **No canon edits applied.** This file is the entire deliverable. Nothing in
> `AGENTS.md`, `docs/canon/principles.md`, or `docs/architecture.md` has been
> touched. Every "PROPOSED" block below is content to be pasted by a later,
> separately-authorized WI (S2-04). No git operations were run to produce this
> draft.

## 0. Provenance check against the ratified intent

`_wip/umbrella-program/stream-2-backlog.md` § Inventory → "Size-ceiling
outcome (added 2026-06-13)" names exactly two moves:

- **Languages binding-rules → `architecture.md`**
- **Code Quality Guards + the Non-Negotiable Rules → `docs/canon/principles.md`**

It also records the ceiling as "today 45.5k (+5.5k over)... worktree branches
already carry 46.9k." **Verified against the live file — the premise has
drifted further:** `AGENTS.md` on `main` is now **53,740 chars** (`wc -c`,
2026-07-14), not 45.5k. The over-limit gap the drain must close is bigger than
the backlog doc assumed a month ago. Arithmetic below uses the measured
53,740, not the stale 45.5k.

WI-387 (`.claude/memory/` triage) additionally names
`project_known_bug_patterns` as row 4 of its memory-drain capture table,
target = "`AGENTS.md` ## Code Quality Guards (alongside GC1–GC6)." Since Code
Quality Guards itself is moving to `principles.md`, the two bug patterns land
there instead — same destination section, new address. Read and incorporated
below (§2).

---

## 1. The ceiling arithmetic

Measured with `wc -c` on the live file and on the actual stub text drafted for
this document (not estimated — the projected total below is the real
character count of a spliced file built from the two, verified again with
`wc -c`).

| # | Section (current AGENTS.md) | Current chars | Disposition | Pointer-stub chars | Net delta |
|---|---|---:|---|---:|---:|
| 1 | `## Languages` (incl. 3 `###` subsections: UI strings hygiene, Hardcoded-JSX-literal ratchet, Variable-interpolation fallbacks) | 4,833 | **MOVE** → `architecture.md` § Languages | 475 | −4,358 |
| 2 | `## Non-Negotiable Engineering Rules` | 5,359 | **MOVE** → `docs/canon/principles.md` § Non-Negotiable Engineering Rules | 616 | −4,743 |
| 3 | `## Known Exceptions to Engineering Rules` | 3,483 | **MOVE** → `docs/canon/principles.md` § Known Exceptions (see boundary call B1) | 525 | −2,958 |
| 4 | `## Schema And Deploy Safety` | 2,149 | STAY (see boundary call B2) | — | 0 |
| 5 | `## Required Validation` | 2,918 | STAY — hook/CI mechanics, agent-operational | — | 0 |
| 6 | `## Repo-Specific Guardrails` | 1,299 | STAY (see boundary call B3) | — | 0 |
| 7 | `## UX Resilience Rules` | 629 | STAY (see boundary call B3) | — | 0 |
| 8 | `## Fix Development Rules` | 914 | STAY (see boundary call B3) | — | 0 |
| 9 | `## Code Quality Guards` (GC1–GC6) | 3,858 | **MOVE** → `docs/canon/principles.md` § Code Quality Guards | 475 | −3,383 |
| — | All other sections (Snapshot, How to Work, Initialization, Repo Skills, Cosmo work items, Git Commits, Pull Requests, Worktree Placement, Skill Overrides, Skill Authoring, Cross-runtime File Sync, Profile Shapes, Planning Discipline, Decisions/ADRs, Secrets Management, PR Review & CI Protocol, On Compaction, Handy Commands) | n/a | STAY — agent-operational (harness behavior, how to work this repo) | — | 0 |

**Rows actually moved: 1, 2, 3, 9** (4 sections, 17,533 gross chars, 2,091
stub chars, net removal 15,442 chars).

**Verification method (not estimation):** built `/tmp/wave0/AGENTS.md.projected`
by splicing the live `AGENTS.md` — sections 1/2/3/9 above swapped for their
stub text, everything else byte-identical — and ran `wc -c` on the result.

```
wc -c AGENTS.md                        →  53,740
wc -c /tmp/wave0/AGENTS.md.projected    →  38,304
```

**Projected total: 38,304 chars. Under the 40,000 limit by 1,696 chars
(4.2% margin).** Header structure was checked post-splice (`grep -n '^## '`)
— all 27 sections present in order, the `<!-- ZDX-PROJECT-RULES:BEGIN/END -->`
sync-managed block (lines 118/158) untouched. This is comfortable margin, not
a knife-edge: it absorbs normal doc growth for a few months before the next
trim is needed, without requiring rows 4/6/7/8 (the boundary-call candidates)
to move as well.

If a future edit erodes the margin, the next-cheapest lever is row 4 (`Schema
And Deploy Safety`, 2,149 chars) — see boundary call B2.

---

## 2. PROPOSED `docs/canon/principles.md` — full draft content

Ready to paste as the new file's entire body (front-matter + content). Sourced
verbatim from `AGENTS.md` §§ Non-Negotiable Engineering Rules, Known
Exceptions to Engineering Rules, Code Quality Guards, and
`.claude/memory/project_known_bug_patterns.md` (both patterns) — reorganized
into one coherent catalog, not a copy-paste dump.

~~~markdown
---
title: MentoMate Principles & Invariants Catalog
status: CANON
last_updated: 2026-07-14
owner: Stream 2 (PRG-20) — estate-canon drain
---

# Principles & Invariants Catalog

This is the durable rule layer for the MentoMate codebase: engineering
invariants that hold regardless of which feature or PR is in flight, the
sanctioned exceptions to them, and the code-quality guards that catch bugs
type-checking misses. It is **canon** — the same authority tier as
`architecture.md` and `docs/adr/`, not a per-repo agent-behavior doc. Any
agent working this codebase (`AGENTS.md` / `CLAUDE.md`) is pointed here for
these rules rather than carrying them inline, so this file — not the pointer
— is the source of truth when they conflict.

Promoted from `AGENTS.md` § Non-Negotiable Engineering Rules + § Known
Exceptions + § Code Quality Guards, and `.claude/memory/project_known_bug_patterns.md`,
by the Stream 2 estate-canon drain (PRG-20), 2026-07 (WI-386 follow-through,
size-ceiling outcome).

## 1. Non-Negotiable Engineering Rules

- `@eduagent/schemas` is the shared contract. Do not redefine API-facing types locally.
- Business logic belongs in `services/`, not in route handlers. Route/service boundaries are lint-enforced (eslint G1 and G5 in `eslint.config.mjs`).
- Reads must use `createScopedRepository(profileId)` when the query operates on a single scoped table. For queries that join through a parent chain (e.g. `learning_sessions → curriculum_topics → curriculum_books → subjects`), use direct `db.select()` and enforce `profileId` via `subjects.profileId` (or the closest ancestor that owns it) in the WHERE clause. The scoped repo cannot express multi-table joins; the parent-chain pattern is the sanctioned alternative. Existing examples: `services/session/session-topic.ts`, `session-book.ts`, `session-subject.ts`. A second sanctioned deviation, for a **single scoped table**: reads that need ordering and/or a limit the scoped repo's `findFirst`/`findMany` API cannot express — e.g. a strict time-bound (`lt(createdAt, …)`) with `orderBy(desc(createdAt))` and `limit(1)` together to fetch the latest row before a timestamp, or an `orderBy` + `limit` pair with no time-bound at all — use direct `db.select()` with `profileId` pinned in the WHERE clause; it is the inexpressibility, not the specific predicate shape, that makes this the sanctioned pattern rather than a violation. Existing examples: `inngest/functions/review-calibration-grade.ts` (EU-7 grader-failure cap); `apps/api/src/services/now-feed.ts`'s `collectRecapReadyCandidates` and `collectSnapshotReadyCandidates` (WI-1121 derive-on-read projections).
- Writes must include explicit `profileId` protection or verify ownership through the parent chain before updating child records.
- Shared mobile components stay persona-unaware. Use semantic tokens and CSS variables, not persona checks or hardcoded hex colors. Exception: brand-fixed hex values are acceptable inside SVG-internal animation and celebration components (`*Animation.tsx`, `*Celebration.tsx`, `AnimatedSplash.tsx`, `MentomateLogo.tsx`) when the file annotates the brand intent.
- Durable async work goes through Inngest. Do not fire-and-forget background work from route handlers.
- LLM calls go through `services/llm/router.ts` or its barrel, not direct provider SDK calls.
- Non-core Inngest dispatches (telemetry, post-success notifications, observability events) go through `safeSend()` in `apps/api/src/services/safe-non-core.ts` so a dispatch failure is captured in Sentry but never throws and never breaks the user action. Bare `inngest.send(...)` is reserved for CORE flows where dispatch failure must short-circuit the user action — those sites carry a `// core-send: <reason>` comment on the line(s) immediately above the call. Forward-only ratchet test: `apps/api/src/services/safe-non-core.guard.test.ts`.
- LLM responses that drive state-machine decisions (close interview, hold escalation, trigger UI widget) must use the structured response envelope (`llmResponseEnvelopeSchema` from `@eduagent/schemas`). Parse with `parseEnvelope()` from `services/llm/envelope.ts`. Never embed `[MARKER]` tokens or JSON blobs in free-text replies. Every envelope signal must have a server-side hard cap (e.g., `MAX_INTERVIEW_EXCHANGES = 4`) so the flow terminates even if the LLM never emits the signal. See `docs/architecture.md` → "LLM Response Envelope" for the full contract.
- When changing LLM prompts (`apps/api/src/services/**/*-prompts.ts` or `apps/api/src/services/llm/*.ts`), run the eval harness (`pnpm eval:llm`) to snapshot before/after, and `pnpm eval:llm --live` (Tier 2) to validate real LLM responses against `expectedResponseSchema`. The pre-commit hook does NOT run the harness; it only checks for staged snapshot files when drift exists, or a harness-written zero-drift receipt when the full Tier-1 run rewrote snapshots with no tracked changes. Harness code: `apps/api/eval-llm/`.
- Challenge Round mastery policy is server-owned and conservative over structured LLM evidence. The LLM proposes per-concept evaluations via `signals.challenge_round_evaluation`; each item must include `answerEventId` and `learnerQuote`. The server runs `decideMasteryAndReview()` and sets `assessments.mastery_challenge_verified_at` only when EVERY concept evaluates `solid`. Any `partial`, `missing`, or `misconception` blocks mastery and routes the weak concepts to `needs_deepening_topics` with `source = 'challenge_round'`. Notes drafted from Challenge Rounds must use only `solidAnswerQuotes` and pass the lexical-overlap hallucination guard in `services/challenge-round/note-draft.ts` before being shown to the learner. Challenge Round LLM calls must still route through `resolveExchangeLlmRouting()`; accepted/active/drafting turns may apply a routing-only rung-4 floor (mechanism planned — `ExchangeContext.llmRoutingRung` field not yet in source), and per-tier model routing (incl. minor/Family) follows `MMT-ADR-0014` + `docs/registers/llm-models/master.md` (the prior "Family = Gemini-only" wording is superseded — Gemini is excluded under-18). The persistent Challenge mode toggle (`learningMode: 'serious' | 'casual'`) was removed in Phase 0 (PR #325); today's `casual` is the single default tone and rigor is now expressed per-Challenge-Round rather than globally.

## 2. Known Exceptions to Engineering Rules

These deviations from §1 exist in the codebase as of 2026-05-01. They are
listed here so reviewers don't try to "fix" them in unrelated PRs and so new
contributors don't take them as precedent. Each exception should either be
tracked toward a refactor, or promoted into an explicit rule.

- **`apps/mobile/tsconfig.json` declares `references[]: [{ "path": "../api" }]`**, in tension with the conceptual "mobile must not depend on api" rule. This is required so `import type { AppType } from '@eduagent/api'` resolves for the Hono RPC client. **Type-only imports** from `@eduagent/api` are accepted; runtime imports remain forbidden (they would pull API server code into the mobile bundle). See `docs/architecture.md` → "AppType" example for the rationale.
- **`@clerk/clerk-js` ships `@coinbase/wallet-sdk` + `@solana/*` into `node_modules`, but they never reach the device bundle** — clerk-js `dist` is PRE-BUNDLED (no `require()` of those packages), so Metro never traverses them; install-footprint only, zero device-bundle impact (verified WI-1040). Not removable via pnpm config: they are real `dependencies` of clerk-js, not missing optional peers, so `pnpm.peerDependencyRules.ignoreMissing` does not apply. An upstream issue against `@clerk/clerk-expo` for a no-web3 entrypoint is the only real mitigation; do not attempt to strip them locally.
- **The global unscoped `@tanstack/query-core` pin in root `package.json` `pnpm.overrides` is load-bearing**, not hygiene debt — it dedupes query-core to one version across `@clerk/shared` (declares `5.87.4`) and the `@tanstack/*` consumers (react-query, query-async-storage-persister, query-persist-client-core). Scoping it to the react-query edge (`@tanstack/react-query>@tanstack/query-core`) regresses to 3 separate query-core versions in the tree (verified WI-1043). Keep it global, and bump its version **in lockstep** whenever `@tanstack/react-query` is bumped.
- **Account-level Inngest events omit `profileId`** — `app/account.reclaim_attempt` and similar events that fire at account-creation time (before any profile exists) legitimately carry no `profileId`. This is a sanctioned deviation from the "payloads always include `profileId`" rule for events scoped to the accounts table by `clerkUserId` or `accountId`. The `@inngest-admin: event-profile` annotation documents the scoping mechanism in place. Do not attempt to add a dummy `profileId: null` to satisfy the rule textually — it would be misleading.
- **`teachingPreferenceSchema.analogyDomain` (request) keeps `.nullable().optional()`** — a documented carve-out (WI-1160, operator-ruled) from the "never `.nullable().optional()`; request → `.optional()`, response → `.nullable()`" canon (`docs/project_context.md`, `docs/architecture.md`). This **request** field is genuinely tri-state: a value = set, `null` = explicitly clear, absent = leave unchanged. `null`-as-clear is established, tested product behavior (`apps/api/src/routes/retention.test.ts` → "accepts null analogyDomain to clear preference"), so both `.nullable()` and `.optional()` are required; the canon's "pick one" wrongly assumes null and absent are interchangeable here. The ban is docs-only (no automated checker), so no escape annotation is needed. The **response** fields (`teachingPreferenceResponseDataSchema.analogyDomain` / `nativeLanguage`) DO conform to `.nullable()` — the carve-out is request-side only.

## 3. Code Quality Guards

These rules catch bugs that survive type-checking and only surface at
runtime. GC1–GC6 learned from adversarial review (2026-04-05); the two
patterns in §3.7–3.8 learned from the 2026-04-13 systemic-bug sweep (20
instances found and fixed across the codebase). Both sets share the same
authority level and the same audience — check for them when reviewing or
writing new code.

- **No internal mocks in integration tests.** Never `jest.mock` your own database, services, or middleware in integration tests. Mock only true external boundaries (Stripe, Clerk JWKS, email providers, push notification services). Internal mocks hide real bugs.
- **No new internal `jest.mock()` (GC1 ratchet).** CI fails any PR that adds a relative-path `jest.mock('./...')` or `jest.mock('../...')` line in `*.test.ts` / `*.test.tsx`. Existing legacy sites are NOT blocked by the ratchet but are NOT considered acceptable state — they are backlog for the GC6 burn-down. To stub a few named exports of an internal module, use `jest.requireActual()` with targeted overrides (canonical pattern: `apps/api/src/inngest/functions/archive-cleanup.test.ts`). External-boundary mocks (LLM via `routeAndCall`, push, email, Stripe, Clerk JWKS) use bare specifiers and are unaffected. The `// gc1-allow: <reason>` escape is reserved for cases where the code under test genuinely cannot be exercised (no real implementation available in the test environment); it is not an "I don't feel like wiring the real thing today" escape.
- **Response bodies are single-use.** Never call both `.json()` and `.text()` on the same `fetch` Response — the body stream is consumed on first read. If you need both JSON parsing with a text fallback, read `.text()` once and `JSON.parse` it manually. Applies to `assertOk`-style helpers, error-extraction middleware, and SSE error handlers.
- **Classify errors before formatting.** When code branches on error *type* (reconnectable vs. fatal, quota vs. network) and also formats errors for display, classify the **raw** error object first, then format for the user. Never string-match on the output of `formatApiError` — the formatter strips status codes, error codes, and keywords classifiers depend on.
- **Clean up all artifacts when removing a feature.** Grep the entire project for all references: types, imports, constants, SecureStore keys, commented-out JSX, fallback branches. Orphaned types create false confidence, unreachable fallback branches inflate coverage, leaked storage keys waste device storage forever.
- **Verify JSX handler references exist** after adding any `Pressable` or `Button` — an `onPress={handleX}` that points at a removed or renamed handler type-checks but is dead at runtime.
- **GC6 — Boy-scout internal mocks when editing test files.** Any time you edit a test file (`*.test.ts` / `*.test.tsx` / `*.integration.test.ts`) for any reason, scan it for `jest.mock('./...')`, `jest.mock('../...')`, or `jest.mock('@eduagent/...')` and remove the internal mocks before the edit is complete. Use the real implementation, or convert to `jest.requireActual()` with targeted overrides (canonical pattern: `apps/api/src/inngest/functions/archive-cleanup.test.ts`). Run `/my:sweep-mocks` for the full workflow. The PostToolUse hook at `~/.claude/hooks/post-edit-jest-mock-check.sh` surfaces offending lines after every test-file edit; treat that output as a blocker on task completion, not a follow-up. External-boundary mocks (LLM via `routeAndCall`, Stripe, Clerk JWKS, push, email, Inngest framework) use bare specifiers and are not violations. The `// gc1-allow: <reason>` escape applies only when the real code cannot run in the test environment — not as a convenience. **Policy:** internal mocks are not acceptable state, they are backlog. **Why:** GC1 gates new violations; GC6 forces every test-file visit to reduce the legacy backlog. The deferral escape (leave the mocks, record file paths + count in the commit message) exists only when burn-down would balloon a focused task — it does not authorize preserving the mocks indefinitely.
- **Silent fallbacks.** Code that silently degrades to a "safe" default instead of surfacing an error. Found in API services and mobile query consumers, 2026-04-13 sweep (10 instances: `summaries.ts`, `assessments.ts`, `subject-resolve.ts`, `subject-classify.ts`, `library.tsx`, `shelf/index.tsx`, `child/mentor-memory.tsx`, `session-summary`). Variants:
  - `?? []` on TanStack Query `.data` — only catches null/undefined, not wrong object shapes. TanStack Query's `select` is bypassed when `enabled=false`, so `.data` can be an unexpected shape. **Fix:** `Array.isArray(query.data) ? query.data : []`.
  - API/LLM catch blocks returning success-shaped objects (`isAccepted: true`, `status: 'direct_match'`) — masquerades a service failure as a valid result. **Fix:** return error/no-match status so the UI shows a retry path.
  - `void mutateAsync(...)` with no `.catch()` — the user gets no feedback when a mutation fails. **Fix:** wrap in async handler with `Alert.alert` on catch.
  - Raw LLM response text embedded in fallback strings (`response.slice(0,30)`) — error messages or safety refusals can leak into student-facing UI.
  - **How to apply:** when writing any catch block or fallback path, ask "does this look like success to the caller?" If yes, it's a silent fallback bug.
- **React state timing gaps.** `isPending` or `useState` booleans used as concurrency guards but vulnerable to React's async batching. Found in mobile screens with mutation + Alert retry patterns (`shelf/index.tsx`, `pick-book`, `session/index.tsx` `handleEndSession`, `session-summary` `handleSubmit`/`handleContinue`), 2026-04-13 sweep.
  - **The race:** when a TanStack Query mutation fails, `isPending` resets to `false` before the Alert callback fires. The user can then tap both the Alert "Try again" button AND a re-enabled UI button simultaneously, firing two concurrent mutations.
  - **Fix:** add a `useRef(false)` lock alongside the `isPending` check — the ref is synchronous and not subject to React batching:
    ```ts
    const inFlight = useRef(false);
    if (mutation.isPending || inFlight.current) return;
    inFlight.current = true;
    // ... in catch/finally: inFlight.current = false;
    ```
  - **Related variant:** `setIsClosing(false)` in a catch block re-enables a button while the error Alert is still visible. **Fix:** move the state reset into the Alert's button callback instead.
  - **How to apply:** any async handler that (a) checks `isPending` at the top, (b) calls `mutateAsync`, and (c) has an Alert with a retry callback needs a ref lock. Also check: any `setState(false)` in a catch block that re-enables a button while an Alert is still on screen.
~~~

---

## 3. PROPOSED `architecture.md` addition — Languages

Verbatim from `AGENTS.md` § Languages, unchanged (already framed as
architecture, not agent-behavior — no rewrite needed, just relocation).
Recommend inserting as a new `## Languages` section immediately after
`## Implementation Patterns & Consistency Rules` (currently `architecture.md:615`)
— the two other i18n-adjacent mentions in that section (if any) should
cross-reference forward rather than duplicate.

~~~markdown
## Languages

Two language enums exist, and they intentionally diverge:

| Concept | Enum | Where | Count |
|---|---|---|---|
| UI shell language | `SUPPORTED_LANGUAGES` | `apps/mobile/src/i18n/index.ts:23` | 7: en, de, es, ja, nb, pl, pt |
| LLM tutor-prose language | `conversationLanguageSchema` | `packages/schemas/src/profiles.ts:10` | 10: en, cs, es, fr, de, it, pt, pl, ja, nb |

The conversation set is intentionally a **superset**. Czech, French, and Italian
learners can pick those as their tutor-prose language during onboarding and
get LLM cards in their language; the UI shell falls back to English because we
haven't committed to maintaining UI translations for those locales yet.

`useMentorLanguageSync` (`apps/mobile/src/hooks/use-mentor-language-sync.ts:10`)
clamps `i18next.language` through `conversationLanguageSchema.safeParse` before
patching the profile, so a UI-language change can never write an invalid value
to `profiles.conversation_language`. The DB CHECK constraint
(`profiles_conversation_language_check`, migration 0087) is the hard floor.

Adding a language requires:

- **UI-only locale (already in conversation set):** add to `SUPPORTED_LANGUAGES`,
  add `LANGUAGE_LABELS` entry, add to `resources` in `i18n/index.ts`, run
  `pnpm translate`, ensure `scripts/check-i18n-staleness.ts` passes.
- **Conversation-only locale:** add to `conversationLanguageSchema`, add to
  `CONVERSATION_LANGUAGE_NAMES` in `apps/api/src/services/llm/router.ts:194`,
  add a new migration extending the DB CHECK constraint.
- **Both:** combination of the two.

### UI strings hygiene

`scripts/check-i18n-orphan-keys.ts` is a `ts-morph` AST walker (it replaced the
old regex scanner). It is the single source of truth for i18n key health:

- **Forward orphans:** a `t('foo.bar')` whose key is missing from `en.json`.
- **Unused (reverse) orphans:** an `en.json` key no `t(…)` call references.
  Default-on; pass `--allow-unused` only for ad-hoc local debugging.
- **Namespace misuse:** `t('ns:key')` colon-prefix and `useTranslation('ns')`.
- **Multi-interpolation templates:** `t(\`a.${x}.b.${y}\`)` loses the literal
  between vars; refactor to compute the key, or add an on-line
  `// i18n-allow-multi-var: <reason>` escape.

Keys reached only through runtime-dynamic dispatch (a map lookup, an
`i18next.t(entry.key)`, a `${var}`-suffixed template) live in
`scripts/i18n-keep.ts` as `KEEP_PATTERNS`. Each entry's `reason` must cite a
real `file:line`; `scripts/check-i18n-keep-rot.ts` fails CI if a cite rots. The
walker also follows `cond ? 'a' : 'b'`, `x ?? 'a'`, `as` casts, `i18next.t(…)`
member calls, and `const tr = t` alias rebindings.

### Hardcoded-JSX-literal ratchet (Phase 3)

The orphan-key checker only sees strings that pass through `t()`. Hardcoded
English literals in JSX (e.g. `<Text>Add child</Text>`) bypass i18n entirely
and render English to every locale. `scripts/check-i18n-jsx-literals.ts` is the
read-side guard: a `ts-morph` AST walker that flags `JsxText` nodes and
JSX-children `StringLiteral` / `NoSubstitutionTemplateLiteral` nodes (including
through `cond ? 'a' : 'b'`, `x && 'a'`, `x ?? 'a'`, casts/parens) plus
user-visible JSX attribute literals for known copy props (`label`,
`accessibilityLabel`, `title`, `placeholder`, etc.) in
`apps/mobile/src/**/*.tsx`. It is a forward-only baseline ratchet mirroring the
`no-clinical-copy` pattern: existing literals are grandfathered in
`scripts/i18n-jsx-literals-baseline.json`, and only NEW literals fail CI (the
`i18n hardcoded-JSX-literal check` step in `ci.yml`). Child/text violations are
keyed on `{file, kind, text}`; attribute violations are keyed on
`{file, kind, prop, text}` — never line number — so reformatting does not churn
the baseline. The attribute scanner deliberately ignores non-copy props such as
`testID`, style/class props, role-like values, IDs, routes, image/source paths,
metadata, unknown custom props, and translation-key literals. Run
`pnpm check:i18n:jsx-literals --accept` to refresh the baseline when you
genuinely add non-translatable JSX copy (a code sample, a brand token) and
justify it in the commit message.

When adding user-visible copy, route it through `t('…')` and add the key to
`en.json` in the same PR — the ratchet enforces this for the JsxText/child
surface and known copy attributes; review remains responsible for copy hidden
behind unknown custom prop names.

### Variable-interpolation fallbacks

Keys with `{{var}}` interpolation should ship a no-variable companion key when
the variable is genuinely optional, so the rendered string is never
"Starting with …" (translators guess at the ellipsis and produce odd output).
Example: instead of `t('rowSubject', { subject: subject || '…' })`, prefer
`subject ? t('rowSubject', { subject }) : t('rowSubjectNoSubject')`.
~~~

---

## 4. PROPOSED AGENTS.md diff — pointer stubs

Four sections, each shown as old-block-header → new one-liner replacement.
The full old blocks are the sections quoted verbatim in §§2–3 above (not
repeated here); only the replacement stub is new text.

### 4.1 `## Languages` (was 4,833 chars, AGENTS.md:249–334)

**New (475 chars):**
~~~markdown
## Languages

**Moved to canon.** The UI-shell-vs-LLM-tutor-prose language enums, the intentional 7-vs-10 superset, `useMentorLanguageSync`'s clamp + DB CHECK floor, the add-a-language procedure, and the i18n hygiene checkers (orphan-keys / JSX-literal ratchet / interpolation fallbacks) now live in [`architecture.md`](docs/architecture.md) § Languages. Load that section before touching `SUPPORTED_LANGUAGES`, `conversationLanguageSchema`, or any `i18n/`/`t()` call site.
~~~

### 4.2 `## Non-Negotiable Engineering Rules` (was 5,359 chars, AGENTS.md:335–348)

**New (616 chars):**
~~~markdown
## Non-Negotiable Engineering Rules

**Moved to canon.** The shared-schema contract, service/route boundary, scoped-repository read rule, `profileId` write-protection, persona-unaware mobile components, Inngest-for-durable-work, LLM-router-only calls, `safeSend` non-core dispatch, structured LLM response envelope, eval-harness-on-prompt-change, and Challenge Round mastery policy now live in [`docs/canon/principles.md`](docs/canon/principles.md) § Non-Negotiable Engineering Rules — the estate principles/invariants catalog. Read it before touching routes, services, reads/writes, LLM calls, or mastery logic.
~~~

### 4.3 `## Known Exceptions to Engineering Rules` (was 3,483 chars, AGENTS.md:349–359)

**New (525 chars):**
~~~markdown
## Known Exceptions to Engineering Rules

**Moved to canon.** The five grandfathered deviations — mobile's type-only `tsconfig` reference to `api`, `@clerk/clerk-js`'s inert web3-package install footprint, the unscoped `@tanstack/query-core` pnpm override, account-level Inngest events without `profileId`, and `teachingPreferenceSchema.analogyDomain`'s tri-state nullable+optional carve-out — now live in [`docs/canon/principles.md`](docs/canon/principles.md) § Known Exceptions, alongside the rules they deviate from.
~~~

### 4.4 `## Code Quality Guards` (was 3,858 chars, AGENTS.md:408–419)

**New (475 chars):**
~~~markdown
## Code Quality Guards

**Moved to canon.** GC1–GC6 (no internal mocks in integration tests; no-new-`jest.mock()` ratchet; single-use response bodies; classify-errors-before-formatting; clean-up-artifacts-on-feature-removal; verify-JSX-handler-references; GC6 boy-scout mock removal on test-file edits) plus the two systemic bug patterns (silent fallbacks; React state-timing gaps) now live in [`docs/canon/principles.md`](docs/canon/principles.md) § Code Quality Guards.
~~~

Everything else in `AGENTS.md` — `## Schema And Deploy Safety` through
`## Fix Development Rules` (rows 4/6/7/8 in §1's table), and all
agent-operational sections — is byte-identical to today. No other section is
touched.

**Companion move (not an AGENTS.md edit, but same landing):**
`.claude/memory/project_known_bug_patterns.md` becomes a pointer stub once
S2-04 lands — per WI-387's extract-before-cleanup rule, the memory file stays
in place with its content until `docs/canon/principles.md` § Code Quality
Guards exists, then gets reduced to a one-liner pointing there (or archived).
That memory-side edit is also out of scope for this Wave-0 draft.

---

## 5. Boundary calls (feeds D4)

Four places where "canon vs agent-operational" was a genuinely close call.
None were moved in the arithmetic above — all four STAY in the draft — but
they're surfaced here because the call could reasonably go the other way, and
because rows 6/7/8 are the next-cheapest lever if the margin in §1 ever erodes.

**B1 — Known Exceptions to Engineering Rules: bundle with Non-Negotiable Rules, or leave as an AGENTS.md operational note?**
The backlog names only "Non-Negotiable Rules" for the move, not "Known
Exceptions." Argument for STAY-in-AGENTS.md: exceptions are arguably
"how to behave here" — don't refactor these specific spots — which is
agent-operational framing. Argument for MOVE (recommended, and what this
draft does): every exception's *content* is a statement about the codebase's
current state relative to a rule, not about agent behavior, and each entry
explicitly says "should either be tracked toward a refactor, or promoted into
an explicit rule" — that's canon-register language, not harness-protocol
language. It also only makes sense read next to the rule it deviates from,
which is moving. **Recommendation: MOVE with Non-Negotiable Rules (as drafted
above).**

**B2 — Schema And Deploy Safety: canon invariant or agent-operational runbook?**
2,149 chars, currently STAYS. Argument for MOVE: several bullets are pure
invariants ("Applied migrations are immutable," "Never run `drizzle-kit push`
against staging or production") indistinguishable in kind from §1's
Non-Negotiable Rules. Argument for STAY (what this draft recommends): the
section is saturated with *procedural* detail specific to this repo's current
Neon/dev-push vs staging-migrate split (a documented, evolving, drift-prone
operational state — see `.claude/memory/project_schema_drift_pattern.md`) —
it reads as "how to operate deploys in this repo today," which is exactly the
agent-operational carve-out the task's hard constraint #3 protects. Splitting
the invariant bullets from the procedural bullets would be more surgery than
Wave-0 should attempt sight-unseen of the actual landing. **Recommendation:
STAY, but it's the next section to move if the margin needs it — see §1
closing note.**

**B3 — Repo-Specific Guardrails / UX Resilience Rules / Fix Development Rules: same shape as Non-Negotiable Rules, not named for the move.**
Combined 2,842 chars. These three read identically in *form* to §1's
Non-Negotiable Rules (flat bullet lists of durable code rules: "Default
exports are only for Expo Router page components," "Classify errors at the
API client boundary, not per-screen," "Security fixes tagged CRITICAL or HIGH
require a negative-path break test"). The backlog doc doesn't name them, and
the arithmetic in §1 doesn't need them to clear 40k. Argument for MOVE anyway
(consistency: same genre of content, arbitrary to split three ways):
Non-Negotiable Rules, Known Exceptions, and these three are all "durable
codebase invariant lists" — leaving three of five in AGENTS.md and moving two
is a seam that will look accidental in six months. Argument for STAY
(recommended, conservative default for Wave-0): the operator named exactly
two destinations for this drain; expanding scope to "everything that looks
similar" without a ruling risks silently absorbing content the operator
didn't ask to move, and the size problem is solved without touching them.
**Recommendation: STAY for S2-04; flag as a **candidate follow-on** once
`principles.md` exists and has an owner who can rule on whether the catalog
should grow to include these three.**

**B4 — Profile Shapes (Two Tab Shapes + isOwner Gating): architecture content sitting in AGENTS.md, not named by the backlog at all.**
5,808 chars (the single largest section after the four moved ones), currently
STAYS, not touched by this draft. It's pure system-behavior documentation
(nav-mode flag matrix, tab-shape tables, `isOwner` gating rules) with a
"Scope" callout already pointing at the *target* model living in
`docs/canon/identity/`. It reads like it belongs in `architecture.md`
(there's precedent — Languages is moving there for the same reason: it's
architecture, not agent behavior). It wasn't named in the backlog's
size-ceiling outcome and isn't needed for the <40k requirement, so this draft
leaves it alone rather than expanding scope unilaterally. **Recommendation:
raise at D4 as an out-of-band candidate for a *future* Stream 2 slice — not
S2-04.** Note if it does move later: it currently anchors the identity-model
"don't conflate the two" scope note that agents need to see inline; a future
move would need to keep an equally prominent pointer, not just relocate the
tables.

---

## 6. Residual risk

- **String-grep checkers over AGENTS.md content.** `scripts/check-i18n-keep-rot.ts`,
  `scripts/check-i18n-jsx-literals.ts`, and the GC1 ratchet all live as
  *scripts*, not as AGENTS.md greps — verified no CI script actually parses
  AGENTS.md's Languages/Code-Quality-Guards prose for a magic string. Risk is
  low but **not independently verified for every checker in this drain** (the
  four sections moved were read for prose content, not cross-referenced
  against every `scripts/check-*.ts` in the repo for a literal-text
  dependency on AGENTS.md). S2-04 should `rg` for `AGENTS.md` inside
  `scripts/` before landing, to confirm nothing parses these sections by
  string match rather than by convention.
- **Dual-homed load-bearing content.** `## Non-Negotiable Engineering Rules`
  bullet 9 (LLM response envelope) cross-references "See `docs/architecture.md`
  → 'LLM Response Envelope' for the full contract" — i.e. the rule *already*
  splits across two files today. Moving the AGENTS.md half to
  `principles.md` doesn't change that split, but a reader who only opens
  `principles.md` still needs to know `architecture.md` has the other half.
  The verbatim promotion in §2 preserves the cross-reference text as-is, so
  this is carried forward correctly, not fixed — flagging so S2-04 doesn't
  assume the promotion also unified the two halves.
- **Skill-sync coupling.** `AGENTS.md` states elsewhere (Cross-runtime File
  Sync section, untouched by this draft) that `.claude/skills/` is generated
  from `.agents/skills/` by a sync script with a pre-commit hook. That
  mechanism is unrelated to this drain (skills, not AGENTS.md sections) but
  worth naming: any future automation that treats "things `.claude/` syncs"
  and "things AGENTS.md sections" as the same category would be wrong — they
  are two independent sync/pointer systems living in the same file.
- **The 40k ceiling is a harness constant, not a repo constant.** This draft
  verified 40,000 as "the Claude Code harness instruction-file limit" per the
  task framing; it was not independently re-verified against current harness
  docs in this session. If that number has changed, the arithmetic in §1
  needs re-running with the new ceiling before S2-04 lands.
- **Margin is comfortable, not permanent.** 1,696 chars of headroom absorbs
  incremental AGENTS.md growth for a while, but this repo added ~8,200 chars
  to AGENTS.md in roughly one month (45.5k → 53.7k per §0). At that rate the
  new headroom could be consumed in under a month. Whoever owns
  `principles.md` post-landing should treat "new canon-shaped content
  proposed for AGENTS.md" as a standing prompt to route it there first,
  not backfill AGENTS.md and re-trim later.
