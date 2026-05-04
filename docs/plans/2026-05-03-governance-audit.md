# Governance Audit — 2026-05-03

Codebase audit triggered from `/insights` follow-up. Four parallel `Explore` agents covered: mobile screen duplication, API route/service duplication, test infrastructure, and governance/hook enforcement gaps. This doc captures the findings and the agreed action sequence so a second agent can pick up without re-running the audit.

## Status

- **#1 Today (security / runtime correctness):** another agent owns it. Scope: C1 Inngest scoping audit + extract `dispatchInterviewPersist` for C3, C2 SecureStore wrapper migration.
- **#2 This week (governance):** 5 lint rules + Rule 6, each as its own PR. Worktree pre-created at `../eduagent-build-governance` (detached HEAD on `origin/main`) — branch from there.

## Audit findings

### CRITICAL — rule violations to fix

| ID | Violation | Count | Representative locations |
|---|---|---|---|
| C1 | Internal `jest.mock()` of own services in unit + integration tests (CLAUDE.md ban) | ~60 API / ~200 mobile / 9 in `*.integration.test.ts` | `apps/api/src/inngest/functions/session-completed.test.ts:101–254` (18 mocks); `apps/api/src/middleware/metering.test.ts:24–193` (12 mocks); `tests/integration/*` mocking `inngest/client` and `services/sentry` |
| C2 | `optional: true` on mandatory Maestro steps | 231 / 63 flows | `apps/mobile/e2e/flows/onboarding/sign-up-flow.yaml:81–158` (12 covering steps 7–16 — flow passes when Clerk verification is broken); `homework/camera-ocr.yaml` (29); `account/account-lifecycle.yaml` (5) |
| C3 | `eslint-disable` in production code | 6 prod, 16 test | `components/AnimatedSplash.tsx:36,38`; `components/session/MessageBubble.tsx:49,79,122`; `components/session/ChatShell.tsx:285`; `lib/theme.ts:20,23`; `lib/profile.ts:101`; `hooks/use-dictation-playback.ts:185` |
| C4 | SecureStore keys with `:` separator (iOS keychain unsafe) | 2 | `components/session/BookmarkNudgeTooltip.tsx:9`; `lib/sign-out-cleanup.ts:35` (key `bookmark-nudge-shown:${id}`) |

### HIGH — duplication / centralization opportunities

| ID | Extraction | Saves | Note |
|---|---|---|---|
| H1 | `<ScreenHeader title onBack rightAction>` at `apps/mobile/src/components/common/` | ~57 screens hand-rolling `useSafeAreaInsets` + back `Pressable` + title | Zero shared component exists today |
| H2 | `<QueryStateView isLoading error isEmpty onRetry>` wrapping `TimeoutLoader` + `ErrorFallback` | ~28 screens with inline `if (isLoading) … if (isError) …` ladders | `TimeoutLoader` exists; only 1 of 5 screens that need it actually uses it |
| H3 | Adopt existing `createHookWrapper` from `apps/mobile/src/test-utils/app-hook-test-utils.tsx` | 39 test files / 403 `createWrapper()` sites — helper has **zero current imports** | Pure codemod, no new code |
| H4 | `withProfile(c)` / `getRouteContext(c)` API helper + shared `RouteEnv` type | 195 `const db = c.get('db')` + 139 `requireProfileId(...)` extractions; 31 `RouteEnv` redeclarations | `apps/api/src/types/route-env.ts` |
| H5 | `runLlmTask<T>({ messages, schema, rung })` wrapping route+extract+parse | 81 LLM call sites; ~20 follow full assemble→call→`extractFirstJsonObject`→`safeParse` | Envelope flows already have `parseEnvelope`; this targets non-envelope services |
| H6 | `packages/test-fixtures/` with valid v4 `TEST_PROFILE_ID` etc. | 221 `'test-profile-id'` literals; 3+ files with non-RFC-4122 sequential UUIDs that fail Zod 4 | `apps/api/src/routes/interview.test.ts:68` documents the breakage |
| H7 | Typed `navigate(routeKey, params)` + ban `as never` on router calls | 109 raw `router.push` / 163 `as never` casts across 38–48 files | Cross-stack ancestor-chain bug class CLAUDE.md warns about |

### Clean (no action needed) — verified by grep

- `drizzle-orm` imports in `apps/api/src/routes/`: **zero** (the documented `routes/sessions.ts` exception in CLAUDE.md is stale — file no longer imports it)
- LLM SDKs (`openai`, `@anthropic-ai/sdk`, `@google/generative-ai`) outside `services/llm/`: zero
- `process.env` reads in `apps/api/src/` non-test code: zero (25 files match, all `*.test.ts` / `*.integration.test.ts`)
- `[MARKER]` tokens in prompts: zero
- `it.skip` / `test.skip` / `xit` / `it.todo` direct calls: zero (5 matches are `describe.skip` ternary references for env-gated suites — legitimate pattern)
- `export default` outside `apps/mobile/src/app/` (Expo Router pages): zero in `components/`, `hooks/`, `lib/`
- Direct deep-push `router.push('a/[x]/b/[y]')` shortcuts: zero

## Governance plan — 5 lint rules + Rule 6 (each its own PR, 1–3 line config change)

Apply in `eslint.config.mjs` (root) and `apps/mobile/eslint.config.mjs` as appropriate. Worktree at `../eduagent-build-governance` is on `origin/main` ready to branch.

