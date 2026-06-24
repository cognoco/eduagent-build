# MentoMate

## Snapshot

- Mobile: ~88 screens, 443 test suites, ~4,757 tests
- API: 48 route groups, 329 test suites, ~7,380 tests, 65 Inngest functions
- Cross-package integration tests: 56 suites in `tests/integration/`, ~290 cases
- Monorepo: `apps/api`, `apps/mobile`, shared packages in `packages/`
- Core docs: `docs/project_context.md`, `docs/architecture.md`, relevant spec/plan under `docs/plans/` or `docs/specs/`

> Counts verified 2026-06-24. Test-case totals are a heuristic grep of `it(` / `test(` line starts; jest-reported totals may be slightly higher due to `it.each(...)` expansion at runtime. Re-verify with `git ls-files | grep '\.test\.'` for suite counts.

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
6. For the cross-layer map of canon / ADRs / specs / registers, see the documentation index: [`docs/INDEX.md`](docs/INDEX.md). *(Seeded 2026-06-08 — identity-foundation canon is fully indexed; estate-wide population is in progress.)*
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
| notion | EduAgent/MentoMate Notion work items | `.agents/skills/notion/SKILL.md` |
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
  pushed → run `/cosmo:execute complete`. It authors `Fixed In` (from the landed
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

Always use the repo commit skill for every commit and push — `/commit` in Claude Code, or load `.agents/skills/commit/SKILL.md` in Codex. It is the single source of truth for staging, message format, hook handling, and push behavior (a thin overlay over the global `/zdx-core:commit`). The global primitive ships in the `zdx-core` plugin from the `cognoco/zdx-marketplace` plugin registry — if `/zdx-core:commit` is unavailable, install/enable that plugin; never fall back to ad-hoc git. Never hand-roll a commit flow, use the runtime's built-in commit protocol, or stage broadly without first checking scope. The skill lets hooks run and never bypasses them autonomously; the `--no-verify` doctrine lives in Required Validation below.

Agents perform code changes in isolated worktrees they own (see Worktree Placement below) and commit from there. In the residual shared-tree case, commit only your own session's work — own-work scope, which the commit skill enforces — and never stage files another session modified.

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
| `superpowers:using-git-worktrees` | `.agents/skills/worktree-setup/SKILL.md` | Canonical placement at `.worktrees/`; adds `pnpm install` + `pnpm env:sync` |
| `EnterWorktree` (Claude Code built-in) | `.agents/skills/worktree-setup/SKILL.md` | Same reason; built-in default `.claude/worktrees/` is wrong for this repo |
| `superpowers:finishing-a-development-branch` | `.agents/skills/commit/SKILL.md` (commit + push); manual PR creation via `gh pr create` | This repo has an opinionated PR/push flow via the commit skill; the superpowers menu would create competing guidance |
| `superpowers:writing-plans` | `.agents/skills/writing-plans/SKILL.md` | Repo-local, profile-aware planner (embryo of a global ZDX planner) — keeps the useful mechanics (naming, location, file-map-first, self-review) and drops the upstream's prescriptive 5-step TDD template that degrades frontier-model planning |

## Skill Authoring

When writing or editing skills:

- The `description:` frontmatter field describes ONLY *when* to use, not what the skill does. Start with "Use when …" and list specific triggering conditions and symptoms.
- A description that summarizes workflow creates a shortcut agents take instead of reading the skill body. Trigger-only descriptions force agents to load the full skill before acting.

## Cross-runtime File Sync

`.claude/skills/<name>/` is generated from `.agents/skills/<name>/` by `scripts/sync-skills.mjs`. Edit the master in `.agents/skills/`, then run `pnpm sync-skills` (or rely on the pre-commit hook). Direct edits to `.claude/skills/` will be overwritten on next sync.

Skills under a **group directory** (currently `tech/`) are an exception to the 1:1 mirror: each child `.agents/skills/tech/<skill>/` is flattened to `.claude/skills/tech-<skill>/`. Codex reads the nested master directly; Claude Code reads the flattened copy because it does not reliably discover skills nested two levels deep under `.claude/skills/`. Add a new tech skill by creating `.agents/skills/tech/<skill>/SKILL.md` and running `pnpm sync-skills`. Group dirs are configured in `GROUP_DIRS` in `scripts/sync-skills.mjs`.

`AGENTS.md` is the single source of truth for repo agent instructions. `CLAUDE.md` is a thin pointer that imports it (`@AGENTS.md`), so the two can never diverge — make every change here in `AGENTS.md`, never in `CLAUDE.md` (converged 2026-06-09, WI-386). Claude Code's skill loader still discovers the synced `.claude/skills/` copies for slash commands, but this doc cites the `.agents/skills/` masters as the canonical path, since both runtimes can read them.

## Profile Shapes (Two Tab Shapes + isOwner Gating)

> **Scope.** This section describes the **current** nav/gating system (live in `apps/mobile/src/lib/navigation-contract.ts`). The **target** identity model being designed in the identity-foundation runway (6-persona set, capability split, "charge" terminology) is **not** this — it lives in `docs/canon/identity/` + `_wip/identity-foundation/CANONICAL-SET.md`. Don't conflate the two.

**For full audience matrix** (which screens/APIs/Inngest jobs serve which user mode, with file:line citations and known gating gaps F1-F14), see `docs/audience-matrix.md`. For the *target* state — one `resolveNavigationContract()` function owning all UI gating — see the now-implemented contract in `apps/mobile/src/lib/navigation-contract.ts` (design rationale archived at `docs/_archive/specs/Done/2026-05-21-navigation-contract.md`). The short version is below.

> **Nav mode is per-environment — check it whenever the environment under discussion changes; never assume a global default.** The flags are **build-time** (`MODE_NAV_V0_ENABLED` / `MODE_NAV_V1_ENABLED` from `EXPO_PUBLIC_ENABLE_MODE_NAV` / `..._V1`, resolved in `apps/mobile/src/lib/feature-flags.ts:30-31`) and intentionally differ by environment — as of 2026-06-09: production build V0=on/V1=off (`apps/mobile/eas.json`), dev/preview builds and the preview-channel OTA both-on → V1 (`eas.json`, `.github/workflows/ci.yml` OTA env), local `.env.example` flags-off. These can change — read the flag values for the environment in question before making any nav/tab/mode claim, and use the audience × flag-state "Navigation shell matrix" in `docs/flows/mobile-app-flow-inventory.md`. Do not write any flag state into docs or memory as "the default."
>
> **V0 status + hard constraint (ruled 2026-06-09).** V0 is the currently shipped production state and flag-isolated legacy insurance — not the long-term target. The target shell is **V2** per `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md`; V1 is an intermediate, live on dev/preview/staging. All currently shipped flag states — the flags-off legacy 5-tab shell AND the V0-on mode shells — **must not regress** across any nav PR until the V0-retirement ruling (mentor-is-the-app spec §13, owner: product) is executed at its S6 milestone. The legacy helpers (`apps/mobile/src/lib/legacy-navigation-contract.ts`, e.g. `resolveShellVisibleTabs()`) and the flags-off short-circuits in `app-context.tsx` stay alive; `resolveNavigationContract` wiring sits behind `MODE_NAV_V1_ENABLED` and never replaces the legacy fallback. (Historical design rationale: `docs/_archive/specs/Done/2026-05-21-navigation-contract.md`.)

**Tab shape** controls which tabs appear. The learner shape is stable; the guardian/supporter shape depends on the flag state — three states, not two:

| Audience | flags-off (V0=off, V1=off) | V0=on, V1=off | V1=on |
|---|---|---|---|
| Solo owner / child on parent's account | 4: home, library, progress, more | same | same |
| Adult owner + linked children | 5: home, own-learning, library, progress, more (`LEGACY_GUARDIAN_TABS`) | family mode: 3 (home, progress, more); study mode: 4 learner tabs; ModeSwitcher | family: 4 (home, **recaps**, progress, more — `FAMILY_TABS`); study: 4 (`STUDY_TABS`) |
| Parent-proxy | 3: home, library, progress | 3 | 3 (`PROXY_TABS`) |

The V1 guardian redesign replaces `own-learning` + `library` with a single `recaps` tab. V1 sets live in `apps/mobile/src/lib/navigation-contract.ts`; legacy/V0 sets in `apps/mobile/src/lib/legacy-navigation-contract.ts`. Which column is "production" depends on the build profile — check, don't assume (see the mode-check note above). Full matrix with file:line: `docs/flows/mobile-app-flow-inventory.md` → "Navigation shell matrix".

Note: the learner-vs-parent home branch is the `navigationContract.home.screen === 'FamilyHome'` check in `home.tsx` — it renders `ParentHomeScreen` when true, else `LearnerScreen` directly. The legacy in-`LearnerScreen` `showParentHome` branch has been removed (WI-729). [was: documented as branching inside `LearnerScreen.tsx`]

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

### Hardcoded-JSX-literal ratchet (Phase 3)

The orphan-key checker only sees strings that pass through `t()`. Hardcoded
English literals in JSX (e.g. `<Text>Add child</Text>`) bypass i18n entirely
and render English to every locale. `scripts/check-i18n-jsx-literals.ts` is the
read-side guard: a `ts-morph` AST walker that flags `JsxText` nodes and
JSX-children `StringLiteral` / `NoSubstitutionTemplateLiteral` nodes (including
through `cond ? 'a' : 'b'`, `x && 'a'`, `x ?? 'a'`, casts/parens) in
`apps/mobile/src/**/*.tsx`. It is a forward-only baseline ratchet mirroring the
`no-clinical-copy` pattern: existing literals are grandfathered in
`scripts/i18n-jsx-literals-baseline.json` (361 entries), and only NEW literals
fail CI (the `i18n hardcoded-JSX-literal check` step in `ci.yml`). Violations are
keyed on `{file, kind, text}` — not line number — so reformatting never churns
the baseline. Run `pnpm check:i18n:jsx-literals --accept` to refresh the
baseline when you genuinely add non-translatable JSX copy (a code sample, a
brand token) and justify it in the commit message.

**Scope deliberately excludes JSX *attribute* literals** (`label="Continue"`,
`title="Delete"`) — that surface mixes real copy with testID/style/a11y-role
values and needs a per-prop allow/deny model scoped separately
(`docs/audit/2026-05-29-full-audit/workflow-1/proposed-baseline.json`).

When adding user-visible copy, route it through `t('…')` and add the key to
`en.json` in the same PR — the ratchet enforces this for the JsxText/child
surface, but attribute copy still relies on review.

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
- LLM calls go through `services/llm/router.ts` or its barrel, not direct provider SDK calls.
- Non-core Inngest dispatches (telemetry, post-success notifications, observability events) go through `safeSend()` in `apps/api/src/services/safe-non-core.ts` so a dispatch failure is captured in Sentry but never throws and never breaks the user action. Bare `inngest.send(...)` is reserved for CORE flows where dispatch failure must short-circuit the user action — those sites carry a `// core-send: <reason>` comment on the line(s) immediately above the call. Forward-only ratchet test: `apps/api/src/services/safe-non-core.guard.test.ts`.
- LLM responses that drive state-machine decisions (close interview, hold escalation, trigger UI widget) must use the structured response envelope (`llmResponseEnvelopeSchema` from `@eduagent/schemas`). Parse with `parseEnvelope()` from `services/llm/envelope.ts`. Never embed `[MARKER]` tokens or JSON blobs in free-text replies. Every envelope signal must have a server-side hard cap (e.g., `MAX_INTERVIEW_EXCHANGES = 4`) so the flow terminates even if the LLM never emits the signal. See `docs/architecture.md` → "LLM Response Envelope" for the full contract.
- When changing LLM prompts (`apps/api/src/services/**/*-prompts.ts` or `apps/api/src/services/llm/*.ts`), run the eval harness (`pnpm eval:llm`) to snapshot before/after, and `pnpm eval:llm --live` (Tier 2) to validate real LLM responses against `expectedResponseSchema`. The pre-commit hook only checks that snapshot files are staged — it does NOT run the harness. Harness code: `apps/api/eval-llm/`.
- Challenge Round mastery policy is server-owned and conservative over structured LLM evidence. The LLM proposes per-concept evaluations via `signals.challenge_round_evaluation`; each item must include `answerEventId` and `learnerQuote`. The server runs `decideMasteryAndReview()` and sets `assessments.mastery_challenge_verified_at` only when EVERY concept evaluates `solid`. Any `partial`, `missing`, or `misconception` blocks mastery and routes the weak concepts to `needs_deepening_topics` with `source = 'challenge_round'`. Notes drafted from Challenge Rounds must use only `solidAnswerQuotes` and pass the lexical-overlap hallucination guard in `services/challenge-round/note-draft.ts` before being shown to the learner. Challenge Round LLM calls must still route through `resolveExchangeLlmRouting()`; accepted/active/drafting turns may apply a routing-only rung-4 floor (mechanism planned — `ExchangeContext.llmRoutingRung` field not yet in source), and per-tier model routing (incl. minor/Family) follows `MMT-ADR-0014` + `docs/registers/llm-models/master.md` (the prior "Family = Gemini-only" wording is superseded — Gemini is excluded under-18). The persistent Challenge mode toggle (`learningMode: 'serious' | 'casual'`) was removed in Phase 0 (PR #325); today's `casual` is the single default tone and rigor is now expressed per-Challenge-Round rather than globally.

## Known Exceptions to Engineering Rules

These deviations from the rules above exist in the codebase as of 2026-05-01. They are listed here so reviewers don't try to "fix" them in unrelated PRs and so new contributors don't take them as precedent. Each exception should either be tracked toward a refactor, or promoted into an explicit rule.

- **`apps/mobile/tsconfig.json` declares `references[]: [{ "path": "../api" }]`**, in tension with the conceptual "mobile must not depend on api" rule. This is required so `import type { AppType } from '@eduagent/api'` resolves for the Hono RPC client. **Type-only imports** from `@eduagent/api` are accepted; runtime imports remain forbidden (they would pull API server code into the mobile bundle). See `docs/architecture.md` → "AppType" example for the rationale.

## Schema And Deploy Safety

- Dev schema iteration can use `drizzle-kit push`.
- Staging and production must use committed migration SQL plus `drizzle-kit migrate`.
- Never run `drizzle-kit push` against staging or production.
- A worker deploy does not migrate Neon. Apply the target migration before shipping code that reads new columns.
- Keep staging and production database credentials separate in CI. Never let staging deploys point at production data.
- Any migration that drops columns, tables, or types must include a `## Rollback` section in the plan specifying whether rollback is possible, what data is lost, and the recovery procedure. If rollback is impossible, say so explicitly.

## Required Validation

Local hooks are fast feedback; **CI is the authoritative gate that protects `main`**. **pre-commit** runs cheap staged-only guards (`lint-staged`, the eval-snapshot / i18n / GC1 guards, skills-sync, a secret/large-file scan) — **not** whole-tree `tsc`/tests. **pre-push** is the local type/test gate (`tsc --build` + surgical `--findRelatedTests` jest on the push delta, plus Tier-1 eval + i18n). **CI routes the slow suites by change class** — `scripts/check-change-class.sh` is the single routing source (see `docs/change-classes.md`). Verify locally while iterating, and focus on what hooks do not cover:

- **Run what CI runs.** When diagnosing a CI failure or addressing review findings, run the affected projects' typecheck + lint + tests locally — the full set CI would run, not just the file named in the error — and batch fixes into one validated push. A failure that first surfaces in CI costs a ~30-minute push-fix-push round trip (Insights analysis 2026-03-27 measured 3–4 such cycles in single sessions).
- Integration tests (`pnpm exec nx test:integration api`) are **routed by the CI change-class router** and run whenever the diff could affect them (api / db-schema / shared-schemas / lockfile classes). Running them locally before a commit is **advisory** — useful fast feedback for `apps/api/` or `tests/integration/` changes, but local stg-DB runs can drift; CI is the gate. The pre-commit and pre-push hooks intentionally skip `.integration.test.` files.
- **`--no-verify`, two levels.** *Doctrine:* default is to let hooks run; a **narrow, deliberate** bypass of a local hook is acceptable **because CI backstops it** (a comment/type-only prompt change that cannot alter generation; a genuinely broken local harness via `SKIP_PRE_PUSH`) and is not a violation — but needing to bypass the same check repeatedly means the check is **mis-placed: fix the gate, don't normalise the bypass**. One platform-scoped accommodation stands: `nx affected` is broken on Windows by an upstream `@nx/expo` bug, so the documented `--no-verify` escape for large staged sets remains for human Windows devs until the upstream fix lands (MMT-ADR-0019; watch-item WI-542). *Skill behavior is stricter than doctrine:* the automated commit agent never bypasses hooks autonomously — on a hook failure it stops and reports.
- Do not call work complete if related tests, lint, typecheck, required migrations, or required eval snapshots are still failing.
- No suppression, no shortcuts. Never use `eslint-disable` or suppress warnings to make lint pass. Fix the code or improve the lint rule.

## Repo-Specific Guardrails

- Default exports are only for Expo Router page components.
- Tests are co-located with source files. Do not create `__tests__/` folders.
- Package imports go through the package barrel, enforced by `@nx/enforce-module-boundaries`.
- SecureStore keys must use Expo-safe characters only: letters, numbers, `.`, `-`, `_`.
- In API code, use the typed config object instead of raw `process.env` reads (eslint G4 enforces this; the violation message points back here).
- Cross-tab / cross-stack `router.push` calls must push the full ancestor chain, not just the leaf. A direct push to `shelf/[subjectId]/book/[bookId]` from another tab synthesizes a 1-deep stack containing only the leaf, so `router.back()` falls through to the Tabs first-route (Home). Either push the parent first then the child, or rely on `unstable_settings.initialRouteName` in the nested layout — but the rule of thumb is to push the chain. `unstable_settings` only seeds one level, so it does not protect future deeper paths (e.g. `shelf/[subjectId]/book/[bookId]/chapter/[chapterId]`).
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

- **No internal mocks in integration tests.** Never `jest.mock` your own database, services, or middleware in integration tests. Mock only true external boundaries (Stripe, Clerk JWKS, email providers, push notification services). Internal mocks hide real bugs.
- **No new internal `jest.mock()` (GC1 ratchet).** CI fails any PR that adds a relative-path `jest.mock('./...')` or `jest.mock('../...')` line in `*.test.ts` / `*.test.tsx`. Existing legacy sites are NOT blocked by the ratchet but are NOT considered acceptable state — they are backlog for the GC6 burn-down. To stub a few named exports of an internal module, use `jest.requireActual()` with targeted overrides (canonical pattern: `apps/api/src/inngest/functions/archive-cleanup.test.ts`). External-boundary mocks (LLM via `routeAndCall`, push, email, Stripe, Clerk JWKS) use bare specifiers and are unaffected. The `// gc1-allow: <reason>` escape is reserved for cases where the code under test genuinely cannot be exercised (no real implementation available in the test environment); it is not an "I don't feel like wiring the real thing today" escape.
- **Response bodies are single-use.** Never call both `.json()` and `.text()` on the same `fetch` Response — the body stream is consumed on first read. If you need both JSON parsing with a text fallback, read `.text()` once and `JSON.parse` it manually. Applies to `assertOk`-style helpers, error-extraction middleware, and SSE error handlers.
- **Classify errors before formatting.** When code branches on error *type* (reconnectable vs. fatal, quota vs. network) and also formats errors for display, classify the **raw** error object first, then format for the user. Never string-match on the output of `formatApiError` — the formatter strips status codes, error codes, and keywords classifiers depend on.
- **Clean up all artifacts when removing a feature.** Grep the entire project for all references: types, imports, constants, SecureStore keys, commented-out JSX, fallback branches. Orphaned types create false confidence, unreachable fallback branches inflate coverage, leaked storage keys waste device storage forever.
- **Verify JSX handler references exist** after adding any `Pressable` or `Button` — an `onPress={handleX}` that points at a removed or renamed handler type-checks but is dead at runtime.
- **GC6 — Boy-scout internal mocks when editing test files.** Any time you edit a test file (`*.test.ts` / `*.test.tsx` / `*.integration.test.ts`) for any reason, scan it for `jest.mock('./...')`, `jest.mock('../...')`, or `jest.mock('@eduagent/...')` and remove the internal mocks before the edit is complete. Use the real implementation, or convert to `jest.requireActual()` with targeted overrides (canonical pattern: `apps/api/src/inngest/functions/archive-cleanup.test.ts`). Run `/my:sweep-mocks` for the full workflow. The PostToolUse hook at `~/.claude/hooks/post-edit-jest-mock-check.sh` surfaces offending lines after every test-file edit; treat that output as a blocker on task completion, not a follow-up. External-boundary mocks (LLM via `routeAndCall`, Stripe, Clerk JWKS, push, email, Inngest framework) use bare specifiers and are not violations. The `// gc1-allow: <reason>` escape applies only when the real code cannot run in the test environment — not as a convenience. **Policy:** internal mocks are not acceptable state, they are backlog. **Why:** GC1 gates new violations; GC6 forces every test-file visit to reduce the legacy backlog. The deferral escape (leave the mocks, record file paths + count in the commit message) exists only when burn-down would balloon a focused task — it does not authorize preserving the mocks indefinitely.

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

Before declaring a PR ready to merge:

1. Read the actual PR diff: `gh pr diff <number>`.
2. Check all CI checks: `gh pr checks <number>`. Deterministic checks (lint, typecheck, test, build) must pass. Claude Code Review is **advisory**: green = it ran (findings may still exist); red = it did NOT run (token exhaustion / timeout / crash, **or the review workflow itself is broken — a permissions / trigger / YAML regression**) — investigate the run's *actual* failure before attributing it to tokens, not "findings to fix". Silence is never approval; a red review is never rounded up to "green".
3. Always read the Claude Code Review comment and triage its findings — the check colour does not surface them. The verdict (APPROVED / CHANGES_REQUESTED / BLOCKED + MUST_FIX/SHOULD_FIX/CONSIDER tables) is a TOP-LEVEL PR comment, returned ONLY by `gh api repos/{owner}/{repo}/issues/<number>/comments` (newest = latest head) — NOT `pulls/<number>/comments`, which is diff-anchored inline comments (Codex/CodeRabbit). Also read `gh api repos/{owner}/{repo}/pulls/<number>/reviews`. Fix MUST_FIX / SHOULD_FIX before merge.
4. Never dismiss advisory findings just because the check is green — advisory means triage it yourself, not ignore it.

A required check stuck on "Waiting for status to be reported" (never red, never green) is usually **workflow-trigger drift, not failing code** — the check is required in branch protection but its workflow only runs on `push`/`workflow_dispatch`, not `pull_request`. Fix the trigger (a small PR-only job that reports the required check name; guard deploy/build jobs with `github.event_name == 'push' || github.event_name == 'workflow_dispatch'` so PRs can't deploy), not the code. For a Playwright web-smoke failure, read `error-context.md` + the `0-trace.network` log before touching selectors: `net::ERR_FAILED`/CORS in the trace means fix the staging/API target, not the assertion.

When rebasing PRs:

- After rebase, always verify the PR diff.
- Check for duplicate functions/tests, missing imports, and schema export gaps.
- Run type checking before pushing.

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

Last updated: 2026-06-12
