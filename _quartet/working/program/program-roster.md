# ORION — Program Roster

> Standing hypothesis: the Initiatives this ORION instance owns and their state. Rows + pointers —
> not delivery detail (lane trackers) or live WI state (Cosmo). Machine-local; **not committed**
> (operator containment ruling). Shape: `../../library/program-roster.md`.
>
> **Containment:** the lanes `adr-governance-correction`, `agent-instructions`, `architecture`,
> `errors-api`, `flow-remediation`, `l10n-a11y`, `new-llm-integration`, `pr-cleanup`,
> `security-pii-api`, `security-pii-inngest`, `v2-finalization` belong to **Ramtop** — NOT on this
> roster; never read-write/dispatch/reconcile. Coordinate only via Cosmo + operator (WI-1263 gap).

## Board (one row per Initiative)

| ID | Status | Owner | Outcome | Depends-on | Decomposition (pointer) | Activate-when |
|---|---|---|---|---|---|---|
| PRG-31 | active (executing, autonomous) | ORION | LLM safety + eval-envelope correctness — 3 WIs Closed; **P1 safety leak WI-1154** provably fixed (break test) | — | `working/lanes/safety-eval/` + WS-31 (Cosmo) | Released 2026-07-02, P1-first; shepherd kickoff handed to operator to spawn |
| PRG-33 | active (executing, autonomous) | ORION | Mobile UX & navigation coherence — all WS-33 WIs Closed, no nav-shell regression across V0-off/V0-on/V1 | — | `working/lanes/mobile-ux-nav/` + WS-33 (Cosmo) | Released 2026-07-02 (refine→sequence→execute autonomously); no operator execute gate |
| PRG-34 | active (released, awaiting operator-launched shepherd) | ORION | Platform-hardening debt burn-down — 17 WIs Closed | Execution-time Ramtop overlap coordination (WI-1183/1179/1069/1098) | `working/lanes/platform-hardening/` + WS-34 (Cosmo) | Released 2026-07-08 by operator on PM recommendation; shepherd kickoff authored |
| PRG-NN | — | — | **unrouted intake** (holding row — keep last) | — | — | — |

`Status` ∈ proposed · active · graduated · parked · killed.