| ID | Rule | Layer | Notes |
|---|---|---|---|
| G1 | `no-restricted-imports` ban `drizzle-orm` in `apps/api/src/routes/**` | root config | NO override needed — `routes/sessions.ts` no longer imports drizzle. Update CLAUDE.md "Known Exceptions" to reflect this. |
| G2 | `no-restricted-imports` ban `openai` / `@anthropic-ai/sdk` / `@google/generative-ai` / `@google/genai` outside `apps/api/src/services/llm/**` | root config | Currently clean; preventive |
| G3 | `no-restricted-syntax` for `process.env.*` MemberExpression in `apps/api/src/**` excluding `**/*.test.ts`, `**/*.integration.test.ts` | root config | Use selector `MemberExpression[object.name="process"][property.name="env"]` |
| G4 | `no-restricted-syntax` for `ExportDefaultDeclaration` in `apps/mobile/src/**` excluding `apps/mobile/src/app/**` | mobile config | Pages need defaults; everything else doesn't |
| G5 | `no-restricted-syntax` with selectors for `it.skip()`, `test.skip()`, `describe.skip()` direct calls + `xit(`, `xdescribe(`, `it.todo(` | root config | Selector targets `CallExpression` callees only — does NOT flag `hasDb ? describe : describe.skip` ternary patterns (5 legit env-gated suites would be false positives) |
| G6 | `reportUnusedDisableDirectives: 'error'` + plan to enable `linterOptions.noInlineConfig: true` after C3 cleanup | root config | Don't enable `noInlineConfig` until 22 existing `eslint-disable` callsites are removed (6 prod, 16 test) |

## Pending follow-ups (lower priority)

### Custom ESLint rules (more effort, higher value than G1–G6)

- **GC1** — Flag relative `jest.mock('./...' \| '../...')` not on adapter allowlist (`stripe`, `clerk`, `sentry`, `revenuecat`, `notifications`, `push`, `logger`). Catches the C1 CRITICAL pattern at lint time.
- **GC2** — Flag string-literal SecureStore keys containing chars outside `[a-zA-Z0-9._-]`. Catches C4 and future drift.
- **GC3** — Flag `#[0-9a-fA-F]{3,6}` literals in `apps/mobile/src/components/**` JSX/TSX (currently only `AnimatedSplash` violates; rule is preventive).
- **GC4** — Flag `router.push(` calls with two `[param]` segments and no intermediate push.
- **GC5** — Enforce the `// @inngest-admin: cross-profile` tag on every Inngest function that bypasses `createScopedRepository`. Tag is currently documentation-only (7 functions: `daily-snapshot`, `daily-reminder-scan`, `filing-stranded-backfill`, `monthly-report-cron`, `recall-nudge`, `review-due-scan`, `weekly-progress-push`). Future cross-profile admin work should add the tag; a custom rule can grep for `db.select(...)` / raw `eq(...profileId...)` in `apps/api/src/inngest/functions/**` and require either a `createScopedRepository` call or the `@inngest-admin` tag in the file header.

### Claude Code drift-catcher hooks

These complement ESLint by catching what Claude writes *before* staging. Run as `PostToolUse` Edit|Write. The pattern is established at `~/.claude/hooks/post-edit-lint.sh` (already shipped). Each new hook is a sibling script:

- **HK1** — `post-edit-no-internal-mock.sh`: warn on relative `jest.mock` not on adapter allowlist
- **HK2** — `post-edit-no-suppression.sh`: warn on new `eslint-disable` / `@ts-ignore` / `@ts-nocheck`
- **HK3** — `post-edit-securestore-key.sh`: warn on SecureStore keys with `:`, `/`, space
- **HK4** — `post-edit-route-bg-work.sh`: warn on `setTimeout` / `setImmediate` / `Promise.allSettled` / unawaited `void` in `apps/api/src/routes/`

### CI checks (cheap)

- `grep -rE '\[(INTERVIEW_END|ESCALATE|HOLD|CLOSE|MARKER|END|SIGNAL)\]' apps/api/src/` — fail on marker tokens in prompts
- Scan `docs/plans/**/*.md` for `DROP TABLE|DROP COLUMN|ALTER TABLE.*DROP` and fail if `## Rollback` section absent in the same file

## Recommended sequencing

1. **Today** — C1, C2, C3, C4 (security / runtime correctness) on `language-add`
2. **This week** — G1–G6 lint rules, each as its own PR off the `../eduagent-build-governance` worktree
3. **Next sprint** — H3 codemod (39 test files adopting `createHookWrapper`); replace 5 inline 15s timeout reimplementations with existing `<TimeoutLoader>`; clean up the 8 production `eslint-disable` callsites so G6 can flip `noInlineConfig: true`
4. **Following sprint** — Build and migrate to `<ScreenHeader>` (H1) and `<QueryStateView>` (H2); custom ESLint rule GC1 + Claude hook HK1 to ban *new* internal `jest.mock()` (existing 200+ violations are a separate epic)
5. **Defer** — Maestro `optional: true` cleanup (C2 broader sweep): the `sign-up-flow.yaml` ones reflect a real Clerk testing limitation; move that flow to `tags: [manual]` and document, don't chase the others until a Clerk test fixture story exists.

## Related artifacts

- Worktree at `../eduagent-build-governance` on `origin/main` for governance PR work
- `~/.claude/skills/challenge/SKILL.md` — adversarial-review-then-amend skill
- `~/.claude/skills/coordinator-dispatch/SKILL.md` — coordinator-first parallel dispatch skill
- `~/.claude/hooks/post-edit-lint.sh` + settings.json `PostToolUse` hook — runs ESLint after Edit/Write on TS/TSX
