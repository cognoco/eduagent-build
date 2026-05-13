# Handover — PR-25 / PR-27 / PR-29 (Cluster C9 follow-on)

**For**: agent picking up the remaining C9 cluster work (Cat-1 obsolete files, 8 inbound-link conflicts, folder-level archive moves).

**From**: session that closed PR-15d, PR-20, PR-22, PR-23, PR-26, PR-28 on 2026-05-12/13.

**Date**: 2026-05-13.

---

## TL;DR

Six cleanup-plan PRs closed last session — they shared file scope with PR-25/27/29 (cleanup-plan rows, punchlist, triage doc, archive subdirectories, memory entries). Read this before touching any of those files: a lot of the work the triage doc described as "to do" has already been done by prior cleanup passes, and the closure notes already on the plan rows tell that story.

**Open PR with last session's work**: [#237 `cleanup: close PR-15d, PR-20, PR-22, PR-23, PR-26, PR-28 + RLS Phase 0+1 archival`](https://github.com/cognoco/eduagent-build/pull/237) (against `main`, branch `cleanup/2026-05-13-session`). Land or rebase against it; do not duplicate its closure edits.

**Working tree**: `/Users/vetinari/_dev/eduagent-build` on branch `consistency2`. The Archon worktree (`~/.archon/workspaces/cognoco/eduagent-build/worktrees/archon/thread-*`) is **not** where to commit — `/commit` skill picks cwd from the invoking process, and committing from a worktree lands on the worktree's private branch instead of `consistency2`. Fall back to `git -C /Users/vetinari/_dev/eduagent-build …` for any commit that's not happening from `_dev/eduagent-build`'s own cwd.

---

## Scope of your three PRs

### PR-25 — C9 P1 — Process 25 Cat 1 obsolete files

Source: `docs/audit/2026-04-30-cleanup-triage.md` Category 1 (lines 46-88).

Cat-1 splits into:
- **1A** Delete (8 files)
- **1B** Archive (17 files)

**Reality check before you start**: when this session verified the parallel Cat-2 bucket, we found that prior cleanup passes had silently done most of the work — files were already in `_archive/` paths. Same pattern is likely true for Cat-1. Verify each file's current state before assuming it needs the triage-prescribed action.

**Quick recon command** (lists which Cat-1 paths still need action vs. are already moved/deleted):

