# Consolidated Scope Inventory — one ruling session, three incoming scope sources

**Status:** RULED (sitting 1, 2026-07-15) — see ruling record below
**Date:** 2026-07-15
**Purpose:** Prepare ONE operator ruling session over three incoming scope sources and their collisions with the 213-item open backlog. **This document proposes; it does not decide.** Every candidate row carries a PROPOSED disposition. Already-ruled items are marked **RULED** and are not re-opened.

---

## § SITTING-1 RULING RECORD (operator, 2026-07-15)

Presented as six batches R1–R6; each ruled individually.

- **R1 — MVP docs bar: Option 3 (tiered).** STRICT as-built tier = compliance & safety canon (DPIA, ROPA, privacy policy, identity/deletion canon, LLM-safety register, age/consent gating docs) — drift there is a launch-blocking defect. Everything else = directional with tracked drift, governed by the existing ADR significance gate.
- **R2 — P0-now band: accepted as decomposed.** New WIs: **WI-2055** (A1 identity canon amendment), **WI-2056** (A2 PITR runbook), **WI-2058** (A4 deletion runbook — sequenced after WI-1985), **WI-2059** (A5 mobile release ADR), **WI-2062** (A9 resolve MMT-ADR-0024), **WI-2064** (T8d bearer-token posture). T8a/T8b folded onto WI-1193/WI-1192 (descriptions annotated 2026-07-15). Accepted coupling: A4 (strict-tier doc) is chained to code item WI-1985.
- **R3 — remaining disposition table: as proposed.** **WI-2057** (A3 primitives — post-MVP pen; canon may say "recovery = PITR now, primitives = tracked follow-up"), **WI-2060** (A6 billing runbook — post-MVP pen, after WI-1328/RC verification), **WI-2061** (A7 — ONE LLM contract-evolution rule-doc, sanctioned deviation from per-artifact cut), **WI-2063** (A11 web checkpoint — post-MVP pen). A8 → one-sentence re-admission note added to the Gemini cutover plan (2026-07-15). T4 → pre-execution checklist rider added to the S6 plan (2026-07-15). A10/T8c → accept-as-governed, no work. T11 → dissolves into S2-01.
- **R4 — /improve placement: distribute** into owning feature workstreams (WI-1985..2012, one triage batch, Captured→Backlog). **Amendment (operator):** the roadmap-lockdown pass is upgraded from "dedup/adjacency" to **"dedup/adjacency + roster & lane-load review"** — high-level, not per-item; placement data feeds it.
- **R5 — Stream-2 D5/D6/D7: as recommended.** D5 yes (governance before backfill); D6 row1→ux-design-specification.md, row8→PRD.md, row5→D2; D7 reorg after backfill (Wave 3). Recorded on the slice plan.
- **R6 — PRG-20: opened for Wave 0 ONLY.** S2-01 → **WI-2065**, S2-02 → **WI-2066** (captured, Stream-2 workstream). S2-05 onward gated behind sitting 2. S2-05..S2-16 capture deferred to sitting 2 (their dispositions hang on D1).
- **Deferred to sitting 2** (~30 min, after Wave 0): D1 (census MoSCoW), D2 (borderline ADR calls incl. brand/voice home), D3 (mapping approval).

---

## § SITTING-2 RULING RECORD (operator, 2026-07-15, same day)

