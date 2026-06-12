# new-llm Integration Analysis — gap vs main, gap vs the IF cutover, strategy

**Date:** 2026-06-12 · **Status:** v1.3 — three adversarial passes (pass 1: C5
corrected, items 9–10 added, §7 enforcement; pass 2, cutover-context reviewer: item 10
executable, repoint ownership split, item 11 added, item 5 dynamic; pass 3, same
reviewer: version bump REQUIRED not optional, item 5 bidirectional, §8 final rescan of
the reconciled merge target restored as mandatory; pass 4: **item 12 RLS gap (High,
verified)**, §6 sequencing order corrected, Inngest main-drift delta declared already
triggered). Verdict all four passes: **O2 stands with amendments** — every finding
peripheral to the strategy core. Final feature SHA: `6a81f7663`; merge target = that
SHA + reconciliation commits (items 1–12), rescanned per §8 before approval.
Strategy recommendation pending operator ruling.
**Method:** 9-surface sweep workflow (55 agents), every high/medium finding adversarially
verified (confirmed / adjusted / refuted) by independent re-derivation. Branch state analyzed:
`origin/new-llm` @ `6a81f7663` (60 ahead / ~11 behind main; merge-base = cutover-plan v1.3
commit `82313356b`, i.e. freshly synced). 1–2 small commits still in Zuzka's pipeline —
§8 rescan covers them.

## §1 What the branch actually is

268 files, +20.8k/−21.5k lines, in **two distinct strata**:

1. **One new feature (S0 of the "Mentor-Is-The-App" V2 shell):** the Now feed — `routes/now.ts`
   (`GET /now`, `/now/overflow`), `services/now-feed.ts` (614 lines, deterministic, no LLM),
   `services/activity-ledger.ts`, new table `mentor_activity_ledger` (migration
   `0111_zippy_gateway`), plus the MentorMascot/BrandCelebration visual components on mobile.
