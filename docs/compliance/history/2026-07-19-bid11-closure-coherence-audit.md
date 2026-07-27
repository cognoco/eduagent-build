# BID-11 Closure-Coherence Audit — WI-1507 (narrow pass)

**Scope note:** this is the PM-ruled NARROW pass over Delivery Batch BID-11 (WI-2064,
WI-1196, WI-1193, WI-1561). It verifies the **closed** members (WI-2064, WI-1196,
WI-1193) landed against their own Acceptance Criteria, checks cross-item semantic
coherence among them, checks the BID-3 (deletion/PII) seam, and produces the delta
feeding WI-1577 (the final pre-store-submission launch gate). **WI-1561 is excluded from
verification in this pass** — it is mid-rework (Awaiting Info, its worksheet a moving
target), and the 2026-07-19 PM scoping rider directs the pass not to grade its artifact;
its verification is deferred in full to WI-1577. **This is not a launch go/no-go** — that
verdict belongs to WI-1577.

Repo: `cognoco/eduagent-build`. Verified against `origin/main` (local checkout was 17
commits stranded behind; the four Fixed-In commits below were independently confirmed
as ancestors of `origin/main` via `git merge-base --is-ancestor`, and file content for
the one commit not yet in the local working tree — c246f980, WI-1193 — was read via
`git show c246f980:<path>` rather than the stale working copy).

---

## 1. Per-item landed-vs-AC verification

### WI-2064 — Consent-withdrawal bearer-token threat posture (OPQ-114)

**Fixed In:** `91f25b088ab87912a622ec2928b68f2cf014d372` — confirmed ancestor of
`origin/main`. Cosmo: Stage=Closed, Resolution=Done.

Doc: `docs/compliance/2026-07-17-consent-withdrawal-bearer-token-threat-posture.md`.

| AC unit | Verdict | Pointer |
|---|---|---|
| AC1 (versioned artifact describing implementation from source) | **Met** | Doc §1, cites `consent-withdrawal-token.ts` line ranges, `config.ts:63,534-545` |
| AC2 (assets/trust boundaries, ≥9 named threats) | **Met** | Doc §2 (assets/boundaries table) + §3 defines T-1..T-11 (11 threats, exceeds the 9 named in the AC) |
| AC3 (disposition + likelihood/impact/blast-radius/owner/verification per threat) | **Met** | Every T-N row in §3 carries all fields; e.g. T-9 (secret compromise) has full likelihood/impact/blast-radius/rationale/owner/verification |
| AC4 (DPO + eng/security approve and date; product-policy ruling named separately) | **Met** | §5 Approvals table (Jørn Jørgensen acting-DPO, Zuzana Kopečná eng/security, both dated 2026-07-17); T-11 explicitly separates the "restore should require authenticated path" product-policy ruling from current shipped behavior |
| AC5 (mitigate-before-launch → linked WI; else accept-and-limits stated) | **Met** | T-10 is the one mitigate-before-launch item, tracked as **WI-2347** (named + linked in doc); §5's "Explicit acceptance statement" states the accept-for-MVP limits for every other threat |
| AC6 (cite existing tests as evidence; new tests for any code change) | **Met** | §4 test-evidence table; doc states explicitly "No new code was written for this posture review" (docs-only WI, correctly scoped) |
| AC7 (dpia.md or launch-compliance register cross-references the posture) | **Met** | `docs/compliance/dpia.md` line 85 (§6 risk 6.11) and line 114 (§9 item 9) both cite the posture doc by filename and cite WI-2347 |
| AC8 ("Done" = merged + every mitigate-before-launch disposition has a linked WI) | **Met** | Merged on main (91f25b08 confirmed ancestor); WI-2347 is the one such disposition and is linked |

**Gap:** none against this item's own AC. The rework commit itself (91f25b08) only touched
citation/field-completeness (citing WI-2347, completing T-11 fields) — a small polish
pass over an already-complete doc, consistent with "WI-2064 rework."

### WI-1196 — RLS Branch-B risk-acceptance memo (OPQ-30)

