# MentoMate

## Snapshot

- Mobile: ~88 screens, 515 test suites, ~6,055 tests
- API: 53 route groups, 329 test suites, ~8,818 tests, 78 Inngest functions
- Cross-package integration tests: 71 suites in `tests/integration/`, ~290 cases
- Monorepo: `apps/api`, `apps/mobile`, shared packages in `packages/`
- Core docs: `docs/project_context.md`, `docs/architecture.md`, relevant spec/plan under `docs/plans/` or `docs/specs/`

> Counts verified 2026-07-29 — heuristic grep; jest-reported totals may run slightly higher via `it.each` expansion.

## How to Work

Universal operating rules, harness-agnostic. They bias toward caution over speed — for genuinely trivial tasks (typo, one-line doc fix), use judgment and skip the ceremony.

### Think before acting

**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### Simplicity first

**Minimum solution that addresses the problem. Nothing speculative.**

- No features beyond what was asked. No abstractions for single-use code. No "flexibility" or "configurability" that wasn't agreed.
- Test: would a senior practitioner call this overcomplicated? If yes, simplify.

### Surgical changes

**Touch only what you must. Clean up only your own mess.**

- Don't "improve" adjacent code, comments, or formatting. Don't refactor what isn't broken. Match existing style, even if you'd do it differently.
- Notice unrelated dead code or stale text? Mention it — don't delete it.
- Remove imports/variables/functions that *your* changes orphaned; leave pre-existing dead code.
- Test: every changed line traces directly to the request.

### Goal-driven execution

**Define success criteria. Loop until verified.**

- Turn tasks into verifiable goals: "fix the bug" → "write a test that reproduces it, make it pass"; "refactor X" → "tests green before and after".
- For multi-step work, state a brief plan with a check per step.
- Never assume your changes work — verify before claiming done.

### Output conventions

How to talk to the users: they run 7–8 parallel sessions and cannot hold opaque IDs in their head, and they lose time digging the signal out of long replies. These rules fix that.

#### Naming opaque references

On the **first mention per message** of any identifier whose meaning isn't reconstructable from context — migration numbers, stage/phase codes (`T1`, `E3`), ADR/WI/ticket IDs, feature flags, history-laden table/column names — never write the bare token. Expand it telegraphically, caveman style (dense fragments, dashes, no filler verbs):

> **`ID` — what it is; where it sits in any sequence; what it does / why it matters; current state**

Example — not "deferred to T1 revert" but "deferred to **`T1` — stage 1 of the old 6-stage identity migration; wired no readers; now being reverted**." Later mentions of the same token in the same message stay bare. Don't expand self-describing names; don't re-expand a token twice in one message.

#### Closing summary

End every substantive reply with a roundup block so the signal isn't buried in prose, using bracketed-caps headers so each section reads as a distinct element. Skip only for trivial one-line exchanges.

Four standard buckets (below). **Show a bucket only when something genuinely fits it** — omit empty ones, never pad with "N/A". The four are defaults, **not a cage**: add another bracketed section (e.g. `[ RISK ]`, `[ BLOCKED ON ]`) whenever real content fits a category these four don't cover. Be conservative, and don't create elements just to fill up a bucket. Only genuinely useful information or required actions or decisions should be listed. **Never repeat the same information in several buckets**; an output is either informational, requires action or requires decision

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

## Initialization

1. Read this file before editing.
2. Start with the relevant plan/spec if one exists for the task.
3. Use [`CONTEXT.md`](CONTEXT.md) for standard terminology.
4. Use `docs/project_context.md` for repo-specific implementation rules.
5. Use `docs/architecture.md` when the change touches routing, data access, background jobs, or deployment.
6. For the cross-layer map of canon / ADRs / specs / registers, see the documentation index: [`docs/INDEX.md`](docs/INDEX.md).
7. For substantial repo work, durable decisions, repeated feedback, or any request involving "memory", load the project-memory skill from `.agents/skills/project-memory/SKILL.md` and follow its workflow. Memory lives in `.claude/memory/MEMORY.md` plus topic files.

Memory is context, not law. If memory conflicts with this file, current docs, code, or explicit user instructions, follow the higher-priority source and update/archive the stale memory when appropriate.

