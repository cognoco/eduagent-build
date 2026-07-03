# 10 — Spine ↔ Cosmo Reconciliation Map (Phase B)

**Status:** **APPROVED** by operator 2026-07-02. Captures executed (C1–C8 → WI-1301…1308); WI-1250 re-filed.
Remaining writes (WS re-files, compliance dedup, WI-1249, pause-lift) held for a triage pass — see end.
Authority: `08-convergence-spine.md` (RATIFIED). Original classification below is unchanged (the map of record).

**Operator rulings on this map (2026-07-02):** map **approved**; supporter S0–S5 **in the V2 MVP**
(spine §6.5); C1 captured as a **new WI**, WI-787 stays separate (spine §6.7).

**Pulled 2026-07-02** from Cosmo "Work Items" (`f170be9e…`), Stage ≠ Closed → **269 open estate-wide**.
The spine governs **MentoMate app convergence only**, so scope narrows to **77 items**: 75 with
Project=MentoMate + **2 eduagent items misfiled under Project=Nexus** (WI-1250, WI-1249, both WS-18).
The other ~192 (160 Nexus, 18 ZDX-Marketplace, …) are estate/ZDX control-plane work the spine does
not touch — out of Phase-B scope.

---

## Headline

The queue is **healthier than the "jumbled nightmare" framing implied.** Three facts:

1. **~55 of 77 are ORTHOGONAL** — legitimate compliance, safety, UX-polish, and hygiene work the
   spine neither advances nor obsoletes. They proceed unchanged. The spine does **not** rewrite the queue.
2. **~22 are ON-SPINE** convergence work, and they are **already mostly correctly sequenced** — the
   cutover chain (1128→1139→779→1141, drops gated) matches the milestone order. Almost nothing needs
   re-sequencing; **nothing needs closing** (no one is building V0 / preserving legacy as live code —
   the strip items are the *delete* side).
3. **The spine's real yield is the 8 CAPTURE gaps** — convergence work with **no Cosmo item and no
   owner**, five of them the M1 seam-hardening cluster (incl. the top-risk R1 authority IDOR) and two
   the rollback spine (M4 fallback artifact, M5 V0-retirement) that gate ship. This is exactly what
   07's "don't halt — impose the spine, assign the unowned findings" predicted.

**Two active P1 breakages surfaced that the spine cares about** (FYI, not Phase-B blockers):
`WI-1167` — staging deploys RED, *"relation public.profiles does not exist"* — is **R3 (phantom schema)
manifesting for real**; `WI-1176` — supporter self-unlink 500s. Both independent of the pause.

---

## Classification buckets

| Bucket | Count | Cosmo action (on approval) |
|---|---|---|
| **KEEP-ORTHOGONAL** — spine doesn't govern; proceed as-is | ~55 | none |
| **KEEP-ON-SPINE** — advances a milestone; sequence already right | ~19 | map to milestone; none |
| **RESEQUENCE / UNBLOCK** — on-spine, gate changed by spine ratification | 2 | update gate note |
| **CAPTURE** — spine work with no WI | 8 | create WI (post-approval) |
| **TRIAGE / DEDUP** — data gap or duplicate-generation | 1 + a set | triage pass |
| **CLOSE** — obsoleted by spine | 0 | — |

---

## Spine-work coverage checklist (does a WI exist?)

| Spine work | M | Risk | Covered by | Gap? |
|---|---|---|---|---|
| Caller-bound authority on `/account/*`+`/billing/*` | M1 | **R1 (top)** | `WI-787` covers *part* (guardian-write suppression in `verifyPersonOwnershipV2`) | **PARTIAL → CAPTURE** the route-gate IDOR (client `X-Profile-Id` isOwner) |
| Close `/profiles/switch` elevation-bypass | M1 | R2 | — | **CAPTURE** |
| One-membership-per-person DB constraint | M1 | R8 | — | **CAPTURE** |
| Flag-combo ratchet (3 sanctioned rows) | M1 | R9 | — | **CAPTURE** |
| PR-gated cross-boundary `profile-v2` seam test | M1 | R6 | `WI-1201` is a *visibility* scoping test (adjacent, not the seam) | **CAPTURE** |
| CI builds real (prod) schema / promote `_freeze-only` into journal | M2a | R3 | `WI-649` (dev journal drift), `WI-1167` (stg fail), `WI-1164` (CI route) touch symptoms | **CAPTURE** the CI-schema-fidelity fix itself |
| Author reversible FK-repoint migrations | M2a | — | `WI-1128` (0129 profiles→person), `WI-1288` (concepts→person) | ✓ |
| Apply chain to dev/stg/CI; converge v2-only | M2b | — | `WI-1141` (dev flip), `WI-1250` (stg drop), `WI-1292` (0130 drop) | ✓ |
| Strip dead legacy subtree + schema defs | M3 | R4 | `WI-779` (umbrella), `WI-1139` (schema defs) | ✓ |
| **Build `V2=off/V1=on` channel + real E2E pass** | **M4** | — | `WI-1142` (mode-switch regression test, adjacent) | **CAPTURE** the fallback artifact/E2E |
| **Retire V0 + flags-off shell** | **M5** | — | — | **CAPTURE** |
| Ship V2 | M6 | — | S0–S5 build cluster (1121/1127/1134/1135/1136/1137) + V2 nav (1208/1209/1210/1283) | ✓ (feature-build; MVP-scope fork below) |

