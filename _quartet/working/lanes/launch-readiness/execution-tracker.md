# Launch Readiness (WS-39) — Execution Tracker

> The lane's substance. The shepherd protocol (`../../../roles/shepherd-protocol.md`) carries process
> only and points here for specifics. **Disposable by construction** — a fresh shepherd pointed at
> this tracker loses nothing but warm cache. Holds *delivery state*; points at rules, roster, and
> live per-WI state (Cosmo) — never duplicates them.

## Charter
Commercial + operational readiness to ship the MVP to production. "Done" = every WS-39 item Closed
or explicitly gate-parked, such that a Config T (V2, V0=off/V1=on/V2=on) **Google-Play-only**
production build can be published with purchases enabled and a proven V1 fallback. This lane owns
the ops/infra/commercial surface (observability, background-job env, prod secrets, transactional
email, store console + submission, monetization) — NOT app-feature code (that is WS-33 / spine).

## Canon authority
- Program roadmap: **PGM-1 "Mentomate productization"** (Cosmo Programs DB, page
  `3928bce9-1f7c-8130-ac4c-c422e9db928d`) — critical path, cross-lane edges, gate ledger, rulings
  queue. Re-read on resume; it is canon for sequencing.
- Architecture authority: `08-convergence-spine.md` (RATIFIED 2026-07-02).
- **MVP scope: Google Play only** — production EAS profile is Android-only (`eas.json`: production
  ios=false, verified 2026-07-03). iOS/App Store is post-MVP and a separate operator ruling.
  Any item scoped to App Store / APNs is refine-and-hold, NOT do-now.

## How to use
Fresh shepherd: read PGM-1, then this tracker, then start Wave A (no-dependency infra items) —
triage→refine→execute autonomously. Wave B items are operator/PM-gated (store accounts, bundle IDs,
prod credentials, irreversible/outward store actions): refine them, surface the gate, and HOLD
(prime-and-hold) — do not execute a gated item. Coordinate the two cross-lane edges with Ramtop on
the edge WI's own Cosmo comments (Ramtop reads Cosmo, not this clacks channel).

## Pointers
- Program roadmap (canon): PGM-1 · `3928bce9-1f7c-8130-ac4c-c422e9db928d`
- Cosmo Workstream: WS-39 Launch Readiness · `3928bce9-1f7c-8179-b62e-e4c252a53747`
- Initiative: INI-32 Operations
- Substrate operating rules: `../../program/planning-rules.md` (if present) / shepherd-protocol.md
- Windows workaround: every `/cosmo:triage` + capture call passes `--judge-provider claude`
  (Unix `which` auto-detect crashes on Windows — WI-1282).

## Units / slice
| WI | Prio | Coarse status | Order | Wave |
|---|---|---|---|---|
| WI-1336 Sentry source-map + alerting baseline | P1 | Executing (builder; gated remainder) | 100 | A — do-now |
| WI-1338 Inngest production environment sync | P1 | Ready — held on operator (Inngest Cloud prod env) | 200 | A — do-now |
| WI-1339 GitHub Environment protection + deploy targeting | P2 | **CLOSED / Done** (lr-inbox-008: main-only policy + orphan secret removed; reviewer-graduated) | 300 | A — do-now |
| WI-1340 Transactional email prod config (incl P0 consent-withdrawal) | P1 | Executing (builder; gated: 2 prod secrets URGENT) | 400 | A — do-now |
| WI-1310 Clerk PRODUCTION publishable key → Doppler prd + EAS | P1 | captured | 500 | **EDGE** (Ramtop spine — blocks M4 rollback build) |
| WI-1328 RevenueCat prod monetization (MVP) | P1 | captured (EP=Assisted) | 600 | B — gated (Option-A ruled; read comments; RC-keys→bundle-republish EDGE) |
| WI-1337 Push notification prod credentials (APNs/FCM) | P1 | captured | 700 | B — gated (FCM for Play; APNs deferred = iOS post-MVP) |
| WI-1335 Store publishing: Play Console records, listings, privacy labels, ratings | P1 | captured | 800 | B — gated (store accounts + operator listing/ratings calls) |
| WI-1341 Store submission pipeline (eas submit + Config T prod build) | P2 | captured | 900 | B — gated (needs store records + prod build) |
| WI-617 Re-enable main branch protection (code-owner review) | P2 | ready | 1000 | B — HOLD until near-launch (re-enabling now would disrupt the active Quartet merge flow) |

