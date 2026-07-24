# Cycle Detector Agent

Whole-repo circular-dependency analysis of `/Users/vetinari/nexus/_dev/eduagent-build` (pnpm/nx monorepo). All findings are **[PRE-EXISTING]** per scope (no PR diff).

## Method

- `madge` was not installed locally; ran it via `npx --yes madge --circular --extensions ts,tsx` against `apps/api/src` + `packages` and against `apps/mobile/src` separately.
- Verified package-level deps from each `package.json` (internal `@eduagent/*` graph).
- For every cycle madge reported, manually inspected the closing import statements with `rg` to distinguish **runtime (value) edges** from **`import type` edges** that TypeScript erases at compile time (the latter do not form a runtime cycle and cannot cause initialization-order bugs).

## Package-level graph: clean (no cycles)

The inter-package dependency graph is a proper DAG:

- `@eduagent/schemas`, `@eduagent/retention`, `@eduagent/test-utils` — leaves (no internal deps)
- `@eduagent/database` → `schemas` (+ `test-utils` devDep)
- `@eduagent/api` → `database`, `retention`, `schemas` (+ `test-utils` devDep)
- `@eduagent/mobile` → `schemas` (+ `api`, `test-utils` as **devDeps**)

`mobile`'s dependency on `api` is **type-only** (`import type { AppType }` for the Hono RPC client), declared as a devDep and documented as an accepted exception in `CLAUDE.md` ("Known Exceptions to Engineering Rules"). It does not create a runtime package cycle. No action.

`apps/mobile/src` (869 files): **madge reports no circular dependency.** Clean.

---

### Cycle Detection Analysis

madge reported **8 cycles** in `apps/api/src`. After classifying each closing edge as runtime-value vs `import type`, they collapse to **3 genuine runtime cycles** plus **2 type-only (compile-erased) cycles**. All within `apps/api/src/services/`.

#### Direct Cycles Found

