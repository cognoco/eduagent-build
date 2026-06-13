---
title: Stream 2 — Deferred Estate-Canon Drain (Backlog)
status: BACKLOG · home doc (extracted from the identity-foundation runway 2026-06-09)
owner: (unassigned)
roster: PRG-20 in _wip/umbrella-program/program-roster.md
scope: the deferred, non-identity-blocking documentation / canon remediation that the
  identity-foundation runway names but does not execute.
---

# Stream 2 — Deferred Estate-Canon Drain (Backlog)

**What this is.** The home of "Stream 2" — the body of deferred documentation / canon
remediation that the identity-foundation runway (`_wip/identity-foundation/ROADMAP.md`)
deliberately defers. It was **extracted from that ROADMAP on 2026-06-09** to keep the
runway a clean delivery document and to give the backlog a home the umbrella program
owns. Catalogued as **PRG-20** in `program-roster.md`.

**Provenance.** The two sections below were **moved (near-)verbatim** from the runway
ROADMAP's "Cross-cutting threads" — the *Documentation architecture / decisions layer*
thread and the *Stream 2 commencement* thread. **One reconciliation** was made during
the move: the coordination-authority reference changed from *"under this
identity-foundation roadmap"* to *"under the umbrella program (PRG-20)"*, since the
umbrella now sits above the runway as the cross-program coordinator. Everything else is
as it was. The runway retains pointers (its N.0 gate, J3 deferrals, glossary bucket 3)
that resolve here.

**The one rule (inherited from the umbrella).** Pointers, never copies. This is now
Stream 2's single home; the runway points here, it does not duplicate.

---

## Commencement, parallelism & coordination
*(moved from ROADMAP "Stream 2 commencement" thread; added 2026-06-08, architect-ratified)*

This work is *sequenced* by the runway; it is not *executed* by it, and
**implementation execution is never gated on Stream 2 completion.** Four rules govern
start timing:

- **Baseline.** Stream 2 is named and ordered by **Phase O** (the master plan) and
  sliced into Cosmo WIs at **Phase P**.
- **Maximal parallelism — start each fragment at its earliest responsible start.**
  Stream 2 is *not* a monolith that waits for O; execute as much as can run in parallel
  as soon as each fragment *can* start. Gap-analysis-dependent parts (the full
  `architecture.md` rebuild, the `ARCH-N` reverse-engineering drain) cannot begin before
  **Phase L**; input-independent parts (e.g. the principles/invariants catalog, the
  `docs/`→`docs/canon/` reorg) can begin once their input canon is stable. Default
  posture: *start as soon as you can, in parallel* — not *hold until O*.
- **Single coordination umbrella while K–P run.** Any Stream 2 fragment that starts
  early (or is pulled forward by **N.0**) stays coordinated **under the umbrella program
  (PRG-20)** for as long as K–P are still running — one umbrella, one sequencing
  authority — rather than spinning off into a separate, uncoordinated track. *(During
  K–P that umbrella sits above the identity-foundation runway.)* Stream 2 graduates to
  its own standalone live Cosmo workstream only **after the runway closes (post-P)**.
- **The pull-forward exception (N.0).** Whatever the **N.0** gate (runway *Phase N —
  detail*) declares a pre-execution prerequisite is sequenced in O as pre-execution work
  and executed early under the umbrella above; the deferred remainder runs in parallel
  where its inputs allow, otherwise post-execution.

> **N.0 partition results land here.** When the runway runs Phase N.0 (partition the
> Stream-2-assigned findings into pull-forward vs deferred), record the partition in
> this doc — it is the Stream-2 home of record.

---

## N.0 partition result — RULED 2026-06-09

> **Outcome in one line: the pull-forward subset is EMPTY. Default-defer holds across
> the board. Implementation execution depends on no parked Stream-2 doc-work.**
> Ruled by the Phase-N session (`Claude`, you ratify). Inputs: M's four-bucket triage
> (`docs/audit/2026-05-29-full-audit/M-triage-closure.md`), the L
> `execution-blocking-if-deferred?` tag (`L-gap-delta.md`), and a mechanical check that
> every canon artifact the in-scope obligations cite already exists in-tree.