Sitting 2 ran immediately — the Wave-0 prep artifacts turned out to already exist (delivered 2026-07-14 by a parallel session under the paper-only dispatch ruling; see the slice plan's cross-session reconciliation note). Four batches, each ruled individually. **The Stream-2 D-gate is now CLOSED** (all of D1–D7 ruled).

- **D1 — census MoSCoW: accepted as proposed** (58 rows, 19/31/4/4 strict-rule table; every row carries an explicit MMT-ADR-0000 §II.1 gate verdict). Riders: ARCH-N ~13 promote rows fold into the S2-06/07 authoring batches; the newly-discovered UX-1..19/AD1..7 sibling registers get a follow-up sweep riding WI-2065.
- **D2 — all nine borderline calls as the annex recommends.** Upgrades: row 53 (crisis-disclosure `se-032`) and row 54 (13+/launch-posture) → MUST — working count **21 MUST / 29 SHOULD**. Downgrades: row 21 (no-jargon copy) → prose in UX-spec voice section, no ADR; row 25 (clerk-js web3) → dropped, stays canon prose. Verify-first: brand 3-way contradiction → **WI-2080** (spike) before rows 5/40 draft; MMT-ADR-0002 overlap check before row 36. 0.88 gate = cited parameter inside ONE envelope ADR (overrides the slice plan's older pre-baked rec — the census was the better-informed doc). Mechanics: ADR-0020 RLS falsehood corrected in place + data-model.md §2B.1 same change-set (rider on WI-752); ARCH-3 = third "wrong pointer" Part III case. **Heuristic amendment ruled**: multi-source-consistent + self-flagged ADR-candidate + irreversible ⇒ MUST (rides WI-757's ADR-0000 change-set, with the Part III third case and the §I.4 diagram amendment naming compliance/ + audit/).
- **D3 — mapping approved**: bulk as tabled; 7 judgment calls as recommended (audience-matrix → `registers/audience-matrix/`; flows reclassified out of assets → `registers/flows/` lockstep; project_context.md stays at root as named exception — 7 CI path couplings; screenshots_and_store_info → `compliance/store/` whole; visual-artefacts scripts bundled with outputs; future-app-options→specs, ux-todos→plans, Strategy_analysis+analysis/→_archive; spine-frontmatter rot folds into S2-11 execution; jest-config dangling docs/superpowers citations → **WI-2081**).
- **D4-residual — all four boundary calls as drafted**: B1 Known Exceptions MOVE; B2 Schema/Deploy STAY (next-cheapest lever); B3 three rule-lists STAY (follow-on candidates once principles.md has an owner); B4 Profile Shapes = future-slice candidate. Rider on WI-2052: standing routing rule (new canon-shaped content → principles.md first) written into the AGENTS.md preamble at landing.
- **Wave WIs minted and placed** (Stream-2 workstream, Backlog): S2-05..S2-16 → **WI-2068..2079**; **WI-2080** (brand spike); **WI-2081** (jest fix, Dev-Infra). Every slice-plan row now has a Cosmo owner; PRG-20 open for all waves; sequencing per D5/D7 unchanged.

## Sources (read in full)

1. **One-way-door risk register** — `docs/audit/2026-07-12-one-way-door-risk-register.md` (2026-07-12) — 14 lock-in risks + 6 under-recorded-decision gaps.
2. **One-way-door risk drain plan** — `docs/plans/2026-07-12-one-way-door-risk-drain.md` (2026-07-12) — tasks T1–T11, priority bands (P0-now/P0-gated/P1/P2), action ledger. Cut rule: **one WI per target artifact**, not per risk area.
3. **Stream-2 slice plan (DRAFT)** — `_wip/umbrella-program/2026-07-12-stream-2-slice-plan-DRAFT.md` (2026-07-12) — rows S2-01..S2-16, D-gate D1–D7, folded existing WIs. Nothing in Cosmo yet; awaits its own D-gate.
4. **/improve triage sheet (RULED)** — `_wip/mvp-roadmap/audits/2026-07-improve/TRIAGE-SHEET.md` — MoSCoW ruled 2026-07-14, captured WI-1985..2013.
5. **/improve audit master index** — `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans-deep/README.md` — content of the 24 plans + 7 unplanned findings.
6. **Backlog export** — 213 open MentoMate WIs (Stage≠Closed), Cosmo data source `36fd1119…`. JSON snippets capped at 200 chars (see UNVERIFIED notes).

---

## ALREADY-RULED FACTS (do not re-propose)

> - **/improve batch — MoSCoW RULED 2026-07-14.** `WI-1985..1992` = MVP-must P1; `WI-1993..2005` = MVP-should P2; `WI-2006` = first fast-follow (spike); `WI-2007..2012` = backlog; `WI-2013` = umbrella. **Only open question is placement** (distribute into feature workstreams vs dedicated remediation stream — distribute recommended).
> - **Stream-2 D4 — RULED 2026-07-14 Option 1.** `WI-2051` (S2-03 draft) + `WI-2052` (S2-04 land) captured. `WI-1856` (F1 arch.md drift) reconciled Closed/Duplicate 2026-07-15. **S2-03/S2-04 are DONE-as-capture — not candidates below.**
> - **Known collisions (encoded + verified below, credited as known):** T10/T11 ≈ S2-01 census; T3 ↔ WI-1985 (erasure FK fix sequences first); T9/risk-13 ↔ WI-1986 + Gemini runtime-removal cutover plan (`docs/plans/2026-06-24-gemini-runtime-removal-cutover.md`); T8 ↔ existing compliance WIs; **WI-2004** review rule targets `principles.md` (WI-2051/2052), not `AGENTS.md`.

**Disposition ↔ drain-plan-band mapping** (bands are the visible prior; deviations flagged inline):

| Drain band | ≈ Proposed disposition | Meaning |
|---|---|---|
| P0-now | **MVP-gate** | governance artifact needed before current launch/release work |
| P0-gated | **gate-precondition** | required before a later irreversible gate, not do-now |
| P1 | **post-MVP-pen** | record before paid launch / roadmap commitment |
| P2 | **backlog** / **accept-as-governed** | hygiene or already-governed; note, not launch work |

---

## § RULING-SESSION AGENDA

**(1) MVP docs-bar policy** — *policy question, framing only, no recommendation needed.* What documentation standard is part of MVP-done, and how strictly must as-built match docs? This is the root question: the risk register is dominated by under-recorded / "laundered" / drifted decisions, and memory records "canon docs lag Cosmo rulings." Three distinct options in **§ Open policy questions** below.

**(2) Dispositions** — rule the candidate tables (**§ Candidate inventory**). Rule as a batch; contest only rows you disagree with — silence = proposed disposition stands.

**(3) Placement** — (a) /improve distribute-vs-stream (RULED-open, recommend distribute) + workstream/sprint mechanics; (b) Stream-2 D-gate D1–D7; (c) PRG-20 execution-start gate. See **§ Open policy questions**.

---

## § CANDIDATE INVENTORY

### Source 1 — One-way-door drain, decomposed per target artifact

T1 is the routing meta-task — **this document is its deliverable in proposal form** (not a row). T11 **DISSOLVES into S2-01** (census; see collision register). T8 is enumerated as four named sub-blockers below.

| Row | What (plain English) | Effort | Band | Proposed disposition | Collisions | Awaiting |
|---|---|---|---|---|---|---|
| **OWD-A1** | Identity canon amendment — state legacy rollback is no longer the recovery path; name the `person_id` forward-repair primitives; link to PITR runbook + merge/reparent/alias follow-up (T2; risk-1/2) | S | P0-now | **MVP-gate** (canon amendment) | pairs w/ A2, A3 | docs-bar |
| **OWD-A2** | Neon PITR / snapshot recovery runbook (T2) | S | P0-now | **MVP-gate** (runbook) | none — no WI (PITR sweep = 0) | docs-bar |
| **OWD-A3** | Build `person` merge / reparent / alias primitives — actual code, the risk-2 escape hatch before ad-hoc data surgery (T2 follow-up) | L | P1 | **post-MVP-pen** (pre-launch, 0 users; build primitive before first duplicate-person incident) | none — no WI (reparent/alias sweep = 0) | — |
| **OWD-A4** | Deletion irreversible-boundary runbook — grace / DB-delete / retain-artifact / Clerk-erasure stages + dead-letter procedure + export-before-delete UX (T3; risk-3) | M | P0-now | **MVP-gate** (runbook) | WI-1442 (adjacent — proof-of-consent-preserve half); sequence **after** WI-1985 (erasure FK fix — known) | docs-bar |
| **OWD-A5** | Mobile release ADR — `runtimeVersion` + build-time flag rule, fallback channel, native-change review guard, EAS-profile verification recipe (T5 + T10 gap-1; risk-10) | M | P0-now | **MVP-gate** (release ADR) | WI-1334 (adjacent — flag-combo ruling, input), WI-1341 (adjacent — Config-T triple consumer) | docs-bar |
| **OWD-A6** | Billing external-contract escape-hatch runbook — product-ID migration, old+new entitlement support, webhook/support recovery, Stripe-dormant boundary (T6; risk-5) | M | P1 | **post-MVP-pen**; gated on RC verification | sequence **after** WI-1328 (RC prod setup); adjacent WI-1772 (webhook secrets), WI-1479 (billing observability) | RC-verify done? |
| **OWD-A7** | LLM contract-evolution rules — orchestrator / envelope / Challenge Round / `app/session.completed`: one add-field / version / breaking-change rule each + guard-or-eval (T7; risk-6/7/8/9) | M | P1 | **post-MVP-pen** | WI-1858 (adjacent — A7 owns the *rule*; 1858 owns the concrete `architecture.md` envelope *example*) | **ruling:** one rule-doc vs four per-artifact rows? (per-artifact cut rule says 4) |
| **OWD-A8** | Gemini/Vertex re-admission note — one sentence (re-admission needs new vetting + policy row + eval baseline) in register or cutover plan (T9; risk-13) | XS | P2 | **accept-as-governed** (tiny note only if absent) | **KNOWN:** WI-1986 (fallback bypass fix) + cutover plan own the code/removal; WI-1436 (delete legacy routing), WI-1902 (remove `GEMINI_API_KEY`) own removal | — |
| **OWD-A9** | Resolve `MMT-ADR-0024` scope-chip status before any S5/S6 dependency relies on it (T10 gap-2) | S | P0-now | **gate-precondition** (owner: product/arch) | ↔ **T4** (S6 precondition names ADR-0024) — ONE owner: **A9 resolves**, T4 references | — |
| **OWD-A10** | Accept-as-governed note for 3 known exceptions — `@tanstack/query-core` override + `analogyDomain` tri-state (already in AGENTS.md Known Exceptions), adult catastrophic gate (already `MMT-ADR-0030`) (T10 gap-4) | XS | P2 | **accept-as-governed** (no new work unless they recur) | none — query-core override not separately tracked (sweep = 0) | — |
| **OWD-A11** | Web parent-control-center strategy checkpoint — record the trigger for web-learning investment + the current mobile-first boundary (risk-11; orphan action-ledger row, no T#) | S | P1 | **post-MVP-pen / backlog** (mobile-first boundary holds; no concrete web demand) | none — no WI (web-learning sweep = 0) | — |
| **OWD-T4** | S6 pre-execution checklist rider — refresh anchors, confirm ADR-0024 (via A9), keep T9 flag-flip separate from T10/T11 deletion, restate rollback ≠ flag/OTA (T4; risk-4) | S | P0-gated | **gate-precondition** (on S6 plan; not do-now) | WI-1308 (S6 V0 retirement, Refining), WI-1292 (0130 DROP, HELD); consumes A9 | S6 execution start |

**T8 — compliance launch-blockers (four named sub-blockers, enumerated per drain plan T8):**

| Row | Sub-blocker | Proposed disposition | Owner / evidence |
|---|---|---|---|
| **OWD-T8a** | Adult lawful-basis + terms-accepted record (risk under DPIA cond. 3) | **FOLD → WI-1193** (exact match) | WI-1193 "lawful_basis/termsAccepted for adult self-processing" — Ready/P1 |
| **OWD-T8b** | Processor DPA/transfer papering (Art 28 + per-vendor TIAs) | **FOLD → WI-1192** (exact match) | WI-1192 "processor contracts and international transfers… DPA signatures" — Ready/P1 |
| **OWD-T8c** | 13+ launch-floor changes (risk-12) | **accept-as-governed** — WI-1114 owns the store declarations; *lowering* the floor is deferred/gated (VPC/procurement) | WI-1114 (13+ rating), WI-1116 (US-state age-signal) adjacent |
| **OWD-T8d** | Consent-withdrawal **bearer-token** threat posture (risk-14) | **NEW WORK — uncovered** (needs owner + AC) | none — "bearer"/"withdrawal" sweep = **0**; genuinely uncovered |

*One-way-door candidate count: 11 A-rows + T4 + 4 T8 sub-blockers = 16 rows (12 propose new artifacts; 2 fold; 1 accept-as-governed; T11 dissolves; T1 = this doc).*

### Source 2 — Stream-2 slice rows (S2-01..S2-16 minus 03/04, + D-gate, + folded WIs)

**RULED-out as candidates:** S2-03 → **WI-2051** (Captured), S2-04 → **WI-2052** (Captured) — DONE-as-capture, D4 ruled 2026-07-14.

| Row | What | Effort | Proposed disposition | Awaiting (D-gate) | Notes |
|---|---|---|---|---|---|
| **S2-01** | Controlled ~70-decision census (must NOT read quarantined register) | L | capture (Wave-0 prep) | feeds **D1/D2** | **Absorbs T10/T11** (known); the census is the ruling input, not an input to itself |
| **S2-02** | Docs-tree reorg mapping table (→ ADR-0000 §I.4) | M | capture | feeds **D3** | includes audience-matrix move |
| **S2-05** | ARCH-N register drain (incl. ARCH-3 fix) | M | capture | **D1** | frozen-and-drained annotation |
| **S2-06** | ADR backfill batch 1 — MUST rows | L | capture | **D1** + WI-757/896 landed | collides WI-1857/1858 (see register) |
| **S2-07** | ADR backfill batch 2 — SHOULD rows | L | capture | after S2-06 pattern | collides WI-1857/1858 (see register) |
| **S2-08** | NICE/SKIP disposition sweep | S | capture | **D1** | |
| **S2-09** | WI-387 9-memory drain — content extraction | M | capture | **D2 + D6** | |
| **S2-10** | `Docs`-tagged memory migration (WI-387 remainder) | S | capture | post-D-gate | |
| **S2-11** | Execute `docs/`→`docs/canon/` reorg | L | capture | **D3 + D7** (post-Wave-2) | |
| **S2-12** | Glossary bucket-3 routing | S | capture | after S2-11 | |
| **S2-13** | J3 loose-canon + nonstandard-dir cleanup + audience-matrix move | M | capture | after S2-11 | |
| **S2-14** | PRG-14 tech-skill lean-pointer rework | M | capture | needs S2-04 (**WI-2052**, exists) | |
| **S2-15** | Quarantine backstop diff + final disposition | S | capture | after S2-06/07/08 | |
| **S2-16** | Home-doc reconciliation + graduation check | XS | capture | last | |
| **S2-D** | **Stream-2 D-gate ruling session** | S | **Manual** | this session (D1–D7) | the only Manual WI; everything downstream autonomous |

**Folded existing WIs (verified current Stage from export — NOT re-minted):**

| WI | Name | Current Stage | Awaiting | Fold action |
|---|---|---|---|---|
| **WI-752** | ADR governance correction & re-vetting | **Ready** | D5 (after 757/896 land) | unpark; re-vet 3 seed ADRs under corrected rules |
| **WI-757** | Amend MMT-ADR-0000 (reconstruct-vs-launder) | **Captured** | D5 | land first per D5 |
| **WI-895** | WP: break spec→ADR laundering circle | **Captured** | D5 (umbrella) | |
| **WI-896** | A — amend ADR-0000 §II.6 shift-left provenance | **Captured** | D5 | land with 757 |
| **WI-897** | B — AGENTS.md doctrine rule | **Captured** | D5 (parallel lane — gates nothing) | |
| **WI-898** | C — override superpowers brainstorm gate | **Captured** | D5 (parallel lane) | |
| **WI-899** | D — /refine ADR-gate | **Captured** | D5 (parallel lane) | |
| **WI-900** | E — move check-decision-adr-link to pre-commit | **Captured** | D5 (parallel lane) | |

*Stream-2 candidate count: 15 rows (14 Task + 1 Manual) + 8 folded existing WIs. 2 (S2-03/04) already captured.*

---

## § /IMPROVE BATCH — RULED summary + single open question

**RULED 2026-07-14 (operator), captured WI-1985..2013.** MoSCoW, low inclusion threshold:

| Tier | WIs | Contents |
|---|---|---|
| **MVP-must P1** | WI-1985..1992 | erasure FK teardown (013), under-18 Gemini fallback (014), plaintext transcripts (015), homework-photo cache (021), X-Profile-Id IDOR (003), Sentry free-text (004), billing month-overflow (005), CI change-class gap (002) |
| **MVP-should P2** | WI-1993..2005 | adult-owner exact-date (019, ↓P1→P2), curriculum-version read (017), envelope field-tolerance (020), metadata clobber (022), dedup double-notify (023), idempotency+dispatchId (009+#14), family-join/speaking tests (006+#16), rate-limiter tests (007), webhook/money tests (008), CI parallelize (016/2002), nx-cloudflare removal (024), curriculum-adapt exhaustiveness (001), **safety-gate-class guard (WI-2004)** |
| **Fast-follow** | WI-2006 | read-side profile-authority spike (010) |
| **Backlog** | WI-2007..2012 | replay harness (011), normalizeReplyText (012), circular imports (#13), .nullable().optional() drift (#17), review-calibration double-charge (#11), memory-consent race (#10) |
| **Umbrella** | WI-2013 | carries the roadmap-lockdown dedup/adjacency-pass; known adjacency **WI-1986 vs Gemini legacy-path removal** |
| **No WI** | — | AGENTS.md snapshot counts (#12) — plain edit |

**OPEN (the only /improve question):** **placement** — distribute the 21 MVP items into feature workstreams **vs** a dedicated remediation stream. *Recommended: distribute.* Sub-question: workstream/sprint mechanics (which WS owns which item; sprint assignment). All items currently sit at Stage=Captured (MVP holding pen).

---

## § COLLISION REGISTER — every collision, one proposed owner

Each collision resolves to **ONE owner**; the other party's disposition is stated (fold / dissolve / sequence-after / adjacent). No double-count.

| # | Parties | Proposed owner | Other party's disposition | Type | Evidence |
|---|---|---|---|---|---|
| C1 | T10 / T11 ↔ **S2-01** census | **S2-01** owns the census | T11 **dissolves** into S2-01; T10 census-shaped gaps become S2-01 rows | dissolve | KNOWN; drain plan T11 text ("stricter second-pass… small backlog") = S2-01 AC |
| C2 | T3 / **OWD-A4** ↔ **WI-1985** | **WI-1985** (erasure FK fix) lands first | A4 deletion runbook **sequences after** the fix | sequence-after | KNOWN; risk-3 + WI-1985 both on `deletion-v2.ts` |
| C3 | T9 / **OWD-A8** / risk-13 ↔ **WI-1986** + cutover plan | **WI-1986** owns code fix; cutover plan + WI-1436/1902 own removal | A8 = re-admission **note only** | adjacent | KNOWN; `docs/plans/2026-06-24-gemini-runtime-removal-cutover.md`; WI-1436 (Refining), WI-1902 (Captured) |
| C4a | T8a ↔ **WI-1193** | **WI-1193** | T8a **folds** in | fold (duplicate) | snippet: "lawful_basis/termsAccepted for adult self-processing" |
| C4b | T8b ↔ **WI-1192** | **WI-1192** | T8b **folds** in | fold (duplicate) | snippet: "processor contracts and international transfers… DPA signatures" |
| C4c | T8c ↔ **WI-1114** | **WI-1114** (declarations) | T8c **accept-as-governed**; floor-lowering deferred | adjacent | WI-1114 (13+ rating), WI-1116 (US-state signal) |
| C5 | **WI-2004** review rule ↔ target doc | **principles.md** (WI-2051/2052) | rule targets principles.md, **not** AGENTS.md | sequence-after | KNOWN (ruled fact); WI-2004 = safety-gate-class guard |
| C6 | **WI-1857** ↔ S2-06/07 | **WI-1857** owns launch-relevant `architecture.md` language-drift fix | S2-06/07 own the broader non-launch backfill | adjacent (not duplicate) | NEW; OPQ-62 F2, Captured/P2; "Fix ONLY the launch-relevant drift" |
| C7 | **WI-1858** ↔ **OWD-A7** ↔ S2-06/07 | **WI-1858** owns concrete `architecture.md` envelope *example* fix | A7 owns the evolution *rule*; S2-06/07 own backfill | adjacent (3-way resolved) | NEW; OPQ-62 F3, Captured/P2 |
| C8 | **OWD-A9** ↔ **OWD-T4** | **A9** resolves `MMT-ADR-0024` | T4 **references** the resolved status in its S6 checklist | sequence-after | drain plan T4 + T10 gap-2 |
| C9 | **OWD-A4** ↔ **WI-1442** | split by artifact — **A4** = irreversible-boundary runbook; **WI-1442** = proof-of-consent preservation | both live (different artifacts) | adjacent | WI-1442 Ready/P1 "preserve proof-of-consent before deleting live identity rows" |
| C10 | **OWD-A5** ↔ WI-1334 / WI-1341 | **A5** authors the release ADR (the rule) | WI-1334 = flag-combo ruling (input); WI-1341 = Config-T-triple consumer | adjacent | WI-1334 Ready/P2, WI-1341 Executing/P2 |
| C11 | **OWD-A6** ↔ **WI-1328** | **WI-1328** (RC prod setup) first | A6 runbook **after** RC/sandbox-webhook verification | sequence-after | drain plan T6 ("wait for RC/store verification") |

---

## § BACKLOG-SWEEP FINDINGS (Source 3)

Full scan of 213 names + snippets; suspicious matches deep-checked in JSON; term-sweeps for the decomposed artifacts.

### New discoveries (plausible collisions — resolved in register)

1. **WI-1857 / WI-1858 (OPQ-62 F2/F3) — the highest-value find.** Two already-**Captured** WIs that are *narrow launch-relevant trims of Stream-2 drain proposals #2 and #11*, siblings of WI-1856 (F1, now Closed/Dup). They pre-own the launch-critical `architecture.md` drift that S2-06/07 (ADR backfill) and OWD-A7 (envelope rule) would otherwise re-touch. **Confirmed the OPQ-62 batch is exactly F1/F2/F3 — no hidden fourth.** → C6, C7.
2. **WI-1192 / WI-1193 — exact owners of two of T8's four sub-blockers** (DPA/transfer papering; adult lawful-basis). T8 does not need new WIs for these. → C4a, C4b.
3. **WI-1436 / WI-1902 — the Cosmo owners of the Gemini runtime-removal cutover** (delete legacy routing; remove `GEMINI_API_KEY`). Confirms risk-13/T9 is governed; A8 is a one-line note. → C3.
4. **WI-1442 — adjacent to T3 deletion runbook** (already-captured proof-of-consent-preservation half). A4 and WI-1442 are different artifacts, both live. → C9.
5. **WI-1334 / WI-1328 — the sequencing anchors for T5 and T6.** WI-1334 (flag-combo ruling) feeds the release ADR; WI-1328 (RC setup) must land before the billing runbook. → C10, C11.

### Genuinely UNCOVERED by the backlog (real new work — the drain's true residue)

- **OWD-A2** Neon PITR/snapshot runbook — "PITR" sweep = 0.
- **OWD-A3** person merge/reparent/alias primitives — "reparent"/"alias" = 0.
- **OWD-T8d** consent-withdrawal bearer-token posture — "bearer"/"withdrawal" = 0.
- **OWD-A5** release ADR (`runtimeVersion`/native-change rule) — "runtimeVersion"/"native-change" = 0 (WI-1334/1341 are adjacent, not the rule).
- **OWD-A9** `MMT-ADR-0024` resolution — "scope-chip"/"ADR-0024" = 0.
- **OWD-A11** web-learning strategy checkpoint — "web learning"/"parent-control" = 0.
- **OWD-A10** `@tanstack/query-core` override — "query-core" = 0 (not separately tracked; already in AGENTS.md Known Exceptions).

### Cleared false positives (so the session does NOT re-litigate)

- **WI-1987** ("tanstack" hit) = the /improve plaintext-transcript bug (015), **NOT** the `@tanstack/query-core` override gap (A10). Different mechanism.
- **WI-1801** ("runbook" hit) = production launch-health alerts, **NOT** a deletion/PITR runbook (A2/A4).
- **WI-1888** ("session-completed" hit) = exchange-pipeline *decomposition* (a churn/refactor item listing `session-completed.ts` as a file), **NOT** the `app/session.completed` contract-evolution rule (A7).
- **"OTA"/"eas" broad grep** (WI-1187, 1453, 1460, …) = regex artifacts (matched "release"/"please"/"promote"); no release-mechanics WI beyond WI-1341/1337.

---

## § OPEN POLICY QUESTIONS

**1. MVP docs-bar policy** *(framing only — root question; no recommendation).* What documentation standard is part of MVP-done, and how strictly must as-built match docs?

- **Option 1 — Strict as-built canon.** MVP-done requires canon (`architecture.md`/PRD/ADR) to mirror shipped reality exactly; every deviation is a launch-blocking defect. *Pro:* zero drift, audit-ready posture, kills the "laundered decision" class the register found. *Con:* heavy — every launch PR carries doc-sync cost; the very drifts already found (WI-1857/1858) become launch-blockers; slows the pre-launch sprint.
- **Option 2 — Directional docs.** Canon = design intent, not a mirror; as-built may lead docs; drift is tracked backlog, not launch-blocking. *Pro:* launch velocity; matches current reality (memory: "canon docs lag Cosmo rulings"). *Con:* the register's core complaint (under-recorded / laundered decisions) persists; compliance docs (DPIA/ROPA/privacy policy) **cannot** be directional without legal exposure.
- **Option 3 — Tiered bar.** Compliance + safety canon (DPIA, ROPA, identity/deletion, LLM-safety register) strict as-built; product/architecture canon directional with tracked drift; the ADR significance-gate governs which decisions must be recorded before landing. *Pro:* strictness where legal/safety regret lives, velocity elsewhere. *Con:* requires a defensible tier boundary ("what counts as compliance-adjacent?") — itself a ruling.

**2. Accept or trim the drain plan's P0-now band.** Drain plan puts **T1, T2, T3, T5, T8, T10** at P0-now (governance artifact before current launch/release work). Decomposed, that is OWD-A1, A2, A4, A5, A9 + T8 folds/new + T10 gaps. **Accept the band as-is, or trim** given pre-launch/zero-users discounting? (E.g. A2 PITR runbook and A5 release ADR are genuinely pre-launch; A3 primitives were already demoted to P1.)

**3. /improve distribute-vs-stream + mechanics.** Distribute the 21 MVP /improve items into feature workstreams (recommended) vs a dedicated remediation stream — and the workstream/sprint assignment mechanics. (See § /improve batch.)

**4. PRG-20 gate check for Stream-2 execution start.** Slicing (this plan) is legitimate Phase-P work now, but Stream-2 *execution start* (Wave 0+) is gated on PRG-20 ("IF clean-cut tail done"): cutover landed 06-18 but PRG-06 wasn't graduated at last roster update. **Confirm the gate is open** (or rule "start now vs hold") as a D-gate rider.

---

## § UNVERIFIED (JSON capped at 200 chars — what would verify)

- **WI-1194 (retention) vs OWD-A4/T3 scope overlap** — snippet cut mid-sentence. Likely distinct (retention purge/age-out ≠ deletion irreversible-boundary), but confirm by fetching WI-1194 in Cosmo before finalizing A4's AC.
- **WI-1442 exact path coverage vs OWD-A4** — snippet confirms proof-of-consent-preservation intent but not whether its "remaining hard-delete paths" already document the Clerk-erasure/dead-letter boundary A4 targets. Fetch WI-1442 to confirm they stay separate artifacts (C9).
- **WI-1857/1858 exact line-scope vs S2-06/07** — snippets read "Fix ONLY the launch-relevant drift" (high confidence they are narrow, launch-only), but the citation lists are truncated. Fetch both to confirm S2-06/07 backfill does not re-touch the same lines.
- **T7 contract-evolution vs any existing LLM-ADR** — "session.completed"/"orchestrator" sweep surfaced only decomposition/observability items, not a contract-evolution governance doc; but the LLM-ADR set (MMT-ADR-0014/0018/0031) was not line-checked. Verify no existing ADR already carries the add/version/breaking rule before authoring A7.

---

**[ BOTTOM LINE ]** One ruling session, three sources, prepared: 16 one-way-door candidate rows + 15 Stream-2 rows + 8 folded WIs, all with proposed dispositions; 11 collisions resolved to single owners; /improve batch is RULED with one open placement question; four policy questions framed.

**[ FYI ]**
- The drain's true uncovered residue is small: 7 genuinely-new artifacts (PITR runbook, person-repair primitives, bearer-token posture, release ADR, ADR-0024 resolution, web checkpoint, tanstack note). Everything else folds, sequences, or is already governed.
- Backlog sweep's biggest yield (WI-1857/1858) shows the OPQ-62 pattern already carved the launch-critical `architecture.md` drift out of Stream-2 — S2-06/07 inherit only the non-launch backfill.

**[ DECISIONS ]** *(all deferred to the ruling session this doc prepares — none for the caller now)*
1. MVP docs-bar policy (Option 1/2/3).
2. Accept-or-trim the P0-now band.
3. /improve distribute-vs-stream + mechanics.
4. Stream-2 D-gate D1–D7 + PRG-20 execution-start gate.
