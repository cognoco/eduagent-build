# 08 — The Convergence Spine (DRAFT for operator sign-off)

**Status:** DRAFT — Phase A output. Not yet authoritative. On sign-off, this becomes the single
architecture both the identity and front-end halves obey, and Phase B re-baselines Cosmo against it.
**Owner:** Jörn (aligns with Zuzka). **Anchor:** `origin/main` 145e74d5e-era; findings from `06-fable-audit.md`.
**Promotion path on sign-off:** this is ADR-class (contested, hard-to-reverse, cross-cutting) → promote to an
`MMT-ADR` + update `docs/architecture.md`, per the repo's decisions-layer gate. Until then it lives here.

---

## 0. Why this document exists

Two initiatives — Identity Foundation/Cutover (backend) and the V0/V1/V2 front-end work — advanced in
parallel with **no shared architecture**. The front-end rebased on identity changes as they landed; nobody
owned the cross-product. The result is a matrix (shell-generation × identity-generation × DB-generation)
where **no environment runs a verified target triple**, plus a large dead legacy subtree and a seam that was
never designed. There is no shortage of plans (dossiers, phase plans, a canonical plan, ADRs); there is a
shortage of **one** plan both halves obey. This is that plan.

Its job is as much **social as technical**: a single owned contract that stops the *next* parallel
divergence. Where any other plan conflicts with this, **this wins**, and the conflict is a bug in the other
plan to be fixed, not a fork to be tolerated.

---

## 1. Target end-state — two supported configs, nothing else

The collapse target is exactly **two** owned, tested configurations, both on the **v2-identity backend**:


|              | **Config T (target / MVP)**                                                            | **Config F (fallback)**                                 |
| ------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Shell        | V2 — "mentor-is-the-app" (Mentor / Subjects / Journal)                                | V1 — the`resolveNavigationContract` engine             |
| Backend      | v2-identity (person/organization/membership/subscription/…)                           | **same** v2-identity backend                            |
| Selection    | `MODE_NAV_V2_ENABLED` on (default)                                                     | flag-reachable (V2 off, V1 on)                          |
| Purpose      | what ships to users                                                                    | instant rollback without a redeploy                     |
| Status today | live on preview/staging; supporter half**already shipped** (WI-1170/1171 closed to AC) | **already works** — preview/staging run V1-on-v2 today |

**Not in the target — retired as releases, not preserved as live code:**

- **V0 shell** + the flags-off legacy shell.
- The **dead legacy-identity subtree** (`services/profile.ts` dead exports, `billing/family|tier|quota-*| revenuecat|subscription-core`, `consent.ts` DB fns, `solo-progress-reports.ts`, `deletion.ts`, legacy
  webhook handlers) and the legacy schema defs.
- The legacy identity **DB tables** everywhere they still exist (dev's full legacy schema; stg's orphan
  `subscriptions`).

**Operating principle (ratified with operator):** *preserve old versions as tagged git releases, not as
live code.* Git is the version-preservation system; you never lose the ability to resurrect a retired shell,
so nothing needs to stay alive "to be safe." **Two flag arms only** (V2 default, V1 fallback); **no
unsanctioned flag combos** (see §4 guardrail).

> **Not splitting into two apps.** Measured: the shells share 86% of screens (83/97 route files) + the entire
> non-UI stack; V2-specific code is ~5 files. A split duplicates or re-packages the wrong 86%, doubles every
> pipeline, and makes rollback *worse* (binary-swap vs flag-flip). One app, two flag arms, is the target.

**F's lifespan is a deliberate keep, not a permanent commitment.** V1 stays flag-reachable through launch +
a stability window (your "perfect world: V1 still works against the v2 backend"). Whether V1 is *eventually*
also retired to leave V2-only is a **post-launch decision**, explicitly out of scope for this collapse.

---

## 2. The seam contract — promote the accident to a design

The shell never consumed identity-v2 directly. It consumes a **legacy-shaped profile DTO synthesized from
identity-v2** (`listProfilesV2` / `getPersonScope` / `getProfileV2` / `loadProfileRowByIdV2` in
`services/identity-v2/profile-v2.ts`). This synthesis layer is the **only** place the two systems touch, and
every materialized incident (WI-1255 deletion-500, WI-1161 export-500, WI-1138 consent leak) happened there.
The spine makes it a **named, owned, tested contract** with four clauses:

1. **Shape.** identity-v2 provides the shell a stable `Profile` DTO: `{ id, isOwner, role, displayName, birthYear, conversationLanguage, consentStatus, linkedChildIds, … }`. This shape is the contract; changes
   to it are contract changes (versioned, both-halves-reviewed), not silent adapter edits.
2. **Authority is caller-bound, never shape-bound (fixes R1 — the top risk).** Owner/write authority on
   every `/account/*` and `/billing/*` endpoint MUST derive from the **server-resolved `callerPersonId`**
   (via `verifyPersonOwnershipV2`), **not** from the client-supplied `X-Profile-Id` shape's `isOwner`. The
   codebase's own canon (`ownership-v2.ts`) already says the membership-derived check is "the IDOR this guard
   exists to deny"; today only settings + learner-profile self-writes obey it. The contract makes
   caller-bound authority mandatory across the owner-gated surface. Also close R2 (the `/profiles/switch`
   owner-elevation reverification must not be bypassable by a direct `X-Profile-Id` to owner endpoints).
3. **Invariant: one org = one household, enforced by constraint (fixes R8).** Holds today by construction
   (single membership per person, server-derived org) but only by convention + a login-resolve guard — **not**
   by the DB. Add a DB-level one-membership-per-person constraint before any invite / claim / multi-credential
   flow ships, so a future path cannot arm the `!isOwner`-filter cross-family leak.
4. **Tested at the boundary (fixes R6).** A cross-boundary seam test (the real `profile-v2` adapter, not
   mobile fixtures) is **PR-gated in CI** — today the only real coverage is opt-in staging-Playwright, so an
   adapter drift is caught by neither system's unit suite.

**No `IDENTITY_V2_ENABLED` flag returns.** The cutover is a hardcoded source-level commit; the contract is
enforced by tests + the constraint, not a runtime toggle.

---

## 3. Target environment triple


|            | dev                                    | staging                                  | prod                      | CI                                 |
| ---------- | -------------------------------------- | ---------------------------------------- | ------------------------- | ---------------------------------- |
| **Today**  | full legacy schema + data + legacy FKs | orphan`subscriptions` (42 rows), else v2 | v2-only (cleanest, empty) | journal-built →**matches no env** |
| **Target** | v2-only                                | v2-only                                  | v2-only (unchanged)       | **builds the real (prod) schema**  |

Target: the freeze-only terminal migrations (`_freeze-only/0117/0118/0119`) are **promoted into the journal**
as catalog-gated forward migrations applied to **every** env, so `drizzle-kit migrate` reproduces prod from
the journal and CI stops testing a schema nothing runs (fixes R3). prod's pre-drop Neon PITR marker is
confirmed intact (`pre-subscriptions-drop-20260618`, `ready`), so the drop path is recoverable.

---

## 4. The ordered collapse — milestones, gates, owners, reversibility

Legend: **Rev** = reversible (flag flip / git revert / re-add) · **IRREV** = irreversible (needs explicit
human confirmation). Owners: **J** = Jörn (identity/backend/DB/cutover) · **Z** = Zuzka (shell/mobile/product)
· **fleet** = mechanical agent execution under gates.


| M      | Milestone                                        | Work                                                                                                                                                                 | Entry gate                                                                                | Exit gate                                                                      | Owner                             | Rev                       |
| ------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------- | ------------------------- |
| **M1** | **Harden the seam** (do first — blocks nothing) | Route owner-gates through`callerPersonId` (R1); close switch-bypass (R2); add one-membership DB constraint (R8); add flag-combo ratchet test (R9)                    | none — start now                                                                         | red-green break test for the B-1 exploit passes; ratchet green                 | J (auth/constraint) + Z (ratchet) | Rev                       |
| **M2** | **cutover-go — finish the cutover**             | Land reader-convergence (WI-1239); confirm WI-1254 sweep has a completion gate; promote freeze migrations to one journaled catalog-gated chain across dev/stg/prd/CI | M1 not required                                                                           | CI DB == prod;`drizzle-kit migrate` reproduces prod; dev+stg converged v2-only | J                                 | Rev (per-env, pre-launch) |
| **M3** | **Strip legacy (release-not-code)**              | Tag current tree; delete dead legacy subtree + legacy schema defs (WI-1139 / the 779 direction)                                                                      | M2 green + tag pushed                                                                     | typecheck + integration green on stripped tree; resurrection-500 surface gone  | J + fleet                         | Rev via tag/revert        |
| **M4** | **Collapse the shell ladder**                    | Retire flags-off + V0 behind a tag; leave V1 as the single flag fallback (Config F)                                                                                  | **§13.1 V0-retirement ruling (Z/product)** + explicit human irreversibility confirmation | V2 default + V1 fallback are the only reachable configs; no V0 path            | Z + J                             | **IRREV** (S6)            |
| **M5** | **V2-ship**                                      | Close/defer the 3 open WS-28 items with owners; reconcile the canonical plan doc; seam smoke PR-gated                                                                | M1 done (seam hardened)                                                                   | 7 publish-critical prompts green (already are) + a real V2-flag E2E pass       | Z (scope) + J (M1)                | Rev (unship = flag)       |