Slice scan: all 10 WS-39 items are in-slice. Wave A = 4 no-dependency infra items the operator
green-lit to start. Wave B = operator/PM-gated commercial/store/secret items — refine + prime-and-hold.

## Sequence
Wave A items are mutually independent — run them in parallel where the executor allows, else by
Order. Wave B is gated on operator rulings (store accounts, bundle IDs, product scope) tracked in the
PGM-1 rulings queue; WI-1328 already carries an Option-A ruling in its comments. Hard edges:
- WI-1310 (Clerk prod key) blocks M4 fallback proof in Ramtop's spine lane — coordinate on WI-1310.
- WI-1328 phase-4 RC keys force a fallback-bundle re-publish before M6 (Ramtop spine) — coordinate
  on WI-1328. The fallback-OTA preflight was relaxed 2026-07-03 (RC pair warn-not-fail); WI-1328
  phase-5 re-hardens it.

## Supervision / escalations
- Irreversible / outward-facing (C3): WI-1335, WI-1341 (store submission — public), WI-1337 (prod
  credentials), WI-1328 (live monetization), WI-1310 (prod secret). These require operator confirm
  before any external/irreversible step — escalate via outbox `needs-operator`, never execute silently.
- Out-of-remit (C2): store listing copy, ratings/age bands, product prices/scope, bundle IDs,
  launch timing — operator's call. Refine + hold.
- Cross-lane (edge): coordinate with orchestrator:ramtop on the edge WI's Cosmo comments.

## Current position
_Updated 2026-07-03 ~16:50Z by shepherd (session eb4593fb)._

