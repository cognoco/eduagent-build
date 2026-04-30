# CLAUDE

## Snapshot

- Mobile: 38+ screens (117 test suites), 1,228 mobile tests
- API: All 33 route groups, 2,136 API tests, 19 integration test suites, 16 Inngest functions
- Monorepo: `apps/api`, `apps/mobile`, shared packages in `packages/`
- Core docs: `docs/project_context.md`, `docs/architecture.md`, relevant spec/plan under `docs/plans/` or `docs/specs/`

## Read This Before Editing

1. Start with the relevant plan/spec if one exists for the task.
2. Use `docs/project_context.md` for repo-specific implementation rules.
3. Use `docs/architecture.md` when the change touches routing, data access, background jobs, or deployment.

## Non-Negotiable Engineering Rules

- `@eduagent/schemas` is the shared contract. Do not redefine API-facing types locally.
- Hono route files keep handlers inline for RPC inference, but business logic belongs in `services/`.
- Route files must not import ORM primitives, schema tables, or `createScopedRepository`.
- Reads must use `createScopedRepository(profileId)`.
- Writes must include explicit `profileId` protection or verify ownership through the parent chain before updating child records.
- Shared mobile components stay persona-unaware. Use semantic tokens and CSS variables, not persona checks or hardcoded hex colors.
- Durable async work goes through Inngest. Do not fire-and-forget background work from route handlers.
- LLM calls go through `services/llm/router.ts` (or its barrel), not direct provider SDK calls.
- LLM responses that drive state-machine decisions (close interview, hold escalation, trigger UI widget) must use the structured response envelope (`llmResponseEnvelopeSchema` from `@eduagent/schemas`). Parse with `parseEnvelope()` from `services/llm/envelope.ts`. Never embed `[MARKER]` tokens or JSON blobs in free-text replies. Every envelope signal must have a server-side hard cap (e.g., `MAX_INTERVIEW_EXCHANGES = 6`) so the flow terminates even if the LLM never emits the signal. See `docs/architecture.md` → "LLM Response Envelope" for the full contract.
- When changing LLM prompts, run the eval harness (`pnpm eval:llm`) to snapshot before/after across the 5 fixture profiles. Use `pnpm eval:llm --live` (Tier 2) to validate real LLM responses against `expectedResponseSchema` when set. Harness code: `apps/api/eval-llm/`.
- Subagents (agents spawned via the Agent tool) must NEVER run `git add`, `git commit`, or `git push`. Only the coordinator (main conversation) commits. Subagents write code, run tests, and report which files they changed — the coordinator commits their work sequentially using `/commit`.

## Schema And Deploy Safety

- Dev schema iteration can use `drizzle-kit push`.
- Staging and production must use committed migration SQL plus `drizzle-kit migrate`.
- Never run `drizzle-kit push` against staging or production.
- A worker deploy does not migrate Neon. Apply the target migration before shipping code that reads new columns.
- Keep staging and production database credentials separate in CI. Never let staging deploys point at production data.

## Required Validation

Run the smallest useful verification first, then the project-level checks for the touched area.

- Targeted tests: `pnpm exec jest --findRelatedTests <changed-files> --no-coverage`
- API lint/typecheck: `pnpm exec nx run api:lint` and `pnpm exec nx run api:typecheck`
- Mobile lint/typecheck: `pnpm exec nx lint mobile` and `cd apps/mobile && pnpm exec tsc --noEmit`
- Run integration tests when changing DB behavior, auth/profile scoping, Inngest flows, or cross-package contracts.

Do not call work complete if related tests, lint, typecheck, or required migrations are still failing.
- No suppression, no shortcuts — always address the root of the error. Never use `eslint-disable` or suppress warnings to make lint pass. Fix the actual code or improve the lint rule to handle the pattern correctly.

## Repo-Specific Guardrails

- Default exports are only for Expo Router page components.
- Tests are co-located with source files. Do not create `__tests__/` folders.
- Package imports go through the package barrel (`@eduagent/schemas`, `@eduagent/database`, etc.).
- SecureStore keys must use Expo-safe characters only: letters, numbers, `.`, `-`, `_`.
- In API code, use the typed config object instead of raw `process.env` reads.
- lint-staged uses `node --stack-size=65536` to work around Windows stack overflow in eslint AST traversal (see `project_nx_expo_plugin_bug.md`).
- Cross-tab / cross-stack `router.push` calls must push the full ancestor chain, not just the leaf. A direct push to `shelf/[subjectId]/book/[bookId]` from another tab synthesizes a 1-deep stack containing only the leaf, so `router.back()` falls through to the Tabs first-route (Home). Either push the parent first then the child, or rely on `unstable_settings.initialRouteName` in the nested layout — but the rule of thumb is to push the chain. `unstable_settings` only seeds one level, so it does not protect future deeper paths (e.g. `shelf/[subjectId]/book/[bookId]/chapter/[chapterId]`).
- Any new nested Expo Router layout that contains both an `index` screen and a deeper dynamic child must export `unstable_settings = { initialRouteName: 'index' }` as a safety net for cross-stack deep pushes.

