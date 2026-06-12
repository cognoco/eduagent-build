# new-llm Integration Analysis — gap vs main, gap vs the IF cutover, strategy

**Date:** 2026-06-12 · **Status:** analysis complete; strategy recommendation pending operator ruling
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
| C3 | `mentor_activity_ledger.profile_id` FK → legacy `profiles(id)` ON DELETE CASCADE — a new drop-listed-table dependent unknown to the plan's static inventory | Medium (adjusted: **no stranding** — plan §2.7 generates M-REPOINT from live `pg_constraint`, absorbing it as the 57th re-point automatically) | Merge-order dependency only: 0111 must be applied before the re-point catalog snapshot; code-side: `activity-ledger.ts` joins the grep-clean/S4 re-point list |
| C4 | `deletion.ts` gains a NEW legacy read (`accounts.email` RETURNING → byok_waitlist erase, GDPR Art-17) | Medium, confirmed | CUT-B2's deletion twin spec must carry it or the GDPR fix silently drops at cutover |
| C5 | Deploy gate `check-reference-only-migrations.mjs` hard-fails staging/prod migrate while 0106/0107 stay journaled — the exact path the convergence runbook §4.1 uses | Medium (adjusted) | Reconcile before convergence: exempt the reference-only pair or resolve the journal; coordinate with the cutover planning session |
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

**Pre-merge reconciliation checklist (the price of O2, all mechanical):**
1. Take main's `i18n-jsx-literals-baseline.json` wholesale (C1); verify ratchet CI green.
2. Restore the `locales` key in `source-baseline.json` or re-run translate (C7).
3. ADR surgery: renumber the branch's two colliding ADRs to next-free, fix `docs/INDEX.md`,
   add the ledger ADR's lockstep canon edit (C6).
4. Deploy-gate reconciliation plan agreed with the cutover planner (C5) — at minimum an
   exemption note in the runbook preconditions.
5. Content-level merge verification against both parents (C9): explicitly confirm every
   main commit since merge-base survives — script-assisted, not eyeball.
6. Doppler provisioning before the post-merge deploy: `CF_KV_IDEMPOTENCY_ID_DEV/STG/PRD`
   + `SEED_PASSWORD` (+ Cloudflare KV namespaces) — this is the WI-664 fix landing.
7. Operator sign-off on the live-on-merge behavior changes (filing 3→5, escalation
   heuristics, concept-capture disable) — deliberate audit fixes from Zuzka's lane, but
   they change product behavior and deserve a conscious yes.
8. Canon intake of the account-detachment ruling (C10) rides the next IF ratification.

**Sequencing:** Zuzka's 1–2 pipeline commits land → §8 rescan → checklist applied on the
branch → merge (content-verified) → CUT-A proceeds on post-merge main → cutover plan
ratification folds the C3/C4/C5 deltas → S4/S5 re-key to post-flip (C-plans).

## §7 Lockstep protocol (the operating agreement, any strategy)

1. **Boundary events both ways:** the umbrella program emits to Zuzka's lane: CUT-A merged,
   each CUT-B merged, freeze window opening, flip done, drop done. Zuzka's lane emits:
   branch mergeable, merge done, S-stage starts.
2. **Migration numbers:** never pre-assign in either lane's docs — next-free at landing;
   announce consumption as a boundary event.
3. **Merge mechanics:** no more solo corrective merges — any sync that hits conflicts gets
   content-level verification (C9 procedure) before push.
4. **Freeze window:** from convergence step 1 to flip, no merges to main from any lane.
5. **Identity rulings:** canon changes ride the IF ratification path regardless of which
   lane originates them (C10 rule).
6. **Shared-guard files** (ratchet baselines, AGENTS.md, workflows): conflicts resolve
   main-wins by default; deviations need a named reason in the merge commit.

## §8 Rescan obligation

Re-run a delta scan over commits landing after `6a81f7663` before merge ruling is executed
(expected 1–2 small commits). Scope: same nine lenses, diff-only.