```
cd /Users/vetinari/_dev/eduagent-build && {
  awk '/^## Category 1/,/^## Category 2/' docs/audit/2026-04-30-cleanup-triage.md \
    | rg -o '`[^`]+\.(md|html|svg|yaml|json)`' | sort -u | tr -d '`' \
    | while read -r p; do
      bn="$(basename "$p")"
      live="$p"; [[ "$p" == *.md && "$p" != *"/"* ]] && live=".claude/memory/$p"
      if [[ -f "$live" ]]; then echo "STILL-AT-SRC  $p"
      else
        found=$(find . -path ./node_modules -prune -o -name "$bn" -print 2>/dev/null | grep -v node_modules | head -1)
        [[ -n "$found" ]] && echo "ALREADY-MOVED $p → $found" || echo "GONE          $p"
      fi
    done
}
```

When this session ran the same check on 2026-05-13:
- ~22 of 25 Cat-1 files already in `_archive/` or `/done/` paths.
- 3 still at original location: `docs/plans/2026-04-07-epic-17-phase-a-voice-input_NS.md`, `docs/plans/order.md` (gone elsewhere?), `docs/specs/2026-04-14-status.md` (gone?). Re-run the recon — state may shift.
- A few never existed in this branch at all (e.g. `P1-plan.md`, `architecture-decisions.md`, `governance/index.json`, `memories/adopted-patterns.md`, `tech-stack.md`, `docs/flows/web-flow-bug-findings.md`). Triage doc may have been written against a different historical state.

**Triage notes plus inbound-link warning**: section 1B lists per-file inbound-link references. PR-25 needs to update those when it moves files, or coordinate with PR-27 (see Cross-coupling below).

### PR-27 — C9 P3 — 8 inbound-link conflicts (co-land with PR-17)

Source: triage doc "Conflicts — co-changes required during execution" section (line ~24). Eight specific link-update sites span C7 (`docs/architecture.md`, `docs/PRD.md`, `docs/project_context.md`, etc.) and C9 archive paths.

**Note: PR-23's brand sweep already updated EduAgent → MentoMate in many of those exact files.** Re-verify each of the 8 conflicts is still live before edits — some may have been resolved incidentally by the brand sweep or by archive moves that PR-25 will land.

Co-coupling: `**Co-land with PR-17.**` (per the cleanup-plan row notes). PR-17 is in flight elsewhere; check its state before assuming you can ship PR-27 alone.

### PR-29 — C9 P5 — Folder-level archive moves

Move:
- `docs/specs/done/` → `docs/_archive/specs/done/`
- `docs/plans/done/` → `docs/_archive/plans/done/`

**Both source AND target directories currently exist.** `docs/_archive/specs/done/` and `docs/_archive/plans/done/` were created by prior individual file moves (e.g., several Cat-2 plan files moved into them). The wholesale folder-move you need to do is more of a `mv` + `rmdir` merge, not a fresh copy:

```
# Verify source/target state first
ls -d docs/specs/done docs/plans/done docs/_archive/specs/done docs/_archive/plans/done
# All 4 currently exist; merge sources INTO targets.
```

**Inbound-link grep** (Definition of Done from the plan row):

```
rg 'docs/(specs|plans)/done' docs \
  --glob '!docs/_archive/**' \
  --glob '!docs/audit/**' \
  --glob '!docs/specs/done/**' \
  --glob '!docs/plans/done/**'
```

After your move, this grep must return zero hits in active docs.

**Governance**: `.archon/governance-constraints.md` §8 — verify no CI workflow, deploy script, or skill references the old `docs/specs/done/` or `docs/plans/done/` paths. Same kind of cross-cutting blast radius as PR-23's i18n staleness hook.

---

## Cross-coupling between your three PRs

From `docs/audit/cleanup-plan.md` Dependencies section:

- **PR-17 ↔ PR-27**: inbound-link conflicts must co-land with C7 doc reconciliation.
- **PR-25 ↔ PR-27**: Cat-1 archive moves must co-land with inbound-link fixes to avoid broken references.
- **PR-25 (or PR-29) ↔ PR-27**: PR-29's folder moves create new archive paths that PR-27's inbound-link fixes target. Co-land or sequence the three together to avoid broken references.

`docs/audit/pr-dispatch-graph.html` (in the repo, but currently a pre-existing dirty file — see "Pitfalls" below) describes the recommended merge order: **PR-26 → PR-25 → PR-29 → PR-27 → PR-17**. PR-26 is already closed (last session). So your effective order is **PR-25 → PR-29 → PR-27 → PR-17**.

---

## What this session closed (last 8 commits on `consistency2` between merge-base `a876137d` and HEAD `522e5e50`)

| SHA | Subject |
|---|---|
| `c8095591` | plan(audit): close PR-20 no-op (`AUDIT-MIGRATIONS-3-SWEEP`) |
| `8dd7b2da` | plan(audit): close PR-22 misframed (`AUDIT-SKILLS-2`) + new `_bmad/README.md` |
| `849b88b2` | docs(audit): close PR-23 brand sweep `EduAgent` → `MentoMate` (30 files) |
| `2327ef84` | chore: PR-26 related changes (user-applied — overlaps slightly with our `fbbea19b` MEMORY.md edit) |
| `dfd14266` | docs(memory): close 2B — clean up dangling refs |
| `3d9a7e4e` | chore(git): merge origin consistency2 (no content; merge marker) |
| `1d33f6dd` | plan(audit): close PR-26 (C9 P2 done 2026-05-12); close 2D rows 2-4 |
| `db12f4c6` | plan(rls): re-apply RLS Phase 0+1 plan move follow-ups (rescue of orphan `c26883a3`) |
| `522e5e50` | plan(audit): close PR-28 (C9 P4 done 2026-05-13) |

Plus `b0d1ee5d` (PR-15d closure) — landed on `main` separately before this session via another path; not in `consistency2` lineage but its effect is present in `cleanup-plan.md`.

PR #237 contains the same set, cherry-picked clean off `origin/main`.

### File scope of last session's closures (for collision-avoidance)

- `docs/audit/cleanup-plan.md` — P3d, C8 P3, C8 P5, C8 P6, C9 P2, C9 P4 rows updated; "Human involvement required" bullets struck through for PR-20, PR-22, PR-23, PR-26
- `docs/audit/2026-05-02-artefact-consistency-punchlist.md` — `AUDIT-SKILLS-2` and `AUDIT-EXTREFS-2` closed; new `AUDIT-TS6307-EVAL-LLM-FLOWS`, `AUDIT-EXTREFS-2-RESIDUAL`, `AUDIT-RLS-1.3-VERIFY` entries added
- `docs/audit/2026-04-30-cleanup-triage.md` — 2D rows 1-4 updated with strike-through closure notes
- `.claude/memory/MEMORY.md` — "Active Work (2026-05-04)" rotting section replaced with stable "Consistency Cleanup" pointer
- `.claude/memory/project_schema_drift_pattern.md` — new "Predecessor notes" section
- `docs/audit/claude-optimization/memory-overlap-flags.md` — ghost reference removed
- `_bmad/README.md` — new (documents shim → `_bmad/` source architecture)
- `docs/plans/2026-04-15-S06-rls-phase-0-1-preparatory.md` → `docs/plans/done/2026-04-15-S06-rls-phase-0-1-preparatory.md` (rename)
- `docs/plans/2026-04-15-S06-rls-phase-2-4-enforcement.md` — Prerequisite line updated to `done/` path
- `packages/database/src/{client,rls.test,rls.integration.test}.ts` — three `Ref:` comments updated to `done/` path
- 30 files swept for `EduAgent` → `MentoMate` (PR-23) — includes most active docs under `docs/**`

**If your work touches any of the above, expect the file to already contain closure notes from last session. Strikethrough/append patterns are documented under "Conventions" below.**

---

## Punchlist deltas (still GREEN — informational, not blocking)

Added by last session:

- **AUDIT-TS6307-EVAL-LLM-FLOWS** — cosmetic TS6307 noise on `apps/api/eval-llm/flows/*` includes. Fix only if it ever becomes annoying; extend `apps/api/tsconfig.spec.json` `include` to cover `eval-llm/**` and re-grep.
- **AUDIT-EXTREFS-2-RESIDUAL** — 8 out-of-scope files still contain `EduAgent` brand strings (not in PR-23's scope): `AGENTS.md`, `scripts/embedding-benchmark.ts`, `apps/mobile/e2e/README.md`, `design_handoff_ui_improvements/{UI improvements.html,README.md}`, `docs/audit/pr-dispatch-graph.html`, `docs/visual-artefacts/{data/atlas-data.js,cleanup-plan-dependency-flow.html}`. Not user-facing brand surfaces.
- **AUDIT-RLS-1.3-VERIFY** — Phase 1.3 of `docs/plans/done/2026-04-15-S06-rls-phase-0-1-preparatory.md` was never re-run after the PR #126 driver swap. Run `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'` against staging and prod, confirm all RLS-enabled tables show `t`, document inline.

---

## Conventions to follow (from last session's commits)

### Plan-row closure pattern

```
| <Phase> | <Description> | done (YYYY-MM-DD) | | **<PR>** | <Files-claimed> | <original notes> **Closed YYYY-MM-DD:** <closure narrative>. |
```

- Status cell: `todo` → `done (YYYY-MM-DD)` (or `done (no-op YYYY-MM-DD)` or `done (misframed YYYY-MM-DD)`)
- Notes cell: append closure narrative to end, before closing `|`, preserve any escaped pipes (`\|`)
- The row must remain a single line (multi-line breaks `cleanup-extract.sh`)

### Human-involvement bullet pattern (cleanup-plan.md, "Human involvement required" section)

```
- **PR-XX** (CN PM): ~~<original prose>~~ — **closed YYYY-MM-DD <as descriptor>:** <one-line closure summary>.
```

### Triage-doc row closure pattern (used for 2D rows last session)

```
| ~~`<old path>`~~ → `<new path>` | <updated rationale> | **DONE — <action> (YYYY-MM-DD).** |
```

### Punchlist bullet pattern

```
- **AUDIT-<KIND>** (synthesized YYYY-MM-DD) <one-line description>.
  - Severity: GREEN|YELLOW|RED (<rationale>); Effort: ~<duration>
  - <what's needed / fix when annoying>
```

### Sanity-check command after editing `cleanup-plan.md` rows

```
bash .archon/scripts/cleanup-extract.sh <PR-id> /tmp/verify-<pr>
# Must exit 0 with `Phases: 1 (...)`. If it errors, you broke the row's
# pipe structure — fix before committing.
```

---

## Pitfalls (learned the hard way last session)

### Worktree cwd resets between `Bash` calls in the harness
The shell cwd resets to the harness's working directory between every `Bash` invocation. **Always prefix with `cd /Users/vetinari/_dev/eduagent-build && …`** or use `git -C /Users/vetinari/_dev/eduagent-build …`. Relative paths land in the wrong tree.

### `/commit` skill picks cwd from the invoking process
The `/commit` skill is a subagent (`context: fork`) that inherits cwd from the launching agent. If you launch it from the Archon worktree (`~/.archon/workspaces/cognoco/eduagent-build/worktrees/archon/thread-*`), the commit lands on `archon/thread-<uuid>`, NOT on `consistency2`. We had orphan commits on the Archon worktree's private branch as a result. Two safe paths:
- Spawn a subagent whose Bash session starts with `cd /Users/vetinari/_dev/eduagent-build`, then invoke `/commit` from inside that subagent (its child process inherits the right cwd).
- Fall back to direct `git -C /Users/vetinari/_dev/eduagent-build add …` + `git -C … commit …`. Husky pre-commit hooks (`tsc --build`, lint-staged, surgical tests, i18n staleness) still run on every `git commit`, so this is safe.

### Drizzle-kit content-hash sensitivity (do NOT edit applied migrations)
`drizzle-kit ^0.31.0` hashes SQL file content and stores those hashes in the `__drizzle_migrations` table at apply-time. **Editing any already-applied `apps/api/drizzle/*.sql` file (even a comment-only change) changes the file hash, which will make the next `drizzle-kit migrate` against staging/prod try to re-apply the migration.** The dangling SQL comment in `apps/api/drizzle/0058_memory_facts_enable_rls.sql` line 4 references a ghost file (`project_neon_transaction_facts.md`) — we left it intact for this reason. If you encounter similar in your work, leave the SQL file alone and add a breadcrumb elsewhere.

### i18n locale staleness pre-commit hook
When `apps/mobile/src/i18n/locales/en.json` is staged, the husky pre-commit hook demands all other locales (`de.json`, `es.json`, `nb.json`, `pt.json`, `pl.json`, `ja.json`) be staged in the same commit. PR-23 had to sweep all 7 locales together. If your archive moves or link fixes ever touch any locale key surface, mind the hook.

### `docs/audit/pr-dispatch-graph.html` is pre-existing dirty
This file has been showing as `M` in `git status` for the entire session, never committed. **Leave it alone.** If you commit broadly with `git add -A`, you'll accidentally include it. Stage files explicitly. The `/commit` skill stages explicitly by file so it handles this correctly.

### Stale "summary" lines in `cleanup-plan.md` line ~183
The "Independently startable" list at `cleanup-plan.md:183` is maintained inconsistently. It currently reads:
```
PR-11, PR-12, PR-14, PR-15, PR-16, ~~PR-18~~ (done → #231), PR-19, PR-20, PR-21, PR-22, PR-23, PR-24, PR-26, PR-28, PR-29.
```
PR-20, PR-22, PR-23, PR-26, PR-28 are all closed but not struck through on this line. If you want to keep this line in sync as you close PR-25/27/29, do so — but expect the line is informational, not authoritative. Authoritative state lives in the C-cluster row tables.

### Filename artifact from PR-23 brand sweep
`docs/audit/2026-04-30-cleanup-triage.md` was rewritten by PR-23 to replace `EduAgent` → `MentoMate` in its prose, **including in row 3B which references `docs/analysis/product-brief-EduAgent-2025-12-11.md`** — that row now says `product-brief-MentoMate-...` but the file is still named `product-brief-EduAgent-...` (we deliberately didn't rename per Cat-3 keep notes — 3 inbound links). When you read the triage doc, treat file-path references in body prose as possibly-stale; the canonical filename lives in `docs/analysis/`.

### Lost-commit recovery pattern
During this session, a rebase + a merge unwound two of our commits (`fbbea19b` MEMORY.md + `c26883a3` RLS plan move). Their content survived in the working tree, but the commits themselves went orphan. **Pattern**: if you find unexplained uncommitted modifications matching content you remember committing, check `git reflog` and `git log --all --oneline | head` for the orphan SHA. The content is preserved; just needs a fresh commit. We rescued `c26883a3`'s effects in `db12f4c6`.

---

## Recommended sequence

Per the dependency notes:

1. **PR-25 first** (Cat-1 file archive/delete). Most files already in `_archive/`; your job is mostly to walk the per-file recommendations in the triage doc, take a stance on the ~3 that aren't yet moved, and update the plan row + the triage 1A/1B sections.
2. **PR-29 second** (folder-level archive moves). Targets `docs/specs/done/` and `docs/plans/done/`. The target archive directories already exist with content — this is a merge-move, not a fresh-move. Update inbound links per the `rg` grep in the plan row's Definition of Done.
3. **PR-27 third** (8 inbound-link conflicts). By this point, most inbound-link breakage from PR-25 and PR-29's moves should be your scope. Verify nothing PR-23 already fixed is double-handled. Co-land with PR-17 (still in flight elsewhere).

For each: read its `cleanup-plan.md` row carefully, run the recon command, and follow the closure-pattern conventions above.

---

## References

- **Cleanup plan**: `docs/audit/cleanup-plan.md` (single source of truth per CLAUDE.md). PR-25/27/29 rows are at line ~391 (C9 cluster).
- **Triage doc**: `docs/audit/2026-04-30-cleanup-triage.md`. Cat-1 at lines 46-88, Cat-3 at lines 145-198 (Cat-2 verified done last session). Note: rows may show pre-PR-23 file naming in some places.
- **Punchlist**: `docs/audit/2026-05-02-artefact-consistency-punchlist.md`. New entries from last session at the Track C section.
- **Last session's PR**: [#237](https://github.com/cognoco/eduagent-build/pull/237).
- **PR dispatch graph**: `docs/audit/pr-dispatch-graph.html` (visual; the merge-order recommendation cited above lives here).
- **CLAUDE.md** "Git Commits" section: always use `/commit` (with the worktree-cwd caveat noted above).
- **`_bmad/README.md`**: clarifies that the `bmad:` skills visible in your session are the same `.claude/commands/bmad/*.md` shim files — no separate plugin exists.

---

*Generated 2026-05-13 by the agent that closed PR-15d/20/22/23/26/28. Update this file in place as you close PR-25/27/29 so the next handover has accurate state.*