### The reconciliation N.0 had to make first

The runway frames N.0 as "partition every finding assigned to Stream 2 (M buckets
3/4)." That shorthand conflates three distinct populations; the data does not support
the equivalence. Buckets 3/4 (134 findings) spread across **21+ named workstreams**,
overwhelmingly *code/mobile/infra* (`l10n-a11y-mobile` 34, `security-pii-api` 27,
`architecture`-as-code 27, `errors-api` 8, `security-pii-inngest` 6, …). **Stream 2 (the
estate-canon drain) is barely present in the audit at all** — its real body is the
C/J-deferred canon inventory catalogued below, not audit findings. So N.0 rules three
populations separately:

**Population A — the doc/canon-class *audit* findings (buckets 3/4).** The only
doc/instruction-class slice of the clear-out set. **All non-blocking (`Blk = —`). All DEFER.**

| Finding | Defer-to (L) | Why it does **not** pull forward |
|---|---|---|
| F-037, F-038, F-039, F-040, F-042, F-045, F-046 | `agent-instructions` | CLAUDE/AGENTS divergence, skill-description trigger-rule violations, hook/sync-skills hygiene. **Owned by Harness Hygiene / roster PRG-03, not Stream 2** — already sequenced pre-P (`WI-531` extract → `WI-387` prune). Not an identity-execution prerequisite. |
| F-113, F-114 | `agent-instructions` | "No repo-local zod / drizzle-neon skill." Partially covered by the independent tech-skill-group (`e4c23f0c8`); dedupe-and-extend, owned by agent-instructions. Doesn't gate the rewrite. |
| F-012 | `architecture` | `architecture.md` warns of a non-existent DB→schemas cycle (`:765,896`). Doc-rot in a **non-identity** section; the in-scope obligation that *does* cite `architecture.md` (F-078) cites `:135` and is supported-by, not blocked-by, this rot. Moot-by-refactor / non-blocking. |
| F-036 | `agent-infrastructure` | `autoMemoryDirectory` path mismatch — harness/config, not canon. Not blocking. |
| F-041 | `agent-instructions` | Stale CLAUDE.md *Profile-Shapes* citations — that section documents the **current** nav system the rewrite **replaces** (moot-by-refactor). Not blocking. |
| F-176 | `navigation/audience-matrix` | Sticky proxy-flag UI state — a *code* bug, not canon. Not blocking. |

**Population B — the parked Stream-2 canon inventory (the § Inventory below).** Ruled
**en bloc: DEFER.** The pull-forward test the runway specifies is *"an in-scope work
package must cite an `architecture.md` section still legacy, or slicing a Cosmo WI
requires canon that does not yet exist."* Mechanically checked and **false**: every
canon artifact the 49 in-scope obligations cite — `MMT-ADR-0001/0002/0007/0008/0009/0011/0013/0014/0015/0016`,
`docs/canon/identity/{data-model,domain-model,ontology,prd}.md`,
`docs/compliance/identity-compliance-register.md`, `CANONICAL-SET.md`, and the `inv N`
invariants — **already exists in-tree** (delivered D/E/F.1/G/H/I/J). The parked work (the
~70-decision ADR backfill, the *non-identity* `architecture.md` rebuild, the `ARCH-N`
drain, the principles catalog, the `docs/`→`docs/canon/` reorg, glossary bucket 3) is
all **outside the clean-cut's blast radius** (moot-by-refactor) and unneeded to execute
or to slice Cosmo WIs (identity canon already lives at stable `docs/canon/identity/`
paths since J0). Nothing here is a prerequisite.

**Population C — the 9 bucket-4 deferrals** (`F-008, F-013, F-033, F-043, F-044, F-100,
F-101, F-102, F-115`). **All non-blocking, all DEFER** — code-hygiene / test-coverage /
doc-quality with no mature workstream. *(`F-043` .deepsec/AGENTS.md prompt-injection
surface and `F-044` stale `/my:commit-old`+`/zdx:commit` guard are
harness/agent-instruction-adjacent → PRG-03 / Harness Hygiene territory, still not an
identity-execution prerequisite.)*

