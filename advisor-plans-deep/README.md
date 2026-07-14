# Implementation Plans — master index (plans 001–024)

**This is the single reconciled index for _both_ plan directories.** Plans are
numbered **monotonically across the whole repo**: `advisor-plans/` holds 001–012,
`advisor-plans-deep/` holds 013–024. A plan number now identifies exactly one file.

| Directory | Plans | Produced by |
|---|---|---|
| `advisor-plans/` | **001–012** | two earlier `quick` runs, scoped to `apps/api` only |
| `advisor-plans-deep/` | **013–024** | the 2026-07-13 whole-repo `deep` run (this set) |

> ⚠️ **Numbering was previously ambiguous and has been fixed.** This set was
> originally numbered 001–008, colliding with `advisor-plans/`. It has been
> renumbered to **013–020**, and four new plans added as **021–024**. If you hold a
> reference to an old "deep plan 00N", add 12.
>
> ⚠️ **`advisor-plans/README.md` is now a stale partial index** — it lists only
> 001–012 and does not know this set exists. **This file supersedes it.** Replacing
> it with a pointer here is a one-line follow-up (see ACTIONS in the handover).

All plans were written against commit **`8c049b93f`** (branch `improve-api-audit`).
Each carries its own drift check — run it first.

Each executor: read the plan fully before starting, honor its STOP conditions, and
update your row below when done.

---

## Execution order & status

Ordered by priority, then by leverage. **016 is listed first for leverage, not
dependency** — it speeds up every verification loop after it, and it is the one plan
that can legitimately end in "revert and document", so learning its result early is
cheap and useful.

### `advisor-plans-deep/` — the whole-repo deep run (013–024)

| Plan | Title | Priority | Effort | Risk | Finding | Status |
|------|-------|----------|--------|------|---------|--------|
| 016 | Parallelize the serial CI unit suites (measured, revert path) | P2 | S | **MED** | #4 | TODO |
| 013 | Tear down guardianship/supportership edges in the 4 person-scoped deletes | **P1** | S | LOW | #1 | TODO |
| 014 | Close the under-18 vendor bypass in the legacy LLM fallback | **P1** | S | LOW | #2 | TODO |
| 019 | Make the adult-owner gate use the exact birth date | **P1** | S | LOW | #18 | TODO |
| 021 | Delete homework photos of minors from the device cache | **P1** | S | LOW | #6 | TODO |
| 015 | Stop persisting learner free-text to plaintext AsyncStorage; purge on sign-out | **P1** | M | MED | #3 | TODO |
| 017 | Make `getSubjectProgress` read the latest curriculum version | P2 | S | LOW | #5 | TODO |
| 020 | Stop one malformed signal field from discarding the whole LLM envelope | P2 | S | LOW | #19 | TODO |
| 022 | Stop the blind metadata full-replace clobbering challenge-round state | P2 | S | LOW | #7 | TODO |
| 023 | Stop a swallowed log-write from double-notifying the parent | P2 | S | LOW | #8 | TODO |
| 024 | Remove the unused `@naxodev/nx-cloudflare` dep (and its Next.js tree) | P2 | S | LOW | #9 | TODO |
| 018 | Prevent double-submit on visibility-link creation | P3 | S | LOW | #15 | TODO |

### `advisor-plans/` — the earlier `apps/api` quick runs (001–012)

Reproduced here for a single view. Their own dependency notes live in
`advisor-plans/README.md` and still apply — in particular **002 first**, because
the CI change-class router will not run tests added by 006/008 until 002 widens it.

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 002 | Route service-diff PRs through API integration suite (CI change-class gap) | P1 | S | — | TODO |
| 003 | Close X-Profile-Id owner-gate IDOR on 7 un-swept owner routes | P1 | M | 002 (soft) | TODO |
| 004 | Strip learner free-text from Sentry + add beforeSend scrubber | P1 | S | — | TODO |
| 005 | Clamp day-of-month in billing/quota cycle-reset date math | P1 | S | — | TODO |
| 006 | Add route-handler tests for family-join (+ speaking-practice) | P2 | S | 002 | TODO |
| 007 | Unit-test the sliding-window rate limiter + IP resolver | P2 | S | — | TODO |
| 008 | Test webhook dispatcher + v2 top-up money writes for real | P2 | M | 002 | TODO |
| 009 | Unify the two session idempotency gates to one fail-closed policy | P2 | S | — | TODO |
| 010 | Define + apply a read-side profile-authority check (spike + fix) | P2 | L | 003 | TODO |
| 001 | Curriculum-adapt signal switch exhaustiveness guard (prior run) | P2 | S | — | TODO |
| 011 | Adopt the replay harness to test Inngest step idempotency (or delete it) | P3 | M | — | TODO |
| 012 | Stop normalizeReplyText corrupting escape-sequence coding prose | P3 | S | — | TODO |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (one-line reason) | REJECTED (one-line rationale)

