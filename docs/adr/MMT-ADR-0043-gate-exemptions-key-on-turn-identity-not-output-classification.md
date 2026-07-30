# MMT-ADR-0043 — A quality-gate exemption keys on the identity of the thing being gated, never on a classifier over its output

**Status:** Proposed · reconstructed 2026-07-30 · **Scope:** End-user quality gates; any exemption carve-out in a check over generated output · **Deciders:** pending Architecture sign-off · **Builds on:** MMT-ADR-0038 (source-provenance envelope and confidence gate)

## Context

The source-audit gate fails a turn whose reply asserts something without reliable support. A small number of turns legitimately make no sourceable claim at all — a turn whose authored job is to *ask* the learner a recall question, to launch a drill, to set up a recitation, or to produce one novel illustrative sentence demonstrating a language pattern. For those, an insufficient-source status is the expected and correct outcome, not a defect. They need an exemption.

The natural implementation is to look at the reply and decide whether it asserts a fact. That was built, and it failed under adversarial review in a way that is instructive rather than incidental. Each review round produced a new phrasing that slipped the classifier: a bare assertion, then an assertion behind a conversational prefix, then one appended after an em dash, and finally a fact framed as a question — "Did you know Roman roads made trade faster?" — which the heuristic treated as non-assertive because it was interrogative, and therefore wrongly skipped the gate.

The failure is structural, not a matter of a better regex. The classifier must be conservative enough to catch every phrasing a model might produce, and permissive enough to exempt genuinely variable model-generated openers. Those requirements are in direct opposition over an unbounded space of natural-language output, so each fix narrows one gap and opens another. The review loop this produces has no terminating condition.

The property that actually distinguishes an exempt turn is not in the output. It is in the turn's authored purpose — what the turn was written to make the assistant do. That property is known before generation, is finite, and cannot be varied by the model.

## Decision

1. **An exemption keys on the identity of the gated unit, never on a classification of its output.** Where a quality gate needs a carve-out, the carve-out is expressed as an allowlist over the units themselves — a marker set on the designated unit — not as a predicate over the text the unit produced.

2. **The exemption predicate must not accept the output as an argument.** The function deciding whether the gate fires takes the gate's status and the unit's exemption marker and nothing else. Phrasing cannot influence the decision because phrasing is not available to the decision. This is a structural guarantee, not a convention.

3. **Exemption is granted by authored purpose, and the default is gated.** A unit is exempt only when its job is to elicit, set up, drill, or demonstrate rather than to teach a claim. Every teaching unit stays gated. Where the classification is arguable, the unit stays gated.

4. **A unit that demonstrates rather than asserts is exempt; a unit grounded in supplied material is not.** A novel illustrative example generated to show a pattern has no source to cite and an insufficient-source status there is benign. A unit evaluating a learner's attempt against supplied definitions is grounded in that material, and an insufficient-source status there is a real grounding failure that must surface.

5. **Adding a unit to the allowlist is a reviewed change with a stated reason.** Because the allowlist is finite and enumerated, each entry is inspectable and each addition is a decision about that unit's purpose, rather than an invisible widening of a pattern.

## Consequences

- The exemption set is bounded and auditable: it can be read in full, and its size is a visible number rather than the unknown coverage of a regular expression.
- Adding a new gated unit costs a deliberate classification — someone must decide whether it teaches — and the cheap default is the safe one, since an unmarked unit is gated.
- Model phrasing changes, prompt rewrites, and provider swaps cannot silently alter which units are exempt, because none of them can reach the exemption decision.
- The exemption cannot adapt to a unit whose purpose varies at runtime. If such a unit ever exists, it does not get an exemption under this decision; it gets split, or it stays gated.
- This generalises beyond the source-audit gate. Any future check over generated output that needs a carve-out inherits the same rule, and a proposal to classify output to decide applicability should be read as already-refuted.

## Alternatives considered

- **Classify the reply and skip the gate when it asserts no factual claim.** Rejected empirically. Adversarial review defeated it repeatedly, ending with a factual claim framed as a question, which the classifier read as non-assertive. The requirement to be simultaneously conservative and permissive over arbitrary natural language has no solution, so this alternative has no terminating fix.
- **Keep the content classifier and tighten it for each defeat found.** Rejected: this is the treadmill itself. Each round closes one phrasing and leaves the space open, and the process cannot demonstrate completion.
- **Remove the exemption and require every unit to pass.** Rejected: it makes non-teaching units — a recall prompt, a drill launch, a setup turn — permanently and correctly failing, which destroys the gate's signal by normalising a standing red.
- **Have the model declare per-turn whether it made a sourceable claim.** Rejected for the same reason as output classification: it returns the decision to model-controlled data, so a model that misjudges or drifts can exempt itself.

## Links

- `scripts/enduser-quality-patterns.ts` — `sourceAuditGateFires(status, exempt)`, the exemption predicate that takes no reply text.
- `scripts/enduser-session-pass.ts` — the per-unit `exemptSourceAudit` marker and the enumerated exempt turns.
- `docs/adr/MMT-ADR-0038-private-source-provenance-envelope-and-confidence-gated-general-knowledge.md` — the source-discipline contract this gate enforces.
- Ruled 2026-07-12 after adversarial review of the preceding content-heuristic implementation.