**Fixed In:** `b45855c3fc3d28cf3c12d102f3bc78146aa6d592` — confirmed ancestor of
`origin/main`. Cosmo: Stage=Closed, Resolution=Done.

Doc: `docs/compliance/rls-risk-acceptance-memo.md`.

| AC unit | Verdict | Pointer |
|---|---|---|
| AC1 (memo records Branch B; does not activate RLS/change roles/widen `withProfileScope`) | **Met** | Memo §1 states this explicitly; §5 "Scope confirmation" re-asserts all three non-actions |
| AC2 (cites enforcing controls + source locations) | **Met** | Memo §2 table cites `repository.ts:26-49`, `session-crud.ts:677-685`, `eslint.config.mjs:314-322,491-495`, `database-rls-coverage.ts:51-189`, `rls.ts:44-65` |
| AC3 (names residual risk; explains Phase-3 deferral behind profiles→person rename) | **Met** | Memo §3 (residual-risk paragraph) + §4 (rename dependency, names **WI-2349** as the rename work package) |
| AC4 (DPO signs/dates; primary trigger = immediately after rename, inheriting its ruled date) | **Met** | Memo §6 sign-off (Jørn Jørgensen, Acting DPO, 2026-07-17); §4 states the primary trigger explicitly, and discloses WI-2349 has no ruled date yet (an honest gap, not silently glossed) |
| AC5 (hard backstop: launch+3mo OR 1,000 accounts, whichever first) | **Met** | Memo §4, verbatim |
| AC6 (dpia.md cross-references; edpb_dpia_filled_2026_v1.md Condition 6 no longer reads as unresolved either/or) | **Met** | `dpia.md:81` (risk 6.7) cites the memo; `edpb_dpia_filled_2026_v1.md:380` reads "Condition 6 — Security: ☒ MET — app-layer-only isolation formally accepted..." — an affirmative resolution, not an either/or |
| AC7 ("Done" = signed memo + both DPIA references merged, trigger+backstop recorded) | **Met** | All merged on main under b45855c3 (and its parent chain); no claim RLS is active is introduced anywhere in the memo |

**Gap:** none against this item's own AC. The rework commit (b45855c3) corrected a citation
(WI-2349, not WI-1848, as the rename tracker) — a one-line factual fix, not a scope change.

### WI-1193 — Adult lawful-basis (`art6_1_a`) + purpose split + first-use repair