---

## Dependency notes (013–024)

- **No hard dependencies among 013–024.** They touch disjoint files and can run in
  parallel if you have the executors.
- **016 first for leverage, not dependency.** It speeds up everything after it, and
  it is the only plan with a real chance of ending in *"reverted, constraint
  documented"* — which is a **successful** outcome for it, not a failure.
- **013 and 014 matter most.** If only two plans ever ship, ship these.
- **Every plan except 016 and 024 requires a red–green–revert break test** (write it,
  watch it fail, apply the fix, watch it pass, revert the fix, watch it fail again).
  For 013, 014, 019 and 021 this is **mandatory repo policy** — they are
  compliance/security/safety class. 016 and 024 are exempt because they add no
  behaviour to assert (their verification is the existing suite and the build).
- **014 and 019 are the same class of defect** — an age/safety gate that is wrong on
  a path nobody tested — but they are independent: different files, no shared code.
- **020 is safe only because the server already fails safe.** Its Step 4 verifies
  that; if that verification fails, the plan must not ship.
- **022 and 023 are both "the code documents an invariant it then violates."** They
  are independent, but reviewing them together is instructive.
- **024's real risk is documentation, not code.** The code change is one deleted
  line; the risk is leaving `architecture.md` describing a deploy plugin that no
  longer exists.

---

## The five P1s, in one paragraph each

**013 — GDPR/COPPA erasure provably never completes.** The four person-scoped delete
functions in `deletion-v2.ts` drop a `person` row without first tearing down its
`guardianship`/`supportership` edges. Those FKs are `ON DELETE RESTRICT`, and *every*
managed child gets a guardianship edge at creation. So all three statutory
auto-erasure pipelines (consent withdrawal, archive cleanup, day-30 no-consent) raise
a foreign-key violation, roll back, retry 5×, and escalate to Sentry — presenting as
a monitored alert rather than an outage, which is why it survived. The whole-org path
already does this teardown correctly (added as "WI-849 Gap 3"); the fix was simply
never applied to the person-granularity siblings. The imports are already in the file.

**014 — Under-18 vendor ban is bypassable on the degraded path.** Gemini/Vertex are
banned for minors. The *primary* model selector enforces this. The *legacy fallback*
selector takes no `ageBracket` parameter at all, so when an Anthropic/OpenAI primary
fails and Gemini is registered, it returns Gemini unconditionally. Production is safe
today only because `LLM_ROUTING_V2_ENABLED=true` — but that flag **defaults to
`'false'`** in `config.ts:190`, so any environment that does not explicitly set it
takes the age-blind path. No test pairs a minor with a fallback, because the function
cannot express one.

**019 — The adult-owner gate opens up to 11 months early.** `isAdultOwner()` — the
helper behind the "Add child" 18+ gate — decides adulthood by **year subtraction**, so
someone born in December reads as an adult from January of their 18th year while still
17. AGENTS.md names the "adult-owner gate" *explicitly* as one that must use
`computeAgeBracketFromDate()`. The exact-date fields were even added to the client
profile **specifically so these pre-checks could match the server** (WI-1259/WI-367) —
and `isAdultOwner` never read them. Meanwhile `navigation-contract.ts:209` has its own
copy that *does* use them correctly, so the two layers disagree about the same person
for up to 11 months.

