# PRG-06 ORCHESTRATOR — World-State / Compaction Anchor (refreshed 2026-06-16 ~11:40Z)

> I am the **orchestrator** of **PRG-06 "Identity Cutover" (WS-18)**, coordinating the Quartet (orchestrator=me, shepherd, executor pool, reviewer) toward the operator-only **#8 flag-flip gate**. Operator goal: drive autonomously to #8; minor compromises OK if documented.

## ⚠️ READ FIRST — rehydration contract (Approach-A self-test)
- **Cosmo (Notion) = source of truth.** The Clacks file channel (`_wip/identity-cutover/_state/`) is working-tree-only, can be wiped by a resync — trust it less than Cosmo/git.
- **This doc is my durable memory.** On resume/compaction: read THIS + Cosmo WS-18 + inbox/outbox tail = caught up. Don't rely on the auto-summary alone.
- **EXPERIMENT NOTE:** this compaction is the orchestrator-side run of the Approach-A pilot (shepherd runs the same via `shepherd-world.md`, already did rewrite #1 — captured state well, early positive signal). Post-compaction-me: assess whether you rehydrated cleanly from this doc; report it to the operator as the experiment data point (overhead? resume-ready vs degraded-summary?).
- Comms: EXTREMELY concise, PM/architect register; closing bracketed-caps summary blocks.

## NOW / next actions on resume
1. Verify monitors live: mine = `byvzok4m7` (shepherd outbox), `by952eysh` (Cosmo WS-18). Shepherd's own = `bg9b27d7l` (inbox), `bsm1ix557` (Cosmo). Re-arm mine if dead.
2. Surface ONLY these signals (don't narrate): (a) **#1210 pushed + green + ready for Gate-2** → cue operator to engage reviewer; (b) progress/blockers on the **2 net-new twins** (the true critical path); (c) **staging rebuild done** → my territory (rehearsal → I own #4 entry + #6 STOP-1 with the Neon snapshot).

## WI-586 — SPLIT (operator-approved 2026-06-16); drop is PROVEN GREEN
- **MILESTONE: clean-DB proof GREEN** (prg06ic-077) — exec replicated the CI flag-on lane on fresh PG, committed chain 0→0118, no manual SQL/no faked tracking, clean exit, end-state correct (4 identity tables dropped, subscriptions + v2 retained). The destructive migration is empirically proven.
- **REDEFINED close-gate (SPLIT):** clean-DB proof GREEN (DONE) + the **~7 identity prod-readers flag-gated-safe** so flag-OFF prod has NO 500 at/after drop. NOT full flag-on integration green. (Header says 7, inventory enumerates 5 C + T1 — reconcile.)
- **586 CRITICAL PATH NOW = author 2 net-new v2 twins (PATCH /profiles/:id, PATCH /account/email) + wire 5 + staging rebuild (d).** The 2 twins are the real remaining work.
- Branch WI-586 @ 9d79305 (17 ahead origin/main, UNPUSHED; push when pre-push green, do NOT --no-verify; committer cleared — see below).
- **WI-808 = CUT-B** (created, Item, Backlog, P2, Related-586): the v2 test-fixture migration (~60 files) + broader non-flip-critical reader cutover + drive flag-on integration suite green. Parallelizable from now; NOT flip-gating. Shepherd promotes→WP + domain sub-items when it starts it.
- **WI-805** = billing carve (subscriptions drop + ~18 billing readers, POST-FLIP) — but its **billing cron (quota-reset.ts, ~5-line wire) is FLIP-CRITICAL**.

## FLIP-CRITICAL INVARIANT — 8 items MUST land before prod flip #8
- 7 identity prod-readers (in WI-586) + 1 billing cron (quota-reset, WI-805 flip-critical sub-part). This set — NOT full-suite-green — is the real flip gate. Flip-safety = these + the staging rehearsal (static inventory is the more complete view than discover-by-test-failure).

## Why SPLIT (rationale, in case challenged)
- The original "drive flag-on integration green" gate was a MISREAD: the flag-on suite was ALREADY ~mostly red pre-drop (192 pass / 488 fail) from ~60 test files seeding dropped legacy tables (pre-existing v2-migration fixture debt), NOT caused by drop-4. SPLIT corrects the scoping: 586 = drop+proof+prod-reader-flag-safety; WI-808 = the fixture/test-suite migration. The app becomes testable at the staging flip regardless of WI-808 (test scaffolding ≠ app function).

## Gate delegation (durable: memory project_586_gate_delegation.md + Cosmo 586 comments + plan §4)
- #4 (entry) + #6 (STOP-1 pre-reseed) = MINE under conditions (rehearsal green + parity exact; abort-to-operator; notify each; **Neon branch snapshot before disposal**).
- #8 (flip) + #11 (M-DROP) = OPERATOR-ONLY. Un-delegated STOPs default to operator.

## Neon
- neonctl authed on Ramtop as jorn.jorgensen@zwizzly.com (broad-admin; OAuth ~/.config/neonctl; no API key). Project **lingering-violet-30592106** (eu-central-1). dev=`br-weathered-silence` (ep-muddy-sunset; PITR-restored to 2026-06-16T00:00:00Z); staging=br-delicate-star (ep-fancy-cherry); prod=`production`/br-green-pond (ep-holy-leaf). Damaged dev snapshot = **dev-damaged-20260616** / br-spring-mode-agn4bhte.
- #6 snapshot cmd: `neonctl branches create --project-id lingering-violet-30592106 --parent production --name pre-drop-<date>`.
- ⚠️ Restored dev is push/drift-managed — NOT a valid close-gate proof surface; proofs run on fresh ephemeral PG (CI-lane replication).

## S4–S6 (mentor-is-the-app shell redesign) sequencing — for soak-parallel planning
- S0–S3 = identity-INDEPENDENT (can run now). **S4/S5 = identity-DEPENDENT** — need the new model LIVE (= the flip), NOT the cutover fully torn down → can run DURING soak in PARALLEL with cleanup (805/794/779/808), coordinated. S4 carries a column-repoint migration + touches shared identity/nav surface (coordination cost).
- **2nd gate on S4+ (independent of cutover): S1+S2 discovery EVIDENCE** — program not committed as a unit; S3–S6 proceed only if S1+S2 measure positive. **Check S1/S2 status — that evidence gate, not the cutover, likely governs S4.** (spec: docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md §11.)

## Crash recovery + DB issues (RESOLVED 2026-06-16)
- Host rebooted ~08:30Z; both sessions reborn; committed work survived; only uncommitted exec work lost + re-dispatched (exec586b, now at rest). Monitors re-armed.
- Issue-1: proof MUST run on a CLEAN full-chain DB (never shared dev) — SATISFIED (green). Issue-2: shared dev PITR-restored; no external sessions exist (only the Quartet — the "other sessions breaking" claim was my overstated relay).
- **Committer cleared:** all WI-586 commits incl a6887c103 = uniform fleet identity (Lord Vetinari/vetinari@zaf.fleet); no 2nd executor; a6887c103 = exec586b's own untracked commit (context-gap). Branch clean/linear/single-worktree.

## Context-management experiment (operator side-quest, ACTIVE)
- Principle: context = disposable cache; substrate = truth. Order ruled: **A (state-doc) first, then D (PreCompact/SessionStart hooks in project settings, role-aware via QUARTET_ROLE; sub-agent-hook behavior = unknown to verify before building D).**
- Pilot live: shepherd owns `shepherd-world.md` (ic-orch-056; rewrite #1 done, good). THIS doc = orchestrator-side run; THIS compaction = the orchestrator self-test.
- **Approach-D LIVE (2026-06-16, operator-approved "execute"):** SessionStart rehydration hook in `.claude/settings.local.json` (gitignored) → `_wip/identity-cutover/_state/quartet-hooks/rehydrate.sh`. Auto-injects THIS doc's pointer + Cosmo WS-18 + LIVE channel tail on SessionStart `startup|resume|compact`. Gate = session-id registry (`quartet-hooks/roles.json`, my sid registered) OR `QUARTET_ROLE` env; non-Quartet sessions no-op (dual-use safe). **PreCompact DROPPED** — verified its stdout can't reach the model (logs/blocks only). **On the NEXT compaction, post-me should SEE an injected QUARTET REHYDRATION preamble.** If ABSENT → hook didn't fire: check `quartet-hooks/fires.log` + re-register `CLAUDE_CODE_SESSION_ID`→orchestrator in roles.json. Script logic + gate tested green; end-to-end fire proves out at that next compaction.

## Canonical pointers
- Cosmo: WI-586 = 37b8bce9-1f7c-8166-b539-eb1a69ebf0fe; WI-805 (billing carve); WI-806 (Nexus proj, ZDX/cosmo Altitude fix); WI-808 (CUT-B fixture debt); WS-18 = 3808bce9-1f7c-81a2-9ea1-ee924aeaa0a8; MentoMate Project = 3658bce9-1f7c-8128-9f9b-fa7fcf75a13b; data_source 36fd1119-9955-4684-8bfe-deb145e6a21f; Notion-Version 2025-09-03.
- Git: branch WI-586 @ 9d79305 (17 ahead/unpushed). Reviewer = separate origin/main clone (up + armed, idle until Reviewing).
- Channel: inbox high-water = **ic-orch-058**; outbox last = **prg06ic-078**.

## Recurring discipline (session lessons)
- Verify before asserting — INCLUDING impact/blast-radius claims (the false "other sessions breaking"; the WP-vs-"Work Package" select pollution → WI-806; verify Cosmo select values vs live schema before create).
- NEVER put a destructive command behind a `||` retry (the Neon restore double-fired).
- Do NOT commit coordination churn to main — push deliberate anchors (this doc) or use Cosmo; channel stays working-tree-only.
- Reviewer = separate clone; close only via reviewer Gate-2 + QA; orchestrator may triage-fold with documentation.