**Milestone independence worth noting:** M1 (seam hardening) and M5 (ship-readiness) do **not** depend on the
cutover being finished. R1 especially should not wait — it converts to a live IDOR the instant a second
credential enters any org. M2→M3→M4 is the DB/code/shell collapse chain.

**Guardrails (standing, not milestones):**

- **Irreversible gate** — S6 deletions, the terminal drop promotion, and any V0/V1-reachable destructive
  delete stay blocked on explicit human confirmation. M4 is the only IRREV milestone; everything else is a
  flag flip or git revert.
- **Flag-combo ratchet (R9)** — a test that fails on any unsanctioned nav flag state (e.g. the current
  dead-zone: `MODE_NAV_V2_ENABLED` doesn't feed `resolveNavigationContract`, and V2's subscription fetch is
  gated on `V1_ENABLED`, so V2-on/V1-off renders V2 tabs over legacy contract). Only {V2-on/V1-on,
  V2-off/V1-on, legacy-off} are sanctioned.
- **No new config** — no third shell arm, no new identity flag, no "preserve this version live" without a
  named retirement date.

---

## 5. Relationship to existing plans (what Phase B reconciles)

The spine sits **above** the canonical plan (`2026-06-30-v2-publish-readiness-canonical-plan.md`), the phase
plans (`docs/plans/v2-plan/`), the dossiers (`docs/plans/v2-dossier/`), and the identity runway docs. Where
they conflict, the spine wins. Two specific corrections the spine bakes in (the canonical plan is stale on
both):

- The plan calls the **supporter gap** the "critical publish blocker." It is **closed** (WI-1170/1171 shipped
  to their ACs). The blocker language is retired.
- The plan treats the **cutover** as the terminal gate. It is **done at the live-code level**; what remains is
  env/CI convergence + deletion (M2/M3), which is cleanup, not construction.

**Phase B** classifies every open Cosmo item against this spine into: on-spine-keep / on-spine-resequence /
off-spine-close / spine-missing-capture / triage — producing the re-baselined pipeline. Refinement is
retained wherever an item survives; only map-obsoleted work (supporter-gap-build, V0-preservation) is written
off, deliberately.

---

## 6. Open decisions the spine forces (for Jörn)

These are genuine forks the spine cannot resolve for you; they change M4/M5 and the Phase B classification:

1. **V0 retirement timing (§13.1 ruling).** M4 is IRREV and gated on your ruling + Zuzka's product sign-off.
   When does V0 retire — before ship (cleaner target, but a hard commit) or after a V2 stability window on
   real users? This gates M4 and buckets every V0-touching Cosmo item.
2. **F=V1 retention horizon.** Confirm V1 is kept flag-reachable through launch + stability window (my
   assumption), vs a shorter/longer horizon. Affects whether V1-specific maintenance items are on-spine.
3. **dev target.** Converge dev to v2-only (parity, M2) vs leave dev on legacy for some workflow reason.
   The spine assumes converge; confirm.
4. **M1 timing.** I recommend M1 (esp. R1 authority-key) starts immediately, independent of the pause and the
   cutover. Confirm it's not gated behind Phase B.

---

## 7. One-paragraph summary

Collapse the matrix to **two configs on the v2 backend** — V2 (target) and V1 (fallback) — by **subtraction**:
harden the seam into a named caller-bound contract (M1), finish the cutover's env/CI convergence (M2), strip
the dead legacy behind a tag (M3), retire V0 on your ruling (M4, the only irreversible step), and ship V2 with
the supporter gap already closed (M5). Preserve retired versions as git tags, not live code; enforce two flag
arms and no unsanctioned combos; and do it now, aggressively, because pre-launch with zero users is the
cheapest this cleanup will ever be.
