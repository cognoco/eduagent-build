# Governance Audit — 2026-05-03

Codebase audit triggered from `/insights` follow-up. Four parallel `Explore` agents covered: mobile screen duplication, API route/service duplication, test infrastructure, and governance/hook enforcement gaps. This doc captures the findings and the agreed action sequence so a second agent can pick up without re-running the audit.

## Status

- **#1 Today (security / runtime correctness):** C3 dispatchInterviewPersist extracted (`f4986667`); C4 SecureStore `:` keys sanitized + wrapper enforced via lint (`6b559da4`). C1 internal `jest.mock` cleanup pending (rule shipped at `warn` to gate new violations).
- **#2 This week (governance):** **All 7 lint rules shipped** (G1–G7 + GC1). 12 of 22 `eslint-disable` directives removed (uncommitted, 2026-05-04). 3 production + 16 test disables remain — `noInlineConfig: true` deferred until those clear.

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

## Governance plan — lint rules

Applied in `eslint.config.mjs` (root) and `apps/mobile/eslint.config.mjs` as appropriate. Original numbering (G1–G6) preserved for traceability; the as-shipped config also adds G5 (db direct ops in routes), G7 (test-skip ban), GC1 (internal `jest.mock` warn), plus mobile rules for hex literals, SecureStore wrapper, and `mutateAsync` error handling.

