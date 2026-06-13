# PRG-17 · new-llm Integration (LLM) — execution tracker

**Status:** ACTIVATED 2026-06-12 (operator ruling: strategy O2 approved — merge new-llm
first, gated by the 12-item reconciliation checklist + final rescan)
**Owner:** Jorn (+ LLM shepherd session; program session orchestrates)
**Source of truth for findings:** `_wip/umbrella-program/supporting-artefacts/new-llm-integration-analysis.md`
(v1.4 @ `450e4c522` — §3 collision matrix C1–C12, §6 checklist, §7 lockstep, §8 rescan)
**Executive summary (stakeholder-facing):** `_wip/umbrella-program/supporting-artefacts/new-llm-integration-exec-summary.md`

## §1 Charter

Reconcile the `origin/new-llm` branch (FINAL feature SHA `6a81f7663`, 268 files,
±20k lines: V2-shell S0 "Now feed" + ~25-module audit-fix batch, all live-on-merge)
so it can merge to `main` BEFORE the IF cutover executes. The strategy ruling
(2026-06-12) and its rationale live in the analysis §6. This workstream executes
checklist items 1–7, 9–12 **on the branch**; item 8 (account-detachment canon
intake) is routed to the IF ratification path, not this workstream.

**The merge gate (program-session-owned, not WPs):**
1. All WPs below closed → **§8 final rescan** of the exact reconciled SHA +
   main-drift delta, including the Inngest cross-file semantic check (main moved
   `inngest/client.ts` + `helpers.ts` vs the branch's six rewritten functions —
   drift already triggered). Program session runs this as a workflow.
2. Operator merge approval (against the WP-7 behavior-change inventory).
3. Merge to main with the WP-6 content-level verification recorded on the merge PR.
4. Merge lands → boundary event "new-llm merged" → unlocks IF cutover execution
   (CUT-A generates against the post-merge journal).

**Working mode for the shepherd (amended 2026-06-12 — standard PR loop, base `new-llm`):**
- Isolated worktree per unit at `.worktrees/<branch>` **branched off `new-llm`**
  (e.g. `git worktree add .worktrees/WI-675 -b WI-675 origin/new-llm`, then
  `pnpm install` + `pnpm env:sync` per the worktree-setup skill). NEVER
  `git checkout`/`switch`/`stash` in the shared root checkout.
- **One PR per unit, base = `new-llm`** (operator-sanctioned 2026-06-12) — the
  standard Cosmo loop applies unchanged: PR is the WI's review evidence, CI runs
  on it (`ci.yml` `pull_request` has no base filter; verified), the autonomous
  review loop closes via `/cosmo:review`. Docs-only units (WI-678) skip CI via
  `paths-ignore` — review is the gate there. WI-682 (provisioning) has no PR;
  its evidence is the probe output recorded on the WI.
