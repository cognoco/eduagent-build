# Findings — orion / shepherd / WS-39 launch-readiness

Session span: 2026-07-03 (lane creation) → 2026-07-05 ~08:46Z (quiesced). Multiple `/compact` cycles + session teardown/resumes across the span.
Agent: shepherd (WS-39 Launch Readiness), Claude Opus 4.8 (1M) / Claude Code harness. Single lane; drove launch-ops queue WI-1500/1503/1504/1505/1506 + Wave A/B infra items.

## 1. Incident timeline

- Multiple session teardowns + `/compact` across the lane's life — monitors die on session-end each time; re-armed per `_state/monitor-manifest.json` on each resume (monitor-hygiene). No lost work — durable RESUME SNAPSHOT in tracker carried state.
- `2026-07-04 ~19:15Z` — post-compaction resume mid-merge-go — re-read RESUME SNAPSHOT + reconciled #1900 re-run — clean pickup, no re-derivation needed.
- `~19:27Z` — **#1900 flaky mobile test** (`session/index.test.tsx [WI-859]`, 58s timing, disjoint from api-only #1900) — ONE authorized re-run (run 28716187835) went green → flaky confirmed, NOT force-merged, test never weakened. Merged #1900 squash `ca9f59a8`.
- `~19:30Z` — **KEY INCIDENT: `/cosmo:execute complete WI-1505` draft-PR fallback auto-created PR #1912** — it committed my ENTIRE uncommitted working tree (18 files sweeping FOUR lanes' `_state`: mobile-ux-nav / platform-hardening / safety-eval + program checkpoints, 4268 additions) to branch `local-file-changes-20260704`, pushed it to origin, and left me checked out OFF main. Detected: inspected the unexpected PR immediately after `complete`. Recovered: escalated needs-orchestrator (lr-out-085), HELD (would not touch other lanes' dirty files). ORION root-caused (clacks `_state` files gitignored-but-tracked → git kept reverting tree + blocked `checkout main`), ran `git rm --cached` + pushed `5d25c6b58`; I returned to main cleanly. My post-#1912 tracker edits were silently reverted by the tool-forced checkout — re-authored to final state.
- `20:44Z→23:04Z` — ~2h20m systemic throttle froze all lanes — self-recovered, no session death.
- `23:04Z→08:46Z` — ~9h idle-hot heartbeat tail: ~30 one-line sign-of-life beats at ~20-min cadence, zero delivery, SE+MX torn down (~11h) leaving me sole live shepherd.

## 2. Comms losses

- **lr-out-085 (needs-orchestrator escalation @19:33:44Z) crossed ORION's lr-inbox-064 status-request @19:34:21Z.** ORION reported "lr-out-085 never landed" when it HAD landed (was the outbox tail) — ORION's outbox monitor lagged one poll. Channel: lane outbox. Recovered: re-pointed via lr-out-086. Not a true loss — ~1-poll timing cross.
- No true losses in either direction. My inbox monitor (`b0mu7po2v`) + WS-39 stage monitor (`b8icy1wlc`) stayed live the whole session and fired every ruling/transition reliably (caught lr-inbox-059..100 + WI-1504→Closed + WI-1505→Reviewing→Closed).

## 3. Rulings & operator-action backlog

Full WS-39 backlog I am parked on (none self-rulable except where noted):

- **4 PRODUCTION SECRETS (operator — 1 URGENT):** WI-1336 Sentry (2 secrets) + WI-1340 transactional email (2 secrets, incl P0 consent-withdrawal — URGENT). BOTH Executing with builders waiting. Not self-rulable (Doppler `prd`, operator-gated). This is the only backlog with active builders blocked.
- **Wave B operator/PM gates (all Ready, prime-and-held):** WI-1328 (RevenueCat live monetization, C3), WI-1335 (store listings/privacy/ratings, outward C3), WI-1337 (APNs/FCM prod creds, C3), WI-1341 (store submission + Config-T prod build, outward C3), WI-1338 (Inngest prod env, operator). Not self-rulable (irreversible/outward/prod-cred).
- **WI-1310** (Clerk PRODUCTION publishable key) — cross-lane EDGE, blocks Ramtop spine M4 rollback build. Operator prod secret. Captured.
- **WI-1588** (LAUNCH-BLOCKING end-to-end verification gate for WI-1504+1505 vs real migrated Neon + KV) — Captured, sequenced AFTER deploy (migration-apply + WI-1570 + WI-1503). Not startable now by construction.
- **WI-1500** code slice (router.ts fallback captureException) + launch-health runbook — held (no new merge-bound code during operator hold). Operator alert-rules checklist authored + attached (staged).
- **WI-1503** device run + **WI-1506** closed-beta family run — operator-gated (device / real families).
- **WI-617** (re-enable main branch protection) — **self-ruled HOLD** until near-launch (re-enabling now would break the active Quartet merge flow). Correct autonomous call.
- **Honest self-rule check:** the AC-5 re-scope (WI-1504 AC5 real-Neon-rows + WI-1505 staging-rehearsal → deploy-time-gated) I ESCALATED rather than self-ruled — correct: it touched close-gate integrity + set a precedent, so ORION ruled it with an explicit preservation guardrail (re-scope-not-drop → tracked in WI-1588). Everything genuinely self-rulable — advisory-review triage (MUST/SHOULD dispositions), follow-up captures (WI-1566/1570/1574/1575), WI-617 hold — I did autonomously without gating the orchestrator.

