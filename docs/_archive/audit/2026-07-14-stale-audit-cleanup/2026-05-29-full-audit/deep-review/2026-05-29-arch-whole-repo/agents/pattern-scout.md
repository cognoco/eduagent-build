# Pattern Scout Agent — Pattern Consistency Analysis

**Scope:** Whole-repository architecture review of `/Users/vetinari/nexus/_dev/eduagent-build` (pnpm/nx monorepo: `apps/api`, `apps/mobile`, `packages/*`). All findings classified **[PRE-EXISTING]** per scope instruction.

**Headline:** This codebase has unusually strong pattern discipline. The dominant conventions documented in `CLAUDE.md` and `docs/architecture.md` are followed near-universally, backed by forward-only guard tests (`safe-non-core.guard.test.ts`, `persona-fossil-guard.test.ts`, GC1 ratchet, i18n keep-rot checker). The deviations found are few, mostly cosmetic/organizational, and several "apparent" deviations turned out to be deliberate documented patterns. The most material findings are (1) a service-layer file-naming collision (`metering.ts` in two places with different concerns) and (2) the large but explicitly-tracked GC1/GC6 internal-mock backlog.

---

### Established Patterns

| Pattern Type | Convention | Where Followed |
|--------------|------------|----------------|
| Route/service boundary (eslint G1/G5) | Business logic in `services/`, handlers thin glue | **0** direct `db.{select,query,insert,update,delete}` calls in `apps/api/src/routes/` — fully clean |
| Data isolation | `createScopedRepository(profileId)` for single-table; direct `db.select` + parent-chain `profileId`/`accountId` WHERE for joins | 165 `createScopedRepository` call sites; the rare direct-`db` services (`settings.ts`, `session-crud.ts`, `profile.ts`) enforce ownership via explicit guards (`verifyProfileOwnership`, `eq(profiles.accountId, accountId)`) |
| Inngest dispatch | Non-core via `safeSend(() => inngest.send(...))`; core via bare `inngest.send` with `// core-send:` comment + guard test | 41 `safeSend` sites; every bare `inngest.send` inspected carries either a `safeSend` wrapper or a `// core-send:` justification (`routes/account.ts`, `routes/filing.ts`, `stripe-webhook-handler.ts`, `profile.ts`) |
| Error responses (API) | `apiError`/`notFound`/`forbidden`/etc. helpers from `errors.ts` | ~200 helper call sites across routes; only **2** ad-hoc `c.json(..., 4xx)` sites |
| Error classification (mobile) | Classified once at `lib/api-client.ts` boundary into typed hierarchy (`api-errors.ts`); screens switch on type | **0** screens parse HTTP status codes — fully centralized |
| Logging | Structured `services/logger.ts` | 56 logger imports; **0** raw `console.*` in services outside `logger.ts` |
| LLM state decisions | Structured envelope (`llmResponseEnvelopeSchema` + `parseEnvelope()`) | 9+ services parse via envelope; **0** `[MARKER]`-token smells in prose |
| Persona-unaware components | Semantic tokens, no hardcoded hex (exception: SVG celebration/animation) | **0** hex literals outside `celebrations/`/`*Animation.tsx`; all 18 in-scope hex sites carry brand-intent annotations |
| Test location | Co-located `*.test.ts` next to source | **0** `__tests__/` directories anywhere in `apps/`/`packages/` |
| Exports | Named everywhere except Expo Router pages | **0** default exports in `apps/mobile/src/{components,hooks,lib}` |
| Mobile→API import ban | Type-only imports from `@eduagent/api` | **0** runtime imports detected |
| Domain-folder refactor | Large legacy service file becomes a re-export facade pointing at a same-named subdirectory | `services/billing.ts` → `billing/` and `services/session.ts` → `session/` are clean facades (`export * from './session/index'`) |

---

### Pattern Deviations

| Location | Expected Pattern | Actual Pattern | Classification | Severity |
|----------|------------------|----------------|----------------|----------|
| `apps/api/src/services/metering.ts` (159 LoC, pure quota math) vs `apps/api/src/services/billing/metering.ts` (1139 LoC, DB-mutating `decrementQuota`/`incrementQuota`) | One canonical name per concept; domain logic lives under the domain folder | Two distinct, both-live files named `metering.ts` with non-overlapping exports, both pulled into the billing module (`billing/index.ts` imports the flat one, `billing.ts` facade re-exports the folder one). A reader who opens "the metering service" has a 50/50 chance of the wrong file. | [PRE-EXISTING] | MEDIUM |
| `services/stripe.ts`, `services/subscription.ts`, `services/metering.ts`, `services/billing-pricing.ts` (flat, Sprint-9-era, still live: imported by `routes/billing.ts`, `routes/stripe-webhook.ts`) coexisting beside the newer `services/billing/` folder | Billing domain consolidated under `billing/` | Partial migration: the billing domain is split across a folder AND four still-live flat files. The `billing.ts`/`session.ts` *facades* are clean, but these four flat files are not facades — they are pre-refactor implementations that never moved. | [PRE-EXISTING] | MEDIUM |
| Service-layer organization generally: 102 flat `services/*.ts` files vs 11 `services/<domain>/` subdirectories | Consistent "one folder per domain" or "one flat file per domain" | Mixed. Some domains are folders (`billing/`, `session/`, `challenge-round/`, `llm/`, `quiz/`), but adjacent peers stay flat (`coaching-cards.ts`, `escalation.ts`, `exchanges.ts`, `session-recap.ts`, `session-lifecycle.ts` flat while `session/` folder exists). No documented rule for when a domain graduates to a folder. | [PRE-EXISTING] | LOW |
| `apps/api/src/routes/account.ts:50` | Use `notFound()` helper from `errors.ts` | Hand-builds the envelope: `c.json({ code: 'NOT_FOUND', message: 'Account not found' }, 404)` — correct shape, but bypasses the helper the rest of the file (and codebase) uses | [PRE-EXISTING] | LOW |
| `apps/api/src/routes/test-seed.ts:210` | Error helper | `c.json(outcome, 404)` ad-hoc | [PRE-EXISTING] | LOW (gated test-only endpoint) |
| 162 test files (118 `apps/api`, 44 `apps/mobile`; ~393 `jest.mock('./…'/'@eduagent/…')` lines) | No internal mocks (GC1 ratchet; GC6 boy-scout burn-down) | Large legacy internal-mock backlog. **Explicitly acknowledged** in `CLAUDE.md` as tracked backlog, not acceptable state; GC1 blocks *new* violations and GC6 forces reduction on every test-file edit. Listing here for completeness, not as an un-tracked finding. | [PRE-EXISTING] | LOW (tracked) |

