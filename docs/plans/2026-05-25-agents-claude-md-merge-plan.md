# AGENTS.md ↔ CLAUDE.md merge plan

> **Status (2026-05-25):** ~25% complete. Only the **Profile Shapes** section has been backported from `CLAUDE.md` into `AGENTS.md`. ~14 of 15 RECOVER sections are still missing from `AGENTS.md` (safeSend, Challenge Round mastery, GC1/GC6 details, expanded PR Review protocol, etc.). `diff AGENTS.md CLAUDE.md` is **318 lines**. No `scripts/sync-agent-docs.mjs` exists (the failed prototype was rolled back as planned). **Resume here:** pick the next RECOVER section by priority order in the plan body (suggest safeSend or GC1/GC6 next — both are referenced by active workflows), backport into `AGENTS.md`, re-run `diff` to confirm convergence on that section, then loop. Choose a sync strategy (hand-maintained vs. resurrected script) only after the content merge is complete.

**Status:** Open — follow-up from PR #412 (`worktree-rules`).
**Trigger memory:** `.claude/memory/project_agent_doc_and_memory_architecture_revisit.md`.

## Why this exists

During PR #412 we prototyped a sync mechanism (`scripts/sync-agent-docs.mjs`) that regenerated `CLAUDE.md` from `AGENTS.md`. The first sync run silently regressed rich `CLAUDE.md` content that had drifted from the slimmer `AGENTS.md` — losing the Profile Shapes section, the full GC1 ratchet rule, GC6 boy-scout rule, expanded PR Review protocol, and others.

We rolled the sync mechanism back. `CLAUDE.md` was restored to its pre-sync (rich) state, and the new doctrine sections we'd added (Worktree Placement, Skill Overrides, Skill Authoring, Cross-runtime File Sync, Planning Discipline) were manually mirrored into both files. The two files now diverge by design pending a proper merge.

This plan turns that deferred work into actionable items.

## Current divergence

| File | What it has | What it's missing |
|---|---|---|
| `CLAUDE.md` | Rich pre-sync content + new doctrine | Up to date on doctrine; no missing content |
| `AGENTS.md` | Slim pre-sync content + new doctrine | Most of the items in the RECOVER table below |

## Recovery table

Produced by subagent analysis during PR #412 (diff of `git show origin/main:CLAUDE.md` from before this PR vs current `AGENTS.md`). Verdicts: **RECOVER** = add to `AGENTS.md`; **LEAVE DROPPED** = stale or wording-only; **PROMOTE ELSEWHERE** = doesn't belong in agent doc.

### RECOVER (in priority order)

