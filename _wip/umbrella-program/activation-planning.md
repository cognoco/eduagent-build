---
title: Activation Planning — Umbrella Program
status: RATIFIED 2026-06-10 (see § Ratification record) — analysis + charters; queue's home is the roster
date: 2026-06-10
owner: umbrella (orchestrator ratified 2026-06-10)
note: >
  POINTERS, NEVER COPIES. This document holds proposals and analysis only.
  Per-finding detail lives exclusively in L-gap-delta.md. Program state lives
  in program-roster.md. Cosmo is not touched by this document.
---

# Activation Planning — Umbrella Program

> **What this is.** The activation planning analysis for the emerging
> Initiatives PRG-10 through PRG-15, plus normalization of the PRG-16 singleton
> tail. Authored as proposals; **ratified 2026-06-10** — see the Ratification
> record below for what changed at ratification.

## Ratification record (2026-06-10)

Ratified by the orchestrator with these amendments:

1. **CI/Platform pair (F-151 + F-157): FOLDED into PRG-14 as a named subset** —
   the §1 "standalone mini-batch" alternative is rejected; no new row.
2. **The activation queue's home is the roster** (`program-roster.md`
   § Activation queue), per the planning-reference document map — and it was
   amended at ratification from the §4 six-entry near-term ranking to the
   **full forward view** (11 entries: adds the PRG-02 tail quick-land batch,
   the PRG-03 WI-587 ruling session, PRG-04, PRG-20, PRG-21). §4 below is the
   surviving *readiness analysis* behind the emerging-Initiative entries — read
   the roster for the operative queue.
3. **PRG-16 normalization verdicts ratified as proposed** (1 DROP / 7 MERGE /
   7 PARK, counting the CI/Platform fold as two PRG-14 merges) — recorded on
   the roster's PRG-16 row (DISSOLVED).
4. **PRG-04 instantiated** — Cosmo design WI `WI-590` (project Nexus) captured;
   related capability (WI-519/441/462/468, precedent WI-532) referenced, not
   absorbed.
5. **Per-charter open questions stay open** — each is settled at that
   Initiative's activation (most need execution-time evidence: file-touch
   scans, W-wave landings), not now. Exception already ruled: the PRG-03/PRG-14
   boundary split (PRG-03 owns F-037/F-045; PRG-14 owns
   F-038/039/040/041/042/046/113/114) **stands as proposed**.
>
> **Parse note.** L-gap-delta.md is a pipe-delimited markdown table with ~183 rows
> (183 findings + INV-1/INV-2 synthetic rows). Counts in this document were derived
> by Python-parsing the `Defer-to-workstream` column (field 10, 0-indexed). ~2 rows
> are documented to have embedded pipes (roster note) — the parse produced a
> consistent 183-row total with no unexplained remainder, so embedded-pipe drift is
> immaterial at this altitude. Tallies are noted "tolerant parse" where this caveat
> applies.

---

## Section 1 — PRG-16 Singleton Tail Normalization (PROPOSAL)

The `Defer-to-workstream` column in L-gap-delta.md carries 15 labels that each
appear exactly once. O §2 lists 12 of them explicitly under "singletons" and names
three additional deferred singletons separately (`agent-infrastructure`,
`navigation/audience-matrix`, `platform-security / ci-cd-hardening`). None should
be enshrined as a standing Initiative.

**Parse note.** The raw `Defer-to-workstream` counts (tolerant parse, L-gap-delta):

| Label (exact as in L-gap-delta) | Finding | One-line gist |
|---|---|---|
| `secrets-hygiene` | F-035 | Plaintext Logfire key embedded in `.claude/settings.local.json` |
| `infrastructure / database-performance` | F-002 | Per-request Neon pool churn — disabled cache path (latency + connection pressure) |
| `backend-performance` | F-006 | Fetch-all-then-filter-in-JS on hot-read paths — Workers CPU + subrequest budget |
| `agent-infrastructure` | F-036 | `autoMemoryDirectory` points at wrong filesystem tree |
| `platform-security / ci-cd-hardening` | F-116 | No repo-local GHA security checklist skill (SHA pinning, pull_request_target, OIDC) |
| `content / curriculum data quality` | F-149 | Duplicate accepted-aliases where diacritic variants were ASCII-flattened |
| `ci-cd-hardening` | F-151 | Unreachable analyze-step branch — latent `base.ref` script-injection sink |
| `mobile-testing-infra` | F-155 | `IS_E2E_BUILD` gate omits `__DEV__` guard its sibling uses |
| `platform-infra` | F-157 | Required 'smoke' check is a structural no-op (always 'skipped') on every PR |
| `test-infrastructure` | F-159 | `staleMs` parsed without finite-number guard (sibling has it) |
| `learning-engine` | F-169 | Lost-update race in reviewVocabulary SM-2 read-compute-write |
| `mobile-cache-data-fetching` | F-170 | Pending celebration writes can still lose concurrent updates |
| `reliability-and-correctness` | F-171 | Lost-update race in celebration writes — SELECT FOR UPDATE outside read |
| `billing-subscriptions` | F-173 | `downgradeQuotaPool` race can reset quota pool of just-upgraded account |
| `navigation/audience-matrix` | F-176 | Proxy mode not cleared when profile removed server-side (sticky contradictory state) |