## 4. Token / rate-limit events

- ~2h20m systemic throttle 20:44→23:04Z (fleet-wide, not mine specifically); self-recovered.
- **Burn contributor (mine, supports H2):** the ~9h idle-hot heartbeat tail — ~30 one-line beats at ~20-min cadence with ZERO delivery, because SE+MX were down and ORION beat-checked the sole live lane every loop. Pure liveness overhead on a drained lane.
- **No loop-retry spirals.** Bounded rework only: 2 `complete --validate` trip-wire edit cycles (hex-in-body, count-in-prose), 2 AC-patch chunk ops, 1 apostrophe-broke-jq retry (`complete's` closed a single-quoted heredoc → switched to `--rawfile`). All small.
- **Wasted, tool-caused:** the #1912 auto-PR forced a 4268-line cross-lane commit+push + a full escalation/recovery cycle. Zero delivery value.

## 5. Root-cause hypotheses

- **H1 (rate-limit kills, no auto-recover):** the throttle froze but my session self-recovered (survived). No hard kill of mine. Adjacent SUPPORT: SE+MX did NOT auto-recover (~11h down awaiting operator respawn) — "nothing auto-recovers a dead session" holds for peers even though my own trigger wasn't a rate limit.
- **H2 (too many lanes / burn spiral, probe overhead crowds out work):** **STRONG SUPPORT.** ~9h of my session was pure heartbeat overhead on a done lane; once work drained, liveness traffic was ~100% of the lane's message volume. Beat-checking the sole live shepherd every ~20 min is exactly the burn spiral.
- **H3 (long sessions drift from canon):** **MILD.** Held canon well across multiple compactions — RESUME SNAPSHOT durable-checkpoint worked (zero lost work on resume); escalated the precedent-setting decision rather than self-ruling; honored the one-authorized-re-run + never-weaken-test guardrails. One durability GAP (not drift): the tool-forced checkout silently reverted my tracker's durable state — I had to re-author.
- **H4 (recent ZDX/Cosmo/Quartet changes regressed behavior):** **STRONG SUPPORT — the session's worst incident is a tool regression.** `/cosmo:execute complete`'s draft-PR fallback committed the ENTIRE uncommitted working tree (4 lanes' `_state`) to a `local-file-changes-*` branch, pushed it, and stranded the session off main — root cause = clacks `_state` files gitignored-but-tracked. Also 2 over-eager `--validate` trip-wires (hex inside a full commit URL; standalone count in prose) forced summary edits — **identical to what ramtop-ws29 independently reported**, corroborating a real recent-machinery regression, not one-off.
- **H5 (two orchestrators + shared-checkout friction):** **STRONG data.** #1912 IS a shared-checkout friction incident: one shared working tree + tracked `_state` churn + a tool that auto-commits loose changes → cross-lane contamination + branch stranding. My no-touch-other-lanes instinct kept it from getting worse. `pnpm env:sync` dirtying `apps/mobile/eas.json` per worktree also seen (memory-known).

## 6. What would have saved you

1. **Untrack the clacks `_state` files (`git rm --cached`, honor the existing gitignore)** — exactly ORION's fix (`5d25c6b58`). Prevents the #1912 auto-PR + off-main stranding + cross-lane contamination outright. Highest ROI, one-time, permanent.
2. **`/cosmo:execute complete` draft-PR fallback must never sweep unrelated working-tree changes** — scope the draft PR to the WI's own branch/files, or skip when the WI branch is already merged (the detached-HEAD/already-merged case). Would have made the #1912 incident impossible even with tracked `_state`.
3. **Idle-lane heartbeat suppression** — once a lane reports done + empty queue + emits a fresh clock-valid beat, drop the orchestrator probe cadence to ~1h (trust the beat, don't ~20-min double-poll). Kills the idle burn tail (H2) directly.

## 7. Keep / kill / fix

- **KEEP:**
  - **Durable RESUME SNAPSHOT block in the lane tracker** — survived multiple `/compact` cycles with zero lost work; a fresh shepherd resumes mid-merge-go from it alone.
  - **needs-orchestrator escalation of close-gate / precedent decisions** — the AC-5 re-scope was ruled correctly with a preservation guardrail because I escalated it instead of self-ruling.
  - **no-touch-other-lanes discipline** — prevented me worsening #1912 by stashing/discarding another lane's live files.
  - **one-authorized-re-run flaky guardrail** — confirmed the flaky, never force-merged a red, never weakened the test.
  - **id/cursor inbox + WS-39 stage monitors** — stayed live all session, caught every ruling + transition.
- **KILL:**
  - ~20-min beat-checks on a drained, idle, clock-valid-beating lane — pure burn.
  - the `/cosmo:execute complete` draft-PR fallback that auto-commits the whole working tree.
- **FIX (right in spirit, wrong mechanics):**
  - clacks `_state` gitignored-but-tracked → untrack permanently (ORION did it manually; bake into repo state + a guard).
  - `complete` draft-PR fallback → scope to the WI branch, or skip if the branch already merged; never sweep loose/cross-lane changes.
  - `complete --validate` trip-wires (hex-inside-URL, count-in-prose) → relax to bare standalone tokens only (2 shepherds hit this).
  - tool-forced `checkout main` must warn/preserve, not silently revert, a lane's durable tracker edits.
