# MMT-ADR-0032 — Verified learning artifacts require explicit source and verification state

**Status:** Proposed · 2026-07-07 · **Scope:** Notes, Journal, Challenge Round drafted notes, freeform keep artifacts, parent proof metadata · **Deciders:** Architecture sign-off pending · **Builds on:** MMT-ADR-0017 (concept-grain mastery capture), MMT-ADR-0027 (supporter visibility contract), MMT-ADR-0028 (managed/credentialed visibility tiers)

## Context

The verified-learning-loop spec needs a durable artifact that can be shown to the learner and, in derived form, to a parent/supporter. The current code has several artifact-like things: Challenge-drafted notes grounded in `solidAnswerQuotes`, learner-authored notes created through the session or subject-hub surfaces, and freeform "keep this" material. These are not equivalent. If they collapse into a generic note row, later parent proof can accidentally present ordinary learner-authored material as verified evidence.

This is ADR-class because it defines a cross-surface data contract: what may count as proof, what can be shown to parents, and which later implementation WIs are allowed to consume.

## Decision

A parent- or progress-visible "verified learning artifact" must carry explicit **source** and **verification state**. Generic note existence is insufficient.

1. **Artifact source is first-class.** The system must distinguish at least: Challenge solid quote artifact, Challenge drafted note, learner-authored note, and freeform kept material.
2. **Verification state is first-class.** Only artifacts whose state is explicitly verified may feed parent proof. Learner-authored notes start as learner-authored study material until a grading flow such as `WI-1491` marks them otherwise.
3. **Provenance is durable but transcript-safe.** The artifact points to durable evidence metadata (`evidence_links` / `LearnerSource` or successor names), not raw transcript exposure. If source transcript content expires, the artifact degrades to "source no longer available" rather than fabricating proof.
4. **Parent proof consumes derived artifacts only.** Parent surfaces may show the verified topic, a derived learner quote/snippet, and retention state; they must not expose raw transcripts or ungraded notes as proof.
5. **Implementation work must create the contract before rendering proof.** `WI-1665` cannot count as complete until the artifact source/verification contract exists and is used by the parent-visible surface.

## Consequences

- The S5a work in the verified-learning-loop plan must be promoted from "specced" to concrete Work Items before parent proof starts.
- Note CRUD can remain broad, but proof rendering must filter by artifact source + verification state.
- The parent proof implementation has a stable contract to test against: verified Challenge artifact present, learner-authored ungraded note present, freeform kept artifact present, missing/degraded evidence.
- The final canon change, if this ADR is accepted, belongs in `docs/architecture.md` near the retention / parent visibility canon rather than inside a one-off spec.

## Alternatives considered

1. **Use existing notes as proof without a new source/state contract.** Rejected — a normal learner note is not necessarily correct or verified.
2. **Only Challenge-drafted notes can ever be proof.** Rejected — too narrow; a later grading flow should be able to promote learner-authored notes when evidence supports it.
3. **Expose raw transcript excerpts to parents.** Rejected — violates the current derived-parent-output posture and increases privacy risk.
4. **Defer source/state until the parent surface implementation.** Rejected — that repeats the historical "built but not wired correctly" failure mode; proof rendering should be downstream of the data contract.

## Links

- `docs/specs/2026-07-06-verified-learning-loop.md` — loop map and S5a/S7 gates.
- `docs/adr/MMT-ADR-0027-supporter-visibility-contract.md` — parent/supporter visibility stays narrowed and derived.
- `docs/adr/MMT-ADR-0017-concept-capture-additive-layer.md` — concept-grain mastery evidence remains additive to the topic-grained spine.
