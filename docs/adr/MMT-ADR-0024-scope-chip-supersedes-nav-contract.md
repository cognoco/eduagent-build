# MMT-ADR-0024 — Relationship scope chip owns scope SELECTION (it does not supersede the navigation contract)

> Heading corrected 2026-08-08 (`WI-2905` — the work item that found this ADR's supersession claim contradicting the code, and that guards the cutover plan's conditional deletion against it). The previous heading read "Relationship scope chip **supersedes mode/proxy tab-shape navigation**", which a reader could take as established fact and which the code contradicts. The filename is deliberately unchanged: inbound references across plans, specs and prior change-sets cite it, and renaming buys no correctness.

**Status:** Proposed · **explicit non-reliance in force (recorded 2026-08-01 — see § Disposition)** · 2026-06-20 (re-affirmed Proposed 2026-06-30) · **Scope:** Mobile app shell navigation and relationship-lens data access · **Builds on:** MMT-ADR-0000 (decisions layer), MMT-ADR-0007 (Person identity model), MMT-ADR-0008 (guardianship operation is distinct from everyday visibility) · **Amended by:** MMT-ADR-0037 (Accepted — supporter IA amendments an eventual acceptance change-set must incorporate)

> **A Proposed ADR promotes no rule into canon.** This decision is not in force: nothing here is binding on `architecture.md` or on implementation until an acceptance change-set lands, and that change-set must amend canon in lockstep. (A section describing this model was once added to `architecture.md` prematurely and has been removed.) The § Disposition below makes the non-force posture an explicit, durable non-reliance record: downstream rollout and deletion work must not treat any clause of this ADR as ratified authority.

