# ADR provenance re-vet — WI-752

Date: 2026-06-30
Scope: active `docs/adr/*.md`, `docs/architecture.md`, and unbuilt V2 S-phase plans (`S4`/`S5`/`S6`).

## Method

Queries run from the `WI-752` worktree:

```powershell
rg -n "Phase|S[0-9]|Stream|proposed|docs/plans|docs/specs|_wip|plan-as|spec §|plan §|source of truth|authoritative.*plan|plan.*authoritative" docs/architecture.md
rg -n "Status: Proposed|Decision \(proposed\)|Architecture sign-off pending|Source spec|Driving spec|Near-term fix|docs/specs|docs/plans|_wip|Phase [A-Z0-9]|Phase [0-9]|S[0-9]|T[0-9]|to be authored|pending the|proposed" docs/adr -g "*.md"
```

Review rule applied from `MMT-ADR-0000` §II.6: L3 artifacts may appear as context or implementation pointers only; they must not be the ADR's spine or a canon authority source.

## Rulings

| ADR | Finding | Ruling |
|---|---|---|
| `MMT-ADR-0000` | Governance text already covers reconstruct-vs-launder, L3-in-passing-only, Architecture sign-off, dedicated ADR change-sets, and a forward ADR-provenance guard design. | **Keep.** Guard is designed but not implemented here; implementation remains follow-on lifecycle work. |
| `MMT-ADR-0002`, `0007`-`0015`, `0020` | Identity-foundation ADRs still contain historical phase/workstream labels or `_wip` inputs. The decision spine is the accepted identity architecture, not a feature plan. `architecture.md` now carries the living identity canon without `_wip` or phase actors. | **Keep.** No canon edit required beyond the `architecture.md` cleanup in this WI. Future editorial cleanup may remove historical labels, but they are not current plan-as-authority. |
| `MMT-ADR-0005`, `0006`, `0018` | Reconstructed/formalized seed ADRs cite legacy plans/registers as provenance. | **Keep.** This is sanctioned reconstruction provenance, not laundering. |
| `MMT-ADR-0016`, `0017`, `0019`, `0025`, `0029` | Plan/spec links are implementation, detail-owner, supersession, or source-spec pointers. | **Keep.** No lockstep canon change required. |
| `MMT-ADR-0023` | Proposed ADR relied too heavily on V2 spec/S1 task phrasing. | **Keep Proposed / Amend.** Text now makes the architectural spine the turn-1 subject-commitment risk and marks spec/plan links as contextual pointers only. |
| `MMT-ADR-0024` | Proposed scope-chip ADR was promoted into `architecture.md` as if it were canon. | **Demote from canon / Keep Proposed.** `architecture.md` scope-chip section removed; ADR now says no canon line exists until acceptance. |
| `MMT-ADR-0027` | Accepted visibility ADR used `S5` as the actor. | **Amend / Keep Accepted.** Text now says the visibility contract owns the rule; spec link is contextual only. |
| `MMT-ADR-0028` | Accepted tier/graduation ADR used `S5` as the actor. | **Amend / Keep Accepted.** Text now says the visibility-tier contract owns the rule; spec link is contextual only. |

## Lockstep canon edits

- `docs/architecture.md` no longer promotes the proposed `MMT-ADR-0024` scope-chip rules.
- `docs/architecture.md` removes `_wip`, Stream/Phase rollout labels, and the proposed-scope-chip canon block from active canon prose.
- The accepted `MMT-ADR-0027`/`0028` rules did not require new architecture prose in this WI because the existing `architecture.md` scope-chip section was the only flagged lockstep problem.

## S-phase contradiction check

- `S4` remains partial/unbuilt. Its scope-chip tasks are implementation-plan content until `MMT-ADR-0024` is accepted by human Architecture and promoted lockstep.
- `S5` remains partial/unbuilt. `MMT-ADR-0027`/`0028` stand as amended Architecture decisions, but missing link screens and trust/security break-tests still block parity.
- `S6` remains deferred. It cannot delete V0/V1 paths until `MMT-ADR-0024` is accepted where relevant, S4/S5 heirs are live, the V0-retirement ruling exists, and explicit human irreversibility confirmation is obtained.

## Child item findings

Do not close these from this WI:

- `WI-1125` (ADR number/collision cleanup) appears mechanically improved by the current `0027`/`0028`/`0029` numbering, but still needs lifecycle review/QA rather than hand-close.
- `WI-1126` (S5 trust/security break-tests), `WI-1137` (S5 `link/*` mobile screens), `WI-1135` (S4 cold-start surfaces), `WI-1136` (S4 co-learning doorway), and `WI-1127` (S4 coldstart route) remain real blockers for S4/S5/S6 heir parity.
- The ADR-provenance forward guard described in `MMT-ADR-0000` §II.6 is not implemented in this WI; it needs its own tracked implementation item or an existing child item update by the coordinator.