### Proposed normalization verdicts

| Finding | Current label | Proposed verdict | Target / rationale |
|---|---|---|---|
| **F-035** | `secrets-hygiene` | **DROP** (already done) | **REMEDIATED 2026-06-09** — L-gap-delta row says `REMEDIATED`; Logfire key rotated, file cleaned. Nothing to activate. |
| **F-036** | `agent-infrastructure` | **MERGE → PRG-03** | Doc/config finding (harness config correctness); PRG-03 owns agent-instruction and harness-surface cleanup. O §2 blast-radius: `out-of-radius (doc/config)`, parallel-safe. |
| **F-116** | `platform-security / ci-cd-hardening` | **MERGE → PRG-14** | This is a skills/doc finding (no repo-local GHA skill) — the same class as F-113/114. PRG-14 (agent-instructions) already carries the GHA-adjacent angle; `tech/gha-hardening` is the upstream partial-cover. O §2: out-of-radius, parallel-safe. |
| **F-151** | `ci-cd-hardening` | **MERGE → new mini-cluster "CI/Platform"** (see below) | Dead-code latent injection in a GHA workflow step — CI code, not a skill finding. Same cluster as F-157. O §2: out-of-radius, parallel-safe. |
| **F-157** | `platform-infra` | **MERGE → new mini-cluster "CI/Platform"** | Required smoke check is a structural no-op — CI/branch-protection config. Pairs naturally with F-151. O §2: out-of-radius. |
| **F-002** | `infrastructure / database-performance` | **PARK (bucket-4-like)** | Scale/latency — no active feature work forces it; too small to warrant a standalone Initiative. Revisit when connection pressure becomes observable in production. |
| **F-006** | `backend-performance` | **PARK** | Same rationale as F-002 — Workers CPU pressure on hot reads. Merge with F-002 if both are activated. |
| **F-155** | `mobile-testing-infra` | **PARK** | Single-line test inconsistency (`IS_E2E_BUILD` missing `__DEV__`). Minor; park until a broader test-infra sweep is warranted. |
| **F-159** | `test-infrastructure` | **PARK** | Single missing guard in one test helper; same rationale as F-155. |
| **F-149** | `content / curriculum data quality` | **PARK** | Data-quality issue in content (diacritic alias collision) — requires content-team input; no engineering owner. |
| **F-169** | `learning-engine` | **MERGE → PRG-11 (architecture)** | Lost-update race in vocabulary SM-2 — a data-access/correctness defect in the learning-engine service layer. Fits PRG-11's architecture/correctness mandate. O §2: out-of-radius for the IF rewrite; no blast-radius gate. |
| **F-170** | `mobile-cache-data-fetching` | **MERGE → PRG-11** | Concurrent-write race in celebration — similar data-access correctness class. |
| **F-171** | `reliability-and-correctness` | **MERGE → PRG-11** | Lost-update in celebration writes — same class as F-170. |
| **F-173** | `billing-subscriptions` | **PARK** | Billing race condition — the billing surface overlaps IF W4 (WP-W4-billing-credits). Activate only after W4 lands to avoid conflict. |
| **F-176** | `navigation/audience-matrix` | **PARK** | State-inconsistency bug (proxy mode not cleared). Non-identity nav bug; O §2 says `out-of-radius, parallel-safe` but it's a single-file mobile fix with no clear Initiative home until PRG-11 scopes nav work. Revisit at PRG-11 activation. |

### Proposed new mini-cluster: "CI/Platform hardening" (2 findings)

Propose creating a micro-cluster (not a full Initiative) of 2 findings:
- **F-151** — latent script-injection in unreachable GHA analyze-step branch
- **F-157** — required 'smoke' check is a structural no-op

Both are CI/workflow correctness findings, both are O §2 out-of-radius / parallel-safe,
both are low-execution-cost (1-2 PRs each). Proposal: add as a named subset of PRG-14's
scope OR treat as a standalone 2-item mini-batch executed during any available agent
slot (no new Initiative row needed — too small).
**RULED 2026-06-10: folded into PRG-14 as a named subset** (see Ratification record).

### Summary after normalization

| Post-normalization bucket | Findings | Note |
|---|---|---|
| DROP (done) | F-035 | Remediated |
| MERGE → PRG-03 | F-036 | Parallel-safe |
| MERGE → PRG-14 | F-116 | Parallel-safe |
| MERGE → PRG-11 | F-169, F-170, F-171 | Architecture/correctness cluster |
| New mini-cluster "CI/Platform" (or fold to PRG-14) | F-151, F-157 | 2 findings, parallel-safe |
| PARK (performance) | F-002, F-006 | No urgency gate |
| PARK (test infra) | F-155, F-159 | Minor inconsistencies |
| PARK (content) | F-149 | Needs content-team input |
| PARK (billing, post-W4) | F-173 | Activate after IF W4 |
| PARK (nav, revisit at PRG-11) | F-176 | Single-file mobile fix |

