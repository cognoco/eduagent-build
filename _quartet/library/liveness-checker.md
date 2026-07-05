# Liveness Checker — heartbeat, deadline, and claim-TTL primitives

**What this is.** The durable mechanism (WI-1313) that replaces the interim liveness prose
(`fdecfba`, 2026-07-03) with an actual checker: **deadline-recording + a scheduled time-based
check**, at both layers of the Quartet where a worker can die silently. A Clacks/Cosmo-layer
concern, so it lives beside `clacks/monitor-hygiene.md`.

**Why it exists.** Watchers (Monitor) are **event-driven** — a dead or stalled worker emits
nothing, and silence is indistinguishable from quiet work. Two 2026-07-02/03 incidents proved this
in *both* directions: (1) a shepherd self-paused ~20:00 on a session-limit + MCP drop, announced
self-resolution ~22:30, and the orchestrator — trusting the announced time with no verification
mechanism — let the lane sit idle for hours until the **operator** noticed, not the orchestrator;
(2) a session crash silently killed three background executors while their WIs sat
`Stage=Executing` looking healthy, and a same-day recovery audit that inferred liveness from Cosmo
Stage alone got it wrong in *both* directions (a done-but-partial-applied item read as dead). The
fix in both cases is the same shape: **stop inferring from silence — arm a scheduled check against
a recorded deadline, and corroborate Stage with independent evidence before declaring anything.**

## Two layers, one shape

| Layer | Who checks whom | Signal checked | Doc that owns it |
|---|---|---|---|
| **L1** | orchestrator checks shepherd | lane activity (outbox ts, Cosmo Stage movement) vs an expected-resume deadline | `roles/orchestrator-protocol.md` |
| **L2** | shepherd checks executor | claim state (`Claimed By` / `Claim Expires`) vs `Fixed In` + worktree/process evidence | `roles/shepherd-protocol.md` |

Both layers share the same three-step shape — **record a deadline → scheduled probe at
deadline-plus-margin → escalate on confirmed silence** — so this doc defines the shape once; the
role protocols cite it and add only the role-specific trigger and evidence source.

---

## L1 — orchestrator → shepherd (lane liveness)

**1. Record the deadline.** Whenever a shepherd declares a pause/hold, or the orchestrator
dispatches long-running work, write an `expected_activity_by` timestamp into that lane's entry in
`monitor-manifest.json` (schema: `clacks/monitor-hygiene.md` — the `expected_activity_by` field
alongside `target`/`purpose`/`command`/`task-id`). The manifest, not a watcher, is the durable
record — it already survives compaction/resume by design (§4 below).

**2. Arm a scheduled, time-based check** — not just the event-driven outbox/Stage watchers already
required by `monitor-hygiene.md`. A `Monitor` with a poll loop (or, on hosts with cron, an
external scheduled wake) that fires at `expected_activity_by + margin` (margin: operator-set,
default ~30 min) and compares **actual** last activity — the lane's `outbox.jsonl` mtime/last-line
`ts`, or Cosmo `last_edited` on the lane's in-flight WI — against the recorded deadline. A watcher
that only fires on new events cannot catch "nothing happened when something should have" — that
requires a check armed to fire on a *clock*, independent of whether the lane ever writes again.

**3. Idle-past-deadline → wake, then escalate.** On confirmed idle-past-deadline: write an inbox
line of the existing `directive` type (`roles/orchestrator-protocol.md`'s inbox contract —
`{"id","ts","from":"orchestrator","type":"directive","ref","msg"}`) with `msg` starting `"wake: "`
followed by the reason — `wake` is a **`directive` payload convention, not a new inbox type**; it
carries no new JSON shape. If no `decision` line appears in the outbox within a bounded window
(default ~30 min, same order as the probe margin), escalate to the **operator** — do not wait a
second cycle and do not re-probe indefinitely. This is the step the 2026-07-02 incident skipped
entirely: there was no scheduled probe, so the wake/escalate ladder never fired.

**4. Survive compaction/resume.** Both the deadline (in `monitor-manifest.json`) and the scheduled
check itself (as a manifest entry with `target: <lane>-liveness`, `command:` the arming spec) are
subject to the existing **reconcile ritual** (`clacks/monitor-hygiene.md`) — run at session-start /
post-compaction / post-resume. A liveness check that isn't in the manifest doesn't survive a
restart any more than any other monitor; recording it there is what makes it durable, not the fact
that it happens to be time-based.

**5. Floor.** Absent an explicit deadline (e.g. steady-state lane work with no declared pause), the
existing interim floor still applies as a backstop: treat any active lane with no outbox/Stage
event for ~2 hours as suspect and probe.

### L1 — worked walkthrough, NOT a live-armed demonstration (open gap)
**This is a retroactive walkthrough against the 2026-07-02 incident, not a live demonstration —
the AC's clause 5/9 bar (armed and fired against a live lane) is not met by this doc alone.**
Applying steps 1–3 to the actual incident that motivated this WI: the shepherd's ~20:00 pause would
have recorded an `expected_activity_by` (its announced ~22:30 self-resolution, or a conservative
default if none was announced). The scheduled check, armed at dispatch time per step 2, would fire
at ~23:00 (30-min margin), read the lane's `outbox.jsonl`/Cosmo state, find no activity since
~20:00, and (per step 3) write the `wake` directive; absent a `decision` line by ~23:30, escalate to
the operator — hours earlier than the actual multi-hour operator-noticed stall. That gap-closing
argument is why the mechanism is shaped this way, but it is a plausibility argument, not proof the
mechanism runs. **An executor cannot close this gap itself** — the WI-1313 builder is Clacks-blind
(never reads/writes `working/lanes/*/_state/*`), so it cannot arm a real scheduled check against a
live lane's manifest. **Open follow-up for the orchestrator/shepherd:** arm the L1 check per steps
1–4 against a real active lane post-merge and record the result (or file a tracked follow-up WI if
none is active at merge time) — until then, clause 5 and the L1 half of clause 9 are **not** closed.

