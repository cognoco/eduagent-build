# 08 — The Convergence Spine

**Status:** **RATIFIED** by operator (Jörn), 2026-07-02 — the four §6 forks are ruled and the six
independent-review fixes are folded in. This is now the single architecture both the identity and
front-end halves obey. **Formal-canon caveat:** authority is operator-ratified now; it becomes *documented
canon* on promotion to an `MMT-ADR` + a `docs/architecture.md` line (the durability step below). Execution
proceeds per the milestone gates in §4 — no step runs ahead of its gate.
**Owner:** Jörn (sole authority; aligns with Zuzka). **Anchor:** `origin/main` 145e74d5e-era; findings from `06-fable-audit.md`.
**Review history:** independent agent review of the draft (2026-07-02) found 6 issues; all 6 applied here (§4/§1/§7 + truth-table).

---

## 0. Why this document exists

Two initiatives — Identity Foundation/Cutover (backend) and the V0/V1/V2 front-end work — advanced in
parallel with **no shared architecture**. The front-end rebased on identity changes as they landed; nobody
owned the cross-product. The result is a matrix (shell-generation × identity-generation × DB-generation)
where **no environment runs a verified target triple**, plus a large dead legacy subtree and a seam that was
never designed. There is no shortage of plans; there is a shortage of **one** plan both halves obey. This is
that plan. Its job is as much **social as technical**: a single owned contract that stops the *next* parallel
divergence. Where any other plan conflicts with this ratified spine, **this wins**, and the conflict is a bug
in the other plan to fix.

---

## 1. Target end-state — two supported configs, nothing else

Exactly **two** owned configurations, both on the **v2-identity backend**:

| | **Config T (target / MVP)** | **Config F (fallback)** |
|---|---|---|
| Shell | V2 — "mentor-is-the-app" (Mentor/Subjects/Journal) | V1 — the `resolveNavigationContract` engine |
| Backend | v2-identity | **same** v2-identity backend |
| Selection (build-time) | `V0=off, V1=on, V2=on` | `V0=off, V1=on, V2=off` |
| Rollback role | what ships to users | the rollback target if V2 must be pulled |
| Status today | live on preview/staging; supporter half **shipped** (WI-1170/1171 closed to AC) | **UNPROVEN — must be verified.** No current env runs `V2=off/V1=on`; preview/dev set both V1 and V2 on, and V2 wins the tab shape (`use-navigation-contract.ts:185`). Config F is a capability to **build + prove** (M4), not one we have. |

**Rollback is OTA/channel promotion, not a runtime flag flip.** The `MODE_NAV_*` flags are **build-time**
`EXPO_PUBLIC_*`, read at module load (`feature-flags.ts:30`) — not a server-side runtime toggle. Pulling V2
back to V1 means promoting a **prebuilt, tested V2=off/V1=on JS bundle** via OTA/channel (fast — ~5 min for
JS-only — but not instant, not runtime; a binary if any native surface differs). So Config F must exist as a
**built, E2E-verified artifact/channel** before it can be relied on (M4).

**Not in the target — retired as tagged releases, not preserved as live code:** the V0 shell + flags-off
legacy shell; the dead legacy-identity subtree; the legacy identity DB tables (dev's full legacy schema,
stg's orphan `subscriptions`). Git is the version-preservation system — nothing stays alive "to be safe."

> **Not splitting into two apps.** Shells share 86% of screens (83/97) + the entire non-UI stack; V2-specific
> code is ~5 files. A split duplicates/re-packages the wrong 86% and worsens rollback. One app, two flag arms.

**F retention (RULED):** V1 stays flag-reachable through launch + a stability window. Eventual V1 retirement
to leave V2-only is a **post-launch decision**, out of scope here.

---

## 2. The seam contract — promote the accident to a design

The shell consumes a **legacy-shaped profile DTO synthesized from identity-v2** (`listProfilesV2` /
`getPersonScope` / `getProfileV2` / `loadProfileRowByIdV2`, `profile-v2.ts`) — the only place the two systems
touch, and where every incident (WI-1255/1161/1138) happened. Make it a **named, owned, tested contract**:

1. **Shape.** A stable `Profile` DTO (`{ id, isOwner, role, displayName, birthYear, conversationLanguage,
   consentStatus, linkedChildIds, … }`). Changes are contract changes (versioned, both-halves-reviewed).
2. **Authority is caller-bound, never shape-bound (R1 — top risk).** Owner/write authority on every
   `/account/*` and `/billing/*` endpoint MUST derive from the **server-resolved `callerPersonId`**
   (`verifyPersonOwnershipV2`), not the client `X-Profile-Id` shape's `isOwner`. Also close R2 (the
   `/profiles/switch` elevation reverification must not be bypassable by a direct `X-Profile-Id`).
3. **Invariant: one org = one household, enforced by constraint (R8).** Holds today by convention + a
   login-resolve guard, not the DB. Add a DB-level one-membership-per-person constraint before any
   invite/claim/multi-credential flow ships.
4. **Tested at the boundary (R6).** A cross-boundary seam test (real `profile-v2` adapter, not mobile
   fixtures) is PR-gated in CI.

No `IDENTITY_V2_ENABLED` flag returns; the contract is enforced by tests + the constraint.

---

## 3. Target environment triple

| | dev | staging | prod | CI |
|---|---|---|---|---|
| Today | full legacy schema + data | orphan `subscriptions` (42 rows), else v2 | v2-only (empty) | journal-built → matches no env |
| Target | **v2-only (RULED: converge)** | v2-only | v2-only (unchanged) | builds the real (prod) schema |

Freeze-only terminal migrations (`_freeze-only/0117/0118/0119`) promoted into the journal as catalog-gated
forward migrations applied to every env, so `drizzle-kit migrate` reproduces prod and CI stops testing a
phantom schema (R3). prod pre-drop PITR marker confirmed intact (`pre-subscriptions-drop-20260618`, `ready`).