**CAPTURE list (8) — the actionable output. CREATED 2026-07-02.** Nobody owned these; they are the spine made real:

| # | WI | Capture | M | Stage | Notes |
|---|---|---|---|---|---|
| C1 | **WI-1301** | Route-gate caller-bound authority (R1 IDOR) | M1 | Ready | new WI (§6.7); **top risk**; `WI-787` stays separate |
| C2 | **WI-1302** | `/profiles/switch` elevation-bypass close (R2) | M1 | Ready | pairs with C1 |
| C3 | **WI-1303** | One-membership-per-person DB constraint (R8) | M1 | Ready | before any invite/claim/multi-credential flow |
| C4 | **WI-1304** | Flag-combo ratchet — 3 sanctioned rows (R9) | M1 | Ready | CI test; encodes V2⇒V1 dependency |
| C5 | **WI-1305** | Cross-boundary `profile-v2` seam test (R6) | M1 | Ready | real adapter, PR-gated |
| C6 | **WI-1306** | CI-schema-fidelity: build prod schema / journal-promote freeze-only (R3) | M2a | Captured | closes the phantom-schema class biting `WI-1167` |
| C7 | **WI-1307** | Build + E2E-prove the `V2=off/V1=on` fallback channel | M4 | Captured | **gates M5 + M6** — no rollback exists today |
| C8 | **WI-1308** | Retire V0 + flags-off shell | M5 | Captured | irreversible; gated on C7; carries the tag+register preservation AC (§6.6) |

C1–C5 (WI-1301…1305, Ready) are the **M1 bundle** — owner J+Z per spine. C6–C8 (Captured) are later-milestone work.
C7/C8 are the rollback spine that must exist before ship.

---

## Full item classification (77)

Legend — Bucket: **O**=keep-orthogonal · **S**=keep-on-spine · **RS**=resequence/unblock · **T**=triage.

### WS-18 Identity Cutover (9) — the convergence core
| ID | Stage | B | M | Rationale |
|---|---|---|---|---|
| WI-1128 | Executing | RS | M2a | 0129 FK-repoint (reversible). **All 3 blockers closed → unblocked**; HELD-until-"spine landed" condition **now met** (spine ratified). Reversible repoint may proceed; irreversible drop is 1292/1250. |
| WI-1139 | Ready | S | M3 | 779-D: remove legacy table defs; blk[1128]. |
| WI-1141 | Backlog | S | M2b | dev flip IDENTITY_V2_ENABLED → dev↔prod parity; blk[779]. |
| WI-1162 | Captured | S | seam | decide v2 subscription cols in GDPR export (export-v2 seam, WI-1161 incident site). Small decision. |
| WI-1249 | *(null)* | T | — | empty Stage + empty Name = **data gap**; also Project=Nexus (misfiled). Triage/likely delete. |
| WI-1250 | Captured | S | M2b | drop orphaned stg `subscriptions` table (irreversible). **Fix Project=Nexus→MentoMate.** |
| WI-1292 | Backlog | S | M2b/M3 | apply 0130 legacy DROP — HELD, irreversible, human-confirm gate (matches spine M2b). |
| WI-752 | Executing | S | gov | ADR governance re-vet — **overlaps the spine's "promote 08 → MMT-ADR" step + the S0–S6 provenance caveat.** Coordinate. |
| WI-779 | Ready | S | M3 | WP-FLAG strip umbrella; blk[1239✓;1128;1139]. |

### WS-31 Safety & Eval (5) — 2 misfiled cutover items
| ID | Stage | B | M | Rationale |
|---|---|---|---|---|
| WI-1154 | Reviewing | O | — | **THE safety item** (minor-routed extraction leak). Continues regardless of pause. |
| WI-1155 | Ready | O | — | envelope signal discipline (eval quality). |
| WI-1285 | Captured | O | — | safety rules only in prompt-text → harden; same root as 1154. |
| WI-1288 | Captured | S | M2a | concepts/concept_mastery FK→person + 0129 (split from 781). **Cutover work misfiled under Safety WS.** |
| WI-781 | Reviewing | S | M2 | CONCEPT_CAPTURE_ENABLED decision, gated on FK repoint. |

