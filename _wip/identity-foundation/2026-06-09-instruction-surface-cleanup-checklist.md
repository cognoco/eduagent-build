---
title: Instruction Surface Cleanup Checklist
date: 2026-06-09
status: TEMPORARY WORKING ARTIFACT
scope: .claude/memory, AGENTS.md, CLAUDE.md, skills, commands, hooks, CI, runbooks, and similar agent-facing instruction surfaces
owners: cross-stream QA for Identity Foundation + Harness Hygiene + ZDX productionization
---

# Instruction Surface Cleanup Checklist

**What this is.** Temporary QA checklist for the expanded cleanup of memory,
agent doctrine, and conceptually similar instruction files. It extends the
identity-foundation Phase J memory/doctrine work with the broader Harness
Hygiene and ZDX productionization cleanup scope.

**Role framing.** The reviewing agent acts as cross-stream QA: preserve full
oversight, coordinate identity-foundation, Harness Hygiene, and ZDX/Cosmo
workstreams, prevent operational knowledge loss, and keep pruning aligned with
the current dependency order.

**Current sequencing constraint.**

1. Do not treat identity J1/J2 as the broad cleanup. They were scoped to
   identity-foundation and are already executed.
2. Keep Harness Hygiene order: commit/ZDX homes first, extraction second,
   memory/doctrine pruning last.
3. Treat `WI-387` - memory tidy - as terminal cleanup. Do not run it before the
   extraction target homes exist.
4. Use `/Users/vetinari/nexus/_WIP/zdx-productionization/harness-hygiene-tracker.md`
   as the durable Harness Hygiene entry point. It carries the charter, current
   sequence, coarse status, and the `WI-530` exit-gate work package pointer;
   Cosmo remains authoritative for live per-WI state.

## Governing Defaults

1. **Canon wins.** If a fact belongs in L0-L3, extract or point to that layer.
   Memory and agent doctrine must not become duplicate canon.
2. **Left-ratchet rules are presumed obsolete.** Any rule added to compensate
   for weak CI, slow hooks, commit fragility, agent concurrency, flaky review,
   or pipeline gaps is deleted unless the audit proves it still adds value.
3. **Retain only proven-value rules.** A rule survives only if it has a current
   operating need, a clear owner/home, and a better placement than deletion.
4. **Prefer pointers.** Duplicate concrete wording only when repetition is an
   intentional enforcement mechanism, such as a short rule in `AGENTS.md` that
   prevents frequent agent damage.
5. **Prune and purge aggressively.** Historical interest is not enough to keep
   a file live. If history must be retained, move it out of live startup paths
   or replace it with a pointer to git/Notion/docs.
6. **Extract before deleting.** If a memory/instruction file is the only home
   for valid operational knowledge, extract it to its canonical or operational
   home first.
7. **Runtime parity matters.** Shared doctrine must be visible to both Codex
   and Claude. Runtime-specific details should live in adapters, not divergent
   hand-written rulebooks.
8. **ZDX conformance applies.** Project-level rules are either ZDX-conforming,
   ZDX-extending, or ZDX-deviating. Deviations need explicit annotation or
   removal.
9. **Shared memory architecture is a parallel stream.** Do not solve it inside
   this cleanup. Treat session `019eab75-c5a1-7283-90a0-b98ec7bd94b3` as a
   known embryo/pointer for the separate shared-memory activity.

## Cleanup Categories