## Inherited Rules (To Be Reorganized in Step 2)

Content moved here from `~/.claude/CLAUDE.md` during the Step 1 cleanup of the global file (2026-04-30). These rules will be sorted into project-specific blocks, stack-specific skills/playbooks, or kept here permanently during the Step 2 audit. Treat as authoritative for now.

### UX Resilience Rules

These rules prevent dead-end states where users get stuck with no actionable escape. Learned from a full-app UX audit (2026-04-05) that found 44 dead-end issues across all flows.

#### Every Screen State Must Have an Action

Before implementing any screen, enumerate ALL possible states — not just the happy path. Every state MUST have at least one interactive element the user can tap.

Required states to consider for every screen:
- **Loading** — show spinner + cancel/timeout after 15-30s
- **Error** — show specific error + retry + "Go Back" or "Go Home"
- **Empty** — show guidance (not just "Nothing here")
- **Offline** — show proactive warning before user tries an action
- **Expired/Gone** — show explanation + recovery path

If any state has zero user actions — that's a design bug, not a code bug.

#### Error Handling Rules

1. **Every `mutateAsync` catch block must show user-visible feedback** — toast, alert, or inline error. Bare `catch {}` is forbidden.
2. **Classify errors at the API client boundary, not per-screen** — distinguish quota exhausted, forbidden, gone, network error, etc. in middleware. Screens should never parse HTTP status codes.
3. **Never replace specific server errors with generic "check your connection"** — if the server says "subject is paused", show that, not "connection error".
4. **Navigation after mutations must be guarded** — `router.back()` only after the API call succeeds, not in a finally block.

#### Spec Failure Modes Before Coding

Every feature spec / story must include a Failure Modes table:

```markdown
| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Stream drops | Network loss | "Connection lost" | Tap to retry, Go Home |
| Session expired | 30min+ idle | "Session ended" | Start new session |
```

If you can't fill in the "Recovery" column, the design isn't complete.

#### Typed Error Hierarchy

Define a shared error class hierarchy in the schema package (e.g., `QuotaExhaustedError`, `ResourceGoneError`, `ForbiddenError`). The API client middleware should classify HTTP responses into typed errors ONCE. Screens switch on error type — they never parse HTTP status codes directly.

#### End-to-End Feature Tracing

For every event handler, cron function, or background job — verify that something actually dispatches the event or schedules the cron in production code. Wired-but-untriggered code is worse than dead code because it creates false confidence.

#### No Internal Mocks in Integration Tests

Never `jest.mock` your own database, services, or middleware in integration tests. Mock only true external boundaries (Stripe, Clerk JWKS, email providers, push notification services). Internal mocks in integration tests hide real bugs.

#### Standard Error Fallback Pattern

All error states should follow this pattern:
- **Primary action:** Retry / Fix the specific problem
- **Secondary action:** Go back / Go home / Sign out

Build reusable `ErrorFallback` and `TimeoutLoader` components rather than ad-hoc error handling per screen.

### Fix Verification Rules

Changed code is not fixed code. Every fix must be verified, not just applied. These rules apply to all bug fixes, security patches, and review-finding resolutions.

#### Security Fixes Require a "Break Test"

Every fix tagged CRITICAL or HIGH in a security or data-integrity context must include at least one negative-path test that attempts the exact attack being prevented — unauthorized access, missing auth, invalid input. The test proves the guard works, not just that the code compiles.

#### Silent Recovery Without Escalation is Banned

Any `catch` block or fallback path in billing, auth, or webhook code that silently recovers must also emit a structured metric or Inngest event. `console.warn` alone is never sufficient — if you can't query how many times the fallback fired in the last 24 hours, the "recovery" is invisible.

#### Destructive Migrations Need a Rollback Section

Any migration that drops columns, tables, or types must include a `## Rollback` section in the plan specifying: (a) whether rollback is possible, (b) what data is lost, (c) what the recovery procedure is. If rollback is impossible, say so explicitly — "rollback is not possible, data is permanently destroyed."

#### NO-OP Dismissals Need Line References

When a discovery or review finding is dismissed as NO-OP or "already handled," cite the specific file and line number that proves the fix already exists. Without a line reference, it's an assertion, not evidence.

#### Fix Tables Must Include a "Verified By" Column

Every fix row in a plan must have a verification column with one of:
- `test: file.test.ts:"test name"` — automated test proves the fix
- `manual: description` — what was manually checked
- `N/A: reason` — verification not applicable, with justification

An empty Verified By cell means the fix is PARTIAL, not DONE.

#### Fix Commits Must Reference the Finding ID