## Repo Skills

All agent-scoped skills live in `.agents/skills/<skill-name>/SKILL.md`. Load the relevant skill before acting on that topic. Skills are plain markdown — any agent that can read files can follow them.

Key skills:

| Skill | When to load | File |
|-------|-------------|------|
| commit | User asks to commit, save changes, or push | `.agents/skills/commit/SKILL.md` |
| project-memory | Substantial repo work, user says "remember" or "add to memory" | `.agents/skills/project-memory/SKILL.md` |
| worktree-setup | Starting isolated work (parallel agents, autonomous WI execution, risky changes) | `.agents/skills/worktree-setup/SKILL.md` |
| build | EAS build checks, triggers, or status for mobile app | `.agents/skills/build/SKILL.md` |
| e2e | Mobile Maestro smoke runs | `.agents/skills/e2e/SKILL.md` |
| maestro-testing | Writing or debugging Maestro flows | `.agents/skills/maestro-testing/SKILL.md` |
| deep-bugfixing | Adversarial runtime-assumption reviews | `.agents/skills/deep-bugfixing/SKILL.md` |
| learning-evolution-next | Learning-product evolution audit | `.agents/skills/learning-evolution-next/SKILL.md` |
| old-notion | Working the EduAgent "Issue Tracker" bug backlog as batch shepherd — Issue Tracker bug-shepherding only, NOT Cosmo/ZDX work items (see "Cosmo work items" above) | `.agents/skills/my/old-notion/SKILL.md` |
| receiving-code-review | Receiving review feedback (human or automated) | `.agents/skills/receiving-code-review/SKILL.md` |
| test-driven-development | Implementing any feature or bugfix, before writing code | `.agents/skills/test-driven-development/SKILL.md` |
| systematic-debugging | Any bug, test failure, or unexpected behavior | `.agents/skills/systematic-debugging/SKILL.md` |
| verification-before-completion | About to claim work is done, fixed, or passing | `.agents/skills/verification-before-completion/SKILL.md` |

<!-- ZDX-PROJECT-RULES:BEGIN cosmo v1 -->
## Cosmo work items

This repo's work is tracked in **Cosmo** (the estate work system) under the **ZDX**
standard. These rules are **trigger → action**: each fires at its named moment,
regardless of which skill or entry point you arrived through — don't rely on a
lifecycle skill's description to carry them.

- **Claim before you execute.** WHEN you begin work on a Work Item (`WI-NN`) — any
  transition into build/execute mode → claim it first via `/cosmo:execute claim`
  (sets `Stage=Executing`, `Started`, and the claim props) **before any
  implementation**. Never start an unclaimed item; if a live claim holds it
  (`Claimed By` set **and** `Claim Expires > now`), pick another.
- **Finalize via `complete`; never self-close.** WHEN the work is committed and
  **landed on the base branch** — pushed directly, or the PR *merged*, not merely
  opened → run `/cosmo:execute complete`. Do **not** finalize at push on a PR-based
  flow: `complete` moves the item to `Reviewing`, and review's DoD requires the
  `Fixed In` commit to be an ancestor of `origin/main`, so an item finalized while
  its PR is still open bounces every time (findings F12; WI-818/822 and five WS-37
  items on 2026-07-08). It authors `Fixed In` (from the landed
  commit), the completion summary (lifecycle template: *What was done / What changed
  / Verification / Caveats / Follow-ups*), the `Stage=Reviewing` transition, and
  `Resolved`, and settles your claim. It self-gates on the mechanical DoD and refuses
  to finalize an item missing its close-artifacts — producing them is not optional.
- **Never hand-edit lifecycle fields.** Do not hand-edit `Stage` or `Fixed In`, and
  never move an item to `Reviewing` without running `complete`.
- **Close only via review + QA.** WHEN an item is to be closed → only through
  `/cosmo:review` incorporating `/cosmo:qa` evidence. Reviewing and closing are
  separate, deliberate gates — not part of `execute`. No agent-asserted closes.
- **Reference WIs as ID + name.** WHEN you reference a Work Item in user-facing output
  → include both the `WI-NN` ID and a brief name (e.g.
  `WI-449 (ZDX-standard project-rules snippet)`). Both pieces must be present; format
  is your judgment. Bare IDs are uncopyable, bare names unactionable; see the ZDX
  standard's *Agent output conventions* (`zdx/standard/conformance.md`) for examples.

