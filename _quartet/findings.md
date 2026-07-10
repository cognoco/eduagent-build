# Quartet Findings

Running log of findings from dogfooding the `_quartet/` system. Each entry: what was tested, what
held, what needs a ruling. Not a backlog (Cosmo owns that) — a capture surface so dogfood signal
isn't lost between sessions.

---

## 2026-06-29 — Orchestrator orient dogfood (Approach-D Wave 1)

**Test.** Synthetic orchestrator resume: fired the INI-06 rehydration hook
(`_wip/identity-cutover/_state/quartet-hooks/rehydrate.sh`) with context mostly intact, then
oriented as the orchestrator off the repointed `_quartet/` Brain against live `_wip/` Working state.
Posture = test/meta (read-only; a real INI-06 orchestrator was active — took no live action).

**What held (validated).**
1. **Hook → Brain repoint fires correctly.** Injected `_quartet/roles/orchestrator-protocol.md` (a) +
   `_quartet/planning-rules.md` (c) as the protocol re-reads, kept the live `_wip/` roster (b), printed
   the Working-state binding line. Wave-1 repoint is live and behaves as planned.
2. **Channel-tail reconciliation is the hook's MVP.** Step 3 (tail inbox/outbox) surfaced live traffic
   instantly (WI-1161 merged, WI-867 rebasing, both shepherds alive) — this is what makes a stale
   anchor non-fatal. Best single design element.
3. **Protocol legibility is high.** `orchestrator-protocol.md` is actionable as written: 8-step
   lane-activation ceremony, four-roles-never-conflate, router duties, the "never spawn
   shepherd/reviewer as your own subagent" altitude invariant, the MANDATORY-RE-READ block (folded E5).

**Findings.**

### F1 — The Brain's own pointers fight the Wave-1 binding (headline)
`orchestrator-protocol.md` points to `working/program/program-roster.md` in two load-bearing places
(the MANDATORY-RE-READ block and Orient-on-resume). In this deployment that path resolves to the
blank `_quartet/working/` template or a stale snapshot. The **only** thing redirecting to the live
`_wip/` roster is the binding line **injected by the hook** — nothing in the Brain carries it.
- **Consequence:** a fresh orchestrator launched WITHOUT the hook (Wave-2 greenfield from kickoffs, or
  any non-hooked session) reaches for the stale/blank snapshot by construction.
- **Root nature:** this is the inherent "where is MY working state" seam of the Brain(`_quartet/`)/
  Working(`_wip/`) split — the generic, portable Brain cannot carry the one per-instance fact, and
  right now it's closed in exactly one non-portable place (the hook).
- **Candidate fix (needs ruling):** make the **orchestrator kickoff**
  (`roles/kickoffs/orchestrator-kickoff.md`) the durable home of the working-state binding (it's
  per-instance anyway); hook stays the mechanism for hooked resumes; protocol stays generic.
  Alternatives: a placeholder-pointer line in the protocol, or accept hook-only (fails Wave-2).
  **Open action:** verify whether the kickoff already carries this.

### F2 — The anchor is enormous (~115k tokens / 606 lines); rehydration is not cheap
Step 1 says "Read your world-state anchor IN FULL." The live anchor is ~115k tokens — reading it in
full consumes a large fraction of an Opus context window, **contradicting** the lean-context goal the
protocol opens with. Session blocks accrete unbounded. Candidate fix: anchor-hygiene discipline
(current-state-at-top, archive prior session blocks to a sibling), or a structured roll-up the hook
tails (as it already does for channels) instead of "read in full."

### F3 — Filename staleness is a legibility trap (minor; mechanism sound)
The live anchor is named `...handoff-2026-06-16.md` but is updated in place (content current to
06-29). The hook's `ls -t … | head -1` is mtime-based so it picks the right file, but a stale-looking
filename invites distrust. Either rename on refresh or stop dating the filename.

### F4 — Wave 1 is synthetically verified, not yet live-proven (honesty flag)
This orient forced the hook with a synthetic SessionStart. The live INI-06 session likely oriented off
PRE-repoint `_wip/` Brain paths. So Wave 1 is **armed + dry-run + synthetic-orient verified**, but its
first GENUINE exercise is the next real INI-06 orchestrator resume.

