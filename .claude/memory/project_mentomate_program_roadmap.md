---
name: mentomate-program-roadmap
description: "Program-manager role + the MentoMate Productization roadmap page in Cosmo — the durable program-level state (swimlanes, critical path, gates, rulings queue)"
metadata: 
  node_type: memory
  type: project
  created: 2026-07-03
  last_confirmed: 2026-07-03
  status: active
  originSessionId: 21c2badf-43d7-4e6a-ac7e-909be767a3fc
---

## Evening session 2026-07-05 (~15:00–19:00Z) — OPQ rulings + audit (READ FIRST)

- **OPQ-16 GO** → WI-1374/1601 closed Done by PM (independent hand), row Folded-back, relayed.
  Tail: WI-1629 harness fix needs ONE PM independent close when re-finalized (pre-authorized).
- **OPQ-17 APPROVED** (4-point): skill path sanctioned; clone-pull duty into WI-1563 supervisor +
  wake tripwire = upstream-bug workaround (claude-code #73673/#72616, PM +1'd), retire on upstream
  fix; Ramtop remediated (cosmo 0.6.46 via /reload-plugins after clone un-wedge); Surface directed.
- **OPQ-18 = A** → PM added `Executed By` (rich_text) to WI schema; WI-1635 stamping = WS-23; Folded-back.
- **OPQ-19 (WI-1245 cutover) RULED + GO**: D1=A (flat QUARTET_LANE_STATE_ROOT; working-tree-only
  invariant RATIFIED; collision tripwire; lane-move ceremony=rsync over tailnet), D2=A (gitignore +
  WI-1199-D1 same window, surface-if-bigger), D3=A + INSTANTIATE-THEN-RUN rider (canonical scripts
  in git; running instances/pid/logs NEVER tracked, never execute from inside a git tree). Row Closed.
  **Runbook NOW PUSHED**: nexus main `plans/WI-1245-clacks-cutover-runbook.md` (18:55Z). NEXT ACT:
  PM executes RAMTOP-side cutover from it; ZDX machine cuts over post-reboot; orion at relaunch;
  WI-1245 finalizes after all 3 hosts.
- **OPQ-1 R1 PASS** (Zuzka, Galaxy S10e): WS-28 gate CLEAR; riders WI-1640 (/ready crash) +
  WI-1641 (prod secrets drift) filed; prod worker was hard-down (missing 2 secrets), synced mid-run.
  OPQ-5 annotated possibly-overtaken. Ramtop packet updated (3c6a5eb).
- **WI-1526** carries the operator-ratified 7-point orchestrator duty spec (pipeline custodian, not
  dispatcher); precedent-register entry added (8e044c9). WI-1263 refined → portable lane-state
  substrate (Postgres lean; cloud-executor forcing function).
- **ZDX backlog audit** (operator-ordered gate before hand-back, PM + Codex 2nd opinion):
  `_quartet/working/program/zdx-backlog-audit-2026-07-05/AUDIT.md` DRAFTED — 62 items dispositioned,
  8 cross-cutting findings (F-A..F-H: 1525 overtaken by 1631/1632; Reviewing trio 1282/1284/1295
  maybe mooted by codex-default; 1600 stage-less; cross-WS WP incoherence 1515/1518; empty stubs;
  1543 live claim during downtime; prio gaps 1236/1229; zdx-marketplace has NO CI → 1264 P1-bump).
  **PENDING: Codex adversarial pass, then hand to operator.** Slice data in scratchpad
  zdx-audit-slice.json. NOTHING enters ZDX pipeline until operator hand-back.
- ZDX orch reboot pending; relay directive sent (runbook push ✓ → reboot → clone un-wedge →
  own cutover → [orch-status]). Watcher bjsbd8o2b + 2h cron f298c32b still armed.
- Codex-pilot thinking: pilot = Codex builder in ONE self-contained lane (Coverage Debt best),
  Claude orchestrator retained; gates: fleet stable post-relaunch + sanctioned Codex lifecycle
  path WI + WI-1635; WS-43 WI-1544 = the smoke gate.

## AFK autonomous window 2026-07-05 (~12:00–13:00Z) — what happened

Operator AFK; standing order = monitor ZDX Tier-A + execute Phase-E prep autonomously.
- **ZDX Tier A**: WI-1563 supervisor, WI-1618 macOS port, WI-1601, WI-1602 all Closed/Done.
  Still in flight: WI-1245 (Executing), WI-1615 heartbeat writer (Executing), WI-1617 (Captured).
  WI-1614 = real-death validation, can't pre-gate. Cron f298c32b (2h) tracks them.
- **INCIDENT fixed (WI-1628, Bug Lane, P1)**: staging Deploy red 17h (18:45Z 07-04→12:00Z 07-05)
  — 0131 (WI-1504) DDL applied to staging out-of-band w/o journal row → 42P07 on every deploy.
  Verified table complete vs 0131, inserted journal row (hash 6b151cd7…, created_at 1783115884752),
  reran Deploy 28739962624 → GREEN. **0132 M2a DROP verified applied to staging** (5 tables+5 enums
  gone). #1925 was merged BY OPERATOR (bfcc8677a 08:47Z) = the GO → OQ row OPQ-4 Closed w/ evidence.
- **OPQ-16 (new, P1, Open, Authority=Jørn)**: reviewer-harness wrong-CWD commit-check false-bounces
  cross-repo closes; PM verified both commits (WI-1374 da23a6b, WI-1601 ae2a74d) ARE on
  zdx-marketplace main, evidence [pm-note] posted; awaiting Jørn GO → PM executes closes + Folded-back.
- **Priming packets DELIVERED**: `_quartet/working/program/relaunch-2026-07-05/`
  (README + ramtop-packet + orion-packet), pushed 9917ce77f. Ramtop first act = complete WI-1306
  --fixed-in bfcc8677a. Sequencing ramtop → stable → orion. Relaunch spawn itself = operator.
- **Watcher v4.5 re-armed** (monitor bjsbd8o2b; OQ vocab fixed Open/Closed/Bounced; ballot block
  → OQ-guide page 3948bce9-1f7c-8179-b5d4-e55092ed746b) + 2h backstop cron f298c32b. Oneshot
  replay was clean except benign guide-page edit.
- Hetzner AX41-1-LTD provisioning was underway when operator left; capture provisioning WI →
  route ZAF-side when confirmed.

The operator runs a standing **program-manager role** (this agent, top-level advisory) over the
"Mentomate productization" program. Durable state lives in the **page body of the
PGM-1 "Mentomate productization" row in the Cosmo Programs DB** (row page
`3928bce9-1f7c-8130-ac4c-c422e9db928d`; Programs DB `3928bce9-1f7c-81c1-9d9c-fe7c33203c83`,
created WI-1342; the original standalone roadmap page was archived by WI-1343) — swimlanes, critical
path, gate ledger, operator rulings queue, roster. Update it at every checkpoint; Cosmo WIs stay item-level
truth (pointers, never copies). Architecture authority remains the convergence spine
(`_quartet/working/program/fable-audit-prep-2026-07-02/08-convergence-spine.md`, on main since 2026-07-03).

Key lanes created 2026-07-03: **WS-39 Launch Readiness** (page `3928bce9-1f7c-8179-b62e-e4c252a53747`,
INI-32 Operations; holds WI-1328/1310/617 + captures WI-1335…1341) and **WS-40 Program Layer & Program
Management** (page `3928bce9-1f7c-810f-8e37-c2aa646dfc9e`, INI-31 Cosmo, ZDX Productization program;
captures WI-1342…1344; WI-1342+1343 executed inline 2026-07-03, WI-1344 executed by the ZDX
orchestrator → the PM protocol is CANONICAL at `_quartet/roles/program-manager-protocol.md` on Nexus
main). WI-1342 also rolled zdx-standard to 0.14.0 (schema 0.6.0, Nexus PR #32).

State as of 2026-07-03 evening: gates ruled — M2b PRE-AUTHORIZED (Neon-branch-snapshot rider,
[pm-directive] on WS-18), M5 confirm LIVE (recorded on WI-1308); MVP is Google-Play-only
(production EAS profile Android-only); RevenueCat product scope = Option A (all 7 products,
Plus-only offering; ruling on WI-1328). Orchestrators: ramtop = WS-18/22/28/37 (+29/35/36 hold),
orion = WS-31/33/39 (+34 hold); coordination = [pm-directive]/[orch-ack]/[orch-escalation]
comments on Workstream rows, which carry Orchestrator/Host/Expected Next Event props
(schema.md lockstep catch-up = WI-1366, WS-40). PM detection = background code watcher
(~4-min Notion poll of owned workstream rows, event-driven agent wake) + 2-h backstop cron —
BOTH SESSION-BOUND: re-arm at every session start. Watcher = v4 script at the session scratchpad
`pm-watch-v4.sh` (supports a `oneshot` arg): ALWAYS run one foreground `oneshot` pass and see the
"PM-WATCH ARMED: N workstreams, N keys" line BEFORE arming the Monitor. Gotchas (dogfood, v2+v3
both failed silently): monitor shells don't source the login profile → self-source
`eval "$($HOME/.local/bin/estate-secrets env)"` and FAIL LOUDLY if the token is still empty; never
`curl 2>&1` into a var you then jq (stderr noise breaks the parse while the head looks valid) —
body to a file, stderr separate, and report WHICH stage failed in the DEGRADED line.
SPEC-CORPUS TRIAGE state (2026-07-04 ~10:10Z): Phases 0-2 DONE (register + 27 sheets + decision
pack at `_quartet/working/program/spec-triage/`, all on origin/main). Phase 3 OPEN as a facilitated
WALKTHROUGH (operator rejected the fill-in ballot): script = `spec-triage/walkthrough.md` (repo,
2a14b8c) mirrored to Notion page `3938bce9-1f7c-81a3-8106-ecdacd1f6eeb` ("Phase-3 walkthrough…",
child of PGM-1) — 7 items, facilitator-agent instructions at top, rulings verbatim under RULING
lines, ⚠ = Jørn co-sign (architecture/tech + calendar + spend). Operator queue PRE-CLEARED: WI-1393
FINISH (WS-33, orion accepted, top priority); beta WI-1506 = PUBLIC-launch gate (store tracks
ungated); analytics first-party (PostHog fast-follow); RLS app-layer; WS-29 hold LIFTED (WI-1507
early pass running); coverage-debt lane = WS "Coverage Debt" 3938bce9-1f7c-81ad-add6-f36bf7c317bc
(orion, non-gating, WI-1401-1414 minus 1400/1406); G1/G2 = WI-1555/1556; 10 factual kills CLOSED
(9 + WI-1508; Resolution select restored to Done/Wontfix/Cancelled/Duplicate after a page-PATCH
auto-created a stray option — Notion gotcha). Phase 4 pre-staged vs CAPACITY READS: orion LOW slack
(WS-39 SHEPHERD DARK — do not assign until respawn; ~8 WS-39 items operator-gated; WS-33 can take
1-2; WS-31 saturating), ramtop WS-18 fully loaded until M2a (chain WI-1524→1398→1139→1306) — on Q7
ratification release only WI-1456+1451 to WS-33, rest queues on: WS-39 respawn / WS-31 wave lands /
M2a clears. Cloud: WI-1562 cloud-executor pilot (Coverage Debt WS, RUN FROM RAMTOP per operator;
candidates WI-1402/1403/1404; starts on operator go); WI-1563 shepherd supervisor (WS-40, route to
ZDX orch via operator; rate-limit window is the real shepherd-killer — NOT host sleep, operator
corrected); VM (B) deferred pending 1562 verdict (sizing: 8vCPU/24GB, Contabo first); GH-Actions
executor (D) parked. OPEN HUMAN ITEMS: Zuzka walkthrough session + R1 device re-run on her S10e
(update group c46e0177, WS-28 ENE 15:00Z — gates M4→M5→ship); Jørn ⚠ co-signs; WS-39 shepherd
respawn (orion); Play Console setup. Spell the operator's name Jørn (ø). Watcher = v4.3
(`pm-watch-v4.sh` in session scratchpad): PM-self-noise filtered, date-only ENE = end-of-day,
ballot-page comments+edits watched; ALWAYS oneshot-proof before arming. State at pause: M1 COMPLETE (WS-37 graduated; capture WI-1355); WS-39 EXECUTING
(WI-1336+1340 landed); WI-1176 closed Gate-2, Bug Lane drained; WS-28 combined remediation
IN FLIGHT (V0-flag PR → republish → R1 re-run; awaiting operator GitHub production-Environment
approval; ENE was 19:30Z PR/Gate-1); WS-18 M2a pre-chain CONFIRMED
(2026-07-03 23:35Z): WI-1364 DONE (−9.7k lines) → WI-1398 (Ready) → WI-1139 → M2a → M2b; WI-586 FK
risk RETIRED (0129 covers). M2b pre-auth acked. Execution-Candidate batch dispositioned: WI-1503/
1505/1500/1504 → WS-39 (1504 sink ruled FIRST-PARTY events, PostHog fast-follow), WI-1507 → WS-29
(hold-lift pending operator), 5 trust items Type=Design → Zuzka session, WI-1508 killed dup,
WI-1506 beta = OPEN operator calendar ruling. PGM-1 body annotated with all of
this; visual board NOT yet regenerated for the re-wire (deferred pending new WI id + FK verdict).
Board gained orchestrator color stripes from another session (commit a01f42cea, "Test User"
unconfigured git identity — flagged to operator).

FLEET QUIESCE + RETRO (2026-07-05, operator-ordered): drain both orchestrators (no new claims,
land-or-park, findings docs per `_quartet/working/program/retro-2026-07-05/TEMPLATE.md`, commit
4dd445b09; hypotheses H1-H5 in README — H1 rate-limit-no-recovery + H2 over-concurrency burn spiral
are PM's lead causes; version-skew note: plugin skills load at session start, Quartet canon at
grounding → fleet ran mixed versions). Quiesce [pm-directive]s posted to WS-18 (ramtop) + WS-39
(orion) rows. Process A-E: Quiesce → Capture → PM Triage (incl. independent keep/revert verdict on
last-72h ZDX/Quartet changes + WS-23/26/43 fast-track scoring) → Refit → staged Relaunch (ramtop
first). Throughput datum from operator: ~12 WI closes on 65% of a Max-20x day vs baseline
~2/supervised-hour. OPERATOR QUEUE (WI-1596, Quartet MVP WS `38e8bce9-1f7c-816f-b5cd-c55b3c12c81d`,
PM-executed, review PM+operator directly, never move to Reviewing): Notion DB
`3948bce9-1f7c-8100-96d9-d78f2351a442` (parent = Cosmo home page 3578bce9-1f7c-8082-94a5-d2c9347a2b44)
— rulings/operator-actions/co-signs; Options+Recommendation mandatory; Authority split Zuzka=product/UX,
Jørn=arch/tech+calendar+spend+gates; PM = triage front-end (bounce-back→precedent register, batch to
operator, relay rulings as [pm-directive]). Seeded: R1 device run (Zuzka), WS-29 relaunch (Jørn,
defer to Phase E), WS-39 respawn (Jørn, defer to Phase E). WI-1597 = Quartet canon wiring
(program-manager-protocol.md + orch/shepherd guidance + precedent register seed; Nexus-repo edit
under Hex posture, operator reviews diff). Watcher now v4.4 (adds Operator Queue polling: emits new
open rows + transitions to ruled).

RETRO PHASES C-D + STATE as of 2026-07-05 evening: Phase C DONE — 10 findings docs →
`retro-2026-07-05/CONSOLIDATED.md` (17 incidents; H1 CONFIRMED rate-limit-no-recovery, H2 SUPPORTED
but = fixed-cadence not lane-count, H3 mostly REFUTED, H4 PARTIAL/split tool-bugs-vs-absorption, H5
SUPPORTED = tracked `_state` files, fixed both hosts) + `ws-backlog-scoring.md` (51 items, 11
FAST-TRACK) + `DECISION-PACK.md` (24 fixes tiered; gaps captured WI-1601..1608). Tier-A ruled: ZDX
orch delivers code (WI-1245/1601/1602/1563 — supervisor framework SHIPPED at framework scope,
live recovery pending OPQ-14 carves WI-1614/1615/1617/1618); PM delivered canon (nexus@0a2cc42
merged: DRAIN tier + ambiguity→soft + ack tier banner; class-based merge authority
two-key-irreversible/self-rule-ordinary; SESSION-HANDOFF.md standard; watcher-replay rule;
version-awareness = ship-anytime + pinned/checked versions [operator chose over respawn-boundary];
bypass-evidence rule from WP-1520 incident [operator approved a bulk-close on a paraphrase — rule:
verbatim guard output mandatory]). WI-1596/1597/1599/1564/1585/1603/1606 all CLOSED on operator
authority. OPERATOR QUEUE LIVE (DB 3948bce9-1f7c-8100-96d9-d78f2351a442): Type=Approval/Decision/
Action (co-sign folded into Approval+Authority), Status=Open/Closed/Folded-back/Bounced, Priority
P0-P3, Work Items dual relation + operator-added ID/lookups/People-Authority; 14 rows incl. P0 R1 +
P0 WI-1306-merge-GO + Phase-3-walkthrough row (Zuzka); ruling-session guide page
3948bce9-1f7c-8179-b5d4-e55092ed746b (Notion-native, for Zuzka's orion agent — prompt handed over).
Notion API gotcha: select options can't be renamed in place, only replace-and-remap (option removal
CLEARS row values). OPQ-14 RULED+Closed via first full queue cycle: `claude -p` VETOED fleet-wide
(Max subscription won't cover print mode) — recovery = interactive `--resume` per-OS (Windows:
watchdog in logged-on user session + auto-logon + wt.exe; macOS/Linux: detached tmux; WI-1618 =
tmux variant); no recovery claim until real rate-limit-death validation; relayed on WS-26 row,
precedents pushed (a20a8c77d). CLOUD PILOT (WI-1562): leg 1 = WI-1403 delivered by background
executor (branch WI-1403 @ cea42b6bb, green vs stg DB, red-check proven) BUT ran LOCAL (remote
gated) — cloud half unproven; findings: jest modulePathIgnorePatterns silently skips
.claude/worktrees (use scripts/setup-worktree.sh → .worktrees/), commitlint has no `test` type.
VPS RULING CONVERGING: 128GB-for-local-LLM rejected (CPU inference bandwidth-bound, ~1 tok/s on
70B; worst co-tenant for shell snappiness); auction i7-7700/HDD rejected (4 cores, spinning disks);
choice = AX41-1-LTD 64GB DDR4/2×512 NVMe (~€59 FSN / €68.19+€2.02-IPv4 = €70.21 HEL quote seen)
vs AX42 €99 — PM rec at €40 gap: AX41-1-LTD is the rational buy (snappiness = RAM+NVMe+systemd
slice isolation, not peak CPU). Ubuntu 24.04 LTS ruled. Keep primary IPv4 (GitHub is v4-only;
inbound = tailnet-only, default-deny public). No minimum term (hourly-capped, €0 setup, cancel
anytime, cancellation wipes disks). Operator was at checkout — on order confirm: capture
provisioning WI (Tailscale join, default-deny, SSH-tailnet-only, systemd slices agents-vs-shell,
node/pnpm/CC toolchain, estate secrets) → route to ZAF side. WATCHERS ALL STOPPED (fleet down;
monitor + backstop cron cancelled) — RE-ARM watcher v4.4 (`pm-watch-v4.sh`, session scratchpad;
oneshot proof first) + 2h backstop cron at Phase E; watcher also polls OQ (new Open rows +
transitions). PHASE E PENDING: ramtop first (first act = OQ P0 WI-1306 merge GO → M2a), then
orion; priming packets NOT yet built (canon pointers + precedent register + OQ convention +
park/resume state + pinned versions). Open human: R1 (Zuzka P0), Doppler prd secrets
WI-1336/1340 (pre-Phase-E), walkthrough 7 rulings, Hetzner order.

Repo state: audit bundle PUBLISHED — operator ruled 2026-07-03 ~16:20Z "push local eduagent main
to origin"; main pushed (8834506ec), local == origin. The push gate is CLOSED; the spine + Phase-B
docs + .cosmo consolidation are on origin/main. No unpushed program state remains.
Housekeeping: .cosmo/ is the single Cosmo-artifacts home (.cosmo-artifacts consolidated in,
.worktrees-artifacts/.claude-artifacts/scratchpad discarded by operator); do NOT gitignore yet —
a design WI in the Cosmo workstream (WS-23) owns that. .merge-backup-2026-07-03/ holds 4 files
whose local copies differed from origin at sync (fallback-ota workflow, language-session-engine
ts+test, retired-code.md) — owning lanes to reconcile, then discard. Visual roadmap: embedded in PGM-1 body
(Notion attachment) + repo copy `_quartet/working/program/mentomate-roadmap.html`
(eduagent-build main, 8f8696fd1) — PM regenerates both on state changes.