---

## Section 2 — Initiative Charter Drafts: PRG-10 through PRG-15 (PROPOSAL)

> **Per-finding home:** L-gap-delta.md. This section holds digests and representative
> IDs only — never copies of finding text.

---

### PRG-10 — security-pii-api

**Outcome.** All 27 non-IF API security/PII findings remediated: unauthorized access
vectors closed, PII leakage surfaces patched, input-validation gaps filled, and CI/GHA
permission overprovisioning corrected.

**Finding digest** (27 findings, tolerant parse — see L-gap-delta.md for full register).

Thematic breakdown of the 27 bucket-3 findings:

| Theme | Approx count | Representative IDs |
|---|---|---|
| CI/GHA permission over-grant | 3 | F-024 (id-token:write on review jobs), F-127 (issues:write workflow scope), F-154 (fragile mobile-maestro gate) |
| LLM prompt injection / untrusted input | 3 | F-027 (ThemedMarkdown link/image injection), F-129 (PR title interpolated to prompt), F-139 (learner library context to system prompt) |
| Auth / access control | 4 | F-119 (@claude invokes secret-backed agent), F-132 (unauthenticated PR comment as verdict), F-143 (hardcoded seed password), F-138 (JWT tokens in web localStorage) |
| Input validation / unbounded input | 5 | F-142 (unbounded quiz attempts), F-158 (deep-link JSON unvalidated), F-166 (missing UUID on subjectId), F-179 (O(m×n) Levenshtein without length cap), F-180 (uncapped dictation chunks) |
| Race conditions / data integrity | 4 | F-120 (same-day dictation overwrite), F-164 (non-CAS version bump), F-167 (non-atomic regenerate), F-181 (unauthenticated JWKS DoS) |
| Unmetered/quota-bypass LLM | 2 | F-128 (homework LLM bypass), F-146 (app-help billing overcharge) |
| Misc security hygiene | 6 | F-077 (raw console.debug), F-079 (sql.raw GUC interpolation), F-080 (CORS all-localhost), F-081 (secrets in query strings), F-082 (test routes without secret in dev), F-148 (outbox rate-limit cross-feature interaction) |

**Blast-radius class (O §2 ratified):** `partly in-radius` — the non-IF API remainder
overlaps the api auth/PII surface that W2/W3 rewrites. Strategy: serialize / coordinate
the in-radius subset behind W2–W3; the remainder (CI/GHA, input validation, LLM
injection) is parallel-safe and can start anytime.

**Practical split:** the CI/GHA (F-024, F-127, F-154, F-129, F-132) and pure
input-validation findings (F-142, F-158, F-166, F-179, F-180) are blast-radius-safe
and can start pre-W2; the auth/PII surface findings (F-119, F-138, F-143, F-120, F-164,
F-167, F-181) should coordinate after W2 when the auth model is stable.

**Size estimate:** L (27 findings spanning CI, auth, validation, injection, quotas —
multi-PR sweep). Execution shape: mixed — a few agent-sweepable clusters (input
validation, CORS/config hygiene) plus human-review-needed PRs (auth, GHA permissions).
Supervision profile: medium — agent-heavy on the hygiene sweep; human review required
on auth/CI permission changes.

**Open questions for ratification:**
1. Should the CI/GHA subset (F-024, F-127) be split into the CI/Platform mini-cluster
   (see §1) rather than live in PRG-10? Both are GHA permission findings that overlap
   thematically with F-151/F-157.
2. Confirm blast-radius split: which specific finding IDs in PRG-10 are in-radius vs.
   out-of-radius? This needs a file-touch audit against W2/W3 WPs at execution time —
   the per-finding radius is not pre-declarable at master-plan altitude (O §2 note).

---

### PRG-11 — architecture

**Outcome.** All 25 bucket-3 code-structural findings resolved (circular dependencies
broken, god-modules decomposed, manual sync-points automated, domain organisation
corrected), plus 3 proposed merges from §1 (F-169, F-170, F-171) absorbed. F-012
(architecture.md doc-rot) resolved. Moot-by-refactor subset dropped at execution.

**Finding digest** (25 bucket-3 code-structural + F-012 doc + INV-2 jest.mock backlog
= 27 total in `architecture` Defer-to-workstream label; 2 are deferred F-008/F-100 —
see below).

Thematic breakdown of the 25 in-other-workstream architecture findings (excl. F-008,
F-100 deferred):