Lifecycle commands live in the `cosmo` and `zdx` skill namespaces (e.g.
`/cosmo:execute`, `/cosmo:review`, `/cosmo:qa`); the estate-wide ZDX plugin is
`zdx-core`. How a repo wraps commit or lifecycle commands is a repo-overlay (L3)
concern and may override the commands named here. Standard:
[`zdx/standard/`](https://github.com/cognoco/nexus/blob/main/zdx/standard/).
<!-- ZDX-PROJECT-RULES:END -->

## Git Commits

Always use the repo commit skill for every commit and push — `/commit` in Claude Code, or load `.agents/skills/commit/SKILL.md` in Codex. It is the single source of truth for staging, message format, hook handling, and push behavior (a thin overlay over the global `/zdx-core:commit`; if unavailable, install the `zdx-core` plugin from the `cognoco/zdx-marketplace` registry — never fall back to ad-hoc git). Never hand-roll a commit flow, use the runtime built-in commit protocol, or stage broadly without checking scope. Hooks always run; the `--no-verify` doctrine lives in Required Validation below.

Agents perform code changes in isolated worktrees they own (see Worktree Placement below) and commit from there. In the residual shared-tree case, commit only your own session work — own-work scope, which the commit skill enforces — and never stage files another session modified.

**Docs-only exception (operator-ruled 2026-07-29):** a change touching ONLY documentation artifacts (`docs/**` markdown/HTML/PDF evidence, repo meta-docs — no code, config, CI, schema, or test files) still lands via **branch + PR**, but does NOT need an isolated worktree: build the commit against `origin/main` with the working-tree-free plumbing path declared in the commit skill (`.agents/skills/commit/SKILL.md` § Plumbing authorization) — never commit on `main` directly, never switch the shared checkout branch. Local hooks do not run on a plumbing commit; the PR CI is the gate (the docs change-class routes light checks). Any change that mixes in non-doc files still goes worktree→PR.

## Pull Requests

The commit skill ends at push — creating a PR is a separate, deliberate act (this is the PR-creation side of the `superpowers:finishing-a-development-branch` override above):

- **Never create a PR unless explicitly asked.** A PR is visible to others; the user controls when a branch goes up for review. After pushing, stop.
- **When asked, `gh pr create` is the canonical path** — the `gh` CLI is the default for all PR operations (create, view, diff, checks, review triage), never browser-first or hand-rolled API calls.

## Worktree Placement

All isolated worktrees go under `.worktrees/<branch-name>/` at the repo root. The path is gitignored.

- For Cosmo work items: use the WI ID as the branch name (e.g. `WI-78`).
- For other work: a short kebab-case slug derived from intent.

Always load the worktree-setup skill (`.agents/skills/worktree-setup/SKILL.md`) before creating a worktree — it handles placement, branch creation, `pnpm install`, and `pnpm env:sync`. Do not use Claude Code's `EnterWorktree` tool or `superpowers:using-git-worktrees` for this repo; both place the worktree in the wrong location.

Creating a worktree via this skill is NOT a "branch switch" — it creates a new branch in a separate directory while leaving your current CWD's branch untouched. This is allowed and is the standard pattern for parallel/isolated work.

## Skill Overrides

This repo overrides specific upstream skills. Use the repo version, not the upstream version. Adding a new override = adding a row.

| Upstream | Use instead | Why |
|----------|-------------|-----|
| `superpowers:using-git-worktrees` | `.agents/skills/worktree-setup/SKILL.md` | Wrong placement — see Worktree Placement above |
| `EnterWorktree` (Claude Code built-in) | `.agents/skills/worktree-setup/SKILL.md` | Wrong placement — see Worktree Placement above |
| `superpowers:finishing-a-development-branch` | `.agents/skills/commit/SKILL.md` (commit + push); manual PR creation via `gh pr create` | This repo has an opinionated PR/push flow via the commit skill; the superpowers menu would create competing guidance |
| `superpowers:writing-plans` | `.agents/skills/writing-plans/SKILL.md` | Repo-local, profile-aware planner (embryo of a global ZDX planner) — keeps the useful mechanics (naming, location, file-map-first, self-review) and drops the upstream's prescriptive 5-step TDD template that degrades frontier-model planning |

## Skill Authoring

When writing or editing skills:

- The `description:` frontmatter field describes ONLY *when* to use, not what the skill does. Start with "Use when …" and list specific triggering conditions and symptoms.
- A description that summarizes workflow creates a shortcut agents take instead of reading the skill body. Trigger-only descriptions force agents to load the full skill before acting.

## Cross-runtime File Sync

`.claude/skills/<name>/` is generated from `.agents/skills/<name>/` by `scripts/sync-skills.mjs`. Edit the master in `.agents/skills/`, then run `pnpm sync-skills` (or rely on the pre-commit hook). Direct edits to `.claude/skills/` will be overwritten on next sync.

Skills under a **group directory** (currently `tech/`) flatten on sync (`.agents/skills/tech/<skill>/` → `.claude/skills/tech-<skill>/`) because Claude Code does not reliably discover skills nested two levels deep; Codex reads the nested master directly. Add a tech skill by creating the nested master and running `pnpm sync-skills`. Config: `GROUP_DIRS` in `scripts/sync-skills.mjs`.

`AGENTS.md` is the single source of truth for repo agent instructions. `CLAUDE.md` is a thin pointer that imports it (`@AGENTS.md`), so the two can never diverge — make every change here in `AGENTS.md`, never in `CLAUDE.md` (converged 2026-06-09, WI-386). Claude Code's skill loader still discovers the synced `.claude/skills/` copies for slash commands, but this doc cites the `.agents/skills/` masters as the canonical path, since both runtimes can read them.

## Profile Shapes (Two Tab Shapes + isOwner Gating)

> **Scope.** This describes the **current** nav/gating system (`apps/mobile/src/lib/navigation-contract.ts`), not the target identity model (`docs/canon/identity/` + `_wip/identity-foundation/CANONICAL-SET.md`). In the target model `isOwner` is retired — split into the `admin` membership role, the Payer, and Guardianship — but it is the **live production authz until the Identity-V2 cutover executes**. Never "clean up" `isOwner` ahead of the cutover.

> **Nav mode is per-environment — never assume a global default.** The flags are build-time (`MODE_NAV_V0_ENABLED` / `MODE_NAV_V1_ENABLED`, `apps/mobile/src/lib/feature-flags.ts`) and intentionally differ by environment: read the values for the environment in question (`apps/mobile/eas.json` + workflow OTA env) before any nav/tab/mode claim, and **never write a flag state into docs or memory as "the default."** **V0 no-regress (ruled 2026-06-09):** target shell is V2, V1 is intermediate, V0 + flags-off legacy are shipped insurance — no currently shipped flag state may regress across any nav PR until the V0-retirement ruling executes (mentor-is-the-app spec §13); legacy helpers and flags-off short-circuits stay alive, and `resolveNavigationContract` wiring sits behind `MODE_NAV_V1_ENABLED`, never replacing the legacy fallback.

**Tab shape** controls which tabs appear (three flag states, not two); **`isOwner` gating** controls what appears INSIDE tabs (billing, security, export/delete, add-child, progress toggle). Full tab-shape matrix with file:line: `docs/flows/mobile-app-flow-inventory.md` → "Navigation shell matrix". Owner-vs-non-owner visibility summary + current gate sites (`navigationContract.gates.*`): `docs/compliance/audience-matrix.md` → "Where gating lives now" (verify the reconstructed inventory there against current code before relying on it).

Key rules:

- `resolveTabShape()` for tab visibility; `isOwner` / `role` (via `navigationContract.gates.*`) for content gating inside screens. `isGuardianProfile()` requires `isOwner` AND a non-owner in profiles[].
- `computeAgeBracket()` is for theming and age-appropriate copy — **never** feature gating. `computeAgeBracketFromDate()` (year-only fallback when month/day absent) is canonical for feature-gating and safety-adjacent age decisions (family-mode gate, adult-owner gate, LLM safety preamble, suitability-judge sampling). Any gate that turns on the learner age uses the date-based function. (Persona fossils are armed: `persona-fossil-guard.test.ts`.)
- A solo owner and a child on a parent account see the **same tabs** — they differ only in what is inside More/Progress.
## Languages

Two language enums **intentionally diverge** — the UI shell set (`SUPPORTED_LANGUAGES`, 7: en, de, es, ja, nb, pl, pt) is a subset of the LLM tutor-prose set (`conversationLanguageSchema`, 10: those plus cs, fr, it). **Never align them**: the conversation set is a deliberate superset; the UI shell falls back to English for cs/fr/it. Full system documentation: `docs/i18n.md`.

- Language-sync writes are safe by construction: `useMentorLanguageSync` clamps through `conversationLanguageSchema` before patching the profile, and the DB CHECK constraint is the hard floor.
- **Adding a language** → follow the recipe in `docs/i18n.md` § Adding a language (UI-only, conversation-only, and both are different procedures).
- i18n key health and the hardcoded-JSX-literal ratchet are **CI-armed**. Escapes when a gate fires: dynamic-dispatch keys → `scripts/i18n-keep.ts` `KEEP_PATTERNS` with a real `file:line` cite (cite rot is itself CI-checked); multi-interpolation templates → on-line `// i18n-allow-multi-var: <reason>`; genuinely non-translatable JSX copy → `pnpm check:i18n:jsx-literals --accept`, justified in the commit message.
- **All user-visible copy goes through `t('…')` with its `en.json` key added in the same PR.** The ratchet enforces the JsxText/child surface and known copy attributes; review remains responsible for copy behind unknown custom prop names.
- Keys with `{{var}}` interpolation ship a no-variable companion key when the variable is genuinely optional — never render "Starting with …" from a guessed ellipsis; translators produce odd output from it.

## Non-Negotiable Engineering Rules

- `@eduagent/schemas` is the shared contract. Do not redefine API-facing types locally. [PRIN-01]
- Business logic belongs in `services/`, not in route handlers (lint-enforced: eslint G1/G5). [PRIN-02]
- Reads use `createScopedRepository(profileId)` for single scoped tables; two sanctioned `db.select()` alternatives exist — parent-chain joins, and single-table queries the scoped repo API cannot express — always with `profileId` pinned in the WHERE. It is the **inexpressibility** that sanctions the pattern. Full rule + worked examples: `docs/architecture.md` § Enforcement Rules (scoped-read discipline). [PRIN-03]
- Writes include explicit `profileId` protection or verify ownership through the parent chain before updating child records. [PRIN-04]
- Shared mobile components stay persona-unaware: semantic tokens and CSS variables, no persona checks or hardcoded hex (exception: annotated brand-fixed hex inside SVG-internal animation/celebration components). [PRIN-05]
- Durable async work goes through Inngest — never fire-and-forget from route handlers. [PRIN-06]
- LLM calls go through `services/llm/router.ts` or its barrel, never direct provider SDKs. [PRIN-07]
- Non-core Inngest dispatches go through `safeSend()`; bare `inngest.send(...)` is reserved for CORE flows and carries a `// core-send: <reason>` comment (ratchet-tested). Full discipline: `docs/project_context.md` § safeSend. [PRIN-08]
- LLM responses that drive state-machine decisions use the structured envelope (`llmResponseEnvelopeSchema` via `parseEnvelope()`) — never `[MARKER]` tokens or JSON blobs in free text — and **every envelope signal has a server-side hard cap**. Full contract: `docs/architecture.md` § LLM Response Envelope. [PRIN-09]
- When changing LLM prompts (`apps/api/src/services/**/*-prompts.ts` or `services/llm/*.ts`), run the eval harness: `pnpm eval:llm` (Tier-1 snapshots) and `pnpm eval:llm --live` (Tier 2). The pre-commit hook does NOT run the harness — this obligation is on you. Mechanics: `docs/architecture.md`; receipt path: `docs/change-classes.md`. [PRIN-10]
- Challenge Round mastery is server-owned and conservative: the LLM proposes per-concept evaluations (`signals.challenge_round_evaluation`, each with `answerEventId` + `learnerQuote`); `decideMasteryAndReview()` verifies mastery only when **every** concept is `solid`. Note drafts use only `solidAnswerQuotes` and pass the hallucination guard in `services/challenge-round/note-draft.ts`. Routing goes through `resolveExchangeLlmRouting()` per MMT-ADR-0014 (Gemini excluded under-18). Full policy + history: `docs/project_context.md` § Challenge Round. [PRIN-11]

## Known Exceptions to Engineering Rules

Sanctioned deviations — do **not** "fix" these in unrelated PRs, do not copy them as precedent. Full rationale for each: `docs/known-exceptions.md`.

- **`apps/mobile/tsconfig.json` references `../api`** — type-only imports from `@eduagent/api` allowed (Hono RPC `AppType`); runtime imports remain forbidden.
- **clerk-js ships web3 packages into `node_modules`** — install-footprint only, never reach the device bundle (WI-1040). Do not attempt to strip.
- **Global `@tanstack/query-core` pin is load-bearing** (WI-1043) — dedupes across clerk + tanstack consumers. Bump in lockstep with `react-query`; never scope it.
- **Account-level Inngest events omit `profileId`** — account-scoped by design; do not add a dummy null.
- **`analogyDomain` (request) keeps `.nullable().optional()`** — genuine tri-state: set / clear / leave unchanged (WI-1160, operator-ruled). Request-side only.
- **`conversationLanguageConfirmed` / `isCurrentUser` (response) keep `.optional()`** — shaper-optional derived hints; consumer fails open on absence (WI-1556). Does **not** generalize to column-backed fields.
- **`topic_opened_pending_content` cap is client-side** (WI-2107) — no server loop to cap; termination enforced in `use-session-streaming.ts`.
- **Terminal-deletion dead-letters use awaited `step.sendEvent`, not `safeSend()`** (WI-2994) — dead-letter loss would be worse; scoped to the two deletion functions only.

## Schema And Deploy Safety

- Dev schema iteration can use `drizzle-kit push`.
- **Dev Neon is push/direct-only — never run `drizzle-kit migrate` against dev.** The dev migration journal has drifted (push-managed since the push→migrate transition), so a `migrate` would replay unjournaled migrations and abort on already-exists collisions; staging and production journals are clean and stay `migrate`-managed. Apply dev schema AND data changes via `push`/direct execution; re-journaling dev is deliberately deferred. Forensics: `.claude/memory/project_schema_drift_pattern.md`.
- Staging and production must use committed migration SQL plus `drizzle-kit migrate`.
- Never run `drizzle-kit push` against staging or production.
- Applied migrations are immutable — CI-armed (`Migration immutability guard (BUG-886)` → `scripts/check-migration-immutability.ts`): editing an applied `apps/api/drizzle/NNNN_*.sql` re-runs its DDL on the next `migrate` and drifts the schema. Write a NEW forward migration; a genuinely exceptional change is allowlisted with a reason in `scripts/migration-immutability-allowlist.json`.
- A worker deploy does not migrate Neon. Apply the target migration before shipping code that reads new columns.
- Keep staging and production database credentials separate in CI. Never let staging deploys point at production data.
- Any migration that drops columns, tables, or types must include a `## Rollback` section in the plan specifying whether rollback is possible, what data is lost, and the recovery procedure. If rollback is impossible, say so explicitly.

## Required Validation

Local hooks are fast feedback; **CI is the authoritative gate that protects `main`** — it routes the slow suites by change class (`scripts/check-change-class.sh` is the single routing source; see `docs/change-classes.md`). pre-commit runs cheap staged-only guards; pre-push runs the local type/test gate on the push delta. Verify locally while iterating, and focus on what hooks do not cover:

- **Run what CI runs.** When diagnosing a CI failure or addressing review findings, run the affected projects' typecheck + lint + tests locally — the full set CI would run, not just the file named in the error — and batch fixes into one validated push (a CI-first failure costs a ~30-minute round trip).
- Integration tests are **routed by the CI change-class router** (api / db-schema / shared-schemas / lockfile classes). Cross-package suite: `pnpm exec nx run api:test:integration` (`tests/integration/`); API co-located suite: `pnpm run test:api:integration:ci` (local wrapper `pnpm test:api:integration`). Local runs are **advisory** — local stg-DB runs can drift; CI is the gate. The pre-commit and pre-push hooks intentionally skip `.integration.test.` files.
- **`--no-verify`, two levels.** *Doctrine:* hooks run by default; a narrow, deliberate bypass of a local hook is acceptable **because CI backstops it** — but needing the same bypass repeatedly means the check is mis-placed: fix the gate, do not normalise the bypass. Zero-drift prompt changes use the eval-harness receipt path, not a bypass. One platform-scoped accommodation stands for human Windows devs (`nx affected` broken by an upstream `@nx/expo` bug — MMT-ADR-0019; watch-item WI-542). *Skill behavior is stricter than doctrine:* the automated commit agent never bypasses hooks autonomously — on a hook failure it stops and reports.
- Do not call work complete if related tests, lint, typecheck, required migrations, or required eval snapshot evidence is still failing.
- No suppression, no shortcuts. Never use `eslint-disable` or suppress warnings to make lint pass. Fix the code or improve the lint rule.

## Repo-Specific Guardrails

- Default exports are only for runtime-mandated entrypoints: Expo Router page components and Cloudflare Worker module entrypoints.
- Tests are co-located with source files. Do not create `__tests__/` folders.
- Package imports go through the package barrel, enforced by `@nx/enforce-module-boundaries`.
- SecureStore keys must use Expo-safe characters only: letters, numbers, `.`, `-`, `_`.
- In API code, use the typed config object instead of raw `process.env` reads (eslint G4 enforces this; the violation message points back here).
- Cross-tab / cross-stack `router.push` calls push the full ancestor chain, never just the leaf — a direct leaf push synthesizes a 1-deep stack, so `router.back()` falls through to the Tabs first-route. `unstable_settings.initialRouteName` only seeds one level and does not protect deeper paths; push the chain.
- Any new nested Expo Router layout that contains both an `index` screen and a deeper dynamic child must export `unstable_settings = { initialRouteName: 'index' }` as a safety net for cross-stack deep pushes.

## UX Resilience Rules

- Classify errors at the API client boundary, not per-screen. Screens must never parse HTTP status codes.
- Define and use a shared typed error hierarchy in the schema package.
- Primary error fallback action retries or fixes the specific problem; secondary action goes back, home, or signs out. Prefer reusable `ErrorFallback` and `TimeoutLoader`.
- Every feature spec/story must include a Failure Modes table with: State, Trigger, User sees, Recovery.
- For every event handler, cron function, or background job, verify something actually dispatches the event or schedules the cron in production code.

## Fix Development Rules

Changed code is not fixed code. Every fix must be verified.

- Security fixes tagged CRITICAL or HIGH require a negative-path break test that attempts the exact attack being prevented. Use the red-green regression pattern (see `superpowers:verification-before-completion` → "Regression tests"): write the test, watch it pass, revert the fix, watch it fail, restore.
- Silent recovery without escalation is banned in billing, auth, and webhook code. Emit a structured metric or Inngest event; `console.warn` alone is not enough.
- When fixing a drift that has 3+ sibling locations, either install a forward-only guard test and sweep all current sites in the same PR, or document a deferred sweep with tracked ID, owner, and target date.
- Commit-specific rules such as finding IDs, Verified-By tables, and sweep-audit blocks live in the commit skill (`.agents/skills/commit/SKILL.md`).

## Code Quality Guards

These rules catch bugs that survive type-checking and only surface at runtime. Learned from adversarial review (2026-04-05).

- **Internal mocks are backlog, never acceptable state.** Never `jest.mock` your own database, services, or middleware; mock only true external boundaries (Stripe, Clerk JWKS, LLM via `routeAndCall`, push, email — bare specifiers). To stub named exports of an internal module: `jest.requireActual()` with targeted overrides (canonical pattern: `apps/api/src/inngest/functions/archive-cleanup.test.ts`). [PRIN-12]
- **GC1 (CI-armed):** any new relative-path `jest.mock` of an internal module in `*.test.ts` / `*.test.tsx` fails CI. The `// gc1-allow: <reason>` escape applies only when the real code genuinely cannot run in the test environment — never convenience. [PRIN-13]
- **GC6 — every test-file edit:** remove the file's internal mocks (relative-path or `@eduagent/*` specifiers) before the edit is complete; the PostToolUse hook's output is a **blocker on completion**, not a follow-up. Deferral (file paths + count in the commit message) only when burn-down would balloon a focused task. Full workflow: `/my:sweep-mocks`. [PRIN-18]
- **Response bodies are single-use.** Never call both `.json()` and `.text()` on the same `fetch` Response — the body stream is consumed on first read. If you need both, read `.text()` once and `JSON.parse` it manually. Applies to `assertOk`-style helpers, error-extraction middleware, and SSE error handlers. [PRIN-14]
- **Classify errors before formatting.** When code branches on error *type* and also formats errors for display, classify the **raw** error object first, then format for the user. Never string-match on the output of `formatApiError` — the formatter strips status codes, error codes, and keywords classifiers depend on. [PRIN-15]
- **Clean up all artifacts when removing a feature.** Grep the entire project for all references: types, imports, constants, SecureStore keys, commented-out JSX, fallback branches. Orphaned types create false confidence; leaked storage keys waste device storage forever. [PRIN-16]
- **Verify JSX handler references exist** after adding any `Pressable` or `Button` — an `onPress={handleX}` that points at a removed or renamed handler type-checks but is dead at runtime. [PRIN-17]

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

All project secrets are managed through Doppler. Do not confuse with Zwizzly/ZDX secrets (e.g. `NOTION_TOKEN`), which are managed through Infisical.

Assume the `doppler` CLI is installed and on PATH. Never suggest `wrangler secret put`, direct Cloudflare dashboard entry, AWS console, or platform-specific secret management. When secrets need to be set, say "add to Doppler."

## PR Review & CI Protocol

Review depth is the work item Review Tier property (Light / Standard / Adversarial), declared at DoR by mechanically applying the ZDX-ADR-0118 trigger table — never chosen at review time (elevation-only re-check at dispatch). Every tier binds the **never-weakening floor**: green CI + a clean automated-review verdict from the configured provider on the current head + disposed bot threads + armed merge gate (`conformance.review-tier-never-weakening`). Adversarial review is a **pre-merge gate**, verdict bound to the reviewed SHA — new commits void it; the merge waits on the delta re-review. Items in Reviewing are picked up by estate-global reviewer services, external to this repo.

Before declaring a PR ready to merge:

1. Read the actual PR diff: `gh pr diff <number>`.
2. Check all CI checks: `gh pr checks <number>`. Deterministic checks (lint, typecheck, test, build) must pass. The automated review check is **advisory**: green = it ran (findings may still exist); red = it did NOT run — investigate the run failure before attributing a cause, and never round a red review up to "green". Silence is never approval.
3. Always read the review verdict and triage its findings — the check colour does not surface them. Verdicts are **top-level PR comments** (`gh api .../issues/<number>/comments`, newest = latest head) — NOT `pulls/<number>/comments` (diff-anchored inline bot comments). Also read `pulls/<number>/reviews`. Fix MUST_FIX / SHOULD_FIX before merge.
4. Never dismiss advisory findings just because the check is green — advisory means triage it yourself, not ignore it.

Reviewer outage (`REVIEWER_UNAVAILABLE`), the self-reference case (a PR editing the review workflow cannot receive its own automatic review), a required check stuck on "Waiting for status to be reported", and Playwright web-smoke triage all live in `docs/runbooks/claude-reviewer-recovery.md`. A `REVIEWER_UNAVAILABLE` artifact is a machine-readable non-merge result, never approval — recovery restores the reviewer, never waives the gate.

When rebasing PRs: verify the PR diff after rebase; check for duplicate functions/tests, missing imports, and schema export gaps; run type checking before pushing.

## On Compaction

When conversation context is compacted, preserve at minimum:

- Full list of files modified in this session.
- Names and reproductions of failing tests, lint errors, or typecheck errors not yet resolved.
- Active plan/task list, current step, next step, and anything blocked.
- Current branch name and which base branch it tracks.
- Decisions made in conversation that are not reflected in the diff yet.

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

Last updated: 2026-08-02 (WI-2052 restructure — operator-ruled content plan; design principle: docs/adr/MMT-ADR-0053)
