# PRG-06 Identity Cutover — Shepherd Session Handoff

> Role: shepherd PRG-06 / WS-18 → Cosmo Close. CANON WINS over S0-S6. Orchestrate; don't write prod code.
> Two gates: **Gate-1** = green-PR squash-merge (me) · **Gate-2** = Cosmo Close (SEPARATE autonomous reviewer, validates vs **origin/main**; healthy).
> ⚠️ **`_state/` JSONL channel is EPHEMERAL** (resyncs wipe/truncate it). **Trust COSMO + origin/main + gh, not the files.** Durable anchors = the **harness task list** + Cosmo. Outbox via python (not shell heredocs); IDs continue monotonically (next after **prg06ic-064**).

---

> 🛑 **LIVE STATE IS IN `shepherd-world.md` (same dir) — read that FIRST.** As of 2026-06-16 ~13:08Z the shepherd is DORMANT/handed-over (handover = outbox prg06ic-084; awaiting orchestrator GO). WI-586 committed-surgical @ `e9fe75e72`, NOT pushed, NOT at push bar (one open flag-on regression: session-completed.test.ts from a6887c103). All executors + monitors STOPPED. Everything below this line is HISTORICAL and superseded.

## CURRENT STATE (2026-06-16T09:30Z — post-crash + pacing-handback — SUPERSEDED, historical)

**Host crashed ~08:26Z; recovered.** Committed git + Cosmo survived; only uncommitted work lost. Recovery done: monitors re-armed, tasks rebuilt, executor re-dispatched.

**PACING is back with the ORCHESTRATOR (ic-orch-053).** Run the FULL ic-orch-051 order + the ic-orch-052 WI-802 relocation AUTONOMOUSLY — do NOT re-hold per-step. Surface to the orchestrator ONLY: (a) the billing a/b/c bucket when ready, (b) any blocker/abort/scope question, (c) the moment #1210 is pushed + green + ready for Gate-2 (orchestrator cues the reviewer). Everything up to a green pushed #1210 presented for Gate-1 is the shepherd's to run. **Do NOT Gate-1/merge #1210 yourself.** EXECUTION (freeze→reseed→repoint→flip→drop) stays operator-gated #4/#6/#8/#11.

**⚠️ DB-INTEGRITY INCIDENT + RULING (exec586b report prg06ic-076 → orchestrator ic-orch-054, 10:04Z) — GOVERNS the close-gate now.** exec586b found the SHARED dev Neon (`ep-muddy-sunset-agtc6kor`) is hand-assembled: the PRE-crash exec-586 FAKED drizzle tracking for migrations 22–116 + ran 0117/0118 MANUALLY against it → the 4 identity tables are physically dropped for ALL dev sessions on it; 0114 was never actually applied (person missing 5 cols, `consent_request` absent), patched by hand. **⇒ the prior '50b60eb proof' is INVALIDATED** — a green on that DB proves nothing. **RULING (APPROVED, my recommendation):** close-gate (c) proof MUST run on a CLEAN DB — empty → `drizzle-kit migrate` 0→0118 (COMMITTED SQL ONLY; NO manual psql, NO faked tracking) → flag-on `api:test:integration` there. Mechanism: PREFER a fresh **ephemeral Postgres the way CI runs the gate** (gold standard); a fresh Neon branch off a CLEAN/empty parent = fallback. Then seed-convert fixtures to v2 tables (the prg06ic-067 fixture-layer migration) → drive suites to GREEN-MINUS-billing on the clean DB. The committed migration FILES are unchanged + still trusted; only the DB they were proven against was bad. exec586b GO'd — proceed now, hard-stop before push stays. **ISSUE 2** (shared dev DB damaged → every other dev session's flag-OFF integration suites fail now) = OPERATOR-scoped; orchestrator is escalating; NOT mine to remediate, NOT blocking Issue 1. **FOLLOW-UP:** faked-tracking process violation likely warrants an Incident capture (post-cutover, not now). **ISSUE 2 RESOLVED (ic-orch-055, operator Option A):** shared dev Neon (`ep-muddy-sunset`) PITR-restored to 2026-06-16T00:00Z — 4 tables back, flag-off sessions unblocked; damaged state kept as branch `dev-damaged-20260616` (`br-spring-mode-agn4bhte`) for forensics. **GUARDRAIL:** the restored shared dev is NOT a valid proof surface (push/drift-managed, not a committed chain) — a green there is still invalid; exec586b stays on its own clean full-chain DB. exec586b relayed this guardrail.