| Theme | Approx count | Representative IDs |
|---|---|---|
| Circular dependencies (runtime + compile) | 3 | F-011 (curriculum ⇄ language-curriculum), F-030 (type-only exchanges ⇄ exchange-prompts), F-034 (layer inversions services→middleware) |
| God modules / oversized files | 3 | F-007 (mobile session/shelf god screens + oversized service verticals), F-031 (navigation + conflict hotspots), F-014 (test-seed.ts 5,668 LOC + bundle risk) |
| Domain organisation | 4 | F-009 (metering.ts filename collision), F-010 (billing domain half-migrated), F-103 (Challenge Round mastery smeared), F-104 (session.completed dispatch stranded in route) |
| Test coverage gaps (architecture class) | 4 | F-097-class: F-098 (isClosePathAutoFileEligible no test), F-099 (retention cutoff no test), F-156 (GC1 multiline mock guard miss) + INV-2 (jest.mock backlog) |
| Mobile navigation / UX resilience | 4 | F-108 (V0/V1 gating copy-pasted 8 screens), F-109 (home surface magic prop), F-111 (quota-refund policy in SSE route), F-112 (createScopedRepository vs parent-chain duplication) |
| Data access / profile-context | 3 | F-105 (retry-filing duplicated), F-106 (profile-context resolution 20× repeated), F-107 (loadTopicTitle cross-profile leak risk) |
| Correctness races (proposed merge from §1) | 3 | F-169 (vocabulary SM-2 lost-update), F-170 (celebration write race), F-171 (celebration SELECT FOR UPDATE outside lock) |
| Doc-rot | 1 | F-012 (architecture.md circular-dep warning for non-existent edge) |

**Blast-radius class (O §2 ratified):** `partly in-radius` — the code-structural
findings that touch session-exchange / authority-graph modules are subsumed once W1
lands; which of the 24 (if any) is determined at execution against the file-touch set.
F-003 (session-exchange) and F-004 (the SCC) are bucket-2 obligations (W1 WPs) and
are NOT in this count. F-012 (doc) is parallel-safe.

**Moot-by-refactor subset (O §2 explicit):** the in-scope IF work explicitly subsumes
two bucket-2 findings:
- **F-003** (session-exchange god-module) — bucket-2, W1 WPs; not in PRG-11's 25.
- **F-004** (4-node SCC) — bucket-2, W1; not in PRG-11's 25.

Of PRG-11's 25, the circular-dependency and god-module findings that overlap the
session-exchange / authority-graph modules (likely F-011, F-031, F-106, F-107, F-108,
F-109, F-112) carry moot-by-refactor risk — determine at execution whether W1 fully
subsumes them before scheduling. **Propose DROP only at execution, not pre-declared.**