### Complete-coverage accounting — all 134 bucket-3/4 findings

The pull-forward *test* is meaningful only for the **canon/doc population** (Populations A/B)
plus the 11 execution-blocking rows. Asking whether a code/infra/mobile finding (an l10n-a11y
bug, a god-module split, a Neon pool fix) "pulls forward into the identity rewrite's
*doc*-prerequisites" is a **category error** — those are owned by named workstreams and
*dispositioned by N.1/O via blast-radius*, not by this gate. To meet the N.0 exit gate's
coverage requirement without that category error, every one of the 134 is accounted for below
(disposition is uniformly **defer-from-N.0** since the pull-forward subset is empty; the
*reason* differs by class):

| Workstream group (L `Defer-to`) | Count | Class | N.0 disposition |
|---|---|---|---|
| `agent-instructions` | 10 | canon/doc | pull-forward test applied → **DEFER** (Pop A; owned by PRG-03/Harness Hygiene) |
| `agent-infrastructure` (F-036) | 1 | canon/doc (harness/config) | test applied → **DEFER** (Pop A) |
| `navigation/audience-matrix` (F-176) | 1 | code bug + doc-relocation | test applied → **DEFER** (Pop A; matrix relocation feeds Stream-2 inbound) |
| `platform-security / ci-cd-hardening` (F-116) | 1 | skill/doc-ish | test applied → **DEFER** (own workstream; dedupe vs tech-skill-group) |
| `architecture` (incl. F-012 doc-rot) | 25 | 1 canon/doc (F-012, Pop A) + 24 code-structural | F-012 test-applied DEFER; the 24 are **category-excluded** → own workstream, N.1/O blast-radius (some in-radius) |
| `l10n-a11y-mobile` | 34 (33 findings + INV-1) | code/mobile (UI/i18n/a11y) | **category-excluded** → out-of-radius, parallel-safe |
| `security-pii-api` | 27 | code (the non-IF remainder) | **category-excluded** → own workstream, blast-radius (IF slice already bucket-2) |
| `errors-api` | 8 | code | **category-excluded** → own workstream |
| `security-pii-inngest` | 6 | code | **category-excluded** → own workstream |
| singletons: `secrets-hygiene` (F-035 ⚑), `test-infrastructure`, `reliability-and-correctness`, `platform-infra`, `mobile-testing-infra`, `mobile-cache-data-fetching`, `learning-engine`, `infrastructure/database-performance`, `content/curriculum`, `ci-cd-hardening`, `billing-subscriptions`, `backend-performance` | 12 | code/infra | **category-excluded** → own workstream |
| **Bucket-4 deferred (Population C)** | 9 | mixed (hygiene/test/doc) | **DEFER** (no mature workstream) |
| **Total** | **134** | | pull-forward subset = **0** |

> **✓ RESOLVED — F-035 (was a live-exposure flag).** `F-035` (plaintext Logfire secret-key
> pair in `.claude/settings.local.json`, → `secrets-hygiene`) is **REMEDIATED as of
> 2026-06-09**: the live file no longer contains the secret AND the Logfire key was rotated
> on the provider side (operator-confirmed). It was gitignored + present in ≥3 historical
> commits, but rotation makes those copies dead keys, so a git-history scrub is optional, not
> urgent. **Closed — do not re-surface as live exposure.** (It was never one of the 11 Gate-1
> execution-blocking rows; it was a standalone hygiene flag.)

### K.6 caveat — handled

K.6 deferred audit reconciliation, so the runway requires any pull-forward resting on an
unreconciled finding to be marked lower-confidence. **The pull-forward subset is empty,
so there is no such call to flag** — and an empty pull-forward is precisely the
*conservative-correct* outcome when reconciliation was deferred (we pull nothing forward
on thin evidence). No low-confidence pull-forward exists.

### Handoff to N.1