> ### RESUME SNAPSHOT (read first on resume/post-compaction)
> **Monitors DIE on session end — RECONCILE FIRST** (`clacks/monitor-hygiene.md`): re-arm both per
> `_state/monitor-manifest.json`, update task-ids. NOTE: monitors SURVIVE `/compact` (session continues) —
> after a compact, check for and TaskStop any duplicate/stale watchers before/after re-arming. (1) inbox
> watcher (live `bi7egko32`) — poll `_state/inbox.jsonl` 45s, emit id>last-seen; (2) WS-39 Stage watcher
> (live `bhx1gbegl`) — `bash _quartet/clacks/orch-stage-monitor.sh 3928bce9-1f7c-8179-b62e-e4c252a53747 180`.
> Baselines will differ; that's fine.
> **Clacks cursors:** outbox at **lr-out-028** (next id = lr-out-029); inbox last-read **lr-inbox-020**.
> Re-read `_state/inbox.jsonl` for any id > lr-inbox-020 on resume (a reply may have landed).
> **NEXT expected inbound:** Ramtop hand-off of WI-1337 once operator confirms the FCM V1 key (mentomate-9d02f) is uploaded to EAS @zuzanka14/mentomate. WI-1337 task = verify credential registered + drive to done; NO code wiring (Expo push path, notifications.ts:52). Execute on hand-off.
> **Tooling:** bun=`/c/Tools/bun/bun.exe`; cosmo skills under `~/.claude/plugins/cache/zdx-marketplace/cosmo/0.6.19/skills/{triage,refine,execute}/`; every triage/capture passes `--judge-provider claude`. Doppler=`/c/Tools/doppler/doppler.exe -p mentomate`. NOTION_TOKEN in env. Repo owner/repo = `cognoco/eduagent-build`. WS-39 DS = `36fd1119-9955-4684-8bfe-deb145e6a21f`.
> **SCORECARD (10 WIs):** WI-1339 **CLOSED/Done**. WI-1336 (PR #1857 merged) + WI-1340 (PR #1861 merged) in Executing, held on lr-out-004 gated remainders. WI-1338 held on lr-out-004 (Inngest Cloud prod-env). WI-1310 ops-done, awaiting Ramtop M4 proof (no Stage change forced). Wave-B WI-1328/1335/1341/1337 = **Ready**, gated on lr-out-011; WI-1341 Config-T artifact already POSTED (prepare-not-land, ramtop-tagged). WI-617 **HOLD-until-near-launch** (Ready, untouched).
> **OPEN GATES (awaiting operator/orch):** lr-out-004 (WI-1336 alerts+symbolication, WI-1338 Inngest, WI-1340 Resend+E2E) · lr-out-011 (Wave-B console/cred asks; FCM-first per operator). All prod-secret/Clerk/Sentry-token asks RESOLVED (lr-out-003/002/005; Config-T lr-inbox-007).
> **NEXT ACTIONS on wake:** (a) any inbox reply → act (WI-1337 is primed: on Firebase key + eas credentials access, execute the FCM V1 upload; WI-1335 draft-artifacts only if operator says yes — copy is C2 out-of-remit). (b) WS-39 Stage change → if a merged/held WI's operator gated steps are confirmed done, verify + `/cosmo:execute complete` it (WI-1336/1340/1338); if reviewer bounces something, re-dispatch. (c) Non-critical: `git worktree prune` (hung `.worktrees/WI-1336` cleanup) + prune `.worktrees/WI-1340`.


Boot done. Monitors armed persistent + reconciled into manifest: inbox `bkid4rfjo` (45s),
WS-39 Cosmo Stage `beru2atzr` (own orch-stage-monitor.sh, 180s). First outbox `lr-out-001` (ACK).

**Wave A — all 4 refined Backlog→Ready (2026-07-03).** Researcher (read-only, done) produced
current-state + autonomous-vs-gated split; key finding self-verified: PROD API WORKER CANNOT BOOT
— `ANALYTICS_HASH_KEY` + `CONSENT_WITHDRAWAL_TOKEN_SECRET` MISSING from Doppler prd (both in
`PRODUCTION_REQUIRED_BASE_KEYS`, config.ts:446-457). `API_ORIGIN` is NOT a gap (wrangler prod var).
- WI-1336 Sentry: builder DONE → PR #1857 (flip prod+fallback SENTRY_DISABLE_AUTO_UPLOAD=false;
  clean 2-line diff, no MODE_NAV strip). CI FULLY GREEN + mergeStateStatus CLEAN (monitor b5ac3pemd
  ended). claude-review = CHANGES_REQUESTED, 1 SHOULD_FIX = the exact token-ordering risk I flagged;
  adjudicated resolved-by-sequencing (merge coupled to token), noted on PR. CodeRabbit rate-limited
  (no substantive review). PR #1857 MERGED 2026-07-03 (squash f27f97692c63b7f7bd1fa1fc97cb97880cd49db0,
  Gate 1: green+CLEAN). lr-out-005 executed (lr-out-009): SENTRY_AUTH_TOKEN was ALREADY in the EAS
  production env (not created/overwritten); eas.json production+fallback both map environment=production
  so the token DOES inject → flip NOT inert (builder premise corrected). CAVEAT: token PRESENCE verified,
  not VALIDITY (Doppler prd token is 32-char/non-sntrys_ shape) — symbolication-verify (lr-out-004) is the
  real proof. WI-1336 stays Executing, holds on lr-out-004 (symbolication verify + alert dashboards).
- **PROD-BOOT BLOCKER CLEARED 2026-07-03** (operator ruling lr-inbox-003 → executed, lr-out-007):
  minted ANALYTICS_HASH_KEY + CONSENT_WITHDRAWAL_TOKEN_SECRET (64-hex random, masked) in Doppler prd,
  verified present by name + synced to GH Actions. All PRODUCTION_REQUIRED_BASE_KEYS now satisfied.
  WI-1340 still NOT closeable — holds on Resend SPF/DKIM + live E2E (lr-out-004). PR #1861 MERGED
  2026-07-03 (squash 12e1ea7154a3ced6d7d1aee4106e7b0896416c06, Gate 1 passed — green+CLEAN, claude-review
  APPROVED 0 findings). WI-1340 remains Executing pending operator gated steps; complete after.
- WI-1338 Inngest: NO autonomous scope (code path already correct — prod serves /v1/inngest, 87
  fns). Held on sole operator step: create Inngest Cloud prod env + sync + fire cron/event (lr-out-004).
