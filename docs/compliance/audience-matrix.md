# Audience Matrix — UI Navigation & Gating Inventory

**Status:** Refreshed 2026-08-01 against `origin/main` @ `764748015` (WI-2656). All
file:line citations below were re-verified on that commit. The 2026-05 scaffold
inventory this file used to carry is retired; its findings register (F1–F14) is
re-derived below with per-finding disposition.

**Authority:** `AGENTS.md` ("Profile Shapes" section) and the live code —
`apps/mobile/src/lib/navigation-contract.ts`, `apps/mobile/src/lib/legacy-navigation-contract.ts`,
`apps/mobile/src/hooks/use-navigation-contract.ts` — are the current authority for
navigation/gating behavior. Where any document (including this one) disagrees with
the code at `origin/main`, the code wins. The archived spec
[`docs/_archive/specs/Done/2026-05-21-navigation-contract.md`](../_archive/specs/Done/2026-05-21-navigation-contract.md)
is **historical provenance only** — it describes the design rationale of the
then-pending contract migration, which has since landed. It is never a statement
of current or target behavior.

> **Scope boundary (2026-07-23, unchanged):** this is a product-audience/navigation
> gating inventory, not the country/consent matrix. Product age bands, national
> Article 8 thresholds, and launch-country eligibility live in
> [`docs/compliance/2026-07-23-13-plus-eea-launch-country-ruling.md`](2026-07-23-13-plus-eea-launch-country-ruling.md).
>
> **V0 non-regression boundary (ruled 2026-06-09, still standing).** All currently
> shipped flag states — the flags-off legacy shell, the V0 mode shells, and the
> V1/V2 shells — must not regress across any nav PR until the V0-retirement ruling
> (`docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md` §13, owner: product)
> is executed at its S6 milestone. The legacy helpers
> (`apps/mobile/src/lib/legacy-navigation-contract.ts`) and the flags-off
> short-circuits in `app-context.tsx` stay alive. The resolver itself
> (`resolveNavigationContract`) runs under **every** flag state
> (`useResolvedNavigationState`, `use-navigation-contract.ts:63-122`); what is
> flag-gated is which output consumers use — `resolveShellVisibleTabs()` selects
> contract vs legacy tab sets on `MODE_NAV_V1_ENABLED`, and `useEntryGate` falls
> back to the proxy-only check when V1 is off — so the legacy fallback is never
> replaced.

## Related documents

- [`docs/flows/mobile-app-flow-inventory.md`](../flows/mobile-app-flow-inventory.md) —
  "Navigation shell matrix" (audience × flag-state, per-row citations) and the V2
  shell section. Note its "shipped today" flag table was captured 2026-07-19 and
  predates the 2026-07-27 production flag flip recorded below.
- [`docs/flows/flow-master-directory.md`](../flows/flow-master-directory.md) — flow
  register; flow pages cite this matrix when they touch a gated surface.
- `AGENTS.md` — "Profile Shapes" is the short-form authority for tab shapes and
  gating rules. Its inline flag snapshot ("as of 2026-06-09") also predates the
  2026-07-27 flip; per its own instruction, read the per-environment flags from
  `apps/mobile/eas.json` rather than any doc snapshot, including this one.