**021 — Homework photos of minors are never deleted from the device.** `deleteAsync`
appears **zero times** in the entire mobile source. Every homework capture writes up to
three files to `FileSystem.cacheDirectory` — a stable copy plus a resized intermediate
per OCR and per upload — and none are ever removed: not on unmount, not when a new
capture replaces the old one, not on a TTL. These are camera photos of children's
handwriting. The OS *may* evict `cacheDirectory` under storage pressure, but that is an
eviction policy, not a retention policy, and it is not a defence in a data-minimisation
review. The repo already guards the **read** side of these very URIs
(`_image-uri-allowlist.ts`); the write side has no matching discipline.

**015 — Minors' chat transcripts sit in plaintext on disk.** No `shouldDehydrateQuery`
filter exists anywhere in the mobile app, so TanStack's default persists *every*
successful query — including `['session-transcript', …]` — to unencrypted AsyncStorage.
And sign-out clears only the *legacy* un-scoped cache key, never the current
`eduagent-query-cache::<userId>` one. The per-user key scoping (BUG-357) is a *different*
bug that is already correctly fixed; don't undo it.

---

## Full findings table (all 19 vetted findings)

Every cited line was re-opened in source by the advisor before it reached this table.
Six subagent claims were **rejected** on vetting (see below).

| # | Finding | Where | Category | Priority | Conf | Plan |
|---|---------|-------|----------|----------|------|------|
| 1 | Person-scoped deletes never tear down guardianship/supportership edges → statutory erasure FK-violates and never completes | `deletion-v2.ts:584,650,746,804` vs `:444,452` | security/compliance | **P1** | HIGH | **013** |
| 2 | Legacy LLM fallback selector is age-blind → minors routable to Gemini; safe path is not the default | `router.ts:1030-1035,1053-1070`; `config.ts:190` | security/minors | **P1** | HIGH | **014** |
| 3 | Learner transcripts persisted plaintext to AsyncStorage, never purged on sign-out | `query-persister.ts:82-88`; `sign-out-cleanup.ts:104-110` | security/privacy | **P1** | HIGH | **015** |
| 4 | CI runs ~483 mobile suites serially (`--runInBand`, no `maxWorkers` anywhere) | `mobile-ci.yml:180`; `package.json` | dx | P2 | HIGH | **016** |
| 5 | `getSubjectProgress` reads an arbitrary curriculum version (no `orderBy`) → two screens disagree | `progress.ts:177-179` | correctness | P2 | HIGH | **017** |
| 6 | Homework photos of minors never deleted; `deleteAsync` appears zero times in mobile src | `use-homework-ocr.ts:102-114,172,199` | security/privacy | **P1** | HIGH | **021** |
| 7 | Blind metadata full-replace clobbers a just-committed challenge-round write | `session-exchange.ts:454-469,2782,2869,2916,2928` | correctness | P2 | HIGH | **022** |
| 8 | Swallowed dedup-log write → parent gets both push **and** email for one digest | `notifications.ts:210-229`; `weekly-progress-push.ts:822-828` | correctness | P2 | HIGH | **023** |
| 9 | `@naxodev/nx-cloudflare` is declared but wired to nothing; drags in Next.js + 5 high advisories | `package.json:75` | deps | P2 | HIGH | **024** |
| 10 | Memory-consent toggle does check-then-act with no row lock, while 3 siblings in the same file use `FOR UPDATE` | `learner-profile.ts:1641-1691` | correctness | P3 | MED | — |
| 11 | `review-calibration-grade` makes a paid LLM call **and** a bare insert in one `step.run` → retry double-charges | `review-calibration-grade.ts:135-248` | correctness | P3 | MED | — |
| 12 | AGENTS.md snapshot counts are materially wrong (see below) | `AGENTS.md` "Snapshot" | docs | P3 | HIGH | — |
| 13 | Two runtime circular imports: `assessments ↔ retention-data`, `family-bridge ↔ family-bridge-v2` | `assessments.ts:34` ↔ `retention-data.ts:65` | tech-debt | P3 | HIGH | — |
| 14 | `dispatchId` minted from `Date.now()` outside `step.run` → a retry defeats both dedup guards | `filing-timed-out-observe.ts:183` | correctness | P3 | MED | — |
| 15 | Double-submit on visibility-link creation (`Pressable` with no `disabled`) | `link/initiate.tsx:183-194` | bug | P3 | HIGH | **018** |
| 16 | Speaking-practice stale-response overwrite — no sequencing token on `mutateAsync` | `SpeakingPracticeActivity.tsx:63-88,103-111` | correctness | P3 | MED | — |
| 17 | `.nullable().optional()` drift (~10 sites) against the repo's stated request/response canon | `inngest-events.ts`, `snapshots.ts` | tech-debt | P3 | HIGH | — |
| 18 | Adult-owner gate uses year-only subtraction, not `computeAgeBracketFromDate` → opens 11 months early | `packages/schemas/src/age.ts:96-107` | security/minors | **P1** | HIGH | **019** |
| 19 | `challenge_passed` hard-required → one malformed field discards the entire LLM envelope | `packages/schemas/src/llm-envelope.ts:157` | correctness | P2 | HIGH | **020** |