---

## 4. The ordered collapse — milestones, gates, owners, reversibility

Legend: **Rev** = reversible (git revert / OTA re-promote) · **IRREV** = irreversible (needs explicit human
confirmation + recorded rationale). Owners: **J** = Jörn (identity/backend/DB) · **Z** = Zuzka (shell/mobile/
product) · **fleet** = mechanical agent execution under gates.

| M | Milestone | Entry gate | Exit gate | Owner | Rev |
|---|---|---|---|---|---|
| **M1** | **Harden the seam** — caller-bound authority (R1), close switch-bypass (R2), one-membership DB constraint (R8), flag-combo ratchet (R9) | **IMMEDIATE (RULED)** — not gated on pause or cutover | red-green break test for the B-1 exploit passes; ratchet green | J + Z | Rev |
| **M2a** | **Cutover: journal-prep** — author the catalog-gated forward migrations (repoint + drops) after the current journal tail | M1 not required | migrations authored, typecheck green, immutability guard satisfied | J | **Rev** |
| **M2b** | **Cutover: env-apply** — apply the chain to dev/stg/CI (prod already applied), converge all to v2-only | M2a done | **per-env: fresh PITR marker + live-catalog spot-check + human-confirm** before each destructive apply | J | **IRREV** (catalog drops / journal promotion) |
| **M3** | **Strip legacy** — tag current tree, delete dead legacy subtree + legacy schema defs (779 direction) | M2b green + tag pushed | typecheck + integration green on stripped tree; resurrection-500 surface gone | J + fleet | Rev (tag/revert) |
| **M4** | **Prove the V1 fallback** — build a `V2=off/V1=on` channel/artifact; a **real V2-off/V1-on E2E pass** | M1 done | E2E green on the fallback artifact; artifact/channel is release-ready | Z + J | Rev |
| **M5** | **Retire V0 — BEFORE SHIP (RULED)** — remove flags-off + V0 behind a tag; V1 (M4) is now the sole net | **M4 proven** (a rollback must exist first) + explicit human irreversibility confirm | V2 default + V1 fallback are the only reachable configs; no V0 path | Z + J | **IRREV** |
| **M6** | **Ship V2** | M1 + M4 + M5 done; 3 open WS-28 items closed/deferred with owners; seam smoke PR-gated | 7 publish-critical prompts green (already are) + fallback proven (M4) | Z (scope) + J | Rev (unship = OTA) |

**Chain:** M1 (now, parallel) · M2a→M2b→M3 (DB/code collapse) · M4→M5→M6 (prove-fallback → retire-V0 →
ship). M4 gates both M5 and M6 — you never remove V0 or ship V2 without a proven rollback.

### Flag truth-table (the R9 ratchet — the only sanctioned build states)

| Profile | `MODE_NAV_V0` | `MODE_NAV_V1` | `MODE_NAV_V2` | Renders | Status |
|---|---|---|---|---|---|
| **Config T** | off | on | on | V2 shell (V2 wins; V1 contract underneath) | sanctioned target |
| **Config F** | off | on | off | V1 shell | sanctioned fallback — **must be built + E2E-proven (M4)** |
| Legacy (prod today) | on | off | off | V0 shell | **retirement target** — sanctioned only until M5, then banned |
| any other combo | — | — | — | — | **BANNED** (esp. `V2=on/V1=off` → V2 tabs over legacy contract; and any `V0=on` with V1/V2 on) |

The ratchet test fails CI on any build/env whose flag triple is not one of the three sanctioned rows (and the
legacy row is time-boxed to pre-M5). Encodes the hard **V2⇒V1 dependency** (V2 on requires V1 on).

**Standing guardrails:** the irreversible gate (M2b + M5 + any V0/V1-reachable destructive delete stay on
explicit human confirm); no new config (no third shell arm, no new identity flag, no "preserve live" without
a named retirement date).

---

## 5. Relationship to existing plans (what Phase B reconciles)

The spine sits **above** the canonical plan, phase plans, dossiers, and identity runway docs; conflicts are
bugs in those. Two baked-in corrections (the canonical plan is stale on both): the **supporter gap is closed**
(not the blocker); the **cutover is done at the live-code level** (remaining work is convergence + deletion).
**Phase B** classifies every open Cosmo item against this spine — keep / re-sequence / close / capture —
retaining refinement wherever an item survives, writing off only map-obsoleted work.

---

## 6. Ruled decisions (operator, 2026-07-02)

1. **V0 retirement timing → RETIRE BEFORE SHIP.** M5 precedes M6, gated on M4 (a proven fallback).
2. **F=V1 retention → through launch + stability window** (eventual V1-only is post-launch, out of scope).
3. **dev target → converge to v2-only** (M2b applies to dev).
4. **M1 timing → immediate** — starts now, independent of the pause and the cutover.

---

## 7. One-paragraph summary

Collapse the matrix to **two configs on the v2 backend** — V2 (target) and V1 (fallback) — by **subtraction**:
harden the seam into a caller-bound contract (M1, now), finish the cutover's journal-prep then gated env-apply
(M2a/M2b), strip dead legacy behind a tag (M3), **build and prove the V1 rollback artifact (M4)**, retire V0
before ship (M5, gated on a proven rollback), and ship V2 with the supporter gap already closed (M6). Preserve
retired versions as git tags; enforce the three-row flag truth-table; and move fast on the *reversible* work
— but note that **zero production users lowers customer-risk, not release/infra rollback risk**: CI schema
fidelity, migration-history immutability, the PITR window, and the fallback artifact are not free, and their
gates (M2b, M4) hold regardless of the empty user table.