### F5 — Commit-flow broad-stages in a shared tree with concurrent sessions (operational hazard)
While committing this very findings file, the commit skill staged **every dirty path in the working
tree** (29 files), not just the one requested — because this checkout is shared with a live INI-06
session that had ~28 uncommitted in-flight files sitting in it (channel `_state/*.jsonl`, the
working-tree-only `rehydrate.sh` hook, anchor, WI artifacts). That committed another session's work
and the never-commit hook before it was caught + undone (`reset --mixed`, then explicit single-file
add).
- **Why it matters for the Quartet:** the Quartet's whole model is multiple concurrent role-sessions
  sharing substrate. A commit flow that stages by "what's dirty" instead of "what THIS session
  authored" is structurally unsafe here — own-work scope cannot be inferred from the index alone when
  N sessions share one tree.
- **Mechanism note:** `_state/` channel files + `rehydrate.sh` are working-tree-only by design (the
  06-28 channel-clobber incident is the precedent). They must never be staged by anyone.
- **Candidate fix (needs ruling):** either (a) the Quartet's commit guidance mandates explicit
  pathspec staging (never `add -A`/dirty-sweep) for any session operating in a shared tree, or
  (b) `_state/` + the hook dir get gitignored (operator previously ruled NO on gitignoring `_state/`,
  06-28 — so (a) is the live path), or (c) sessions work in per-session worktrees so the shared-tree
  staging ambiguity never arises.

**Net.** Approach-D Wave 1 holds: Brain + live Working state produce one coherent picture; the hook's
channel-tail covers anchor lag. F1 is not a cutover bug — it's the inherent working-state seam,
currently closed only by the hook. Deciding its durable home is the real Wave-1 → Wave-2 graduation
question. F5 is a separate, sharper operational hazard surfaced by the same session: shared-tree
commit scope.

> Full session friction log (scratch, ephemeral): the orchestrator's
> `scratchpad/quartet-dogfood-friction-log.md` from this run.

---

## 2026-07-03 — MCP-equals-Notion conflation — root cause (WI-1314)

**Symptom.** A shepherd halted both live lanes for hours declaring `complete`/`review`/`triage`
"impossible until reconnect" on a Notion **MCP** disconnect, even though the `cosmo` bun CLIs and
raw REST (both keyed on `NOTION_TOKEN`, both live the whole time) never depend on MCP. Reproduced
2026-07-02/03; a prior instance was captured as WI-877 (2026-06-20) and lost to Stage-less
orphaning before this recurrence forced a structural fix.

**Root-cause evidence, cited.**
1. **The decision tree agents load names MCP as the answer to most write/create/view/comment
   operations, with zero MCP-availability branch.** `notion-patterns` skill
   (`_tools/ZDX-marketplace/plugins/notion-patterns/skills/notion-patterns/SKILL.md`, lines 15–92):
   of the ~13 decision-tree branches, 7 route to MCP as primary/exclusive (create pages, update
   properties, create/modify schema, create/configure views, move/duplicate pages, comments) versus
   3 to REST and 2 to CLI. The tree selects by **task type only** — there is no "what if MCP is
   unavailable" branch anywhere in it (the gap the absorbed WI-877 capture named directly). An agent
   that has internalized "MCP is the default tool for talking to Notion" from this doc has no
   documented off-ramp when MCP drops.
2. **Pre-fix, the role protocols never mentioned an MCP-independent path at all.** Before commit
   `fdecfba`, none of `orchestrator-protocol.md` / `shepherd-protocol.md` / `reviewer-protocol.md` /
   `roles/executor/executor-protocol.md` named the cosmo-CLI/REST fallback — silence trains the same
   default the notion-patterns tree does: the only path an agent has ever read about *is* MCP.
3. **The conflation shows up verbatim in the live incident record.** `working/lanes/cosmo-improvements/_state/outbox.jsonl`
   (`cosmo-improvements-23`, 2026-07-02T20:01:15Z): *"Notion MCP DISCONNECTED ... no complete/review/triage
   possible until reconnect"* — despite `complete`/`review`/`triage` being the REST-only `cosmo` bun
   CLIs, not MCP calls. The operator correction lands in
   `working/lanes/cosmo-improvements/_state/inbox.jsonl` (`cosmo-improvements-inbox-wake-1`,
   2026-07-03T05:31:50Z) and is echoed into `working/lanes/quartet-mvp/_state/inbox.jsonl`
   (`quartet-mvp-inbox-wake-1`), spelling out the fallback ladder MCP → cosmo bun CLIs → notion
   CLI/REST for the first time in-protocol.

