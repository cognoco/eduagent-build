# MMT-ADR-0024 — Relationship scope chip supersedes mode/proxy tab-shape navigation

**Status:** Proposed · 2026-06-20 (re-affirmed Proposed 2026-06-30) · **Scope:** Mobile app shell navigation and relationship-lens data access · **Builds on:** MMT-ADR-0000 (decisions layer), MMT-ADR-0007 (Person identity model), MMT-ADR-0008 (guardianship operation is distinct from everyday visibility)

> **A Proposed ADR promotes no rule into canon.** This decision is not in force: nothing here is binding on `architecture.md` or on implementation until an acceptance change-set lands, and that change-set must amend canon in lockstep. (A section describing this model was once added to `architecture.md` prematurely and has been removed.)

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