- Pre-existing red on the base branch is a **finding to record, not noise to
  fix-around** (the known one — the RLS guard — IS WI-676's subject).
- Zuzka's lane is halted; the branch is ours until merge. She retains a courtesy
  review slot on the final new-llm → main merge PR, which stays operator-gated
  and program-owned — the per-unit PRs against `new-llm` are NOT that gate.
- Migration numbers: next-free at landing, never pre-assigned (lockstep rule 2).

## §2 Unit map (Cosmo slice)

Order = recommended execution order; WP-1/WP-2 are the two Highs and gate everything.

Cosmo Workstream **"new-llm Integration & Reconciliation"**
(`37d8bce9-1f7c-8145-80ef-cec4b55dcba4`), sliced 2026-06-12:

| Order | Unit | Checklist | Severity | Shape |
|---|---|---|---|---|
| 1 | `WI-675` WP deploy-gate code fix | item 4 (C5) | **High** | code + test + CI |
| 2 | `WI-676` WP RLS for `mentor_activity_ledger` | item 12 | **High** | migration + test |
| 3 | `WI-677` WP guard/baseline reconciliation | items 1, 2 (C1, C7) | Med | file regeneration |
| 4 | `WI-678` WP ADR surgery + V2-plan re-key | items 3, 11 (C6) | Med | docs |
| 5 | `WI-679` WP GDPR export + OTA version bump | items 9, 10 | Med→High | code + config |
| 6 | `WI-680` WP merge-verification CI invariant | item 5 (C9) | Med | script + PR check |
| 7 | `WI-681` Task behavior-change inventory | item 7 | — | generated artifact |
| 8 | `WI-682` Task Doppler/Cloudflare provisioning | item 6 (= WI-664 fix) | P1 infra | secrets/KV |

Routed elsewhere: **item 8** (C10 account-detachment ruling) → IF ratification path,
carried in the planner hand-off (`_wip/identity-foundation/cutover-plan-delta-newllm.md`).

## §3 Slice-time notes

- The branch's `0111_zippy_gateway` SQL + snapshot are **hand-curated**, not clean
  `generate` output (unshipped concepts DDL hand-trimmed). Any new migration in
  WP-2 must be generated cleanly and diffed against the hand-doctored snapshot
  with eyes open; CUT-A's generate-preflight downstream depends on this state
  being understood.
- WP-2 must also answer WHY the branch's own CI never tripped the
  `rls-coverage.test.ts` [ASSUMP-F14] guard (suspected change-class routing
  skipping database-package tests on the branch). If real, that routing hole is
  its own finding — capture it, don't fix it here.
- WP-3's i18n baseline resolves by **intersection of both sides' entries + checker
  re-run** — NOT main-wins (the branch legitimately burned entries main still
  grandfathers, and main's WI-621 burn-down must survive: 361 → 12).
- WP-6's both-sides-changed set is **computed at merge time, never from a static
  list** (a static list went stale within hours during the analysis).

## §4 Log

- **2026-06-12** — Activated (fifth run of the §2.1 recipe). Strategy O2 ruled by
  operator; tracker + Cosmo workstream + 8-unit slice created; exec summary for
  Zuzka written; planner hand-off (cutover-plan delta) issued the same day.
- **2026-06-12** — Dedicated review watcher armed separately from the general
  multi-workstream watcher because this workstream has two scoped review-policy
  differences: PR landing evidence is against `new-llm`, and missing Work
  Package child/sub-item formality is an approved Cosmo dogfooding override.
  Watcher log: `/tmp/cosmo-watch-new-llm/logs/new-llm-reviewing-watcher.log`;
  review outputs: `/tmp/cosmo-watch-new-llm/reviews/`.
- **2026-06-12 (shepherd run, preconditions)** — On pickup all 8 units were at
  `Stage=Backlog` (not Ready) and WI-675–680 at `Altitude=WP` with 0 children —
  neither claimable. Resolved: WI-675 via the approved WP-childless waiver +
  audited manual promotion (EP=Assisted, Stage=Ready); WI-676+ via altitudes
  corrected to `Item` (operator) + sanctioned `refine --to-ready` (EP=Assisted).
  Per-unit brief = WI Description + cited analysis §3/§6 + tracker §1/§3 (operator
  confirmed: no separate brief doc). Shepherd-side Stage monitor armed separately
  at `/tmp/cosmo-watch-new-llm-shepherd/` (distinct from the review watcher).
- **WI-675 DONE → Reviewing.** C5 deploy-gate fix: structured first-line
  `-- @reference-only` marker replaces the free-text grep (0108 prose no longer
  false-positives; `deploy.yml:251` gate unblocked); 8 `node --test` cases + new
  `reference-only-gate` CI job. PR #1063 squash-merged → `origin/new-llm`
  `77fa3f406`; unit CI green; `execute complete green`. 2 PRE-EXISTING base reds
  recorded (not this unit's): `rls-coverage` (= WI-676) and `translate-gemini` /
  `source-baseline.locales` (= WI-677; this fails the base `main` CI job).
- **WI-675 REWORK → re-Reviewing.** `zdx:review` bounced it on close-artifacts
  only (fix itself confirmed good): `dod.5.summary_sections` (summary labels were
  period-form `What was done.` not colon-form `What was done:`) and
  `dod.7.fixed_in` (Fixed In empty). Corrected labels to colon form + set
  `Fixed In = 77fa3f406 (PR #1063)`; re-`complete`d. **PROCESS NOTE for all units:
  completion summaries MUST use colon section labels and `Fixed In` MUST be set
  manually — `execute complete` v0.1.0 does NOT write Fixed In.**
- **WI-676 DONE → Reviewing.** RLS item 12. Migration
  `0112_rls_mentor_activity_ledger` (next-free) — `ENABLE ROW LEVEL SECURITY` +
  policy `mentor_activity_ledger_profile_isolation`; predicate matches the repo's
  dominant pattern char-for-char (92 uses; = `assessments_profile_isolation`);
  snapshot diff vs 0111 is `isRLSEnabled:false→true` ONLY (clean generate, no
  resurrected concepts DDL). PR #1066 squash-merged → `origin/new-llm`
  `f079d8144`; `rls-coverage.test.ts` green; `Fixed In` set; `complete green`.
- **CI-ROUTING ANSWER (item 12 AC):** the branch's own CI never tripped the RLS
  guard due to TWO compounding holes — (1) `scripts/check-change-class.sh:223`
  matches `^packages/database/drizzle/` but migration SQL lives in
  `apps/api/drizzle/`, so migration-only diffs never set the `db-migrations`
  class; (2) `packages/database` has no nx `test` target / `jest.config.ts`, so
  `nx affected -t test` never runs `rls-coverage.test.ts`. Captured as **WI-684**
  (linked, Stage=Captured); NOT fixed here — CI-infra fix belongs on `main`
  (per analysis §3 slice note).
- **FINALIZATION PROTOCOL (learned the hard way; supersedes the earlier note).**
  WI-675 reworked twice and WI-676 once — all FORMAT-only. The reviewer's
  `dod.5.summary_sections` needs the body to contain `Completion Summary` +
  `What was done:` + `What changed:` + `Verification:` + a **single-line**
  `Caveats / Follow-ups:` — the 4th-section regex `/Caveats.*Follow-?ups:/i`
  requires both words on ONE line, so separate `Caveats:` / `Follow-ups:` lines
  FAIL. `execute complete` is append-only and writes non-rendered literal text,
  so re-running it on a reworked item stacks duplicate summaries the LLM reviewer
  rejects. **Protocol for every unit: (1) set `Fixed In` via PATCH (complete
  v0.1.0 never writes it); (2) author the body as ONE canonical summary via
  `replace_content` (renders bold, single block, combined `**Caveats /
  Follow-ups:**`); (3) transition to Reviewing; (4) verify with
  `bun review.ts --check WI-NN` → `mechanicalOk:true` BEFORE the reviewer polls.**
  Both items re-finalized clean; `review --check` mechanical green on both.
- **MAIN-DRIFT (benign for these units).** `origin/new-llm` advanced to `082f4a7e6`
  — a `Merge origin/main into new-llm` landed mid-run. Verified: WI-675 marker,
  WI-676 `0112` migration + journal, and WI-677 i18n state (still 349 / no-locales
  pre-fix) all survived; no migration-number collision. It physically surfaced the
  duplicate `MMT-ADR-0019` (became WI-678's concrete target). The §8 Inngest
  cross-file semantic check remains the program session's job at the final gate.
- **WI-677 CLOSED.** i18n C1+C7. Baseline re-derived to 12 (= main, zero WI-621
  entries resurrected); `source-baseline.json` locales rebuilt from locale files
  (2731 keys × 6; NOT restore-from-main — branch has 2731 vs main 2746). PR #1067
  → `9633c252f`. This CLEARED the base `main` CI red for all later PRs.
- **WI-679 → Reviewing (clean).** Items 9+10. profileId-scoped `mentor_activity_ledger`
  added to `export.ts` (+ shared schema contract in `account.ts`); `app.json`
  1.0.0→1.0.1 (runtimeVersion=appVersion excludes stale OTA targets); no `eas update`.
  3 tests incl. scoping assertion. PR #1068 → `0363b6eb0`.
- **WI-681 → Reviewing (clean).** Behavior-change inventory artifact (396 lines,
  274 files accounted-for, all 9 known-live items located, 12 ⚠️ operator-attention
  flags). PR #1071 → `c67b7a2a7`. The operator's merge sign-off reference.
- **WI-678 merged (#1069 → `287e99c9`) then REWORKED (substantive).** zdx:review +
  Codex both caught a real contradiction: S4 plan's prerequisites/sequencing note
  still called the ledger repoint "S4-owned (migration train)" while the body says
  IF M-REPOINT owns it. Rework in flight: align ALL S4 references to external/
  M-REPOINT ownership → fresh PR.
- **WI-680 REWORKED pre-merge (shepherd review).** Three-way merge invariant (PR
  #1070) was correct on drop + main-side, but direction (b) only WARNed on a
  *branch-only* file whose blob was ALTERED by the merge — a silent-rewrite hole
  (a merge that rewrites `routes/now.ts` would pass). Sent back: scope (b) to
  `diff(MB,feature)\diff(MB,main)` and FAIL on drop OR blob-mismatch there; both-
  sides-changed → direction (c) WARN; add a branch-only-altered FAIL test.
- **WI-682 PENDING operator ruling** on prod provisioning (CF KV namespaces +
  Doppler writes). I hold Doppler read + the CF token; default = provision dev,
  pause before stg/prd. Captured side-finding: **WI-684** (CI change-class routing
  hole) remains open for the `main`-side CI-infra fix.
- **2026-06-13 — SLICE EXECUTED (shepherd).** All units landed on `new-llm`
  (HEAD `2ec667f18`, 77 ahead of merge-base): WI-675 deploy-gate (#1063), WI-676
  RLS 0112 (#1066), WI-677 i18n baselines (#1067, cleared the base `main` red),
  WI-678 ADR + edge_id ruling (#1069/#1072/#1074, 2 reworks), WI-679 GDPR export +
  OTA bump (#1068), WI-680 merge-invariant (#1070, shepherd caught a branch-only
  blob-mismatch hole pre-merge), WI-681 behavior inventory (#1071/#1073/#1080 —
  regenerated LAST + self-counted at 293 so it can't self-stale), WI-685 deploy.yml
  IDEMPOTENCY env (#1075). All CLOSED or in-Reviewing-clean via the autonomous
  review loop. **WI-687** (TS-side RLS registration — WI-676 residue from the
  cutover v1.7 6th-round review) added mid-run, executed + CLOSED (#1079,
  non-vacuous verified). **WI-682** dev+staging provisioned (KV namespaces
  `idempotency-dev`=`29178404…`, `-stg`=`a120d297…`; Doppler `CF_KV_IDEMPOTENCY_ID_DEV/STG`
  + freshly-generated `SEED_PASSWORD`; probes green); **prod paused** for operator
  go, and the GitHub-Actions secret leg (`CF_KV_IDEMPOTENCY_ID_DEV/STG` — the CI
  deploy reads `secrets.*` not Doppler) flagged. Captured `main`-side findings for
  the §8 gate: **WI-684** (change-class routing skips DB tests), **WI-685** (done),
  **WI-686** (pre-existing `decision-adr-link` red on 2 v2-dossier headings).
  Baton → program session: §8 final rescan of `6a81f7663..2ec667f18` + main-drift
  (Inngest) + operator merge approval. Finalization note: `execute complete` v0.1.0
  is append-only + literal-text → the LLM reviewer rejects it; finalized every unit
  via `replace_content` (single canonical rendered summary, combined
  `**Caveats / Follow-ups:**`) + a property PATCH that mirrors complete's writes
  AND sets `Fixed In` (complete never writes it), verified with `review.ts --check`.
- **2026-06-13 — WI-682 PROD LEG EXECUTED + FINALIZED (operator full-go on
  dev/staging/prod).** Prod KV namespace created: `mentomate-kv-idempotency-prd`
  = `4996edfa51494fe7a6ec31f02a144902` (dev `29178404…`, stg `a120d297…` already
  live). Doppler prd now holds `CF_KV_IDEMPOTENCY_ID_PRD` + a freshly-generated
  prd `SEED_PASSWORD` (was absent) → all four AC secrets present across dev/stg/prd.
  Faithful render probe (real new-llm `wrangler.toml` + real `render-wrangler-kv.mjs`
  + real Doppler ids): all three `__IDEMPOTENCY_KV_*__` → real ids (prod at
  `[env.production]` line 213), `--check` clean, no residue. WI-682 → Reviewing,
  `review.ts --check` mechanicalOk; WI-664 page commented with landing evidence.
- **TWO deploy-time blockers surfaced by the prod probe (provisioning itself is
  correct — these are downstream of it).** (1) **WI-694 (P1, NEW, Captured)** —
  `verify-wrangler-kv-binding.mjs` block-capture regex (lazy `[\s\S]*?` + multiline
  `$`) yields an empty body → the deploy step "Verify Cloudflare KV bindings before
  migrations" reports "missing binding" for EVERY binding incl. concrete (repro'd on
  coaching/subscription); **byte-identical on `main` & `new-llm`; recent `main`
  deploys already RED at exactly this step.** ⇒ new-llm merge + WI-682 provisioning
  is necessary but **NOT sufficient** to green the chronic Deploy/KV (WI-664) — the
  verifier must be fixed (main-side). (2) **GitHub-Actions secret leg unreconciled**
  — CI render reads `secrets.CF_KV_IDEMPOTENCY_ID_*` (not Doppler); `_DEV`/`_STG`
  absent, `_PRD` predates the real namespace (set 06-13 08:31Z). Operator decision
  pending; not written by the shepherd (distinct trust boundary).
- **Findings ledger for the §8 gate:** WI-684 (change-class routing skips DB tests),
  WI-685 (deploy.yml IDEMPOTENCY env — done), WI-686 (`decision-adr-link` red on 2
  v2-dossier headings), **WI-694 (verify-binding regex — P1, gates the Deploy/KV
  green-up).** All 10 reconciliation units landed; WI-682 the last, now Reviewing.
- **2026-06-13 — WI-682 CLOSED** (Done @ 09:00). Reviewer first bounced it (rework
  09:49→reconciled): the literal AC wants the four secrets in ALL three configs;
  first pass was env-specific (one id per config). Reconciled — each of dev/stg/prd
  now holds `CF_KV_IDEMPOTENCY_ID_DEV/STG/PRD` + `SEED_PASSWORD`; per-config probe
  resolves all four; re-finalized; reviewer closed.
- **2026-06-13 — WI-694 EXECUTED (fix on `main`, ahead of the merge — operator
  directive: live deploy outage).** Worktree `.worktrees/WI-694` off `origin/main`;
  fix in `apps/api/scripts/verify-wrangler-kv-binding.mjs`: block-end anchor
  `$`→`$(?![\s\S])` (true EOF, not every line-end) + id check tightened to real
  32-hex (rejects unrendered `__X__`/`<X>` placeholders, matching render-wrangler-kv's
  `REAL_KV_ID_PATTERN`) + exported `hasConcreteKvBinding()` with a robust
  `resolve(argv[1])===resolve(fileURLToPath(import.meta.url))` CLI/import guard (a
  `file://${argv[1]}` guard would silently no-op the gate under deploy.yml's relative
  invocation). Red-green `node:test` (`verify-wrangler-kv-binding.test.mjs`, 8 cases)
  wired into `ci.yml`; reverting the regex fails the 4 concrete-detection cases.
  Commit `d4856a37f`; **PR #1083 → `main`** (NOT merged — main is operator-gated);
  CI green (`main` + API Quality Gate SUCCESS, incl. the new node:test step). NOTE:
  fixes the verify-step false-fail, but the GH-Actions-secret leg (DEV/STG absent,
  PRD stale) still independently blocks a real deploy render — both must land for the
  Deploy/KV chain to green. WI-694 stays Executing pending the main merge.
- **2026-06-13 — WI-681 inventory CORRECTED (follow-up, not a reopen).** Merge-gate
  rescan found 3 accuracy gaps in `behavior-change-inventory.md`: (1) OMISSION —
  added §A16 Services-Quiz for `services/quiz/complete-round.ts` (live-on-merge
  celebration enqueue via safeWrite, 0→2 calls; A16-19 renumbered→A17-20,
  §A17→§A18 cross-ref); (2) WRONG LABEL — `use-quiz.ts` (deleted→Modified),
  `useFetchRound`→`usePrefetchRound` removed (both the B5 + results.tsx rows);
  (3) WRONG PATH — `SessionSummaryLibraryFilingControls.tsx`
  `components/session/`→`components/session-summary/`. Verified vs `origin/new-llm`
  first. PR #1084 squash-merged → `new-llm` `8582a33b8` (doc-only, CI-skipped via
  paths-ignore). Inventory now accurate for the program session's §8 rescan.
- **2026-06-13 — WI-694 MERGED TO MAIN + finalized; Deploy/KV chain closed out.**
  PR #1083 squash-merged → `main` `a51844dd7` (operator go) — the verifier fix is
  now live on main, ending the outage that reded every main deploy. CodeRabbit's one
  Major (regex over-capture past a single-bracket table) fixed pre-merge (`cdeb6d7e6`,
  boundary → `^\s*\[`, + regression test). WI-694 finalized → Reviewing,
  `Fixed In = a51844dd7`, `review.ts --check` mechanicalOk; WI-664 cross-linked as
  the root-cause item. **GitHub-Actions secrets set** (operator go): `CF_KV_IDEMPOTENCY_ID_DEV`
  =`29178404…`, `_STG`=`a120d297…`, `_PRD`=`4996edfa…` (stale PRD corrected) — render
  proof against new-llm `wrangler.toml` confirms all three `__IDEMPOTENCY_KV_*__`
  substitute to these exact ids. **Deploy/KV chain now end-to-end:** WI-682 (KV
  namespaces + Doppler) + WI-685 (deploy.yml env) + WI-694 (verifier) + GH secrets.
- **2026-06-13 — merge-invariant check RENAMED** (operator request). `merge-invariant.yml`
  workflow name + load-bearing job/check-run name → `Merge completeness check` (WI-id
  dropped); `check-merge-invariant.ts` log banner aligned. PR #1085 squash-merged →
  `new-llm` `4edd4c8b6`. Operator verified `main` branch protection requires only
  `main`/`Playwright web smoke`/`API Quality Gate` — merge-invariant is NOT required
  under any name, so no blocks-forever exposure; future protection will require the
  new name only, after it first reports on the new-llm→main PR.
- **All shepherd work complete.** Baton fully with the program session: §8 final
  rescan of `6a81f7663..4edd4c8b6` (new-llm HEAD) + main-drift (Inngest) + operator
  merge approval. WI-694 landed on main pre-merge (its script home); WI-664/682/685
  closed/Reviewing; findings ledger: WI-684 (open, main-side CI routing), WI-686
  (open, decision-adr-link), WI-694 (Reviewing).