### WS-32 Supporter & Linking (8) — V2 build + the M1 authority item
| ID | Stage | B | M | Rationale |
|---|---|---|---|---|
| WI-787 | Ready | S | **M1** | guardian-write suppression absent from `verifyPersonOwnershipV2` — **closest existing WI to R1; the authority guard.** Scope-expand for C1? |
| WI-1121 | Ready | S | M6 | S0 wire 5 ledger kinds (V2 /now). |
| WI-1127 | Ready | S | M6 | S4 GET /scopes/coldstart route. |
| WI-1134 | Ready | S | M6 | S3 reconcile structural deviations. |
| WI-1135 | Ready | S | M6 | S4 SupporterColdStart surfaces (T17). |
| WI-1136 | Ready | S | M6 | S4 supporter co-learning (T19). |
| WI-1137 | Ready | S | M6 | S5 linking-ceremony screens. |
| WI-1185 | Ready | O | — | parents manage child-scoped subjects (proxy-mode feature; M1-adjacent authority). |

### WS-33 Mobile UX & Navigation (7) — V2 shell polish
| ID | Stage | B | M | Rationale |
|---|---|---|---|---|
| WI-1142 | Reviewing | S | M4 | Study→Family switch-CTA regression coverage — supports fallback/shell integrity. |
| WI-1208 | Reviewing | S | M6 | pick-book Back inside Subjects shell (V2 nav). |
| WI-1209 | Executing | S | M6 | subject-hub empty Back→Subjects (V2 nav). |
| WI-1210 | Reviewing | S | M6 | align empty subject states (V2 UX). |
| WI-1283 | Captured | S | M6 | shelf Back hardcodes Library, **ignores MODE_NAV_V2** (sibling 1208/1209). |
| WI-1184 | Refining | O | — | child subject route wedges Chrome walkthrough (bug). |
| WI-1248 | Executing | O | — | route inline CTAs through Button (1081 tail; UX hygiene). |

### WS-35 Dev-Infra & Tooling (8)
| ID | Stage | B | M | Rationale |
|---|---|---|---|---|
| WI-1167 | Captured | S | M2 | **staging migrate RED — "relation profiles does not exist" = R3 manifesting. P1 active breakage.** |
| WI-1164 | Captured | S | M2 | change-class router must run database:test on drizzle changes (R3-adjacent CI). |
| WI-649 | Ready | S | M2a | dev Neon journal drift (22/109) blocks drizzle-kit migrate (R3 on dev). |
| WI-1187 | Ready | O | — | SaaS-template extraction spike. **Recommend park during convergence** (low value now). |
| WI-1268 | Captured | O | — | setup-worktree core.bare guard (infra safety). |
| WI-1258 | Captured | O | — | git-fixture cwd/path collision hardening (infra safety; WS-25). |
| WI-542 | Ready | O | — | watch nx-affected-on-Windows (watch item). |
| WI-617 | Ready | O | — | re-enable branch protection before launch (launch gate). |
| WI-770 | Ready | O | — | enhance /cosmo:review — **Cosmo tooling; likely belongs to Nexus/WS-23, not MentoMate.** |

### WS-30 Compliance — Legal (14) + WS-29 Compliance — Eng (9) — all ORTHOGONAL
GDPR/DPIA/store launch gates — the spine does not govern these. **Keep-orthogonal**, but one queue-hygiene finding:
**apparent duplicate generations.** The Ready `11xx` set (1105 DPO, 1109 privacy-policy, 1112 AI-DPAs, 1113 TIA…)
overlaps the Captured `119x` set (1191 DPO+policy-fields, 1192 Art-28-DPAs, 1193 lawful-basis, 1194 retention,
1195 Art-50, 1196 RLS). Looks like the DPIA workstream was re-captured. → **DEDUP triage** (not a spine action).
- WS-30: WI-1105/1106/1107/1108/1109/1110/1111/1112/1113/1114/1115/1117 (Ready) · WI-1191/1192 (Captured) — **O**
- WS-29: WI-1002 (supporter tables no RLS — M1/R8-adjacent) · WI-1116 · WI-1176 (**P1 self-unlink 500 bug**) · WI-1193/1194/1195/1196 · WI-1201 (visibility scoping test — R6-adjacent) · WI-1259 (age-gate mirror) — **O**