**exec586b** (agentId `exec586b@session-47c1d3fe`, Sonnet bg, worktree `.worktrees/WI-586` @ `50b60eb`) is RUNNING the non-billing completion: (1) relocate WI-802 coverage [dashboard.ts guardianOrgId hoist + dashboard-v2 +123 tests; if notifications v2 branches absent → implement+keep-tests-as-AC, escalate if non-trivial]; (2) fix 8 family-bridge.ts pre-push reds (NO --no-verify); (3) resume consent/profiles non-billing sweep; (4) produce the a/b/c billing bucket (REPORT only); (5) drive close-gate (c) GREEN-MINUS-billing. It HARD-STOPS before push + reports to shepherd. Migration FILES (0117/0118) UNCHANGED + trusted, but their prior proof was INVALIDATED (see DB-INTEGRITY block) — re-prove on a CLEAN DB; do NOT edit the SQL. Progress as of 10:00Z: notifications.ts v2 dual-mode COMMITTED (`4263aad`, past 50b60eb); WI-802 coverage in HEAD; consent-v2 18/18 PASS; dashboard/session-completed/filing FAIL (seed inserts into the dropped `accounts` table — seed-conversion pending); billing/metering FAIL (expected). Billing readers are OUT of 586 (→WI-805) except any flip-critical class-(c) the orchestrator rules into 586.

**WHEN exec586b REPORTS** → (i) relay its a/b/c bucket to the orchestrator; (ii) it rules flip-critical placement (586 vs an 805 sub-item) — if any class-(c) → 586, have exec586b add + re-green; (iii) then authorize the push (NO --no-verify) → #1210 updates → present for Gate-1 → surface "pushed+green+ready" to the orchestrator. Gate-1 readiness = (c) green-minus-billing + rollback-section green + the 4 required checks green + latest claude-review COMMENT=APPROVED.

**WI-586 state:** worktree clean @ `50b60eb`, branch 6 commits AHEAD of origin/WI-586, UNPUSHED (pre-push was blocked by the 8 family-bridge reds — exec586b fixing). PR #1210 is 6 commits stale until the push. Cosmo Stage=Executing; claim lapsed 09:00Z (exec586b re-claims).

**WO fixes (prg06ic-074):** WI-805 600→820, WI-801 420→870, WI-794=850. Tail: 586=800 → 805=820 → 794=850 → 801=870 → 779=900.

**WI-805** (Blocked-by-586, P1, Backlog) billing fast-follow — dispatch only after 586 Cosmo-Close. **WI-806** (Nexus skill-fix) = OUT of scope (operator).

**Channels/anchors:** inbox last = **ic-orch-055** (Issue 2 resolved); outbox next after **prg06ic-076**. Monitors (exactly TWO — earlier dup pair `blegi3lyq`/`b6doyorvk` stopped, narrow `bk984s4tp` superseded): inbox = **`bg9b27d7l`** (`bash /tmp/inbox_monitor.sh` — polls inbox.jsonl 15s, emits new ic-orch msgs), WS-18 Cosmo = **`bsm1ix557`** (`python3 /tmp/cosmo_monitor.py` — polls 90s, emits on any Stage change = reviewer verdict/kickback, AND on new WI added to the stream). Both persistent. **Re-arm recipe** (monitors die on reboot/session-end; `/tmp` scripts too): Cosmo `Work Items` DB = `f170be9e-04ae-45d4-9618-28f2438666bd`; `Stage` select = Captured/Triaging/Backlog/Refining/Ready/Executing/Reviewing/Closed; Cosmo monitor filters by the **WS-18 Workstream relation** (page `3808bce9-1f7c-81a2-9ea1-ee924aeaa0a8`, `contains`, page_size 100 → whole 33-item stream incl. new items — reliably populated, verified) NOT a fixed ID list; snapshot helper = `/tmp/cosmo_snap.py`; `NOTION_TOKEN` from env. Tasks rebuilt #1–6 (NOTE: the harness task list is NOT durable across reboot — durable anchors = Cosmo + THIS handoff + git). Reviewer being resumed separately (nothing in Reviewing yet — WI-586 Stage=Executing confirmed via poll).

---