---

## `packages/` — audited, and **not** a coverage gap

An earlier version of this README listed `packages/` as unaudited. **That was stale.**
`packages/` was audited (schemas, database, retention, test-utils) and produced **three
findings — #17, #18, #19 — two of which are already plans (019 and 020).**

Finding **#18** (`packages/schemas/src/age.ts`) is one of the five P1s. Since
`packages/schemas` is the shared API↔mobile contract, a defect there is a defect
everywhere — which is exactly how a year-only age gate ended up disagreeing with the
mobile navigation layer about whether the same person is 18.

The rest of `packages/` came back **clean, and clean for good reasons** — recorded here
so nobody re-audits it:

- **`getProfileScopedTables()` is derived**, not hand-maintained — it scans the schema
  files. It therefore *structurally cannot* go stale, which is the failure mode you
  would otherwise expect.
- **`z.coerce.number()` on `limit` params** looks like the classic coercion hazard, but
  every site is `.int().min(1).max(50)` — `""` → 0 fails `.min(1)`, `"abc"` → NaN fails
  `.int()`. **Closed.**
- **`z.record(z.string(), z.unknown())` on JSONB** is the *documented* convention
  (`account.ts:159`), with typed parsing in `db-jsonb.ts`. **Not a finding.**
- **Five RLS-enabled-without-policy tables** are fail-closed in Postgres and are a
  documented, tracked backlog item.

---

## Deprioritized: vetted, real, and deliberately **not** planned

These are genuine. They are P3 because the (impact × confidence) ÷ effort maths does
not justify an executor ahead of the twelve plans above — not because they are wrong.
Each is one line to re-find if priorities change.

- **#12 — AGENTS.md snapshot counts are wrong.** This does not need a *plan*; it needs
  someone to type the right numbers. Every agent reads this block to size the repo.
  Actual counts as of `8c049b93f`: **584** API test suites (claimed 329), **74** Inngest
  functions (claimed 69), **53** route groups (claimed 50), **113** mobile screens
  (claimed ~88). Just fix it.
- **#11 — `review-calibration-grade` double-charges on retry.** The strongest of the
  deprioritized set, and the closest call. A paid LLM call and an un-keyed insert share
  one `step.run`, so a retry re-bills the grading call and duplicates a retrieval event.
  It is P3 only because the blast radius is bounded (one grading call; the duplicate row
  is in a calibration table, not a user-facing one), the confidence is MED, and the fix
  is effort M. If any LLM-cost work gets scheduled, promote this first.
- **#16 — Speaking-practice stale-response overwrite.** A slow first response landing
  after a re-record shows the learner feedback for the wrong attempt. Cheap to fix (one
  sequencing token), genuinely annoying when it hits, but self-correcting on the next
  attempt and MED confidence. Note `advisor-plans/006` already adds speaking-practice
  route tests — **fold this in there** rather than opening a separate front.
- **#10 — Memory-consent toggle race.** Check-then-act with no row lock, where three
  sibling writers in the same file use `db.transaction` + `FOR UPDATE`. Real drift from
  an established in-file pattern, but it needs two concurrent toggles of the same consent
  switch by one user — not a realistic race in a single-session mobile app. Fix it the
  next time that file is opened for any reason.
