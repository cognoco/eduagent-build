---
title: "S2-03 — docs/canon/principles.md Extraction Draft (FINALIZED)"
status: "FINAL under WI-2051 (2026-08-01). D4 ruled Option 1 + all four boundary calls ruled 2026-07-15 sitting 2 (B1 MOVE, B2 STAY/next-lever, B3 STAY/follow-on, B4 future-slice) — all incorporated. Content still NOT applied; lands via WI-2052 (S2-04). ⚠ NEW FINDING §1: on the 2026-08-01 file the ruled scope alone no longer clears the 40k ceiling — see §1.3 for the gap and the lever options WI-2052 needs ruled."
date: 2026-08-01 (supersedes the 2026-07-14 Wave-0 draft in place)
repo: cognoco/eduagent-build
stream: Stream 2 — Deferred Estate-Canon Drain (PRG-20)
source-of-intent: _wip/umbrella-program/stream-2-backlog.md (§ Inventory, "Size-ceiling outcome", 2026-06-13); ruling record: 2026-07-12-stream-2-slice-plan-DRAFT.md §1 RULINGS (D4 row)
next-wi: WI-2052 (S2-04 — the actual landing; NOT authorized here)
---

> **No canon edits applied.** This file plus its sibling
> `2026-08-01-s2-03-principles-body-READY.md` are the entire deliverable.
> Nothing in `AGENTS.md`, `docs/canon/principles.md`, or `docs/architecture.md`
> has been touched. Every block below is content to be pasted by WI-2052.

## 0. Delta log — what changed vs the 2026-07-14 draft

The 07-14 draft's structure and boundary analysis survive intact; the four
boundary calls were ruled exactly as it proposed, so nothing was re-litigated.
What DID change is the world underneath it:

1. **AGENTS.md grew 53,740 → 60,093 bytes** (`wc -c`, 2026-08-01, at
   `origin/main` 764748015). Growth splits: ~+3,650 inside sections that move
   (two new Known Exceptions entries — WI-1556 shaper-optional profile hints,
   WI-2107 client-side envelope-signal cap), ~+2,700 in sections that stay
   (docs-only commit exception in Git Commits, Claude reviewer-unavailable
   recovery in PR Review & CI Protocol, ZDX-PROJECT-RULES markers, snapshot
   refresh). **Consequence: the ruled scope no longer lands under 40k — see
   §1.3.** The 07-14 numbers (53,740 → 38,304, margin 1,696) are obsolete.
2. **Known Exceptions promoted body now carries 7 entries, not 5** (the two
   new entries verified against source and included verbatim).
3. **§4 Product Interaction Invariants added** to the principles body — the
   human-override doctrine, required by the WI-1856/OPQ-62 carry-over
   constraint (2026-07-11) and absent from the 07-14 draft. It is now stated
   as a one-bullet invariant pointing at `MMT-ADR-0046` (landed 2026-07-30 in
   this lane), so the catalog does not fork the ADR's text.