The **11 execution-blocking rows** (`gate1-closure.md` patch-now list:
`F-019/020/092/117/118/121/122/130/133/144/145`) are **not** a Stream-2 partition output —
they are **bucket-2 (in-IF-scope) live code defects** (IDOR / proxy / deletion-atomicity /
age-gate / trial-downgrade). N.0 confirms **none of them depends on any parked Stream-2
doc-work**, so they flow to N.1 to be sequenced **earliest** (a "stop-the-bleeding"
pre-execution wave that closes live exposure ahead of the rewrite that supersedes them).

---

## Inventory — the deferred work
*(moved from ROADMAP "Documentation architecture / decisions layer (Phase C → Stream 2)" thread)*

`MMT-ADR-0000` ratified the 5-layer model, the first-class `MMT-ADR-NNNN` decisions
layer, the **significance gate** (when a decision needs an ADR), the lockstep lifecycle,
and the **physical layout** (§I.4: `docs/canon|adr|specs|plans|runbooks` +
`assets/`/`_archive/` drains). **Forward mechanism shipped** (convention, lockstep, the
`decision-adr-link` ratchet, `ARCH-N` freeze) + 3 seed ADRs; ADRs now homed at
`docs/adr/`. **Deferred backfill = Stream 2 (structural remediation):**

- **Drain the ~70 censused decisions to ADRs repo-wide.** MoSCoW: MUST = memory-only
  **or** ≥2-source (drifting); SHOULD = single canon spot needing extraction; NICE =
  stable/low-confidence; SKIP/tombstone = obsolete/superseded/mechanical. The **identity
  slice rides the runway's tail** (re-baseline = Prong A new ADRs + Prong B
  supersession/tombstones — touch identity canon once); constraint:
  **extract-before-cleanup** (no decision-bearing memory file is relocated before its
  ADR exists).
- **Build the principles/invariants catalog** (`docs/canon/principles.md` — promote the
  `CLAUDE.md` Non-Negotiable Rules).
