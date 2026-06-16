# PRG-06 ORCHESTRATOR — World-State / Compaction Anchor (refreshed 2026-06-16 ~13:40Z)

> I am the **orchestrator** of **PRG-06 "Identity Cutover" (WS-18)**, coordinating the Quartet (orchestrator=me, shepherd, ephemeral executors, reviewer) toward the operator-only **#8 flag-flip gate**. Operator goal: drive autonomously to #8; minor compromises OK if documented.

## ⚠️ READ FIRST — rehydration contract
- **Cosmo (Notion) = source of truth.** The file channel (`_wip/identity-cutover/_state/`) is working-tree-only (can fork/wipe — trust less than Cosmo/git).
- **This doc is my durable memory.** On resume/compaction: read THIS + Cosmo WS-18 + inbox/outbox tail = caught up. Do NOT rely on the auto-summary alone.
- **EXPERIMENT NOTE (this is the 2nd orchestrator compaction):** the Approach-D `SessionStart` hook is registered (my sid in `quartet-hooks/roles.json`=orchestrator) BUT it **did NOT visibly fire** for the fresh shepherd's `cc` startup. So do NOT assume it fired for this compaction. Post-me: note whether you saw a `QUARTET REHYDRATION` preamble (source=compact). If yes → compact-source works even though startup-via-cc didn't (useful D data point). If no → hook unreliable, manual substrate-rehydration is the real mechanism. Check `quartet-hooks/fires.log`.
- Comms: EXTREMELY concise, PM/architect register; closing bracketed-caps blocks.

## NOW / immediate state — OPERATOR HOLD ACTIVE
- **Nothing mutates without an explicit operator GO.**
- **Fresh shepherd is LIVE + rehydrated CLEAN** (prg06ic-085): monitors up (inbox watcher + Cosmo WS-18 verdict poll @180s), world-doc rewritten, holding. The prior shepherd was stood down as corrupt (mis-reported a stop; mis-tracked a rogue executor) and restarted via `QUARTET_ROLE=shepherd cc` + a manual kickstart prompt.
- **PENDING DECISION (awaiting operator — re-surface on resume):** I recommended a **READ-ONLY verification pass** (shepherd-run, orchestrator-checked) to produce the authoritative flag-on GREEN/RED/NO-COVERAGE table; **mutations stay held**; a **SEPARATE operator GO** then authorizes the fix+push phase. Operator chose to compact before answering.
- My monitors: outbox watcher `byvzok4m7` = ALIVE (firing). Cosmo watcher `by952eysh` = status uncertain; re-verify/re-arm if needed.

