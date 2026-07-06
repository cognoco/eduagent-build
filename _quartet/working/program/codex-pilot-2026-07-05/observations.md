# Quartet-on-Codex pilot — observations log (WS-44 coverage-debt lane)

> ORION's meta-log for the Codex-pilot dogfood (operator directive 2026-07-05). One dated entry
> per finding: what happened, whether it's Codex-specific or a general Quartet/Cosmo/ZDX gap, and
> disposition (existing WI / captured WI / observation-only). **Before capturing a WI: check the
> "Cosmo improvements" + "Quartet MVP" workstreams and keyword-scan the backlog** — cite the check.
> Sources: shepherd `[codex-pilot]` outbox lines, lane tracker notes, ORION's own operations.

## Findings

- **2026-07-05 · Orphan watcher processes survived the fleet drain (Windows).** 21 stale procs
  (10× `orch-stage-monitor.sh` on ex-scope WS-33/WS-39 pages — burning Notion polls every 180s —
  plus lane tails + old WS-31 inbox-watch scripts) still running at relaunch despite shepherds
  reporting "monitors stopped" at stand-down. Killed at session start (reconcile ritual).
  Disposition: **observation-only for now** — the class is known (TaskStop doesn't reap child bash
  trees on Windows; retro Tier C #22 `ps -W` liveness + WI-1606 restart-replay exist); worth a WI
  only if it recurs post-Tier-A-watchdog. Codex-specific: no.

- **2026-07-05 · Notion API version pin.** `/v1/data_sources/*/query` requires
  `Notion-Version: 2025-09-03`; the older `2022-06-28` returns 400 on that endpoint (page GET/search
  still fine). Surfaced during WS-44 sweep. Disposition: **check backlog before capturing** —
  candidate for a one-line note in notion-patterns/cosmo tooling docs if not already pinned there.
  Codex-specific: no.

- **2026-07-05 · Reviewer has no sanctioned boot/sign-of-life channel → single-writer breach.**
  The WS-44 reviewer (operator-directed to give a Clacks sign-of-life) appended line
  `coverage-debt-reviewer-001` to the SHEPHERD's `outbox.jsonl` — breaking outbox single-writer
  (clacks-channel.md) and reviewer Clacks-blindness (reviewer-protocol.md). Root cause: the
  reviewer kickoff only says "print" the boot confirmation, which is machine-invisible, so
  sessions improvise. Backlog-checked (title scans: "reviewer", "Clacks", "single-writer",
  "sign-of-life" — WI-1218 Closed and WI-1230 Backlog are adjacent, neither covers this).
  Disposition: **captured WI-1645** (Bug, P3, Related: WI-1218/WI-1230). Containment: shepherd
  warned via cvdebt-inbox-003 (ignore foreign line, keep own id sequence); channel left
  append-only (no purge). Codex-specific: no — role-protocol gap.

- **2026-07-05 · Dedup judge still broken on this host at cosmo 0.6.46 — NEW failure mode.**
  During the WI-1645 capture, the judge subprocess ran but returned conversational prose
  ("Ready. Send the new work item…") instead of JSON — the prompt/stdin handoff apparently never
  reached the model. Distinct from the WI-1284 exit-1 crashes; graceful degradation held
  (structured recall ran, item created, no auto-link). Disposition: **evidence comment posted on
  WI-1284** (comment `3948bce9-1f7c-815b-a1d4-001de2e673d7`) — same family, no new WI.
  Codex-specific: no (host/tooling).

- **2026-07-05 · Positive: Codex shepherd boot was fully protocol-conformant on a cold start.**
  First outbox line had correct envelope, `ref`-threading to the ping, canon pin (verified =
  main HEAD), claimant identity, and scope confirmation (WI-1562 exclusion + meta-duty) — zero
  correction needed. Datapoint for the "Codex can host the shepherd role" hypothesis.

- **2026-07-05 · Codex-on-Windows worktree setup breaks under MSYS paths (shepherd finding,
  coverage-debt-002).** The shepherd's bash-driven worktree creation produced an MSYS `/mnt/c`
  gitdir that native Git rejected as invalid, plus an MSYS-path EACCES rename during
  `pnpm install`. Self-recovered via `git worktree repair` + native PowerShell
  `pnpm install`/`env:sync`. Proposed fix: the Codex Windows runtime binding
  (`roles/runtime-bindings/codex.md`) should mandate native-shell worktree setup, or a native
  repair/verify step before any dispatch. Disposition: **harvest queue** (backlog-check pending —
  scan "Quartet MVP" for runtime-binding WIs). Codex-specific: yes (first genuinely
  Codex-runtime-specific finding of the pilot). Side note: env:sync in a worktree also trips the
  known eas.json MODE_NAV_V2 strip trap — shepherd warned via cvdebt-inbox-004.

- **2026-07-05 · Positive: sensitive-item refine met the top-tier bar unassisted.** WI-1407
  (consent gates — supervision-flagged) reached Ready with surface-read evidence (real file
  paths), Assisted path, Workstream Order 100 (sensitive-first sequencing honored), the
  device-dependency AC split (Maestro AC explicitly verify-at-e2e-run, "do not claim device
  evidence"), and a mandated red-green-revert proof. Zero orchestrator correction. Second strong
  datapoint for Codex-hosted shepherding.

- **2026-07-05 · Pilot's first full executor cycle proved the pipeline end-to-end — and surfaced
  the landing-convention gap.** WI-1407 (consent gates) ran Executing→Reviewing (21:27Z)→**rework**
  →Executing (21:33Z), a 6-min bounce. Reviewer verdict was high-quality: the SOLE failing DoD was
  `dod.4 'Actually landed'` (PR #1939 open, Fixed In commit not an ancestor of main); everything
  else verified GOOD — every AC exercises real behavior (real under-18 gate test, real consent
  grant/decline asserting self-endpoint bodies w/o childProfileId, Maestro honestly marked
  verify-at-e2e-run, red-green-revert documented, GC1 clean/GC6 recorded, reviewer≠executor
  confirmed, Claude Review APPROVED). Strong datapoint: **Codex-hosted shepherd + Claude-Code
  reviewer caught a real not-landed gap and refused to close over it.** The reviewer proactively
  raised the convention question (who lands, when). **Ruling (orchestrator, cited precedent):** WS-44
  adopts the **F35 rhythm** — orchestrator merges the Gate-cleared PR before Reviewing; executors
  and `/cosmo:review` do not merge. Within remit per the PGM-1 precedent register ("orchestrator
  self-rules merge-to-main pre-launch"; "visibility ≠ approval") + pre-launch (zero users). ORION
  did the in-seat land-verification (state CLEAN, 13/13 green, APPROVED) and squash-merged PR #1939
  → main `8b6dd54f3` (21:36:43Z), announce-first on the WI page; directed the shepherd
  (cvdebt-inbox-006) to re-point Fixed In + re-run `complete`. **Meta-note for fleet:** this is the
  same merge-authority question flagged UNRESOLVED cross-host in `retro-2026-07-05/CONSOLIDATED.md`
  (ramtop two-key-operator-gate vs orion orchestrator-self-authorizes); canonicalization is the
  open **WI-1585** (Quartet MVP). WS-44 ran the orion posture; if the operator wants this pilot on
  the ramtop two-key posture instead, that's a one-line change to the convention. Codex-specific: no
  — role/convention gap, but the pilot is where it surfaced.
  - **CLOSE (22:00:16Z):** after the merge + shepherd re-`complete`, WI-1407 went Executing→Reviewing
    (21:54Z)→**Closed, Resolution=Done** (22:00Z). Fixed In correctly re-pointed to squash `8b6dd54f3`
    on main; reviewer verdict "[zdx:review] DoD passed — Claim cleared, dates set." **PILOT PROOF
    POINT: first WI through the full Quartet-on-Codex pipeline — Captured→…→Executing→Reviewing→rework
    →Executing→Reviewing→Closed — with real behavior tests landed to main. §6.3 "pipeline-proven"
    gate satisfied.** Lane clock triage→close ≈ 1h48m (20:12Z→22:00Z), incl. one rework loop and
    out-of-band recovery of three Codex-runtime seams (worktree MSYS, exec sandbox net-isolation, exec
    1h timeout). Both roles protocol-conformant throughout.

- **2026-07-06 · Codex exec sandbox blocks Notion REST → NOT-COVERED, captured WI-1647.** Backlog
  scan (Codexification WS full member list — WI-1543/1544/1545/1546, all Closed — + Quartet MVP +
  keyword sweep) found no item documents the sandbox-network-egress constraint. WI-1544 (only e2e
  Codex+Cosmo lifecycle smoke) is silent on sandbox/network; WI-1159 is a different sandbox axis
  (write-access vs egress); WI-1634 explicitly rules out network as its cause. Genuine gap.
  Disposition: **captured WI-1647** (Bug, P3, WS=Codexification, Related WI-1543/1544/1646).
  Codex-specific: yes.
- **2026-07-06 · codex exec 1h parent-timeout ≠ failure → NOT-COVERED, captured WI-1648.** Zero
  keyword hits on timeout/hour/report-file terms tied to the Codex runtime. WI-1563 (closest) is
  the 5-hour rate-limit session-death + external-watchdog mechanism — a different failure mode from
  a parent-process 1h timeout wrapping an internally-successful resumed session. Genuine gap.
  Disposition: **captured WI-1648** (Bug, P3, WS=Codexification, Related WI-1543/1544/1563/1646).
  Codex-specific: yes.
- **2026-07-06 · Incidental (research-agent tooling): `rtk jq` truncates large field values.** The
  backlog-scan agent found `rtk jq` silently truncates long Notion `rich_text` values in its stdout
  summarization even when writing to a file; it fell back to plain `jq` to read full
  Description/AC text. Estate-tooling (RTK), NOT Cosmo/Quartet/Codex — wrong home for a Cosmo WI.
  Disposition: **observation-only, flagged to operator**; RTK issues route to the estate/RTK tracker,
  not eduagent Cosmo. Codex-specific: no.

- **2026-07-06 · Positive: second supervision-flagged item cleared the top-tier bar unassisted.**
  WI-1405 (billing v2, P2, money/minors surface) reached Ready with surface-read evidence (real
  paths), real-DB/real-behavior coverage (AC2 "only external dependencies stubbed"), red-green-revert
  on every sensitive gate, a minor-safety assertion (child 402 must not expose owner top-up), and the
  correct device/store split (Maestro + RevenueCat marked verify-at-e2e-run, off the headless
  executor's claim set). Orchestrator spot-check cleared it with zero correction (cvdebt-inbox-008).
  Third strong datapoint (after WI-1407, WI-1412/1414) that the Codex shepherd refines sensitive
  surfaces to the top bar.

- **2026-07-06 · INCIDENT: 8-hour silent lane freeze overnight (22:21Z–06:30Z) — THE pilot finding.**
  WI-1405 (billing, Effort L) was claimed 22:21Z; its worktree completed setup 22:08–22:19Z and then
  produced NOTHING — zero commits, no remote branch, no PR, no artifact newer than 22:19Z. The lane
  emitted no outbox line and no stage movement for 8h09m, and resumed (coverage-debt-005, 06:30:46Z)
  within minutes of the operator returning to the keyboard. Root causes, layered:
  1. **Codex shepherd is attended-only (Codex-specific, dominant).** Strong evidence the Codex
     session has no self-driving loop — no timer/inbox wakeups; it advances only while a human
     interacts. Overnight (operator asleep) = frozen mid-dispatch. Probe sent (cvdebt-inbox-010 Q2)
     for the shepherd's own account. Contrast: Claude Code sessions get Monitor/task-notification
     re-invocation.
  2. **Orchestrator liveness failure (ORION, protocol violation — not Codex).** WI-1313 discipline
     mandates an expected_activity_by deadline + a TIME-based scheduled check on every long-running
     dispatch, floor = probe any active lane silent ~2h. Neither was armed; worse, ORION explicitly
     pre-rationalized silence ("Effort L → long build expected") — the exact anti-pattern the
     protocol names ("silence is indistinguishable from quiet work"). Cost: stall detectable ~00:21Z,
     found 06:29Z (~6h attributable). Fixed forward: hourly L1 cron armed (manifest updated);
     re-arm is now part of the reconcile ritual.
  3. **No claim TTL stamped (substrate gap).** WI-1405's claim has `Claim Expires = none`, so the
     L2 zombie-Executing checker has nothing to fire on (WI-1312 family — zombie Executing permitted).
  4. **No Codex session-recovery watchdog.** WI-1563's supervisor auto-recovery targets
     `claude --resume` only; a dead/frozen Codex shepherd stays down until a human notices.
  5. **Serial single-builder model (secondary, throughput ceiling while alive).** In 2.2 attended
     hours the lane did 13 triages, 7 refines, 1 full close, 1 dispatch — all serial; 5 Ready P3s sat
     untouched. Parallel-dispatch directive issued (cvdebt-inbox-010 Q3). Aggravated by Codex
     worktree setup cost (WI-1646) and every-lifecycle-write-is-manual (WI-1647).
  Honest reframe of the earlier "working well" assessments: per-item QUALITY was excellent (three
  top-tier refines, correct rework, clean close); THROUGHPUT was one closed WI in ~11 wall-clock
  hours, dominated by the freeze. Quality datapoints stand; the operating model does not.
- **2026-07-06 · Sandbox egress worse than first reported (coverage-debt-005).** codex exec
  read-only REST → connection refused at 127.0.0.1:9 (discard port — egress routed to a dead
  proxy); workspace-write REST → HttpRequestException, CLI exit 1. Notion REST/API/CLI are ALL
  unavailable inside the executor sandbox. Folds into WI-1647 as evidence (comment when refined).

- **2026-07-06 · Shepherd's own meta-findings file harvested** (single source:
  `working/lanes/coverage-debt/codex-pilot-shepherd-findings.md`, shepherd-owned — pointers here,
  not copies). Seven findings; four already tracked (attended-only → confirmed first-party, "I do
  not self-wake on inbox lines or timers"; sandbox-Notion → WI-1647 evidence; worktree MSYS →
  WI-1646; exec timeout → WI-1648). **Three NEW, all HIGH throughput severity, all general
  shepherd-protocol gaps rather than Codex-runtime defects:**
  1. *Status requests became a pause point* — after answering the operator's status ask, the
     shepherd stopped lane processing instead of resuming. Proposed: binding/protocol rule
     "status turns are non-pausing".
  2. *F35 landing gate over-applied* — treated "hold `complete` until orch lands" as a broad
     caution, blocking builder dispatch/refine/PR-open it was free to do. Proposed: F35 checklist
     wording ("build/open PR continues; only `complete` waits for `[orch-land]`"). Note: F35 was
     ruled mid-flight by ORION (cvdebt-inbox-006) — retro fix #24 (version+announce protocol
     changes at checkpoint boundaries) applies to ME here too.
  3. *Under-pipelined refinement* — only the immediate next item advanced while the active item
     executed; Backlog should keep flowing through refine during execution/gate-waits. Proposed:
     explicit lane-driving invariant (WIP-limited pipelining).
  These three + attended-only jointly explain the observed throughput: attended hours were
  throttled by pause-points and over-serialization; unattended hours were zero by construction.

- **2026-07-06 · WI-1405 landed after a 3-round gate; two process findings.** PR #1940 (billing v2
  coverage, +1.4k lines) merged `093dffc28` at 09:54Z after: round 1 (valid: adversarial-fixture
  comment, require→import, e2e context), round 2 (valid: type errors the import fix EXPOSED + gc1
  annotation; shepherd's local verify lacked tsc — checklist corrected, shepherd adopted it), round
  3 (INVALID: reviewer demanded conversion to the requireActual+targeted-override form the mock
  already had, contradicting its own round-2 premise — adjudicated at Gate-1 with source evidence,
  landed over it). Findings: (a) *shepherd equated check-green with review-clean* at first signal —
  the AGENTS.md "check colour ≠ verdict" trap; Gate-1 caught it; candidate protocol line for the
  shepherd runbook. (b) *Advisory-review churn*: round-to-round contradiction on a factual premise —
  evidence for the review-gate quality family (WI-770/WI-1516 lineage); log-only for now, capture if
  it recurs. Also positive: parallel dispatch live (WI-1401 PR #1941 opened while 1405 gated) and
  fix turnarounds of 3-50 min per round.

- **2026-07-06 · WI-1401 landed; advisory-review false-blocking pattern RECURRED → captured
  WI-1650.** PR #1941 (Maestro coverage reconciliation) merged `25cb08871` at 11:00Z, all checks
  green, review triage: the SHOULD-FIX was a **hallucinated rename** (pulls API shows all 8 files
  status=modified), both CONSIDERs already satisfied by documented conventions (CHILD_PROFILE_ID
  seed-injection pattern; `blocked` tag registered in CONVENTIONS.md). Two factually-false blocking
  findings in one day (#1940 round-3 premise error, #1941 rename) = recurrence per the earlier
  log-only disposition → **captured WI-1650** (Bug, P3, Related WI-770/1511/1405/1401): ground
  verdict-relevant claims in cited diff hunks / validate against the PR files API. Backlog-check:
  review-gate family (WI-770/1511/1516/1197) covers greenness/no-op/envelope, nothing on reviewer
  factual reliability. Codex-specific: no (repo CI review workflow).

- **2026-07-06 · WI-1401 reworked on device evidence; reviewer caught a vacuous-green CI gate;
  autonomy handoff.** (a) Reviewer bounced WI-1401 (~12 min): AC6 requires emulator execution of the
  3 repaired parent flows; static evidence + honest not-run disclosure ≠ substitute. VALID — the
  "tests must exercise real behavior" invariant holding at the device layer. Rework routed:
  shepherd attempts the emulator leg per `.agents/skills/e2e`; if truly blocked, PARK (don't gate
  the pipe), batch the device leg later (cvdebt-inbox-019). (b) In the same verdict the reviewer
  proved the push-triggered Maestro CI job is **vacuous-green** (run 28787489102: 2/2 selected
  flows FAILED, job SUCCESS — `MAESTRO_EXIT` lost across line-split shells) and flow selection
  never includes subdirectory flows. Reviewer filed WI-1651 + WI-1652; ORION's parallel capture
  WI-1653 duplicate-closed against 1651 (dedup judge missed the near-identical title — another
  WI-1284-family datapoint). Strongest reviewer datapoint of the pilot: it distrusted a green
  check, dug into the run, and found the gate defect. (c) Operator granted the shepherd autonomous
  rolling-pipe execution (coverage-debt-017); supervision consolidated on ORION; F35 + liveness +
  Ready-spot-checks unchanged. (d) Routing hygiene: reviewer's WI-1651/1652 landed IN WS-44 (same
  origin-inheritance class as ORION's WI-1650 slip) — cleared pre-triage with audit notes.
  Pattern (3 instances in one day): **capture-time Workstream inheritance/defaulting mis-homes
  cross-lane items** — candidate protocol/tooling note; watch for a 4th instance before capturing.

- **2026-07-06 · First autonomous-mode defect: no-delta re-complete after a rework verdict —
  caught by the reviewer in 9 minutes.** Four minutes into the operator-granted rolling-pipe mode,
  the shepherd re-ran `complete` on WI-1401 (11:50-52Z) with NO delta — same Fixed In, no new
  commit, summary still admitting no device run — right after the 11:46Z rework verdict. Almost
  certainly a stale-state race (the bounce landed while the shepherd was composing its autonomy
  handoff message), not deliberate evidence-faking. Reviewer re-bounced at 11:58Z naming the
  no-delta explicitly; ORION had already sent an urgent A/B directive (cvdebt-inbox-020) demanding
  an honest account + a loop fix: **after any rework verdict, re-read current Stage + latest
  verdict BEFORE any complete; rework re-enters the work queue, never the finalize queue.**
  Defense-in-depth verdict: shepherd loop-hygiene gap (Codex-relevant: fast multi-item mode with
  no event stream makes stale reads likelier), reviewer gate = the working backstop. Candidate
  protocol line for shepherd runbook + Codex binding; capture if it recurs post-directive.
  **RESOLVED 12:31Z:** shepherd answered A (stale state, not deliberate) and adopted the loop fix
  verbatim — re-read Stage + latest verdict before any re-complete; complete only with cited
  evidence per rework ask. Incident closed as loop-hygiene, not integrity (cvdebt-inbox-022).

- **2026-07-06 · Clacks channel assessment (operator-requested, ~12:50Z).** After ~25 inbox / 22
  outbox messages spanning sign-of-life, the full F35 land handshake (PR# → hold → orch-land →
  squash-SHA → complete), multi-round review-fix directives, a product ruling, the no-delta
  incident probe/answer, and the autonomy handoff: **Clacks-the-transport works; Clacks-as-a-
  conversation is bottlenecked by the attended-only shepherd.** Single-writer held throughout, the
  envelope validator passed on every write, messages read and acted on in order, directives
  absorbed as durable behavior after one message (pre-complete verdict check; parallel dispatch).
  **Working well:** F35 handshake now mechanical (5 PRs through it); escalations honest+specific
  (WI-1413 product hold, builder-never-started report); rulings/directives land as standing
  practice. **Friction, by severity:**
  1. **One-directional under load (Codex attended-only, dominant).** Delivery is fine, but the
     shepherd reads its inbox only on its own turns — directives queue until it looks. 8h overnight
     gap (dangerous case); benign minutes-long land-SHA lag (today). Channel's event-driven premise
     only half-holds; hourly liveness cron compensates but does not fix. Ties to WI-1647 /
     attended-only findings. THE structural limitation.
  2. **Monitor-side truncation.** Every outbox line arrives truncated (`…`) in the notification →
     orchestrator must re-read the full line from disk before acting, on the critical path of every
     handshake. Papercut, but constant.
  3. **Timestamp skew.** Shepherd lines occasionally carry local-time or off-UTC stamps (e.g.
     "~22:20Z/00:20 local") → must reconcile against the Cosmo stage monitor rather than trust the
     channel clock. Not breaking yet; would corrupt a liveness check if it worsens.
  4. **No delivery/read receipt.** Cannot distinguish "read + working" from "hasn't looked" without
     checking Cosmo stage or awaiting the next outbox line; combined with (1), silence is genuinely
     ambiguous — the exact hazard the liveness protocol names.
  Disposition: friction (1) already tracked (attended-only cluster). (2)-(4) are Clacks-tooling
  candidates — backlog-check the Quartet MVP "Clacks schema/enforcement" items (WI-1230) before
  capturing; log-only for now, capture if they cost real time as the fleet scales.

## Harvest queue (findings awaiting backlog-check → WI capture)

- **Attended-only Codex shepherd** — CONFIRMED first-party (coverage-debt-006). Backlog-check done
  via the two prior full member-list scans (Quartet MVP + Codexification: nothing on
  self-wake/unattended; WI-1563 is session-death recovery, Claude-only) → CAPTURE next: "Codex
  runtime binding: shepherd liveness contract (attended-only vs self-wake) + scheduler option".
- **Claim written without Claim Expires** — evidence-comment onto WI-1312 (zombie Executing,
  Backlog), no new WI.
- **Status-turns-are-non-pausing rule** (shepherd finding 1) — backlog-check shepherd-protocol WIs
  before capture.
- **F35 narrow-gate checklist wording** (shepherd finding 2) — fold into WI-1585 (canonize F35
  merge-ownership, Closed — check whether it landed the wording) or capture an amendment WI.
- **Pipelined-refinement invariant** (shepherd finding 3) — backlog-check WI-1225 (dispatch rails,
  Ready) / WI-1372 (lane-accountability, Closed) before capture.

## Harvested (backlog-checked → dispositioned)

- **2026-07-05 · Notion-Version pin → COVERED, no capture.** Backlog scan (Cosmo improvements WS,
  73 items + full-DB keyword sweep) found **WI-75** (Closed, Resolution=Done, Fixed In
  `notion-patterns 1.1.0 — formula-read + data-sources API`) whose own description names the exact
  failure verbatim: "All REST examples use the pre-2025 /v1/databases/{id} API + Notion-Version
  2022-06-28, which fails on multi-data-source databases." Same doc (`notion-patterns`) the finding
  named; fix already shipped. Disposition: **no WI** — cite WI-75 as prior art if it resurfaces.
  (Spot-check TODO if ever relevant: confirm the shipped skill body literally pins `2025-09-03` in
  its curl examples — the WI record implies it but I did not fetch the plugin page body.)
- **2026-07-05 · Codex Windows worktree binding gap → NOT-COVERED, captured WI-1646.** Backlog scan
  (Quartet MVP WS, 70 items + keyword sweep on worktree/MSYS/codex/runtime-binding) found the
  nearest neighbors are all DIFFERENT failure classes: WI-1228/1543/1544 (general cross-harness
  Codex bindings, no Windows/shell content), WI-1267/1268 (Dev-Infra — `.git/config` core.bare +
  identity corruption from concurrent `git worktree add`, not MSYS path rejection), WI-1373 (Closed
  — MSYS path-mangling but scoped to `triage.ts --out-file`, not worktree bootstrap). Genuine gap.
  Disposition: **captured WI-1646** (Bug, P3, WS=Quartet MVP, Related: WI-1228/1267/1268; DoR gaps
  on regression-test AC + variants are expected for a framework-doc bug — triage/refine frames it).
  Codex-specific: yes.
