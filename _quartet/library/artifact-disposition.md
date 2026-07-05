# Library — Artifact Disposition (tracking/runtime artifact locations + git disposition)

**What this is.** WI-1257's design deliverable. Formalizes the skeptic-verified researcher brief
already on the WI-1257 Cosmo page ("Design context (refine pass, 2026-07-02)" +
"Option-A Relocation Design Brief") into repo canon: where every Cosmo/Quartet tracking/runtime
artifact lives, which of three classes it belongs to, and — for the Clacks channel slice — which
fix to ship. **This doc specifies an end-state; it does not apply any `.gitignore` change.** No
`.gitignore` edit ships in this WI. Two decisions below are explicitly teed up for the operator,
not resolved here (§4).

**Binding note.** Runtime-neutral. Applies regardless of which harness (Claude Code, Codex, other)
hosts the orchestrator/shepherd/watcher processes that produce these artifacts.

## 1. Taxonomy

Three classes, matching the AC's names and the vocabulary already in use in `clacks-channel.md` /
`findings.md` (no new terms coined):

| Class | Definition | Git treatment |
|---|---|---|
| **durable-tracked** | Framework machinery: code, templates, canon docs, and generated-but-durable state that the framework itself treats as a source of truth across sessions (e.g. a monitor's manifest is read back by the reconcile ritual — losing it isn't cosmetic). | Committed. Lives beside the working state it describes. |
| **durable-but-lane-local** | Live, per-session working state that is real and matters *for the duration of the lane*, but is inherently single-checkout, single-session data that must never enter the shared git history (append-only mailboxes, live locks). This is the class `clacks-channel.md`/`findings.md` already call **"working-tree-only."** | Never committed. The open question is *how* it stays out — untracked-but-not-ignored (today, contested) vs. relocated out of the tracked tree (this doc's recommendation) vs. gitignored-in-place (foreclosed pending an operator ruling — see §4). |
| **ephemeral-ignored** | Pure scratch: regenerated on every run, no cross-session meaning, safe to delete anytime. | Gitignored (or should be — some instances below currently aren't, which is itself a gap this doc surfaces). |

## 2. Enumeration + classification

| Artifact | Current location | Class | Canonical location (this doc) |
|---|---|---|---|
| Clacks channels: `inbox.jsonl`, `outbox.jsonl`, `.perID-seen.json` | `_quartet/working/lanes/<lane>/_state/` | **durable-but-lane-local** | Out of the tracked working tree — see §3 (Option A). Today: untracked-but-**gitignored** in 3/4 lanes (contested — Finding-0, §4). |
| Lane `monitor-manifest.json` | `_quartet/working/lanes/<lane>/_state/monitor-manifest.json` | **durable-tracked** (by intent — `monitor-hygiene.md`: "one manifest per role-instance, beside the working state it tracks") | Stays in `_state/`, tracked. Today: suppressed by the WI-1199 `*.json` glob in 3/4 lanes — a live contradiction, not a design choice (§4). |
| Lane monitor scripts (e.g. `cosmo-perID-monitor.mjs`, `cosmo-ws27-monitor.mjs`) | `_quartet/working/lanes/<lane>/_state/` | **durable-tracked** | As-is — `.mjs` files are code, `.gitignore:164` already carves them out by extension. |
| Program-level `monitor-manifest.json`, `dashboard.html`, `program-roster.md` + their `.template.*` siblings | `_quartet/working/program/` | **durable-tracked** (both live instance and template — templates are framework tooling, live instances are the program's durable record) | As-is. Verified tracked (`git ls-files`): all 7 files in this dir are committed. |
| `.cosmo-run/` (execute.ts `--supervised` scratch, e.g. `workitem.json` fetch artifacts) | repo root, `.cosmo-run/<WI-ID>/` | **ephemeral-ignored** | Should be ignored via the **versioned** `.gitignore`. Currently ignored only via the machine-local `.git/info/exclude` — a portability gap: a fresh clone / different machine has no ignore rule and this becomes untracked-but-not-ignored, the exact hazard class this WI exists to close (§4). |
| `.worktrees/` (root-level — builder/agent worktrees) | repo root | **ephemeral-ignored** | Needs a gitignore rule. Currently has **no ignore rule anywhere** — not in `.gitignore`, not in `.git/info/exclude`. Ungoverned today (§4). |
| `.claude/worktrees/` (agent-session worktrees — distinct dir from root `.worktrees/`; this WI's own execution runs from one) | `.claude/worktrees/<session>/` | **ephemeral-ignored** | Same portability gap as `.cosmo-run/`: ignored only via local `.git/info/exclude` (`**/.claude/worktrees/`), not the versioned `.gitignore`. |
| `_quartet/working/program/review-watcher-state/` | referenced only in `review-watcher.ts`'s `COSMO_WATCH_OUTDIR` doc-comment as an example alternate path | **ephemeral-ignored**, if ever instantiated | **Resolved, not live** — verified this path does not exist in a fresh checkout and is not tracked. Superseded by WI-1417: `review-watcher.ts`'s actual default `COSMO_WATCH_OUTDIR` is `${repo}/.cosmo-watch`, which is now correctly gitignored (`.gitignore:171`, landed today in `d4abd6e` "WI-1228 WI-1417 Codexify Quartet runtime bindings"). The header comment's "point at `review-watcher-state/`, gitignore it" sentence is stale-but-harmless — nothing points there. No action needed; noted for completeness since the WI description named it explicitly. |
| `.cosmo-watch/` (WI-1417 watcher runtime instances: logs, review outputs, de-dupe state, per-launch config) | repo root | **ephemeral-ignored** | Already correct. `.gitignore:171`, landed today. Closes the "loose end" the WI-1257 researcher brief flagged (brief was written before this landed). |
| Stray same-class scratch (e.g. `.tmp-wi<NN>-<step>.json` QA/review-skill working files observed at repo root) | repo root | **ephemeral-ignored** | Same gap as `.cosmo-run/` — illustrative, not separately designed here; covered by the general "codify scratch patterns in the versioned `.gitignore`" recommendation in §4. |

## 3. Clacks-channel slice — recommendation

Per the researcher brief's own analysis (full detail on the WI-1257 page; not re-derived here).

**Recommendation: Option A, mechanic A-2** (literal out-of-repo path, e.g.
`%LOCALAPPDATA%\Nexus\quartet-runtime\<lane>\_state\` / `~/.local/state/nexus-quartet/<lane>/_state/`),
via one indirection point (`QUARTET_LANE_STATE_ROOT` env/config key read by lane provisioning, the
per-lane `.mjs` scripts, and the L1 liveness checker's invocation site — never a hardcoded relative
path). A-2 over A-1 because:

- A-2 needs **no fresh operator sign-off** — it makes no `.gitignore` change at all, so it cannot
  re-trip either reading of the 06-28 NO (§4).
- A-1 (`_runtime/` sibling, `_dev/`-style) is the lower-churn fallback *only if* the operator
  confirms the 06-28 NO was specifically about the mixed-tracked/untracked `_state/` dir, not
  gitignoring these files at all — that answer isn't on record (`findings.md:77` doesn't say why).
  Do not presume it; ask it if A-2's churn proves too costly (§4, teed-up question 2).

**Loss-vector coverage** (git-semantics argument, per the brief; fixture re-run against WI-1245
still owed before calling this closed — flagged as a caveat, not a given):
- **(a) `git pull --no-rebase` conflict-marker corruption** — neutralized. A never-tracked path
  (A-2) or gitignored-and-never-tracked path (A-1) is invisible to merge machinery.
- **(b) `git stash -u` stranding on shared `refs/stash`** — neutralized. `stash -u` only sweeps
  untracked-but-not-ignored files; A-2 is unconditionally safe (outside any repo); A-1 is safe
  because nothing in this repo's guidance invokes `stash -a`.
- **(c) `git add _state/` staging sweep** — neutralized by construction for both mechanics: the
  channel files no longer live under any path a lane-scoped or blanket `add` would traverse.

**Migration path** (summary — full detail on the WI-1257 page §4): land the indirection point
first as a no-op (default = today's path); per-lane one-time cutover (4 lanes today) with a
diff-check for concurrent appends; re-arm both Clacks Monitors per the existing `monitor-hygiene.md`
reconcile ritual; update `pr-cleanup/cosmo-perID-monitor.mjs`'s `STATE=` constant and the WI-1313 L1
liveness checker's invocation site in the same cutover commit (missing the latter reintroduces the
exact "silent stall nobody is watching for" failure the checker exists to catch); leave the old
files in place, emptied, for one operating cycle as a tripwire.

## 4. Finding-0 — verified, teed-up operator decisions (NOT resolved here)

Verified directly on this worktree (fresh off `origin/main`, confirmed via `git merge-base
--is-ancestor`), replacing the brief's hedged "flagged-not-proven" language with confirmed facts:

- `.gitignore:165-166` on `origin/main` carries WI-1199's rules
  `_quartet/working/lanes/*/_state/*.jsonl` and `*.json` — added by commit `0d89ad2`
  ("chore(quartet): master Nexus-root _state gitignore … (WI-1199) (#31)"), merged 2026-07-03,
  confirmed ancestor of `origin/main` HEAD, never reverted.
- **Effect, verified via `git ls-files` / fresh-worktree contents:** in a clean checkout,
  `pr-cleanup/_state/` contains only the 2 tracked `.mjs` scripts + `monitor-manifest.json`
  (unaffected — it was already tracked before the rule landed); the other 3 live lanes
  (`cosmo-improvements`, `nex-zdx-improvements`, `quartet-mvp`) have **no `_state/` contents at all**
  in a fresh checkout — every file the WI-1199 glob matches, including their `monitor-manifest.json`,
  was never committed and is now suppressed from git.
- **This is a doc-vs-doc contradiction with concrete harm, not just a governance technicality.**
  The WI-1199 rule's own comment (`.gitignore:162-164`) asserts *"Clacks mailboxes … and monitor
  manifests are live, per-session working state, not durable framework artifacts."* This directly
  contradicts §2's classification and `monitor-hygiene.md`'s own canon: *"[lane manifest] beside
  the working state it tracks"* — i.e. `monitor-hygiene.md` treats the lane manifest as
  **durable-tracked**, the same class as the program-level manifest (§2, confirmed tracked). The
  `*.json` half of the WI-1199 glob is over-broad relative to what the rest of the framework's own
  canon says about that file. Any end-state must narrow the rule so `monitor-manifest.json` stays
  tracked — that narrowing is what "rationalizing the premature rules" (AC4) concretely means here.
- **This also contradicts the standing operator-NO** on gitignoring `_state/`
  (`_quartet/findings.md` F5, citing the 2026-06-28 precedent: *"operator previously ruled NO on
  gitignoring `_state/`, 06-28 — so [pathspec-staging discipline] is the live path"*). Both the
  commit body and PR #31 body self-justify by name-checking the *same* 06-28 precedent for the
  opposite conclusion. Neither this doc nor its author has write authority to adjudicate that
  contradiction; it is surfaced, not decided.

**Teed-up operator decisions (this doc does not choose):**

1. **Revert-vs-fold.** Revert `.gitignore:165-166` now (restoring "untracked-but-NOT-gitignored,
   disciplined pathspec staging" per F5, until Option A lands) — **or** treat WI-1199 as having
   already delivered part of Option B's shape and fold its removal into Option A's landing commit
   once A-2 (or A-1) ships. Either way, current repo state and `clacks-channel.md` disagree right
   now, independent of which mechanic ships (§3).
2. **A-1 viability, only if A-2's churn proves too costly later:** does the 06-28 NO extend to a
   *new*, purpose-built `_runtime/`-style sibling holding the same 3 channel files, or was the
   objection specific to the mixed tracked/untracked `_state/` dir? `findings.md:77` doesn't say.
   Not answering this does not block shipping A-2, which needs no such ruling.

## 5. AC4 — specified end-state (NOT applied)

The single reviewed `.gitignore` change this design specifies as the target end-state, **contingent
on operator decision 1 above** (revert-vs-fold) and on Option A actually landing. Stated here so a
future single PR can execute it in one reviewed diff — no piecemeal edits, and **none of this ships
in WI-1257**:

- **Remove** `_quartet/working/lanes/*/_state/*.jsonl` and `_quartet/working/lanes/*/_state/*.json`
  (`.gitignore:165-166`) once Option A relocates the 3 channel files out of `_state/` — nothing under
  `_state/` needs a gitignore rule anymore; monitor manifests and monitor scripts stay tracked as
  they already are today, resolving the doc-vs-doc contradiction in §4 by construction (narrowing
  by *elimination* of the over-broad glob, not by hand-carving a filename list).
  - If operator decision 1 resolves to "fold into Option A's landing," this removal is literally
    part of that landing commit.
  - If operator decision 1 resolves to "revert now," this removal happens immediately,
    independent of Option A's timeline, restoring F5's pathspec-staging-discipline interim state.
- **Add**, in the same reviewed change, ignore rules for the two governance-gap ephemeral-ignored
  instances found in §2 that currently rely on machine-local excludes only:
  - `.cosmo-run/` (currently `.git/info/exclude` only — not portable to a fresh clone)
  - `.worktrees/` (currently no ignore rule anywhere)
  - `.claude/worktrees/` is a candidate for the same treatment (same gap, same local-exclude-only
    mechanism) but is out of this WI's named ground-truth list; note only, don't require.
- **No change** to `.cosmo-watch/` (`.gitignore:171`) — already correct, landed today.

This section specifies the diff's *shape*; it is not itself the change. Applying it is a deferred
follow-up gated on §4's decisions.

## 6. WI-1202 reconciliation (AC5)

Already satisfied, restated briefly: WI-1202 ("cloud working-state substrate" spike) is Closed/Done
(`plans/WI-1202-offline-status-tracking-spike.md`, commit `e098171`). Its recommendation — mirror
`execution-tracker.md` narrative status to a per-lane Notion sub-page at checkpoint cadence, keep
Clacks and run-scratch local — is about narrative-status *cloud visibility*, not Clacks
git-disposition. No conflict with this design's scope. (WI-1202's follow-up, WI-1263, left the
`_state/*.jsonl` gitignore question open; this WI — specifically §3/§4 — is that next step for the
Clacks-channel slice of it.)

## 7. `clacks-channel.md` staleness — verified

`_quartet/library/clacks-channel.md` (current, on this worktree) still reads, unchanged:

> "`inbox.jsonl` / `outbox.jsonl` (and the sibling `.perID-seen.json`) are **untracked-but-NOT-gitignored**"

and

> "this doc makes **no `.gitignore` change**."

Both are **stale** against the live `.gitignore` (confirmed: `.gitignore:165-166`, WI-1199, landed
2026-07-03, predates this sentence being read today). The most recent touch to this file
(`1273a96`, PR #58 / WP-1519 / WI-1230, landed 2026-07-04) added the envelope-split-decision
section only — it did not touch the "Working-tree-only" paragraph and did not catch or correct this
drift. **This doc's own landing (whenever §4/§5 execute) must update `clacks-channel.md`'s
"Working-tree-only" paragraph** to reflect whichever end-state actually ships — noted here so the
executing commit doesn't repeat the same miss.

## 8. Self-review pass (adversarial)

- **Classification complete?** All 6 ground-truth bullets from the WI dispatch covered, plus 2
  additional live instances found during verification (`.git/info/exclude`-only ignores for
  `.cosmo-run/` and `.claude/worktrees/`; the ungoverned root `.worktrees/`) and one illustrative
  stray class (`.tmp-wi*.json`). Program-level manifest/dashboard/roster + templates covered.
  Not separately re-enumerated: every individual `.tmp-*` file instance (same class, not
  distinct machinery) — acceptable per AC1's "artifact" framing, not "every file."
- **AC4 specify-not-apply?** §5 is phrased as a contingent target diff, gated on §4's two
  decisions; no `.gitignore` file in this repo was touched by this WI (verified below).
- **Finding-0 surfaced-not-resolved?** §4 states two explicit open questions with no doc-authored
  answer; §3's Option-A recommendation stands independently of how §4 resolves (A-2 needs no
  `.gitignore` change either way).
- **Any live instance missed?** `.claude/worktrees/` was not in the WI's named list but surfaced
  during verification as the same-class gap as `.cosmo-run/`; included at reduced prominence (§2
  table, §5 "note only, don't require") rather than promoted to a full recommendation, since it
  wasn't part of the dispatched scope.
