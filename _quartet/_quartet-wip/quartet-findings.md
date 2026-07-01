# Quartet Findings — machinery

Improvement candidates for the **reusable `_quartet/` system** (Brain `roles/`, Library `library/`,
`clacks/`, `planning-rules.md`). This is the hand-off surface for the ZDX/Quartet stream: at critical
mass the operator converts these to work items against the machinery's owner. **Scope rule:** only
gaps in the *reusable* system live here; this-deployment state/mess lives in `repo-findings.md`.

**The common shape.** Nearly every entry is one defect: **the reusable Brain over-commits to
deployment specifics** — it hard-names instance paths/ids and assumes a single-owner, finite-lane,
fully-hydrated world. **Fix pattern: refer to _bindings_, not _instances_** — the program layer
(kickoff) supplies roster location, monitor identity, lane scope, hook home.

**Open machinery set:** F1/F16 (literal roster path), F2/F6 (anchor read-in-full + unbounded),
F3 (dated-filename convention), F5 (shared-tree commit scope), F7 (findings surface undiscoverable),
F10 (no standing-lane lifecycle), F11 (monitor output-file hygiene), F17 (monitor id un-keepable
across jobs), F18 (no scoped/observer boot), F13-residue (no home for the session-start hook).

**Validated (held under dogfood — do NOT "fix"):** Brain is orient-sufficient off `roles/` +
`planning-rules.md` alone; four-roles / altitude invariants / 8-step lane-activation are legible as
written; the hook's **channel-tail reconciliation** is the best single design element (makes a stale
anchor non-fatal); the `working/README.md` snapshot-staleness warning works; Relentless Delegation
kept orchestrator context lean exactly as mandated.

---

### F1 / F16 — The reusable Brain hard-names a literal working-state path (headline)
`orchestrator-protocol.md` (Orient-on-resume **and** the 🔴 mandatory re-read block) and
`planning-rules.md` (Document map) all name a **literal** `working/program/program-roster.md` as a
required read. The generic, portable Brain cannot carry the one per-instance fact — *where this
program's working state actually lives* — so today it's closed only by the hook's injected binding
line, and a non-hooked / greenfield launch reaches for a blank template by construction. **Fix:** make
the working-state *location* a binding the **orchestrator kickoff** owns (it's per-instance anyway);
the protocol/planning-rules refer to "the roster (location = deployment binding)", never a path; the
hook stays the mechanism for hooked resumes. *(F1 = 06-29 orient; F16 = re-confirmed on the 07-01 cold
boot — same defect, merged.)*

### F2 / F6 — "Read the anchor IN FULL" + unbounded anchor growth
Orient step 1 mandates reading the world-state anchor **in full**; the anchor is
newest-session-prepended and accretes without bound (~115k tokens on 06-29 → ~297 KB on 06-30, ~2.5×
in a day). That directly fights the lean-context mandate the protocol opens with, and the machinery has
no anchor-hygiene / rotation discipline. **Fix:** current-state-at-top + archive prior session blocks
to a sibling, or a structured roll-up the hook tails (as it already does for channels) instead of
"read in full."

### F3 — Dated handoff filename is a legibility trap (minor)
The anchor is updated in place but its filename carries a fixed date; mtime-based `ls -t` picks the
right file, but the stale-looking name invites distrust. **Fix:** rename on refresh, or drop the date
from the handoff filename (a convention for the artifact).

### F5 — No shared-tree commit-scope guidance
The Quartet's model is multiple concurrent role-sessions sharing one substrate/checkout. A commit flow
that stages "what's dirty" instead of "what THIS session authored" is structurally unsafe there — seen
live, a dirty-sweep staged 29 files from a co-active session (incl. working-tree-only `_state/` +
hook files) before it was caught. **Fix:** Quartet commit guidance mandates explicit-pathspec staging
(never `add -A` / dirty-sweep) for any shared-tree session; or per-session worktrees so the ambiguity
never arises. (`_state/` + the hook dir are working-tree-only by design — never staged by anyone;
operator ruled NO on gitignoring `_state/`, 06-28.)

### F7 — The dogfood findings surface is undiscoverable
Nothing in orient-on-resume, the protocol, or README bootstrap tells a fresh session to read/append
the findings log — so two independent actors nearly created a *second* findings file, fragmenting the
very signal it exists to consolidate. A capture surface no protocol points at fragments by
construction. **Fix:** list the findings files in README layout + the orient-on-resume read list
(and/or the orchestrator kickoff).

### F10 — Lifecycle model has no steady-state for a standing (non-graduating) lane
planning-rules describes start → active → graduated/parked/killed, and §2.8's close ceremony assumes
*finite* work. A **standing lane** (Operations / Bug Lane) never graduates, so §2.8 never fires — the
standard defines no steady-state management for it (checkpoint cadence, relocation window, how it
differs from a finite Initiative). **Fix:** add a standing-lane lifecycle, incl. an operator-gated
quiescent-window relocation (its channels/monitors are live, so mid-flight moves are unsafe).

### F11 — monitor-hygiene governs watchers but not their stale output files
The spec reconciles *watchers* and never addresses the derived output/cache files a watcher writes into
`_state/` (TTL, clear-on-re-arm, or mark-as-derived). A reader can mistake a stale output file for
current truth. **Fix:** add an output-file discipline to monitor-hygiene.

### F17 — Reconcile ritual can't "keep" a monitor across a job boundary
monitor-hygiene's reconcile has a "keep — refresh its task-id" branch, but Monitor watches are
**job-scoped**: a fresh orchestrator in a new job sees none of the prior job's monitors in `/tasks`, so
reconcile after any job change always resolves to "replace all," and stored `task-id`s carry no
cross-session value. **Fix:** say so explicitly — the manifest's durable worth is its *intent rows*,
not the ids.

### F18 — No scoped / observer boot mode
The protocol's orient + monitor-hygiene assume the booting orchestrator **owns every active lane** (arm
a central backstop + per-active-lane watchers), yet the kickoff simultaneously says stay arm's-length
from lanes you weren't asked to drive. No mode exists for an orchestrator handed a lane *subset* or a
read-only/observer boot. **Fix:** let orient scope be a named lane subset, arming monitors only for
owned lanes.

### F13-residue — No defined home for the program-level session-start (rehydration) hook
The Library/clacks defines the hook's *content* (monitor-hygiene: "reconcile, don't re-arm") but never
*where it lives*, so a deployment can nest a program-wide hook inside one lane's `_state/` (the state
symptom is `repo-findings.md` F13). **Fix:** give the session-start hook a defined program-level slot.
