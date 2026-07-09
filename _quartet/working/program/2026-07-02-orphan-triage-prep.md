# Orphan-WI Triage & Workstream Prep — 2026-07-02

**Purpose:** organize all MentoMate work items *not* owned by a live lane (WS-18 identity-cutover, WS-25 bug-lane, WS-28 v2-finalization) into proposed workstreams with dependencies + spin-up sequencing. **Prep only — no execution** (no machine capacity; lanes spin up as running lanes wind down).

**Scope pull (live Cosmo, 2026-07-02):** 77 non-Closed MentoMate items. 14 owned by the 3 live lanes → out of scope. **63 in triage scope.** Project id = `3658bce9-1f7c-8128-9f9b-fa7fcf75a13b` (MentoMate; note the earlier-cached id was *Nexus* — corrected).

---

## Two reconciliations to do BEFORE staffing

1. **Compliance dedup.** WS-29's 6 Captured items (WI-1191–1196) partly re-tread the Ready 11xx compliance set:
   - WI-1191 (appoint DPO + privacy-policy pre-publish + Art 27 rep) ⊇ **WI-1105** (DPO) + **WI-1109** (privacy policy) + **WI-1110** (UK rep) — collapse.
   - WI-1192 (sign Art 28 DPAs) = **WI-1112** (sign AI-provider DPAs) — collapse.
   - WI-1193/1194/1195/1196 are **net-new engineering** items (no 11xx equivalent) — keep.
   Reconcile into one compliance register before a lane touches it, or we double-work.

2. **Legal vs engineering split.** The compliance body is ~60% **legal/ops deliverables** (appoint DPO, sign DPAs, DPIA, ROPA, breach plan, privacy policy, Article 9 ruling, transfer checks, store declarations) — **not shepherd-executable**, calendar-bound external lead times. These should start **now**, human-owned, independent of machine capacity. Only ~40% is code.

---

## Proposed workstreams (tiered by when to spin up)

### TIER 1 — Launch-gating. Start the legal track now; first freed lane takes Compliance-Eng.

**LEGAL / EXTERNAL TRACK** — *operator/legal owned, NOT a shepherd lane. Start immediately (long lead times).*
| WI | P | Item |
|----|---|------|
| 1105 | P1 | Appoint outsourced DPO *(dup of 1191)* |
| 1106 | P1 | Pre-launch DPIA |
| 1107 | P1 | Record of Processing Activities (ROPA) |
| 1108 | P1 | Data-breach response plan (72h Datatilsynet) |
| 1109 | P1 | Publish privacy policy + child-readable summary |
| 1111 | P1 | Rule + document the Article 9 health/learning-disability decision |
| 1112 | P1 | Sign AI-provider DPAs, no-training terms *(dup of 1192)* |
| 1113 | P1 | Per-provider US transfer checks (SCCs + TIA) |
| 1114 | P1 | Store age-rating + kids/privacy declarations (both stores) |
| 1110 | P2 | Appoint UK GDPR representative |
| 1115 | P2 | Store country availability + hard-blocks |

**WS-COMPLIANCE-ENG** — *shepherd; gated behind identity-v2 settling (RLS needs stable v2 tables).*
| WI | P | Item |
|----|---|------|
| 1193 | P1 | Record accountable lawful-basis + terms-accepted; split consent purposes |
| 1194 | P1 | Close retention gaps (transcript purge, age-out quotes, dormancy sweep) |
| 1195 | P1 | In-chat Art 50 AI disclosure + extend no-clinical-copy guard to LLM fields |
| 1196 | P1 | Activate DB-layer RLS (or formally accept app-layer-only + tracked remediation) |
| 1002 | P3 | New person-keyed supporter/visibility tables ship without RLS *(same RLS theme)* |
| 1116 | P2 | Integrate US state age-signal (TX/UT/LA App Store Accountability) |
| 1201 | P2 | Integration test: visibility shared-record endpoint profileId scoping |
| 1176 | P1 | Fix requestSelfUnlink 500 (graceEndsAt vs graceDays) *(identity/compliance-adjacent)* |
| 1259 | P3 | Mirror exact-birth-date age gating into 3 mobile call sites |

**WS-SAFETY-EVAL** — *shepherd; small, high-priority; could fold into WS-28's tail if it lingers.*
| WI | P | Item |
|----|---|------|
| 1154 | P1 | Safety: minor-routed model leaks drug-synthesis steps (eval SL-DU02) — needs break-test |
| 1155 | P2 | Envelope signal discipline: private_sources.insufficient + teach_back rubric |
| 781 | P2 | Decide CONCEPT_CAPTURE_ENABLED (flip on / confirm off) |

