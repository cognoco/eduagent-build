# MMT-ADR-0024 — Supporter visibility contract: reportability is narrowed by trust, not edge reach

**Status:** Accepted · 2026-06-20 · **Scope:** V2 supporter visibility surfaces · **Deciders:** Architect (jjoerg) + PM (owner) · **Builds on:** MMT-ADR-0000, MMT-ADR-0022

## Context

The identity canon already defines Supportership as a Layer-2, edge-scoped visibility grant: the supporter sees only the named supportee and receives no consent authority. That answers who may see. S5 adds the product trust layer that answers what may be reported even to an authorized supporter.

The risk is not only unauthorized access. A supporter with a valid edge could still receive confided affect, self-doubt, raw chat, private notes, or legacy LLM prose if reporting code treats every available string as eligible context. That would violate the V2 promise that the mentor is a channel the learner can trust.

## Decision

1. Supporter reporting uses a server-side allow-list: `mastery`, `effort`, and `observable_engagement`. Unknown future classes are non-reportable by default.
2. Confided affect, self-doubt, private notes, raw chat, and persisted legacy LLM report prose are not supporter-reportable facts.
3. Render-equivalence is required: supporter and supportee views share the same fact ids, with audience-appropriate framing only.
4. The artifact wall is mandatory: supportership creates no supporter read path to private notes, chats, or journal artifacts.
5. Appeals produce richer structural detail only after a deliberate request and a core audit write. Appeals do not bypass the artifact wall.
6. Safety escalation is separate from reporting. The reportability gate must not suppress a safety escalation path.
7. S5-owned contract, audit, and notice tables key to the canonical `supportership` edge. Ceremony state is not added to the edge.

## Consequences

- Supportership remains minimal and canonical; the trust contract is additive storage keyed to it.
- Legacy monthly reports, recaps, and stored session-summary prose are not made V2-compliant by a filter pass. They must first be rebuilt as tagged facts with supportee mirrors.
- Report-generation services must call the reportability gate before producing supporter-visible text.
- Supporter cards and Journal shared records are read-time projections from contract/notice/fact state, not `mentor_activity_ledger` rows.

## Alternatives considered

- **Deny-list sensitive classes.** Rejected: a new affect-like signal would leak until someone remembered to add it to the deny-list.
- **Edge grants all structural and narrative data.** Rejected: supportership answers who, not what. The mentor trust promise needs a narrower class.
- **Store ceremony state on `supportership`.** Rejected: the identity canon keeps the edge minimal; S5 owns contract-specific state separately.

## Links

- `docs/canon/identity/domain-model.md` §2/§4 — Supportership is edge-scoped visibility, not consent authority.
- `docs/canon/identity/ontology.md` inv 9/14/19 — visibility is scoped and opt-in.
- `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md` §6.1 — visibility contract and non-reportable class.
- `docs/adr/MMT-ADR-0022-activity-ledger-narration-substrate.md` — cross-user moments derive from relationship/contract state, not ledger visibility.

