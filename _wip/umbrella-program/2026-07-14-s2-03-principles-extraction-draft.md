---
title: "S2-03 — principles.md Extraction Draft (FINALIZED, 2b shape)"
status: "FINAL under WI-2051 (2026-08-01, rev 3). D4 ruled Option 1 (2026-07-15) + DECISION 2 ruled **2b — conform to MMT-ADR-0000 §I.3** (operator, 2026-08-01): full rule TEXT → docs/architecture.md; docs/canon/principles.md = ID + one-liner + pointer INDEX; the constitution is NOT amended. Content still NOT applied; lands via WI-2052 (S2-04). ⚠ OPEN: the size-lever decision (§1.3) — measured 2b ruled scope is 42,440 bytes, still over the 40k ceiling."
date: 2026-08-01 (supersedes the 2026-07-14 Wave-0 draft and the 2026-08-01 rev-2 2a shape, in place)
repo: cognoco/eduagent-build
stream: Stream 2 — Deferred Estate-Canon Drain (PRG-20)
source-of-intent: _wip/umbrella-program/stream-2-backlog.md (§ Inventory, "Size-ceiling outcome"); ruling record: slice plan §1 RULINGS (D4 row) + operator ruling 2b (2026-08-01, relayed via orchestrator)
next-wi: WI-2052 (S2-04 — the actual landing; FROZEN until the §1.3 lever decision is ruled)
---

> **No canon edits applied.** This file plus its sibling
> `2026-08-01-s2-03-principles-body-READY.md` are the entire deliverable.
> Nothing in `AGENTS.md`, `docs/canon/principles.md`, or `docs/architecture.md`
> has been touched. Every block below is content to be pasted by WI-2052.

## 0. Delta log

### vs the 2026-08-01 rev-2 (2a) shape — the 2b ruling

DECISION 2 was ruled **2b** by the operator (2026-08-01): conform to
`MMT-ADR-0000` §I.3 as written; the constitution is not amended. Concretely:

1. **Full extracted rule TEXT now lands in `docs/architecture.md`** (§3), not
   in `principles.md`. The D4 ruling itself already routed "Languages
   binding-rules → architecture.md", so architecture.md as the content
   destination sits inside D4's own contemplation.
2. **`docs/canon/principles.md` is now an INDEX** (the READY sibling, 5,054
   bytes): stable ID + one-line statement + pointer + ADR/guard links per
   entry. The durable join is the ID — every promoted rule carries a
   grep-resolvable `[PRIN-NN]` marker in its architecture.md text, minted
   from the start, not retrofitted. ID scheme: flat `PRIN-01`…`PRIN-22`
   (ADR-0000 §I.3 leaves the exact scheme as a build-time detail; the
   catalog↔canon parity check is a named follow-up, §7.6).
3. **The 2a arithmetic (42,278 / 40,692 / 39,143) is VOID.** Re-measured
   against the 2b stubs: **42,440 / 40,870 / 39,361** (§1.2). The size-lever
   decision remains open — the destination change does not materially move
   the AGENTS.md byte math, because the same content leaves either way.
4. **AGENTS.md stubs re-targeted** at `docs/architecture.md` sections (§4.1);
   the rider now routes new canon-shaped content to domain canon + index
   entry (§4.2). The 2a stubs and the 2a "content-bearing catalog" body are
   dead and gone from this draft.
5. **The zero-loss framing is corrected per the ruling:** 2b satisfies
   zero-loss — content survives in architecture.md and the catalog points at
   it. The earlier "2b breaks zero-loss outright" claim was withdrawn by its
   author; option 2b's cost was only ever re-drafting, not loss.
6. **The Codex thread-2 fix carries forward unchanged in substance:** the
   human-override entry (PRIN-21) rests on the OPQ-62 operator ruling, names
   `MMT-ADR-0046` as **Proposed** pending Architecture sign-off, and states
   the catalog entry confers no ADR authority.
7. **D4 boundary calls re-derived against 2b** — see §6: B1 stands
   (destination re-pointed by the ruling itself); B2/B3 still need the
   operator's lever decision (they are what closes the 40k gap); B4 needs
   nothing this slice. One new open question: PRIN-21's canon elaboration
   home (§6, OQ-1).

### vs the 2026-07-14 Wave-0 draft (carried forward from rev 2)

- **AGENTS.md grew 53,740 → 60,093 bytes** (`wc -c`, 2026-08-01, at
  `origin/main` 764748015); the 07-14 margin arithmetic is obsolete.
- **Known Exceptions now carries 7 entries, not 5** (new since 07-14:
  WI-1556 shaper-optional profile hints; WI-2107 client-side envelope-signal
  cap) — verified against source and included verbatim.
- **Human-override doctrine included** per the WI-1856/OPQ-62 carry-over
  (2026-07-11) — absent from the 07-14 draft, now PRIN-21.