- **#14 — `dispatchId` from `Date.now()` outside `step.run`.** A step retry recomputes
  the id, so the two events do not share an idempotency key and both dedup guards are
  defeated. The system is nonetheless correct **today** — but only via a *separate atomic
  claim* that happens to backstop it, i.e. it is right by accident rather than by the
  guard it was designed around. P3 because nothing is currently broken; worth fixing (or
  at minimum *documenting* the backstop) before anyone touches that flow.
- **#13 — Two runtime circular imports.** No runtime symptom today; two small
  extractions clear both. Pure tech-debt.
- **#17 — `.nullable().optional()` drift.** ~10 sites in `inngest-events.ts` /
  `snapshots.ts` deviating from the repo's stated request→`.optional()` /
  response→`.nullable()` canon. These are **internal event payloads**, not API
  request/response, and enforcement is docs-only (no checker). A conformance nit, not a
  bug. Explicitly no plan.

---

## Findings considered and **rejected** (do not re-audit)

Each was claimed by a subagent and **killed by re-reading the source**:

- **"Chat and library lists aren't virtualized."** False. `ChatShell` is a `FlatList`
  with a memoized row (fixed under BUG-740/PERF-10); the library's main list is a
  virtualized SectionList. The only `ScrollView` + `.map()` is a bounded
  `maxHeight: 360` manage-subjects modal.
- **"`dashboard.ts` has zero test coverage."** False. It has
  `dashboard.integration.test.ts` (71KB), `dashboard.helpers.test.ts`, and
  `routes/dashboard.test.ts`. It merely lacks a file *named* `dashboard.test.ts`.
- **"Several `check:*` guard scripts are orphaned."** False. The two that appear unwired
  (`check:i18n:jsx-literals`, `check:migration-immutability`) run in CI via
  `pnpm exec tsx scripts/*.ts` (`ci.yml:210`, `ci.yml:304`) rather than the npm alias.
- **"`tests/integration/` is empty."** False — **an advisor glob error, caught on
  re-check.** It holds 59 integration suites, matching AGENTS.md's ~57.
- **God-module splits** (`test-seed.ts` 6.4K LOC, `curriculum.ts`, `exchanges.ts`,
  `progress.ts`, …). Big but **cohesive**, fan-in 0–6. Splitting is churn for churn's
  sake. The one genuine seam is the Challenge-Round state machine inside
  `session-exchange.ts` (~1300 LOC) — worth extracting *if* that area is touched again,
  not on its own.
- **The 85 `pnpm audit` advisories.** ~0 are production-reachable; essentially all trace
  to build/dev tooling. The only actionable slice is `@naxodev/nx-cloudflare` → **plan 024**.

Also verified **correct as built** (clean negatives — do not re-audit): Sentry PII
scrubbing (age-gated, IDs only), deep-link path-traversal (already fixed, WI-284/DS-195),
WebView (not used), cleartext traffic (E2E-only, unshippable), SecureStore key hygiene,
whole-org erasure **atomicity** (single transaction, TOCTOU-guarded), the V2 LLM fallback
selector, envelope fail-closed parsing, the circuit breaker (its per-isolate limitation is
a documented, accepted tradeoff), API layering / junk-drawers / LLM-call discipline, effect
cleanup (all 17 `addEventListener` and 12 `setInterval` sites have matching teardown), and
the Expo Router ancestor-chain + `unstable_settings` bug class — the repo's most notorious
documented bug class, which came back **completely empty**.

---

## Coverage gaps — what this plan set does NOT rest on

- **Direction / roadmap is unaudited.** That category produced no usable output and was
  deliberately not re-run. It is the lowest-signal category; treat it as **not looked at**,
  not as clean.
- Everything else in scope (`apps/api`, `apps/mobile`, `packages/`) was audited.
  `docs/_archive/` was skipped by instruction.

---

## Provenance

Eighteen read-only audit subagents across three waves (correctness and security on Sonnet;
tests, performance, tech-debt, dependencies, DX, docs, direction on Haiku), plus a
follow-up wave over `packages/`, plus a dedicated pass over the repo's ADRs and `CONTEXT.md`
to suppress ADR-settled tradeoffs before they reached the findings table.

**Every excerpt in every plan is the advisor's own read of the source, not a subagent's
report.** Six claims died on that vet — including one of the advisor's own.
