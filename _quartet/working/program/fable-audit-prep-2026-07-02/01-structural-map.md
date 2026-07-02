# 01 — Structural Map: identity-v2, app-shell-v2, and the seam

Reality anchor: **FROZEN at `origin/main` = `145e74d5e`** (see `05-audit-response.md` § Frozen
Anchor for the delta). Recon began at ancestor `a52b8282f` (working tree HEAD `d843bf7bd` is behind;
identity-v2 deletion/consent files read from origin/main). Detailed sub-maps:
`artifacts/map-identity-v2.md`, `artifacts/map-appshell-seam.md`. DB evidence: `artifacts/*.txt`.

## 1. System boundaries

### identity-v2 (API + DB)
- **Schema:** `packages/database/src/schema/identity.ts` — **18 tables** (17 documented +
  undocumented `consent_request`, CUT-A). Family: `person, login, organization, membership,
  subscription, guardianship, supportership, consent_grant, consent_receipt, consent_request,
  deletion_audit, financial_record, subscription_payers` + policy-engine (`regimes, policy_cells,
  policy_rules, knowledge_assertions, allowed_models`).
- **Services (17):** `apps/api/src/services/identity-v2/` — account-v2, child-profile-v2,
  consent-status-v2, consent-v2, deletion-v2, export-v2, family-bridge-v2, family-v2,
  guardianship, helpers, identity-graph, identity-resolve, identity-v2-opts, onboarding-v2,
  ownership-v2, profile-v2, solo-progress-reports-v2.
- **Routes (identity-facing):** `routes/profiles.ts` (wired unconditionally to identity-v2
  adapters), `routes/consent.ts`, `consent-web.ts`, account/export/deletion routes.
- **No runtime flag:** `IDENTITY_V2_ENABLED` was deleted (WI-868). Call-site cutover; the
  historical flip-gate survives only in freeze-migration comments.
- **Inert surface:** policy-engine tables have **zero service consumers** (map-identity-v2).

### app-shell-v2 (mobile)
- **Nav engines:** `navigation-contract.ts` (V0/V1 gates — `resolveNavigationContract`),
  `legacy-navigation-contract.ts` (V0 `resolveTabShape`). **V2 is NOT a third engine** — the hook
  `use-navigation-contract.ts:185` short-circuits *presentation* to a fixed 3-tab
  `V2_TABS = {mentor, subjects, journal}` but reuses V0/V1 gates.
- **Flags:** `feature-flags.ts:30-33` — `MODE_NAV_V0/V1/V2_ENABLED`.
- **Specs:** `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md` (S0–S3 landed, S4/S5
  partial, S6 TODO), `2026-06-27-felt-knowing-loop.md` (draft/paper-only).

## 2. Data contracts (API → mobile)
- `/profiles` GET/POST/:id → `profileResponseSchema` (`packages/schemas`), served by identity-v2
  adapters (`listProfilesV2`/`getProfileV2`/`createChildProfileV2`). Fields the shell keys on:
  `isOwner` (derived `roles.includes('admin')`), `hasPremiumLlm` (hardcoded false), `birthYear`
  (sliced from `person.birthDate`), household `profiles[]`.
- Consent/visibility/scope routes feed the supporter surfaces (`routes/visibility.ts`,
  `scopes.ts`, `supporter-structural-mask.ts`).

## 3. Flag matrix (per build profile — source-cited)

| Profile / source | V0 | V1 | V2 | Rendered shell |
| --- | :--: | :--: | :--: | --- |
| `.env.example` (local) | false | false | false | none-on default |
| `eas.json` **production** (`:14`) | **true** | false | false | **V0 legacy** (5-tab guardian / 4-tab learner) |
| `eas.json` development (`:25-27`) | true | true | **true** | **V2** (3-tab) |
| `eas.json` preview (`:43-45`) | true | true | **true** | **V2** |
| `ci.yml` OTA/e2e-web (`:604-606`) | true | true | **true** | **V2** |

**Bottom line:** production app-store builds render **V0**; every JS-shipping channel else
renders **V2**. No profile runs V1-only. **Notable:** prod renders the *legacy V0 shell* on top
of a *v2-only identity DB* (§4).

## 4. Legacy → v2 dependency map

### DB (verified live, 2026-07-02)
| dimension | dev | stg | prd |
| --- | --- | --- | --- |
| legacy identity tables | all present + data | dropped | dropped |
| legacy `subscriptions` | present (8) | **orphan present (42, 0 FK)** | **dropped** |
| quota/usage FK targets | **legacy** (profiles/subscriptions) | v2 (person/subscription) | v2 |
| v2 parents row count | person 1353 | person 261 | **person 0 (empty)** |

### Migration sequence (out-of-journal freeze — `apps/api/drizzle/_freeze-only/`)
`M-REPOINT (0117)` repoint all live FK profiles→person, subscriptions→subscription →
`M-DROP (0118)` drop 4 legacy identity tables (WI-828 operator-executed) →
`M-SUBSCRIPTIONS-DROP (0119, WI-805)` drop `subscriptions` + 2 enums. Guard-enforced
de-journaling (`check-reference-only-migrations.mjs`). Applied per-env at different stages:
prd=0117+0119, stg=0117 only, dev=neither. `drizzle-kit migrate` from the journal does NOT
reproduce prod/stg (Q3).

### Schema-code lag
`billing.ts` still `.references(() => subscriptions.id)` for 4 quota satellites even where the DB
FK is on v2 — realignment deferred to WI-779. DB FK is source of truth.

### Code readers of legacy tables
→ **See `evidence/Q1-cutover-completeness.md`** (Sonnet sweep). Process-level: reader convergence
is an OPEN workstream (WI-1239 Executing, WI-1254 Ready); one live prod reader already caused an
incident (WI-1255).

## 5. Seam inventory (identity-v2 ↔ app-shell)
Full 6-row table with file:line in `artifacts/map-appshell-seam.md`; distilled in
`evidence/Q4-identity-app-shell-seam.md`. Headlines:
1. Shell spec §9 "person/membership don't exist in code" — **falsified**; shell already
   identity-v2-coupled unconditionally (Q4-F1).
2. `isOwner` derived, **fails open** into child-study-only (Q4-F4).
3. Identity-v2 tables have **no RLS backstop** → app-layer guards load-bearing (Q4-F3).
4. `linkedChildIds` org-vs-edge scoping — **unverified** cross-account-leak risk (Q4-F6).
5. `hasPremiumLlm` hardcoded false (Q4-F5).
6. 3 materialized seam bugs (WI-1255/1161/1138) (Q4-F7).

## 6. Open gaps (prep did not close — Fable leads)
- **`listProfilesV2` (`profile-v2.ts:449-476`) — READ at audit close:** org-scoped IDOR guard,
  then guardianship edges; `account.id = organization.id`. Residual = "one org = one household"
  invariant (SBF-005), not an unread path.
- **CI test-lane schema — RESOLVED (Q3-F6):** journal-built (`drizzle-kit migrate`, `ci.yml:131,496`)
  → matches no deployed env. Open only as a *decision* (waive or block?), not discovery. Determines
  whether integration tests match any deployed env.
- **prd pre-drop Neon PITR marker** for 0119 — taken or not (rollback window).
- **WI-1128 full freeze-0117 promotion** — deploy-unblock slice landed (`56b9ded15`); full promotion still pending (freeze-only still out-of-journal).
- Legacy `services/profile.ts` still route-reachable? (Q1 + Q4 open-gap 3.)
- e2e-web seam specs CI-gated per PR? (repo memory says no — verify `ci.yml`.)