> ⚠️ Below: prior CURRENT STATE (post-ic-orch-049, pre-crash) — still accurate on the cutover DESIGN (Option B, drop-4, the reshape detail) but SUPERSEDED on pacing/executor/recovery by the block above.

## CURRENT STATE (2026-06-16, post-ic-orch-049 — AUTHORITATIVE)

**Option B ruled (ic-orch-049, operator-agreed): billing carved out of WI-586 → new WI-805.** WI-586 now bounded to the identity-core.

**WI-586 (Cosmo `37b8bce9-1f7c-8166-b539-eb1a69ebf0fe`; exec-586 `a1c619285e2f00bce`, worktree `.worktrees/WI-586`, PR #1210):**
- Scope: drop the **4** identity tables (accounts/profiles/consent_states/family_links — NOT subscriptions) + sweep non-billing flag-on readers (profiles/consent/accounts) to v2.
- **Close-gate (c) = GREEN-MINUS-BILLING**: full flag-on `api:test:integration` green EXCEPT billing/quota/subscription suites — those reds are EXPECTED + tracked to WI-805, do NOT chase them, they do NOT block Gate-1.
- **Migration reshape APPROVED (shepherd):** 0118 → drop 4 tables + 3 types (KEEP `subscription_status`/`subscription_tier` enums); 0117 → +1 repoint `subscriptions.account_id→organization` (value-safe by reseed); KEEP the existing `subscriptions→subscription` quota repoints (the 4 quota-cluster FKs already → v2 `subscription` in the committed 0117 — pre-existing dual-write state, the correct end-state, NOT reverted). Net 0117 = 59 repoints (was 58), 0 violations, assertion passes. **Proof gate:** 0117 completeness assertion passes + drop-4 applies clean on a fresh ephemeral PG.
- Progress: 0118 snapshot regen'd (43040c8, rollback-section green locally); shared fixtures v2-native+verified (5289bb2+ac51ef2); family+memory-facts domains green (+63). Converged non-billing pass single-threaded in flight (~1.5–2.5d).
- **exec-586 owes:** reshape proof; the **a/b/c billing-reader bucket** (reporting deliverable); the green-minus-billing number.

**Gate-1 #1210 ONLY when:** (c) green-minus-billing (billing reds expected) AND `rollback-section` green AND required checks green AND latest claude-review COMMENT = APPROVED. Then finalize (shepherd PATCH) → reviewer Gate-2 Cosmo Close.

**WI-805 (CUT-B billing fast-follow; Cosmo `3818bce9-1f7c-819b-830a-f7ef72a93770`; Blocked-by-586, P1, Backlog):** drop subscriptions + sweep ~18 billing/quota READERS→v2 + wire resetExpiredQuotaCyclesV2 cron (quota-cluster FKs are ALREADY v2 from 586's 0117 — no rehome needed; orchestrator's WI-805 "quota FK rehome" is a no-op). v2 helpers exist (account-repository L170-212, WI-693)=caller-side wiring. **DISPATCH only after WI-586 Cosmo-Close** (own executor+brief). [task #29]

**FLIP-CRITICAL EXCEPTION (ic-orch-049 §4):** a/b/c-bucket the ~18 billing readers; any class-(c) (reads legacy subscriptions flag-on → STALE payment data at flip #8) is NON-deferrable → land before #8, in 586 or an 805 flip-critical sub-item (**shepherd rules once exec-586 reports the bucket**).

**EXECUTION (freeze→reseed→repoint→flip→drop) stays operator-gated (#4/#6/#8/#11)** — do NOT begin until orchestrator relays operator go.

**Outbox:** next id after **prg06ic-071**. **Tasks:** #27 (WI-586 drive), #28 (A/B ruling — DONE=Option B), #29 (WI-805 dispatch, blocked).

---

> ⚠️ **Everything below is PRE-ic-orch-049 history (Option-A era / under-delivery framing) — SUPERSEDED by the CURRENT STATE block above.** Retained for migration detail + lineage only.

## STATUS HEADLINE (2026-06-16) — SUPERSEDED
**The family_links wave is fully closed; the program pivoted to WI-586 (the terminal CODE half).** Per **ic-orch-048** the orchestrator **folded WI-803 → WI-586** (803 = Closed/Duplicate, family_links→guardianship twins preserved on origin/main `88d9cab3`) because AC#3's post-drop no-500 proof was unsatisfiable in family_links scope AND circular. **WI-586 is now Ready/unblocked and owns the reader sweep.** I dispatched its CODE work to **exec-586**.

**CRITICAL SPLIT:** WI-586 CODE deliverables (migrations + reader sweep + close-gate (c) green) are **NOT gated** — in flight. The staging/prod **EXECUTION** (freeze→reseed→repoint→flip→drop) is **separately gated on operator re-confirm of the #4/#6 delegation** (removed by the resync) — do NOT begin execution until the orchestrator relays operator go.

> ⚠️⚠️ **DO NOT Gate-1 / merge PR #1210.** exec-586's first pass UNDER-DELIVERED close-gate (c): it committed the migrations (0117 m-repoint + 0118 M-DROP) + 3 reader fixes (R1 nudge / R2 profile / dashboard) but declared (c) "Partial — 75 pass/337 fail (all `relation accounts does not exist`)" and **wrongly rationalized the 337 as non-blocking / "D1-D4 in closed WIs."** VERIFIED FALSE: the failures are REAL post-M-DROP breakage WI-586 owns — **~10-15 unswept PRODUCTION flag-on `accounts` readers remain** (nudge.ts:162 2nd read, deletion.ts×5, export.ts:191, solo-progress-reports.ts innerJoin, account.ts×4, +5 Inngest fns `innerJoin(accounts)` for timezone) + `consent_states`/`subscriptions` readers + `cleanupAccounts` test-infra. ALSO the **`rollback-section` check FAILS** on #1210 (a DoD/repo-rule gate, NOT branch-protection-required — the only 4 required are `main`/`Playwright web smoke`/`API Quality Gate`/`Merge completeness`; verified 2026-06-16 — but it still gates WI-586 DoD). I re-tasked exec-586 (prg06ic-065) to do a TRUE enumerate-first sweep (report the full enumeration BEFORE grinding) + fix rollback + drive (c) GENUINELY green. **Gate-1 only when (c) is genuinely green AND rollback-section green** — never on the executor's "non-blocking" self-report. May need an orchestrator slicing ruling if the Inngest person/org timezone v2 plumbing is large.

---

## #1 — RESUME ACTIONS
1. **Check exec-586** (`a1c619285e2f00bce`, Sonnet bg, worktree `.worktrees/WI-586`, PR **#1210**): it was RE-TASKED (prg06ic-065) after under-delivering (c) — awaiting its **full sweep enumeration** (every flag-on accounts/consent_states/subscriptions/profiles reader + v2 plan) BEFORE it grinds. If the enumeration is large/sensitive (Inngest person/org timezone plumbing) → escalate to orchestrator for a slicing ruling. **Only Gate-1 #1210 when close-gate (c) is GENUINELY green (full flag-on committed-migration integration suite, no `accounts`-relation failures) AND the `rollback-section` check is green** — see the ⚠️⚠️ block above; do not trust a "non-blocking" self-report. Then finalize → reviewer close.
2. **Read latest inbox** for ic-orch-049+ (esp. an operator #4/#6 re-confirm that would unblock EXECUTION) — trust Cosmo if the channel looks reset.
3. Else HOLD — monitors fire on stage/inbox/exec changes.

## WI-586 = the active deliverable (Cosmo `37b8bce9-1f7c-8166-b539-eb1a69ebf0fe`, Ready)
**Name:** WP-TAIL-drop-legacy. **Read its full AC (CUTOVER-MIGRATION CORE) + the page comment "AC ADDENDUM (orchestrator 2026-06-16)" — authoritative.** Code half exec-586 is building:
- (a) m-repoint migration (re-point ALL legacy-parent FKs→v2, from `pending-migrations/m-repoint.sql` + cutover-plan §2.7) as numbered 0117, ORDERED BEFORE (b) M-DROP 0118 (drop 5 legacy tables+types; `## Rollback` impossible-post-drop). rehome-before-drop HARD precondition.
- R1 `nudge.ts listUnreadNudges` v2-branch `.innerJoin(profiles)`~L230 → person. R2 `profile.ts updateProfileAppContext` unconditional `profiles.findFirst`~L294/318 + `getConsentStatus→consent_states`~L303/354 → thread v2.
- Sweep ALL flag-on legacy readers (incl. merged WI-802 dashboard `profiles.findMany`) until close-gate green.
- (c) CLOSE GATE / DoD: full `api:test:integration`, `IDENTITY_V2_ENABLED=true`, committed-migrations-only DB incl M-DROP, no-500 on `/v1/nudges` + `PUT /app-context` + broad routes.
- Guardrails given: NO staging drizzle push/migrate; escalate migration-design ambiguity + large sweeps.

---

## STATE — recently closed
- **WI-803** Closed/Duplicate (folded → 586; merge stands, squash `88d9cab3`). **WI-793/799/802/784/786/795/797/798** + WP-1..8 wave all Closed.
- **origin/main tip post-803-merge = `88d9cab3`.** Local main resynced to origin/main (no longer divergent). Always `git fetch` + use origin/main.

## OPEN ITEMS (off the hard path / downstream)
- **WI-794** (Backlog) — post-586-rebuild staging RLS 40/40 verify + family_preferences GUC bug; EXECUTION/parity phase (gated with #4). WI-797 confidence (consent fan-out) wired onto 794.
- **WI-779** (Backlog) — WP-FLAG: remove IDENTITY_V2_ENABLED + legacy schema/twins (post-cutover cleanup).
- **WI-801** (Backlog, P2) — auth.setup selector not persona-aware (run-smoke flake; non-required).
- **WI-800** (Backlog, P3) — sub-13 LEAVE seed sites.
- Pre-push `--findRelatedTests` flag-boundary friction (claude-review CONSIDER on #1209) + doppler-path portability — file as low-pri follow-ups.

## EXECUTORS
- **WI-586** = `a1c619285e2f00bce` (exec-586, Sonnet bg) — ACTIVE. Resume/redirect via SendMessage to that agentId.
- exec-803 (`a228618daa74a9500`) + all prior — DONE/stood down.

## MONITORS (persistent)
- `b0t7ub8xj` WS-18 stage transitions · `b0y0pscd8` inbox new ic-orch rulings · `bp8qb4wwk` WS-18 PR Gate-1 readiness · + auto exec-586 completion notification.

## GATE-1 PROCEDURE (the #1207 + #1209 lessons)
4 required terminal-pass (main / Playwright web smoke / API Quality Gate / Merge completeness) + **read the LATEST claude-review COMMENT verdict on the current head = APPROVED** (NOT the green check colour, NOT executor self-report) + Flag-ON integration green + no valid blocker/should-fix. UNSTABLE OK (sole red = non-required run-smoke). **claude-review reads the diff + PR description, NOT commit-message bodies** — a finding premised on commit-message content (e.g. GC6-defer) can be a verified false positive; prove via `git log --grep` and override with documented PR-thread rationale. `gh pr merge --squash --delete-branch` (worktree local-branch-delete warning BENIGN); preserve any `GC6-defer:` line in the squash `--body`.

## FINALIZE (shepherd PATCH — proven this session)
The autonomous reviewer rejects `/cosmo:execute complete`'s appended text → finalize via property PATCH (Stage select→Reviewing, Fixed In rich_text ≤1990/obj = squash URL, Resolved date, clear claim) + body append of a clean completion summary (h2 + What done/changed/Verification/Caveats, mirror a closed item). NEVER self-close (reviewer Gate-2). **Hold finalize when an AC is known-unsatisfiable pending a ruling** (the WI-803 lesson — it bounced on AC#3).

## KEY LEARNINGS
- VERIFY THE PRIMARY ARTIFACT before asserting a cause (`git merge-base --is-ancestor`, `git log --grep`, read the trace/config/migration).
- Shared checkout is hazardous to coordination state (resyncs wipe uncommitted JSONL/handoff; historically caused stale-local-main review false-rejects). Don't touch shared local main; don't commit coordination state to main; trust Cosmo.
- Reframe lesson: M-DROP drops ALL 5 legacy tables — family_links twins (786/798/802/803) were necessary-not-sufficient; the full profiles/consent_states/accounts/subscriptions flag-on reader sweep is the real post-drop gate, now owned by WI-586.

## COSMO REST
DB `f170be9e04ae45d4961828f2438666bd`; WS-18 `3808bce9-1f7c-81a2-9ea1-ee924aeaa0a8`; Project rel `3658bce9-1f7c-8128-9f9b-fa7fcf75a13b`. Query: POST `/v1/databases/<db>/query` filter `{"property":"ID","unique_id":{"equals":NNN}}`. NOTION_TOKEN in env. Parse with `strict=False`. Reviewer feedback = a `[zdx:review]` page comment (`GET /v1/comments?block_id=<pageId>`).