---

## L2 — shepherd → executor (claim-TTL checker)

**1. Claim Expires is the heartbeat.** An executor's dispatch/claim already writes `Stage=Executing`
+ claim props via `/cosmo:execute claim` (AGENTS.md, `zdx/standard/`). `Claim Expires` is a
**formula** derived from `Claimed At` (`dateAdd({Claimed At}, 3, "hours")` per the current schema) —
so the claim carries its own TTL for free *when `Claimed At` lands*. **`Claim Expires` MUST be
non-empty on every live claim.** A claim with `Claimed By` set and `Claim Expires` empty is not a
healthy claim with no expiry — it is a **defect**: the claim path failed to write `Claimed At`
(observed live during this WI's own build: WI-1313's and WI-1314's own claims landed with
`Claimed At` empty, hence `Claim Expires` empty, until hand-patched — see demonstration below), and
a claim in that state defeats the TTL sweep this checker relies on.

**2. The mechanical check (clause 8).** For any Work Item at `Stage=Executing`:
```
Claimed By set AND Claim Expires empty  →  FLAG: claim-missing-expiry (defect, not a liveness read)
Claimed By set AND Claim Expires < now  →  claim EXPIRED — candidate dead executor, proceed to §3
Claimed By set AND Claim Expires ≥ now  →  claim LIVE — do not re-dispatch
```
The first row is a **data-quality flag**, surfaced to the shepherd (or captured as a follow-up WI)
— it is not itself evidence of death or life, because the formula never populated. Do not treat a
flagged claim as either "safe" or "dead" until it is corrected or ages out some other way.

**3. The discriminator (clause 7) — Stage alone is ambiguous in BOTH directions.**
`Stage=Executing` + a stale/expired/blank claim + an old `last_edited` reads identically for two
different situations:
- **(a) executor died mid-work** — no completion ever ran.
- **(b) work is done, but `complete` partial-applied** — the Stage/Fixed-In transition was lost
  mid-write (WI-1346), so the page looks stuck at `Executing` even though the work landed.

These are opposite dispositions (re-dispatch vs. do-not-touch-just-finish-the-transition) and Cosmo
Stage cannot tell them apart. Use **`Fixed In`** as the discriminator, corroborated with
claim-expiry + worktree/process evidence, before declaring either:

| Case | `Fixed In` | Claim | Read |
|---|---|---|---|
| **rework bounce** | **cleared** (reviewer bounced it back to Executing) | may be re-claimed | normal rework — not a liveness case |
| **stuck-complete** (partial-applied) | **set**, with **no subsequent edits** to the page | expired or missing | do **not** re-dispatch — the work landed; finish the stranded transition (re-run `complete`'s Notion I/O, don't rebuild) |
| **died mid-work** | **empty**, and no PR/branch evidence for the WI exists | expired or missing (or the flagged empty-Expires defect from §2) | safe to re-dispatch a fresh executor |

Corroborate with **worktree/process evidence** (does `.worktrees/<WI-slug>` exist with commits? is
there an open PR referencing the WI?) before acting on either the `stuck-complete` or `died`
reading — `Fixed In` alone narrows it, but a shared checkout can have stale worktree litter from an
unrelated abandoned attempt, so confirm before finishing a transition or re-dispatching.

### L2 demonstrated — this WI's own claim, live
This WI's `claim` step (`/cosmo:execute claim`) landed with `Claimed By: wi1313-executor` and
`Claim Expires` populated (`July 3, 2026 16:15`) — verified via direct Notion REST read immediately
after claiming, per §2 row 3 (`Claim Expires ≥ now` → live, correctly not re-dispatchable). The
shepherd separately reported that **this exact claim, and WI-1314's**, initially landed with
`Claimed At` empty (hence `Claim Expires` empty) until hand-patched — the live §2-row-1 defect case,
caught at its source: the `/cosmo:execute claim` path not writing `Claimed At` on every call. That
confirms the checker rule against real data without requiring a code change to `execute.ts` (a
separate ZDX-marketplace concern, out of this WI's `_quartet`-docs scope) — the checker's job is to
**flag** the defect deterministically, not to fix the CLI that causes it.

---

## Where this binds
- `roles/orchestrator-protocol.md` → Progress channel (replaces the WI-1313-interim bullet).
- `roles/shepherd-protocol.md` → Executor liveness section (new).
- `clacks/monitor-hygiene.md` → manifest schema (`expected_activity_by` field) + reconcile ritual
  (a liveness check is a monitor-manifest entry like any other).
- Relates: WI-1236 (orchestrator boot/monitor arming), WI-850 (monitor hygiene), WI-1156
  (lease/heartbeat TTLs), WI-1346 (complete partial-apply / stranded transition), WI-1245 (Clacks
  channel git-hygiene — cited for the incident context only; this doc does not touch that surface).