- **The `ARCH-N` drain** (incl. the `ARCH-3` "plain wrong" fix).
- **Agent-doctrine / memory pointer cleanup** — the canon-class memories (see the
  instruction-surface disposition matrix and roster **PRG-03**; PRG-03 handles the
  operational class now, this is its canon-class remainder).
  - **Size-ceiling outcome (added 2026-06-13).** The drain must return root `AGENTS.md`
    under the harness 40k-char instruction-file limit — today **45.5k (+5.5k over)**, and
    growing (worktree branches `WI-685`/`WI-681` already carry 46.9k). The over-limit state
    is the *intended* consequence of `WI-386`'s single-source consolidation, **not** a
    regression; routing the canon-class sections to their homes (Languages binding-rules →
    `architecture.md`; Code Quality Guards + the Non-Negotiable Rules → `docs/canon/principles.md`)
    brings it back under. Recorded as an explicit, checkable Stream-2 outcome so the ceiling
    has an owner-on-paper and is not silently re-breached.
  - **`Docs`-tagged memories from the WI-387 triage feed in here.** The WI-387
    memory-tidy (PRG-03 / Harness Hygiene) triages `.claude/memory/` and tags each file
    in `_WIP/zdx-productionization/_state/2026-06-10-wi-387-memory-triage-prep.md`
    (nexus). Files tagged **`Docs`** are the **documentation-shaped remainder** —
    test-runner docs and LLM-policy that are accurate and load-bearing but live
    **Claude-only** in memory (Codex agents can't read `.claude/memory/`). WI-387
    **keeps them in place** (does not delete); **Stream 2 owns migrating their content to
    `docs/`** (cross-runtime/Codex visibility + single-source), after which the memory
    becomes a thin pointer or retires. Process **every** `Docs`-tagged row, not just the
    current seed. Seed (2026-06-10, list grows as the comb continues):
    `project_book_generation_pass` + `project_enduser_session_pass` → `docs/testing/`
    (live `pnpm test:llm:*` runner docs); `project_llm_source_provenance` → architecture/
    canon (source-audit policy; already partially echoed in `docs/project_context.md` —
    converge, don't fork).
- **The reduced `docs/` reorg** (canon→`docs/canon/` + the drains — what remains of
  F-PLACEMENT once the ADR home is settled) gates the bulk relocation.
- **Estate-level generalisation to the ZDX standard** is parked as **WI-519**.

### Caveat — the parallel ungoverned ADR audit (sealed cross-reference — do NOT build on)
*(moved with the inventory; it is a warning ON the ADR-drain work)*

In the same window another session pushed an ADR register draft + a cleanup plan to
`main`, plus stale-fact "citation fixes" to `architecture.md` / `project_context.md` /
`audience-matrix.md` / `CLAUDE.md`. Its **producing workflow is not in the repo**, so its
selection criteria, coverage, and importance-weighting are unverifiable; it covers only
archived specs and applies **no significance gate**. **Do not seed Stream 2 from it**
(anchoring risk). **Disposition executed 2026-06-03:** the two draft docs are
**quarantined** at `docs/_archive/parallel-adr-audit-2026-06-03/` (see its `README.md`
for provenance) — kept *only* as a completeness backstop to diff against after the
controlled sweep, not as input. The material canon/doctrine edits from the citation-fix
commits (`944d87a`, `1039bb217`) were **reverted**. After the controlled sweep, *diff*
against the quarantined §1 conflict-resolutions and the cleanup plan's STANDS/refuted
findings as a backstop, then decide final disposition (harvest verified facts / discard).

---

## Inbound feed-in (what routes into Stream 2 from the runway)

Recorded in their runway context; they resolve here:

- **J3 docs-tree deferrals** (`_wip/identity-foundation/2026-06-09-j3-docs-tree-disposition.md`;
  ROADMAP "Phase J — detail"): nonconformant loose-canon (estate spine `architecture.md` /
  `PRD.md` / `ux-design-specification.md`, L3 operational docs, assets) + nonstandard dirs
  (`E2Edocs/ _scratch/ _vault/ analysis/ superpowers/ meetings/`) — estate-canon drain /
  asset consolidation / dir reconciliation.
- **`audience-matrix.md`** relocation (flag `prd.md:319` citation for update-on-move).
- **Glossary bucket 3** (cards / celebrations) from `docs/glossary.md`: principles →
  `ux-design-specification.md`; terms → product-owned per-area `CONTEXT.md`; inventories →
  L3 register. (Buckets 1/2 are NOT Stream 2 — see roster PRG-01 / PRG-21.)

---

## Inbound — WI-387 memory-drain capture (2026-06-10)

Nine `.claude/memory/` files hold **documentation-grade truth absent from every counting
doc** (canon / ADRs / AGENTS.md / CONTEXT.md / spine trio). Dispositioned DRAIN by the
WI-387 triage workflow (adversarially verified; full evidence + per-file rationale:
`supporting-artefacts/memory-cleanup.md`
§ DRAIN backlog — moved into this repo 2026-06-10) and operator-confirmed 2026-06-10. **Extract-before-cleanup applies:**
each memory stays in place until its content lands in the named target; WI-387 then
archives it or reduces it to a pointer.

| # | Memory (`.claude/memory/`) | Target | Content to drain |
|---|---|---|---|
| 1 | `feedback_human_override_everywhere` | L1 — `PRD.md` or `ux-design-specification.md` (design principles) | every AI decision human-overridable (manual subject input; advisory ordering; session redirect/skip/challenge; coaching = suggestions) + the "AI is a guide, not an authority" rationale |
| 2 | `project_language_pedagogy` | `architecture.md` Epic-6 section (still future-tense at :1357) | as-built language-teaching architecture: `pedagogyModeSchema`/`languageCode`/CEFR/`Vocabulary` (`packages/schemas/src/language.ts`); `pedagogyMode` required on Subject; `nativeLanguage` on `teachingPreferences` (per-subject, unique `profileId+subjectId`); vocabulary + `languageProgress` routes; language-setup onboarding |
| 3 | `project_llm_source_provenance` | `architecture.md` § LLM Response Envelope (no `private_sources` coverage today) | `private_sources` sub-contract (`relied_on`/`insufficient`/`reason`/`factual_confidence`); the 0.88 confidence gate for `general_knowledge`; source-bound categories; `sourceAudit` persistence; streaming replace-frame alignment; tripwire principle. Assess whether the 0.88 gate clears the MMT-ADR-0000 significance gate → companion ADR |
| 4 | `project_known_bug_patterns` | `AGENTS.md` ## Code Quality Guards (alongside GC1–GC6) | Pattern 1 silent fallbacks (`?? []` on `.data`; success-shaped catch; `void mutateAsync` without `.catch`; raw LLM text fallbacks) · Pattern 2 React state timing (`isPending` insufficient as concurrency guard; require `useRef(false)` lock) |
| 5 | `project_brand_dark_first` | canon (brand section) or a new `MMT-ADR` on brand theming | hex palette (#1a1a3e/#faf5ee/#2dd4bf/#a78bfa); no-accent-picker decision + rationale; dark/light/system override mechanic; dark-mode-is-brand framing; post-launch neutral/slate contingency |
| 6 | `project_eas_update_ota` | `architecture.md` deployment section | CI `ota-update` job owns normal preview OTA publishing; `eas update` does not read `eas.json` build-profile env (set `EXPO_PUBLIC_*` explicitly); manual OTA only on explicit instruction |
| 7 | `project_freeform_library_filing_decision` | `PRD.md` (Library / Ask-Anything filing policy) | sessions save to history by default; filing separate: auto-file when confident, ask only when ambiguous, always correctable; "Keep out of Library" copy (never "Don't save"); keep-out retains history/summary/transcript but no curriculum topic / Library entry / progress; no blocking post-close prompt |
| 8 | `project_language_assessments_production_first` | `PRD.md` or `docs/canon/identity/prd.md` (assessment design) | language reviews target usable production (target-language words/chunks, spelling tolerance, tiny exchanges), never meta-knowledge; concrete tasks ("say hello in Italian"); avoid "main ideas" / culture-ish questions unless explicitly taught |
| 9 | `project_session_lifecycle_decisions` | `architecture.md` Session Lifecycle section | wall-clock vs active-time rationale; `computeActiveSeconds()` gap-cap algorithm (FR210); UI rule (`wallClockSeconds` display, `durationSeconds` analytics-only); hard-cap removal rationale; LLM-adaptive silence detection design |

---

## Change log
- **2026-06-13 — AGENTS.md size-ceiling outcome added.** Recorded the harness 40k-char
  limit (root `AGENTS.md` at 45.5k) as an explicit outcome of the agent-doctrine canon
  drain — the trim was previously only an implicit byproduct of the principles-catalog
  promotion. No new Cosmo WI (PRG-20 not yet sliced); single home preserved.
- **2026-06-10 — WI-387 memory-drain capture added.** Nine memory files dispositioned
  DRAIN by the WI-387 triage workflow (operator-confirmed) recorded as inbound items —
  see § Inbound — WI-387 memory-drain capture. Extract-before-cleanup binds their removal.
  *(Supersedes the same-day `Docs`-tag seed below: of its three, `llm_source_provenance`
  is row 3 of the capture table, `book_generation_pass` was triaged KEEP, and
  `enduser_session_pass` awaits its decision.)*
- **2026-06-10 — WI-387 `Docs`-tagged memory feed-in recorded.** The Harness-Hygiene
  memory-tidy (WI-387 / PRG-03) now feeds its documentation-shaped memory remainder here:
  memories tagged **`Docs`** in the WI-387 triage prep (nexus
  `_WIP/zdx-productionization/_state/2026-06-10-wi-387-memory-triage-prep.md`) are kept in
  place by WI-387 and handed to Stream 2 for migration to `docs/` (Codex visibility +
  single-source). Recorded under the *Agent-doctrine / memory pointer cleanup* inventory
  bullet. Seed: `project_book_generation_pass`, `project_enduser_session_pass`,
  `project_llm_source_provenance`.
- **2026-06-09 — created by extraction.** Moved the inventory + commencement threads out
  of `_wip/identity-foundation/ROADMAP.md` (consolidate-then-repoint); the runway was left
  a pointer and its N.0 gate repointed here. One semantic reconciliation: coordination
  authority → umbrella (PRG-20).
