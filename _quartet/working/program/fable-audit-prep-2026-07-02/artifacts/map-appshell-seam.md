# App-shell-v2 map + identity-v2 seam

> **⚠ PARTIALLY SUPERSEDED (2026-07-02 audit).** This sub-agent map is a raw first-pass input.
> Two "not read / not verified" items below were CLOSED afterward — do not re-spend on them:
> **Row 4 (`listProfilesV2` scoping)** → read: org-scoped IDOR guard (`profile-v2.ts:449-476`);
> reframed to the "one org = one household" invariant. See `evidence/Q4-*` Q4-F6.
> **e2e CI wiring** → verified: default smoke = auth/learner/parent; `mentor-audit-registry-smoke`
> is opt-in, not gated. See `evidence/Q4-*` and `05-audit-response.md` finding 5.
> Anchor: ancestor `a52b8282f`; bundle frozen at `145e74d5e`.

**Scope:** apps/mobile shell (V0/V1/V2 nav) + the seam to `apps/api/src/services/identity-v2/`.
**Reality anchor:** working tree HEAD `d843bf7bd` read directly (mobile paths untouched by the
5 commits separating it from `origin/main` `a52b8282f`); API identity-v2 files read from working
tree too (identity-v2 dir not in the 5-commit delta — confirmed via `rtk git show origin/main:apps/api/src/services/identity-v2/profile-v2.ts` diff-free assumption not re-verified byte-for-byte; flag if that matters).
Exclusions honored: did not open the two named strip-proposal files.

---

## App-shell-v2 map

### 1. Nav contract engines

- **V1/V0 engine** — `apps/mobile/src/lib/navigation-contract.ts`. `resolveNavigationContract()` (line 582) composes `resolveShape` (265) → `resolveGates` (353) → `resolveHome` (429) → `resolveChrome` (566) → `resolveCanEnter`/`resolveIsSurfaced`. Only reads `MODE_NAV_V0_ENABLED` / `MODE_NAV_V1_ENABLED` (`NavigationFlags` interface, line 66-69) — **no `V2` field exists on this type**. Tab sets: `STUDY_TABS` (151), `FAMILY_TABS` (157), `PROXY_TABS` (163), `LEGACY_GUARDIAN_TABS` (168).
- **V0 legacy engine** — `apps/mobile/src/lib/legacy-navigation-contract.ts`. `resolveTabShape()` (64) → `'guardian' | 'learner'` from raw `isOwner` + sibling non-owner profiles (56-62), independent of the V1 contract. `computeVisibleTabs()` (81), `computeModeVisibleTabs()` (95).
- **V2 is NOT a third engine.** `apps/mobile/src/hooks/use-navigation-contract.ts` `useNavigationShellContract()` (144-204): builds the V1/V0 `contract` exactly as before (flags object passed to `resolveNavigationContract` only carries V0/V1, line 89-92), then at line 185 `if (FEATURE_FLAGS.MODE_NAV_V2_ENABLED)` short-circuits the **presentation** (fixed `V2_TABS = {mentor, subjects, journal}` set at line 22, hardcoded home-tab labels) but keeps `contract` — i.e. all the `gates` (isOwner/family/billing/etc.) V2 screens read still come from the V0/V1 engine. **V2 has no gating logic of its own; it borrows V1/V0's gates and only overrides the tab chrome.**

### 2. Flag matrix (code + build config), with sources

Flag declarations — `apps/mobile/src/lib/feature-flags.ts:30-33`:
```
MODE_NAV_V0_ENABLED: EXPO_PUBLIC_ENABLE_MODE_NAV === 'true'
MODE_NAV_V1_ENABLED: EXPO_PUBLIC_ENABLE_MODE_NAV_V1 === 'true'
MODE_NAV_V2_ENABLED: EXPO_PUBLIC_ENABLE_MODE_NAV_V2 === 'true'
```