**Fix, split per operator ruling** (`working/lanes/quartet-mvp/_state/inbox.jsonl`,
`quartet-mvp-inbox-7`):
1. Codify the ladder invariant in the role protocols agents actually read at boot — landed for
   orchestrator/shepherd/reviewer in `fdecfba`; executor + `dependencies.md` landed under WI-1314
   (this entry's commit).
2. Add a degraded-mode/outage section (with an MCP-availability axis) to the `notion-patterns` skill
   itself — tracked as a separate small lane WI, **out of WI-1314's scope**.
3. A boot-time REST proof step in the shepherd/reviewer boot ceremony — already present per
   `shepherd-protocol.md`/`reviewer-protocol.md` (fdecfba: "prove the MCP-independent path with one
   cheap REST call at boot").

**Net.** The structural source is #1 (a decision tool that only ever names MCP for most writes) plus
#2 (protocols that, until `fdecfba`/WI-1314, never named the alternative). Both are now addressed at
the protocol layer; the notion-patterns skill's own decision-tree fix remains open as separate,
smaller-scoped work.

---

## 2026-07-07 — WS-45 "ZDX Relaunch — Wave 1" live orchestration dogfood (Hex, Surface)

**Context.** A live orchestrator run driving WS-45 end-to-end (completion wave → builds), owning the
F35 merge gate and coordinating shepherd Drumknott + a Codex reviewer via Clacks. Findings are real
delivery signal, not synthetic. Most are already captured as Cosmo WIs (noted per item); this is the
cross-cutting narrative so the signal isn't lost. Ordered roughly by structural weight.

### F1 — `State` substatus atrophies to `Active`; hold-reasons live in narrative, not the board (headline)
ZDX `State` (Active/Blocked/Awaiting Info/Parked/Stalled) and the derived `Workflow Status` rollup
already exist to encode *why* an item isn't moving — but only `Stalled` has an automated writer (Govern
claim-expiry sweep). `capture` stamps `State=Active` and nothing downstream ever changes it, so parked/
blocked items all read `Active` and the board can't answer "why is this sitting here?" The orchestrator/
shepherd end up carrying hold-reasons in Clacks + page comments instead. Surfaced when the operator
asked why 5 Refining + 2 Captured items were "stuck" — they were deliberately held, but nothing showed
it. **Fix:** wire State-setting into the protocols at the moments a hold occurs (blocked-by edge →
`Blocked`; PM sequencing-defer → `Parked`; human-response hold → `Awaiting Info`; cleared → `Active`);
shepherd census asserts *on* State (Active-but-not-progressing = a reconcile defect). Sub-finding: the
`hitl` **tag** (persistent "will need a human") vs `State=Awaiting Info` ("waiting on a human now")
distinction is real and was initially mis-applied — codify "binds-later = tag, binds-now = State".
Backfill precedent set this session (851=Blocked, 1681=Awaiting-Info→corrected to Parked+hitl, 5 ZAF=
Parked). → **WI-1684**.

### F2 — `/cosmo:refine` refuses `Ready` items → no sanctioned path to fix a stale-AC Ready item
WI-851 reached `Ready` with an AC whose premise didn't reproduce (a hardcoded doppler path that exists
only as an eduagent-build doc line, not code). It could be neither corrected nor demoted: refine only
accepts Backlog/Refining, and hand-editing Stage is barred. The item can only sit `Ready` +
phantom-available or get a forbidden Stage edit. **Fix:** a sanctioned Ready→Refining reopen path. →
**WI-1680** (currently the sole real blocker of WI-851; edge set 851 blocked-by 1680).

### F3 — Validity formula has no empty-`Stage` branch → Stage-less rows evaluate **Valid** and are invisible
A row created without a Stage (e.g. a raw Notion page-create bypassing `capture`) silently counts as
valid and appears in no triage view. The code-half detection sweep landed (WI-1332); the structural
formula fix is a **destructive shared-schema edit** (one bad edit mis-flags every row for every
concurrent session) → gated on explicit operator sanction. → **WI-1681** (carries hitl tag + Execution
Path=Manual; needs operator go + backup-first).