2. **A large audit-fix batch:** ~25 API modules rewritten in place (metering top-up refund
   integrity, escalation stuck-heuristics, freeform filing threshold 3→5 server-enforced,
   recap ownership re-anchor, Inngest idempotency/onFailure/step-nesting fixes, Sentry
   escalation on Clerk/Resend/Expo errors, SSE done-frame schema validation, GDPR
   byok_waitlist erasure on account delete, removal of the dead memory-enabled endpoints)
   + targeted mobile bug-fix sweeps (Atlas safe-now batch PR #822, verified-orphan
   dead-code sweep PR #821, flow-trap fixes).

**What it is NOT, despite the branch name:** `services/llm/*` is completely untouched; the
session-exchange spine is touched at exactly two points (a hardcoded
`CONCEPT_CAPTURE_ENABLED = false` gate — deliberately disabling concept-capture pending
MMT-ADR-0012 — and done-frame validation). No new screens; the V2 shell exists **only as
plan documents**. No new Inngest functions (six modified). Nothing is deleted that anything
still calls (verified for the memory-enabled endpoints and ProfileSwitcher).

**Flag posture (verified, HIGH):** nothing gates the API changes — `MODE_NAV_V2_ENABLED`
exists but has zero readers ("reserved at S0"); `IDENTITY_V2_ENABLED` does not exist on the
branch. **Merge = live** for every behavioral rewrite and the Now-feed routes. The README's
"everything ships behind the flag" promise holds only for the (not yet built) V2 UI.

## §2 Intent (v2-plan) and its self-discipline

`docs/plans/v2-plan/` defines the Mentor-Is-The-App shell: ~90-screen tab matrix collapsing
to three tabs (Mentor / Subjects / Journal), strangle-not-rewrite, evidence-gated. The plan
set is genuinely identity-aware and self-fencing: S0–S3 are contractually
identity-independent ("cite no person/edge/membership table"; misclassified deliverables
move to S4); S4/S5/S6 are identity-blocked with hard Blocked-by sections and a ban on
stubbing person/edge against legacy. The branch implements S0 (+ the fix batch); S1+ are
unbuilt.

**Stale by two days:** their blocker chains ("WI-530 → Phase P → W1 → W2") predate the
cutover-gap discovery. S4/S5 must re-key to **post-flip** (`IDENTITY_V2_ENABLED` true +
convergence done), not "W2 landed" — the new tables exist today but are not live.

## §3 Verified collision matrix (vs main and vs the cutover)

| # | Finding | Severity (post-verification) | Disposition |
|---|---|---|---|
| C1 | **i18n ratchet baseline re-inflated 12 → 349** — a branch-side merge resolution silently undid WI-621's burn-down (set-analysis: main's 12 + 337 resurrected entries; source-side `t()` routing survived on both sides) | **High, confirmed** | Pure file-level fix: take main's baseline wholesale at merge; branch's own new copy is properly t()-routed (7 locales) |
| C2 | Migration slot 0111 consumed by `0111_zippy_gateway` while the cutover plan hard-codes 0111/0112/0113 | Medium (adjusted: first-merger-wins) | Plan switches to "next-free at landing" numbering (already in the v1.1 addendum); whoever merges second renumbers |
| C3 | `mentor_activity_ledger.profile_id` FK → legacy `profiles(id)` ON DELETE CASCADE — a new drop-listed-table dependent unknown to the plan's static inventory | Medium (adjusted: **no stranding** — plan §2.7 generates M-REPOINT from live `pg_constraint`, absorbing it automatically) | **Ownership split (pass-2 sharpened):** M-REPOINT owns the FK only; CUT-B/grep-clean owns the code side (`activity-ledger.ts` legacy `profiles` import, relations, tests, the scoped-repo accessor); and the V2 **S4 plan must be amended to DROP its independently-scheduled second repoint migration** (s4 plan lines ~168–175) — otherwise two lanes migrate the same column. 0111 must be applied before the re-point catalog snapshot |
| C4 | `deletion.ts` gains a NEW legacy read (`accounts.email` RETURNING → byok_waitlist erase, GDPR Art-17) | Medium, confirmed | CUT-B2's deletion twin spec must carry it or the GDPR fix silently drops at cutover |
| C5 | Deploy gate `check-reference-only-migrations.mjs` **false-positives on journaled 0108**: its marker regex (`/REFERENCE ONLY\|DO NOT APPLY/i`) scans every journaled migration's SQL, and 0108's own header *mentions* "0106/0107 are REFERENCE ONLY" — so post-merge the gate blocks **every** staging/prod deploy (it runs before the migrate + worker-deploy steps), including the whole convergence chain and the branch's own WI-664 payoff. 0108 is journaled forever (MMT-ADR-0012), so it never self-resolves. The script ships untested and unwired in CI, so the defect surfaces only at the first live deploy. *(Corrected by red-team — the original "0106/0107 journaled" framing and "runbook exemption note" remedy were both wrong.)* | **High** (red-team corrected) | **Pre-merge code fix, not a note:** structured own-file marker (e.g. first-line `-- @reference-only` token), a unit test pinning "current journal passes", and one CI invocation against the real journal |
| C6 | ADR tangle: duplicate `MMT-ADR-0019` (branch freeform-threshold vs main os-agnostic), branch reserves 0020–0023 (0020 collides with the consent_request ADR pencil), branch `docs/INDEX.md` wrong, ledger ADR missing its lockstep canon edit | Medium, confirmed | Renumber branch ADRs to next-free at merge; fix INDEX; add the lockstep edit; cutover plan already yields on 0020 |
| C7 | `source-baseline.json` drops its `locales` key (~16.5k lines of per-locale hash state) while `translate-gemini.ts` still reads it 11 times | Medium, confirmed | Restore at merge or re-run translate |
| C8 | 9 legacy-reader-inventory files modified (all surgical fixes, none rewrite identity access) + 6 CUT-B twin-target files changed in place | Medium, confirmed | Twin-spec drift only: CUT-B authoring hasn't started, so author twins once against post-merge content |
| C9 | Merge hygiene: demonstrated failure mode — corrective merges previously dropped 20- and 239-commit main batches (C1 is itself an instance) | Medium, confirmed | Any merge-back requires content-level verification against both parents, not just conflict resolution |
| C10 | A ratified identity ruling lives only on the branch (`2026-06-09-account-detachment-decision-capture.md`, "pending canon amendment") | Medium, confirmed | Canon intake via the IF ratification path, not a side-door landing |
| C11 | Expo package version realignment to SDK-54-canonical | Adjusted (correct, not a regression) | None |
| C12 | AGENTS.md mixed-direction merge conflict | **Refuted** | None |