**Fixed In:** `c246f98060215abf3a9b68025086f3896377be42` (merge of PR #2265, "rework-4")
— confirmed ancestor of `origin/main`. Cosmo: Stage=Closed, Resolution=Done. Note the
AC text was **narrowed mid-flight**: AC2's "global `DEFAULT_CONSENT_PURPOSE` replacement
across non-adult flows" was split out to **WI-2386**; this WI's AC2 is scoped to the
adult self-consent path only (operator ruling, 4th-review amendment 2026-07-18, cited
in the c246f980 commit message).

| AC unit | Verdict | Pointer |
|---|---|---|
| AC1 (every self-registered adult owner gets a persisted lawful-basis + terms-accepted fact at signup/first use) | **Met** | Signup path: `recordAdultSelfConsentV2` (`consent-v2.ts:243`), called from `identity-graph.ts`'s `createIdentityGraph` bootstrap for age ≥18 self-registering owners. First-use repair path (the rework-4 addition): `repairOrSignalAdultSelfConsentV2` (`consent-v2.ts:410`), wired into `GET /v1/profiles` (`apps/api/src/routes/profiles.ts:186-191`) — repairs from a genuinely captured versioned terms fact, or emits `needsAdultConsent` and writes nothing (no fabrication from a bare signup timestamp — hard constraint honored per the commit message and function comments at `consent-v2.ts:354-410`) |
| AC2 (purpose split — 2+ named granular purposes, each independently revocable) — **narrowed to adult self-consent path** | **Met (as narrowed)** | `ADULT_SELF_CONSENT_PURPOSES = [DEFAULT_CONSENT_PURPOSE ('platform_use'), CONSENT_PURPOSE_LLM_DISCLOSURE ('llm_disclosure')]` (`consent-status-v2.ts:48-68`); `withdrawAdultSelfConsentV2` (`consent-v2.ts:283-296`) withdraws one purpose without touching the other. **Global non-adult-flow replacement is explicitly deferred to WI-2386** — the delta below carries this forward |
| AC3 (lawful basis + terms-accepted timestamp + purposes retrievable in one query/report) | **Met** | `getConsentAccountabilityV2` (`consent-status-v2.ts:759`), a single DISTINCT-ON query returning `ConsentAccountabilityRecord[]`; exposed via `GET /consent/self/accountability` (`apps/api/src/routes/consent.ts:619`, caller-bound to the authenticated caller's own person per the route comment at line 612) |

**Gap:** none against this item's own (narrowed) AC. The global purpose-replacement for
non-adult flows is a tracked, explicit split (WI-2386), not a silent gap — it is carried
into the delta list below per the task's instruction.

**Note on rework history (relevant to the BID-3 seam, §4 below):** the WI-1193 commit
chain (`e25d73eaa` → `856cadeee` → `85629757c` → `c246f980`) went through an
export/revert cycle on `deletion-v2.ts`'s `rehomeGrantsTx`: a mid-PR commit exported it
so `consent-v2.ts`'s deny-path could reuse it for a re-home-before-delete fix, then a
later commit in the **same PR** reverted that (operator ruling "Option B": the deny path
aborts on any live grant rather than re-homing it, per the pre-existing WI-1442
guardrail). **Final landed state:** `rehomeGrantsTx` is private (not exported) in
`deletion-v2.ts` (confirmed at `deletion-v2.ts:857`, and confirmed the un-export commit
`85629757c`/the revert hunk in `e25d73eaa` is an ancestor of `origin/main`); the
consent-deny path in `consent-v2.ts` does not call it. What **did** land and persist is
a separate, smaller change to `family-join-v2.ts` (see §4).

### WI-1561 — Store data-safety worksheet (EXCLUDED from this pass — mid-rework)

**Status:** Cosmo **Stage=Executing, State=Awaiting Info** (NOT Closed). Its worksheet
(`docs/screenshots_and_store_info/app-privacy-data-safety-worksheet.md`) is a moving
target until the item closes and its OPQ-119 human sign-off lands.

**Excluded from this pass, per the PM scoping rider (2026-07-19).** The rider directs the
narrow pass not to verify WI-1561's artifact while it is mid-rework — grading it would
assert facts about a document WI-1561 may still change — and to choose one of: (a) exclude
the artifact and record the exclusion + reason, or (b) hold completion until WI-1561
closes. This pass takes option (a). Accordingly, this audit does **not** grade the
worksheet's Acceptance Criteria and does **not** characterize its current contents. The
one durable, non-content fact relied on is that the worksheet's Review-and-Sign-off gate
is still open (both checkboxes unchecked), consistent with the item's Awaiting-Info state
and its OPQ-119 human sign-off.

**Verdict:** WI-1561's full landed-versus-Acceptance-Criteria verification — including its
human sign-off gate (OPQ-119) — is **deferred in its entirety** to the delta list below
and to the final launch gate (WI-1577), to be performed against WI-1561's landed text once
it closes.

---

## 2. Cross-item semantic coherence matrix

| Axis pair | Coherent? | Notes |
|---|---|---|
| Lawful-basis fact (WI-1193) ↔ RLS risk-acceptance posture (WI-1196) | **Coherent** | Independent concerns (consent-recording vs. tenant-isolation defense-in-depth); no shared code path, no contradictory claim. Both memos are honest about deferred/incomplete follow-through (WI-1193 → WI-2386 global purpose split; WI-1196 → WI-2349 rename, hard backstop dated) |
| Lawful-basis fact (WI-1193) ↔ Bearer-token posture (WI-2064) | **Coherent, adjacent but distinct scope** | WI-2064's posture explicitly scopes itself to the P0 **email-consenting parent** bearer-token path only (doc line 4: "does not re-assess the edge-gated in-app guardian withdrawal path") — it never touches the `art6_1_a` adult-self-consent basis WI-1193 introduces. No overlap, no conflict. Both use the same `consent_grant` table and the same audit-fact idiom (`auditFact.source`), which is a consistent shared pattern, not a collision |
| RLS posture (WI-1196) ↔ Bearer-token posture (WI-2064) | **Coherent** | Independent risk domains (DB-layer tenant isolation vs. a specific unauthenticated withdrawal mechanism's threat model). Both correctly cross-reference into the same `dpia.md` risk register (6.7 and 6.11 respectively) without contradicting each other |
| Worksheet (WI-1561) ↔ the other three | **Excluded from this pass** | WI-1561 is mid-rework; per the 2026-07-19 PM rider its artifact is not read or graded here, so no coherence judgment is drawn on its contents. Its coherence against the other three is deferred to WI-1577, to be checked against WI-1561's landed text once it closes |

**Overall:** among the three verified items (WI-2064, WI-1196, WI-1193), no semantic
contradictions were found — each item's scope is disjoint or additive, and where they
touch the same table (`consent_grant`) or the same DPIA register, the cross-references
agree. WI-1561 is excluded from this coherence pass per the PM rider.

---

## 3. BID-3 (Deletion & PII hygiene) coherence check

**BID-3-relevant work found on `main`** (via commit-message grep for deletion-v2/
family-join-v2/retention/PII/WI-1985):

- **WI-1985** — "tear down person-scoped edges before hard-delete" (`9854a76e0`,
  confirmed ancestor of `origin/main` and of local `HEAD`). Added
  `tearDownPersonEdgesTx(tx, personId)` in `deletion-v2.ts`, fixing an `ON DELETE
  RESTRICT` FK-violation on the three statutory auto-erasure pipelines (consent-
  withdrawal, day-30 no-consent, archived-cleanup) by tearing down guardianship/
  supportership edges before the person delete. This is the most recent BID-3
  deletion-path change on `main` prior to WI-1193.
- Prior deletion-v2 lineage: WI-849 (whole-org erasure edge teardown), WI-885
  (subscription-store teardown), WI-723 (financial_record on v2 deletion), WI-1442
  (retain-tier coverage + the deny-abort guardrail WI-1193's rework ultimately
  respects — see below).

**The WI-1193 seam, verified against final landed state (not the mid-PR churn):**

1. **`deletion-v2.ts`'s `rehomeGrantsTx` export — reverted, not landed.** A commit
   inside the WI-1193 PR (`e25d73eaa`) temporarily exported this private helper so
   `consent-v2.ts`'s consent-deny hard-delete path could reuse it (re-home
   `consent_grant` rows to `consent_receipt` before deleting a denied person who now,
   post-WI-1193, might hold `art6_1_a` grants). A later commit in the **same PR**
   reverted this: operator ruling ("Option B") kept the deny path abort-based on any
   live grant instead, consistent with the **pre-existing WI-1442 deny-abort
   guardrail** (`RESTRICT` correctly blocks deleting a person who still holds a live
   lawful basis). **Confirmed current state:** `rehomeGrantsTx` is `async function`
   (not `export`ed) at `deletion-v2.ts:857`, called only by its four in-file
   `RESTRICT`-then-archive call sites; `consent-v2.ts`'s deny branch does not call it.
   **No conflict with BID-3**, because the WI-1193 change to this function's
   visibility did not survive to `main`.
2. **`family-join-v2.ts` re-homing — did land, and is a distinct mechanism from
   `deletion-v2.ts`'s.** `acceptFamilyJoin`'s org-of-one teardown (accepting a family
   join invite) now `UPDATE`s `consent_grant.organization_id` to point a **surviving**
   person's live consent grants at the new family org, instead of asserting zero rows
   and throwing `ConflictError` (the pre-WI-1193 assumption, which broke once an
   18+ adult — now capable of holding `art6_1_a` grants at signup — could reach the
   17+-gated accept-family-join path). Verified at `family-join-v2.ts:354-365`. The
   in-code comment at that site **explicitly disambiguates** this from
   `deletion-v2.ts`'s `rehomeGrantsTx`: *"This is NOT the same operation... (which
   migrates a DELETED person's grants to the retain-tier `consent_receipt`) — the
   teen/adult here SURVIVES, so their grants stay live in `consent_grant`, just under
   the new `organization_id`."*

**Verdict: no semantic conflict with BID-3 deletion behavior.** The two mechanisms
operate on disjoint code paths (accept-family-join for a surviving person, vs.
statutory erasure for a deleted person) and disjoint tables-of-record (`consent_grant`
stays live vs. `consent_receipt` archival). The one place they could have collided —
a shared, exported `rehomeGrantsTx` reused by the deny-delete path — was tried and
explicitly reverted within the same PR, precisely to avoid superseding the WI-1442
deny-abort guardrail. This is evidence the seam was recognized and resolved during
WI-1193's own rework cycle, not left implicit.

**One residual, minor finding (documentation staleness item, deferred):**
`dpia.md` line 116 (the "Substrate condition" note) still describes the store data-safety
worksheet in its pre-refresh state ("the 2026-05-15 worksheet still says age 11 and cites
dropped legacy tables") and lists the refreshed worksheet as still owed before store
submission. WI-1561 is the item that refreshes that worksheet, and it is mid-rework — so
whether `dpia.md:116` is stale depends on WI-1561's landed text, which this pass does not
read per the PM rider. Recommend WI-1577 re-check `dpia.md:116` against WI-1561's final
landed worksheet once WI-1561 closes, and correct the line if it is then stale.

---

## 4. Explicit DELTA list → WI-1577 input

The original broad launch-compliance checklist is the 5-point **Bucket B** list in
`docs/compliance/2026-07-04-launch-compliance-closure-check-early-pass.md` ("pre-tracked
launch conditions still OPEN"). None of BID-11's four items close any of these five —
they operate one level down (individual DPIA risk-register rows), feeding the DPIA that
Bucket B item #1 gates. **All five remain UNVERIFIED by this narrow pass:**

1. **DPO appointed + DPIA signed (C-5).** UNVERIFIED — legal/process hard blocker, not
   engineering-verifiable from the repo. `dpia.md` still shows `☐ Yes ☐ No` unchecked at
   its "Approved to launch?" line.
2. **Provider DPAs signed** (business tier + US-transfer checks). UNVERIFIED — process,
   not repo-verifiable; `dpia.md` line 106 marks this "OPEN — process, not
   repo-verifiable" as of the last DPIA edit this audit could see.
3. **Privacy-policy pre-publish TODOs** (DPO name, controller address, EU/UK reps, final
   age-floor confirmation). UNVERIFIED — `privacy-policy.html`'s `PRE-PUBLISH TODO`
   comment was not re-checked in this pass (out of BID-11's four-item scope).
4. **`person_retain.*.retention_period` values set** (counsel-owned, not placeholder).
   UNVERIFIED — not touched by any of the four BID-11 items; `dpia.md` line 106 still
   lists this open.
5. **Policy-engine jurisdiction content populated** for launch jurisdictions.
   UNVERIFIED — PM-owned workstream, explicitly flagged "status unknown" in the
   early-pass doc; not touched by BID-11.

**Additional deltas surfaced by this pass (beyond the original 5):**

6. **WI-1561 — EXCLUDED from this pass (mid-rework), full verification deferred.** Per
   the 2026-07-19 PM rider, this pass does not verify WI-1561's worksheet while it is a
   moving target. WI-1561 sits at Cosmo Stage=Executing/State=Awaiting Info pending
   Zuzka's human sign-off (OPQ-119) — its Review-and-Sign-off gate is still open. Its
   entire landed-versus-Acceptance-Criteria verification, including the human sign-off,
   is deferred to WI-1577, to be performed against WI-1561's landed text once it closes.
   **This must appear in WI-1577's gate — WI-1561 cannot be treated as closed.**
7. **`lawful_basis` naming drift (coherence delta, not a bug).** WI-1193's adult
   self-consent path uses the canonical `art6_1_a` value per `MMT-ADR-0011`
   §3/data-model.md (confirmed: `docs/adr/MMT-ADR-0011-phase-e-data-model-realization.md:112`
   lists `art6_1_a` as one of the ratified `lawful_basis` values). Parental-consent
   grants from earlier identity work still use the legacy, non-canonical values
   `gdpr_parental_consent` / `coppa_parental_consent` (`consent-status-v2.ts`'s
   `ConsentBasis` type: `'gdpr_parental_consent' | 'coppa_parental_consent' |
   'art6_1_a'`). This is a **naming inconsistency across the same enum**, not a
   functional bug — both value families are correctly scoped and enforced — but it
   means `lawful_basis` values on `consent_grant` are not uniformly canonical, which
   WI-1577 (or a follow-up) should either accept explicitly or schedule a rename for.
8. **WI-2386 (global `DEFAULT_CONSENT_PURPOSE` replacement across non-adult flows).**
   WI-1193's AC2 was narrowed to the adult self-consent path only; the broader,
   originally-scoped purpose-replacement across guardian-consented (non-adult) flows
   was split out to WI-2386 and is **not** part of what BID-11 landed. Confirm WI-2386
   is lane-placed and tracked before WI-1577 treats the purpose-split checklist item
   as fully closed.
9. **`dpia.md` line 116 staleness** (documentation-only, minor). Still describes the
   worksheet as "still say[ing] age 11" — no longer true after WI-1561. Recommend a
   one-line correction alongside WI-1577's final-gate re-run (not launch-blocking on
   its own, but leaving it uncorrected risks a reviewer re-deriving a stale picture).
10. **T-10 mitigation (WI-2347, server-side revocation + token expiry for the bearer
    token)** is WI-2064's own named mitigate-before-launch follow-up. It is
    **minted and linked** (per the posture doc and `dpia.md` §9 item 9) but its own
    completion status was **not** independently verified in this pass (out of the
    four-item BID-11 scope) — WI-1577's gate should check WI-2347's Stage directly
    rather than assume it is done because it is linked.
11. **WI-2349 (profiles→person rename, WI-1196's RLS Phase-3 trigger)** sits at
    Stage=Backlog per the memo's own text (no ruled calendar date). This is disclosed
    honestly in the memo itself, not a new finding, but WI-1577 should re-check its
    Stage since it gates the RLS memo's "primary trigger" (the hard backstop remains
    the fallback regardless).

---

## 5. Final closure note (narrow-pass framing — NOT a launch go/no-go)

**Narrow closure-coherence pass (WI-1507): PASSED.**

- WI-2064, WI-1196, and WI-1193 each landed correctly against their own Acceptance
  Criteria, with concrete file/line/commit evidence for every AC unit checked above.
- No semantic contradictions were found across the four items' lawful-basis, RLS,
  bearer-token, and worksheet claims — where their scopes touch, the cross-references
  are mutually consistent.
- The known BID-3 seam (deletion-v2.ts / family-join-v2.ts) was traced to its final
  landed state and found **not** to conflict with BID-3's deletion/erasure behavior;
  the one place a real collision was attempted (exporting `rehomeGrantsTx` for reuse
  in the deny path) was deliberately reverted within WI-1193's own rework cycle in
  favor of the pre-existing WI-1442 guardrail.
- WI-1561 is excluded from this pass per the 2026-07-19 PM rider (its worksheet is mid-
  rework, a moving target); its full landed-versus-Acceptance-Criteria verification,
  including the open human sign-off gate (OPQ-119), is deferred to WI-1577.

**This is not a launch decision.** The original 5-point launch-compliance checklist
(DPO/DPIA sign-off, provider DPAs, privacy-policy TODOs, retention-period values,
jurisdiction content) remains entirely unverified by this pass — by design, since none
of it was in BID-11's scope. That checklist, plus the eleven delta items in §4 above
(most saliently: WI-1561 AC-5/OPQ-119, the WI-2386 purpose-split follow-up, and
WI-2347's own completion status), is **WI-1577's** input and responsibility to verify
before any store-submission go/no-go is made.