| Category | Default disposition | Examples / notes |
|---|---|---|
| Canon duplicate | Repoint or delete | Identity, routing, compliance, pricing, architecture decisions, product rules already captured in ADR/canon/registers |
| Left-ratchet harness rule | Delete unless proven valuable | Rules that push CI/review/commit correctness into memory, `CLAUDE.md`, or manual agent behavior |
| Harness knowledge needing extraction | Extract first, then delete/repoint | Commit classification, stash safety, hook behavior, CI gate semantics |
| L0-L3 unique material | Promote to docs/canon/ADR/runbook/register, then delete/repoint | Durable product/architecture/compliance decisions hiding in memory or doctrine |
| Unique operational footgun | Move to nearest operational home | Expo Router bracket pathspecs, platform-specific command traps, tool-specific failure modes |
| Runtime-specific adapter | Move to runtime-specific skill/adapter | Claude-only slash command syntax, Codex skill-path differences, MCP/tool availability |
| User preference | Keep if current and actionable | No PR unless asked, no OTA unless asked, small-phone device preference |
| Live workstream state | Move to Cosmo/plan/handoff or delete | Temporary branch status, completed epics, stale implementation phase notes |
| Tombstone / archaeology | Purge from live path; archive only if justified | "Resolved", "vaulted", "tracked in Notion", old blocker status |
| Contradiction / drift | Resolve toward current source of truth | `sync-agent-docs.mjs` memory references despite script absence and pre-commit saying doc sync is not productionized |

## Disposition Vocabulary

| Disposition | Meaning |
|---|---|
| DELETE | Remove from live and archive paths; git history is enough |
| ARCHIVE | Move out of live startup paths because dated history still has real value |
| REPOINT | Replace body with a short pointer to canonical/current source |
| PROMOTE | Extract valid unique material to L0-L3 before pruning source |
| MOVE-OP | Move to an operational home such as a skill, runbook, ZDX snippet, hook, or commit primitive |
| KEEP | Retain because it is current, unique, visible to the right agents, and operationally useful |
| SPLIT | Separate durable doctrine from runtime-specific or incident-specific detail |
| VERIFY | Do not decide until current code/docs/Cosmo/Notion state is checked |

## Working Disposition Matrix v0

| Surface / item | Current home | Cleanup category | Provisional action | Blocker / owner |
|---|---|---|---|---|
| AGENTS/CLAUDE divergence register D1-D12 | `AGENTS.md`, `CLAUDE.md`, Harness inventory | Runtime parity cleanup | SPLIT / converge under `WI-386`; AGENTS becomes single source, CLAUDE points/imports | `WI-386`, after `WI-449` L2 placement |
| Output conventions | `AGENTS.md`, `CLAUDE.md` | User preference / possible L1 | KEEP for now as eduagent trial; do not globalize in this pass | Deferred L1 candidate |
| Memory load rule | `AGENTS.md` only | Runtime parity | KEEP and carry into convergence model | `WI-386` |
| Commit invocation rules | `AGENTS.md`, `CLAUDE.md`, commit skills, memory | Harness left-ratchet | MOVE-OP to commit CORE / repo overlay; delete duplicate memory | `WI-447`, `WI-388`, `WI-386` |
| Subagent commit isolation | memory, `AGENTS.md`, `CLAUDE.md` | Harness knowledge needing extraction | MOVE-OP to commit CORE / concurrency policy; keep only short doctrine if needed | `WI-447` or `WI-529` |
| Partial-staging stash rules | memory | Harness knowledge needing extraction | MOVE-OP to commit CORE or commit skill, then delete/repoint memory | `WI-531/N2`, blocks `WI-387` |
| `--keep-index -u` untracked protection | memory | Unique operational footgun / harness | MOVE-OP to commit primitive docs/skill; keep only if still needed after CORE | `WI-531/N2` |
| Expo Router `[id].tsx` pathspec literal rule | memory | Unique operational footgun | MOVE-OP to git/Expo-router operational runbook or commit skill footguns section | `WI-531/N2`; verify best home |
| Pre-commit failure classification | memory | Harness left-ratchet | Presume obsolete; keep only if CORE still needs explicit classification | `WI-447`, `WI-450` |
| `feedback_precommit_typecheck.md` | memory | Tombstone / duplicate rule | DELETE per Harness inventory | micro hygiene or `WI-387` |
| `feedback_no_suppression.md` | memory | Duplicate rule | DELETE per Harness inventory | micro hygiene or `WI-387` |
| `feedback_emulator_issues_doc.md` | memory | Tombstone | DELETE; runbook already authoritative | micro hygiene or `WI-387` |
| E2E runbook pointer | memory + runbook | Unique operational pointer | REPOINT to runbook or keep a minimal pointer only | Verify current runbook path |
| Notion REST query guidance | memory / notion skill | Runtime/tooling operational | MOVE-OP to notion skill; delete memory if skill covers it | notion skill audit |
| Doppler/secret guidance | memory, `AGENTS.md`, global docs | Canon/ops duplicate | REPOINT to current secrets governance / repo rules; verify Infisical vs Doppler split | Secrets governance; current repo still says Doppler |
| `project_sync_script_extension.md` | memory | Contradiction / stale process | VERIFY then likely REPOINT/DELETE; it references absent `sync-agent-docs.mjs` | `WI-386` |
| `project_agent_doc_and_memory_architecture_revisit.md` | memory | Shared memory architecture pointer | REPOINT to shared-memory activity; remove stale script references | Parallel memory stream |
| `project_commit_skill_drift.md` | memory | Harness knowledge | MOVE-OP to `WI-447`/`WI-388` state or commit-skill docs; delete/repoint memory after unification | `WI-447`, `WI-388` |
| `GC1` / `GC6` internal mock ratchets | `CLAUDE.md`, hooks, memory | Left-ratchet / enforcement placement | Presume obsolete as doctrine; keep only current CI/hook source and pointer if value remains | `WI-450`, `WI-452` |
| `safeSend()` / `core-send` rule | `CLAUDE.md` only | Enforcement-placement / possible code canon | VERIFY current code/tests; move to architecture or CI roster if current | `WI-452` |
| Challenge Round mastery policy | `CLAUDE.md` only | Canon duplicate risk | VERIFY current code/docs; promote/repoint if still durable product/architecture rule | Stream 2 / domain docs |
| Profile Shapes section | `CLAUDE.md` only | Current implementation pointer | KEEP until `WI-386`, then either pointer to current implementation docs or include in AGENTS if still needed | `WI-386`; not identity target canon |
| Archived resolved memories | `.claude/memory/_archive` | Archaeology | Purge aggressively unless still cited by live index or needed for a live incident trail | `WI-387` |