## Standing meta-watch — Quartet/Cosmo dogfooding (operator directive 2026-07-02)
We run an early Quartet on live Cosmo (dogfooding). ORION keeps a **meta-view on Quartet + Cosmo
operations**: when any agent (shepherd/executor/reviewer/me) hits a tooling/process defect or friction
in Quartet or Cosmo, I **check whether a WI already exists** — first in workstreams **"Cosmo
improvements"** and **"Quartet MVP"**, then a keyword scan — and if none, **capture one** via
`/cosmo:capture`. Do not silently work around; surface it into the backlog.
- Log of meta-issues handled:
  - `cosmo:triage` Windows `which`/judge-detection ENOENT crash → not tracked → **captured WI-1282** (Cosmo improvements, P2 Bug) 2026-07-02. Workaround `--judge-provider claude` live in WS-31/WS-33 kickoffs.
  - Cosmo dedup/triage judge subprocess exits 1 under `ANTHROPIC_API_KEY` precedence (even with `--judge-provider claude`) → not tracked → **captured WI-1284** (Cosmo improvements, P2 Bug, related WI-1282) 2026-07-02. Interim: manual title-token dup scan. Surfaced by WS-31 shepherd. **Second failure mode folded into WI-1284:** codex-provider path crashes on a CLI arg mismatch on this host too — so the dedup judge is unusable across BOTH providers on Windows; capture degrades gracefully (structured recall, no auto-link). No separate WI.
  - Watch-relevant existing items noted during the scan: **WI-1265** (review ci.ts fooled by fail-open CI reporting SUCCESS without running — bears on my "green≠ran, never merge a red PR" review invariant) and **WI-1266** (DoR check looser than the Reviewing Bug-guard → items pass DoR then bounce). WI-1266 got a live end-to-end repro 2026-07-02 (whole WS-33 Bug slice bounced on AC wording).
  - `/cosmo:review`+`/cosmo:qa` has no honest disposition for a verified ALREADY-FIXED WI (green-landing-commit DoD can't be met by a pre-existing-fix item; WI-1208 double-bounced) → not tracked → **captured WI-1293** (Cosmo improvements, P2 Bug, related WI-1266) 2026-07-02. Ruled the honest close (option b: not-reproducible Resolution, historical commit as Fixed In, passing test on green main as evidence); process lesson = close already-fixed at triage/verify-first, not execute/review. Mechanism detail (execute.ts complete has no Resolution flag) added as a comment on WI-1293. **CORRECTION 2026-07-03:** WI-1208 was a MISDIAGNOSIS, not a true instance of this gap — on its 3rd review bounce the reviewer surfaced the real recent green Fixed In `eb9423945`/PR#1827 (adds the MODE_NAV_V2-aware `handleBack` branch + V2-on/off regression tests) that the *first builder summary had wrongly denied existed. WI-1208 was genuinely completable and closed honestly. WI-1293/1296 remain valid LATENT tooling gaps but are now UNEVIDENCED by a confirmed live case. Learning: verify Fixed In in code (git show), never from builder prose — a builder assertion ("handleBack has no V2 conditional") was flat wrong and nearly caused a wrong park.
  - `cosmo:execute complete` APPENDS (never replaces) the completion summary → a bounced attempt's stale content persists and `/cosmo:qa` re-flags it on re-completion (append-not-replace deadlock, rework re-bounce loop; finalization-runbook s8) → not tracked → **captured WI-1296** (Cosmo improvements, P2 Bug, related WI-1293/WI-1266) 2026-07-02. Distinct from WI-1293; affects every rework cycle. Surfaced via WI-1208.
  - **Zombie Executing state** — an item can sit at `Stage=Executing` with `Claimed By`/`Started`/`Claim Expires` all null (invalid lifecycle; no guard reverts an expired/released claim's Stage), masquerading as active work in a Stage monitor → not tracked → **captured WI-1312** (Cosmo improvements, P3 Bug, related WI-1263/WI-1266) 2026-07-03. Live example **WI-904** ("Dictation playback…") leaked into WS-33 in this state; surfaced independently by the WS-33 shepherd + ORION's Stage monitor. WI-904 itself is NOT ORION's work (out of all 3 workstreams) — off the shepherd's plate; **operator escalation open** to identify its true workstream + reset the invalid state (never mutated — WI-1263 provenance-unknown).
  - **No close path for NOT-REPRODUCIBLE at Stage=Refining** — Resolution enum has only Done/Wontfix/Cancelled/Duplicate (no Not-Reproducible); close.ts needs Reviewing, refine.ts only --to-ready, triage dispositions scoped to Captured/Triaging → a Refining-stage verified-not-reproducible item has no honest close (Cancelled = false provenance) → not tracked → **captured WI-1318** (Cosmo improvements, P3 Bug, related WI-1293/WI-1296) 2026-07-03. Same disposition-gap family as WI-1293/WI-1296, different stage + missing enum value. Live example **WI-1184** (WS-33) parked-documented at Refining pending this fix.
  - **Dedup double-fire (WI-1284 manifestation):** WI-1315 == WI-1316 byte-identical (eval-harness HW02 false-fire, probes.ts:454) — broken dedup judge let a true duplicate through. WI-1316 canonical (wired→WI-1155 by WS-31 shepherd's split), WI-1315 = accidental dup to mark Duplicate at triage. Evidence for WI-1284; no new WI.

## Activation queue
Forward view → `activation-queue.md`. Dashboard (`dashboard.html`) is a generated view over this
roster + Cosmo — never a home.
