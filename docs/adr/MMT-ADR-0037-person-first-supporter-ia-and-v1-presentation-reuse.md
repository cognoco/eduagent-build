# MMT-ADR-0037 — Person-first supporter IA: conditional Support hub, always-present Me scope, V1 presentation reuse over V2 visibility logic

**Status:** Accepted · 2026-07-26 · **Scope:** V2 supporter/cross-person surfaces (Support hub, person scopes, scope chip, shared-record presentation) · **Deciders:** drafted by Claude; **Architecture sign-off: Accepted by operator (jjoerg) 2026-07-26** — IA direction and V1-reuse ruled in-session, recorded as comments on WI-2777 · **Builds on:** MMT-ADR-0000, MMT-ADR-0008 (guardianship operation distinct from everyday visibility), MMT-ADR-0024 (Proposed — scope chip supersedes nav contract), MMT-ADR-0027 (supporter visibility contract), MMT-ADR-0028 (login presence carries visibility tier)

## Context

QA of the German staging build (2026-07-26, supporter account) found the V2 supporter surfaces unusable: server-composed English fact strings on a German UI, internal jargon ("Threshold 1"), a verbatim learner question rendered as a card title, no orientation (who is this person, what is our relationship, what can I do), and no discoverable entry into the supporter's own learning. A three-track deep dive (recorded on WI-2777) established that the V2 shared-record pipeline is a visibility **filter** over the same tables the V1 family-mode surfaces already render richly — not a parallel dataset — and that `ReportableFact.metadata` exists end-to-end but is populated by nobody, so structured facts plus client-side i18n require zero schema changes.

Separately, the shell spec's supporter IA (`docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md` §4.1–§4.2) prescribes an unconditional Support-hub pill, hub/person separation even with a single linked person, and a Me scope that appears only after the supporter's first real self-learning state. QA showed the practical result: a supporter with one supportee lands in a thin hub that duplicates nothing useful, and the own-learning doorway is invisible. These spec rules disagree with the direction the operator ruled, so the change is recorded here as a decision, not applied silently.

## Decision

1. **Person-first IA — the Support hub exists only when it has a job.**
   - **0 supportees:** the hub *is* the cold-start landing (shell spec §3.2 "variant zero" — unchanged).
   - **Exactly 1 supportee:** the supporter lands directly in that person's scope; **no Support-hub pill is rendered**. Modules addressed to the supporter about that person (approve/consent card, notices, the morphing state card) fold into the top of that person scope. Genuinely account-level supporter items (billing, account) stay in More.
   - **2+ supportees:** the hub pill returns as the multi-person overview.
   - This supersedes the shell spec's "keep hub and person scopes separate even with a single linked person" ruling (§4.2) for the single-supportee case.
2. **Me scope is always present in the supporter chip.** With no self-learning state it renders a default doorway — "start your own learning", or "learn along" phrasing when they support someone — instead of disappearing. This supersedes §4.1's chip rule "[ Me — after first real self-learning state ]", §4.2 state 3's appear-on-activity behavior, and the step-aside `SupporterSelfLearningDoorway` design (WI-2243): the doorway's job moves into the Me scope's empty state.
3. **The multi-person hub is the V1 parent hub generalized.** One morphing card per person (preserving §3.2's one-anchor-per-child law), with the card's data grade keyed to MMT-ADR-0028's login-presence axis:
   - **FULL** for managed charges — the existing owner-scoped V1 hooks and card composition are legal and reused directly;
   - **MASKED** for credentialed supportees — fed exclusively from the consent-gated shared-record read model (per-kind allowlist from MMT-ADR-0027), because `assertChargeNotCredentialed` (MMT-ADR-0008) forbids the owner-scoped path for these rows *by design*.
   - Long-term, this merges family-mode home and the Support hub into one relationship-graded surface — the destination the S6 V0/V1-retirement ruling (shell spec §11, WI-1308) retires the old shells into.
4. **No server-composed prose on supporter surfaces.** The server ships structured facts (`kind` + typed `metadata`); the client renders them through i18n templates in the viewer's UI locale, with learner-generated content clearly attributed and never promoted into chrome (titles, headers). This is enforcement of the shell spec's template-first narration discipline (§8.2 activity ledger + ruled-decision log #2), not new design.
5. **V1 surfaces are preserved when V2 turns on.** Enabling the V2 shell/scope flags must not remove, cut down, or degrade the V1 parent-hub (family-mode) surface or any currently shipped flag state. V2 supporter surfaces are additive behind their flag; the legacy/V0/V1 cells stay frozen and shippable until the S6 retirement ruling is executed with parity evidence (reaffirms MMT-ADR-0024's point 5 and makes it a testable guarantee, not just posture).

## Consequences

- A supporter with one supportee gets a person-first experience with zero navigation dead-ends; the hub concept survives only where it earns its place.
- The Me-scope resolution in `apps/api/src/services/scope-resolution.ts` changes from state-conditional to unconditional for the supporter shape; `SupporterSelfLearningDoorway` retires into the Me empty state (sequenced so WI-2242's in-flight work is migrated, not broken).
- Credentialed supportee cards can never silently widen: the data path itself (shared-record) enforces the visibility contract, so a UI bug cannot leak owner-grade data.
- The mixed household (managed + credentialed people on one hub) becomes a first-class, owned cell instead of an unowned gap.
- Per-field redaction granularity for MASKED cards (how much recap/proof detail a visibility contract exposes) remains an **open decision** — it gets its own ruling (and ADR if it meets the MMT-ADR-0000 gate) before V1-parity recap/proof cards ship on credentialed rows.
- The shell spec §4.1/§4.2 carries an amendment note pointing here; MMT-ADR-0024's eventual acceptance change-set must incorporate these amendments.

## Alternatives considered

1. **Keep the unconditional hub (spec as written).** Rejected by QA evidence: with one supportee the hub is an empty corridor between the app and the only person that matters, and its addressed-to-me content is all about that one person anyway.
2. **Build new V2 presentation components over the shared-record read model (Option A of the deep dive).** Rejected: rebuilds polish V1 already has, slowest path, duplicates a working component kit, highest regression surface.
3. **Keep Me appear-on-activity.** Rejected: QA showed no visible invitation into own learning anywhere; the adult self-directed learner is the highest-value persona (§4.1) and the doorway pattern proved undiscoverable in practice.
4. **Fold everything into person scopes and delete the hub concept entirely.** Rejected: with 2+ people the supporter needs a cross-person overview and a home for items addressed to them; the conditional hub keeps that without taxing the single-supportee majority.

## Links

- Design spec (the *what*): `docs/specs/2026-07-26-supporter-surface-v1-presentation-over-v2-logic.md`
- Shell spec being amended: `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md` §3.2, §4.1, §4.2, §6, §8.2 + ruled-decision log #2 (template-first), §11/§13 (S6 retirement)
- Work item: WI-2777 (deep dive umbrella; operator ruling recorded as page comments, 2026-07-26)
- Named inputs reconciled by the spec: WI-2460 (mentor-language override provenance), WI-2197 (supporter notification routing), WI-2518 (supporter-scope read-authority)
- Key code: `apps/api/src/services/shared-record-read-model.ts`, `apps/api/src/services/reportability.ts`, `apps/api/src/services/scope-resolution.ts`, `apps/api/src/services/family-access.ts` (`assertChargeNotCredentialed`), `apps/mobile/src/components/support/`, `apps/mobile/src/components/home/` (V1 kit)