- WI-1339 GitHub env: **DONE → Stage=Reviewing** (operator ruling lr-inbox-008 YES+YES): added main-only
  protected-branch policy to the production Environment (reviewers jojorgen/crowka preserved) + deleted the
  orphaned env-scoped DATABASE_URL secret (repo-level DATABASE_URL_PRODUCTION is the live one; no bare
  secrets.DATABASE_URL consumer). Completed via /cosmo:execute (descriptive Fixed In, infra-only WI). **Reviewer-graduated →
  Stage=Closed / Resolution=Done (2026-07-03) — FIRST WS-39 item fully closed; review pipeline validated end-to-end.**
- WI-1340 email: builder DONE → PR #1861 (SHIPPED doc banner matching Done-spec convention +
  regression test in config.test.ts asserting prod boot throws naming both missing keys; real
  validateEnv, no mocks, 75/75 pass; env:sync MODE_NAV_V2 strip reverted; committed chore(api) —
  commitlint rejects `test`). Builder corrected my ADR ref: MMT-ADR-0029 (bearer-token withdrawal
  authority), NOT 0027. CI running (my monitor on #1861). SAFE TO MERGE ON GREEN — no prod-build-break
  risk, no merge-hold. After merge (Gate 1), WI-1340 holds for operator gated steps: mint 2 secrets
  (lr-out-003 URGENT) + Resend SPF/DKIM + E2E (lr-out-004). Withdrawal feature itself already shipped (#1530).

**Outbox ledger:** RESOLVED — lr-out-003 (2 prod secrets minted+synced, boot-blocker cleared →
lr-out-007); lr-out-002 (WI-1310 Clerk prod key wired: verified pk_live_ in Doppler prd, GH Actions
..._PRODUCTION set, EAS prod env present; unblock posted for ramtop → lr-out-008). OPEN (awaiting
operator) — lr-out-004 (Wave-A ops bundle: Inngest Cloud prod env / Sentry+uptime alerts / 2 WI-1339
decisions / Resend SPF/DKIM + E2E), lr-out-005 (Sentry SENTRY_AUTH_TOKEN→EAS, unblocks #1857 merge).
**WI-1310:** ops done 2026-07-03; lifecycle closure follows Ramtop's M4/WI-1307 rollback-proof (its
true DoD) — not forcing its Stage.

**Wave-B refined to Ready 2026-07-03** (WI-1328 Assisted/L, WI-1335 Manual/M, WI-1341 Assisted/M,
WI-1337 Assisted/S; WI-617 stays HOLD-until-near-launch). Prime-and-hold; gates escalated lr-out-011
(operator per-WI console/credential asks) + lr-out-012 (orchestrator: cross-lane Config-T flip
ownership). REFRAME: Play Developer account access already resolved 2026-05-15 (pre-launch-checklist:
71-72) → Wave-B gated on specific console actions + credential access, NOT a pending ruling. Least-
gated = WI-1337 (FCM V1 upload; Firebase mentomate-9d02f exists). Cross-lane: WI-1341 Config-T flip =
shared nav/Ramtop-M6 flag — lr-inbox-007 RULED (spine-owned, land only after V0-retirement S6); WS-39
prepare-not-land ARTIFACT POSTED to WI-1341 for ramtop M6 pickup (diff + baseline: delta NONE; fallback-
flip = open spine-owner question). WI-1328 phase-4 RC keys → fallback-OTA republish before Ramtop M6. Store listing copy is C2 out-of-remit — offered to prime
WI-1335 draft artifacts, awaiting operator yes (did NOT draft unprompted).

**Everything autonomous is done — lane at its gated boundary.** Open: lr-out-004 (Wave-A ops bundle,
operator), lr-out-011 (Wave-B gates, operator), lr-out-012 (Config-T ownership, orchestrator).
**Next on resume:** on any gate-clear → prime/execute the unblocked WI; on operator verification of a
Wave-A gated step → verify + /cosmo:execute complete that WI (WI-1336/1340 merged, awaiting their
gated remainders; WI-1338/1339 operator-gated). Non-critical: prune hung .worktrees/WI-1336.

## Launch gate
Lane feeds the program launch gates (PGM-1 gate ledger: M5 V0 retirement, M6 ship + store
submission). Wave B store/monetization items are prime-and-hold until the operator releases the
store-account + product-scope rulings.

## Change log
- 2026-07-03 — Lane created (ORION). Scaffold + kickoff (lr-inbox-001). WS-39 = 10 items, Wave A
  (4 no-dep) released for autonomous execution; Wave B gate-parked; 2 cross-lane edges flagged.
