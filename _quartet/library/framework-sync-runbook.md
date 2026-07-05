# Library — Framework Sync Runbook (append-log)

**What this is.** The operating log for **manual framework distribution** — the git-mediated snapshot
sync that carries framework files **from the canonical home outward to consumers** (ZDX-ADR-0012 I2;
canonical home bound to Nexus `_quartet/` by NEX-ADR-0013). It is an **append-log**: every manual sync
pass appends a dated entry recording the steps taken, the drift found, the judgment calls made, and
the gotchas hit. The log accumulates *evidence* so the eventual `framework-sync` script is specified by
what real passes actually required — not guessed.

**Scope reminder (what syncs).** Framework files only: `roles/`, `clacks/`, `library/`, `examples/`,
and the top-level framework docs (`README`, `glossary`, `dependencies`, `audit`, `planning-rules`,
`CONTEXT`). **Never** `working/`. Per-estate overlays (secret resolution; branch/commit discipline)
never sync — they are bound per-repo (NEX-ADR-0013 P4/P5).

**Rules for this log.**
- **Manual sync stays for MVP.** No script yet — a `framework-sync` tool is a later enhancement, gated
  on this log carrying enough evidence to specify it (WI-1199 / follow-up).
- **Every sync pass appends here** — steps, per-file drift-direction analysis, judgment calls, gotchas.
  Never overwrite a prior pass; append a new dated section.
- **Sync is unidirectional from canonical.** A pass that discovers *consumer-newer* content does **not**
  fold it back inline — it flags a **one-time reconciliation into canonical** (ZDX-ADR-0012 I2, gap (c))
  as separate tracked work, then proceeds outbound.
- **Adopt at session boundaries.** A landed sync takes effect for a consumer instance at its next boot /
  post-compaction re-read — never hot-swapped mid-session.

---

## Pass log

### 2026-07-02 — eduagent PR #1823 (docs-only framework sync)

**Direction:** canonical (Nexus `_quartet/`) → consumer (eduagent-build). Docs-only pass (no
executable framework code moved).

**Per-file drift-direction analysis.** Each candidate framework file was classified by *which side was
newer* before deciding the action — drift is not assumed one-directional:

| File | Drift direction | Action |
|---|---|---|
| role docs (`roles/`) | canonical-newer | synced outbound (canonical → consumer) |
| `dependencies.md` | **consumer-newer** (eduagent side had the fresher one-fact-one-home content) | **flagged for one-time backport into canonical** (gap (c)); NOT folded inline. Backport folded into **WI-1224** (AC carries the explicit backport clause). |
| remaining top-level docs | canonical-newer / in-sync | synced outbound or no-op |

**Judgment calls / fixes made this pass:**
- **ADR-cite portability fix.** A framework doc carried an estate-specific ADR citation that would be
  *wrong* when synced verbatim into the consumer repo. Fixed by making the reference portable (cite the
  portable contract, bind the estate-specific number in the estate's own binding record) — this is the
  framework/overlay test (ZDX-ADR-0012 I6) applied in practice: content that would be wrong when synced
  verbatim is an overlay, not framework.

**Gotchas (carry forward — these will bite the eventual script):**
- **CRLF false-diff trap.** Line-ending differences (CRLF vs LF) between the two checkouts render as a
  *whole-file* diff that is **not** real content drift. Before trusting a diff as drift, normalize line
  endings (or diff with `--ignore-cr-at-eol` / a `.gitattributes`-normalized compare). A naive byte-diff
  over-reports drift massively on this estate (Windows consumer checkout).
- **`main`-guard husky hooks (consumer P5 overlay).** The consumer repo's branch discipline includes a
  husky `main`-guard that blocks direct commits to `main`; a sync commit must go through the repo's
  normal branch/PR path (hence PR #1823, not a direct push). This discipline is a **per-repo overlay
  (NEX-ADR-0013 P5)** — do not try to "sync it away."
- **Pre-push `tsc` gate.** The consumer's pre-push hook runs `tsc`; a docs-only sync still trips the
  gate if the working tree carries unrelated type errors. Keep the sync branch clean of unrelated
  changes so the gate reflects only the sync.

**Outcome:** framework docs landed on the consumer via PR #1823; the one consumer-newer file
(`dependencies.md`) deferred to the WI-1224 backport rather than reverse-synced. Unidirectional rule
(I2) preserved.

<!-- Append the next pass below this line as a new dated ### section. -->

### 2026-07-05 — eduagent-build full framework sync (pre-relaunch, Ramtop/macOS)

**Direction:** canonical (Nexus `_quartet/`) → consumer (eduagent-build). Full pass — docs **and**
executable framework code — ahead of spawning a fresh orchestrator lane on the Ramtop consumer
checkout. Executed by Vetinari (rsync-based, working-tree copy; landed via the consumer repo's
commit path).

**Per-file drift-direction analysis:**

| File / area | Drift direction | Action |
|---|---|---|
| `roles/`, `library/`, `examples/`, top-level docs (`README`, `glossary`, `planning-rules`, `dependencies`, `audit`) | canonical-newer | synced outbound (`rsync --delete` per dir) |
| `clacks/*` except `review-watcher.ts` (incl. new `lease.ts`, `l1-liveness-check.js`, `lane-state-path.mjs`, `validate-channel-envelope.js`, watchdog `.ps1`s) | canonical-only / canonical-newer | synced outbound |
| `clacks/review-watcher.ts` | **diverged both ways** — consumer carries eduagent PR #1882 (durable launch ledger + startup Reviewing backfill, `COSMO_WATCH_BACKFILL_REVIEWING`), canonical carries the WI-1156/WI-1221 lease substrate but still baseline-skips items already in Reviewing at boot and lacks the durable ledger | **HELD on consumer** (not overwritten); #1882 flagged for one-time backport/merge into canonical (gap (c)) as tracked work — after backport, next pass syncs the merged watcher outbound |
| `scripts/` (`check_wi_reference.py`, `orphan-reconcile-sweep.ts` + tests) | canonical-only | synced outbound — **scope extension**: `scripts/` postdates this runbook's scope list; treated as framework executables (verified path-portable) |
| `findings.md` | canonical-only | **skipped** — not in the runbook's top-level-docs scope; carries `_wip/` estate-specific refs |
| `working/program/*.template.md` | canonical-newer | **skipped** per "never `working/`" rule — note the templates live under `working/` but are arguably framework shapes; revisit whether templates should move out of `working/` so they can sync |
| consumer `RETIRED.md`, `_quartet-wip/`, `working/` | consumer-only | untouched (downstream marker, meta artifacts, live instance state) |

**Gotchas (carry forward):**
- **`rsync --delete` + `--exclude` is the hold mechanism.** Excluding a held file protects it from
  both overwrite and deletion in the same pass; per-dir `--delete` otherwise keeps the consumer free
  of canonical-removed strays without touching consumer-only top-level files.
- **Windows-only framework executables on a macOS consumer.** The supervisor-watchdog pair is `.ps1`
  (Windows Scheduled Task); synced verbatim for completeness but inert on macOS — a launchd/cron
  equivalent is an open gap for non-Windows consumers.
- **Shared consumer checkout.** The consumer working tree carries concurrent sessions' dirty files;
  the sync commit must stage only the synced paths (own-work scope), never `git add -A`.

**Outcome:** consumer framework now matches canonical except the held `review-watcher.ts`;
unidirectional rule (I2) preserved; #1882 backport is the flagged reconciliation work.
