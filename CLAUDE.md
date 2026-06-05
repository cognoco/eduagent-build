# CLAUDE

## Snapshot

- Mobile: ~88 screens, 372 test suites, ~4295 tests
- API: 45 route groups, 329 test suites, ~6307 tests, 58 Inngest functions
- Cross-package integration tests: 51 suites in `tests/integration/`, ~290 cases
- Monorepo: `apps/api`, `apps/mobile`, shared packages in `packages/`
- Core docs: `docs/project_context.md`, `docs/architecture.md`, relevant spec/plan under `docs/plans/` or `docs/specs/`

> Counts verified 2026-06-01. Test-case totals are a heuristic grep of `it(` / `test(` line starts; jest-reported totals may be slightly higher due to `it.each(...)` expansion at runtime. Re-verify with `git ls-files | grep '\.test\.'` for suite counts.

## Read This Before Editing

1. Start with the relevant plan/spec if one exists for the task.
2. Use `docs/project_context.md` for repo-specific implementation rules.
3. Use `docs/architecture.md` when the change touches routing, data access, background jobs, or deployment.

## Output Conventions

How to talk to the users: they run 7–8 parallel sessions and cannot hold opaque IDs in their head, and they lose time digging the signal out of long replies. These two rules fix that. (Trialed here project-local; promote to global config if it works.)

### Naming opaque references

On the **first mention per message** of any identifier whose meaning isn't reconstructable from context — migration numbers, stage/phase codes (`T1`, `E3`), ADR/WI/ticket IDs, feature flags, history-laden table/column names — never write the bare token. Expand it telegraphically, caveman style (dense fragments, dashes, no filler verbs):

> **`ID` — what it is; where it sits in any sequence; what it does / why it matters; current state**

Example — not "deferred to T1 revert" but "deferred to **`T1` — stage 1 of the old 6-stage identity migration; shipped empty org/membership tables, wired no readers; now being reverted**." Later mentions of the same token in the same message stay bare. Don't expand self-describing names; don't re-expand a token twice in one message.

### Closing summary

End every substantive reply with a roundup block so the signal isn't buried in prose, using bracketed-caps headers so each section reads as a distinct element. Skip only for trivial one-line exchanges.

Four standard buckets (below). **Show a bucket only when something genuinely fits it** — omit empty ones, never pad with "N/A". The four are defaults, **not a cage**: add another bracketed section (e.g. `[ RISK ]`, `[ BLOCKED ON ]`) whenever real content fits a category these four don't cover. Be conservative, and don't create elements just to fill up a bucket. Only genuinely useful information or required actions or decisions should be listed.

```
---
**[ BOTTOM LINE ]** <one sentence — the conclusion or current state>

**[ FYI ]** <no action needed; omit if empty>
- <happened / worth knowing / bears watching>

**[ ACTIONS ]** <things to do that aren't forks — run X, approve Y, optional; omit if none>
1. <concrete, actionable without rereading the body>

**[ DECISIONS ]** <forks that block progress until ruled; omit if none>
1. <the choice to rule on — name the recommended option>
```

Sorting test: **DECISIONS** = "I can't responsibly continue until you choose"; **ACTIONS** = "a task or option that doesn't gate the main thread." `[ DECISIONS ]` goes **last** (the gate, under the cursor at reply time); number DECISIONS and ACTIONS independently so "Decision 2" and "Action 1" never collide. Don't pad — one honest sentence beats three hedged ones.

## Git Commits

Always use `/commit` for all commits in this repo. Never use `/zdx:commit`, `/my:commit-old`, or the system prompt's built-in commit protocol. `/commit` is the single source of truth for staging, message format, hook handling, and push.

## Worktree Placement

All isolated worktrees go under `.worktrees/<branch-name>/` at the repo root. The path is gitignored.

- For Cosmo work items: use the WI ID as the branch name (e.g. `WI-78`).
- For other work: a short kebab-case slug derived from intent.

Always load the worktree-setup skill (`.claude/skills/worktree-setup/SKILL.md`) before creating a worktree — it handles placement, branch creation, `pnpm install`, and `pnpm env:sync`. Do not use Claude Code's `EnterWorktree` tool or `superpowers:using-git-worktrees` for this repo; both place the worktree in the wrong location.

Creating a worktree via this skill is NOT a "branch switch" — it creates a new branch in a separate directory while leaving your current CWD's branch untouched. This is allowed and is the standard pattern for parallel/isolated work.