| ID | Rule | Layer | Status |
|---|---|---|---|
| G1 | `no-restricted-imports` ban `drizzle-orm` in `apps/api/src/routes/**` | root | ✅ Shipped (#148/`a48d0123`). |
| G2 | `no-restricted-imports` ban `openai` / `@anthropic-ai/sdk` / `@google/generative-ai` / `@google/genai` / `@google-cloud/vertexai` outside `apps/api/src/services/llm/providers/**` | root | ✅ Shipped (`a48d0123`). Combined into routes-override config so flat-config last-match-wins doesn't drop the drizzle ban. |
| G3 | `no-restricted-syntax` for `process.env.*` MemberExpression in `apps/api/src/**` excluding tests, `config.ts`, `env-validation.ts`, `middleware/llm.ts`, `inngest/helpers.ts` | root | ✅ Shipped (`a48d0123`). |
| G4 | `no-restricted-syntax` for `ExportDefaultDeclaration` in `apps/mobile/src/**` excluding `app/**`, `*.d.ts`, tests | mobile | ✅ Shipped (uncommitted, 2026-05-04). i18n `default` → named refactor needed across 4 importers. `*.d.ts` excluded for Metro `*.svg` ambient module. |
| G5 (plan) | Test-skip ban (`it.skip()`/`test.skip()`/`describe.skip()`/`it.todo()`/`xit`/`xdescribe`/`xtest`) | root | ✅ Shipped as G7 (uncommitted, 2026-05-04). Three CallExpression selectors. ConditionalExpression callees (`(hasDb ? describe : describe.skip)(...)`) correctly not flagged. |
| G5 (config) | Block direct `c.get('db').select/insert/update/delete` in route files | root | ✅ Shipped (`a48d0123`). Companion to G1; closes the import-only loophole. |
| G6 | `reportUnusedDisableDirectives: 'error'` | root | ✅ Shipped (#148). `linterOptions.noInlineConfig: true` deferred — see `eslint-disable` cleanup status below. |
| GC1 | Custom rule: warn on relative `jest.mock` of internal modules (allowlist for adapter modules) | root | ✅ Shipped (#148). Currently `warn`; ~676 legacy violations tracked toward separate cleanup epic. |

## `eslint-disable` cleanup status (2026-05-04)

12 of 22 production directives removed (uncommitted). G6 `noInlineConfig: true` flip is gated on the remaining 3 production + 16 test disables.

**Cleared (12):**
- `lib/theme.ts:20,23`, `lib/profile.ts:101`, `app/_layout.tsx:202` — context defaults: `() => {}` → `() => undefined`.
- `components/AnimatedSplash.tsx:36,38` — `any` replaced with `AnimatedSvg<P> = ComponentType<P & { animatedProps?: unknown }>`.
- `components/session/MessageBubble.tsx:49,79,122` — Reanimated `SharedValue` refs added to deps (stable refs, no re-run risk).
- `components/session/ChatShell.tsx:285` — dropped redundant manual prev-value guard; React already bails on identical state.
- `app/(app)/dictation/playback.tsx:48` — `playback` added to deps; `hasStartedRef.current` makes body idempotent.
- `app/(app)/onboarding/curriculum-review.tsx:121` — `curriculum` added to deps; cleanup + early-return preserve same end-behavior.

**Remaining production (3) — need per-effect work, not a batch:**
- `hooks/use-dictation-playback.ts:185` — `speakChunk` `useCallback([])`. Body uses `getChunksForSentence` defined inline at render time. Adding it would require chaining another `useCallback`, which would need its own disable. Current refs-only design is correct.
- `app/(app)/homework/camera.tsx:261` — adding `createSubject` (react-query mutation) to deps risks an effect loop if the mutation reference isn't stable across renders.
- `app/(app)/shelf/[subjectId]/book/[bookId].tsx:271` — effect has a `return () => clearTimeout(slowTimer)` cleanup. Adding `generateMutation`/`bookQuery` would tear down + restart the slow/timeout timers on every render, breaking the timer semantics. The `// mutation object is stable` comment is doing real work.

**Remaining test files (16):** untouched; lower priority since `gov/no-internal-jest-mock` already gates new violations at `warn`.

## Pending follow-ups (lower priority)

### Custom ESLint rules

- **GC1** — Flag relative `jest.mock('./...' \| '../...')` not on adapter allowlist. ✅ Shipped (#148) as `gov/no-internal-jest-mock` at `warn`.
- **GC2** — Flag string-literal SecureStore keys containing chars outside `[a-zA-Z0-9._-]`. ✅ Shipped as `local/securestore-safe-key` at `error`. Covers Literal and TemplateLiteral static parts. Zero existing violations (C4 cleanup `6b559da4`).
- **GC3** — Flag `#[0-9a-fA-F]{3,6}` literals in mobile component JSX/TSX. ✅ Shipped as the mobile hex-color rule (Property > Literal selector; `error` severity; preventive).
- **GC4** — Flag `router.push(` calls with two `[param]` segments and no intermediate push. ✅ Shipped as `local/router-push-ancestor-chain` at `error`. Three escape paths: prior parent push in same function, file already inside parent stack, or `// gc4-allow: <reason>` annotation. Zero existing violations.
- **GC5** — Enforce the `// @inngest-admin: <reason>` tag on every Inngest function that bypasses `createScopedRepository`. ✅ Shipped as `gov/inngest-admin-tag` at `warn`. Surfaces a 17-file backlog; severity stays at `warn` until each file gets an accurate reason (`cross-profile` vs `parent-chain`) or refactors to use the scoped repo.
- **GC6** — Boy-scout internal-mock sweep on test-file edits. ✅ Shipped as the strengthened `~/.claude/hooks/post-edit-jest-mock-check.sh` PostToolUse hook plus a CLAUDE.md rule under Code Quality Guards. The hook surfaces `jest.mock('./...')` and `jest.mock('@eduagent/...')` lines after any test-file Edit/Write/MultiEdit, directing the agent at `/my:mockfix`.

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

1. ~~**Today** — C1, C2, C3, C4 (security / runtime correctness) on `language-add`~~ — C3, C4 ✅. C1 (internal mocks) gated by `gov/no-internal-jest-mock` warn but ~676 legacy violations remain. C2 (Maestro `optional: true`) deferred (see point 5).
2. ~~**This week** — G1–G6 lint rules, each as its own PR off the `../eduagent-build-governance` worktree~~ — All shipped (G1–G7 + GC1, plus mobile hex/secure-store/mutation-error rules).
3. **Next** — H3 codemod ✅ (#147). H4 ✅ (#149). H6a ✅ (#146). Still pending: replace 5 inline 15s timeout reimplementations with existing `<TimeoutLoader>`; clear the 3 remaining production `eslint-disable` callsites (per-effect work, see status section above) so G6 can flip `noInlineConfig: true`.
4. **Following sprint** — Build and migrate to `<ScreenHeader>` (H1) and `<QueryStateView>` (H2); H5 (`runLlmTask<T>`) and H7 (typed `navigate`); Claude hook HK1–HK4 to catch new violations before staging (existing 600+ internal-mock violations are a separate epic).
5. **Defer** — Maestro `optional: true` cleanup (C2 broader sweep): the `sign-up-flow.yaml` ones reflect a real Clerk testing limitation; move that flow to `tags: [manual]` and document, don't chase the others until a Clerk test fixture story exists.

## Related artifacts

- Worktree at `../eduagent-build-governance` on `origin/main` for governance PR work
- `~/.claude/skills/challenge/SKILL.md` — adversarial-review-then-amend skill
- `~/.claude/skills/coordinator-dispatch/SKILL.md` — coordinator-first parallel dispatch skill
- `~/.claude/hooks/post-edit-lint.sh` + settings.json `PostToolUse` hook — runs ESLint after Edit/Write on TS/TSX