### F4 — Orphan-`Executing` that the zombie guard structurally misses
WI-1312's reconcile guard only catches `Executing` rows with **Started also empty**. An item whose
claim settled but Stage never advanced — Started *set*, Fixed In *present*, claimant empty — is a
distinct "orphan-Executing" the guard skips. WI-1616 was exactly this: a landed fix (Fixed In
`1a6cd65f`, PR#48) stranded 2 days at Executing, found only by a **full-workstream census**, not the
guard and not the dispatched-subset view. Disposition matters: it was *landed-but-unfinalized* →
finalize, NOT reconcile-to-Ready (which would discard a shipped fix). **Fix candidate:** extend the
guard to flag claim-dead + Started-set + Stage=Executing; make full-WS census (not just dispatched
items) the shepherd default. *(Open — no dedicated WI yet; follow-up to WI-1312.)*

### F5 — `complete` derives Fixed In from the invocation-CWD repo, not the WI's Project repo
Run from the wrong checkout, `complete` stamped a **nexus** commit onto a zdx-marketplace item (wrong-
repo Fixed In). Same cwd-resolution bug class as WI-1629 (which fixed it in `qa.ts`) but living in
`complete.ts`. Mitigation applied wave-wide: finalize from the Project repo + pass `--fixed-in <url>`
explicitly. → captured as a **Wave-2 seed** (verify it has a WI id; if not, capture).

### F6 — F35 green-gate is blind on nexus: **nexus runs no test CI at all**
The Quartet F35 merge gate trusts "PR checks green." On cognoco/nexus that means AI-review +
`quartet-change-control` — **none runs `bun test`**. So a failing test merges straight through: WI-1158
PR#92 showed 3/3 green, was F35-merged (`bf66f4ee`), yet the runner-adapter throws ENOENT spawning bare
`codex` on Windows (.cmd/PATHEXT) — caught only at review, forcing a rework cycle. Double blind: no
test job, and even a Linux test job would miss Windows-runtime failures since Surface is the execution
platform. zdx-marketplace got test CI (WI-1264/1579); nexus never did. **Interim control in force:**
nexus-repo PRs routed to F35 must carry shepherd-attested clean-worktree **Surface** test evidence —
no merge on checks alone. → **WI-1694** (add bun-test CI + Windows runner to nexus).

### F7 — Reviewer is context-agnostic (no Clacks) → liveness only readable via Cosmo Stage; slow ≈ dead
The reviewer signals only through Cosmo Stage movement, so the orchestrator can't ping it and can't
distinguish "slow" from "halted." It took ~38 min to pick up 1158/1616 — past my escalation threshold —
but was alive (verify-before-escalate saved a false alarm). Positive note: the `Reviewing` → `In Review`
split (WI-1218) is genuinely valuable — `In Review` is the only signal that distinguishes "queued for a
reviewer" from "reviewer actively on it." **Fix candidate:** a reviewer heartbeat/last-active surface
the orchestrator can read without inferring from Stage; document a reviewer-liveness threshold + the
operator-relaunch escalation (reviewer is operator-launched).

### F8 — Orchestrator liveness: a quiet Clacks outbox is NOT progress
A pull-based outbox monitor fires only on posts, so a halted shepherd reads identical to a working one
(operator caught a ~2 h shepherd idle earlier). Needs an **active staleness heartbeat** that alarms on
silence + a liveness ping, plus a shepherd-side periodic self-heartbeat during legitimate wait stretches
(Drumknott armed one this session). *(Process finding — captured to memory `feedback-orchestrator-
active-liveness`; candidate for the shepherd/orchestrator protocols.)*

### F9 — Notion "Blocked by/Blocking" dual-relation + near-identical page-id collision hazard
The edge pair is a synced dual relation (writing one side syncs the other, with observable async lag),
and WS-45 page-ids collide on long prefixes (`38e8bce9-…-815d` WI-1158 vs `…-8138` WI-1159). A prior
session cleared the wrong item's edge via a suffix mix-up, and the sync then destroyed a legitimate
edge. **Discipline (now standing):** verify the page-id suffix before any edge write; re-read *both*
sides after. *(Process finding — in the lane tracker's cautions.)*

### F10 — Byproduct captures stall at `Captured`; wave-membership of dropped-in items is recurring friction
Session-discovered tooling/process items (1680/1681/1684/1694) piled at `Captured` because nothing
triaged them — a silent stall the operator flagged ("why is nothing happening?"). Triage costs no build
capacity; captures should flow to triage by default, not be parked. Separately, audit-derived governance
items (the 5 ZAF-Global items) and gate-hardening items (WI-1694) dropped into a build wave create
recurring "is this in-scope?" friction — wave-assembly is PM-owned, but the board gives no signal that
an item is *awaiting a placement decision* vs *legitimately in-wave*. Related to F1 (a "why parked"
State would carry this too).

### F11 — The findings-log convention is not wired into the role protocols (meta)
This very log (`_quartet/findings.md`) exists and prior sessions maintained it, but **no role protocol
references it** — an orchestrator has no instruction to keep it and will only do so if the operator
asks (as happened here). Dogfood signal is one forgotten prompt away from being lost. **Fix:** name
findings.md + a "log framework findings as you hit them" step in the orchestrator/shepherd protocols
(and ideally the kickoff), so capture doesn't depend on the operator remembering to ask.

**Net.** The wave delivered (completion wave 100% closed; builds in flight), but the run surfaced a
consistent theme: **Cosmo already models more than the workflow uses** — `State` substatus (F1), the
`In Review` stage (F7), the dual-relation edges (F9) are all present-but-underexercised, so agents
re-encode the same semantics in narrative. The sharpest *new* structural gaps are F3 (Stage-less
invisibility), F4 (orphan-Executing the guard misses), and F6 (a merge gate that doesn't run tests on
its own runtime). F11 is the meta-risk: without the log wired into protocol, none of this is reliably
captured.

### Shepherd addendum (Drumknott) — three tooling-legibility specifics
Concrete mechanics behind the wave's first-pass bounces, complementing F1–F11:
- **`complete --validate` trip-wires bounce correct work on first finalize.** 1629/1630/1605 each
  bounced despite sound fixes because the completion-summary validator trips on natural technical
  prose: a digit adjacent to pass/passing/green (test counts), a bare commit SHA in prose (Fixed In
  already carries it), backtick `/skill:command` tokens, and — subtlest — a single `\n` between
  sections collapsing into one >1900-char block that truncates at `.slice(0,1900)`, silently dropping
  required sections. Executors must be pre-briefed with safe phrasing (exit-code-0 / "the suite is
  green." with a period; blank line between every section). *Candidate:* validator names the offending
  token + fix, or a safe-by-construction template.
- **`declaresRegressionGuard()` Bug-AC form is finicky and under-surfaced.** `RED:`/`GREEN:` labels do
  NOT satisfy it; it needs the literal `red-green-revert` (or `regression test`) as a header/label + a
  substance word (assert/fail/reproduce/verify) + a named test-file path + before/after phrasing.
  Executors got it wrong first try (851, 1616). *Candidate:* refine's DoR failure emits the exact
  required shape, not just "missing regression guard."
- **Windows-spawn TEST convention (extends F6).** Fixing the bare-`codex` ENOENT with `Bun.which`
  pre-resolution is only half the job: a unit test that spawns a native `.exe` (e.g. `bun`) does NOT
  prove the `.cmd`-without-shell mechanic, and a `hasCodexOnPath()`-gated integration test can silently
  skip in a constrained context — the "gated test hides the bug" anti-pattern the reviewer named, and
  the exact grounds of WI-1158's first bounce. *Candidate:* a shared Windows-safe spawn helper + a
  synthetic-`.cmd`-fixture test convention that proves the `.cmd` path unconditionally.

---

## 2026-07-08 — WS-34 Codex shepherd boot / Clacks friction

- **Codex binding needs runtime provisioning clarity.** The protocol says the shepherd arms an inbox monitor, but the Codex binding delegates that to an external watcher plus manifest. At boot, the lane had provisioned mailboxes and orchestrator-side watchers, but no shepherd-side `monitor-manifest.json` or `inbox-watch.ps1`; this made "am I in communication?" ambiguous until the orchestrator provisioned them.
- **Sign-of-life has no distinct envelope shape.** `shepherd-protocol.md` names sign-of-life as a sanctioned exception, while `clacks-channel.md` validates only `needs-operator`, `needs-orchestrator`, `blocked`, and `decision`. The WS-34 boot used a `decision` line to stay schema-valid, but the protocol should spell out that mapping.
- **Codex dogfood needs an explicit fallback posture.** The initial operator addendum said not to improvise missing Clacks mechanics; the later operator ruling changed that to "get it working as best you can." This should be codified as a Codex-specific degradation mode: use only canon mailbox files and untracked `.cosmo-watch/<lane>/` runtime files, never tracked `_quartet/clacks` tooling.
- **Inbound/outbound communication are separable.** Outbound Clacks worked before full boot (`outbox-watch.ps1` logged `platform-hardening-1`), but inbound wake reliability was not operational until `inbox-watch.ps1` and the manifest existed. Future status language should distinguish "can send to orchestrator" from "fully operational Clacks loop."
- **Worktree setup script can choose WSL `bash` on Orion.** `bash scripts/setup-worktree.sh WI-1656` invoked `C:\Windows\system32\bash.exe`, created a usable file tree, but registered the worktree as `/mnt/c/...`; Windows Git then reported it prunable. `git worktree repair .worktrees/WI-1656` fixed the registration. The Codex/Windows binding should either force Git Bash/PowerShell or provide a native setup path.
- **Codex dispatch lacks a direct `--effort` flag and model naming is account-specific.** The Quartet dispatch protocol requires explicit model and effort; `codex exec` exposes `--model` but no obvious `--effort`. WS-34 records effort in the brief and uses Codex reasoning config as the closest equivalent. First launch with `gpt-5-codex` failed on this ChatGPT-backed account; local config uses `gpt-5.5`, so the binding should define the exact model/effort mapping per account/runtime.
- **Nested Codex sandbox can break lifecycle-network calls.** In `WI-1656`, direct Bun/Node/PowerShell requests to Notion from the worktree succeeded, but the Codex executor launched with `-s workspace-write` got `ConnectionRefused` from Bun's `fetch()` inside `/cosmo:execute fetch`. Relaunching with `danger-full-access` is the current dogfood workaround; the Codex binding should define the required sandbox/network mode for Notion-backed lifecycle tooling.
- **Worktree-from-origin can carry stale lane docs.** The `WI-1656` executor worktree was correctly based on `origin/main`, but that meant `_quartet/working/lanes/platform-hardening/execution-tracker.md` still said WS-34 was PARKED while the live shared-tree tracker and Cosmo state said ACTIVE. Dispatch briefs need to carry the authoritative activation fact, or the setup flow needs a safe way to project uncommitted lane-control updates into executor context without committing Clacks/state files.
- **`Claim Expires` formula shape differs from lifecycle docs.** The work-lifecycle docs describe `Claim Expires` as a formula date (`formula.date.start`), but `WI-1656` returned `formula.type="string"` with value `"July 8, 2026 13:50"`. Liveness checkers should treat non-empty formula string/date as populated, or the schema/docs need alignment.
- **Worktree setup timeout can leave partial dependency links.** After the initial `scripts/setup-worktree.sh WI-1656` timeout, the worktree had `node_modules/.pnpm` but no `node_modules/.bin` links, so `pnpm exec tsx` failed. A timeout should be treated as partial setup until `pnpm install` is rerun and verified in the worktree.

### Orchestrator addendum - Orion activation observations

- **Snapshot provenance preflight does not match Orion reality.** `_quartet/SYNC-PROVENANCE.md` was absent while required framework files were present. Operator overrode this as an Orion-local ZDX-standard deviation. A strict preflight would otherwise stop useful work despite an apparently usable local snapshot.
- **Local activation labels can leak into Cosmo identity.** ORION's local roster label `PRG-34` leaked into the first kickoff, even though the canonical Cosmo object is `WS-34`. Kickoffs should lead with `WS-N` and treat local program labels as secondary.
- **Manual monitor-manifest editing is fragile.** A hand patch briefly put WS-34 monitor entries outside the `monitors` array. JSON validation must be terminating (`ConvertFrom-Json -ErrorAction Stop`) or the shell can surface an error while still returning success.
- **PowerShell nested-command quoting is a Codex-on-Windows hazard.** `$env:*`, loop variables, pipes, and JavaScript backticks expanded in the outer shell during several commands. One token-presence check leaked part of `NOTION_TOKEN` in a parser error. Codex/Windows docs should prefer here-strings, escaped `$`, and no JS template literals inside nested `pwsh -Command`.
- **Live ZDX schema drifted from bundled skill docs.** The skill docs list `Execution Path` values as `Auto` / `Manual` / `Unset`, while live WS-34 rows use `Assisted`. DoR logic should read the live schema or tolerate estate extensions.
- **Ready-stage pool is stale enough that Stage alone is unsafe for dispatch.** WS-34 had 13 items marked `Ready`; only WI-1656 passed the fresh property-level DoR read. Most stale Ready failures were missing mandatory `Effort`; one Ready WP lacked `State` and `Execution Path`.
- **Watched mailbox files must be appended, not patched in place.** Orion Orchestrator for WS-34 observed `inbox.jsonl` validate cleanly after an `apply_patch` append, while the live PowerShell `Get-Content -Wait` watcher logged a parse error for the same event with the leading `{` missing. Replaying the directive via a true append parsed cleanly. Codex/Clacks guidance should treat live mailbox writes as append-only operations and reserve in-place patches for repairing invalid channel files while watchers are quiesced or after a replay.
- **Codex watchdogs log progress but do not wake the orchestrator model.** Orion Orchestrator for WS-34 started a 5-minute shepherd progress watchdog that continued polling on schedule (`19:55:24Z`, `20:00:24Z`, etc.), but the Codex session did not automatically surface those checks to the operator. This creates a false sense of active human-visible monitoring: durable logs exist, but the model only sees them when it runs another tool call. Quartet/Codex guidance should distinguish "background audit log" from "agent wake/interrupt" and require explicit user-facing cadence if the operator expects visible status every interval.
- **Stale-action scripts can deliver directives but cannot restart a stalled Codex seat.** Orion Orchestrator for WS-34 observed the shepherd progress watchdog fire at `2026-07-08T20:15:24Z`, append a valid `shepherd-stale-progress` directive, and have the inbox watcher parse it cleanly. No shepherd outbox acknowledgement followed within the required two-minute window. This confirms a Codex-specific control gap: file-channel watchdogs provide detection and durable delivery, but without an in-harness wake/compact/restart primitive they cannot make the target model act. Quartet/Codex guidance should define the escalation boundary: when to retry by mailbox, when to reassign work, and when the operator must relaunch the seat.

### Meta reading — Orion Orchestrator for WS-34

Author: `codex:orchestrator:ws-34` on Orion, reading the orchestrator + shepherd team behavior after operator challenge.

- **WS-34 under-parallelized after activation.** The team treated activation as "get one safe item moving after re-gating" rather than "turn the whole workstream into a parallel execution board." `WI-1656` moved first because it was the only Ready item that passed the visible DoR read, but that should not have made the rest of the lane single-threaded.
- **Stale-Ready caution became a throttle.** The property-level DoR pass was useful: most Ready rows were missing `Effort`, one Ready WP lacked `State` and `Execution Path`, and some items had known coordination hazards. The miss was treating that as "do not dispatch most things" instead of "parallelize refine / sequencing / dependency classification work too."
- **No real sequencing pass had happened.** Known hazards were identified (`WI-1248` blocked by Button API work, `WI-1098` blocked, Ramtop-overlap risk on `WI-1183`/`WI-1179`/`WI-1069`/`WI-1098`), but no full dependency/sequencing pass converted the lane into ordered clusters. Empty `Workstream Order` is evidence that the lane had not been operationally sequenced.
- **Orchestrator/shepherd split created a throughput handoff gap.** The orchestrator owns pipeline throughput but not execution; the shepherd owns dispatch. In practice the orchestrator handed over a conservative "start with safe item / re-gate stale Ready" posture and did not assert an explicit expectation like: "within the next checkpoint, classify all Ready items into dispatch-now / refine / blocked / sequence-hold and start N independent executors."
- **Clacks/Codex substrate friction explains delay, not continued single-threading.** The first coordination loop was consumed by missing shepherd-side monitor provisioning and inbox watcher setup. That explains why the first boot was slow, but once communication was working it should not have remained a single-item frontier unless capacity or dependencies were explicitly recorded.
- **Likely protocol gap:** the current activation ceremony does not force an activation-time parallelization census. A stronger rule would require each active lane to produce, immediately after boot, a lane-board snapshot: dispatchable now, refine-needed, blocked, sequence-held, reviewer-capacity risk, and expected parallelism. The orchestrator should challenge a single-item frontier unless that snapshot justifies it.
- **Reading from Orion shepherd for WS-34: shepherd/orchestrator split does not force early parallelization.** My read from the `codex:shepherd:ws-34` seat: WS-34 activated with a visible dozen-plus `Ready` rows, but the team only dispatched WI-1656 before opening refinement/sequencing work for the stale Ready pool. Some restraint was correct: the fresh DoR read found only WI-1656 truly dispatchable, and several items have Ramtop/file-surface collision hazards. But the protocols leave a gap between "do not dispatch stale Ready" and "proactively refine, order, and dependency-scan the rest." The shepherd protocol says backlog health and Workstream Order are the shepherd's mandate; in practice boot friction plus Clacks/runtime repair consumed the first window, and the orchestrator did not issue a parallel grooming push once the stale pool was known. Result: execution parallelism lagged the actual mandate. Candidate protocol fix: after activation census, require a lane-shaping phase that emits (or writes) dependency/order/refinement actions before first or alongside first dispatch, with WIP N=4 applied across executor types, not just builder implementations.
- **Reading from Orion shepherd for WS-34: Codex inbox watcher is durable logging, not an in-harness wake-up.** `ws34-orch-004` landed in `_state/inbox.jsonl` and the external `.cosmo-watch/platform-hardening/inbox-watch.ps1` process logged it promptly, but the Codex shepherd seat did not ingest it until the operator asked. Root cause: the Codex binding correctly says there is no in-harness Monitor primitive, but the operational fallback currently means "background process writes durable logs; shepherd reconciles at boot/resume/status/checkpoint." That does not wake the model during an active reasoning turn, and I failed to add an explicit inbox check after the meta-response boundary. Protocol-level fix: Codex shepherds need a hard inbox-reconcile cadence at every user-facing final, before/after any long tool run, and before continuing executor supervision; urgent orchestrator directives need a separate receipt-ack convention on outbox so "logged by watcher" is not confused with "read by shepherd."
- **Reading from Orion shepherd for WS-34: acknowledging a directive is not enough without a local execution latch.** After the operator surfaced `ws34-orch-004`, I appended `platform-hardening-3` acknowledging the lane-shaping directive, but I did not create a local checklist/anchor that made lane shaping the next active work. The session then continued to report/supervise WI-1656 completion, and the checkpoint was not produced. This is a second Codex-specific failure mode: even when receipt is explicit, there is no durable "next directive to satisfy" latch unless the shepherd writes one into the session handoff/plan and checks it before other work. Candidate fix: every acknowledged directive with a due time must be mirrored into `_state/SESSION-HANDOFF.md` as the top `NEXT` item and cleared only by an outbox response or an explicit blocker.
- **Reading from Orion shepherd for WS-34: repo-level `core.worktree` corruption can silently break every later worktree.** During the WI-482 parallelization attempt, a failed Codex worker setup left `.git/config` with `core.worktree=C:/Dev/Projects/Products/Apps/eduagent-build/.worktrees/WI-1098`. After that, `git rev-parse --show-toplevel` from unrelated directories resolved as `WI-1098`, `scripts/setup-worktree.sh` failed with `fatal: this operation must be run in a work tree`, and a manually-created `WI-482-curriculum` worktree showed another worker's dirty diff. The shepherd removed the bad config key, aborted the affected workers before commit/push, and pruned the failed worktree record. Candidate fix: the worktree setup skill/script should assert `git config --local --get core.worktree` is empty in the main checkout before creating any worktree, and refuse to proceed if it is set.
- **Reading from Orion shepherd for WS-34: interrupted Codex workers can report hygiene cleanup against the wrong Git top-level.** The WI-1098 worker reported no staged runtime artifacts, but after the repo-level `core.worktree` fix the real WI-1098 index still had staged `.cosmo-plugin-copy` files. Root cause was the same corrupted top-level: the worker's cleanup commands were aimed at the wrong effective worktree. Candidate fix: every worker hygiene report should include `git rev-parse --show-toplevel`, `git rev-parse --git-dir`, and `git diff --cached --name-only` from an explicit `git -C <worktree>` command, and the shepherd should verify those before trusting "clean" reports.