**Deferred findings in architecture label (NOT PRG-11's scope):**
- F-008 (`@eduagent/schemas` flat-barrel fan-in — bucket-4) — no mature owner; revisit
  when the schemas package itself is being restructured.
- F-100 (SQL cast in session-analytics.ts — bucket-4) — no test for future event-type.

**Size estimate:** L (25 clean-out + 3 proposed merges = 28 active; diverse
architectural concerns requiring deep code understanding per file). Execution shape: WP
bundles by theme (circular deps bundle, god-module bundle, domain-org bundle, nav-UX
bundle, data-access bundle). Supervision profile: human-led — architectural decisions
about decomposition boundaries require human sign-off; agents execute within approved
decomposition plans.

**Open questions for ratification:**
1. Confirm which of the 25 are moot-by-refactor after W1 lands — schedule a
   blast-radius scan at W1 completion before activating PRG-11 code-structural work.
2. Accept proposed merges of F-169/170/171 (correctness races) into PRG-11?
3. INV-2 (GC6 jest.mock backlog) is labeled `architecture` — it is a sweep class, not
   a discrete finding. Confirm it lives in PRG-11 or in PRG-02 (Harness Hygiene).

---

### PRG-12 — l10n-a11y-mobile

**Outcome.** All 34 l10n/a11y findings resolved: 358+ hardcoded English strings routed
through `t()`, pluralization migrated to i18n-native model, accessibility live-regions
and modal focus management wired, screen-reader role annotations complete, date locale
fixed.

**Finding digest** (34 findings — 33 F-IDs + INV-1; all bucket-3, tolerant parse).

Thematic breakdown:

| Theme | Count | Representative IDs |
|---|---|---|
| Hardcoded JSX text / l10n strings | 7 | F-061 (163 JSX sentences), F-062 (auth screens entirely English), F-069 (358 hardcoded strings — coordinator synthesis), INV-1 (no automated guard) |
| Accessibility: live-region / screen-reader announcements | 6 | F-050, F-051 (quiz result), F-053 (31 ActivityIndicator files), F-054 (confirmation toast), F-068 (coordinator: silence in core flow) |
| Accessibility: modal focus / roles / badges | 6 | F-052 (0 of 13 modals use accessibilityViewIsModal), F-055 (detached labels), F-057 (Tappables missing role), F-058 (badge color+text no role), F-070 (coordinator: all 13 modals) |
| Hardcoded accessibilityLabel / prop strings | 3 | F-063 (110 hardcoded screen-reader strings), F-064 (25 native dialogs), F-066 (60 label/title/placeholder sites) |
| Pluralization | 2 | F-065, F-071 (29 sites — doubly broken: hardcoded English + binary model) |
| Date/locale | 3 | F-067, F-072 (4 toLocaleDateString('en-US')), F-177 (localDate in UTC) |
| Logic bugs / UX (mobile) | 6 | F-123 (dormant web ChatShell voice controls), F-160 (sample-lesson buttons stuck), F-161 (locale false-positives in non-answer matching), F-165 (masteryScore NaN), F-168 (subjectId array case), F-172 (double-submit race), F-175 (sessionStorage in render), F-178 (quiz date UTC/local mix) |
| Decorative / low-vision | 2 | F-056 (decorative animations), F-059 (decorative icons in banners), F-060 (10px text) |

**Blast-radius class (O §2 ratified):** `out-of-radius` — UI/i18n/a11y layer; the
identity rewrite does not touch this surface. **Parallel-safe — anytime.**

**Size estimate:** L (34 findings; high-count but largely mechanical agent-sweepable
work — string extraction, aria attribute addition, pluralization migration). Execution
shape: agent-sweep model with validation passes; thematic batches (strings → a11y →
date/locale → bugs). Supervision profile: agent-heavy / low-supervision — PRG-12 is
the archetype for the first parallel activation (roster Post-P model).

**Open questions for ratification:**
1. The INV-1 finding ("no automated guard for hardcoded JSX strings") is the
   infrastructure finding — should it be a prerequisite step before the string sweep,
   or activated as part of the sweep? The `check-i18n-jsx-literals.ts` ratchet already
   exists per CLAUDE.md; INV-1 may be partially resolved — verify against current tree
   before scheduling.
2. F-123 (dormant web ChatShell) is labeled `l10n-a11y-mobile` but is actually a
   stale-instance / removal bug. Confirm it belongs in PRG-12 or a cleanup sweep.
3. F-172 (double-submit race) is a logic bug, not l10n/a11y — confirm placement or
   move to PRG-11/architecture.

---

### PRG-13 — security-pii-inngest

**Outcome.** All 6 non-IF Inngest security/PII findings remediated: minor-data PII in
step state and event payloads cleaned, concurrency state-isolation fixed, logic
correctness gaps resolved.

**Finding digest** (6 findings, all bucket-3):

| Finding | Theme | One-line gist |
|---|---|---|
| F-028 | PII / step state | Minor's full session transcript memoized in step return state (3 functions) |
| F-090 | PII / event payload | User feedback free-text and support email in `app/feedback.delivery_failed` event |
| F-091 | PII / step state | Inferred learner signals memoized in topic-probe-extract extract-signals step |
| F-094 | Configuration | Env bindings in module-level singletons — bleed across concurrent function runs in one isolate |
| F-162 | Logic bug | Self-reinvoke cursor skips profiles that errored mid-run (silent data loss) |
| F-174 | Logic bug | Recall-quality LLM grade computed before cooldown claim — wasted paid LLM call |

**Blast-radius class (O §2 ratified):** `partly in-radius` — the Inngest functions the
rewrite touches (transcript/event payload patterns). Serialize / coordinate the
in-radius subset behind W1-inngest-wiring + W3. F-090, F-094, F-162, F-174 are more
likely out-of-radius (non-identity Inngest functions); F-028/F-091 overlap the
transcript/filing functions W3 touches.

**Size estimate:** S (6 findings; clean, targeted fixes). Execution shape: agent-sweep
(3–4 PRs). Supervision profile: medium — PII data-handling changes need review even
when mechanical.

**Open questions for ratification:**
1. Per-finding radius determination: at W3 activation, scan which of F-028/F-091 are
   fully subsumed by WP-W3-pii-step-state (their bucket-2 sibling cluster). If
   subsumed, DROP rather than fix separately.
2. F-162 (cursor skips errored profiles) is a correctness bug unrelated to PII — fits
   PRG-11 alternatively. Confirm it stays in PRG-13.

---

### PRG-14 — agent-instructions

**Outcome.** All 10 agent-instructions findings remediated: CLAUDE.md/AGENTS.md
converged, stale skill descriptions corrected to trigger-only form, skill-sync gap
fixed, and repo-specific agent skills extended from the `tech/*` group base where the
tech skills provide only generic (vendor) coverage. PRG-14 boundary with PRG-03
maintained (PRG-03 owns the operational/harness extraction; PRG-14 owns the skills
and doc discipline findings).

**Finding digest** (10 findings, all bucket-3, all `Defer-to-workstream = agent-instructions`):

| Finding | Theme | One-line gist |
|---|---|---|
| F-037 | Doc consistency | CLAUDE.md and AGENTS.md diverge on skill paths and content |
| F-038 | Skill discipline | code-review / thermo-nuclear skill descriptions violate trigger-only rule |
| F-039 | Skill discipline | Generated commit skill description is a workflow summary, not a trigger |
| F-040 | Skill discipline | worktree-setup skill embeds workflow narration after valid trigger opening |
| F-041 | Doc staleness | Stale/imprecise source citations in CLAUDE.md profile-shape section |
| F-042 | Completeness/security | scope-keyword-check.sh references a non-existent skill, trivially bypassed |
| F-045 | Structure | CLAUDE.md mixes constitution-level rules with command cookbooks |
| F-046 | Maintainability | sync-skills.mjs is additive-only; removed masters leave orphaned generated copies |
| F-113 | Missing skill | No repo-local skill enforcing `@eduagent/schemas` as the API-facing type source |
| F-114 | Missing skill | No repo-local skill covering Drizzle/Neon scoping rules, profileId safety, migration rollback |

**PRG-14 vs PRG-03 boundary:**
- PRG-03 owns the *content* disposition of doc/memory files: the B0–B6 batch model
  (AGENTS.md/CLAUDE.md convergence, harness-left extraction, archive purge). Its
  N.0 routing explicitly includes the agent-instructions doc-findings (F-037/038/039/
  040/041/042/045/046, F-113/114) and declares them **HH / PRG-03, not Stream 2**.
- PRG-14's role is to *execute* the skill discipline and skill-building work: fixing
  the skill descriptions (F-038/039/040), fixing the hook (F-042), fixing sync
  (F-046), and building/extending the repo-specific skills (F-113/114, plus F-116 if
  merged from §1). PRG-14 does NOT own AGENTS.md/CLAUDE.md structural convergence
  (F-037, F-045) — those are PRG-03 / HH batch B4 and B3 respectively.
- Proposed boundary: **PRG-03 owns F-037, F-045** (structural document convergence);
  **PRG-14 owns F-038, F-039, F-040, F-041, F-042, F-046, F-113, F-114** (skill
  descriptions and skill building). Orchestrator to ratify this split.

**Blast-radius class (O §2 ratified):** `out-of-radius (canon/doc)` — parallel,
coordinated under Harness Hygiene / PRG-03, sequenced pre-P.

**Size estimate:** S–M (10 findings; 2 skill description fixes are trivial, skill
building for F-113/114/116 is M-class effort). Execution shape: mixed — trivial
doc/description fixes as an agent sweep; skill building requires design work.
Supervision profile: agent-heavy for fixes; human-led for skill content design.

**See Section 3 for the mandated PRG-14 `tech/*` dedupe analysis.**

**Open questions for ratification:**
1. Ratify the PRG-03/PRG-14 boundary split proposed above.
2. Accept the proposed merge of F-116 (`platform-security / ci-cd-hardening`) into
   PRG-14 (see §1)? This adds the GHA-skill building to PRG-14's scope.
3. F-041 (stale citations in CLAUDE.md profile-shape) — PRG-14 or PRG-03? It's a
   doc-staleness fix, but requires understanding the current nav-contract state to
   update correctly — may be PRG-14 (it needs the skill-update context).

---

### PRG-15 — errors-api

**Outcome.** All 8 error-handling findings remediated: silent-failure catch blocks
logged/escalated, error misclassification fixed, missing error context added, error
classification enforced at the API client boundary in mobile.

**Finding digest** (8 findings, all bucket-3):

| Finding | Theme | One-line gist |
|---|---|---|
| F-015 | Typed errors | system-prompt/events/flag handlers throw raw `Error('Session not found')` → 500 |
| F-016 | Misclassification | Vocabulary review catch-all misclassifies DB errors as 422, echoes raw err.message |
| F-017 | Misclassification | JWKS response shape unvalidated — malformed 200 misclassified as token error → 401/sign-out |
| F-022 | Silent failure | Silent-failure catch blocks across billing/session/family — bare catch, no log/escalation |
| F-047 | Silent failure | Silent swallow of DB failure fetching dictation struggles — bare `catch {}` |
| F-048 | Silent failure | Consent resend-counter rollback swallowed without logging (GDPR-adjacent) |
| F-049 | Missing context | Signature-verification catch discards error detail on Stripe/Resend webhook routes |
| F-110 | Mobile resilience | Error classification bypassed in 6 mobile screens — violates UX-Resilience rule |

**Blast-radius class (O §2 ratified):** `partly in-radius` — error/envelope handling
overlaps W3 (WP-W3-envelope-router handles F-025's envelope hardfail, which is a
bucket-2 IF obligation). Serialize / coordinate behind W3-envelope-router before
tackling the server-side error-handling surface (F-015–F-049). F-110 (mobile error
classification) is UI-layer — likely parallel-safe.

**Size estimate:** S–M (8 findings; relatively focused error-handling sweep). Execution
shape: agent-sweep with targeted PR per catch-block cluster. Supervision profile:
agent-heavy for the catch-block sweep; medium for typed-error classification (touches
API boundaries).

**Open questions for ratification:**
1. F-110 (mobile error classification) — parallel-safe now, or serialize behind W3?
   The mobile client reads server error responses; W3-envelope-router changes the
   server-side envelope shape. Recommend: fix mobile classification logic (the
   `classifyApiError` boundary) in parallel, but do not hard-code new error types
   until W3 defines the final envelope contract.
2. Confirm the W3-envelope-router serialize gate: specifically, should PRG-15 wait
   until WP-W3-envelope-router is closed (not just started)?

---

## Section 3 — PRG-14 Dedupe Analysis (mandated carry-forward from M)

> **Mandate.** M-triage-closure.md carry-forward note: "the agent-instructions
> workstream should dedupe against the tech-skill-group before building new skills —
> coverage is partial (those are vendor/generic skills; the findings ask for
> repo-specific discipline), so the work is reduce-and-extend, not build-from-scratch."

The `tech/*` skill-group landed at commit `e4c23f0c8` (2026-05-31) under
`.agents/skills/tech/`. Relevant skills: `tech/zod`, `tech/drizzle-atomicity`,
`tech/neon-postgres`, `tech/gha-hardening`.

### Per-finding coverage assessment

**F-113 — No repo-local skill enforcing `@eduagent/schemas` as the API-facing type source**

`tech/zod` covers: Zod v4 API, safeParse patterns, branded types, schema composition,
error handling, v3→v4 migration. Scope is generic — "TypeScript projects using zod
^4.0.0."

What F-113 asks for and what `tech/zod` does NOT cover:
- The `@eduagent/schemas` package as the **repo-designated single source of truth** for
  API-facing types (the "Do not redefine API-facing types locally" rule in CLAUDE.md).
- The `parseEnvelope()` / `llmResponseEnvelopeSchema` contract as the mandated LLM
  response parsing path.
- The `conversationLanguageSchema.safeParse` clamp pattern in `useMentorLanguageSync`.
- Trust-boundary parse discipline at this repo's specific trust boundaries (JWT decode,
  Inngest event payload intake, deep-link params).