### WS-34 Platform Hardening (14) — all ORTHOGONAL (refactor/dep/perf hygiene)
WI-1041 · WI-1069 · WI-1088 (owner/role naming — **M1/seam-adjacent**, note) · WI-1096 · WI-1098 · WI-1177 ·
WI-1178 · WI-1179 (clerk-expo→@clerk/expo, ~87 files, auth-adjacent) · WI-1180 · WI-1181 · WI-1183 · WI-1188 ·
WI-1190 · WI-482 — **O**. None spine-governed; all proceed independently.

### WS-25 Review backlog (3) · WS-28 V2 finalization (1)
- WI-1244 (decompose god-screens) · WI-1252 (webhook test mocks→seams) — **O**
- WI-904 (dictation pacing rework) — **O**; **misfiled under "V2 finalization" — it's a UX feature.**

---

## Findings for the operator (beyond the map)

1. **The 8 CAPTURE gaps are the whole point.** They are unowned convergence work — the M1 bundle (C1–C5),
   the CI-schema fix (C6), and the rollback spine (C7 fallback, C8 V0-retire). Approving the map = authorizing
   these captures. **C1–C5 = the M1-immediate dispatch.**
2. **Nothing to close; almost nothing to resequence.** The existing queue is legitimate and mostly correctly
   ordered. The tangle was an *architecture* gap (no spine), not a *queue* gap. Validates "don't halt."
3. **Filing hygiene (minor, triage):** WI-904 under V2-finalization (→ UX); WI-1288/781 cutover work under
   Safety WS; WI-787 authority under Supporter WS; WI-770 Cosmo-tooling under MentoMate; WI-1250/1249
   Project=Nexus. Re-file on approval.
4. **Compliance duplicate-generation** (11xx Ready vs 119x Captured) — dedup triage before anyone executes them.
5. **Active P1 breakages** WI-1167 (staging red = R3 real) + WI-1176 (self-unlink 500) — surface now; both
   outside the pause and safe to fix immediately.

---

## Decisions the map raises (for the operator)

1. **M1 CAPTURE mechanism:** scope-expand `WI-787` to hold C1 (route-gate authority), or a fresh WI + keep 787
   as the guard-internal piece? (Recommend: **new WI for C1, 787 stays its narrower self, both under M1.**)
2. **Supporter MVP scope:** are all six S0–S5 supporter surfaces (1121/1127/1134/1135/1136/1137) **in the V2
   MVP**, or post-launch? The spine's M6 ship-gate does **not** require them — it requires seam-smoke + 7
   prompts + proven fallback. This is a real scope fork worth ~6 items of sequencing.
3. **Pause lift:** this map **is** the "resume, new sequence" signal for WS-18/WS-28. On approval, lift the pause
   with the re-baselined order (M-milestones) + the 8 captures.

---

## Writes — done vs. held

**DONE (2026-07-02, post-approval):**
- ✅ Created 8 CAPTURE WIs → **WI-1301…1308** (C1–C5 Ready/M1, C6–C8 Captured).
- ✅ Re-filed **WI-1250** Project Nexus → MentoMate.
- ✅ Workstream re-files (held batch): **WI-904** WS-28→WS-33, **WI-1288** WS-31→WS-18, **WI-781** WS-31→WS-18.
- ✅ Capture workstream assignments: **WI-1306** → WS-18 (M2a); **WI-1307/1308** → WS-28 (M4/M5).
- ✅ Created **WS-37 "Seam Hardening"** (Project=MentoMate); assigned the **M1 bundle WI-1301…1305** to it
  (operator-approved). Owner unset — ready for orchestrator handoff.
- ✅ Re-homed **WI-770** ("enhance /cosmo:review") → Project=Nexus, Workstream=WS-23 (Cosmo improvements) —
  estate tooling, off the MentoMate board.
- ✅ Resume note for the WS-18/WS-28 orchestrator drafted → `11-ws18-28-resume-note.md`.
- ✅ **Compliance dedup resolved** (operator-ruled 2026-07-03). Only two real overlaps existed (not a whole
  parallel generation): closed **WI-1191** as Duplicate → canonicals WI-1105/1109/1110; closed **WI-1112 +
  WI-1113** as Duplicate → broader canonical WI-1192 (all-processor DPAs). 1193/1194/1195/1196 kept (net-new
  eng conditions); all `11xx`-only items kept. Rationale recorded on each closed item's Notes.
- ✅ **WI-1249** deleted (archived) — empty/junk item.

**Fully executed.** The only remaining step is the **pause-lift** (operator/Zuzka deliver the resume note to
the WS-18/WS-28 orchestrator) + the **orchestrator handoff for WS-37 Seam Hardening** — both operator-owned,
not Cosmo writes.