4. **Source re-verification (OPQ-62 constraint #2) found 4 stale claims** in
   the sections being promoted; all corrected in the promoted bodies and
   itemized in §2.1 — nothing laundered:
   - `packages/schemas/src/profiles.ts:10` → now `:11` (conversationLanguageSchema).
   - `apps/api/src/services/llm/router.ts:194` → now `:310` (CONVERSATION_LANGUAGE_NAMES).
   - `apps/mobile/src/hooks/use-mentor-language-sync.ts:10` → now `:14` (hook export).
   - The Challenge Round bullet's "(mechanism planned — `ExchangeContext.llmRoutingRung`
     field not yet in source)" is **no longer true**: the mechanism landed —
     `resolveChallengeRoundLlmRoutingRung` (`apps/api/src/services/session/session-exchange-router.ts:110`)
     applies the rung-4 floor (`GEMINI_ADVANCED_MODEL_MIN_RUNG = 4`) for
     accepted/active/drafting turns, carried on `ExchangeContext.llmRoutingRung`
     (`exchange-types.ts:184`). Promoted text updated to the as-landed fact.
   - (Also corrected inside the WI-1556 exception entry: `use-profiles.ts:70`/`:108`
     → `:134`/`:172` — the two PATCH-response parses moved.)
   - Verified-still-true claims spot-checked and left as-is: the 7-vs-10
     language enum membership, eslint G1/G4/G5 in `eslint.config.mjs`,
     migration 0087 CHECK constraint, `safeSend` + guard test, `parseEnvelope`,
     `decideMasteryAndReview`, the `learningMode`-toggle-removed claim
     (`settings.ts` comment: "mode toggle removed; record now carries median
     response seconds + celebration level only"), MMT-ADR-0014's supersession
     of "Family = Gemini-only".
5. **The 07-14 §6 residual risk "no CI script parses the moved sections" is
   now verified with evidence** — see §7.1.

## 1. Ceiling arithmetic — measured 2026-08-01, in bytes (`wc -c`)

Method: not estimation. Projected files were mechanically spliced from the
live `AGENTS.md` (each moved section swapped for its exact stub text from §4,
rider inserted into the preamble, everything else byte-identical) and measured
with `wc -c`. Header integrity checked: all 27 `## ` sections present in every
variant. Splice inputs and outputs preserved in the WI-2051 session scratchpad;
the arithmetic below reconciles to the measured outputs within newline rounding.

### 1.1 Per-section disposition (current AGENTS.md, 60,093 bytes)

| # | Section (lines) | Bytes | Disposition (ruling) | Stub bytes | Net |
|---|---|---:|---|---:|---:|
| 1 | `## Languages` (265–349) | 4,832 | **MOVE** → `architecture.md` § Languages (D4) | 568 | −4,264 |
| 2 | `## Non-Negotiable Engineering Rules` (351–363) | 5,358 | **MOVE** → principles.md §1 (D4) | 690 | −4,668 |
| 3 | `## Known Exceptions to Engineering Rules` (365–376) | 6,697 | **MOVE** → principles.md §2 (B1 ruled MOVE) | 588 | −6,109 |
| 4 | `## Code Quality Guards` (426–436) | 3,857 | **MOVE** → principles.md §3 (D4) | 646 | −3,211 |
| — | Preamble rider (D4 rider, lands at WI-2052) | — | ADD | +436 | +436 |
| 5 | `## Schema And Deploy Safety` (378–387) | 2,148 | STAY — **B2, the ruled "next lever"** | (562) | (−1,586) |
| 6 | `## Repo-Specific Guardrails` (399–407) | 1,369 | STAY — B3 follow-on candidate | (498) | (−871) |
| 7 | `## UX Resilience Rules` (409–415) | 628 | STAY — B3 follow-on candidate | (396) | (−232) |
| 8 | `## Fix Development Rules` (417–424) | 913 | STAY — B3 follow-on candidate | (467) | (−446) |
| — | All other sections | — | STAY — agent-operational | — | 0 |

### 1.2 Measured projections

```
wc -c AGENTS.md                      →  60,093   (current, origin/main 764748015)
wc -c projected-ruled.md             →  42,278   (ruled scope: 4 moves + rider)      → OVER 40k by 2,278
wc -c projected-b2.md                →  40,692   (+ B2 Schema And Deploy Safety)      → OVER 40k by 692
wc -c projected-b2b3.md              →  39,143   (+ B2 + B3 all three rule-lists)     → UNDER 40k by 857
```

### 1.3 ⚠ THE FINDING — the ruled scope no longer clears the ceiling

When D4 was ruled (2026-07-15), the projected landing was 38,304 with 1,696
margin. AGENTS.md has since grown 6,353 bytes, of which ~2,700 is in sections
that STAY. The margin is gone and inverted: **the ruled scope (B1 + the two
named catalogs + Languages) lands at 42,278 — over by 2,278.** Even the ruled
"next lever" (B2) alone only reaches 40,692, still 692 over. The stubs cannot
absorb this: they already total just 2,928 bytes including the rider, and the
D4 hard condition (trigger conditions inline; reflexive rules fire from
AGENTS.md alone) sets a floor on their size — cutting ~900 bytes of stub text
to squeak under with B2-only would gut exactly the reflexive floors the ruling
demands, and would land at ~40.0k with zero margin against a file that has
grown ~3k/month for two months running.

**Options for WI-2052 (needs a one-line ruling amendment before landing):**

- **RECOMMENDED — pull B2 AND B3 together: lands at 39,143, margin 857.**
  Both levers were pre-identified in the ruled boundary analysis (B2 "next
  lever", B3 "follow-on candidates once principles.md exists and has an
  owner"). The condition B3 was deferred on — principles.md existing with an
  owner — is satisfied by the same PR that needs the room. Contingency stubs
  and principles-body sections for all four B2/B3 sections are drafted and
  measured in §4.3/§4.4, so the amendment costs the operator one nod, not a
  drafting round-trip.
- **B2 only + stub compression to ~40.0k:** rejected above — zero margin,
  degrades stub compliance.
- **Trim STAY sections (e.g. the 2,300-byte reviewer-unavailable recovery
  runbook → a runbook file + pointer):** viable but outside any existing
  ruling and outside this WI's mandate; would need its own scoping.

The principles body (§2) and the four ruled stubs (§4.1) are correct and
landable under EVERY option — the amendment only decides whether §4.3/§4.4
contingency blocks land alongside them.

## 2. Ready-to-land `docs/canon/principles.md` body

**The full body lives in the sibling file
[`2026-08-01-s2-03-principles-body-READY.md`](2026-08-01-s2-03-principles-body-READY.md)
(21,027 bytes).** WI-2052 copies that file's entire content verbatim to
`docs/canon/principles.md` — front-matter included, nothing to edit. It
contains: §1 Non-Negotiable Engineering Rules (11 rules), §2 Known Exceptions
(7 entries), §3 Code Quality Guards (7 guards + the 2 systemic bug patterns
from `.claude/memory/project_known_bug_patterns.md`, per WI-387 row 4),
§4 Product Interaction Invariants (human-override doctrine → `MMT-ADR-0046`).

### 2.1 Deviations from byte-verbatim promotion (all deliberate, all verified)

| # | Where | Change | Why |
|---|---|---|---|
| 1 | §1 Challenge Round bullet | "(mechanism planned — field not yet in source)" → as-landed cite of `resolveChallengeRoundLlmRoutingRung` (`session-exchange-router.ts:110`) + `ExchangeContext.llmRoutingRung` (`exchange-types.ts:184`) | Claim went stale; mechanism landed. OPQ-62: verify, don't launder |
| 2 | §2 WI-1556 entry | `use-profiles.ts:70` / `:108` → `:134` / `:172` | Line drift; verified lines 134/172 are the two PATCH-response `parseJson(res, profileResponseSchema)` calls |
| 3 | §2 intro | "exist in the codebase as of 2026-05-01" → "first catalogued 2026-05-01; list re-verified 2026-08-01" | Two entries postdate 2026-05; the old date was already false in AGENTS.md |
| 4 | §3 intro | Rewritten to cover both provenances (GC1–GC6 adversarial review 2026-04-05 + bug patterns 2026-04-13 sweep) | Merged catalog needs a merged intro; content claims unchanged |
| 5 | §4 (new) | Human-override invariant added, one bullet + `MMT-ADR-0046` pointer | OPQ-62 constraint #1; doctrine text lives in the ADR, not forked here |
| — | Everything else | byte-verbatim from AGENTS.md lines 353–363, 369–376, 430–436 and the memory file | — |

## 3. Ready-to-land `architecture.md` addition — Languages

Verbatim from `AGENTS.md` § Languages with the three verified cite corrections
(§0 item 4) applied. Recommend inserting as a new `## Languages` section at
the end of `## Implementation Patterns & Consistency Rules` (currently
`architecture.md:645`), i.e. immediately before `## Project Structure &
Boundaries` (currently `:934`).

~~~markdown
## Languages

Two language enums exist, and they intentionally diverge:

| Concept | Enum | Where | Count |
|---|---|---|---|
| UI shell language | `SUPPORTED_LANGUAGES` | `apps/mobile/src/i18n/index.ts:23` | 7: en, de, es, ja, nb, pl, pt |
| LLM tutor-prose language | `conversationLanguageSchema` | `packages/schemas/src/profiles.ts:11` | 10: en, cs, es, fr, de, it, pt, pl, ja, nb |

The conversation set is intentionally a **superset**. Czech, French, and Italian
learners can pick those as their tutor-prose language during onboarding and
get LLM cards in their language; the UI shell falls back to English because we
haven't committed to maintaining UI translations for those locales yet.

`useMentorLanguageSync` (`apps/mobile/src/hooks/use-mentor-language-sync.ts:14`)
clamps `i18next.language` through `conversationLanguageSchema.safeParse` before
patching the profile, so a UI-language change can never write an invalid value
to `profiles.conversation_language`. The DB CHECK constraint
(`profiles_conversation_language_check`, migration 0087) is the hard floor.

Adding a language requires:

- **UI-only locale (already in conversation set):** add to `SUPPORTED_LANGUAGES`,
  add `LANGUAGE_LABELS` entry, add to `resources` in `i18n/index.ts`, run
  `pnpm translate`, ensure `scripts/check-i18n-staleness.ts` passes.
- **Conversation-only locale:** add to `conversationLanguageSchema`, add to
  `CONVERSATION_LANGUAGE_NAMES` in `apps/api/src/services/llm/router.ts:310`,
  add a new migration extending the DB CHECK constraint.
- **Both:** combination of the two.

### UI strings hygiene

`scripts/check-i18n-orphan-keys.ts` is a `ts-morph` AST walker (it replaced the
old regex scanner). It is the single source of truth for i18n key health:

- **Forward orphans:** a `t('foo.bar')` whose key is missing from `en.json`.
- **Unused (reverse) orphans:** an `en.json` key no `t(…)` call references.
  Default-on; pass `--allow-unused` only for ad-hoc local debugging.
- **Namespace misuse:** `t('ns:key')` colon-prefix and `useTranslation('ns')`.
- **Multi-interpolation templates:** `t(\`a.${x}.b.${y}\`)` loses the literal
  between vars; refactor to compute the key, or add an on-line
  `// i18n-allow-multi-var: <reason>` escape.

Keys reached only through runtime-dynamic dispatch (a map lookup, an
`i18next.t(entry.key)`, a `${var}`-suffixed template) live in
`scripts/i18n-keep.ts` as `KEEP_PATTERNS`. Each entry's `reason` must cite a
real `file:line`; `scripts/check-i18n-keep-rot.ts` fails CI if a cite rots. The
walker also follows `cond ? 'a' : 'b'`, `x ?? 'a'`, `as` casts, `i18next.t(…)`
member calls, and `const tr = t` alias rebindings.

### Hardcoded-JSX-literal ratchet (Phase 3)

The orphan-key checker only sees strings that pass through `t()`. Hardcoded
English literals in JSX (e.g. `<Text>Add child</Text>`) bypass i18n entirely
and render English to every locale. `scripts/check-i18n-jsx-literals.ts` is the
read-side guard: a `ts-morph` AST walker that flags `JsxText` nodes and
JSX-children `StringLiteral` / `NoSubstitutionTemplateLiteral` nodes (including
through `cond ? 'a' : 'b'`, `x && 'a'`, `x ?? 'a'`, casts/parens) plus
user-visible JSX attribute literals for known copy props (`label`,
`accessibilityLabel`, `title`, `placeholder`, etc.) in
`apps/mobile/src/**/*.tsx`. It is a forward-only baseline ratchet mirroring the
`no-clinical-copy` pattern: existing literals are grandfathered in
`scripts/i18n-jsx-literals-baseline.json`, and only NEW literals fail CI (the
`i18n hardcoded-JSX-literal check` step in `ci.yml`). Child/text violations are
keyed on `{file, kind, text}`; attribute violations are keyed on
`{file, kind, prop, text}` — never line number — so reformatting does not churn
the baseline. The attribute scanner deliberately ignores non-copy props such as
`testID`, style/class props, role-like values, IDs, routes, image/source paths,
metadata, unknown custom props, and translation-key literals. Run
`pnpm check:i18n:jsx-literals --accept` to refresh the baseline when you
genuinely add non-translatable JSX copy (a code sample, a brand token) and
justify it in the commit message.

When adding user-visible copy, route it through `t('…')` and add the key to
`en.json` in the same PR — the ratchet enforces this for the JsxText/child
surface and known copy attributes; review remains responsible for copy hidden
behind unknown custom prop names.

### Variable-interpolation fallbacks

Keys with `{{var}}` interpolation should ship a no-variable companion key when
the variable is genuinely optional, so the rendered string is never
"Starting with …" (translators guess at the ellipsis and produce odd output).
Example: instead of `t('rowSubject', { subject: subject || '…' })`, prefer
`subject ? t('rowSubject', { subject }) : t('rowSubjectNoSubject')`.
~~~

## 4. Ready-to-land AGENTS.md pointer stubs + preamble rider

Every stub carries its trigger condition inline (when to load the target) and
keeps the reflexive floor firing from AGENTS.md alone — per the D4 hard
condition. Each replaces its entire section; everything else in AGENTS.md is
byte-identical to today.

### 4.1 The four RULED stubs

**`## Languages` (replaces lines 265–349, 4,832 → 568 bytes):**

~~~markdown
## Languages

**Moved to canon.** Two language enums intentionally diverge — UI shell (`SUPPORTED_LANGUAGES`, 7 locales) vs LLM tutor-prose (`conversationLanguageSchema`, 10, an intentional superset). Before touching either enum, adding a locale, or changing any `i18n/` resource or `t()` call site, load [`docs/architecture.md`](docs/architecture.md) § Languages — enum homes, the `useMentorLanguageSync` clamp + DB CHECK floor, the add-a-language procedure, and the three i18n CI checkers (orphan-keys, JSX-literal ratchet, interpolation fallbacks) live there.
~~~

**`## Non-Negotiable Engineering Rules` (replaces lines 351–363, 5,358 → 690 bytes):**

~~~markdown
## Non-Negotiable Engineering Rules

**Moved to canon:** [`docs/canon/principles.md`](docs/canon/principles.md) §1 — load it before touching routes, services, DB reads/writes, Inngest dispatch, LLM calls or prompts, or Challenge Round mastery logic. Reflexive floor that fires without the hop: reads on a scoped table use `createScopedRepository(profileId)`; parent-chain joins and scoped reads the repo API cannot express pin `profileId` in the WHERE clause; writes verify ownership via explicit `profileId` or the parent chain. Sanctioned deviations and all other rules (schemas contract, service boundaries, `safeSend`, LLM envelope, eval harness, mastery policy): principles.md §1.
~~~

**`## Known Exceptions to Engineering Rules` (replaces lines 365–376, 6,697 → 588 bytes):**

~~~markdown
## Known Exceptions to Engineering Rules

**Moved to canon.** Seven grandfathered, ruled deviations from the §1 rules (type-only mobile→api tsconfig reference; clerk-js web3 install footprint; the global `@tanstack/query-core` pin; account-level Inngest events without `profileId`; `analogyDomain`'s tri-state carve-out; the two shaper-optional profile hints; the client-side `topic_opened_pending_content` cap) live in [`docs/canon/principles.md`](docs/canon/principles.md) §2. Check that list before flagging an apparent rule violation in review or "fixing" one in an unrelated PR.
~~~

**`## Code Quality Guards` (replaces lines 426–436, 3,857 → 646 bytes):**

~~~markdown
## Code Quality Guards

**Moved to canon:** [`docs/canon/principles.md`](docs/canon/principles.md) §3 (GC1–GC6 plus the silent-fallback and React-state-timing bug patterns) — load it when writing or reviewing tests, error handling, catch/fallback paths, or feature removals. Reflexive floor that fires without the hop: never mock internal modules — no new relative-path `jest.mock('./…')` (GC1 ratchet, CI-enforced), and strip internal mocks from any test file you edit (GC6 boy-scout); use `jest.requireActual()` with targeted overrides. External-boundary mocks (Stripe, Clerk JWKS, LLM via `routeAndCall`, push, email) are unaffected.
~~~

### 4.2 The preamble rider (D4 rider — exact text, lands at WI-2052)

Insert into the AGENTS.md preamble: directly after the `# MentoMate` heading
and its blank line, before `## Snapshot` (436 bytes):

~~~markdown
> **Canon routing rule (D4 rider, ruled 2026-07-15):** new canon-shaped content — durable engineering rules, invariants, sanctioned exceptions, system-behavior documentation — goes to [`docs/canon/principles.md`](docs/canon/principles.md) (or `docs/architecture.md` for system behavior) **first**, with a trigger-bearing pointer here. AGENTS.md carries agent-operational instructions only; do not backfill rule text into this file.
~~~

### 4.3 CONTINGENT stubs — land only if the §1.3 lever amendment is ruled

**B2 — `## Schema And Deploy Safety` (replaces lines 378–387, 2,148 → 562 bytes):**

~~~markdown
## Schema And Deploy Safety

**Moved to canon:** [`docs/canon/principles.md`](docs/canon/principles.md) §5 — load it before running any drizzle-kit command, writing a migration, or wiring deploy/CI database steps. Reflexive floor that fires without the hop: dev Neon is push/direct-only — never `drizzle-kit migrate` against dev; staging and production are migrate-only — never `drizzle-kit push` there; applied migrations are immutable (CI-enforced) — write a new forward migration; a worker deploy does not migrate Neon — apply the migration first.
~~~

**B3 — `## Repo-Specific Guardrails` (replaces lines 399–407, 1,369 → 498 bytes):**

~~~markdown
## Repo-Specific Guardrails

**Moved to canon:** [`docs/canon/principles.md`](docs/canon/principles.md) §6 — load it when adding files, exports, tests, SecureStore keys, env reads, or Expo Router navigation. Reflexive floor: no default exports outside runtime-mandated entrypoints; tests co-located (no `__tests__/` folders); imports via package barrels; API config via the typed config object, never raw `process.env`; cross-tab `router.push` pushes the full ancestor chain, not just the leaf.
~~~

**B3 — `## UX Resilience Rules` (replaces lines 409–415, 628 → 396 bytes):**

~~~markdown
## UX Resilience Rules

**Moved to canon:** [`docs/canon/principles.md`](docs/canon/principles.md) §7 — load it when building screens, error states, or background jobs. Reflexive floor: classify errors at the API client boundary — screens never parse HTTP status codes; every feature spec includes a Failure Modes table; verify every event handler/cron actually has a production dispatcher.
~~~

**B3 — `## Fix Development Rules` (replaces lines 417–424, 913 → 467 bytes):**

~~~markdown
## Fix Development Rules

**Moved to canon:** [`docs/canon/principles.md`](docs/canon/principles.md) §8 — load it before claiming any fix done. Reflexive floor: changed code is not fixed code — verify every fix; CRITICAL/HIGH security fixes need a negative-path break test (red-green-revert pattern); silent recovery without escalation is banned in billing/auth/webhook code; a drift with 3+ sibling sites needs a forward-only guard or a tracked deferred sweep.
~~~

### 4.4 CONTINGENT principles.md sections (append to the READY body if ruled)

If the lever amendment lands, append the four sections to `principles.md` as
§5–§8, bodies **byte-verbatim** from today's AGENTS.md, headers renumbered:

| Append as | Source (AGENTS.md lines) | Header becomes |
|---|---|---|
| §5 | 378–387 | `## 5. Schema And Deploy Safety` |
| §6 | 399–407 | `## 6. Repo-Specific Guardrails` |
| §7 | 409–415 | `## 7. UX Resilience Rules` |
| §8 | 417–424 | `## 8. Fix Development Rules` |

No text edits needed inside them (all cites in these four verified current:
`check-migration-immutability.ts` + allowlist, `project_schema_drift_pattern`
memory, `unstable_settings` guidance, `ErrorFallback`/`TimeoutLoader`, commit
skill path). Note for §5: its bullet cites `.claude/memory/project_schema_drift_pattern.md`
— a memory-file pointer inside canon; acceptable carry-over, flag for a later
hygiene pass, do not rewrite at landing.

## 5. Per-rule accounting — zero semantic loss

Every rule in the moved sections, where it ends up, and what remains in
AGENTS.md. "Stub floor" = the rule's reflexive core is restated inline in the
stub; "stub trigger" = the stub's load-condition covers it; nothing is
dropped anywhere.

### Languages → `architecture.md` § Languages (stub: §4.1-Languages)

| Rule / content unit | Destination | In AGENTS.md after |
|---|---|---|
| Two-enum divergence table + intentional superset rationale | arch. § Languages (verbatim) | Stub floor (7-vs-10 named) |
| `useMentorLanguageSync` clamp + DB CHECK hard floor | arch. § Languages (cite fixed :10→:14) | Stub trigger + named in stub |
| Add-a-language procedure (UI-only / conversation-only / both) | arch. § Languages (cites fixed :10→:11, :194→:310) | Stub trigger |
| UI strings hygiene (orphan-keys walker, KEEP_PATTERNS, keep-rot) | arch. § Languages (verbatim) | Stub trigger ("three i18n CI checkers") |
| Hardcoded-JSX-literal ratchet (baseline, keys, --accept flow) | arch. § Languages (verbatim) | Stub trigger |
| Variable-interpolation fallback companion keys | arch. § Languages (verbatim) | Stub trigger |

### Non-Negotiable Engineering Rules → principles.md §1 (stub: §4.1-NNR)

| # | Rule | In AGENTS.md after |
|---|---|---|
| N1 | `@eduagent/schemas` shared contract | Stub trigger (named) |
| N2 | Business logic in `services/`, lint-enforced G1/G5 | Stub trigger (named) |
| N3 | Scoped reads: `createScopedRepository` + parent-chain + inexpressibility deviations | **Stub floor (reflexive, full restatement)** |
| N4 | Writes: explicit `profileId` / parent-chain ownership | **Stub floor (reflexive, full restatement)** |
| N5 | Persona-unaware shared mobile components (+ SVG brand-hex exception) | Stub trigger |
| N6 | Durable async through Inngest, no fire-and-forget | Stub trigger |
| N7 | LLM calls only via `services/llm/router.ts` | Stub trigger |
| N8 | `safeSend()` non-core dispatch + `// core-send:` + ratchet test | Stub trigger (named) |
| N9 | Structured envelope + `parseEnvelope` + server-side hard caps | Stub trigger (named) |
| N10 | Eval harness on prompt changes (Tier 1/2, receipt path) | Stub trigger (named) |
| N11 | Challenge Round mastery policy (server-owned, conservative; cite corrected per §2.1) | Stub trigger (named) |

### Known Exceptions → principles.md §2 (stub: §4.1-Exceptions)

| # | Exception | In AGENTS.md after |
|---|---|---|
| E1 | mobile tsconfig type-only reference to api | Stub (named in list) |
| E2 | clerk-js web3 packages install-footprint (WI-1040) | Stub (named in list) |
| E3 | global `@tanstack/query-core` pin (WI-1043) | Stub (named in list) |
| E4 | account-level Inngest events omit `profileId` | Stub (named in list) |
| E5 | `analogyDomain` tri-state `.nullable().optional()` (WI-1160) | Stub (named in list) |
| E6 | shaper-optional profile hints `.optional()` (WI-1556; cites fixed per §2.1) | Stub (named in list) |
| E7 | `topic_opened_pending_content` client-side cap (WI-2107) | Stub (named in list) |

### Code Quality Guards (+ memory patterns) → principles.md §3 (stub: §4.1-CQG)

| # | Guard / pattern | In AGENTS.md after |
|---|---|---|
| G1 | No internal mocks in integration tests | **Stub floor (reflexive)** |
| G2 | GC1 no-new-internal-`jest.mock()` ratchet + `gc1-allow` doctrine | **Stub floor (reflexive)** |
| G3 | Response bodies are single-use | Stub trigger |
| G4 | Classify errors before formatting | Stub trigger |
| G5 | Clean up all artifacts on feature removal | Stub trigger |
| G6 | Verify JSX handler references exist | Stub trigger |
| G7 | GC6 boy-scout internal-mock removal (+ PostToolUse hook, deferral escape) | **Stub floor (reflexive)** |
| P1 | Silent fallbacks (memory pattern 1, all 4 variants + how-to-apply) | Stub trigger ("silent-fallback… bug patterns") |
| P2 | React state timing gaps (memory pattern 2, ref-lock fix + variants) | Stub trigger ("React-state-timing bug patterns") |

### Constraint carry-overs (WI-1856 / OPQ-62)

| Constraint | Where honored |
|---|---|
| Human-override doctrine included | principles.md §4 → `MMT-ADR-0046` |
| Bug-pattern rules included (WI-387 row 4) | principles.md §3 (P1/P2 above) |
| Every promotion verified against current source | §0 item 4 + §2.1 table; 4 stale claims corrected, none laundered |

Companion move (unchanged from 07-14, still out of scope here):
`.claude/memory/project_known_bug_patterns.md` reduces to a pointer stub only
AFTER WI-2052 lands, per WI-387's extract-before-cleanup rule.

## 6. Boundary calls — ruling record (closed)

All four ruled 2026-07-15 sitting 2, exactly as the 07-14 draft recommended
(slice plan §1, D4 row): **B1** Known Exceptions → MOVE (drafted, §2). **B2**
Schema And Deploy Safety → STAY, designated next lever (now needed — §1.3).
**B3** the three rule-lists → STAY, follow-on candidates (now needed — §1.3).
**B4** Profile Shapes → future-slice candidate, untouched here; its 5.8k stays
in AGENTS.md under every variant, and its identity-model "don't conflate"
scope note stays inline as required. No delta between draft and ruling.

## 7. Residual risk — updated

1. **RESOLVED (was 07-14 §6 risk 1):** no CI script parses the moved sections
   by literal match. Evidence: `rg -l 'AGENTS\.md' scripts/` → 12 files
   reviewed; the only content-asserting hit is
   `scripts/api-integration-routing.test.ts:263-270`, which asserts a literal
   in `## Required Validation` — a STAY section under every variant. WI-2052
   must not touch that line. `validate-doc-versions.sh` / `update-claude-md.sh`
   / `_doc-counts.sh` parse only the `## Snapshot` count lines (STAY).
   `check-prompt-markers.sh`, `check-inngest-admin.ts`, `check-gc1-pattern-a.ts`,
   `check-migration-rollback.sh` mention section names in comments/error
   messages only — after landing, those messages point at a stub that
   redirects correctly; optionally refresh the wording in a later hygiene PR,
   not at WI-2052.
2. **Dual-homed envelope contract (carried forward):** N9 still cross-refs
   `architecture.md` → "LLM Response Envelope" (verified present,
   `architecture.md:1273`); the promotion preserves the split, doesn't unify it.
3. **The 40k ceiling remains a harness constant, not re-verified this
   session** — unchanged caveat from 07-14. If the ceiling moved, §1 re-runs.
4. **Growth rate:** AGENTS.md grew ~7.2k in 7 weeks against a static ceiling.
   The D4 rider (§4.2) is the standing counter-pressure; without it being
   enforced in review, even the B2+B3 margin (857 bytes) is ~2 weeks of drift.
5. **CLAUDE.md is a pointer (`@AGENTS.md`)** — no CLAUDE.md edit is needed at
   landing; verified it contains no copy of the moved sections.

## 8. WI-2052 handoff checklist (mechanical)

1. Obtain the §1.3 lever ruling (recommended: B2+B3). One operator line.
2. `cp` the READY sibling → `docs/canon/principles.md`; if levers ruled,
   append §5–§8 per §4.4 (verbatim sections, renumbered headers).
3. Insert §3's Languages block into `architecture.md` (end of Implementation
   Patterns & Consistency Rules).
4. Apply §4.1 stubs (+§4.3 if ruled) — each replaces its whole section; insert
   the §4.2 rider into the preamble.
5. `wc -c AGENTS.md` — expected ≈39.1k (B2+B3) / 42.3k (ruled-only; FAILS the
   AC); paste the number into the PR body with this file's §1.2 table.
6. Do not touch `scripts/api-integration-routing.test.ts` or the Snapshot
   count lines (§7.1).
7. Update `docs/INDEX.md` if it indexes AGENTS.md sections (check at landing);
   memory-side stub for `project_known_bug_patterns` stays deferred per §5.