**What does NOT collide (verified):** the four sensitive CUT-B surfaces (auth/account
middleware, account/profile/consent services, both webhook handlers, profileMeta) are
untouched; the 78-file reader inventory and 22-Inngest list do not grow (new services are
identity-clean by grep); the V0 5-tab nav contract, its helpers, and its hard-constraint
test are untouched; mobile merges textually clean (zero mobile commits on main since
merge-base); LLM canon fully intact (zero new call sites, envelope strengthened, no prompt
changes — no eval-harness obligation).

**Positive collision:** the branch **wires the BUG-12 / WI-664 fix** — IDEMPOTENCY_KV
bindings for all three environments (wrangler.toml + render-wrangler-kv.mjs + Doppler
`CF_KV_IDEMPOTENCY_ID_*` keys). Merging it unblocks staging deploys and the prod migration
chain, given the Doppler keys + Cloudflare namespaces are provisioned.

## §4 Canon conformance

- **Identity canon: conformant-by-design.** The one deviation (profileId-keyed ledger) is
  documented in its own ADR which forbids person/edge reads at S0 and defers coupling to
  S4 — a canon-aware, time-boxed deviation, not drift. The branch *removes* persona-derivation
  surface. Consent changes are semantically neutral (rate-limit relocation).
- **LLM canon: clean.** MMT-ADR-0014/0018, the model register, the envelope contract, and
  hard-cap doctrine all untouched or strengthened.
- **Process canon: the gaps are C6 (ADR hygiene) and C10 (side-door ruling doc).**

## §5 Gateability

The branch was *designed* gateable at the UI layer (V2 flag) but is **not gateable as it
stands at the API layer** — and does not need to be: stratum 2 is a bugfix batch main wants
live, and stratum 1 (Now feed) is additive (new routes + one new ledger write in
auto-file-session). Retro-fitting flags would cost more than it de-risks. The correct gate
is the existing one: PR review + CI + the reconciliation checklist below.

## §6 Strategy

**Options considered:**
- **O1 — IF-first, new-llm waits for post-drop main:** forces Zuzka's lane to hold for the
  whole CUT-A/B + convergence arc, continues the rebase treadmill whose merge mechanics
  have already dropped main batches twice (C9), and delays a bugfix batch + the WI-664 fix
  that main wants now. All cost, no benefit — the branch needs no post-drop surface.
- **O3 — split the branch (identity-decoupled core early, rest later):** moot; the analysis
  shows the *whole implemented branch* is the identity-decoupled core. The identity-coupled
  stages are documents.
- **O4 — progressive twin conversion on the branch:** moot for the same reason; there is
  nothing to convert.
- **O2 — merge new-llm first, then run the cutover on post-merge main: RECOMMENDED.**
  The DB-side collision self-absorbs (catalog-driven re-point), CUT-B twins haven't been
  authored yet so they get written once against final content, the migration-number issue
  dissolves under next-free numbering, the i18n/ADR/locales items are mechanical pre-merge
  fixes, and the merge ends both the rebase treadmill and the WI-664 blockage. The cutover
  plan needs only delta edits (C3 code-side, C4 twin spec, C5 deploy-gate reconciliation),
  which fold into the pending v1.1→ratification cycle.

**Pre-merge reconciliation checklist (the price of O2 — red-team-hardened v1.1; items
4′/5′/7′ rewritten, 9–10 added):**
1. i18n ratchet baseline (C1): resolve by **intersection of both sides' entries + re-run
   the checker** (not main-wins — the branch legitimately burned entries main still
   grandfathers); verify ratchet CI green on the merge PR.