- `_wip/mvp-roadmap/2026-07-23-doc-drain-assessment.md` — the staleness finding
  (gap #1) that triggered this refresh.

---

## Navigation system as implemented

One function owns UI navigation gating: `resolveNavigationContract(context)` in
`apps/mobile/src/lib/navigation-contract.ts:602-643`. It composes:

- `resolveShape()` (`navigation-contract.ts:276-362`) — picks shape
  (`study`/`family`), effective app context, and the visible tab set, with a
  diagnostic `reason` enumerating every branch (`profile-loading`,
  `legacy-v0-flags-off`, `v1-disabled`, `parent-proxy`, `child-study-only`,
  `explicit-family`, `family-intent-without-family-links`,
  `profile-default-family`, `explicit-study`).
- `resolveGates()` (`:364-439`) — the `gates.*` booleans consumed inside screens
  (`showBilling`, `showAccountSecurity`, `showExportDelete`, `showAddChild`,
  `showRemoveFamilyMember`, child-editor gates, `sessionIsOwner`,
  `progressScope`, …).
- `resolveCanEnter()` / `resolveIsSurfaced()` (`:457-527`, `:529-584`) — deep-route
  entry and surfacing predicates, including the parent-proxy short-circuit
  (`:469-471`) and the `V2_ROUTES` gate (`:473-475`).
- `resolveChrome()` (`:586-600`) — ModeSwitcher / proxy-banner visibility.

The hook layer (`apps/mobile/src/hooks/use-navigation-contract.ts`) resolves the
contract once (`useResolvedNavigationState`, `:63-122`) and exposes it via
`useNavigationContract()`, `useNavigationShellContract()` (tab bar),
`useNavigationHomeContract()`, and `useNavigationDataScopeContract()`.

### Tab sets (all four, plus the V2 override)

V1 sets in `navigation-contract.ts`:

| Set | Tabs | Source |
|---|---|---|
| `STUDY_TABS` | home, library, progress, more (4) | `navigation-contract.ts:153-158` |
| `FAMILY_TABS` | home, recaps, progress, more (4) | `navigation-contract.ts:159-164` |
| `PROXY_TABS` | home, library, progress (3 — no More tab) | `navigation-contract.ts:165-169` |
| `LEGACY_GUARDIAN_TABS` | home, own-learning, library, progress, more (5) | `navigation-contract.ts:170-176` |

Legacy/V0 sets in `legacy-navigation-contract.ts`: `GUARDIAN_TABS` (5, `:4-10`),
`LEARNER_TABS` (4, `:12-17`), `PARENT_PROXY_TABS` (3, `:19-23`),
`FAMILY_MODE_TABS` (3, `:25-29`), `STUDY_MODE_TABS` (4, `:31-36`). Which family
resolves is decided by `resolveShellVisibleTabs()`
(`legacy-navigation-contract.ts:153-185`): contract `visibleTabs` when V1 is on,
legacy sets when V1 is off.

**V2 is a hard tab-visibility override, independent of the shape resolution:**
when `MODE_NAV_V2_ENABLED` is true, `useNavigationShellContract()`
(`use-navigation-contract.ts:192-203`) returns the fixed 3-tab
`V2_TABS = {mentor, subjects, journal}` set (`:22`) for **every** audience —
solo, child, supporter, and parent-proxy alike. `V2_ROUTES` in
`navigation-contract.ts:178` gates only `canEnter`/`isSurfaced` for those three
route names; the hook-level override is what the UI renders from. The V2 shell's
audience distinctions collapse for tab visibility but persist as *scope*
(me / person / supporter-hub via `useScopeContext`) — see
`docs/flows/mobile-app-flow-inventory.md` → "V2 Shell".

### Flag wiring and per-build-profile posture

Flags are **build-time**: `MODE_NAV_V0_ENABLED = EXPO_PUBLIC_ENABLE_MODE_NAV === 'true'`,
`MODE_NAV_V1_ENABLED = ..._V1`, `MODE_NAV_V2_ENABLED = ..._V2`
(`apps/mobile/src/lib/feature-flags.ts:30-32`). They intentionally differ by
environment. **Never treat any row below as "the default"** — read the values for
the build profile in question. As read from `apps/mobile/eas.json` and
`.github/workflows/ci.yml` on 2026-08-01:

| Build profile | V0 | V1 | V2 | Classification (R9 ratchet, `scripts/check-mode-nav-flag-combo.ts`) |
|---|---|---|---|---|
| `production` (`eas.json:12-18`) | off | on | on | **Config T — sanctioned target** (flipped 2026-07-27, commit `09fe6671d`, WI-1341) |
| `development` (`eas.json:25-31`) | on | on | on | Banned combo, grandfathered (`scripts/mode-nav-flag-combo-baseline.json`) |
| `preview` (`eas.json:43-49`) + preview-channel OTA (`.github/workflows/ci.yml:728-730`) | on | on | on | Banned combo, grandfathered |
| `fallback` (`eas.json:57-63`) | on | on | off | Banned combo, grandfathered |
| local example (`apps/mobile/.env.example:8`) | off | off | off | Flags-off legacy shell |

The `production` **build profile** is therefore configured for Config T — the
next production binary built from it carries the V2 3-tab shell. That is a
build-profile fact, **not release evidence**: flags are baked in at build time,
installed binaries do not change when `eas.json` does, and as of this refresh
the store-submission pipeline still records the production build/submission
steps as open (`docs/plans/2026-07-11-store-submission-pipeline.md`;
`docs/runbooks/store-submission.md` — approval alone does not build or release).
Treat Config T as the **production candidate** and classify real users by the
flag triple of the build they actually run — which may still be a pre-flip V0
binary. Earlier snapshots saying "production is V0-on/V1-off" (AGENTS.md's
2026-06-09 note, the flow inventory's 2026-07-19 table) describe the
pre-2026-07-27 profile state. The non-regression boundary above still protects
the flags-off and V0 shells regardless of which profile currently carries them.

### Mode semantics (V0 vs V1)

- **V1:** mode ("app context") is server-driven — `profile.defaultAppContext`,
  patched via `PATCH /profiles/:id/app-context`
  (`apps/api/src/routes/profiles.ts:397-451`, with explicit-header + ownership
  enforcement). Client-side, `app-context.tsx` holds a session `modeOverride`
  (`:63`) over the server-derived `derivedMode` (`:74`), cleared on active-profile
  change (`:103`).
- **V0:** mode is client-derived capability + local React state, never persisted.
- **Flags-off:** `familyCapable=false`, `mode=null` (legacy short-circuits in
  `app-context.tsx`).

---

## Where gating lives now (verified consumers)

The 2026-05 scaffold listed ~20 files with scattered raw `isOwner`/`role` reads.
That consolidation has landed: screens now read `navigationContract.gates.*` and
route entry goes through the contract. Representative current sites:

| Surface | Current mechanism | Cite (2026-08-01) |
|---|---|---|
| Tab bar composition | `useNavigationShellContract()` → contract `visibleTabs` / legacy sets / `V2_TABS` override | `use-navigation-contract.ts:151-211` |
| Home screen selection | `navigationContract.home.screen === 'FamilyHome'` → `ParentHomeScreen`, else `LearnerScreen` | `apps/mobile/src/app/(app)/home.tsx:166-167` |
| Deep-route entry (session, homework, dictation, quiz, practice, mentor-memory, topic/relearn) | `useEntryGate(route)` — `blocked = MODE_NAV_V1_ENABLED ? !canEnter(route) : isParentProxy` (flag branch is deliberate; see comment) | `apps/mobile/src/hooks/use-entry-gate.ts:14-33`; e.g. `mentor-memory.tsx:248` |
| Add child / remove family member | `gates.showAddChild`, `gates.showRemoveFamilyMember` | `more/index.tsx:58-81` |
| Billing / account security | `gates.showBilling`, `gates.showAccountSecurity`, `gates.sessionIsOwner` | `more/account.tsx:83-125` |
| Export / delete, withdrawal archive | `gates.showExportDelete`, `gates.showRemoveFamilyMember` | `more/privacy.tsx:25-26` |
| Subscription owner surface | `gates.showBilling`, `gates.showRemoveFamilyMember` | `subscription.tsx:197-198` |
| Progress proxy/picker | `gates.showProgressProfilePicker`; proxy discriminator flag-branches to contract vs legacy `role === 'impersonated-child'` | `progress/index.tsx:89, 329-331` |
| Family/child routes guard | `RequireFamilyContext` — **read-only** guard via `contract.canEnter(route, params)`; mode switch only via explicit user CTA (`useEnterFamilyMode`) | `components/guards/RequireFamilyContext.tsx:12-46` |
| Recaps / library / vocabulary entry | `navigationContract.canEnter(...)` redirects | `recaps/index.tsx:19`, `recaps/[recapId].tsx:32`, `library.tsx:151`, `progress/vocabulary.tsx:105` |
| Legacy own-learning tab | still uses legacy `resolveTabShape()` — sanctioned residual legacy read; the tab only exists in legacy/V0 shells | `own-learning.tsx:32-34` |
| Consent-state interception | shell-level, **above** the contract's output: pending-consent and withdrawn gates in the app layout | `apps/mobile/src/app/(app)/_layout.tsx:955-966` |

## UI navigation vs server authorization

The navigation contract is **client-side defense-in-depth UI hardening, not
authorization**. Server-side authorization is enforced independently and is the
authoritative layer:

- Profile mutations: `PATCH /profiles/:id` enforces owner-or-self
  ([CR-2026-05-19-H1], `apps/api/src/routes/profiles.ts:462`), rejects
  auto-resolved headerless identities ([Issue 901]), and resolves caller-to-target
  authority via `assertCanWriteProfile` (`profiles.ts:432, 492`).
- Data reads/writes: `createScopedRepository(profileId)` or parent-chain
  `profileId` WHERE enforcement (repo-wide rule, `AGENTS.md` → "Non-Negotiable
  Engineering Rules").
- Owner-gated billing operations enforce the constraint server-side:
  `GET /subscription` (403 for non-owners, BUG-644,
  `apps/api/src/routes/billing.ts:128-140`), checkout (`:270`), cancel
  (`:365-370`), top-up purchase (`:469-477`), billing portal (`:786-794`).
  **Exception:** `GET /usage` (`:541`) is deliberately *not* owner-gated — it
  serves non-owner viewers a self-scoped response and masks family-wide
  aggregates (`:674-738`; see `docs/flows/mobile-app-flow-inventory.md` quota
  model). Do not treat `/usage` as owner-only in authorization reviews. The
  client `gates.showBilling` is intentional defense-in-depth duplication (see
  the comment at `more/account.tsx:119-124`).

A green navigation-contract test is therefore **not** evidence about server-side
authorization, and vice versa. Findings below are labeled by layer.

---

## Findings register F1–F14 — re-derived 2026-08-01

The F-numbers originated in a lost 2026-05-21 audit and were scaffolded from a
dangling-commit reconstruction (see Provenance). Each is now either re-derived
against current code or explicitly retired. "Resolved" means the condition the
finding described no longer exists at the cited location; it is not a claim that
adjacent risks are gone.

| ID | Layer | Original concern | Disposition (2026-08-01) |
|---|---|---|---|
| F1 | Server | IDOR on `PATCH /profiles/:id` — a child profile could edit sibling profiles. | **Resolved.** Owner-or-self enforcement + headerless-identity rejection + `assertCanWriteProfile` (`apps/api/src/routes/profiles.ts:452-492`). The app-context PATCH (`:397-451`) carries the same guards. |
| F2 | Shell (above contract) | Consent-state interception is shell-level, not a contract dimension. | **Still current, by design.** Pending-consent and withdrawn full-screen gates live in `(app)/_layout.tsx:955-966`, above the contract's output. Folding consent into the contract remains not-planned; treat consent gating as a separate layer when auditing. |
| F3 | UI | Mentor-memory proxy redirect used a raw `isParentProxy` read. | **Resolved.** Entry now goes through `useEntryGate('mentor-memory')` (`mentor-memory.tsx:248`; `use-entry-gate.ts:14-33`). Remaining `navigationContract.isParentProxy` reads in that screen are in-screen content/pending-state branches, not the entry gate. |
| F4 | — | Reserved slot; content never recovered from the lost audit. | **Retired.** No recoverable claim; nothing to re-derive. Do not cite F4. |
| F5 | UI | `isOwner` content gating duplicated across ~13 sites with no single source of truth. | **Resolved.** Consolidated into `resolveGates()` (`navigation-contract.ts:364-439`); consumers read `gates.*` (see consumer table above). |
| F6 | — | Analytics-tag `isOwner` reads misflagged as gates. | **Retired (non-finding).** `subscription.tsx:208, 216` still write `is_owner` analytics properties; they remain analytics-only, not gates. |
| F7 | UI | Mentor-memory "Set by parent" copy variation misread as a visibility gate. | **Retired (non-finding).** The copy branch survives (`mentor-memory.tsx:491`, on `isOwnerSelf` ← `gates.sessionIsOwner` at `:71`) and is UX copy, not a gate. |
| F8 | UI | `RequireFamilyContext` mutated mode (`setMode('family')`) as a guard side effect. | **Resolved.** The guard is now explicitly read-only ([PARENT-03], `RequireFamilyContext.tsx:12-16`); mode changes require the explicit user CTA (`useEnterFamilyMode`). |
| F9 | UI/data | `mode` was React state only, not persisted; cross-account leak surface. | **Superseded (split).** Under V1, mode is server-persisted (`profile.defaultAppContext`, `profiles.ts:397-451`) with a session-only client override cleared on profile change (`app-context.tsx:63, 74, 103`). Under V0 (dev-zone profiles only), mode remains client-only until V0 retirement. Do not add storage-backed client persistence without re-reviewing the leak guarantee. |
| F10 | — | Pro tier treated identically to Family for navigation (BUG-899). | **Retired (misattributed).** The navigation contract is tier-blind by design — `familyCapable` derives from adult-owner + `hasFamilyLinks` (`navigation-contract.ts:220-223`), never tier — so there is no navigation-layer Family/Pro equivalence to track. The `tier === 'family' \|\| tier === 'pro'` read at `more/index.tsx:46` only enables the family-pool subscription query; it gates no navigation. BUG-899 itself is a billing guardrail (Family/Pro SKUs read-only unless already entitled — `docs/flows/master-directory/billing/BILLING-04.md`), tracked there, not here. |
| F11 | UI | Tab composition, deep-route guards, and home selection recomputed in ~10 files. | **Resolved.** Single resolution path: `useNavigationShellContract()` for tabs, `useEntryGate()` for deep routes, `home.tsx:166` for home selection. Residual sanctioned legacy read: `own-learning.tsx:32` (legacy-only tab). |
| F12 | UI (perf) | Contract hook must memoize on a stable signature, not array reference. | **Open (accepted).** `useResolvedNavigationState` memoizes with `profiles`/`activeProfile` references in the dep list (`use-navigation-contract.ts:78-112`), so a refetch-produced new array reference recomputes the contract. Resolution is a pure, cheap function — correctness is unaffected; this stays a perf note, not a gating bug. |
| F13 | — | Reserved slot; content never recovered. | **Retired.** Same as F4. |
| F14 | — | Reserved slot; content never recovered. | **Retired.** Same as F4. |

**Unresolved-by-anything items to carry forward:** F2 (consent stays a separate
shell layer — audit it separately) and F12 (memoization identity churn). Neither
is closed by the navigation contract, and a green contract test says nothing
about them.

---

## Re-verification checklist

Before citing this matrix in a PR or review:

1. Confirm the flag posture for the build profile under discussion from
   `apps/mobile/eas.json` / `.github/workflows/ci.yml` — not from any doc
   snapshot, including the table above.
2. Open the cited `file:line` sites; this file was verified against `origin/main`
   @ `764748015` (2026-08-01) and line numbers rot.
3. For gating questions, distinguish the layer: contract (`gates.*`,
   `canEnter`), shell consent interception (`_layout.tsx`), or server
   authorization (`profiles.ts`, scoped repositories).
4. Cross-check `AGENTS.md` → "Profile Shapes" and
   `docs/flows/mobile-app-flow-inventory.md` → "Navigation shell matrix"; where
   any doc disagrees with code, the code wins.

---

## Provenance

- **Original audit (2026-05-21):** lost — created in another agent's working tree
  and wiped by a stash cycle before any git operation captured it.
- **Reconstruction (2026-05-22):** scaffolded from dangling commit
  `e6287097a6fe4cfea03a82f77d7a2b22d46fc17b` (an earlier draft of the
  navigation-contract spec); F-numbering was inferred, never recovered.
- **Archived design rationale:**
  [`docs/_archive/specs/Done/2026-05-21-navigation-contract.md`](../_archive/specs/Done/2026-05-21-navigation-contract.md)
  — historical provenance for the contract's design; the migration it describes
  has landed.
- **This refresh (2026-08-01, WI-2656):** full re-audit against `origin/main`
  @ `764748015`; scaffold inventory retired, findings re-derived above.
  Triggered by `_wip/mvp-roadmap/2026-07-23-doc-drain-assessment.md` gap #1.
