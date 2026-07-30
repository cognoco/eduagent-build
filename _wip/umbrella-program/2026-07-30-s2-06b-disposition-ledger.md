---
title: "S2-06B — Disposition ledger for the deferred census MUST remainder"
date: 2026-07-30
status: "Authored. All thirteen in-scope census rows disposed. Every authored ADR is Status: Proposed and requires human Architecture sign-off before it is canon (MMT-ADR-0000 §II.6 rule 3)."
scope: >
  Census rows 1, 2, 4, 5, 8, 10, 18, 29, 40, 41, 44, 54, 58 ONLY, from
  `_wip/umbrella-program/2026-07-14-s2-01-decision-census.md`. Rows 3, 9, 12, 13, 15, 19,
  53, 57 are the sibling slice's scope (S2-06A / WI-2716, landed) and were not touched,
  re-disposed, or altered here.
sealed-quarantine: >
  `docs/_archive/parallel-adr-audit-2026-06-03/` was NOT opened, read, grepped, or
  seeded from at any point in this slice. It remains sealed until S2-15.
---

# S2-06B — Disposition ledger

## 1 · What this slice did

Executed the thirteen deferred MUST decisions from the S2-01 census, completing the pair begun by S2-06A. Each authored ADR records a decision **already made**, recovered from the artifacts cited below and stamped `reconstructed 2026-07-30`. No decision was originated here; where the reasoning was recoverable it is recorded, and no rationale was invented.

**ADR numbers allocated: `MMT-ADR-0046` … `MMT-ADR-0052`** (seven, contiguous). Prior maximum was `MMT-ADR-0045`, allocated by the sibling slice. `MMT-ADR-0003` remains a pre-existing gap and was deliberately **not** filled, for the reason the sibling gave: reusing a withdrawn number makes every historical reference to it ambiguous.

Thirteen rows produced seven ADRs rather than thirteen, for three distinct and separately-evidenced reasons: one pair of rows is a single decision seen from two sides (5/40), three rows' premises had **dissolved** before this slice ran (29, 44, 58), and two rows resolve to canon corrections owned by existing work rather than to new decisions (4, 41). Each is itemised below; no row is silent.

**Every authored ADR is `Status: Proposed`, `Deciders: pending Architecture sign-off`.** None asserts sign-off.

## 1a · The D5 precondition — verified satisfied in fact

Re-verified independently rather than inherited from the sibling's check. `docs/adr/MMT-ADR-0000` §II.6 carries all five amendment rules — reconstruct-vs-launder, L3-in-passing-only, `Accepted` requires human Architecture sign-off, dedicated change-set, and the provenance stamp. It landed as commit `22122c94adef3b2eba50ef96b51ac8fb3a0f8990` — *"docs(adr): MMT-ADR-0000 provenance discipline; fold amendments \[WI-752]"*. All five were applied here. The rule is mechanised as well as written: `scripts/check-adr-provenance.ts` fails any newly-added `Accepted` ADR lacking human Architecture sign-off.

## 2 · The thirteen-row disposition