---

### Evolution / Drift

- **The dominant direction is consolidation, and it is mostly working.** The facade pattern (`billing.ts`, `session.ts` → re-export `./billing/index`, `./session/index`) is a clean way to migrate a fat service into a domain folder without breaking importers. Where the team applied it fully, there is no drift.
- **The drift is in the *incompleteness* of that migration, not its design.** `billing/` exists, but `stripe.ts` / `subscription.ts` / `metering.ts` / `billing-pricing.ts` never moved in and never became facades. The result is a half-migrated domain where new contributors cannot tell which file is canonical. This is the classic "fixed one of N" hazard `CLAUDE.md`'s "Sweep when you fix" rule warns against.
- **Guard-test culture is mature and ahead of most codebases.** Forward-only ratchets (GC1 internal mocks, `safe-non-core.guard`, `persona-fossil-guard`, i18n keep-rot, no-clinical-copy baseline) mean newer code cannot reintroduce retired patterns. This is why "newer vs older" drift is low: the ratchets freeze the good pattern and let the legacy backlog burn down incrementally.
- **Removed-feature fossils are well-controlled.** `personaFromBirthYear`, `isLearner`, `personaType` are gone and guarded; `computeAgeBracket` is the single canonical age function. No fossil re-introduction found.

---

### Confusion Points

1. **`metering.ts` × 2.** The single highest-friction navigation hazard found. "Open the metering service" is ambiguous: pure-math quota helpers (`checkQuota`, `calculateRemainingQuestions`) live flat; DB mutators (`decrementQuota`, `incrementQuota`, `safeRefundQuota`) live in `billing/metering.ts`. Same filename, different layer, both live.
2. **Billing domain spread across folder + 4 flat files.** A contributor looking for subscription logic must check both `services/subscription.ts` (flat state machine) and `services/billing/subscription-core.ts` (DB-mutating core) — the split between them is not signposted.
3. **No documented graduation rule for service folders.** Because some domains are folders and structurally-similar peers are flat, a new service author has no convention to follow and will guess — perpetuating the inconsistency (exactly the failure mode `CLAUDE.md` calls out: "the next contributor reads the partial state as the team's preferred way").

---

### Standardization Recommendations

**[NEW] deviations (introduced by this PR):**
- None. This is a whole-repository review, not a PR diff; no NEW findings.

**[PRE-EXISTING] deviations (in scope):**
- **Resolve the `metering.ts` name collision (MEDIUM).** Rename the flat pure-math file to something concept-specific (e.g. `services/quota-math.ts` or move it to `billing/quota-math.ts`) so the two files no longer share a name. Update the 3 importers (`billing/index.ts`, `routes/billing.ts`, `middleware/metering.ts`).
- **Finish the billing-domain migration (MEDIUM).** Either move `stripe.ts`, `subscription.ts`, `metering.ts`, `billing-pricing.ts` into `billing/` and leave thin re-export facades at the old paths (mirroring the proven `billing.ts`/`session.ts` facade pattern), or document why they stay flat. Per the repo's own "Sweep when you fix" rule, pair this with a note recording the deferred sweep if not done in one pass.
- **Document the service-folder graduation rule (LOW).** Add one line to `docs/architecture.md` ("a service domain becomes a folder when it exceeds N files / when it owns webhook + state-machine + DB layers") so the flat-vs-folder split stops being a coin flip.
- **Swap the 2 ad-hoc `c.json(4xx)` sites for `notFound()` (LOW).** `routes/account.ts:50` and `routes/test-seed.ts:210`.

**Quick Wins:**
- `routes/account.ts:50` → `return notFound(c, 'Account not found')` (one-line, matches the other ~200 sites).
- The `metering.ts` rename is mechanical (one symbol-set has no overlap with the other, only 3 importers).

---

### Notes on "non-findings" (apparent deviations that are actually compliant)

To save reviewer time, these were investigated and cleared:
- **52 bare `inngest.send` call sites** — all are either inside `safeSend(() => …)` wrappers or carry documented `// core-send:` justifications. Pattern is sound.
- **18 hardcoded hex colors in mobile components** — all confined to `components/common/celebrations/*.tsx` SVGs with brand-intent annotations; within the documented exception.
- **`billing.ts` / `session.ts` flat files** — deliberate, clean re-export facades, not drift.
- **Inline `z.object` schemas in routes** — request-param/path validators (e.g. `subjectParamSchema`), not redefinitions of `@eduagent/schemas` contract types. No local API-facing `interface …Request/Response/Payload` redefinitions found in routes.
- **162 test files with internal `jest.mock`** — the known, explicitly-tracked GC1/GC6 backlog; gated by a forward-only ratchet. Not an untracked inconsistency.