Commit messages for fixes must include the finding ID tag, e.g. `fix(api): atomic quota decrement [CR-1C.1]`. This makes `git log --grep="CR-1C"` instantly useful and links code changes to the discovery that motivated them.

### Code Quality Guards

These rules catch bugs that survive type-checking and only surface at runtime. Learned from adversarial review (2026-04-05).

#### Response Bodies Are Single-Use

Never call both `.json()` and `.text()` on the same `fetch` Response — the body stream is consumed on first read. If you need both JSON parsing with a text fallback, read `.text()` once and `JSON.parse` it manually. This applies to `assertOk`-style helpers, error-extraction middleware, and SSE error handlers.

#### Classify Errors Before Formatting

When code branches on error *type* (reconnectable vs. fatal, quota vs. network) and also formats errors for display, always classify the **raw** error object first, then format for the user. Never string-match on the output of `formatApiError` — the formatter strips status codes, error codes, and keywords that classifiers depend on.

#### Clean Up All Artifacts When Removing a Feature

After removing a feature or code path, grep the entire project for all references: types, imports, constants, SecureStore keys, commented-out JSX, and fallback branches. Orphaned types create false confidence, unreachable fallback branches inflate coverage, and leaked storage keys waste device storage forever.

#### Verify JSX Handler References Exist

Every `onPress`, `onSubmit`, or event handler referenced in JSX must be defined or imported in the component scope. A missing handler is a **runtime crash** (`ReferenceError`), not a lint warning. After adding any `Pressable`/`Button`, search the file for the handler name before committing.

### Secrets Management

All secrets are managed through **Doppler**. Never suggest `wrangler secret put`, direct Cloudflare dashboard entry, AWS console, or any other platform-specific secret management. When secrets need to be set, say "add to Doppler."

### PR Review & CI Protocol

**ALL agents MUST follow this protocol when working with PRs. This is non-negotiable.**

#### Before Declaring a PR "Ready to Merge"

1. **Read the actual PR diff** — run `gh pr diff <number>` to see what files are actually changed relative to the base branch. Do NOT assume from commit messages alone.

2. **Check all CI checks** — run `gh pr checks <number>`. ALL checks must pass, including automated code reviews (Claude Code Review, etc.).

3. **Read automated code review findings** — If a code review check exists (e.g., Claude Code Review), read all findings:
   ```bash
   gh pr checks <number>
   gh api repos/{owner}/{repo}/pulls/<number>/reviews
   gh api repos/{owner}/{repo}/pulls/<number>/comments
   ```
   Then fix ALL findings by priority:
   - **High (Must fix):** Security issues, data loss risks, correctness bugs — MUST be fixed before merge
   - **Medium:** Best practice violations, missing validation, config issues — SHOULD be fixed before merge
   - **Low:** Style, docs, minor improvements — can be deferred but note them

4. **NEVER dismiss review failures as "OK to merge."** Automated code review catches real bugs, security issues, and architectural violations. Treat its findings with the same weight as a senior engineer's review. Always read the report and fix the issues.

#### When Rebasing PRs

- After rebase, always verify the PR diff (`gh pr diff`) — merge strategies like `-X theirs` can silently drop code
- Check for duplicate functions/tests, missing imports, and schema export gaps
- Run type checking (`tsc --noEmit`) to catch errors before pushing

#### When Asked to "Fix CI" on a PR

1. First read `gh pr checks <number>` to identify ALL failing checks
2. For each failing check, investigate the actual failure (not just the check name)
3. Fix the root cause — don't skip or suppress checks
4. Re-run tests locally before pushing
5. After pushing, monitor CI until it passes or identify the next failure

## Handy Commands

```bash
# Workspace
pnpm exec nx run-many -t lint
pnpm exec nx run-many -t test
pnpm exec nx run-many -t typecheck

# API
pnpm exec nx run api:lint
pnpm exec nx run api:typecheck
pnpm exec nx run api:test

# Mobile
pnpm exec nx lint mobile
cd apps/mobile && pnpm exec jest --findRelatedTests src/path/to/file.tsx --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit

# Database
pnpm run db:push:stg
pnpm run db:generate
pnpm run db:migrate:dev

# LLM Eval Harness
pnpm eval:llm                    # Tier 1: snapshot prompts (no LLM call)
pnpm eval:llm --live             # Tier 2: real LLM call + schema validation

# Playwright E2E (web)
# IMPORTANT: Must use Doppler with -c stg to match .dev.vars (which is generated from stg config).
# Using default Doppler config (dev) causes TEST_SEED_SECRET mismatch → 403 on seed endpoint.
C:/Tools/doppler/doppler.exe run -c stg -- pnpm run test:e2e:web:smoke   # smoke only (~1-2 min)
C:/Tools/doppler/doppler.exe run -c stg -- pnpm run test:e2e:web         # full suite
# CLERK_TESTING_TOKEN is currently a placeholder — tests work without it but Clerk may rate-limit.
```

Last updated: 2026-04-30
