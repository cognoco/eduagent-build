# MMT-ADR-0032 — Verified learning artifacts require explicit source and verification state

**Status:** Accepted · 2026-07-08 · **Scope:** Notes, Journal, Challenge Round drafted notes, freeform keep artifacts, parent proof metadata · **Builds on:** MMT-ADR-0017 (concept-grain mastery capture), MMT-ADR-0027 (supporter visibility contract), MMT-ADR-0028 (managed/credentialed visibility tiers)

## Context

The product shows durable learning artifacts to the learner and, in derived form, to a parent or supporter as evidence that learning happened. Several artifact-like things exist and they are **not** equivalent as evidence:

- **Challenge solid-quote artifacts** — learner quotes captured when a Challenge Round evaluated a concept `solid`; server-verified evidence.
- **Challenge-drafted notes** — notes drafted from those solid quotes and gated by the lexical-overlap hallucination guard; verified in origin.
- **Learner-authored notes** — created freely by the learner through session or subject-hub surfaces; may be wrong, incomplete, or copied.
- **Freeform kept material** — anything the learner chose to keep; no correctness claim at all.

If these collapse into a generic note row, a parent proof surface can accidentally present ordinary learner-authored material as verified evidence — a false claim to the person paying for exactly that assurance.

## Decision

Any artifact rendered as **proof of verified learning** — on a parent/supporter surface or a progress surface — must carry explicit, first-class **source** and **verification state**. The mere existence of a note is never sufficient evidence.

1. **Artifact source is first-class data.** The system distinguishes, at minimum: Challenge solid-quote artifact, Challenge-drafted note, learner-authored note, and freeform kept material. Source is set at creation and is immutable.
2. **Verification state is first-class data.** Only artifacts whose state is explicitly *verified* may feed proof surfaces. Challenge-derived artifacts are verified by origin. Learner-authored notes start as unverified study material; they may be promoted to verified only by an explicit grading flow that evaluates their correctness — never by default, age, or edit count.
3. **Provenance is durable but transcript-safe.** A verified artifact references durable evidence metadata (an evidence-link record pointing at the grounding quotes/events), never raw transcript content. If the underlying evidence expires under retention rules, the artifact degrades honestly to "source no longer available" — it does not silently keep claiming proof.
4. **Parent proof consumes derived artifacts only.** Parent/supporter surfaces may show the verified topic, a derived learner quote or snippet, and the current retention state (per MMT-ADR-0031). They must never expose raw transcripts or unverified notes as proof — this extends the derived-output posture of MMT-ADR-0027.
5. **The contract precedes the rendering.** Any implementation of a proof surface must be built on top of this source/verification-state contract, not the other way around. Rendering proof from untyped note rows and retrofitting the contract later is prohibited.

## Consequences

- Note CRUD stays broad and learner-friendly — learners can write anything. The filtering happens at proof-rendering time: proof queries select on artifact source + verification state.
- Proof surfaces have a stable, testable contract with four canonical cases: verified Challenge artifact present; unverified learner-authored note present (excluded from proof); freeform kept artifact present (excluded); evidence missing/degraded (honest degradation).
- Adding a new artifact kind requires assigning it a source value and a verification rule — it cannot enter the system as "just a note."
- A future grading flow can widen what counts as verified (e.g. promoting a graded learner note) without touching proof-surface code, because promotion is a state change, not a new pathway.
- Canon lives in `docs/architecture.md` → Cross-Cutting Concerns → "Retention & spaced repetition" (verified-artifact clause).

## Alternatives considered

1. **Use existing notes as proof without a source/state contract.** Rejected — a normal learner note is not necessarily correct or verified; showing it as proof is a false claim.
2. **Only Challenge-drafted notes can ever be proof.** Rejected — too narrow; a grading flow should be able to promote learner-authored notes when evidence supports it.
3. **Expose raw transcript excerpts to parents.** Rejected — violates the derived-parent-output posture (MMT-ADR-0027) and increases privacy risk.
4. **Defer source/state until a proof surface is implemented.** Rejected — repeats the historical "built but not wired correctly" failure mode; proof rendering must be downstream of the data contract.

## Links

- `docs/adr/MMT-ADR-0027-supporter-visibility-contract.md` — parent/supporter visibility stays narrowed and derived.
- `docs/adr/MMT-ADR-0031-challenge-verification-and-sm2-are-complementary-mastery-axes.md` — the retention state a proof surface must co-present.
- `docs/adr/MMT-ADR-0017-concept-capture-additive-layer.md` — concept-grain mastery evidence remains additive to the topic-grained spine.
- `apps/api/src/services/challenge-round/note-draft.ts` — hallucination guard on Challenge-drafted notes.