**Verdict: PARTIALLY COVERED.** `tech/zod` provides the Zod mechanics; the repo-local
skill extends it with: (1) the `@eduagent/schemas` contract rule, (2) the enumerated
trust-boundary sites where zod parse is mandatory, (3) the LLM-envelope contract, and
(4) the `t()`-adjacent zod patterns for i18n. Extend, do not rebuild.

**F-114 — No repo-local skill covering Drizzle/Neon scoping rules, profileId safety,
migration rollback requirements, and atomic-update patterns**

`tech/drizzle-atomicity` covers: atomic multi-row writes, transactions, CTE patterns,
upsert idioms, rollback-by-throw. Generic Drizzle ORM patterns.

`tech/neon-postgres` covers: Neon connection strings, branching, pool configuration,
read-replica routing. Generic Neon platform guidance.

What F-114 asks for and what neither skill covers:
- `createScopedRepository(profileId)` — the repo's scoped-repo pattern and when to use
  it vs. the parent-chain join pattern.
- `profileId` protection requirement on all writes (the CLAUDE.md non-negotiable rule).
- The `SELECT FOR UPDATE` correctness requirement on concurrent writes (F-170/F-171
  propose merging here).
- Migration rollback discipline: the CLAUDE.md rule requiring a `## Rollback` section
  in any plan that drops columns/tables/types, with explicit data-loss accounting.
