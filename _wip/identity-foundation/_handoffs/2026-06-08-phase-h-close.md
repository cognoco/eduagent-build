# Handoff — Phase H closed (2026-06-08)

**State:** Phases **A–H complete.** Next: **Phase I** (light pass on the rest of
`architecture.md` + `ARCH-N` touch + the canon-authorship process). Tracker:
`_wip/identity-foundation/ROADMAP.md`.

## What H produced

A new **`## Identity Foundation`** section in `docs/architecture.md` (authored
**plop-and-defer**: into the single doc, as a clean, target-idiom, **relocatable**
unit — the beachhead of the Stream-2 rebuild). Five subsections, outcomes-only, every
claim cited to the **19-member canonical set** + `data-model.md` §s:

1. **Identity model & tenancy** — own-the-graph/Clerk-auth-only, Person ≠ Login, roles
   primitive vs capacities, org/membership re-derived, `is_owner` derived, `T3` scoping.
2. **Capability split** — Guardian=consent-only, Mentor=data-access-only, Payer
   sub-field (1+≤1), charge terminology, G-3/G-4/G-6.
3. **Consent & age model (Path X)** — three-axis, 13+ floor, sub-13 built-but-gated,
   `regimes`-as-data, `consent_grant` event log, knowledge audit, direction-aware gate.
4. **Policy-engine spine, router/vetting, safety/judge** — two primitives, policy-as-data
   (DB-master), 3-param router ⟂ 4-axis vetting hard split, `CircuitOpenError`,
   judgment-based safety + vendor-independent judge.
5. **Lifecycle & clean-cut posture** — unified daily sweep, family-join consolidation
   primitive + `migration-pending`, one-time baseline reset / no-flag clean cut.

**Transitional markers** (greppable; stripped at Stream-2 rebuild):
- `[TRANSITIONAL — DOC STATE]` banner at doc top (Identity Foundation = new canon; all
  else = legacy; on conflict Identity Foundation wins).
- `[CANON-NEW · ratified]` banner under the section.
- 5 inline `<!-- [LEGACY-REVIEW] -->` anchor comments (see worklist).

**Self-review (T7):** citation audit clean — 13 cited ADRs, **all** canonical-set
members, zero non-members; no contradiction with the locked set; "ward" appears only as
the retired-term note. Marker grep: 1 doc banner + 1 section banner + 5 anchors.

## Phase-I worklist (the legacy `architecture.md` surgery H deferred)

H **marked**; I **rewrites** (scope-by-touching: directly-misleading → corrected;
merely-incomplete → left). The 5 `[LEGACY-REVIEW]` anchors:

| Anchor (current ≈line) | Legacy text | Rewrite to |
|---|---|---|
| NFR table (~68) | "COPPA-adjacent · Ages 11-15" | Path X: 13+ floor, sub-13 built-but-gated (`MMT-ADR-0015`) |
| Project-context bullet (~97) | "Multi-tenancy: Family accounts with profile isolation…" | tenancy = org/membership re-derived (`MMT-ADR-0007/0010`) |
| Authorization-model ¶ (~375) | "Custom RBAC on profile metadata (parent, teen, learner)" | roles primitive `{admin, learner}` + Guardian/Mentor/Payer split (`0007/0008/0015`) |
| Enums table (~623) | "`consent_state`: PENDING/PARENTAL_CONSENT_REQUESTED/…" | append-only `consent_grant` log keyed `(charge × purpose × org)` (`0011` §3) |
| NFR-coverage table (~1698) | "COPPA-adjacent · Ages 11-15" | Path X + three-axis age model (`MMT-ADR-0015`) |

Plus the two non-anchor I items (ROADMAP I-row):
- **(c) Canon-authorship process + `0016`↔`0000` reconciliation** — define how content
  enters `architecture.md`, the ADR↔`architecture.md`↔`ARCH-N` relationship; **and the
  doc title** "Architecture Decision Document" is itself misleading (canon vs decisions
  conflation) → fix as part of (c). *(Moved here from H per the G/J-boundary discussion.)*
- **(b) Identity-domain `ARCH-N` promotion/supersession** — registry-wide drain stays
  **Stream 2**; I touches only identity-intersecting `ARCH-N`.

## J(0) reminder (citation rewrite)

The Identity Foundation section cites `data-model.md` / `domain-model.md` /
`identity-foundation-prd.md` at their current **`_wip/identity-foundation/`** paths.
When those graduate to `docs/canon/` at **Phase J(0)**, rewrite the section's citations
to the `docs/canon/` paths. (Flagged in the section's `[CANON-NEW]` banner.)

## Stream-2 reminder

The full `architecture.md` rebuild (the `ARCH-N` reverse-engineering) **relocates the
`## Identity Foundation` section intact** and **strips all transitional markers**
(`[TRANSITIONAL — DOC STATE]`, `[CANON-NEW]`, `[LEGACY-REVIEW]`). The section was
authored as a self-contained relocatable unit precisely for this.

## Watch-outs
- The 3 table-row `[LEGACY-REVIEW]` comments render as an extra empty trailing cell on
  their row (cosmetic raggedness on legacy tables; harmless, removed at Stream 2).
- `architecture.md` is still at `docs/` root (loose canon) — it drains to `docs/canon/`
  at **Phase J(c)**, separate from the J(0) domain-doc move.