**Store/billing eng:** WI-**1117** (P1, RevenueCat store wiring for billing go-live) — one code task; ride it with the Legal/store track as a handoff.

### TIER 2 — Product runway. After identity-v2 cutover completes (WS-18 winds down).

**WS-SUPPORTER-LINKING** — *shepherd; depends on v2 person/guardianship model; has internal S-sequence (S0<S3<S4<S5).*
| WI | P | Item | Seq |
|----|---|------|-----|
| 1121 | P2 | S0: wire 5 unproduced ledger kinds + descope reward_receipt | S0 |
| 1134 | P3 | S3: reconcile structural deviations (milestone namespace + components) | S3 |
| 1127 | P2 | S4: add GET /scopes/coldstart route | S4 |
| 1135 | P2 | S4: SupporterColdStart + SupporterSelfLearningDoorway surfaces | S4 |
| 1136 | P2 | S4: supporter co-learning service + CoLearningDoorway (T19) | S4 |
| 1137 | P2 | S5: linking-ceremony mobile screens (link/*) | S5 |
| 787 | P2 | Guardian-write suppression for credentialed (has_own_account) charges | — |
| 1185 | P3 | Parents create/manage child-scoped subjects from child context | — |

**WS-MOBILE-UX** — *shepherd; independent of cutover, can slot into any freed lane.*
| WI | P | Item |
|----|---|------|
| 1208 | P2 | Keep pick-book Back inside the Subjects shell |
| 1209 | P2 | Return subject-hub empty-state Back to Subjects, not Home |
| 1210 | P2 | Align empty subject states with visible curriculum state |
| 1204 | P2 | Keep homework-capture bottom actions above system nav |
| 1184 | P3 | Verify/fix child subject route wedging (Refining) |
| 1142 | P3 | Study→Family switch-CTA regression coverage (BRIDGE-04) |
| 1212 | P3 | Book-flip animation for subject curriculum prep |
| 1248 | P3 | Route remaining inline CTA buttons through shared Button *(currently WS-25 tail)* |

### TIER 3 — Debt. Deferrable; slot when nothing higher is waiting.

**WS-PLATFORM-HARDENING** — *refactor + dependency upgrades.*
| WI | P | Item |
|----|---|------|
| 1177 | P2 | Extract assessment-answer + stream-failure logic out of routes |
| 1178 | P2 | Capture remaining silent-recovery observability gaps (sse-utf8 + analytics) |
| 482 | — | Split monolithic session/curriculum service modules *(WS-8)* |
| 1096 | P2 | API query-performance pass (N+1 / serial awaits / unbounded) |
| 1088 | P2 | Consolidate owner/role naming + name magic values |
| 1179 | P2 | Migrate mobile auth @clerk/clerk-expo → @clerk/expo |
| 1180 | P2 | Upgrade @sentry/react-native off pinned 8.1.0 |
| 1041 | P2 | Root dependency hygiene (tailwind placement + wrangler/query-core dedup) |
| 1183 | P2 | i18n value-equality guard + re-translate echoed-English |
| 1098 | P3 | Validate API responses at mobile trust boundary (Refining) |
| 1069 | P3 | Centralize mobile data-hook conventions + split oversized hooks |
| 1188 | P3 | Adopt QueryStateView/TimeoutLoader/ErrorFallback (Batch 2-4) |
| 1190 | P3 | Burn down gc1-allow internal-mock backlog |
| 1181 | P3 | Dev-dependency lockfile hygiene (node-fetch@2 / lodash) |

**WS-DEVINFRA-TOOLING** — *CI / migration-health / Cosmo machinery. Some are estate-toolchain (could route to Nexus).*
| WI | P | Item |
|----|---|------|
| 1164 | P2 | change-class router must run @eduagent/database:test on drizzle/** changes |
| 617 | P2 | Re-enable main branch protection: required code-owner review |
| 770 | P2 | Enhance /cosmo:review (greenness, flake lane, scoping) *(estate-toolchain)* |
| 649 | P3 | Dev Neon journal drift blocks drizzle-kit migrate |
| 542 | P3 | Watch: retire nx-affected-on-Windows workaround *(WS-4)* |
| 1187 | P3 | Spike: extract reusable SaaS mobile template repo |
| 867 | — | Pin git identity in worktree-setup + commit skills (regression-proof the placeholder I just fixed) |
| 1167 | P2 | Staging deploy migration fail → **DEDUP to WI-1128** (fix landed 56b9ded15, deploys green) |

---

## Dependencies / sequencing spine

- **Legal track** → zero code dependency → **start now**, human-owned. Longest external lead times (DPO contract, DPA counter-signatures, DPIA) — the true critical path to launch.
- **WS-Compliance-Eng (RLS) + WS-Supporter-Linking** → both depend on **WS-18 identity-v2 cutover completing** (779 strip, FK repoint WI-1128, reader sweep WI-1254). Natural sequencing: WS-18 winds down → frees a lane → these two spin up.
- **WS-Mobile-UX, WS-Safety-Eval, WS-Platform-Hardening, WS-DevInfra** → independent of the cutover → slot into any freed lane by priority.
- **Store/billing (1117 + legal store items)** → gated on legal declarations landing first.

## Suggested spin-up order as lanes free
1. (now, no lane) Legal/external track — human-owned.
2. WS-Safety-Eval (WI-1154 P1) — smallest, highest-urgency; fold into WS-28 tail if it lingers.
3. WS-Compliance-Eng — first full lane freed after WS-18.
4. WS-Supporter-Linking — second lane freed after WS-18 (parallel to Compliance-Eng if two free).
5. WS-Mobile-UX — opportunistic (independent).
6. WS-Platform-Hardening / WS-DevInfra — last, deferrable.

## Open questions for operator
1. Confirm the **legal track owner** (you? external counsel?) and whether it starts now.
2. Approve the **compliance dedup** (collapse 1191→1105/1109/1110, 1192→1112) before staffing.
3. Split granularity: is **7 streams** the right cut, or consolidate (e.g. merge DevInfra into Platform-Hardening; merge Safety into WS-28)?
4. Do the **estate-toolchain** items (770, 542, 867, 1187) belong in a MentoMate lane or route to Nexus?

---

## EXECUTION RECORD — 2026-07-02 (operator-approved)

Executed the triage into the Workstreams DB (`47d8bc5c-e074-4cd9-95bd-ddbb81978bdf`). Prep only — no shepherd dispatched.

**Workstream pages (all Project→MentoMate):**
| Stream | Page id | Status | Items |
|---|---|---|---|
| Compliance — Legal & External | `3918bce9-1f7c-81fa-ae6a-cf540903fd14` | Open | 14 |
| Safety & Eval | `3918bce9-1f7c-810d-a939-dce083b0473b` | On hold | 3 |
| Supporter & Linking | `3918bce9-1f7c-81d8-b6ec-ca6200092529` | On hold | 8 |
| Mobile UX & Navigation | `3918bce9-1f7c-81ae-97c1-d15ad8951beb` | On hold | 8 |
| Platform Hardening | `3918bce9-1f7c-8142-9b75-dfcafbc94d65` | On hold | 14 |
| Dev-Infra & Tooling | `3918bce9-1f7c-81ed-ba43-c84dc8a21e36` | On hold | 7 |
| Compliance — Engineering (renamed from WS-29 Compliance) | `38f8bce9-1f7c-810e-9357-d4c7c9528658` | On hold | 9 |

**Dependencies (Notion Blocked by / Blocking):** Compliance-Engineering and Supporter-Linking each `Blocked by` → WS-18 Identity Cutover (`3808bce9-1f7c-81a2-9ea1-ee924aeaa0a8`); reverse `Blocking` auto-populated on WS-18 (2). These are the only *true* blocks; spin-up order for the rest is encoded via Status (Open vs On hold) + the "Spin-up rank N" line in each stream Description — deliberately NOT modeled as fake dependencies (would corrupt the timeline).

**Mapping:** all 63 orphan WIs' Workstream relation set; verified 0 orphans remain. Dedup: WI-1191 (→ dup of 1105/1109/1110) and WI-1192 (→ dup of 1112) moved into Legal & External and flagged here for merge-close at refine (not force-closed — closing is a review gate). WI-1167 mapped to Dev-Infra as a close-only item (deploy fix already landed 56b9ded15 = WI-1128 slice).

**Not done (correctly out of scope):** no shepherd dispatched; WS-28 left parked (its re-task to Safety & Eval / WI-1154 is a separate pending operator decision); the WI-867 git-identity skill-hardening needs a fresh WI (not in this orphan set).
