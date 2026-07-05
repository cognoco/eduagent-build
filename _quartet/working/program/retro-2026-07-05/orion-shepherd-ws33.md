# Findings — orion / shepherd / ws33 (Mobile UX & Navigation)

Session span: 2026-07-02 ~16:24Z → 2026-07-05 ~08:46Z (still live at write time)
Agent: shepherd (WS-33 lane), Claude Opus (Claude Code harness). Delegates all execution to builder subagents; never writes production code.
Keep telegraphic.

## 1. Incident timeline

- 2026-07-04 ~early — inbox watcher dead after IDE crash; missed ~3 ORION pings (~28min) — detected on manual poll — recovered: honest disclosure (outbox -39) + re-arm + adopted manual-tail-each-turn as primary channel.
- 2026-07-04 ~13:04Z — ~2h systemic throttle froze lane (ORION inbox-048 confirms fleet-wide) — detected post-thaw via inbox drain — recovered: resumed on next turn, no state lost (Cosmo authoritative).
- 2026-07-04 ~19:34Z — SHARED-TREE REVERSION: concurrent committer on branch `local-file-changes-20260704` reverted working-tree clacks — wiped outbox -52/-53, inbox -060, one tracker/manifest edit — detected via outbox tail showing max id regressed -53→-51 + manifest note-diff — recovered: re-applied artifacts, re-posted beats, flagged ORION (-54). Root cause found independently (matched ORION's).
- 2026-07-04 ~19:36Z — inbox `tail -F` watcher THRASHING: re-emitted stale 2026-07-02 lines (-001..008) on every inode swap from the reversion — detected via watcher events surfacing ancient ids — recovered: killed watcher (TaskStop), switched to manual-tail.
- 2026-07-04 19:48Z–2026-07-05 07:43Z — ~12h throttle (ORION inbox-063) froze lane from MX-55 — detected post-thaw — recovered: sign-of-life beat -56, re-armed watcher (channel now durable).
- (non-incident) builder subagent token-churn: stopped subagent kept re-waking to "wait for CI" (can't self-resume) — fixed by standing it down (SendMessage) + shepherd owning the CI-wait.

## 2. Comms losses

- outbox -52/-53 + inbox -060: SENT + partially actioned, then ERASED from file by the reversion (git checkout/pull reset gitignored-but-TRACKED `_state/*`). Channel = lane inbox/outbox jsonl. ORION's outbox watcher caught them LIVE pre-reversion (append reaches watcher before the later revert), so content mostly survived at ORION even though the file lost it. Re-posted to restore file continuity.
- Missed ORION sign-of-life pings (-046/-047, -061/-062/-063) during freezes: NOT a channel loss — I was frozen (throttle), messages arrived fine, just unanswerable until thaw. Distinguishable only because ORION beat repeatedly.

## 3. Rulings & operator-action backlog

- WI-1393 merge: OPERATOR merge-HOLD ruled ~14:40Z 07-04 → blocked merge of a strict-green, Gate-1-clean publish-blocker for ~4h until ORION relayed the go (inbox-058, operator delegated merge decision to ORION). Correctly NOT self-rulable — the hold was explicit; waiting was right.
- WI-1393 Gate-1: ORION second-check (not operator-direct). Self-triaged advisory first (caught 2 internal-mock escapes CodeRabbit rated Major) → routed back to builder. Within my remit; no operator needed.
- WI-1580 (option-2 follow-on): parked-pending-ruling for several heartbeats → resolved by ORION ruling inbox-067 (park post-launch). Could NOT self-rule (priority call = ORION/operator).
- WI-904 (dictation-playback pacing, Backlog): operator-held entire session; correctly never touched.
- Net: only ONE genuine block (the merge-hold), correctly owned by operator/ORION. No cases where I stalled on something within my own remit.

## 4. Token / rate-limit events

- ≥3 throttle windows hit this lane (~2h 07-04 13:04Z; ~2h20m from 19:45Z; ~12h overnight). Effect: froze the session outright — no work, no beats, until thaw. Fleet-wide each time (ORION confirms same signature across lanes).
- Burn-without-output: (a) builder subagent re-wake loop polling CI (fixed by stand-down); (b) heartbeat cadence — a mostly-idle lane beating every ~20min for hours (post-WI-1393) is pure wake/probe overhead (H2-relevant). (c) The reversion forced re-doing artifact edits + re-posting beats — wasted a turn's output.

## 5. Root-cause hypotheses

- **H1 (rate-limit kills sessions, no auto-recovery): STRONG SUPPORT.** ≥3 freezes; every recovery was manual (ORION re-ping → I resume next turn). Zero auto-resume. This was my most repeated incident.
- **H2 (too many lanes / burn spiral): PARTIAL.** Builder re-wake churn + idle-lane heartbeat overhead are real burn. But my lane's *work* burn was proportionate (one publish-blocker, clean). The overhead is in wake/probe/idle-beat, not the work.
- **H3 (long session drifts from canon): CONTRADICTED (for this lane).** The durable POST-COMPACTION ANCHOR + project-memory kept me grounded across multiple compactions/freezes with no canon drift. The anchor pattern is the counter-evidence — re-grounding worked.
- **H4 (recent Cosmo/Quartet/ZDX changes regressed behavior): SUPPORT — 3 concrete regressions:** (1) `/cosmo:execute complete` run AFTER a squash-merge (branch deleted) re-pushes the branch + opens a SPURIOUS draft PR (#1911 this session) — a real footgun, cost a cleanup cycle. (2) Quartet clacks `_state/*` files gitignored-but-TRACKED (`.gitignore:222-227`) → every checkout/pull/reset reverted live channel messages (the whole §1/§2 reversion class). Fixed mid-session by ORION (`git rm --cached` + push `5d25c6b58`). (3) cosmo `--dedup` LLM judge unrunnable on this Windows host (claude→ANTHROPIC_API_KEY precedence; codex→`--ask-for-approval` arg drift) → forced manual dedup.
- **H5 (two orchestrators + shared checkout friction): STRONG SUPPORT.** The reversion (concurrent committer on `local-file-changes-20260704` in the shared main tree clobbering another lane's clacks) IS main-branch/checkout friction. Also the worktree-commit bare-core trap + `git push` GCM-401 traps (from memory) are same-shared-tree class. Root-caused + fixed for the clacks case.

## 6. What would have saved me (ranked)

1. **Untrack the clacks `_state/*` from day one** (the H4/H5 root cause). One `.gitignore`+`git rm --cached` at fleet setup would have prevented EVERY reversion, comms loss, and the watcher-thrash cascade. Highest leverage, already proven (ORION's `5d25c6b58` ended it instantly).
2. **Supervisor watchdog / auto-resume after rate-limit** (H1). A tiny external process that re-pokes a frozen session on thaw would have removed the manual ORION re-ping loop and the "idle-alive vs torn-down" ambiguity that drove most heartbeat traffic.
3. **Standard durable resume anchor + Cosmo-as-authoritative** (already had it — make it fleet-standard). It's the single reason no work was lost across compactions/freezes. Codify the POST-COMPACTION ANCHOR shape into the shepherd priming packet.

## 7. Keep / kill / fix

- **KEEP:** POST-COMPACTION ANCHOR (durable resume artifact) — saved the lane repeatedly. Cosmo REST as sole authoritative WI state — survived every clacks reversion. Shepherd self-triages advisory review BEFORE declaring merge-ready (caught real internal-mock escapes). Independent verification of subagent/bot claims from source (caught a stale CodeRabbit false-positive + verified every stage from Cosmo, not reports). Manual-tail inbox as backstop channel.
- **KILL:** gitignored-but-TRACKED clacks files (done). Blindly re-arming a `tail -F` inbox watcher under active shared-tree churn (thrashes — manual-tail instead until the tree is stable). Dispatching a subagent to "poll CI and wait" (stopped subagents can't self-resume → token churn; shepherd owns the wait).
- **FIX:**
  - `/cosmo:execute complete` post-merge → skip the best-effort PR-open/branch-push step when the WI's branch is already merged+deleted (guard on merged PR state). One-line: check `gh pr list --head <branch> --state merged` before re-pushing.
  - Heartbeat cadence for a *cleanly idle* lane (work done, only parked items): drop to a longer interval or event-driven-only, not fixed ~20min — the beat exists only to disambiguate idle-alive from torn-down, which the watchdog (item 6.2) would solve outright.
  - cosmo `--dedup` judge on Windows: pick a provider/auth path that works headless here, or document the manual-dedup fallback in the skill itself.
