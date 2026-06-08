# `domain-model.md` — extracted provenance (Phase J0 scrub, 2026-06-08)

Decision-history and consumed-handoff material lifted out of `domain-model.md` when it was scrubbed for
graduation to `docs/canon/identity/domain-model.md`. **Not canon.** Systems of record: the ADRs
(`docs/adr/`), the ROADMAP (open threads), and the graduated canon. Terminology note: `mentor`(human)→
`supporter`, `mentorship`→`supportership` per the 2026-06-08 rename — preserved below in original form as a
historical record (this is provenance, not live canon).

---

## Preamble ratification stamp (removed)

> **Status:** RATIFIED — Phase D, 2026-06-03. Entities / roles / consent model / tenancy locked;
> org/membership re-derived (not inherited from the archived `0106` design). Owner: Claude (architect
> ratifies). Feeds: Phase E (data model). Sources: ontology v1.1; PRD Part 10 (esp. §H); discovery in
> `archive/domain-model-options.md` + `_research/age-consent-spike.md`; ADRs 0001/0002/0007–0010.

Current truth: the rules live in the graduated `domain-model.md`; the *why* lives in the ADRs.

---

## §7 — Handoff to Phase E + open legal (consumed; Phase E ratified 2026-06-04)

This section was a forward handoff that Phase E has since consumed. Its physical realization is
`data-model.md` §2–§4 + `MMT-ADR-0011`/`0012`. Retained here for trace; the open items it named are
tracked live in `ROADMAP.md` (REQ-2 counsel register + tracked open threads), not here.

- Physical schema for every entity/edge/attribute + the `profiles`→`person` rename → `data-model.md` §2/§4; squash = `MMT-ADR-0012`.
- Recorded-Payer identity under Family Sharing / Ask-to-Buy → column in place (`subscription.payer_person_id`); value is a Phase-F product + counsel call (access-inert per `MMT-ADR-0002`).
- The `MMT-ADR-0008` authority-resolver derivation + its break-tests (incl. the no-self-fallback regression against the live `getFamilyOwnerProfileId` bug) → schema is input; resolver + tests are Phase F.
- The `MMT-ADR-0009` scheduler pair + `birth_date`/`last_activity` index → indexes in `data-model.md` §4.1; the sweep owns consent refresh at age transitions + the moved-country grace window.
- The `migration-pending` state machine + Failure-Modes tables (`MMT-ADR-0010`) → `data-model.md` §6.4.
- The segmented-deletion seam (retain-financial / purge-learning) → `data-model.md` §4.9 (`person_retain`) + §6.1.
- To counsel (REQ-2 register; none gate Phase F as a whole): co-guardian one-of/all-of rule; dormancy period + pre-deletion notice + retention carve-outs; parent-delete permissibility; minor double-billing disclosure + grace; VPC scope. VPC vendor pick (KWS vs k-ID) is a procurement call after legal requirements.

---

## §8 — Decisions ledger (removed; ADRs are the system of record)

| Decision | Ruling | ADR | Status |
|---|---|---|---|
| Core entity & role model (entities/roles/Person≠Login) | as ontology Grill #1 | MMT-ADR-0007 (reconstructed) | locked |
| Guardianship capability placement | Option A — global edge, derived operation | MMT-ADR-0008 | locked |
| Multi-org governance — consent/visibility | ruled by the ADR-0008 derivation | MMT-ADR-0008 | locked |
| Multi-org governance — billing/quota | v1 single home org; federation deferred | MMT-ADR-0010 | v1 ruled; federation → post-v1 |
| Durable transition scheduler | Option 1 — unified daily sweep | MMT-ADR-0009 | locked |
| Family-join / consolidation primitive | invite-flow + consolidation; billing opt B | MMT-ADR-0010 | v1 ruled |
| Separated parents one-vs-two Person | reachability locked; v1 build scope | — | product + legal (PM) |
| Recorded-Payer under Family Sharing | — | — | → Phase E (now: column in place) |
| Co-guardian one-of/all-of | set *shape* locked; rule → counsel | — | → counsel |
| De-credential | disallowed; manual audited ops only | — | locked |

The three ADR-less rows (separated parents, recorded-Payer, co-guardian one-of/all-of) are open items
tracked in `ROADMAP.md`; they are not decisions.