- **Cycle A: `consent.ts` ⇄ `notifications.ts`** (madge #3)
  - **Classification**: [PRE-EXISTING]
  - **Severity**: MEDIUM
  - `consent.ts:33-36` imports **values** `sendEmail`, `formatConsentRequestEmail` (+ `type EmailOptions`) from `./notifications`.
  - `notifications.ts:22` imports **value** `isGdprProcessingAllowed` from `./consent`.
  - Impact: A true runtime 2-cycle. Both modules are evaluated mid-initialization of the other; bundlers tolerate this only because the imported symbols are functions called later, not module-load-time values. Fragile to refactor — moving a top-level call or const that touches the partner symbol during module init would throw a `TDZ`/`undefined` error. Also makes the consent↔notifications pair effectively one unit for testing.
  - Suggestion: Extract the shared primitive. `isGdprProcessingAllowed` is a pure predicate over consent state — move it (and `calculateAge`, see Cycle B) into a dependency-free `consent-rules.ts` (or into `@eduagent/schemas`/a small `consent-core.ts`) that both `notifications.ts` and `consent.ts` import one-directionally. That removes the back-edge entirely.

- **Cycle B: `curriculum.ts` ⇄ `language-curriculum.ts`** (madge #6)
  - **Classification**: [PRE-EXISTING]
  - **Severity**: MEDIUM
  - `curriculum.ts:58` imports **value** `regenerateLanguageCurriculum` from `./language-curriculum`.
  - `language-curriculum.ts:9` imports **value** `ensureDefaultBook` from `./curriculum`.
  - Impact: True runtime 2-cycle. `language-curriculum` is conceptually a specialization that builds on the generic curriculum (`ensureDefaultBook`), while generic curriculum dispatches back into the language path (`regenerateLanguageCurriculum`). The back-dispatch is the smell.
  - Suggestion: Invert one direction. Either (a) have the caller of `regenerateLanguageCurriculum` (the orchestration site) decide language-vs-generic instead of `curriculum.ts` reaching forward into the language module, or (b) extract `ensureDefaultBook` into a shared `curriculum-core.ts` that `language-curriculum.ts` depends on, leaving `curriculum.ts → language-curriculum.ts` as the only edge.

#### Indirect Cycles Found

- **Cycle C (the big one): SCC `{settings, family-access, consent, notifications}`** (madge #1, #2, #5 are different entry-paths into this same strongly-connected component)
  - **Classification**: [PRE-EXISTING]
  - **Severity**: HIGH
  - Runtime back-edge chain that closes the loop:
    - `settings.ts:25` → **value** `assertParentAccess` from `./family-access`
    - `family-access.ts:11` → **value** `calculateAge` from `./consent` (note: its `./middleware/profile-scope` import is `import type`, so that arm is compile-erased)
    - `consent.ts:33` → **value** `sendEmail`/`formatConsentRequestEmail` from `./notifications`
    - `notifications.ts:21` → **values** `getPushToken, getDailyNotificationCount, logNotification, checkAndLogRateLimitInternal, isPushEnabled` from `./settings`
  - So: `settings → family-access → consent → notifications → settings`. All four modules are mutually reachable at runtime — a genuine 4-node SCC, not just a transitive chain.
  - Feed-ins (one-directional, not part of the SCC but worth noting because madge surfaced them as cycle prefixes):
    - `account.ts:9` → `billing` → (`billing/family.ts:26` → **value** `getFamilyPoolBreakdownSharing` from `../settings`) → enters the SCC. Nothing in the SCC imports `billing`/`account` at runtime, so `account`/`billing` are upstream, not members.
    - `profile.ts:51` → `billing` and `profile.ts:45` → `consent`; `middleware/profile-scope.ts:9` → **value** `profile`. `profile-scope.ts:8` imports `account` as `import type` only — that arm is compile-erased, so madge cycles #1/#2 do **not** close at runtime through `account`.
  - Impact: Four core back-office services (subscription/settings, family-access control, GDPR consent, notifications) are fused into one initialization unit. This is the highest-coupling region in the API. Consequences: (1) you cannot unit-test or reason about any one of them in isolation without dragging in the other three; (2) initialization order is implicit and bundler-dependent — any new module-load-time evaluation that touches a partner export risks a TDZ crash; (3) refactoring `settings` (a very broad module — it owns push tokens, rate-limit logging, AND family-pool sharing) ripples into auth and consent. The fact that `settings.ts` provides both notification-plumbing (`getPushToken`, `logNotification`) and family-access concerns (`getFamilyPoolBreakdownSharing`) is what wires the loop.
  - Suggestion (break the SCC in two cuts):
    1. **Split `settings.ts`.** The notification-plumbing functions `notifications.ts` needs (`getPushToken`, `getDailyNotificationCount`, `logNotification`, `checkAndLogRateLimitInternal`, `isPushEnabled`) are a cohesive sub-module. Move them to `notification-settings.ts` (or `push-prefs.ts`) that does **not** import `family-access`. Then `notifications → notification-settings` no longer routes back through `family-access`, severing `notifications → settings → family-access`.
    2. **Extract consent predicates** (`calculateAge`, `isGdprProcessingAllowed`) into a leaf `consent-rules.ts` as in Cycle A. That removes `family-access → consent` (it only needs `calculateAge`) and the `consent ⇄ notifications` back-edge simultaneously.
    - After both cuts the dependencies flow one way: `account → billing → settings(family-pool) → family-access → consent-rules`, and `notifications → notification-settings`/`consent-rules`, with no return edges.

#### Type-only "cycles" (compile-erased — NOT runtime cycles)

These were reported by madge (it does not distinguish `import type`) but the closing edge is erased by TypeScript, so there is no runtime initialization hazard. Flagged at LOW because they still couple the files for human/AI navigation and a careless change from `import type` to a value import would instantly create a real cycle.

- **`exchanges.ts` ⇄ `exchange-prompts.ts`** (madge #7)
  - **Classification**: [PRE-EXISTING] — **Severity**: LOW (type-only)
  - `exchanges.ts:41` imports **values** from `./exchange-prompts` (`buildSystemPrompt`, `allowsGeneralKnowledgeSource` are also re-exported at :481/:506).
  - Closing edge `exchange-prompts.ts:18` is `import type { ExchangeContext } from './exchanges'` — **type-only, erased.** No runtime cycle.
  - Suggestion: Move the `ExchangeContext` type to `@eduagent/schemas` or a local `exchange-types.ts` so the type-edge disappears and the relationship is unambiguously one-directional. Prevents accidental promotion to a real cycle.

- **`exchanges.ts` → `exchange-prompts.ts` → `language-prompts.ts` → (type) `exchanges.ts`** (madge #8)
  - **Classification**: [PRE-EXISTING] — **Severity**: LOW (type-only)
  - `exchange-prompts.ts:15` → **value** `buildFourStrandsPrompt` from `./language-prompts`.
  - `language-prompts.ts:3` → `import type { ExchangeContext } from './exchanges'` — **type-only, erased.** No runtime cycle.
  - Suggestion: Same fix as above — relocating `ExchangeContext` kills both #7 and #8 type-edges at once.

#### Test/Production Coupling

- No production-into-test coupling found. `@eduagent/test-utils` is declared only as a **devDependency** of `api`, `database`, and `mobile` — never a runtime `dependency`. No `from '@eduagent/test-utils'` or relative `*test-utils*` value imports appear in non-test production source. Clean.

#### Suspicious Relationships

- **`settings.ts` is a god-module.** It simultaneously owns push-notification plumbing and family-pool/billing-sharing concerns, which is the structural reason it sits inside the 4-node SCC (Cycle C). Splitting it (suggestion C.1) is the single highest-leverage change.
- **`consent.ts` exports both pure predicates and side-effecting flows.** `calculateAge`/`isGdprProcessingAllowed` (pure) are imported by `family-access` and `learner-profile`; `consent.ts` itself imports the side-effecting `sendEmail` from `notifications`. Pulling the pure predicates into a leaf module (suggestion A) decouples three consumers at once.
- **`learner-profile.ts:40` → value `isGdprProcessingAllowed` from `./consent`** and **`notifications.ts:578` → `import type StruggleNotification` from `./learner-profile`** (madge #4). The learner-profile arm into the SCC is value-in / type-out, so `learner-profile` is **not** a runtime SCC member — but it would become one the instant that type import becomes a value import. Watch it.
- The `billing.ts` barrel re-exports ~13 symbols from `billing/family.ts` as values (`billing.ts:113-128`), and `family.ts` reaches up to `../settings`. The barrel is the conduit that drags `account → billing` into the settings SCC's orbit. Barrels that re-export submodules which in turn import sibling top-level services are a recurring cycle vector here.

#### Recommendations

**[NEW] cycles (introduced by this PR)**:
- None — whole-repo scope, no diff.

**[PRE-EXISTING] cycles (in scope)**:

Priority order:
1. **HIGH — Cycle C `{settings, family-access, consent, notifications}` SCC.** Break with two cuts: (a) split notification-plumbing out of `settings.ts` into `notification-settings.ts`; (b) extract `calculateAge` + `isGdprProcessingAllowed` into a leaf `consent-rules.ts`. Cut (b) also resolves Cycle A.
2. **MEDIUM — Cycle A `consent ⇄ notifications`** — resolved by the `consent-rules.ts` extraction above.
3. **MEDIUM — Cycle B `curriculum ⇄ language-curriculum`** — invert the `curriculum → language-curriculum` dispatch (move the language-vs-generic decision to the orchestration caller) or extract `ensureDefaultBook` into `curriculum-core.ts`.
4. **LOW — type-only cycles #7/#8 (`exchanges`/`exchange-prompts`/`language-prompts`)** — relocate the `ExchangeContext` type to `@eduagent/schemas` or a local `exchange-types.ts`. Not urgent (compile-erased today) but cheap insurance against accidental promotion to a runtime cycle.

**Tooling recommendation:** `madge` (or `dependency-cruiser`) is not wired into CI. Consider adding `madge --circular --extensions ts,tsx apps/api/src` as a CI check, configured to allow the type-only pairs but fail on new runtime cycles, so the runtime SCC above doesn't grow.