> **TITLE CORRECTION — the chip owns scope SELECTION, not tab SHAPE (recorded 2026-08-08 by `WI-2905` — the work item that found this drift and code-verified the cutover plan's deletion condition against it).** This ADR's former title and its "supersedes mode/proxy tab-shape navigation" framing overstate what the V2 chip actually owns, and a reader skimming the title can reach the opposite of the truth. **Verified against `main` on 2026-08-08:**
>
> - `apps/mobile/src/hooks/use-navigation-contract.ts:22` hardcodes the V2 tab set (`V2_TABS = {mentor, subjects, journal}`) in the **hook**, not in the chip. The chip does not compute it.
> - `use-navigation-contract.ts:78-97` calls `resolveNavigationContract(...)` with `activeProfile`, `profiles`, `isParentProxy`, `appContext`, `role`, `subscription` and the flags — and this runs on **every** path, V2 included; there is no V2 short-circuit ahead of it.
> - `use-navigation-contract.ts:192-203` — the V2 branch of `useNavigationShellContract()` returns `visibleTabs: V2_TABS` **but still returns the resolved `contract`**, which downstream code consumes for gating (`navigationContract.gates.*`).
> - `useNavigationHomeContract()` (`:213`) and `useNavigationDataScopeContract()` (`:232`) have **no V2 branch at all** — they return the resolved contract unconditionally, on every flag state.
>
> So the accurate statement is: **the scope chip owns scope SELECTION (whose data is in view); `resolveNavigationContract()` still owns navigation SHAPE and the gate surface.** The chip has not superseded the navigation contract, and `navigation-contract.ts` is live code on the V2 path.
>
> This correction is a factual amendment to points 4–5's framing, not a status change: the ADR remains **Proposed** under explicit non-reliance. It exists because the plan for the legacy-shell deletion once carried a conditional deletion of `navigation-contract.ts` phrased as "if the V2 chip fully owns shape" — a condition that reads as satisfied on this ADR's title and is **false in code**. That condition is now code-verified rather than ADR-derived; see `docs/plans/v2-plan/2026-06-10-s6-cutover-deletions.md` § T10. Surfaced by `WI-2062` — the ADR-0024 disposition audit that produced the § Disposition non-reliance record below, currently blocked on a separate Cosmo Kind guard — and captured separately so this guard could land whether or not that audit unblocks.

## Context

The mobile shell currently exposes audience state through a mix of tab shapes, mode switching, and parent-proxy behavior. That matrix was useful while the app still used profile-shaped parent/learner modes, but it does not match the identity model where a signed-in human can have multiple relationship lenses at once: their own learning, a Support hub, and one named person-scope per active supportership edge.

The hard architectural problem is not the visual chip. It is ownership of scope. If tabs, proxy mode, and per-screen helpers each decide "whose data am I looking at?", then supportee data can drift into the wrong shell and V0/V1 compatibility logic remains the de facto source of truth. The app needs one relationship-lens control surface that is explicit, edge-derived, and shared across the shell.

## Decision (proposed)

The V2 app shell uses a **relationship scope chip** as the primary scope selector.

1. **Learner shape renders no chip.** A person with no active outbound supportership edges has a single implicit `me` scope.
2. **Supporter shape renders an ordered chip list.** The list starts with `supporter-hub`, includes one `person` entry per active `supportership` edge, and includes `me` only after durable self-learning state exists for the supporter.
3. **Person-scope visibility is supportership-derived.** Everyday supporter visibility into another person is derived only from an active `supportership` edge. Guardianship, organization membership, and payer state do not create this chip scope.
4. **V2 tabs preserve active scope.** Bottom-tab navigation changes the view within the current scope; it must not silently switch from Support hub to a person scope or from person scope to Me.
5. **V0/V1 remain flag-isolated until retirement.** `resolveNavigationContract`, legacy tab-shape helpers, proxy-mode plumbing, and `ModeSwitcher` remain alive for V0/V1 shells until an explicit later retirement. V2 supersedes them; it does not delete them in the same move.
6. **Scope defaults are user-owned.** The client may use the server's `defaultScopeIndex` as a hint, but a persisted last-active scope for the active profile wins when still present in the current scope list.

## Consequences

- The V2 shell has one source of truth for "whose surface is active": `scope-context` and the descriptor returned by `/scopes`.
- Server APIs that read supportee data must assert active supportership before the read. Client-side hiding is not an access-control mechanism.
- Support-hub tabs can become first-class surfaces without reusing the old family/study mode distinction.
- A dual-role adult can switch between their own learning and supporter surfaces without changing account, profile, or proxy state.
- V0/V1 regression risk is contained by feature flags: the old shell remains available while V2 is introduced and verified.
- The later deletion work must remove obsolete mode/proxy/tab-shape surfaces only after the V2 scope-chip path is live and parity-checked.

## Alternatives considered

1. **Keep mode switcher and add person filters inside screens.** Rejected: scope would be re-decided per screen, making supportee-data isolation harder to audit.
2. **Promote every supportee to a profile/proxy switch.** Rejected: proxy mode implies operating as the child rather than viewing through a supporter relationship lens.
3. **Replace V0/V1 immediately.** Rejected: production still depends on the legacy and V0/V1 shells. Deletion belongs in a later flag-retirement step after V2 replacement evidence exists.

## Links

- **Canon:** none while this ADR is Proposed. Acceptance must land the canon line in the same change-set.
- **Related implementation surfaces:** `packages/schemas/src/scope.ts`, `apps/api/src/services/scope-resolution.ts`, `apps/mobile/src/lib/scope-context.tsx`, `apps/mobile/src/components/chrome/ScopeChip.tsx`.

## Disposition — Explicit non-reliance (effective 2026-08-01)

This ADR's status was formally resolved as **explicit non-reliance**: the ADR stays Proposed, and no rollout, visibility-contract, or cutover/deletion work may treat any clause of it as ratified authority. Each surface that needs scope-chip semantics takes them from the governing contract in the table below, never from this ADR.

This record is bookkeeping, not a new architectural position. It makes durable a posture already ruled three times: (a) this ADR's own non-force banner; (b) the 2026-06-30 ADR governance correction ("scope-chip canon must not be treated as ratified until this ADR is accepted in a separate Architecture-signed change-set" — recorded on the visibility-contract plan during a provenance re-vet); (c) the 2026-07-15 one-way-door drain ruling that named "acceptance or non-reliance note" as the required resolution artifact before the V2 cutover work may rely on scope-chip semantics. Resolution audit performed 2026-08-01 (attribution: WI-2062).

### Non-reliance table — surfaces that must not depend on this ADR, and what governs them instead

The covered surfaces are the V2 visibility-contract rollout (linking ceremony, two-way transparency, shared-record reads — historically labelled S5, shipped) and the V2 cutover and legacy-shell deletion work (historically labelled S6, not cleared; plan: `docs/plans/v2-plan/2026-06-10-s6-cutover-deletions.md`). "Ratified authority" below means an Accepted ADR; "working contract" means the semantics live in a spec and/or code today and canon ratification is still owed at the eventual acceptance change-set. A working contract is **not** ratified authority (specs are historical context per the ADR operating guide, never authority): working-contract rows authorize nothing by themselves — in particular they do not authorize the irreversible legacy-shell deletions, whose authorization remains the cutover plan's own gates (product ruling, heir/parity evidence, explicit human confirmation). These rows exist so nobody cites this ADR for those semantics, and so the eventual acceptance change-set knows exactly which invariants it still owes to canon (points 4 and 6, plus the wire contract).

| Scope-chip semantic (this ADR's clause) | Must be taken from | Kind |
|---|---|---|
| Chip composition and supporter IA — hub conditionality, Me-scope presence, single-supportee landing (points 1–2) | MMT-ADR-0037 decisions 1–3 (which amend points 1–2 of this ADR) + shell spec §4.1–§4.2 as amended | Ratified authority (0037) over a working contract (spec) |
| Person-scope visibility derivation and reportability walls (point 3) | MMT-ADR-0027 (supporter visibility contract), MMT-ADR-0028 (visibility tier), on the MMT-ADR-0007/0008 edge model | Ratified authority |
| Server-side authorization before supportee reads (Consequences: "assert active supportership before the read") | MMT-ADR-0027's contract plus the read-authority guard ratchet (`apps/api/src/services/profile-read-authority.guard.test.ts`); the supportership-edge read primitive is not yet fully built — see reconciliation notes | Ratified contract; wall partially built |
| Scope-preserving bottom tabs (point 4) | Shell spec §6.3 ("Bottom tabs are scope-preserving") | Working contract |
| V0/V1 shells stay flag-isolated until an explicit retirement ruling (point 5) | MMT-ADR-0037 decision 5 (the testable no-regression guarantee) + the cutover plan's gate structure | Ratified authority |
| Scope defaults are user-owned; last-active wins (point 6) | Shell spec §4.2 state 3 (EU-4) + `apps/mobile/src/lib/scope-context.tsx` | Working contract |
| Wire/data shape of `/scopes` and the scope descriptor | `packages/schemas/src/scope.ts` + `apps/api/src/services/scope-resolution.ts` and their tests | Working contract |

### Reconciliation findings (audited 2026-08-01)

- All four implementation surfaces named in Links exist and are live behind the V2 flags; canon (`architecture.md`) carries no scope-chip section (verified absent 2026-08-01 — the prematurely-added one remains removed).
- `apps/api/src/services/scope-resolution.ts` still implements this ADR's *original* chip composition (Me appears only after first real learning state; hub unconditional), while MMT-ADR-0037's accepted amendments (Me always present; hub only at zero or 2+ supportees) are not yet implemented there. The running code lagging 0037 is implementation debt under 0037 — it is not evidence for accepting this ADR as written.
- The server-side authorization wall for supporter person-scope reads is partially built: the read-authority ratchet covers profile-scoped reads, and its own notes record supporter-scope gaps awaiting a dedicated supportership-edge read primitive. Certifying point 3's consequence as satisfied canon would overstate the current wall — a further reason acceptance is not available as bookkeeping today.

### Alternatives considered (for the disposition)

1. **Accept now, as amended by MMT-ADR-0037.** Rejected for now: acceptance is an Architecture-signed act with a lockstep canon change-set (MMT-ADR-0000 §II.6); the supporter-read authorization wall it would certify is not fully built; and the accepted amendments are not yet reflected in the resolver. Nothing here forecloses a later acceptance change-set — MMT-ADR-0037 already requires that change-set to incorporate its amendments.
2. **Mark Superseded by MMT-ADR-0037.** Rejected as factually wrong: 0037 builds on this ADR, amends only chip composition/IA, reaffirms point 5, and explicitly anticipates this ADR's "eventual acceptance change-set". Points 3, 4, and 6 have no successor ADR.
3. **Leave Proposed and say nothing.** Rejected: the cutover plan's pre-execution checklist needs a resolved status to gate deletions, and an unstated posture invites exactly the "treat Proposed as ratified" drift the one-way-door risk register flagged.

### Consequences of this disposition

- **The executable guard it creates** (stated in the cutover plan's pre-execution checklist): no change-set of the legacy-shell deletion work may cite MMT-ADR-0024 as governing authority. Every scope-chip-dependent deletion cites its authority from the table above; at the pre-execution checkpoint, `rg -n 'MMT-ADR-0024' <deletion change-set docs and code>` must surface only historical or non-reliance references, and any hit used as authority blocks the deletion until this ADR is Accepted in an Architecture-signed change-set.
- A future acceptance change-set — Architecture-signed, lockstep with canon, incorporating MMT-ADR-0037's amendments — supersedes this non-reliance record. Until then, the body of this ADR above is historical context only.