- The `db:push:dev` vs. `drizzle-kit migrate` environment split rule.
- The pattern for multi-table parent-chain joins (the `services/session/session-topic.ts`
  canonical example).

**Verdict: PARTIALLY COVERED (minor overlap).** `tech/drizzle-atomicity` covers atomic
writes; `tech/neon-postgres` covers the pool/connection level. Neither covers the
repo's scoped-repo contract, profileId safety, or migration-rollback discipline. The
reduce is small — the atomicity patterns (transaction, CTE upsert) can be cited by
reference. The extend is the main work.

**F-116 — No repo-local GHA security checklist skill (proposed merge from §1)**

`tech/gha-hardening` covers: SHA pinning, pull_request_target trap, least-privilege
GITHUB_TOKEN, OIDC over long-lived secrets, script injection from untrusted PR input,
checklist for review.

What F-116 asks for and what `tech/gha-hardening` does NOT cover:
- The repo-specific workflow inventory (which workflows exist, which carry secrets,
  which have id-token:write grants — F-024's specific pattern).
- The Claude-review / agent-job specific guidance (F-119's @claude invocation surface,
  F-129's PR title interpolated to prompt).
- The `mobile-maestro` workflow's specific gate pattern (F-154).
- The repo's PR review security gate requirements (F-132's unauthenticated comment as
  verdict source).

**Verdict: MOSTLY COVERED (for the generic GHA security class).** `tech/gha-hardening`
provides the framework. The repo-local extend is: (1) a workflow inventory of the
repo's specific high-risk workflows and their threat models, (2) the agent-invocation
surface (Claude jobs, @claude pattern), (3) PR review gate security requirements.
This extend is smaller than F-113/F-114 — it's a repo-context addendum to a largely
complete generic skill.

### Reduce-and-extend work list

| Skill to build | Base (cite-by-reference) | Repo-specific extends needed |
|---|---|---|
| `tech-eduagent-schemas` (new) | `tech/zod` (Zod mechanics) | `@eduagent/schemas` as API contract; trust-boundary parse sites (JWT, Inngest events, deep-links, LLM envelope); `parseEnvelope()` contract; `useMentorLanguageSync` clamp pattern |
| `tech-eduagent-db` (new) | `tech/drizzle-atomicity` (atomic writes) + `tech/neon-postgres` (pool config) | `createScopedRepository(profileId)` pattern; parent-chain join alternative; profileId write protection rule; migration-rollback discipline (`## Rollback` requirement, data-loss accounting); `db:push:dev` vs. migrate environment split |
| `tech/gha-hardening` extend-or-annotate | `tech/gha-hardening` (existing) | Repo workflow inventory; agent-job / @claude surface; PR review gate security; mobile-maestro gate pattern |

**PRG-14 / PRG-03 overlap:** PRG-03 B3 (harness-left-ratchet extraction via WI-531)
and B4 (AGENTS/CLAUDE convergence via WI-386) are the structural doc operations.
PRG-14's skill-building work (the two new `tech-eduagent-*` skills and the GHA extend)
is independent of that structural work — they can run in parallel. The only sequencing
constraint is that F-037 (CLAUDE.md/AGENTS.md divergence) must be resolved (PRG-03 B4)
before PRG-14 writes new skill descriptions that reference file paths in those docs,
to avoid writing to a diverged surface. Proposed: PRG-14 skill-description fixes
(F-038/039/040) and sync fix (F-046) first; skill-building (F-113/114) after B4 lands.

---

## Section 4 — Activation Queue analysis (readiness ranking behind the roster queue)

> **Status (2026-06-10).** The operative queue now lives in
> **`program-roster.md` § Activation queue** (full forward view, 11 entries) —
> this section survives as the *readiness analysis* behind the six emerging-
> Initiative entries. The ranking applies the three standard gates
> (planning-reference §6.3): blast-radius class / pipeline-proven / attention
> budget. Agent-leverage and risk-value are secondary sort keys. Not a schedule.

### Activation queue table

| Rank | Initiative | When it could start | What gates it | Attention cost | Basis |
|---|---|---|---|---|---|
| 1 | **PRG-12** l10n-a11y-mobile | **Now** (any time after P lands + pipeline proven) | Pipeline proven (a few IF WIs through claim→execute→review→close cleanly — realistically mid-W0/W1) | Low supervision — agent-heavy sweep | Parallel-safe by O §2; largest finding count (34) but most mechanical; the archetype the roster Post-P model names explicitly |
| 2 | **PRG-14** agent-instructions | **Now** (pre-P, partially already active via PRG-03) | F-037/F-045 (PRG-03 B4) before skill-building; skill-description fixes and sync fix are gated on nothing | Low — agent-executes-human-reviews-skills | Out-of-radius, parallel, pre-P routing (N.0); partially in-flight via PRG-03; PRG-14 formalizes the remaining skill-building scope |
| 3 | **PRG-15** errors-api | After WP-W3-envelope-router closes | W3-envelope-router (IF W3 wave) | Low-medium — focused sweep | "Partly in-radius" but F-110 (mobile) is parallel-safe now; 8 findings, S-M effort, high value-risk ratio (silent failures + GDPR-adjacent) |
| 4 | **PRG-13** security-pii-inngest | After W1-inngest-wiring + W3 close | W1-inngest-wiring + W3 (IF execution) | Medium — PII review required | Partly in-radius (inngest functions W3 touches); 6 findings, S size, but coordinate to avoid merge conflict with W3-pii-step-state siblings |
| 5 | **PRG-10** security-pii-api (parallel-safe subset) | Out-of-radius subset now; in-radius after W2–W3 | CI/GHA + input-validation subset: now. Auth/PII surface: W2–W3 | Medium — split execution required | Largest in-radius risk; partial activation of the out-of-radius subset (CI/GHA, input validation) is safe now and high-value (F-024, F-119, F-127, F-142, F-158, F-166, F-179, F-180) |
| 6 | **PRG-11** architecture | After W1 lands + blast-radius scan | W1 (IF execution); then a moot-by-refactor scan before PRG-11 scheduling | High — human-led decomposition decisions | Largest structural scope; in-radius subset unknown until W1 file-touch set is known; requires senior architectural judgment on decomposition boundaries |

### First-activation recommendation

**PROPOSAL — recommend PRG-12 (l10n-a11y-mobile) as the first parallel activation.**

PRG-12 is the program board's own named archetype for first parallel activation (roster
§ Post-P operating model: "First parallel activation will likely be a parallel-safe,
agent-heavy, low-supervision Initiative (l10n-a11y is the archetype)"). All three
activation gates are met or will be met by the time P lands: (1) blast-radius class =
parallel-safe, zero IF coordination needed; (2) pipeline proven = will be true once a
few W0/W1 IF WIs clear cleanly; (3) attention budget = agent-heavy sweep, minimal
human review beyond PR approval.

The 34-finding count is large but the work is mostly mechanical: string extraction via
`t()`, `accessibilityViewIsModal` addition, `accessibilityRole="button"` sweeps, date
locale fixes. An agent can produce the full sweep in WP-sized batches with low
coordination overhead. The INV-1 ratchet infrastructure already exists
(`check-i18n-jsx-literals.ts`), which may partially resolve the infra-finding before
PRG-12 even starts.

PRG-14 is already partially in-flight via PRG-03 and is second by readiness, but its
skill-building component (F-113/114) has a sequencing dependency on PRG-03 B4 landing
first — making PRG-12 the cleaner first-activation.

**PRG-14 skill-description fixes (F-038/039/040/042/046) can run concurrently with
PRG-12 as a separate lightweight thread** — they are trivial agent-executable changes
with no serialization constraint.

---

*End of activation-planning.md (DRAFT 2026-06-10)*
