# MMT-ADR-0053 — The agents file holds digests under a presence dial, never canon

**Status:** Proposed · drafted 2026-08-02 (operator-ruled frame, AGENTS.md restructure sitting; agent-drafted per MMT-ADR-0000 II.6 — Architecture sign-off pending) · **Scope:** What content `AGENTS.md` may hold, at what resolution, and how that call is made · **Deciders:** pending Architecture sign-off

## Context

`AGENTS.md` sits between two forces that are both correct and directly opposed.

**Deference.** The documentation hierarchy of MMT-ADR-0000 — canon, ADRs, operational docs — is where knowledge lives. Every fact restated in the agents file is a second copy that will drift from its source. Taken to its limit, the agents file is one pointer to the documentation index.

**Presence.** The agents file is the only file an agent is *guaranteed* to have read. Everything behind a pointer exists only probabilistically: the agent must choose to follow it, and it cannot choose to look up what it does not know exists. An unfollowed pointer is invisible at exactly the moment it mattered. Taken to its limit, everything is inline — which is how the file reached 61k bytes against a 40k harness ceiling.

Both limits fail, differently: full deference fails on unknown unknowns (an agent violates a rule it never learned existed); full presence fails on ceiling, drift, and dilution. A human organisation resolves this with memory — a person reads the handbook once and internalises it. Agents re-onboard every session; the agents file is a memory prosthetic, and that is its only legitimate claim to content.

A further constraint is that instruction-layer inheritance is **non-uniform**. Interactive estate sessions receive machine-global and workspace-parent instruction files above this one; CI reviewers and standalone checkouts receive this repo's file alone. Nothing may therefore be deleted from this file on "inherited from a parent" grounds.

## Decision

1. **The agents file is a cache over the documentation hierarchy, never a canonical home.** Knowledge stated here is a digest; its canonical text lives at its proper home in the MMT-ADR-0000 hierarchy — L1 canon for invariants, L2 ADRs for rulings, L3 operational docs, runbooks, and registers for procedures and tables. A digest traces to its source so drift is detectable; a digest is never a fork.

2. **Inline bytes are earned through a dial, scored per piece of content** on: frequency of relevance × silence of failure (is the rule armed by a gate, or does violation slip through?) × miss-cost × undiscoverability (would the task's natural path surface the canon anyway?). The dial has graduated positions: full statement inline → imperative one-liner + pointer → named pointer ("X exists; read it before doing Y") → covered by the index alone. The workhorse is the second: **inline text carries conclusions and imperatives; canon carries reasoning and proof.**

3. **Six content types, of which only one is dial-governed:**
   - *Identity & orientation* — what this repo is, session-start protocol, where to orient. Fully inline.
   - *Behavioral doctrine* — how to work, product-independent. **Dial-exempt**: it governs whether pointers are followed at all, and it is the only behavioral layer on surfaces with no parent files. It stays inline whole.
   - *Process & lifecycle mechanics* — trigger→action rules that fire at moments when no agent is searching docs. Triggers stay inline; long procedures move to runbooks and skills.
   - *Hard constraints* — never-do items. Maximum presence; never pointer-only.
   - *Knowledge digests* — product and codebase facts. **The only category the dial governs**, and the only category permitted to shrink or grow with it.
   - *Operational how-to* — everyday commands inline; conditional procedures defer to the change-class layer.

4. **Armed rules defer; unarmed rules keep their sentence.** Where a gate (lint, CI check, ratchet, hook) enforces a rule, the inline text shrinks to the imperative plus the gate's escape hatch — the gate is the documentation ("Armed, Not Written"). Where no gate exists, the inline sentence is the only enforcement a stateless agent has, and it stays.

5. **Shared doctrine is delivered by sync, never by hand-maintained fork.** Content shared with parent layers (estate behavioral doctrine, the work-system rules) enters this file only as a stamped, versioned snippet block (the `ZDX-PROJECT-RULES` mechanism is the model), or stays absent. Hand-copied variants of parent text are forbidden — they drift.

6. **The dial moves over time and its movement is the maintenance model.** When a rule gains a gate, its inline text shrinks. When a subsystem goes hot, its digest may temporarily grow. Content leaves the file by moving to its canonical home first — never by deletion without a landed destination.

## Consequences

- The size ceiling stops being a crisis and becomes an eviction policy: pressure on the ceiling forces dial decisions, which is the intended mechanism, not an emergency.
- Every restructure or addition to the file has a principled test — name the content type, score the dial — replacing ad-hoc keep/move argument.
- Digests must name their source, which makes drift auditable (a digest whose source no longer says the same thing is a defect, findable mechanically in principle).
- Some duplication with parent layers is accepted deliberately (hard constraints, behavior) because parentless surfaces exist; the cost is bounded by clause 5's sync-not-fork rule.
- The file's growth rate becomes dominated by the genuinely new (fresh invariants, new gates' escape hatches), since reference material lands in the hierarchy from the start.

## Alternatives considered

- **One pointer to the documentation index** (full deference). Rejected: stateless agents cannot follow pointers to rules they don't know exist; the unknown-unknown failure lands on exactly the highest-stakes surfaces (CI, autonomous executors).
- **Keep everything inline and raise/ignore the ceiling** (full presence). Rejected: the ceiling is a harness fact, not a preference; and drift between inline copies and canon was already producing contradictions the restructure had to repair.
- **Split into multiple always-loaded files.** Rejected: it relocates the ceiling without changing the economics, and multiplies the surfaces that can drift.

## Links

- `docs/adr/MMT-ADR-0000-documentation-layer-model-and-decisions-layer.md` — the hierarchy this file defers to; this decision is its application to the agents file.
- Nexus estate rule "Armed, Not Written" — the enforcement-side counterpart of clause 4.
- The `ZDX-PROJECT-RULES` stamped snippet in this file's work-system section — the live example of clause 5.