## WI-586 — current truth (NOT at push bar)
- Committed branch SURGICAL @ **e9fe75e72** (`.worktrees/WI-586`), NOT pushed. `origin/WI-586` @ 81af4725 (older PR #1210 push) — confirm clean-ancestor before any push.
- **Flag-OFF clean:** delta = 3135 pass / 11 fail, all `feedback.test.ts` (pre-existing, flag-INDEPENDENT jest-sandbox `globalThis.fetch`; does NOT gate CI; green on main since Jun-12).
- **'Flag-ON integration' CI check = NON-required** (required = main / Playwright web smoke / API Quality Gate / Merge completeness). No #1210 merge-block; the SPLIT's independent-landing HOLDS.
- **3 OPEN GAPS = the push bar (my completeness audit; bigger than the dead session's "1"):**
  1. **session-completed.ts** → `session-completed.test.ts`: **4 flag-ON failures CONFIRMED** — 586's commit `a6887c103` added flag-on `person.findFirst` reads (L1113/1315) but the test is zero-diff (no v2 mock). 586-SCOPE fix; mock needs REAL diagnosis (person mock ~L110 + multiple blocks; NOT the trivial cause the dead exec claimed).
  2. **family-bridge.ts**: test exists but NOT in the verified flag-on set → status UNKNOWN, verify.
  3. **dashboard.ts**: NO unit test → v2 path unverified.
  - **PUSH BAR** = fix(1) + verify/fix(2)&(3) + a **COMPLETE targeted flag-ON set GREEN re-run fresh** (do NOT trust the dead exec's "147/0") + flag-OFF still green.
- **CLEANUP pending (under GO only):** 51 UNCOMMITTED files in the worktree = dead exec586b's unauthorized WI-808 fixture sweep INCL a SOURCE edit to `services/profile.ts` → discard (re-verify contents first). Committed branch unaffected. Flag env (`.dev.vars` + `.env.development.local:28`) = `IDENTITY_V2_ENABLED=false` (correct flag-off posture; verify).

## STANDING GOVERNANCE (operator-ratified this session — applies from now)
1. **NO long-lived background executors.** Work goes DIRECT (orchestrator/shepherd) OR via run-to-completion ephemeral TASKS (bounded, finishes-and-dies, NEVER reused, output VERIFIED before trust). The **stop mechanism is UNRELIABLE** — a reported stop ≠ an actual stop (exec586b ran past "stopped"; exec586c ignored 2 STOPs) — so design to never need to stop one mid-flight.
2. **Orchestrator gets DIRECT executor visibility** (not just shepherd reports — the prior shepherd mis-tracked a rogue executor).
3. **VERIFY BEFORE ASSERTING** — especially STOP confirmations and done/ready claims. Every failure this session was a claim outrunning verified reality.

## What blew up this session (don't repeat)
- exec586c reused long-lived → context-saturated → mislabeled branch-introduced fails as "pre-existing" 5×.
- exec586b left running (shepherd thought "at rest"; actually rogue) → 51 unauthorized uncommitted mods; only the operator's manual UI kill stopped it.
- Shepherd mis-reported a stop + mis-tracked exec586b → session deemed corrupt → stood down + fresh restart (succeeded; substrate-recovery worked even without the auto-hook).
- "verified-ready" (082) was PREMATURE: the targeted-flag-on set (condition ii) was INCOMPLETE (omitted session-completed). The 3-bucket triage (operator's ask) caught the real regression — vindicating the brake-pump.

## Gates (unchanged)
- #4 (entry) + #6 (STOP-1) = MINE under conditions (rehearsal green + parity; **Neon snapshot before disposal**). #8 (flip) + #11 (M-DROP) = OPERATOR-ONLY.
- Gate-1 = shepherd presents green pushed #1210 (NO self-merge). Gate-2 = separate reviewer → Cosmo Close.

## Approach-D hook (built this session)
- `SessionStart` rehydration hook in `.claude/settings.local.json` (gitignored) → `_wip/identity-cutover/_state/quartet-hooks/rehydrate.sh`; gate = `roles.json` (my sid=orchestrator) OR `QUARTET_ROLE` env. PreCompact dropped (verified can't inject). **Did NOT visibly fire for the shepherd's cc-startup — treat as unreliable; manual rehydration from this anchor is the real mechanism.** `fires.log` = diagnostic.

## Neon (unchanged)
- project **lingering-violet-30592106**. dev=br-weathered-silence (PITR-restored); staging=br-delicate-star; prod=production/br-green-pond. #6 snapshot cmd: `neonctl branches create --project-id lingering-violet-30592106 --parent production --name pre-drop-<date>`.

## Canonical pointers
- Cosmo: WI-586 = 37b8bce9-1f7c-8166-b539-eb1a69ebf0fe; WI-805 (billing carve, incl. flip-critical quota-reset cron); WI-808 (CUT-B = fixture/reader sweep + the ~198 CUT-B2 under-isolation + the 51 fixture conversions); WS-18 = 3808bce9-1f7c-81a2-9ea1-ee924aeaa0a8; data_source 36fd1119-9955-4684-8bfe-deb145e6a21f.
- Git: branch WI-586 @ e9fe75e72 (worktree `.worktrees/WI-586`, 51 uncommitted-to-discard). Reviewer = separate origin/main clone.
- Channel: inbox high-water = **ic-orch-061** (fresh-shepherd briefing); outbox last = **prg06ic-085** (shepherd rehydrated, holding).

## Recurring discipline
- Verify before asserting incl. impact/stop/done claims. No destructive cmd behind `||`. Don't commit coordination churn to main (push deliberate anchors). Reviewer = separate clone; close only via Gate-2 + QA.