2. Restore the `locales` key in `source-baseline.json` or re-run translate (C7).
3. ADR surgery: renumber the branch's two colliding ADRs to next-free, fix `docs/INDEX.md`,
   add the ledger ADR's lockstep canon edit (C6).
4. **Deploy-gate code fix on the branch before merge (C5):** structured own-file
   reference-only marker + the missing unit test (pin "current journal passes") + one CI
   invocation against the real journal. A runbook note is insufficient — the gate is code
   and currently false-positives on journaled 0108.
5. **Content-level merge verification as an executable CI invariant (C9):**
   (a) path-level rule — every path in `diff(main, merge)` must appear in
   `diff(merge-base, branch)`; any extra = main content modified by the merge;
   (b) **bidirectional (pass-3):** every path in `diff(merge-base, branch)` must also
   survive into the merge result — branch-only files blob-compared merge-vs-branch —
   except explicit, documented "do not land / replaced by X" exclusions; otherwise a
   reconciliation that silently drops `routes/now.ts` or `activity-ledger.ts` passes
   the main-side rule; (c) the both-sides-changed set is **computed at merge time,
   never from a static list** (pass-2: the v1.1 static list was stale within hours;
   then-current intersection: `.claude/memory/MEMORY.md`, `AGENTS.md`, `docs/PRD.md`)
   — every intersecting path gets a named resolution rule, and branch-vs-main
   divergences in guard/baseline files are checked even when only one side moved since
   merge-base (the C1 class); (d) runs as a check on the merge PR, recorded in the PR,
   not a human promise.
6. Doppler provisioning before the post-merge deploy: `CF_KV_IDEMPOTENCY_ID_DEV/STG/PRD`
   + `SEED_PASSWORD` (+ Cloudflare KV namespaces) — this is the WI-664 fix landing.
7. **Operator sign-off against a generated, complete per-module behavior-change
   inventory** (mechanically derived from the diff: module → one-line effect), not a
   sample. Known-live changes include: filing 3→5, escalation heuristics,
   concept-capture disable, metering refund refusal (`topup_credit_not_found` contract
   change), fail-loud SSE done-frame parsing, recap ownership re-anchor, consent
   rate-limit relocation, memory-enabled endpoint removal (404s for stale binaries).
8. Canon intake of the account-detachment ruling (C10) rides the next IF ratification.
9. **GDPR Art-15 export gap (red-team):** `mentor_activity_ledger` is written from merge
   day but `services/export.ts` does not enumerate it — extend export before merge (or
   gate the ledger write), and add the table to CUT-B2's export-twin spec. Erasure is
   already covered (FK cascade); access/portability is not.
10. **OTA hazard — executable form (pass-2 upgraded to High):** `ci.yml`'s `ota-update`
    job auto-publishes on **every push to main** when mobile changed and natives didn't.
    The merge commit itself skips (native diff in `package.json`), but the **next
    JS-only push** would OTA stale binaries built against the old native majors. Prose
    "no OTA" is not a gate. **Required fix (pass-3): bump `apps/mobile/app.json`
    `version` in the merge itself** — runtimeVersion policy = appVersion, so the bump
    permanently excludes stale binaries from the OTA target. An `OTA_FREEZE` repo
    variable is NOT an equivalent alternative (lifting it "when new builds exist" does
    not stop old 1.0.0 binaries receiving preview updates); a freeze is acceptable only
    as a bridge, lifted strictly after the bump has landed.
11. **Re-key the V2 plans' identity blockers in the merge (pass-2):** S4/S5/S6
    Blocked-by sections still cite the superseded "W1/W2 landed" chain — on post-merge
    main those tables exist but are NOT live until the flip. Rewrite to "post-IF-flip +
    convergence complete" (and apply the C3 S4 amendment) so no executor ever starts S4
    against dead tables. Owner: Zuzka's lane; lands with the merge or immediately after.