- **Source re-verification (OPQ-62 constraint #2) found 4 stale claims**, all
  corrected in the promoted bodies, none laundered (§2.1):
  `profiles.ts:10`→`:11`; `router.ts:194`→`:310`;
  `use-mentor-language-sync.ts:10`→`:14`; the Challenge Round bullet's
  "mechanism planned — `ExchangeContext.llmRoutingRung` not yet in source" is
  stale — the mechanism LANDED (`resolveChallengeRoundLlmRoutingRung`,
  `session-exchange-router.ts:110`, rung-4 floor via
  `GEMINI_ADVANCED_MODEL_MIN_RUNG = 4`, carried on
  `ExchangeContext.llmRoutingRung`, `exchange-types.ts:184`). Also
  `use-profiles.ts:70`/`:108`→`:134`/`:172` inside the WI-1556 entry.
- Verified-still-true claims spot-checked and left as-is: the 7-vs-10
  language enums, eslint G1/G3/G4/G5, migration 0087 CHECK, `safeSend` +
  guard test, `parseEnvelope`, `decideMasteryAndReview`, the
  `learningMode`-toggle-removed claim, MMT-ADR-0014's supersession of
  "Family = Gemini-only".
- **No CI script parses the moved sections by literal match** — verified with
  evidence (§7.1).

## 1. Ceiling arithmetic — measured 2026-08-01 against the 2b shape, in bytes

Method: mechanically spliced projections from the live `AGENTS.md` (each
moved section swapped for its exact §4 stub, rider inserted in the preamble,
everything else byte-identical), measured with `wc -c`; all 27 `## ` headers
verified present in every variant. **The 2a figures are void; these replace
them.**

### 1.1 Per-section disposition (current AGENTS.md, 60,093 bytes)

| # | Section (lines) | Bytes | Disposition (ruling) | Stub bytes | Net |
|---|---|---:|---|---:|---:|
| 1 | `## Languages` (265–349) | 4,832 | **MOVE** → `architecture.md` § Languages (D4) | 568 | −4,264 |
| 2 | `## Non-Negotiable Engineering Rules` (351–363) | 5,358 | **MOVE** → `architecture.md` § Non-Negotiable Engineering Rules (D4 + 2b) | 709 | −4,649 |
| 3 | `## Known Exceptions to Engineering Rules` (365–376) | 6,697 | **MOVE** → `architecture.md` § Known Exceptions (B1 + 2b) | 625 | −6,072 |
| 4 | `## Code Quality Guards` (426–436) | 3,857 | **MOVE** → `architecture.md` § Code Quality Guards (D4 + 2b) | 657 | −3,200 |
| — | Preamble rider (D4 rider, 2b-shaped) | — | ADD | +531 | +531 |
| 5 | `## Schema And Deploy Safety` (378–387) | 2,148 | STAY — **B2, the ruled "next lever"; decision open (§1.3)** | (578) | (−1,570) |
| 6 | `## Repo-Specific Guardrails` (399–407) | 1,369 | STAY — B3 follow-on candidate; decision open | (514) | (−855) |
| 7 | `## UX Resilience Rules` (409–415) | 628 | STAY — B3 follow-on candidate; decision open | (407) | (−221) |
| 8 | `## Fix Development Rules` (417–424) | 913 | STAY — B3 follow-on candidate; decision open | (480) | (−433) |
| — | All other sections | — | STAY — agent-operational | — | 0 |

### 1.2 Measured projections (2b stubs)

```
wc -c AGENTS.md                        →  60,093   (current, origin/main 764748015)
wc -c projected-2b-ruled.md            →  42,440   (ruled scope: 4 moves + rider)   → OVER 40k by 2,440
wc -c projected-2b-b2.md               →  40,870   (+ B2)                            → OVER 40k by 870
wc -c projected-2b-b2b3.md             →  39,361   (+ B2 + B3)                       → UNDER 40k by 639
```

### 1.3 ⚠ OPEN DECISION — the size lever (unchanged in substance by 2b)

The 2b re-shape moves the same content out of AGENTS.md as 2a did, so the
projections barely moved (2a → 2b: +162 / +178 / +218 bytes, from
architecture.md section names in the stub targets). The ruled scope is still
~2.4k over the ceiling, and the stubs cannot absorb it: they total 3,090
bytes including the rider, and the D4 hard condition (trigger conditions
inline; reflexive rules fire from AGENTS.md alone) floors their size.

**Options (operator decision; WI-2052 is frozen on it):**

- **RECOMMENDED — pull B2 AND B3: lands at 39,361, margin 639.** Both were
  pre-identified at the D-gate (B2 "next lever", B3 "follow-on candidates").
  Under 2b their text lands in `architecture.md` exactly like the ruled four;
  contingency stubs are drafted and measured (§4.3), placement specified
  (§4.4). Margin is thinner than 2a's (639 vs 857) — at the observed ~3k/month
  AGENTS.md growth rate the rider (§4.2) needs to be enforced in review from
  day one.
- **B2 only: 40,870 — still over. Not viable alone.**
- **Trim STAY sections** (e.g. the ~2.3k reviewer-unavailable recovery
  runbook → runbook file + pointer): viable, unruled, outside this WI's
  mandate; would need its own scoping.

## 2. Ready-to-land `docs/canon/principles.md` — the INDEX

**The full body lives in the sibling file
[`2026-08-01-s2-03-principles-body-READY.md`](2026-08-01-s2-03-principles-body-READY.md)
(5,054 bytes).** WI-2052 copies that file's entire content verbatim to
`docs/canon/principles.md`. Shape per `MMT-ADR-0000` §I.3: 22 entries
(`PRIN-01`…`PRIN-22`), each a one-line statement + pointer + ADR/guard links;
the rule text lives in `architecture.md` (§3 below) under matching
`[PRIN-NN]` markers. No content mirror.

### 2.1 Deviations from byte-verbatim promotion (all deliberate, all verified)

| # | Where | Change | Why |
|---|---|---|---|
| 1 | arch. § NNR, Challenge Round rule | "(mechanism planned — field not yet in source)" → as-landed cite of `resolveChallengeRoundLlmRoutingRung` (`session-exchange-router.ts:110`) + `ExchangeContext.llmRoutingRung` (`exchange-types.ts:184`) | Claim went stale; mechanism landed. OPQ-62: verify, don't launder |
| 2 | arch. § Known Exceptions, WI-1556 entry | `use-profiles.ts:70` / `:108` → `:134` / `:172` | Line drift; verified 134/172 are the two PATCH-response `parseJson(res, profileResponseSchema)` calls |
| 3 | arch. § Known Exceptions intro | "as of 2026-05-01" → "first catalogued 2026-05-01; list re-verified 2026-08-01" | Two entries postdate 2026-05; the old date was already false |
| 4 | arch. § CQG intro | Rewritten to cover both provenances (GC1–GC6 2026-04-05 + bug patterns 2026-04-13 sweep) | Merged catalog needs a merged intro; content claims unchanged |
| 5 | arch. §§ NNR/CQG bullets | `**[PRIN-NN]** ` marker prefixed to every rule bullet | The §I.3 grep-resolvable ID join, ruled 2026-08-01; mechanical prefix, no wording change |
| 6 | Languages body | 3 line-cite corrections (`:10`→`:11`, `:194`→`:310`, `:10`→`:14`) | Verified drift |
| 7 | principles.md (new file) | One-line statements are compressions authored for the index | The binding full text is the architecture.md section each entry points at; on any divergence the elaboration governs |
| — | Everything else | byte-verbatim from AGENTS.md lines 353–363, 369–376, 430–436 and `.claude/memory/project_known_bug_patterns.md` | — |

## 3. Ready-to-land `docs/architecture.md` addition (24,461 bytes)

One contiguous block: § Languages (cite-fixed) + § Non-Negotiable Engineering
Rules + § Known Exceptions to Engineering Rules + § Code Quality Guards, the
rule sections carrying `[PRIN-NN]` markers. Recommend inserting at the end of
`## Implementation Patterns & Consistency Rules` (currently
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

## Non-Negotiable Engineering Rules

Promoted from `AGENTS.md` by the Stream 2 estate-canon drain (D4 ruled
2026-07-15; index shape per `MMT-ADR-0000` §I.3 ruled 2026-08-01). Each rule
carries its catalog ID as a grep-resolvable `[PRIN-NN]` marker — the durable
join to the index at `docs/canon/principles.md`; renaming a heading never
breaks the bind, the ID does the work.

- **[PRIN-01]** `@eduagent/schemas` is the shared contract. Do not redefine API-facing types locally.
- **[PRIN-02]** Business logic belongs in `services/`, not in route handlers. Route/service boundaries are lint-enforced (eslint G1 and G5 in `eslint.config.mjs`).
- **[PRIN-03]** Reads must use `createScopedRepository(profileId)` when the query operates on a single scoped table. For queries that join through a parent chain (e.g. `learning_sessions → curriculum_topics → curriculum_books → subjects`), use direct `db.select()` and enforce `profileId` via `subjects.profileId` (or the closest ancestor that owns it) in the WHERE clause. The scoped repo cannot express multi-table joins; the parent-chain pattern is the sanctioned alternative. Existing examples: `services/session/session-topic.ts`, `session-book.ts`, `session-subject.ts`. A second sanctioned deviation, for a **single scoped table**: reads that need ordering and/or a limit the scoped repo's `findFirst`/`findMany` API cannot express — e.g. a strict time-bound (`lt(createdAt, …)`) with `orderBy(desc(createdAt))` and `limit(1)` together to fetch the latest row before a timestamp, or an `orderBy` + `limit` pair with no time-bound at all — use direct `db.select()` with `profileId` pinned in the WHERE clause; it is the inexpressibility, not the specific predicate shape, that makes this the sanctioned pattern rather than a violation. Existing examples: `inngest/functions/review-calibration-grade.ts` (EU-7 grader-failure cap); `apps/api/src/services/now-feed.ts`'s `collectRecapReadyCandidates` and `collectSnapshotReadyCandidates` (WI-1121 derive-on-read projections).
- **[PRIN-04]** Writes must include explicit `profileId` protection or verify ownership through the parent chain before updating child records.
- **[PRIN-05]** Shared mobile components stay persona-unaware. Use semantic tokens and CSS variables, not persona checks or hardcoded hex colors. Exception: brand-fixed hex values are acceptable inside SVG-internal animation and celebration components (`*Animation.tsx`, `*Celebration.tsx`, `AnimatedSplash.tsx`, `MentomateLogo.tsx`) when the file annotates the brand intent.
- **[PRIN-06]** Durable async work goes through Inngest. Do not fire-and-forget background work from route handlers.
- **[PRIN-07]** LLM calls go through `services/llm/router.ts` or its barrel, not direct provider SDK calls.
- **[PRIN-08]** Non-core Inngest dispatches (telemetry, post-success notifications, observability events) go through `safeSend()` in `apps/api/src/services/safe-non-core.ts` so a dispatch failure is captured in Sentry but never throws and never breaks the user action. Bare `inngest.send(...)` is reserved for CORE flows where dispatch failure must short-circuit the user action — those sites carry a `// core-send: <reason>` comment on the line(s) immediately above the call. Forward-only ratchet test: `apps/api/src/services/safe-non-core.guard.test.ts`.
- **[PRIN-09]** LLM responses that drive state-machine decisions (close interview, hold escalation, trigger UI widget) must use the structured response envelope (`llmResponseEnvelopeSchema` from `@eduagent/schemas`). Parse with `parseEnvelope()` from `services/llm/envelope.ts`. Never embed `[MARKER]` tokens or JSON blobs in free-text replies. Every envelope signal must have a server-side hard cap (e.g., `MAX_INTERVIEW_EXCHANGES = 4`) so the flow terminates even if the LLM never emits the signal. See `docs/architecture.md` → "LLM Response Envelope" for the full contract.
- **[PRIN-10]** When changing LLM prompts (`apps/api/src/services/**/*-prompts.ts` or `apps/api/src/services/llm/*.ts`), run the eval harness (`pnpm eval:llm`) to snapshot before/after, and `pnpm eval:llm --live` (Tier 2) to validate real LLM responses against `expectedResponseSchema`. The pre-commit hook does NOT run the harness; it only checks for staged snapshot files when drift exists, or a harness-written zero-drift receipt when the full Tier-1 run rewrote snapshots with no tracked changes. Harness code: `apps/api/eval-llm/`.
- **[PRIN-11]** Challenge Round mastery policy is server-owned and conservative over structured LLM evidence. The LLM proposes per-concept evaluations via `signals.challenge_round_evaluation`; each item must include `answerEventId` and `learnerQuote`. The server runs `decideMasteryAndReview()` and sets `assessments.mastery_challenge_verified_at` only when EVERY concept evaluates `solid`. Any `partial`, `missing`, or `misconception` blocks mastery and routes the weak concepts to `needs_deepening_topics` with `source = 'challenge_round'`. Notes drafted from Challenge Rounds must use only `solidAnswerQuotes` and pass the lexical-overlap hallucination guard in `services/challenge-round/note-draft.ts` before being shown to the learner. Challenge Round LLM calls must still route through `resolveExchangeLlmRouting()`; accepted/active/drafting turns apply a routing-only rung-4 floor (`resolveChallengeRoundLlmRoutingRung` in `services/session/session-exchange-router.ts`, carried on `ExchangeContext.llmRoutingRung`), and per-tier model routing (incl. minor/Family) follows `MMT-ADR-0014` + `docs/registers/llm-models/master.md` (the prior "Family = Gemini-only" wording is superseded — Gemini is excluded under-18). The persistent Challenge mode toggle (`learningMode: 'serious' | 'casual'`) was removed in Phase 0 (PR #325); today's `casual` is the single default tone and rigor is now expressed per-Challenge-Round rather than globally.

## Known Exceptions to Engineering Rules

Register `[PRIN-22]`. These deviations from the rules above exist in the
codebase (first catalogued 2026-05-01; list re-verified 2026-08-01). They are
listed here so reviewers don't try to "fix" them in unrelated PRs and so new
contributors don't take them as precedent. Each exception should either be
tracked toward a refactor, or promoted into an explicit rule.

- **`apps/mobile/tsconfig.json` declares `references[]: [{ "path": "../api" }]`**, in tension with the conceptual "mobile must not depend on api" rule. This is required so `import type { AppType } from '@eduagent/api'` resolves for the Hono RPC client. **Type-only imports** from `@eduagent/api` are accepted; runtime imports remain forbidden (they would pull API server code into the mobile bundle). See `docs/architecture.md` → "AppType" example for the rationale.

- **`@clerk/clerk-js` ships `@coinbase/wallet-sdk` + `@solana/*` into `node_modules`, but they never reach the device bundle** — clerk-js `dist` is PRE-BUNDLED (no `require()` of those packages), so Metro never traverses them; install-footprint only, zero device-bundle impact (verified WI-1040). Not removable via pnpm config: they are real `dependencies` of clerk-js, not missing optional peers, so `pnpm.peerDependencyRules.ignoreMissing` does not apply. An upstream issue against `@clerk/clerk-expo` for a no-web3 entrypoint is the only real mitigation; do not attempt to strip them locally.
- **The global unscoped `@tanstack/query-core` pin in root `package.json` `pnpm.overrides` is load-bearing**, not hygiene debt — it dedupes query-core to one version across `@clerk/shared` (declares `5.87.4`) and the `@tanstack/*` consumers (react-query, query-async-storage-persister, query-persist-client-core). Scoping it to the react-query edge (`@tanstack/react-query>@tanstack/query-core`) regresses to 3 separate query-core versions in the tree (verified WI-1043). Keep it global, and bump its version **in lockstep** whenever `@tanstack/react-query` is bumped.
- **Account-level Inngest events omit `profileId`** — `app/account.reclaim_attempt` and similar events that fire at account-creation time (before any profile exists) legitimately carry no `profileId`. This is a sanctioned deviation from the "payloads always include `profileId`" rule for events scoped to the accounts table by `clerkUserId` or `accountId`. The `@inngest-admin: event-profile` annotation documents the scoping mechanism in place. Do not attempt to add a dummy `profileId: null` to satisfy the rule textually — it would be misleading.
- **`teachingPreferenceSchema.analogyDomain` (request) keeps `.nullable().optional()`** — a documented carve-out (WI-1160, operator-ruled) from the "never `.nullable().optional()`; request → `.optional()`, response → `.nullable()`" canon (`docs/project_context.md`, `docs/architecture.md`). This **request** field is genuinely tri-state: a value = set, `null` = explicitly clear, absent = leave unchanged. `null`-as-clear is established, tested product behavior (`apps/api/src/routes/retention.test.ts` → "accepts null analogyDomain to clear preference"), so both `.nullable()` and `.optional()` are required; the canon's "pick one" wrongly assumes null and absent are interchangeable here. The ban is docs-only (no automated checker), so no escape annotation is needed. The **response** fields (`teachingPreferenceResponseDataSchema.analogyDomain` / `nativeLanguage`) DO conform to `.nullable()` — the carve-out is request-side only.
- **`profileSchemaShape.conversationLanguageConfirmed` / `.isCurrentUser` (response) keep `.optional()`** — a documented carve-out (WI-1556) from the "request → `.optional()`, response → `.nullable()`" canon (`docs/project_context.md`, `docs/architecture.md`). Both are **hints derived by the API**, not stored columns, and only *some* response shapers populate them: `listProfilesV2` emits both and `getOwnerProfileV2` emits `conversationLanguageConfirmed`, while `updateProfileV2` (`apps/api/src/services/identity-v2/profile-v2.ts`, backing `PATCH /profiles/:id`), `updateProfileAppContext` (`apps/api/src/services/profile.ts`, backing `PATCH /profiles/:id/app-context`) and `getProfileV2` (`apps/api/src/services/identity-v2/profile-v2.ts`, backing `GET /profiles/:id`) emit **neither**. Mobile parses the two PATCH responses through `profileResponseSchema` (`apps/mobile/src/hooks/use-profiles.ts:134` and `:172`), so the keys are genuinely absent on **current, live traffic** — a standing shaper asymmetry, not only a rollout window; a mixed-version API rollout produces the same absent-key shape. `.nullable()` does not help: it requires the key to be **present** with a `null` value and throws when it is absent, so it would break those parses today. `.nullable().optional()` is banned outright by the same canon, which leaves `.optional()` as the only single Zod primitive that fits. **Why `.optional()` rather than the `.default(false)` used by neighbouring booleans (`hasPremiumLlm`, `hasFamilyLinks`):** `undefined` is a meaningful third state — "this response did not report the hint" — and the consumer relies on it. `shouldRequireFirstMentorLanguageConfirmation` (`apps/mobile/src/lib/first-mentor-language.ts`) gates on strict `conversationLanguageConfirmed === false`, so an absent hint **fails open** and a response from a shaper that omits the field can never raise the blocking first-Mentor gate. `.default(false)` would coerce that absence into a definitive "not confirmed" and gate a learner off a response that simply never carried the field. The ban is docs-only (no automated checker), so no escape annotation is needed. **Does not generalize:** it is scoped to these two derived hint fields on `profileSchemaShape`. Response fields backed by a real column still use `.nullable()`, and a new response field must not copy this pattern unless it is likewise shaper-optional **and** its consumer fails open on absence.
- **`signals.topic_opened_pending_content`'s hard cap lives client-side, not server-side** — a documented deviation (WI-2107) from the "every envelope signal needs a server-side hard cap" rule. This signal has no server-side loop to cap (unlike `MAX_INTERVIEW_EXCHANGES`, which bounds an in-request loop): each auto-continuation is a discrete client-initiated request, so the termination guarantee is enforced in `apps/mobile/src/components/session/use-session-streaming.ts`'s `autoContinuationFiredRef` (capped at one auto-fired follow-up per learner turn) instead. The rule's intent — bound the flow so it terminates even if the LLM never stops emitting the signal — is preserved; only the enforcement layer differs because the control-flow shape differs.

## Code Quality Guards

These rules catch bugs that survive type-checking and only surface at
runtime. GC1–GC6 learned from adversarial review (2026-04-05); the two
systemic bug patterns closing the list learned from the 2026-04-13 sweep (20
instances found and fixed across the codebase). Both sets share the same
authority level and the same audience — check for them when reviewing or
writing new code. `[PRIN-NN]` markers as above.

- **[PRIN-12]** **No internal mocks in integration tests.** Never `jest.mock` your own database, services, or middleware in integration tests. Mock only true external boundaries (Stripe, Clerk JWKS, email providers, push notification services). Internal mocks hide real bugs.
- **[PRIN-13]** **No new internal `jest.mock()` (GC1 ratchet).** CI fails any PR that adds a relative-path `jest.mock('./...')` or `jest.mock('../...')` line in `*.test.ts` / `*.test.tsx`. Existing legacy sites are NOT blocked by the ratchet but are NOT considered acceptable state — they are backlog for the GC6 burn-down. To stub a few named exports of an internal module, use `jest.requireActual()` with targeted overrides (canonical pattern: `apps/api/src/inngest/functions/archive-cleanup.test.ts`). External-boundary mocks (LLM via `routeAndCall`, push, email, Stripe, Clerk JWKS) use bare specifiers and are unaffected. The `// gc1-allow: <reason>` escape is reserved for cases where the code under test genuinely cannot be exercised (no real implementation available in the test environment); it is not an "I don't feel like wiring the real thing today" escape.
- **[PRIN-14]** **Response bodies are single-use.** Never call both `.json()` and `.text()` on the same `fetch` Response — the body stream is consumed on first read. If you need both JSON parsing with a text fallback, read `.text()` once and `JSON.parse` it manually. Applies to `assertOk`-style helpers, error-extraction middleware, and SSE error handlers.
- **[PRIN-15]** **Classify errors before formatting.** When code branches on error *type* (reconnectable vs. fatal, quota vs. network) and also formats errors for display, classify the **raw** error object first, then format for the user. Never string-match on the output of `formatApiError` — the formatter strips status codes, error codes, and keywords classifiers depend on.
- **[PRIN-16]** **Clean up all artifacts when removing a feature.** Grep the entire project for all references: types, imports, constants, SecureStore keys, commented-out JSX, fallback branches. Orphaned types create false confidence, unreachable fallback branches inflate coverage, leaked storage keys waste device storage forever.
- **[PRIN-17]** **Verify JSX handler references exist** after adding any `Pressable` or `Button` — an `onPress={handleX}` that points at a removed or renamed handler type-checks but is dead at runtime.
- **[PRIN-18]** **GC6 — Boy-scout internal mocks when editing test files.** Any time you edit a test file (`*.test.ts` / `*.test.tsx` / `*.integration.test.ts`) for any reason, scan it for `jest.mock('./...')`, `jest.mock('../...')`, or `jest.mock('@eduagent/...')` and remove the internal mocks before the edit is complete. Use the real implementation, or convert to `jest.requireActual()` with targeted overrides (canonical pattern: `apps/api/src/inngest/functions/archive-cleanup.test.ts`). Run `/my:sweep-mocks` for the full workflow. The PostToolUse hook at `~/.claude/hooks/post-edit-jest-mock-check.sh` surfaces offending lines after every test-file edit; treat that output as a blocker on task completion, not a follow-up. External-boundary mocks (LLM via `routeAndCall`, Stripe, Clerk JWKS, push, email, Inngest framework) use bare specifiers and are not violations. The `// gc1-allow: <reason>` escape applies only when the real code cannot run in the test environment — not as a convenience. **Policy:** internal mocks are not acceptable state, they are backlog. **Why:** GC1 gates new violations; GC6 forces every test-file visit to reduce the legacy backlog. The deferral escape (leave the mocks, record file paths + count in the commit message) exists only when burn-down would balloon a focused task — it does not authorize preserving the mocks indefinitely.
- **[PRIN-19]** **Silent fallbacks.** Code that silently degrades to a "safe" default instead of surfacing an error. Found in API services and mobile query consumers, 2026-04-13 sweep (10 instances: `summaries.ts`, `assessments.ts`, `subject-resolve.ts`, `subject-classify.ts`, `library.tsx`, `shelf/index.tsx`, `child/mentor-memory.tsx`, `session-summary`). Variants:
  - `?? []` on TanStack Query `.data` — only catches null/undefined, not wrong object shapes. TanStack Query's `select` is bypassed when `enabled=false`, so `.data` can be an unexpected shape. **Fix:** `Array.isArray(query.data) ? query.data : []`.
  - API/LLM catch blocks returning success-shaped objects (`isAccepted: true`, `status: 'direct_match'`) — masquerades a service failure as a valid result. **Fix:** return error/no-match status so the UI shows a retry path.
  - `void mutateAsync(...)` with no `.catch()` — the user gets no feedback when a mutation fails. **Fix:** wrap in async handler with `Alert.alert` on catch.
  - Raw LLM response text embedded in fallback strings (`response.slice(0,30)`) — error messages or safety refusals can leak into student-facing UI.
  - **How to apply:** when writing any catch block or fallback path, ask "does this look like success to the caller?" If yes, it's a silent fallback bug.
- **[PRIN-20]** **React state timing gaps.** `isPending` or `useState` booleans used as concurrency guards but vulnerable to React's async batching. Found in mobile screens with mutation + Alert retry patterns (`shelf/index.tsx`, `pick-book`, `session/index.tsx` `handleEndSession`, `session-summary` `handleSubmit`/`handleContinue`), 2026-04-13 sweep.
  - **The race:** when a TanStack Query mutation fails, `isPending` resets to `false` before the Alert callback fires. The user can then tap both the Alert "Try again" button AND a re-enabled UI button simultaneously, firing two concurrent mutations.
  - **Fix:** add a `useRef(false)` lock alongside the `isPending` check — the ref is synchronous and not subject to React batching:
    ```ts
    const inFlight = useRef(false);
    if (mutation.isPending || inFlight.current) return;
    inFlight.current = true;
    // ... in catch/finally: inFlight.current = false;
    ```
  - **Related variant:** `setIsClosing(false)` in a catch block re-enables a button while the error Alert is still visible. **Fix:** move the state reset into the Alert's button callback instead.
  - **How to apply:** any async handler that (a) checks `isPending` at the top, (b) calls `mutateAsync`, and (c) has an Alert with a retry callback needs a ref lock. Also check: any `setState(false)` in a catch block that re-enables a button while an Alert is still on screen.
~~~

## 4. Ready-to-land AGENTS.md pointer stubs + preamble rider

Every stub carries its trigger condition inline and keeps the reflexive floor
firing from AGENTS.md alone (D4 hard condition). All targets are
`docs/architecture.md` sections per the 2b ruling; the index is named once,
in the rider. Each stub replaces its entire section; everything else in
AGENTS.md is byte-identical to today.

### 4.1 The four RULED stubs

**`## Languages` (replaces lines 265–349, 4,832 → 568 bytes):**

~~~markdown
## Languages

**Moved to canon.** Two language enums intentionally diverge — UI shell (`SUPPORTED_LANGUAGES`, 7 locales) vs LLM tutor-prose (`conversationLanguageSchema`, 10, an intentional superset). Before touching either enum, adding a locale, or changing any `i18n/` resource or `t()` call site, load [`docs/architecture.md`](docs/architecture.md) § Languages — enum homes, the `useMentorLanguageSync` clamp + DB CHECK floor, the add-a-language procedure, and the three i18n CI checkers (orphan-keys, JSX-literal ratchet, interpolation fallbacks) live there.
~~~

**`## Non-Negotiable Engineering Rules` (replaces lines 351–363, 5,358 → 709 bytes):**

~~~markdown
## Non-Negotiable Engineering Rules

**Moved to canon:** [`docs/architecture.md`](docs/architecture.md) § Non-Negotiable Engineering Rules — load it before touching routes, services, DB reads/writes, Inngest dispatch, LLM calls or prompts, or Challenge Round mastery logic. Reflexive floor that fires without the hop: reads on a scoped table use `createScopedRepository(profileId)`; parent-chain joins and scoped reads the repo API cannot express pin `profileId` in the WHERE clause; writes verify ownership via explicit `profileId` or the parent chain. Sanctioned deviations and all other rules (schemas contract, service boundaries, `safeSend`, LLM envelope, eval harness, mastery policy): same section.
~~~

**`## Known Exceptions to Engineering Rules` (replaces lines 365–376, 6,697 → 625 bytes):**

~~~markdown
## Known Exceptions to Engineering Rules

**Moved to canon.** Seven grandfathered, ruled deviations from the engineering rules (type-only mobile→api tsconfig reference; clerk-js web3 install footprint; the global `@tanstack/query-core` pin; account-level Inngest events without `profileId`; `analogyDomain`'s tri-state carve-out; the two shaper-optional profile hints; the client-side `topic_opened_pending_content` cap) live in [`docs/architecture.md`](docs/architecture.md) § Known Exceptions to Engineering Rules. Check that list before flagging an apparent rule violation in review or "fixing" one in an unrelated PR.
~~~

**`## Code Quality Guards` (replaces lines 426–436, 3,857 → 657 bytes):**

~~~markdown
## Code Quality Guards

**Moved to canon:** [`docs/architecture.md`](docs/architecture.md) § Code Quality Guards (GC1–GC6 plus the silent-fallback and React-state-timing bug patterns) — load it when writing or reviewing tests, error handling, catch/fallback paths, or feature removals. Reflexive floor that fires without the hop: never mock internal modules — no new relative-path `jest.mock('./…')` (GC1 ratchet, CI-enforced), and strip internal mocks from any test file you edit (GC6 boy-scout); use `jest.requireActual()` with targeted overrides. External-boundary mocks (Stripe, Clerk JWKS, LLM via `routeAndCall`, push, email) are unaffected.
~~~

### 4.2 The preamble rider (D4 rider, 2b-shaped — exact text, lands at WI-2052)

Insert directly after the `# MentoMate` heading and its blank line, before
`## Snapshot` (531 bytes):

~~~markdown
> **Canon routing rule (D4 rider, ruled 2026-07-15; index shape per MMT-ADR-0000 §I.3, ruled 2026-08-01):** new canon-shaped content — durable engineering rules, invariants, sanctioned exceptions, system-behavior documentation — goes to its domain canon (`docs/architecture.md` / `PRD.md` / the UX spec) **first**, with an index entry in [`docs/canon/principles.md`](docs/canon/principles.md) and a trigger-bearing pointer here. AGENTS.md carries agent-operational instructions only; do not backfill rule text into this file.
~~~

### 4.3 CONTINGENT stubs — land only if the §1.3 lever decision pulls B2/B3

**B2 — `## Schema And Deploy Safety` (replaces lines 378–387, 2,148 → 578 bytes):**

~~~markdown
## Schema And Deploy Safety

**Moved to canon:** [`docs/architecture.md`](docs/architecture.md) § Schema And Deploy Safety — load it before running any drizzle-kit command, writing a migration, or wiring deploy/CI database steps. Reflexive floor that fires without the hop: dev Neon is push/direct-only — never `drizzle-kit migrate` against dev; staging and production are migrate-only — never `drizzle-kit push` there; applied migrations are immutable (CI-enforced) — write a new forward migration; a worker deploy does not migrate Neon — apply the migration first.
~~~

**B3 — `## Repo-Specific Guardrails` (replaces lines 399–407, 1,369 → 514 bytes):**

~~~markdown
## Repo-Specific Guardrails

**Moved to canon:** [`docs/architecture.md`](docs/architecture.md) § Repo-Specific Guardrails — load it when adding files, exports, tests, SecureStore keys, env reads, or Expo Router navigation. Reflexive floor: no default exports outside runtime-mandated entrypoints; tests co-located (no `__tests__/` folders); imports via package barrels; API config via the typed config object, never raw `process.env`; cross-tab `router.push` pushes the full ancestor chain, not just the leaf.
~~~

**B3 — `## UX Resilience Rules` (replaces lines 409–415, 628 → 407 bytes):**

~~~markdown
## UX Resilience Rules

**Moved to canon:** [`docs/architecture.md`](docs/architecture.md) § UX Resilience Rules — load it when building screens, error states, or background jobs. Reflexive floor: classify errors at the API client boundary — screens never parse HTTP status codes; every feature spec includes a Failure Modes table; verify every event handler/cron actually has a production dispatcher.
~~~

**B3 — `## Fix Development Rules` (replaces lines 417–424, 913 → 480 bytes):**

~~~markdown
## Fix Development Rules

**Moved to canon:** [`docs/architecture.md`](docs/architecture.md) § Fix Development Rules — load it before claiming any fix done. Reflexive floor: changed code is not fixed code — verify every fix; CRITICAL/HIGH security fixes need a negative-path break test (red-green-revert pattern); silent recovery without escalation is banned in billing/auth/webhook code; a drift with 3+ sibling sites needs a forward-only guard or a tracked deferred sweep.
~~~

### 4.4 CONTINGENT architecture.md sections + index rows (if the lever is pulled)

Append to the §3 block, bodies **byte-verbatim** from today's AGENTS.md
(headers unchanged — architecture.md reuses the same section names):

| Append | Source (AGENTS.md lines) | New index entries |
|---|---|---|
| `## Schema And Deploy Safety` | 378–387 | PRIN-23…PRIN-29 (7 rules; mint at landing, mark bullets) |
| `## Repo-Specific Guardrails` | 399–407 | PRIN-30…PRIN-36 (7 rules) |
| `## UX Resilience Rules` | 409–415 | PRIN-37…PRIN-41 (5 rules) |
| `## Fix Development Rules` | 417–424 | PRIN-42…PRIN-45 (4 rules) |

The corresponding one-line index rows follow the §2 pattern (statement +
pointer + guard where one exists — e.g. migration immutability →
`scripts/check-migration-immutability.ts`). Marker-prefix each bullet at
landing exactly as §3 does. Note for Schema And Deploy Safety: its second
bullet cites `.claude/memory/project_schema_drift_pattern.md` — a memory
pointer inside canon; acceptable carry-over, flag for a later hygiene pass.

## 5. Per-rule accounting — zero semantic loss

Every rule in the moved sections → its `[PRIN-NN]` marker in
`architecture.md` → its index row in `principles.md` → what remains in
AGENTS.md. "Stub floor" = restated inline in the stub; "stub trigger" = the
stub's load-condition covers it. Nothing is dropped anywhere; under 2b the
full text survives in architecture.md and the catalog points at it.

### Languages → `architecture.md` § Languages (stub: §4.1; not indexed — domain-specific architecture, never catalog-bound under D4)

| Content unit | Destination | In AGENTS.md after |
|---|---|---|
| Two-enum divergence + superset rationale | arch. § Languages (verbatim) | Stub floor (7-vs-10 named) |
| `useMentorLanguageSync` clamp + DB CHECK floor | arch. § Languages (cite fixed) | Stub trigger + named |
| Add-a-language procedure (3 variants) | arch. § Languages (cites fixed) | Stub trigger |
| UI strings hygiene / JSX-literal ratchet / interpolation fallbacks | arch. § Languages (verbatim) | Stub trigger ("three i18n CI checkers") |

### Non-Negotiable Engineering Rules → arch. § NNR + index rows PRIN-01…11 (stub: §4.1-NNR)

| ID | Rule | In AGENTS.md after |
|---|---|---|
| PRIN-01 | `@eduagent/schemas` shared contract | Stub trigger (named) |
| PRIN-02 | Business logic in `services/`, lint G1/G5 | Stub trigger (named) |
| PRIN-03 | Scoped reads + parent-chain + inexpressibility deviations | **Stub floor (reflexive)** |
| PRIN-04 | Writes verify ownership | **Stub floor (reflexive)** |
| PRIN-05 | Persona-unaware components (+ SVG brand exception) | Stub trigger |
| PRIN-06 | Durable async through Inngest | Stub trigger |
| PRIN-07 | LLM via router only | Stub trigger |
| PRIN-08 | `safeSend()` + `// core-send:` + ratchet test | Stub trigger (named) |
| PRIN-09 | Envelope + `parseEnvelope` + hard caps | Stub trigger (named) |
| PRIN-10 | Eval harness on prompt change | Stub trigger (named) |
| PRIN-11 | Challenge Round mastery policy (cite corrected §2.1) | Stub trigger (named) |

### Known Exceptions → arch. § Known Exceptions + index row PRIN-22 (stub: §4.1-Exceptions)

| # | Exception | In AGENTS.md after |
|---|---|---|
| E1–E7 | tsconfig type-only ref · clerk-js web3 footprint (WI-1040) · query-core pin (WI-1043) · account-level events w/o `profileId` · `analogyDomain` tri-state (WI-1160) · shaper-optional hints (WI-1556, cites fixed) · client-side cap (WI-2107) | Stub (all seven named in list) |

### Code Quality Guards + memory patterns → arch. § CQG + index rows PRIN-12…20 (stub: §4.1-CQG)

| ID | Guard / pattern | In AGENTS.md after |
|---|---|---|
| PRIN-12 | No internal mocks in integration tests | **Stub floor (reflexive)** |
| PRIN-13 | GC1 no-new-internal-`jest.mock()` ratchet | **Stub floor (reflexive)** |
| PRIN-14 | Response bodies single-use | Stub trigger |
| PRIN-15 | Classify errors before formatting | Stub trigger |
| PRIN-16 | Clean up artifacts on feature removal | Stub trigger |
| PRIN-17 | Verify JSX handler references | Stub trigger |
| PRIN-18 | GC6 boy-scout mock removal (+ hook, deferral escape) | **Stub floor (reflexive)** |
| PRIN-19 | Silent fallbacks (memory pattern 1, all variants) | Stub trigger (named) |
| PRIN-20 | React state timing gaps (memory pattern 2, ref-lock fix) | Stub trigger (named) |

### Constraint carry-overs (WI-1856 / OPQ-62)

| Constraint | Where honored |
|---|---|
| Human-override doctrine included | index row PRIN-21 (authority: OPQ-62 ruling; `MMT-ADR-0046` named as Proposed, confers no ADR authority) |
| Bug-pattern rules included (WI-387 row 4) | arch. § CQG (PRIN-19/20) |
| Every promotion verified against current source | §0 + §2.1; 4 stale claims corrected, none laundered |

Companion move (unchanged, out of scope here):
`.claude/memory/project_known_bug_patterns.md` reduces to a pointer stub only
AFTER WI-2052 lands, per WI-387's extract-before-cleanup rule.

## 6. D4 boundary calls — re-derived against the 2b shape

Ruled 2026-07-15 against the 2a shape; re-derived here per the 2b ruling's
step 3. **Nothing below is re-ruled by this draft** — it states which calls
survive 2b mechanically and which still need the operator.

- **B1 (Known Exceptions → MOVE): STANDS, no new decision needed.** The MOVE
  was ruled; 2b itself re-points the destination to `architecture.md` (§3).
  The exceptions are indexed as one register entry (PRIN-22) rather than
  seven — they are sanctioned deviations, not free-standing principles; the
  rules they deviate from carry the IDs.
- **B2 (Schema And Deploy Safety): OPERATOR DECISION STILL NEEDED** — the
  §1.3 size lever. 2b changes its destination-if-pulled (architecture.md),
  not the decision itself. Drafted both ways (§4.3/§4.4).
- **B3 (Repo-Specific Guardrails / UX Resilience / Fix Development):
  OPERATOR DECISION STILL NEEDED** — same lever; B2 alone measures 40,870,
  still over. Drafted both ways (§4.3/§4.4).
- **B4 (Profile Shapes): NO DECISION NEEDED THIS SLICE.** Still future-slice.
  2b strengthens the eventual case (architecture.md as rule-content home is
  now precedented) but nothing here moves it.
- **OQ-1 (new, small): PRIN-21's canon elaboration home.** D6 (2026-07-14)
  ruled the human-override doctrine's canon home is
  `ux-design-specification.md`; that section is not landed. The index row
  currently points at the OPQ-62 ruling + the Proposed `MMT-ADR-0046`, with a
  note. Operator/WI-2052 call: land a UX-spec section now (expands the
  landing surface) or keep the pointer as drafted until the UX-spec work
  lands (recommended: keep as drafted; re-point when the UX-spec section
  exists).

## 7. Residual risk — updated

1. **No CI script parses the moved sections by literal match** (verified):
   `rg -l 'AGENTS\.md' scripts/` → 12 files reviewed; the only
   content-asserting hit is `scripts/api-integration-routing.test.ts:263-270`
   → asserts a literal in `## Required Validation`, a STAY section under
   every variant. WI-2052 must not touch that line. Snapshot-count parsers
   (`validate-doc-versions.sh` / `update-claude-md.sh` / `_doc-counts.sh`)
   read only `## Snapshot` (STAY). Section names in script comments/error
   messages keep working — after landing they point at stubs that redirect.
2. **Dual-homed envelope contract:** PRIN-09's text still cross-refs
   `architecture.md` → "LLM Response Envelope" (`architecture.md:1273`).
   Under 2b both halves now live in the same file — WI-2052 may leave the
   cross-ref as-is (it resolves in-file) or tighten it; no content change.
3. **The 40k ceiling is a harness constant, not re-verified this session.**
4. **Growth rate:** AGENTS.md grew ~7.2k in 7 weeks. Even the best variant's
   margin (639 bytes) is ~1–2 weeks of unmanaged drift — the §4.2 rider must
   be enforced in review from day one.
5. **CLAUDE.md is a pointer (`@AGENTS.md`)** — no edit needed at landing.
6. **Catalog↔canon parity check** (ADR-0000 §I.3 names it a build-time
   follow-up): not part of WI-2052; capture as a follow-on WI — a trivial
   guard greps that every `PRIN-NN` in `principles.md` has exactly one
   `[PRIN-NN]` marker in `architecture.md`, and vice versa.
7. **ID scheme provenance:** `PRIN-NN` flat numbering minted by this draft;
   ADR-0000 explicitly leaves the scheme open ("build-time detail, not fixed
   here"), so no constitutional amendment is implied. Contingent B2/B3
   landings continue the sequence (§4.4) — never renumber existing IDs.

## 8. WI-2052 handoff checklist (mechanical)

1. Obtain the §1.3 lever ruling (recommended: B2+B3 → 39,361). WI-2052 is
   frozen until this is ruled.
2. Check `MMT-ADR-0046`'s status at landing: if Accepted, simplify PRIN-21's
   "Established by" cell to a plain ADR cite; if still Proposed, land as
   drafted (it deliberately confers no ADR authority). Same check for OQ-1:
   if a UX-spec human-override section has landed, re-point PRIN-21's
   elaboration there.
3. `cp` the READY sibling → `docs/canon/principles.md` (verbatim, 5,054 B).
4. Insert the §3 block into `architecture.md` (end of Implementation
   Patterns & Consistency Rules); if the lever is ruled, append the §4.4
   sections (verbatim bodies + `[PRIN-NN]` markers + index rows).
5. Apply the §4.1 stubs (+ §4.3 if ruled) — each replaces its whole section;
   insert the §4.2 rider into the preamble.
6. `wc -c AGENTS.md` — expected ≈39.4k (B2+B3) — and paste the number into
   the PR body with this file's §1.2 table.
7. Do not touch `scripts/api-integration-routing.test.ts` or the Snapshot
   count lines (§7.1).
8. Update `docs/INDEX.md` if it indexes AGENTS.md sections (check at
   landing); memory-side stub for `project_known_bug_patterns` stays deferred
   (§5); capture the parity-check follow-on WI (§7.6).