| Row | Decision | Disposition | Path | Convergence owner | Source evidence |
|---|---|---|---|---|---|
| 1 | Human-override escape hatch in every AI-driven interaction | **New ADR** | `docs/adr/MMT-ADR-0046-every-ai-driven-interaction-carries-a-human-override.md` | — | `.claude/memory/feedback_human_override_everywhere.md` (read in full) |
| 2 | As-built language-teaching architecture (`pedagogyMode`, per-subject `nativeLanguage`, CEFR) | **New ADR + deferred canon correction** | `docs/adr/MMT-ADR-0047-pedagogy-is-a-per-subject-property-and-language-subjects-do-not-use-the-socratic-mode.md` | Canon half deferred — see §6 | `.claude/memory/project_language_pedagogy.md`; **live schema verified**: `packages/schemas/src/account.ts:173` (`pedagogyMode: z.enum(['socratic','four_strands'])`), `:215-216` (`cefrLevel`/`cefrSublevel`), `:471` (`nativeLanguage`), `packages/schemas/src/language.ts`, `packages/schemas/src/assessments.ts:82,511` |
| 4 | Two systemic bug patterns (silent-fallback masking; React `isPending` concurrency race) | **No ADR — canon extraction, deferred and converged** — see §5 | Target `AGENTS.md` § Code Quality Guards | **WI-2051 / WI-2052** (the AGENTS.md 40k trim) already own that file | `.claude/memory/project_known_bug_patterns.md` (read in full) |
| 5 | Brand identity: fixed teal+lavender, no accent picker, dark-first follows system | **New ADR (shared with row 40) + UX-spec canon correction** — see §3 | `docs/adr/MMT-ADR-0051-one-fixed-brand-palette-varying-only-by-colour-scheme.md`; corrections in `docs/ux-design-specification.md` | Consumes the Closed **WI-2080** finding as settled fact; not reopened | WI-2080 ruling; `apps/mobile/src/lib/design-tokens.ts:217,233,254,273`; `apps/mobile/src/lib/theme.ts:10,17,36-46,61-66`; `apps/mobile/src/app/_layout.tsx:180-274` |
| 8 | Language reviews test usable production, never abstract meta-knowledge | **New ADR** | `docs/adr/MMT-ADR-0048-language-assessment-measures-production-not-knowledge-about-the-language.md` | — | `.claude/memory/project_language_assessments_production_first.md` (read in full) |
| 10 | Irreversible cutover deletions require explicit human confirmation naming the rollback loss | **New ADR** — stated as the durable rule, with the stage code removed as authority per README timelessness rule 2 | `docs/adr/MMT-ADR-0049-destroying-the-last-cheap-rollback-path-requires-explicit-human-confirmation.md` | — | `.claude/memory/feedback_s6_deferred_irreversible.md` (read in full) |
| 18 | Eval signal-distribution regression guard; tolerance couples to sample count | **New ADR** | `docs/adr/MMT-ADR-0050-aggregate-signal-distribution-is-guarded-separately-from-per-sample-schema-validation.md` | — | `.claude/memory/project_eval_llm_signal_metrics.md` (read in full); `apps/api/eval-llm/` |
| 29 | UI-language scope: "English-only v1.0" vs shipped 7-locale reality | **MOOT — premise dissolved before this slice ran** — see §4 | No ADR; no correction needed | Already corrected by commit `4955cce80` (2026-07-23, PR #2559) | **Zero** occurrences of `English-only` remain in `docs/architecture.md`, `docs/PRD.md`, or `docs/ux-design-specification.md` |
| 40 | Per-persona visual brand system ("Three Visual Moods" / "One Hue Family") | **Same ADR as row 5** — see §3 for why they collapse | `docs/adr/MMT-ADR-0051-…`; three superseded/correction banners in `docs/ux-design-specification.md` | Shares row 5's owner | `docs/ux-design-specification.md:392, 532, 545, 601-615` — **four** stale sites, not the one the census cited |
| 41 | Dual-mode teaching ("Serious Learner" vs "Casual Explorer") listed as a live design opportunity | **No ADR — correction only, deferred** — see §6 | Target `docs/ux-design-specification.md:71` | The decision itself is already canon in `AGENTS.md` (toggle removed, PR #325); only the stale restatement needs a tombstone | `docs/ux-design-specification.md:71` (verified live); `AGENTS.md` § Non-Negotiable Engineering Rules |
| 44 | §13.6 evidence-gate methodology (observed-cohort data required) | **MOOT — premise dissolved by archival** — see §4 | No ADR; no correction needed | Archived by commit `a6fa15538` (2026-07-14, PR #2170) | Both cited paths absent from the live tree; the document now sits at `docs/_archive/plans/2026-07-14-superseded/v2-dossier/03-decision-ledger.md` |
| 54 | Launch posture: age floor + consent authority | **New ADR, RE-DERIVED** — the census formulation was wrong on three counts — see §2a | `docs/adr/MMT-ADR-0052-consent-authority-resolves-from-age-and-residence-jurisdiction.md` | Market perimeter deliberately **excluded** and left with compliance; provider exclusion converged to `MMT-ADR-0014` + `docs/registers/llm-models/master.md` | `docs/compliance/2026-07-23-13-plus-eea-launch-country-ruling.md`; `docs/canon/identity/ontology.md:168,186-188,199-206,243-255`; commit `7cb7b0f68` (WI-2535); `docs/registers/llm-models/master.md:93` |
| 58 | `consent_request` service-role RLS exceptions asserted by an ADR + its canon partner | **MOOT — ruled non-draft; the asserted premise is absent** — see §4 | No ADR authored, per the explicit instruction not to assert the missing premise | **WI-783**, not WI-752, already applied the correction | `docs/adr/MMT-ADR-0020:112-121` and `docs/canon/identity/data-model.md:250-259` both **disclaim** a named service-role policy; `apps/api/drizzle/0114_identity_cutover_homes.sql:60-68` |

No row is silent. Rows 5 and 40 appear as two rows pointing at one ADR (§3); rows 29, 44, and 58 are dispositioned moot with the evidence that dissolved each premise (§4); rows 4 and 41 are corrections with named owners rather than duplicate decisions (§5, §6).

## 2a · Row 54 — the re-derivation, and what the census got wrong

The AC required row 54 be re-derived from the jurisdiction-aware ruling **before** any durable text was drafted, because promoting the census's formulation would enshrine a dead posture. It was, and the census's row proved wrong on **three** counts, not one:

1. **"Guardian-consent through 16 (location-blind)" is wrong.** Consent authority resolves from age × jurisdiction of habitual residence; the EEA Article 8 threshold varies 13–16 by country. The governing rule is `guardian_authorization_required = learner_age < article_8_age_for_residence_country`.
2. **"Country allowlist derived from the 7 UI locales" is wrong, and inverted.** The ruling names interface language explicitly as a **non-input**, alongside nationality, IP address, and app-store country. The governing input is habitual residence.
3. **"No Gemini API for minors" is wrong.** The owner ruling of 2026-06-23 excludes Gemini/Vertex **for everyone, age-independent** — the adult-only lane question is closed as fully excluded (`docs/registers/llm-models/master.md:93`). A minors-only reading is a live misstatement, and it survived in the census because the register was outside the sweep (§7).

**What the ADR deliberately does not carry.** The market perimeter is excluded by design. It has moved at least three times in eight days — the locale-derived allowlist, then an all-market ruling (2026-07-22), then a launch decision superseding it (2026-07-24), then a further screening change (`e85511211`, 2026-07-30). Freezing any snapshot of that into an immutable decision record would be the exact stale-canon failure this layer exists to prevent, and would breach README timelessness rule 3. The ADR records the stable derivation rule; the moving list stays with the compliance perimeter.

**The anti-conflation spine** comes from `7cb7b0f68` (WI-2535, 2026-07-30), which corrected a blanket "all 13+ learners self-consent" claim and enumerated the six orthogonal facts that phrasing collapsed: own login, legal consent authority, family membership, payment, Guardianship, Supportership. That list is clause 8 of the ADR.

**One time-bound fact is dated in the ADR rather than omitted.** Jurisdiction is captured and load-bearing, but the resolver is a fail-closed scaffold with zero production callers and the live gate is a jurisdiction-blind flat check. An ADR asserting jurisdiction-aware resolution without that note would license a reader to *consume* the resolution as existing — which is precisely the error the 2026-07-23 drain assessment warned against. README rule 3 permits a genuinely time-bound fact when dated, and it is.

## 3 · Rows 5 and 40 — why one ADR, and both rows kept visible

They are one decision seen from two sides, and the census says so itself: row 40 is "the same underlying contradiction as row #5, from the opposite (stale-design-doc) side." Row 5 approaches from memory-and-code, row 40 from the design document. Two ADRs would be one decision recorded twice — the duplicate-decision failure the AC prohibits. **Both row numbers are retained as separate ledger rows** pointing at the single ADR, so the merge is visible rather than silent.

**The WI-2080 finding was consumed as settled fact and not reopened**, per instruction. What this slice did verify — as implementation detail for the correction, not as re-investigation — is that the residual machinery is genuinely unreachable: `accentPresetId` initialises to `null` (`theme.ts:17`), no surface outside the context provider itself sets it, and with it unset the base token map renders unchanged (`theme.ts:39`, `:64`). That is what makes the eventual cleanup a no-op visually, which is worth stating because it is what makes it low-risk.

**Correction applied additively, nothing deleted.** Three banners in `docs/ux-design-specification.md`: a superseded banner on `## Visual Design Foundation`, a superseded banner on `## Design Direction Decision` that distinguishes the superseded per-persona rows from the two rows that still hold (Inter typography, shared component shapes), and a dated correction appended under the 2026-05-23 implementation note whose "five accent presets" clause misdescribed residual machinery as a shipped feature. AC 6 forbids reducing a source before its replacement lands; the superseded direction stays legible as history.

## 4 · Rows 29, 44, 58 — three dissolved premises, each dated

The most consequential finding of this slice. Three of the thirteen rows describe defects that **no longer existed when the slice ran**, and in two cases had already been fixed *before the census was written*.

| Row | Census claim | Reality | Dissolved by | Date vs. census (2026-07-14) |
|---|---|---|---|---|
| 58 | `MMT-ADR-0020` + `data-model.md` §2B.1 both assert `consent_request` ships named service-role RLS policy exceptions | Both **disclaim** exactly that, in terms; code agrees | `5cda14996` — *"docs(adr): correct consent request RLS access \[WI-783]"* | **15 days BEFORE** |
| 44 | Superseded evidence-gate text "still live in the document" | The document itself was archived; both cited paths absent from the live tree | `a6fa15538` — *"docs: archive stale audits and completed plans"* | **Same day** |
| 29 | `architecture.md` + `PRD.md` both claim "English-only UI for v1.0" | Zero occurrences of the string remain in either file | `4955cce80` — *"docs(compliance): consolidate 13+ EEA launch policy"* | 9 days after |

**Row 58 is the sharpest case and its disposition is exact.** The defect was real when the correction document was drafted (2026-06-15). `WI-783` applied the fix on 2026-06-29 — the diff removes the phrase *"plus named service-role exceptions for the public token lookup and the reminder sweeps"* and replaces it with the owner-role/RLS-bypass disclaimer now in the file. The census, written 2026-07-14, still recorded the defect as live because it cited the June draft correction document without re-verifying the tree. **The correction was owned and completed by WI-783, not WI-752** — so "converge with WI-752 rather than duplicating" resolves to: there is nothing left to converge, and WI-752's rider on this sub-scope is moot. No ADR asserting the missing premise was created, per instruction.

**Row 44's archive location is not the sealed quarantine.** The document now sits under `docs/_archive/plans/2026-07-14-superseded/`, which is distinct from `docs/_archive/parallel-adr-audit-2026-06-03/`. Its current path was established from `find` and `git log` on the original path; **the archived file's contents were not read**, and neither archive directory was opened.

## 5 · Row 4 — why this is not an ADR

Row 4 records two defect patterns found in a 2026-04-13 sweep — silent fallbacks that return success-shaped values, and `isPending` used as a concurrency guard where React's batching defeats it. Both are real and both are worth enforcing.

They are, however, an **audit finding and a review checklist**, not a contested decision: nothing was chosen between alternatives, and the census's own treatment of a structurally identical row (row 25, the clerk-js dependency finding) is *"nothing was chosen; this is an audit finding"* → not an ADR. Writing an ADR here would be recording a bug taxonomy as architecture — arguing a position for the first time rather than recovering a decision, which is the laundering failure `MMT-ADR-0000` §II.6 rule 1 names.

The correct home is the one the census itself proposed: `AGENTS.md` § Code Quality Guards, alongside GC1–GC6. That file is **off this slice's write surface and actively owned** by the 40k-trim work (WI-2051 / WI-2052), which is rewriting exactly that document. Converging there is strictly better than adding a competing ADR that the trim would then have to reconcile.

Partial coverage already exists and should not be duplicated: `AGENTS.md` § Fix Development Rules already bans silent recovery without escalation in billing, auth, and webhook code. Pattern 1 generalises that beyond three domains; Pattern 2 has no current coverage.

## 6 · Deferred canon deltas — sequencing requests, not omissions

Lockstep (§II.2) binds at **acceptance**, and every ADR here lands `Proposed`. A deliberately-deferred canon half is therefore a sequencing request rather than a §II.2 breach — the same disposition the sibling slice used and for the same reason. None of these may be promoted to `Accepted` while the canon they correct still says otherwise.

| Row | Delta | Target file | Why deferred |
|---|---|---|---|
| 2 | Language learning is built and in scope, not "deferred to v1.1" — four stale sites: scope summary, epic table, deferred-decisions table, extension-point note | `docs/architecture.md:35, 49, 335, 1415` | **Off-surface** (stop-and-report list) **and live**: PR #2712 has the file open |
| 4 | Silent-fallback + `isPending`-race patterns as review guards | `AGENTS.md` § Code Quality Guards | **Off-surface** (stop-and-report list); owned by WI-2051 / WI-2052 — see §5 |
| 41 | Tombstone the "Serious Learner vs Casual Explorer" design opportunity; the toggle was removed in PR #325 and `casual` is the single default tone | `docs/ux-design-specification.md:71` | **Outside the granted surface.** The grant covers the UX-spec section rows 5/40 require; row 41 is a different subject in the same file. Verified no open PR holds the file, so this is a cheap follow-on — one banner, no ADR |
| 54 | None required | — | The ADR converges with existing canon (`ontology.md`) rather than correcting it |

## 7 · Findings for follow-up

1. **The census's drift-class tags are systematically under-sourced, and the cause is reproducible.** The sibling found row 53 tagged `single-canon` when four sources existed, because `docs/registers/` was outside the sweep list. The same gap bit **row 54** here: `docs/registers/llm-models/master.md:93` carries the owner ruling that makes the census's "no Gemini for minors" wrong (§2a finding 3), and the census never cites it. `docs/registers/` was not in the census's enumerated sweep, and D1's MoSCoW ruling was made on those tags. Not corrected in the census file — it is another slice's artifact.
2. **Rows the census under-counted, cited here in full.** Row 2: the census cited two `architecture.md` lines; **four** stale sites exist (`:35`, `:49`, `:335`, `:1415`). Row 40: the census cited one section (`:525-620`); **four** sites exist (`:392`, `:532`, `:545`, `:601-615`) — `:392` is a separate implementation note, not part of the cited section.
3. **The census's line citations have rotted wholesale.** Of the row citations checked by line number, none resolved: `architecture.md:142`, `:333`, `:1696`, `PRD.md:158`, and `ux-design-specification.md:65` all now point at unrelated content. Every claim in this slice was re-established by content search, not by the census's line numbers. A finalization pass should re-anchor citations by content.
4. **Three of thirteen premises had dissolved (§4), two before the census was written.** This is a decay rate worth acting on rather than a coincidence: a census row is a dated observation, and dispositioning one without re-verifying the tree risks authoring an ADR for a defect that no longer exists. This slice verified every premise before drafting; two rows would otherwise have produced ADRs asserting things that are not true.
5. **Extract-before-cleanup (AC 6) — no source memory or file was reduced, relocated, or archived by this slice.** All corrections are additive: three banners appended in `docs/ux-design-specification.md`, nothing deleted from it, and no memory file touched.
6. **`docs/adr/README.md` needed no edit.** It carries no per-ADR index, and the `Status: Proposed` convention line the sibling added already covers this slice. Noted so its absence from the diff is not read as an omission.

## 8 · Verification

Run on Node v22.16.0 (the version `package.json` pins; the host default of v24 is a mismatch and was overridden session-scoped).

```
$ pnpm run check:adr-provenance -- --base origin/main --head HEAD
$ pnpm run check:decision-adr-link
$ pnpm run check:flow-inventory-cite-rot
$ pnpm run check:teen-consent-claims
$ BASE_REF=main bash scripts/check-change-class.sh --branch
```

Results are recorded in the completion evidence. `adr-provenance` is the mechanised form of `MMT-ADR-0000` §II.6 rule 3: all seven ADRs are `Proposed`, so all seven pass by construction rather than by exemption. `check:teen-consent-claims` is included deliberately — `MMT-ADR-0052` writes about 13+ learners and consent in the same document, and that guard exists to catch exactly the blanket-self-consent conjunction this ADR is correcting.

**`--branch` requires `BASE_REF=main`.** Run without it, the change-class router resolves `git merge-base HEAD main` against the *local* `main` ref, which in this worktree was 132 commits behind `origin/main` at session start; it then reports hundreds of files across change classes this slice never touched. Git is the authority for what this change contains, via `git show --stat` on the landed commit — never a gate-bundle diffStat, which carries a known cross-attribution defect.