| Profile / source | V0 | V1 | V2 | Evidence |
|---|---|---|---|---|
| `apps/mobile/.env.example` (local dev default) | false | false | false | `.env.example:8` (only `EXPO_PUBLIC_ENABLE_MODE_NAV=false` present; V1/V2 vars absent → falsy) |
| `eas.json` build `production` | **true** | false | false | `apps/mobile/eas.json:14` (V1/V2 keys absent from this profile's `env`) |
| `eas.json` build `development` | true | true | **true** | `eas.json:25-27` |
| `eas.json` build `preview` | true | true | **true** | `eas.json:43-45` |
| `.github/workflows/ci.yml` OTA/e2e-web env | true | true | **true** | `ci.yml:604-606` |

**Bottom line:** production app-store builds render **V0** (5-tab legacy guardian shell / 4-tab learner shell, gated by `resolveTabShape`/`LEGACY_GUARDIAN_TABS`). Every other channel that ships JS (dev client, preview/internal APK+simulator, CI-driven OTA to preview channel, e2e-web smoke against staging) renders **V2** (3-tab Mentor/Subjects/Journal shell). There is no profile in this repo that runs V1-only (`V1=true,V2=false`) — V1 exists as an intermediate engine but every flag source that turns it on also turns on V2 in the same breath. Matches `AGENTS.md`'s "V0 status" note; confirmed at the flag-value level here, not re-derived from docs.

### 3. V2 shell — spec vs. implementing screens

- Spec: `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md`. Status line (3): **"S0-S3 landed behind `MODE_NAV_V2_ENABLED`... S4/S5 PARTIAL... S6 TODO... Production is still V0."** Matches the flag matrix above exactly.
- §3 rules three tabs, no exceptions (Mentor/Subjects/Journal) — matches `V2_TABS` in `use-navigation-contract.ts:22`.
- Implementing screens found by `MODE_NAV_V2_ENABLED` grep (non-test): `apps/mobile/src/app/(app)/_layout.tsx` (631, 637, 640, 660, 711 — chrome insets, ModeSwitcher suppression), `apps/mobile/src/app/(app)/_lib/auth-redirect.ts:6` (post-auth landing → `/(app)/mentor` vs `/(app)/home`), `apps/mobile/src/app/(app)/session/index.tsx:929` (entry-source gating), `apps/mobile/src/app/(app)/progress/[subjectId]/index.tsx:324`, `apps/mobile/src/app/(app)/shelf/[subjectId]/index.tsx:389`, `apps/mobile/src/app/(app)/subject-hub/[subjectId]/index.tsx:113` (back-target: `/subjects` vs `/library`).
- `docs/specs/2026-06-27-felt-knowing-loop.md`: **Draft / paper-only** (header line 2), sequences on top of the V2 Journal tab but nothing in it is implemented — treat as forward-looking shape reference only, not current code.
- **§9 "Identity coupling" of the shell spec is itself a seam artifact — see Seam Inventory row 1.**

---

## Flag matrix

(See table under App-shell-v2 map §2 — not duplicated here to avoid drift between two copies.)

---

## Seam inventory

| # | Shell consumes | identity-v2 provides | Match? | Risk | Evidence |
|---|---|---|---|---|---|
| 1 | Shell spec's own premise: S0-S3 (`GET /now`, ledger, subject hub, Journal split) are **identity-independent** — "no early phase reads or writes `person`/`edge`/`membership` tables, which **do not yet exist in code**" | `person`, `membership`, `guardianship` tables **do exist and are live**, wired unconditionally (no flag) into `GET /profiles`, `POST /profiles`, `GET /profiles/:id` via `apps/api/src/routes/profiles.ts:20-28,135,178,295` calling `listProfilesV2`/`getOwnerProfileV2`/`getProfileV2`/`createChildProfileV2`/`createIdentityGraph` | **MISMATCH** | **High.** The spec's stated identity-independence for S0-S3 is falsified by current code: the V2 shell's profile reads already flow through identity-v2's person/membership/guardianship model, unconditionally, for every caller — V2-flag or not. The shell team's own documented assumption ("no early phase reads person/edge/membership... if any S0-S3 deliverable needs one, it is misclassified") was written when those tables "do not yet exist"; they now do, and the shell already depends on them transitively through `/profiles`. This is the strongest evidence for "built separately, don't fit": the shell spec's phase-gating logic (§9, §11) is stale relative to the identity build state it was sequenced against. | `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md` §9 (lines under "## 9. Identity coupling"); `apps/api/src/routes/profiles.ts:20-28` imports, `:135,178,295` call sites; `apps/api/src/services/identity-v2/profile-v2.ts:19-26` imports `person`/`membership`/`guardianship` from `@eduagent/database` |
| 2 | `Profile.hasPremiumLlm: boolean` (schema field consumed structurally by `NavigationProfile` type in `navigation-contract.ts:61-64`, and populated into every profile object mobile receives) | `deriveHasPremiumLlm()` in `profile-v2.ts:100-102` — **hardcoded `return false`**, called at lines 125 and 345 (both `buildBootstrapProfile` and `getProfileV2`) | Structural match (field present), **semantic drift** | **Low-medium.** Field is present and type-correct, but v2 can never report `true` regardless of actual subscription tier — a permanent regression vs. whatever legacy `services/profile.ts` computed. Currently **contained**: grepped all non-test mobile source (`apps/mobile/src` excluding `*.test.*`) and found zero consumers of `hasPremiumLlm` outside test fixtures/factories — so no live shell behavior is wrong *today*, but any future code that starts reading this field (or a resurrected legacy comparison) will silently get `false` under V2. Comment at `profile-v2.ts:14-15` self-flags this as provisional ("served as the derived value until the mobile contract is revised"). | `apps/api/src/services/identity-v2/profile-v2.ts:14-15,100-102,125,345`; consumer grep: no hits in `apps/mobile/src/**/*.tsx` excluding `*.test.*` |
| 3 | `NavigationProfile.isOwner: boolean` — used pervasively: `isAdultOwner()` (`packages/schemas/src/age.ts:64-75`), `isFamilyCapable`, `getLinkedChildIds` (`navigation-contract.ts:195-212`), `resolveTabShape` guardian/learner split (`legacy-navigation-contract.ts:56-78`) | `getProfileV2`/`listProfilesV2`: `isOwner = row.roles.includes('admin')` (`profile-v2.ts:302` and equivalent in `listProfilesV2`) — role-based, not a stored `isOwner` column | Semantic match by design ("byte-identical" per file-header comment `profile-v2.ts:1-6`) but **new failure surface**: correctness now depends on `membership.roles` containing exactly one entry with `'admin'` per owner-mapped person, per organization. A person with zero or malformed `roles` silently reads as non-owner (fails closed for owner gates, fails OPEN for the `!activeProfile.isOwner` child-only branch at `navigation-contract.ts:317` — i.e. an owner with a broken roles row gets treated as a **child**, landing them in `child-study-only` shape, hiding billing/account/export-delete). | Medium | `profile-v2.ts:302` (`getProfileV2`), `:449` region (`listProfilesV2` — not individually re-read line-by-line, same pattern per file header); `navigation-contract.ts:317` |
| 4 | `linkedChildIds` derivation (`getLinkedChildIds`, `navigation-contract.ts:195-203`): `profiles.filter(p => p.id !== active.id && !p.isOwner)` — assumes the **flat `profiles[]` array returned to a single owner already contains only that owner's household** | `listProfilesV2` resolves guardianship edges per-person (`profile-v2.ts` imports `guardianship` table; `getProfileV2`'s single-profile path computes `hasFamilyLinks` from guardian/charge edges at lines 300-322) — the *list* endpoint's edge-scoping logic was not independently re-read line-by-line in this pass | Not verified | **Open gap, not a confirmed mismatch** — flag for direct verification: does `listProfilesV2` scope strictly to the caller's own guardianship edges, or (since `membership` is org-scoped, not edge-scoped) could two independently-guardianed children under the same `organizationId` both appear in one owner's `profiles[]`? If org-scoping is looser than edge-scoping, `getLinkedChildIds`'s "same org membership, not-owner" filter (mobile's implicit assumption baked into the `.filter` — it never checks a guardianship edge, only `!p.isOwner`) could leak a sibling-organization child into the wrong owner's family tabs. **This needs a direct read of `listProfilesV2` (`profile-v2.ts:449-580`, not opened this pass) before ruling.** | `navigation-contract.ts:195-203` (mobile side, confirmed no edge-check, only `!isOwner` + same-array membership); `profile-v2.ts:449` (`listProfilesV2` signature — body not read) |
| 5 | `resolveShape`'s legacy-V0 branch reads **both** `MODE_NAV_V0_ENABLED` and `MODE_NAV_V1_ENABLED` as booleans off `context.flags` (`navigation-contract.ts:66-69,278-280,294-296`) but the hook layer (`use-navigation-contract.ts:89-92`) **never passes `MODE_NAV_V2_ENABLED` into this object** | N/A — this is intra-shell, not identity-v2, but it's the mechanism by which V2's presentation layer (`useNavigationShellContract`, line 185) sits *outside* the gates engine | Confirmed by design (not a bug) | **Low, but load-bearing for row 1's argument.** Because V2 never reaches `resolveShape`/`resolveGates`, every gate a V2 screen reads (`showBilling`, `showFamilyHome`, `sessionIsOwner`, etc.) is whatever V0/V1 computed from the identity-v2-backed `Profile` object — meaning V2's screens inherit row 1-3's risks without any V2-specific mitigation layer of their own. | `use-navigation-contract.ts:89-92,185-196` |
| 6 | `computeAgeBracket(birthYear)` (`packages/schemas/src/age.ts:52-62`) driving consent/voice/theming across many mobile screens (`app-context.tsx`, `consent.tsx`, `mentor-memory.tsx`, etc. — see grep list) — takes a **`number` birthYear** | `Profile.birthYear` from `getProfileV2`: `Number(row.birthDate.slice(0,4))` (`profile-v2.ts:340`) — derived from a **full birth date** (`person.birthDate`), lossy-truncated to year string slice | Match (output type correct) | **Low.** Functionally fine (produces the same `number` shape), but note the *source* changed from a stored `birthYear` int (legacy) to a slice of a full date string — a locale/format mismatch in `person.birthDate` (e.g. non-ISO string) would silently misparse via `.slice(0,4)` rather than throw. No evidence found of an actual format bug; flagging as a fragility point, not a confirmed defect. | `profile-v2.ts:340`; `age.ts:52-62` |

---

## Missing integration tests

- **No test drives the V2 mobile shell against a live/seeded identity-v2 API response and asserts `resolveNavigationContract` gates come out correct.** Mobile unit tests (`navigation-contract*.test.ts`, `_layout.test.tsx`, etc.) all construct `Profile`-shaped fixtures by hand (`apps/mobile/src/test-utils/profile-factories.ts`) — they never exercise the real `profile-v2.ts` adapter, so row 1-4 risks above are not caught by the mobile test suite even if the API-side adapter drifts.
- **API-side identity-v2 tests** (`apps/api/src/services/identity-v2/profile-v2.test.ts`, `profile-v2.integration.test.ts`, `apps/api/src/routes/profiles.test.ts`) validate the adapter's output against `profileResponseSchema` (shape-correct) but — not independently re-read line-by-line this pass — likely do not assert mobile-specific *semantic* invariants like "an owner with roles=[] resolves to child-shape" (row 3) or the org-vs-edge scoping question (row 4). Flag for direct read if Fable wants adapter-test coverage confirmed.
- **Real cross-boundary coverage exists, but is staging-only and not CI-gated by default:** `apps/mobile/e2e-web/flows/mentor-audit/registry-smoke.spec.ts` (comment: "Release runs export the app with V2 enabled... via `--project=mentor-audit-registry-smoke`") and `apps/mobile/e2e-web/flows/journeys/j13-consent-pending-parent-approval.spec.ts` (asserts the Mentor feed renders post-consent-approval under the V2 nav posture) run Playwright against `doppler run -c stg` (per `AGENTS.md` Handy Commands and this spec's own comment) — i.e. against the real identity-v2-backed staging API. This is the only place shell-behavior-under-real-identity-v2-data is exercised end-to-end. Per repo memory (`project_playwright_e2e_setup.md`), this suite is **not** part of the default CI gate for every PR — confirm current CI wiring if Fable needs a definitive "does CI catch a seam regression" answer (not re-verified against `ci.yml` job triggers this pass).
- No test found asserting the `hasPremiumLlm` hardcode (row 2) against a real-tier profile — i.e. nothing would fail if a paying-tier owner's `hasPremiumLlm` silently reads `false` end-to-end.

---

## Open gaps

1. **Row 4 (linkedChildIds / org-vs-edge scoping in `listProfilesV2`)** — needs a direct read of `apps/api/src/services/identity-v2/profile-v2.ts:449-580` before this can be called a confirmed mismatch or ruled out.
2. **`profile-v2.integration.test.ts` and `family-bridge-v2.integration.test.ts` contents** — not read this pass; would materially strengthen or weaken rows 3/4's risk grading.
3. **Whether `services/profile.ts` (legacy) is still reachable from any live route** — `routes/profiles.ts` imports `updateProfileAppContext`, `ProfileValidationError`, `ProfileLimitError` from `../services/profile` (line 36-39) alongside the identity-v2 imports; unclear whether any GET/list path still falls back to legacy reads under some condition, or whether legacy is write-helper-only at this point. Bears on whether "identity-v2 cutover is complete for profiles" is a safe characterization for Fable.
4. **CI wiring for `apps/mobile/e2e-web`** — whether the seam-covering specs (registry-smoke, j13-consent-pending) run on every PR, nightly, or manually only. Not verified against `.github/workflows/ci.yml` job trigger conditions this pass (only confirmed the *env vars* those jobs would use, at `ci.yml:604-606`).
5. **Spec staleness beyond §9** — `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md` was last STATUS-stamped 2026-06-27; whether other phase-gating assumptions in §11 (Strangle sequencing) are similarly stale relative to identity-v2's actual build progress was not checked beyond §9.