## Skill Overrides

This repo overrides specific upstream skills. Use the repo version, not the upstream version. Adding a new override = adding a row.

| Upstream | Use instead | Why |
|----------|-------------|-----|
| `superpowers:using-git-worktrees` | `.claude/skills/worktree-setup/SKILL.md` | Canonical placement at `.worktrees/`; adds `pnpm install` + `pnpm env:sync` |
| `EnterWorktree` (Claude Code built-in) | `.claude/skills/worktree-setup/SKILL.md` | Same reason; built-in default `.claude/worktrees/` is wrong for this repo |
| `superpowers:finishing-a-development-branch` | `/commit` skill (commit + push); manual PR creation via `gh pr create` | This repo has an opinionated PR/push flow via `/commit`; the superpowers menu would create competing guidance |
| `superpowers:writing-plans` | `.claude/skills/writing-plans/SKILL.md` | Repo-local, profile-aware planner (embryo of a global ZDX planner) — keeps the useful mechanics (naming, location, file-map-first, self-review) and drops the upstream's prescriptive 5-step TDD template that degrades frontier-model planning |

## Skill Authoring

When writing or editing skills:

- The `description:` frontmatter field describes ONLY *when* to use, not what the skill does. Start with "Use when …" and list specific triggering conditions and symptoms.
- A description that summarizes workflow creates a shortcut agents take instead of reading the skill body. Trigger-only descriptions force agents to load the full skill before acting.

## Cross-runtime File Sync

`.claude/skills/<name>/` is generated from `.agents/skills/<name>/` by `scripts/sync-skills.mjs`. Edit the master in `.agents/skills/`, then run `pnpm sync-skills` (or rely on the pre-commit hook). Direct edits to `.claude/skills/` will be overwritten on next sync.

Skills under a **group directory** (currently `tech/`) are an exception to the 1:1 mirror: each child `.agents/skills/tech/<skill>/` is flattened to `.claude/skills/tech-<skill>/`. Codex reads the nested master directly; Claude Code reads the flattened copy because it does not reliably discover skills nested two levels deep under `.claude/skills/`. Add a new tech skill by creating `.agents/skills/tech/<skill>/SKILL.md` and running `pnpm sync-skills`. Group dirs are configured in `GROUP_DIRS` in `scripts/sync-skills.mjs`.

`CLAUDE.md` and `AGENTS.md` are currently maintained by hand and may diverge. A future work item will unify them — see `.claude/memory/project_agent_doc_and_memory_architecture_revisit.md` for the pending design discussion. For now, mirror any change that should reach both runtimes to both files manually.

## Profile Shapes (Two Tab Shapes + isOwner Gating)

**For full audience matrix** (which screens/APIs/Inngest jobs serve which user mode, with file:line citations and known gating gaps F1-F14), see `docs/audience-matrix.md`. For the *target* state — one `resolveNavigationContract()` function owning all UI gating — see `docs/specs/2026-05-21-navigation-contract.md`. The short version is below.

> **Hard constraint for the V0 → V1 migration.** Today's 5-tab production mode (active when `MODE_NAV_V0_ENABLED=false` in Doppler) is supported product behavior and **must not regress** across any nav-contract PR. The V0 helpers (`resolveTabShape`, `computeVisibleTabs`, `computeModeVisibleTabs`, `resolveHomeTabPresentation` in `apps/mobile/src/app/(app)/_layout.tsx:122-185`) and the V0-off short-circuits in `app-context.tsx:53-61, 70` stay alive when V1 ships. `resolveNavigationContract` wiring is gated behind a separate `MODE_NAV_V1_ENABLED` flag and never replaces the V0-off fallback. See the "Hard Constraint" section of the navigation-contract spec for the full flag matrix and test requirement.

**Tab shape** controls which tabs appear. Two shapes (guardian / learner), but the guardian shape changes between V0 and V1:

| Tab shape | Who | Tabs (V0 — `MODE_NAV_V1_ENABLED=false`) | Tabs (V1 — `MODE_NAV_V1_ENABLED=true`) | Home |
|---|---|---|---|---|
| **guardian** | Owner with linked children, mode=family | 5: home, own-learning, library, progress, more | 4: home, recaps, progress, more | `ParentHomeScreen` (mentoring hub) |
| **learner** | Everyone else (solo owner OR child on parent's account) | 4: home, library, progress, more | 4: home, library, progress, more | `LearnerScreen` |

The V1 guardian redesign replaces `own-learning` + `library` with a single `recaps` tab — this is the source of truth. The sets live in `apps/mobile/src/lib/navigation-contract.ts`: `STUDY_TABS` (learner), `FAMILY_TABS` (V1 guardian), `LEGACY_GUARDIAN_TABS` (V0 guardian). The V0 5-tab shape is still the production default and must not regress — see the hard-constraint note above.

Note: `home.tsx` always mounts `<LearnerScreen>`. The decision to render `ParentHomeScreen` vs the learner home happens **inside** `LearnerScreen.tsx` (around the `showParentHome && !isParentProxy && (mode === 'family' || hasLinkedChildren || isFamilyPlanOwner)` branch). `home.tsx` is not a branching point.

**`isOwner` gating** controls what appears INSIDE tabs (especially More and Progress). Billing/Security live inside `more/account.tsx`; Export/Delete live inside `more/privacy.tsx` — they are not top-level More rows:

| Feature | Owner (guardian or solo) | Non-owner (child on parent's account) |
|---|---|---|
| Billing / subscription (in `more/account.tsx`) | visible | hidden |
| Account security (in `more/account.tsx`) | visible | hidden |
| Export / delete account (in `more/privacy.tsx`) | visible | hidden |
| Add child | visible if 18+ | hidden |
| Progress toggle (view children) | visible if has children | hidden |

Key rules:
- Use `resolveTabShape()` for tab visibility. Use `isOwner` / `role` for content gating inside screens.
- `isGuardianProfile()` requires `isOwner` AND at least one non-owner in profiles[].
- `computeAgeBracket()` (from `@eduagent/schemas`) is the canonical age-bracket function — use it for theming and age-appropriate copy, never for feature gating. The removed `personaFromBirthYear()` (and related fossils `isLearner`, local `Persona` type) must not be re-introduced — enforced by `persona-fossil-guard.test.ts`.
- A solo owner and a child on a parent's account see the **same tabs** — they differ only in what's inside More/Progress.

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

### Known gap (tracked separately)

The orphan-key checker only sees strings that pass through `t()`. Hardcoded
English literals in JSX (e.g. `<Text>Add child</Text>`, `label="Continue"`)
bypass i18n entirely and render English to every locale. There is no automated
guard against this today. Phase 3 (TBD) introduces a baseline-allowlist
ratchet on `JsxText` and JSX-children `StringLiteral` nodes in
`apps/mobile/src/**`, mirroring the `scripts/no-clinical-copy-baseline.json`
pattern. Until Phase 3 lands: when adding user-visible copy, route it through
`t('…')` and add the key to `en.json` in the same PR.

### Variable-interpolation fallbacks

Keys with `{{var}}` interpolation should ship a no-variable companion key when
the variable is genuinely optional, so the rendered string is never
"Starting with …" (translators guess at the ellipsis and produce odd output).
Example: instead of `t('rowSubject', { subject: subject || '…' })`, prefer
`subject ? t('rowSubject', { subject }) : t('rowSubjectNoSubject')`.

## Non-Negotiable Engineering Rules

- `@eduagent/schemas` is the shared contract. Do not redefine API-facing types locally.
- Business logic belongs in `services/`, not in route handlers. Route/service boundaries are lint-enforced (eslint G1 and G5 in `eslint.config.mjs`).
- Reads must use `createScopedRepository(profileId)` when the query operates on a single scoped table. For queries that join through a parent chain (e.g. `learning_sessions → curriculum_topics → curriculum_books → subjects`), use direct `db.select()` and enforce `profileId` via `subjects.profileId` (or the closest ancestor that owns it) in the WHERE clause. The scoped repo cannot express multi-table joins; the parent-chain pattern is the sanctioned alternative. Existing examples: `services/session/session-topic.ts`, `session-book.ts`, `session-subject.ts`.
- Writes must include explicit `profileId` protection or verify ownership through the parent chain before updating child records.
- Shared mobile components stay persona-unaware. Use semantic tokens and CSS variables, not persona checks or hardcoded hex colors. Exception: brand-fixed hex values are acceptable inside SVG-internal animation and celebration components (`*Animation.tsx`, `*Celebration.tsx`, `AnimatedSplash.tsx`, `MentomateLogo.tsx`) when the file annotates the brand intent.
- Durable async work goes through Inngest. Do not fire-and-forget background work from route handlers.
- Non-core Inngest dispatches (telemetry, post-success notifications, observability events) go through `safeSend()` in `apps/api/src/services/safe-non-core.ts` so a dispatch failure is captured in Sentry but never throws and never breaks the user action. Bare `inngest.send(...)` is reserved for CORE flows where dispatch failure must short-circuit the user action — those sites carry a `// core-send: <reason>` comment on the line(s) immediately above the call. Forward-only ratchet test: `apps/api/src/services/safe-non-core.guard.test.ts`.
- LLM responses that drive state-machine decisions (close interview, hold escalation, trigger UI widget) must use the structured response envelope (`llmResponseEnvelopeSchema` from `@eduagent/schemas`). Parse with `parseEnvelope()` from `services/llm/envelope.ts`. Never embed `[MARKER]` tokens or JSON blobs in free-text replies. Every envelope signal must have a server-side hard cap (e.g., `MAX_INTERVIEW_EXCHANGES = 4`) so the flow terminates even if the LLM never emits the signal. See `docs/architecture.md` → "LLM Response Envelope" for the full contract.
- When changing LLM prompts (`apps/api/src/services/**/*-prompts.ts` or `apps/api/src/services/llm/*.ts`), run the eval harness (`pnpm eval:llm`) to snapshot before/after, and `pnpm eval:llm --live` (Tier 2) to validate real LLM responses against `expectedResponseSchema`. The pre-commit hook only checks that snapshot files are staged — it does NOT run the harness. Harness code: `apps/api/eval-llm/`.
- Subagents may run `/commit` only from within an isolated worktree they own (see Worktree Placement above). When operating in the coordinator's working tree (no worktree isolation), subagents must NOT run `git add`/`git commit`/`git push` — the coordinator handles all git operations there.
- Challenge Round mastery policy is server-owned and conservative over structured LLM evidence. The LLM proposes per-concept evaluations via `signals.challenge_round_evaluation`; each item must include `answerEventId` and `learnerQuote`. The server runs `decideMasteryAndReview()` and sets `assessments.mastery_challenge_verified_at` only when EVERY concept evaluates `solid`. Any `partial`, `missing`, or `misconception` blocks mastery and routes the weak concepts to `needs_deepening_topics` with `source = 'challenge_round'`. Notes drafted from Challenge Rounds must use only `solidAnswerQuotes` and pass the lexical-overlap hallucination guard in `services/challenge-round/note-draft.ts` before being shown to the learner. Challenge Round LLM calls must still route through `resolveExchangeLlmRouting()`; accepted/active/drafting turns may apply a routing-only rung-4 floor (mechanism planned — `ExchangeContext.llmRoutingRung` field not yet in source), Family standard remains Gemini-only, and the OpenAI advanced candidate stays rung 5+ only. The persistent Challenge mode toggle (`learningMode: 'serious' | 'casual'`) was removed in Phase 0 (PR #325); today's `casual` is the single default tone and rigor is now expressed per-Challenge-Round rather than globally.

## Known Exceptions to Engineering Rules

These deviations from the rules above exist in the codebase as of 2026-05-01. They are listed here so reviewers don't try to "fix" them in unrelated PRs and so new contributors don't take them as precedent. Each exception should either be tracked toward a refactor, or promoted into an explicit rule.

- **`apps/mobile/tsconfig.json` declares `references[]: [{ "path": "../api" }]`**, in tension with the conceptual "mobile must not depend on api" rule. This is required so `import type { AppType } from '@eduagent/api'` resolves for the Hono RPC client. **Type-only imports** from `@eduagent/api` are accepted; runtime imports remain forbidden (they would pull API server code into the mobile bundle). See `docs/architecture.md` → "AppType" example for the rationale.

## Schema And Deploy Safety

- Dev schema iteration can use `drizzle-kit push`.
- Staging and production must use committed migration SQL plus `drizzle-kit migrate`.
- Never run `drizzle-kit push` against staging or production.
- A worker deploy does not migrate Neon. Apply the target migration before shipping code that reads new columns.
- Keep staging and production database credentials separate in CI. Never let staging deploys point at production data.
- Any migration that drops columns, tables, or types must include a `## Rollback` section in the plan specifying: (a) whether rollback is possible, (b) what data is lost, (c) what the recovery procedure is. If rollback is impossible, say so explicitly — "rollback is not possible, data is permanently destroyed."

## Required Validation

Pre-commit and pre-push hooks enforce lint, typecheck, and surgical tests automatically. See `docs/change-classes.md` for what each hook covers. Focus on what hooks do NOT cover:

- Run integration tests before any commit that touches `apps/api/` or `tests/integration/`: `pnpm exec nx test:integration api`. The pre-commit and pre-push hooks both intentionally skip `.integration.test.` files, so unit tests don't catch DB/auth-scoping/Inngest-flow regressions.
- Do not call work complete if related tests, lint, typecheck, or required migrations are still failing.
- No suppression, no shortcuts — always address the root of the error. Never use `eslint-disable` or suppress warnings to make lint pass. Fix the actual code or improve the lint rule to handle the pattern correctly.


## Repo-Specific Guardrails

- Default exports are only for Expo Router page components.
- Tests are co-located with source files. Do not create `__tests__/` folders.
- Package imports go through the package barrel — enforced by `@nx/enforce-module-boundaries`.
- SecureStore keys must use Expo-safe characters only: letters, numbers, `.`, `-`, `_`.
- In API code, use the typed config object instead of raw `process.env` reads (eslint G4 enforces this; the violation message points back here).
- Cross-tab / cross-stack `router.push` calls must push the full ancestor chain, not just the leaf. A direct push to `shelf/[subjectId]/book/[bookId]` from another tab synthesizes a 1-deep stack containing only the leaf, so `router.back()` falls through to the Tabs first-route (Home). Either push the parent first then the child, or rely on `unstable_settings.initialRouteName` in the nested layout — but the rule of thumb is to push the chain. `unstable_settings` only seeds one level, so it does not protect future deeper paths (e.g. `shelf/[subjectId]/book/[bookId]/chapter/[chapterId]`).
- Any new nested Expo Router layout that contains both an `index` screen and a deeper dynamic child must export `unstable_settings = { initialRouteName: 'index' }` as a safety net for cross-stack deep pushes.

## UX Resilience Rules

These rules prevent dead-end states where users get stuck with no actionable escape. Learned from a full-app UX audit (2026-04-05) that found 44 dead-end issues across all flows.

- **Classify errors at the API client boundary, not per-screen.** Distinguish quota exhausted, forbidden, gone, network error, etc. in middleware. Screens must never parse HTTP status codes.
- **Typed error hierarchy.** Define a shared error class hierarchy in the schema package (e.g., `QuotaExhaustedError`, `ResourceGoneError`, `ForbiddenError`). The API client middleware classifies HTTP responses into typed errors ONCE. Screens switch on error type.
- **Standard error fallback pattern.** Primary action retries / fixes the specific problem; secondary action goes back / home / signs out. Build reusable `ErrorFallback` and `TimeoutLoader` components rather than ad-hoc per-screen handling.
- **Spec failure modes before coding.** Every feature spec / story must include a Failure Modes table with columns: State, Trigger, User sees, Recovery. If the Recovery column can't be filled, the design isn't complete.
- **End-to-end feature tracing.** For every event handler, cron function, or background job, verify something actually dispatches the event or schedules the cron in production code. Wired-but-untriggered code is worse than dead code — it creates false confidence.

## Fix Development Rules

Changed code is not fixed code. Every fix must be verified, not just applied. These rules apply to all bug fixes, security patches, and review-finding resolutions.

- **Security fixes require a "break test."** Every fix tagged CRITICAL or HIGH in a security or data-integrity context must include at least one negative-path test that attempts the exact attack being prevented (unauthorized access, missing auth, invalid input). Use the red-green regression pattern (see `superpowers:verification-before-completion` → "Regression tests"): write the test, watch it pass, revert the fix, watch it fail, restore.
- **Silent recovery without escalation is banned.** Any `catch` block or fallback path in billing, auth, or webhook code that silently recovers must also emit a structured metric or Inngest event. `console.warn` alone is never sufficient — if you can't query how many times the fallback fired in the last 24 hours, the "recovery" is invisible.

- **Sweep when you fix.** When you fix a drift that has 3+ sibling locations, you have two acceptable options: (a) install a forward-only guard test that fails CI on new violations AND sweep all current sites in the same PR, or (b) document a deferred sweep with a tracked ID, owner, and target date. Never silently fix one of N — the next contributor reads the partial state as "the team's preferred way" and the inconsistency perpetuates. 

- Commit-specific rules (finding-ID references, Verified-By tables, sweep-audit blocks) live in `/commit`.

## Code Quality Guards

These rules catch bugs that survive type-checking and only surface at runtime. Learned from adversarial review (2026-04-05).

- **No internal mocks in integration tests.** Never `jest.mock` your own database, services, or middleware in integration tests. Mock only true external boundaries (Stripe, Clerk JWKS, email providers, push notification services). Internal mocks hide real bugs.
- **No new internal `jest.mock()` (GC1 ratchet).** CI fails any PR that adds a relative-path `jest.mock('./...')` or `jest.mock('../...')` line in `*.test.ts` / `*.test.tsx`. Existing legacy sites are NOT blocked by the ratchet but are NOT considered acceptable state — they are backlog for the GC6 burn-down. To stub a few named exports of an internal module, use `jest.requireActual()` with targeted overrides (canonical pattern: `apps/api/src/inngest/functions/archive-cleanup.test.ts`). External-boundary mocks (LLM via `routeAndCall`, push, email, Stripe, Clerk JWKS) use bare specifiers and are unaffected. The `// gc1-allow: <reason>` escape is reserved for cases where the code under test genuinely cannot be exercised (no real implementation available in the test environment); it is not an "I don't feel like wiring the real thing today" escape.
- **Response bodies are single-use.** Never call both `.json()` and `.text()` on the same `fetch` Response — the body stream is consumed on first read. If you need both JSON parsing with a text fallback, read `.text()` once and `JSON.parse` it manually. Applies to `assertOk`-style helpers, error-extraction middleware, and SSE error handlers.
- **Classify errors before formatting.** When code branches on error *type* (reconnectable vs. fatal, quota vs. network) and also formats errors for display, classify the **raw** error object first, then format for the user. Never string-match on the output of `formatApiError` — the formatter strips status codes, error codes, and keywords classifiers depend on.
- **Clean up all artifacts when removing a feature.** Grep the entire project for all references: types, imports, constants, SecureStore keys, commented-out JSX, fallback branches. Orphaned types create false confidence, unreachable fallback branches inflate coverage, leaked storage keys waste device storage forever.
- **GC6 — Boy-scout internal mocks when editing test files.** Any time you edit a test file (`*.test.ts` / `*.test.tsx` / `*.integration.test.ts`) for any reason, scan it for `jest.mock('./...')`, `jest.mock('../...')`, or `jest.mock('@eduagent/...')` and remove the internal mocks before the edit is complete. Use the real implementation, or convert to `jest.requireActual()` with targeted overrides (canonical pattern: `apps/api/src/inngest/functions/archive-cleanup.test.ts`). Run `/my:sweep-mocks` for the full workflow. The PostToolUse hook at `~/.claude/hooks/post-edit-jest-mock-check.sh` surfaces offending lines after every test-file edit; treat that output as a blocker on task completion, not a follow-up. External-boundary mocks (LLM via `routeAndCall`, Stripe, Clerk JWKS, push, email, Inngest framework) use bare specifiers and are not violations. The `// gc1-allow: <reason>` escape applies only when the real code cannot run in the test environment — not as a convenience. **Policy:** internal mocks are not acceptable state, they are backlog. The codebase's direction is "if there is code to test, use the code; mock only what the test environment cannot exercise." **Why:** GC1 gates new violations; GC6 forces every test-file visit to reduce the legacy backlog. The deferral escape (leave the mocks, record file paths + count in the commit message) exists only when burn-down would balloon a focused task — it does not authorize preserving the mocks indefinitely.

## Planning Discipline

When writing implementation plans (via Claude Code plan mode, written specs, or otherwise):

- No placeholders ("TBD", "implement later", "add validation"). If a step says what to do, include how.
- Show actual code/commands for steps that need them. A step that changes code must show the code.
- Check type and name consistency across tasks. A function called `clearLayers` in Task 3 must still be `clearLayers` in Task 7.
- Use TDD step decomposition for greenfield logic; use design-doc + acceptance criteria for migrations, audits, refactors.

## Decisions (ADRs)

Contested, hard-to-reverse architecture/product decisions are recorded as **Architecture Decision Records** (`MMT-ADR-NNNN`) in `docs/adr/` — **not** buried inline in a spec/plan or left only in `.claude/memory/`. The layer model, the **significance gate** (when a decision needs an ADR), the lockstep lifecycle, and the conventions are defined in [`docs/adr/MMT-ADR-0000`](docs/adr/MMT-ADR-0000-documentation-layer-model-and-decisions-layer.md); `docs/adr/README.md` is the operating guide. **Read 0000 to decide whether something is ADR-class — don't re-derive the gate here.**

- **Lockstep:** an ADR (the *why*) and the canon line it changes (`architecture.md` / `PRD.md` / `CONTEXT.md` — the *what*) move in **one** change-set. Never one without the other.
- **Enforced:** `scripts/check-decision-adr-link.ts` (the `docs-checks.yml` → `decision-adr-link` job) fails a new `docs/specs|plans` decision block with no linked `MMT-ADR`. Today's are grandfathered in `scripts/decision-adr-link-baseline.json`; genuine false positives use `--accept` with a commit-message justification.
- **`ARCH-N` is frozen** (legacy register in `docs/specs/epics.md`) — no new `ARCH-N`; new architecture decisions are `MMT-ADR`s.

## Secrets Management

All secrets are managed through **Doppler**. Never suggest `wrangler secret put`, direct Cloudflare dashboard entry, AWS console, or any other platform-specific secret management. When secrets need to be set, say "add to Doppler."

## PR Review & CI Protocol

**ALL agents MUST follow this protocol when working with PRs. This is non-negotiable.**

### Before Declaring a PR "Ready to Merge"

1. **Read the actual PR diff** — run `gh pr diff <number>` to see what files are actually changed relative to the base branch. Do NOT assume from commit messages alone.
2. **Check all CI checks** — run `gh pr checks <number>`. ALL checks must pass, including automated code reviews (Claude Code Review, etc.).
3. **Read automated code review findings** — if a code review check exists, fetch and triage findings:
   ```bash
   gh pr checks <number>
   gh api repos/{owner}/{repo}/pulls/<number>/reviews
   gh api repos/{owner}/{repo}/pulls/<number>/comments
   ```
   - **High (Must fix):** Security issues, data loss risks, correctness bugs — MUST be fixed before merge
   - **Medium:** Best practice violations, missing validation, config issues — SHOULD be fixed before merge
   - **Low:** Style, docs, minor improvements — can be deferred but note them
4. **NEVER dismiss review failures as "OK to merge."** Automated code review catches real bugs, security issues, and architectural violations. Treat findings with the same weight as a senior engineer's review.

### When Rebasing PRs

- After rebase, always verify the PR diff (`gh pr diff`) — merge strategies like `-X theirs` can silently drop code.
- Check for duplicate functions/tests, missing imports, and schema export gaps.
- Run type checking (`tsc --noEmit`) to catch errors before pushing.

## On Compaction

When the conversation is compacted, preserve at minimum:

- The full list of files modified in this session (paths only, no diffs).
- Names and reproductions of any failing tests, lint errors, or typecheck errors not yet resolved.
- The active plan or task list — current step, next step, and anything blocked.
- The current branch name and which base branch it tracks.
- Any decisions made in conversation that aren't reflected in the diff yet (e.g., "we agreed to defer X").

It is fine to discard: tool-call output bodies, exploratory file reads that didn't change anything, and resolved error messages.

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
pnpm run db:push:dev
pnpm run db:generate:dev
pnpm run db:migrate:dev
pnpm run db:studio:dev

# LLM Eval Harness
pnpm eval:llm                    # Tier 1: snapshot prompts (no LLM call)
pnpm eval:llm --live             # Tier 2: real LLM call + schema validation

# Playwright E2E (web)
# IMPORTANT: Must use Doppler with -c stg to match .dev.vars (which is generated from stg config).
# Using default Doppler config (dev) causes TEST_SEED_SECRET mismatch → 403 on seed endpoint.
C:/Tools/doppler/doppler.exe run -c stg -- pnpm run test:e2e:web:smoke   # smoke only (~1-2 min)
C:/Tools/doppler/doppler.exe run -c stg -- pnpm run test:e2e:web         # full suite
# CLERK_TESTING_TOKEN is currently a placeholder — tests work without it but Clerk may rate-limit.

# Change Class Checker — "you touched X, run Y"
bash scripts/check-change-class.sh              # advisory: what to validate
bash scripts/check-change-class.sh --run        # execute all validation
bash scripts/check-change-class.sh --run --fast  # fast commands only
bash scripts/check-change-class.sh --branch     # check full branch diff vs main
# See docs/change-classes.md for the full reference table.
```

Last updated: 2026-05-24
