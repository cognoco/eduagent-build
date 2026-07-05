# Findings — ramtop / shepherd / WS-29 launch-compliance

Session span: 2026-07-04T08:43Z (mandate lc-orch-1) → still live (2026-07-05, quiesced)
Agent: shepherd (WS-29), Claude Opus / Claude Code harness, single lane (WI-1507 + incidentals).

## 1. Incident timeline

- `08:43Z` — mandate lc-orch-1 received — read on spawn — OK; posted sign-of-life lc-1. **Did NOT arm an inbox monitor** (root of incident below).
- `~09:12Z` — orchestrator posted lc-orch-2 (ruling B + PR #1896 merged) — **NOT detected** (no inbox monitor armed) — sat unactioned ~2h.
- `~11:11Z` — orchestrator posted lc-orch-3 (2h-silent probe) — also **NOT detected** — same cause.
- `~11:15Z` — user message "you've lost your clacks" — detected via **operator**, not tooling — recovered: armed id-cursor monitor `bqgrv7i8f`, seeded seen=lc-orch-1..3, replied lc-3, then executed ruling B.
- `~12:00Z` — SOL-clock defect: emitted `expect_sol_by` = copied template values landing in the PAST (lc-8=13:45Z, lc-9=15:30Z while real ≈16:23Z) — detected by **orchestrator** flagging twice (lc-orch-9/10) — recovered: compute `ts`+`expect_sol_by` from `date -u` at write time.
- No session death, no stall of my own process. My "incident" was a **silent comms-channel death**, not a crash.

## 2. Comms losses

- **lc-orch-2 (ruling) + lc-orch-3 (probe): sent → never actioned for ~2h.** Channel: lane inbox.jsonl. Cause: **I never armed a monitor on my own inbox** at spawn. I posted sign-of-life but had no watcher, so orchestrator→shepherd was one-directional until the operator poked me. This is exactly the failure WI-1235 (shepherd spawn: arm monitors + SOL BEFORE reconcile) predicts.
- No losses in my → orchestrator direction (outbox appends landed; orchestrator acted on lc-2/lc-8 promptly once I was live).

## 3. Rulings & operator-action backlog

Full pending backlog I am sitting on (none self-rulable under standing directives):

- **WI-1507** (closure check) — Stage=Reviewing, **State=Awaiting-Info**. Blocked on: operator/DPO — the C-5 DPO-appointment + DPIA-signature launch gate (my verdict was engineering-ready / legal-gate-unsigned). Not agent-rulable. Duration: since ~13:00Z 07-04.
- **WI-1558** (DPIA A13 name-minimization vs verbatim learner name to LLM, P1) — Captured. Blocked on: **product + counsel** strip-vs-disclose ruling. Operator-surfaced. Not self-rulable (legal-doc + pedagogy tradeoff).
- **WI-1559** (controller-entity mismatch, Cognoco s.r.o. vs Norway TODO) — Captured. Blocked on: **counsel** (which legal entity is controller). Not self-rulable.
- **WI-1561** (stale store data-safety worksheet) — Captured. Deferred by design: folds into WI-1577 (must reflect final pre-submission state).
- **WI-1577** (FINAL GATE, pre-store-submission re-run) — Captured. Blocked on: **operator/PM timing** (future; don't start early).
- **OPS action** (mine-flagged, routed to operator): prod-catalog `to_regclass('public.accounts')/('public.consent_states')` check for WI-1442 legacy-delete-path reachability. Out of shepherd lane (live-prod read).
- **Honest self-rule check:** the two items that WERE self-rulable (WI-1557 analytics overclaim, WI-1560 profiling disclosure) I ruled + executed autonomously without gating the orchestrator — correct. No self-rulable backlog remains; the rest genuinely need counsel/product/operator or future timing.

## 4. Token / rate-limit events

- No rate-limit window hit my session directly.
- **Burn contributor (mine):** the SOL-clock defect made the orchestrator's deadline-governs-ping logic fail open → it fell back to raw ~10-minute pinging of my lane. Pure overhead wake/probe traffic on a demonstrably-alive dormant lane. Supports H2.
- **Minor wasted work:** one failed `/cosmo:execute create` (origin-UUID bug, §5/H4) forced a re-run via `/cosmo:capture`; one completion-summary edit cycle burned on an over-eager hex trip-wire. Small, bounded — no loop-retry spiral.
- Liveness ceremony ratio: of ~12 inbox messages, most were probes/check-ins/stand-downs (lc-orch-3/4/6/10/11/12), not work — a lot of the lane's traffic was heartbeat, not delivery.

## 5. Root-cause hypotheses

- **H1 (rate-limit kills, no auto-recover):** no direct rate-limit data. BUT adjacent support — my Clacks monitor was dead with **no auto-recovery** until a human intervened. The "nothing auto-recovers a dead comms path" theme holds even though the trigger wasn't a rate limit.
- **H2 (too many lanes / burn spiral, probe overhead crowds out work):** **SUPPORTING.** My SOL bug directly caused fallback 10-min pinging; heartbeat/probe traffic dominated my message count vs ~2 real work units. Probe overhead is real and self-inflicted here.
- **H3 (long sessions drift from canon):** **MILD support.** I held most canon well (claim→complete via `complete`, F35 hold-merge, worktree-setup skill, three-bucket note). One concrete drift: **I skipped the arm-monitor spawn step** (WI-1235 canon). Long-session drift wasn't the issue; **spawn-time** omission was.
- **H4 (recent ZDX/Cosmo/Quartet changes regressed behavior):** **SUPPORTING — two concrete tool defects hit me:**
  - `/cosmo:execute create` stamps the **origin page-UUID** into `related_items`, then the WI-ref resolver misparses its leading digits as a work-item number → `no work item with ID number 3928` → create failed for all rows. Worked around via `/cosmo:capture --origin-wi WI-1507`. This is a real regression in the execute→capture linkage path.
  - `/cosmo:execute complete --validate` hex trip-wire flags a SHA **even inside a full `github.com/.../commit/<sha>` URL** → forced me to strip the commit ref from the summary body (belongs in Fixed In anyway, but the trip-wire is over-eager). Cost one edit cycle.
  - Both are recent-machinery friction, not canon drift. Neither blocked delivery but both burned cycles.
- **H5 (two orchestrators + shared-checkout friction):** **SOME data.** Worktree-per-WI isolation worked — no main-branch race hit me. Friction seen: `pnpm env:sync` dirties `apps/mobile/eas.json` in every fresh worktree (had to leave it unstaged each commit — own-work scope saved me). `_state/` Clacks channels are working-tree files that churn on commit reconciliation (WI-1245, known). Manageable but real.

## 6. What would have saved you

1. **Arm-inbox-monitor as spawn step 0 (WI-1235).** My single worst incident (2h silent comms loss) is 100% prevented by arming the Clacks watcher BEFORE the first sign-of-life. Highest ROI — one procedural line.
2. **SOL from a live-clock helper.** A shared `expect_sol_by = now()+interval` computed at write time (never a copied literal) makes past-dated deadlines impossible → kills the orchestrator fallback-ping burn. Cheap, mechanical.
3. **Resume/park file convention** (what this retro now institutes). A per-lane `_state/resume.md` with EXACT resume state means a dead shepherd is reconstructable without the orchestrator hand-parsing the outbox.

## 7. Keep / kill / fix

- **KEEP:**
  - id-cursor, replay-immune inbox monitor (survives `_state/` truncate/replay storms — WI-1245).
  - worktree-per-WI isolation (zero main-race incidents; own-work scope handled env:sync dirt cleanly).
  - the F35 rhythm: deliver → signal PR# → HOLD `complete` until orchestrator merges → `complete` with the squash SHA. Kept Fixed-In honest.
  - three-bucket closure-note (progress-met / pre-tracked-open / new-contradictions) — reviewer + orchestrator both own-eyes-verified fast.
- **KILL:**
  - template/copied `expect_sol_by` literals — they land in the past and trigger fallback-ping burn.
  - probe cadence that pings a lane which has emitted a fresh, clock-valid SOL — trust the SOL, don't double-poll.
- **FIX (spirit right, mechanics wrong):**
  - **Shepherd spawn:** arm the Clacks monitor as the FIRST action, before sign-of-life (WI-1235). One-line kickoff reorder.
  - **`/cosmo:execute create`:** stamp the origin **WI-ID ref**, not the raw page-UUID, into `related_items` (or make the resolver skip UUID-shaped tokens). One-line fix in the origin-stamping path.
  - **`complete` hex trip-wire:** allow a hex that is part of a full commit URL; only flag a *bare* standalone hex.
  - **SOL computation:** compute from live clock at write time; never reuse a prior literal.