## Harness Hygiene Live Status Pointer

As of the tracker dated 2026-06-09:

- `WI-447` - commit CORE primitive - is done and green-proven.
- `WI-450` - pre-commit slim - is delivered on branch `harness-hygiene`, pushed
  but unmerged; Cosmo stage may still be stale.
- Recommended next substrate item is `WI-451` - Nx cache correctness - followed
  by `WI-452` and `WI-388`.
- `WI-531` - extract pipeline-rule memory cluster - is Wave 5 and blocks
  `WI-387`.
- `WI-530` - Harness Hygiene exit-gate work package - gates `WI-533`, the
  eduagent Phase-P precondition.

## Audit Checklist For Each File/Rule

- [ ] Identify the exact claim/rule, not just the file.
- [ ] Classify the claim: canon, operational, preference, workstream state,
      incident rationale, tombstone, or stale contradiction.
- [ ] Locate higher-priority source: code, docs/INDEX, ADR, canon, register,
      runbook, skill, hook, CI, Cosmo item, or current user instruction.
- [ ] If left-ratchet/harness: start from DELETE and require proof to keep.
- [ ] If unique: choose PROMOTE, MOVE-OP, or KEEP with a named owner/home.
- [ ] If retained live: ensure it is visible to the right runtime(s).
- [ ] If duplicated intentionally: document the operational reason.
- [ ] If archived: verify no live index or startup path still loads it as law.
- [ ] If purged: ensure no unique current rule is lost.
- [ ] Record disposition in the matrix before editing files.

## Immediate Next Steps

1. Expand the matrix row-by-row across all active memory files plus
   `AGENTS.md` and `CLAUDE.md`.
2. Mark each row with the blocking work item or `none`.
3. Pull forward only the no-blocker micro-deletes after sign-off or when they
   are bundled into the proper Harness Hygiene pass.
4. Keep `WI-387` last: no broad memory cleanup until extraction rows are done.