| Topic | Section in AGENTS.md to extend | Why it matters |
|---|---|---|
| **Profile Shapes** (tab shapes, isOwner gating, V0/V1 constraint, `persona-fossil-guard.test.ts` reference) | New section between Git Commits and Non-Negotiable Engineering Rules | Active production constraint; V0 must not regress. Agents touching nav code will silently break the V0 fallback without this. |
| **`safeSend()` / non-core Inngest dispatch rule** (full detail: `safe-non-core.ts`, `// core-send:` comment convention, guard test) | Extend Non-Negotiable Engineering Rules | Enforcement mechanism for core vs non-core sends; without it an agent won't know `safeSend()` exists or that it's required. |
| **Challenge Round mastery policy** (full paragraph: `decideMasteryAndReview()`, `mastery_challenge_verified_at`, `needs_deepening_topics`, hallucination guard, LLM routing rung, PR #325 removal note) | New bullet in Non-Negotiable Engineering Rules | Server-owned mastery logic; an agent changing the Challenge Round flow without this context will break the conservative policy or re-introduce the removed toggle. |
| **GC1 ratchet full detail** (canonical pattern file reference, legacy-sites-are-backlog distinction, `gc1-allow` escape intent) | Extend Code Quality Guards GC1 bullet | Without the canonical pattern reference (`archive-cleanup.test.ts`) and the "legacy sites are backlog, not precedent" framing, agents treat the escape as routine and perpetuate mock debt. |
| **GC6 boy-scout rule** (full: sweep on every test-file edit, PostToolUse hook reference, deferral escape, policy statement, "GC1 gates / GC6 reduces" framing) | New bullet in Code Quality Guards after GC1 | The PostToolUse hook is live infrastructure; without GC6, agents don't know they're expected to act on its output. |
| **Both hooks skip integration tests** ("Both hooks intentionally skip" vs the current "The pre-commit hook intentionally skips") | Correct the integration-test bullet in Required Validation | Factual: if pre-push also skips, the current AGENTS.md is misleading. (Already partially fixed in PR #412 — re-verify wording.) |
| **PR Review finding severity tiers** (High/Must fix, Medium/Should fix, Low/Can defer triage table; "treat findings with same weight as senior engineer" framing) | Extend PR Review & CI Protocol | Action-directing: without severity tiers, an agent may treat a CRITICAL security finding as optional. |
| **`process.env` guardrail — eslint G4 reference** ("eslint G4 enforces this; the violation message points back here") | Extend Repo-Specific Guardrails | Agents reading a G4 lint error need to know it's intentional and points here; otherwise they waste time on the rule itself. |
| **`router.push` full rationale** (1-deep stack explanation, `router.back()` fallback, `unstable_settings` caveat for deeper paths) | Extend Repo-Specific Guardrails | The rationale is what makes an agent choose to push the chain vs reach for `unstable_settings`. Without it, the rule looks arbitrary. |
| **Compaction discard guidance** ("It is fine to discard: tool-call output bodies, exploratory file reads, resolved error messages") | Append to On Compaction | Without the safe-to-discard list, agents over- or under-preserve. |
| **Persona-unaware exception** (brand-fixed hex in `*Animation.tsx`, `*Celebration.tsx`, with file-level annotation requirement) | Extend persona-unaware bullet in Non-Negotiable Engineering Rules | Without the exception, agents will flag animation/splash components and "fix" them by removing intentional brand colors. |
| **Eval harness Tier labels** ("Tier 1: snapshot prompts (no LLM call)" / "Tier 2: real LLM call + schema validation") + harness location (`apps/api/eval-llm/`) | Extend eval commands in Handy Commands | Tier labels clarify when each command is appropriate; location matters when debugging snapshots. |
| **Change Class Checker commands** (full block: `--run`, `--fast`, `--branch`, pointer to `docs/change-classes.md`) | Extend Handy Commands | Primary "what do I need to validate" tool; omitting from Handy Commands makes it invisible. |
| **E2E Doppler `-c stg` rationale** (comment: "Using default Doppler config (dev) causes TEST_SEED_SECRET mismatch → 403 on seed endpoint"; CLERK_TESTING_TOKEN caveat) | Extend E2E block in Handy Commands | Without the mismatch explanation, every new agent who runs E2E will hit the 403 and waste time. |
| **Security fix red-green pattern reference** (pointer to verification-before-completion → "Regression tests") | Extend security fix bullet in Fix Development Rules | Without the pointer, agents improvise and often skip the "watch it fail after revert" step. |
| **Known Exceptions: rationale framing** ("tracked toward a refactor, or promoted into an explicit rule"; "so new contributors don't take them as precedent") | Extend Known Exceptions intro | Missing half the intent: exceptions should resolve, not accumulate. |

### LEAVE DROPPED

| Topic | Why |
|---|---|
| Snapshot counts (mobile/API/integration test numbers — different between files) | Stale data, auto-drifts; "re-verify with `git ls-files`" guidance is the right replacement |
| `## Read This Before Editing` title vs `## Initialization` | AGENTS.md's "Initialization" is strictly more complete |
| Bold formatting on PR protocol header | Rule preserved; markdown emphasis is style |
| Rollback section exact phrasing | Paraphrase preserves intent |

### PROMOTE ELSEWHERE

| Topic | Where |
|---|---|
| E2E web smoke commands using `C:/Tools/doppler/doppler.exe` (Windows path) | Move to `docs/e2e-setup.md` or the e2e skill — machine-specific, not cross-runtime agent doc |

## Sync mechanism decision

Re-running PR #412's `scripts/sync-agent-docs.mjs` is **not** the right move — it was rolled back for cause. Options to evaluate:

1. **Maintain by hand permanently.** Cheapest. Drift inevitable; rely on review discipline. Defensible if total volume stays small.
2. **Resurrect the script with safer semantics.** E.g., bail if pre-sync CLAUDE.md is larger than the would-be-generated output, or check both files' git history for last-modified asymmetry. More infrastructure to maintain.
3. **Inverted mastering** — make CLAUDE.md the master and AGENTS.md the generated file (with title swap). This matches the current reality (CLAUDE.md has been the actively-edited file historically). Same script shape, opposite direction.
4. **Shape A (template blocks)** — use `<!-- claude-only -->` / `<!-- codex-only -->` markers in a single master if real per-platform divergence emerges.

Recommendation: do the **content merge first** (RECOVER table above), THEN pick a sync strategy when both files are in sync and the divergence rate is known. Don't re-prototype sync without understanding what's diverging.

## Cross-agent memory architecture (broader question)

`.claude/memory/` is Claude Code only — Codex agents working in this repo don't see those rules. The asymmetry that drove the skill-sync work in PR #412 also applies to memory, but no solution exists yet. Open questions in `.claude/memory/project_agent_doc_and_memory_architecture_revisit.md`:

- Should memory be runtime-neutral (e.g. `.agents/memory/` with sync)?
- Should some memory remain Claude-only (sessions, transient context) while operational memory promotes to AGENTS.md or a shared location?
- Does Cortex (Nexus repo, `../../Cortex/`, Supabase pgvector estate-wide memory) belong as the cross-agent memory backbone? It's deployed but not Slack-wired.

This is its own session — separate from the AGENTS.md merge above.

## Suggested execution order

1. Apply RECOVER items to `AGENTS.md` in section-by-section commits via `/commit`. After each section, diff against CLAUDE.md to confirm convergence.
2. Once content matches, decide sync strategy.
3. Separately (different session): tackle the cross-agent memory architecture question.
4. Independently: the `commit` skill drift (`.claude/memory/project_commit_skill_drift.md`).