12. **RLS for `mentor_activity_ledger` (pass-4, High):** the table is profile-scoped
    (`profile_id`) but 0111 ships **without** `ENABLE ROW LEVEL SECURITY` or an
    isolation policy — a live data-isolation gap AND a guaranteed CI failure on main
    (`rls-coverage.test.ts` [ASSUMP-F14] requires RLS-in-a-migration for every
    profile_id table; verified the branch did not modify the guard). Pre-merge, on the
    branch: enable RLS + `mentor_activity_ledger_profile_isolation` policy in a
    migration, update snapshot, run the coverage test green. The reconciliation should
    also note WHY the branch's own CI never tripped this (likely change-class routing
    skipping the database package tests) — that routing hole is its own small finding.

**Additional note (red-team F8):** the branch's 0111 SQL + snapshot are hand-curated, not
clean `generate` output (the unshipped concepts DDL was hand-trimmed). CUT-A's
generate-preflight (v1.1 addendum) is therefore **load-bearing**, diffing against a
hand-doctored snapshot — not merely hygiene.

**Sequencing (pass-4 corrected order):** reconciliation checklist (items 1–12) applied
on the branch → **§8 final rescan of the exact reconciled SHA + main-drift delta
(including the Inngest cross-file semantic check)** → operator approval → merge
(checklist-5 verification on the merge PR) → CUT-A proceeds on post-merge main →
cutover plan ratification folds the C3/C4 deltas → S4/S5 re-keyed plans live (item 11).

## §7 Lockstep protocol (the operating agreement, any strategy)

1. **Boundary events both ways, over a named channel with acks:** the umbrella program
   emits to Zuzka's lane: CUT-A merged, each CUT-B merged, freeze opening, flip done,
   drop done. Zuzka's lane emits: branch mergeable, merge done, S-stage starts. Channel:
   operator relay (today) → Cosmo boundary events (when WI-590 lands); an event without
   an ack is treated as undelivered.
2. **Migration numbers:** never pre-assign in either lane's docs — next-free at landing.
   (Self-enforcing at merge time: journal/meta files conflict loudly in git.)
3. **Merge mechanics:** no more solo corrective merges — any sync that hits conflicts gets
   the checklist-5 content-level verification before push.
4. **Freeze window — mechanical, detected, and extended through the drop:** from
   convergence step 1 through **M-DROP completion** (not just the flip — the soak interval
   is otherwise unprotected), no merges to main from any lane. Enforcement: a committed
   freeze-marker file + a required CI check that fails while it exists; the convergence
   shepherd is the named detector and lifts the marker.
5. **Identity rulings:** canon changes ride the IF ratification path regardless of which
   lane originates them (C10 rule).
6. **Shared-guard files:** forward-only ratchet baselines resolve by **intersection +
   checker re-run** (main-wins silently resurrects grandfathered entries a branch
   legitimately burned); `AGENTS.md`/workflows resolve main-wins. The enforceable form is
   the post-merge checker run, not merge-commit prose.

## §8 Final rescan — MANDATORY (pass-3 corrected; "moot" was wrong)

`6a81f7663` is the final **feature** SHA (operator confirmation 2026-06-12), but the
reconciliation checklist (items 1–4, 9–11) adds commits to the branch — the merge target
is therefore `6a81f7663` + reconciliation commits, which is NOT the SHA this analysis
audited. Before operator approval of the actual merge: (1) a **diff-only rescan of
`6a81f7663..<final reconciled SHA>`** against the nine lenses (expected small — the
reconciliation commits are themselves checklist-prescribed); (2) the main-drift delta —
**already triggered, not hypothetical** (pass-4): main is 19+ commits past the
merge-base and has changed Inngest runtime files (`inngest/client.ts`, `helpers.ts`)
while the branch rewrites six Inngest functions — the rescan must include an **Inngest
cross-file semantic check** (do the branch's six rewritten functions still compose with
main's moved runtime?), not just path-level merge survival. Any further material main
movement (schema, migrations, guard files) extends the delta review.
