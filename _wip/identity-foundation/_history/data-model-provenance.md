# `data-model.md` — extracted provenance (Phase J0 scrub, 2026-06-08)

Status/provenance banners, the Phase-E decisions ledger (D1–D8), and the cross-reference index
(including rot-prone `file:line` defect cites) lifted out of `data-model.md` when it was scrubbed for
graduation to `docs/canon/identity/data-model.md`. **Not canon.** Systems of record: the ADRs
(`MMT-ADR-0011/0012/0013/0014/0015` and the Phase-D set), the ROADMAP (open threads / counsel
register), and the graduated canon. Terminology note: this file preserves the **original** terms
(`mentorship`/`mentor`/`mentee`); the live rename is `mentorship`→`supportership`,
`mentor`→`supporter`, `mentee`→`supportee`. Counsel-finding codes (`I-C1`, `I-PB-B2b`, …) and
Phase-E decision codes (`D1`–`D8`) are runway-internal and die with the runway; the rules they name
graduate in plain language.

---

## Preamble status / provenance / lockstep / out-of-scope (removed)

> **Status:** Phase-E baseline RATIFIED (2026-06-04); amended pre-baseline 2026-06-07 per
> `MMT-ADR-0013` (policy-engine spine), `MMT-ADR-0014` (router runtime/vetting split), `MMT-ADR-0015`
> (data-model amendments) — additions fold into the baseline (`MMT-ADR-0012` pre-baseline window).
> **Provenance:** `domain-model.md` v1.1 + the 8 Phase-E decisions + the 2026-06-03 counsel walkthrough
> + the A-vs-B memo (2026-06-06) realized in `MMT-ADR-0013/0014/0015`. **Lockstep partners:** the ADRs
> above + ontology §R + `domain-model.md` §7 carry + CONTEXT.md noun parity + ROADMAP Phase-E flip.
> **Out of scope (Phase F):** the `drizzle-kit` baseline migration, the inert-table revert execution,
> RLS enforcement, the `inv 17` rephrase, the "11" final product call, retention *values* (counsel),
> VPC vendor (procurement).

Current truth: the schema is the graduated `data-model.md`; the *why* lives in the ADRs.

---

## §8 — Phase-E decisions ledger (D1–D8) — ADRs are the system of record

| # | Decision | Ruling | Realizes | ADR |
|---|---|---|---|---|
| D1 | Cut posture | Clean baseline, one documented reset, append-only forever | (the reset itself) | `0012` |
| D2 | Credential placement | Nullable column on `person` + thin `login` table | `MMT-ADR-0007` | `0011` |
| D3 | Payer placement | `payer_person_id` snapshot on `subscription` (access-inert); subscription→org; quota derived | `inv 18` + `MMT-ADR-0002` | `0011` |
| D4 | Role storage | Array-of-enum `{admin, learner}`; `is_owner` dissolves; mentor/guardian → edges | `MMT-ADR-0007` | `0011` |
| D5 | Edge storage | Two purpose-built tables: `guardianship`, `mentorship` | `MMT-ADR-0008` + `inv 19` | `0011` |
| D6 | Consent shape | `consent_grant` event log; `birth_date`; country ISO; assurance seam; `org_id` kept; `controller_role` deferred | (ratified) | `0011` |
| D7 | Scheduler physicals | Unified daily sweep; `personId+day` idempotency; denormalized `last_activity_at`; indexes | `MMT-ADR-0009` | `0011` |
| D8 | Retention seam | Structural `person_retain` set (consent_receipt, deletion_audit, financial_record) | counsel receipt-survival + direction-aware gate | `0011` |

Open threads the schema designs around but does not resolve (live in ROADMAP): the "11" age-floor
final product call; retention *values* (counsel); the `inv 17` rephrase (architect — since closed,
see ontology provenance); VPC vendor (procurement).

---

## §9 — Cross-references (the verification index; code cites are pre-cut and will rot)

### Invariants cited (graduated — see ontology §4)
`inv 4` (under-age self-signup hits the consent gate) · `inv 11` (consent over a guardian set) ·
`inv 14` (never auto-Guardianship) · `inv 18` (home org owns billing + consent + quota) · `inv 19`
(supportership opt-in) · `inv 20` (history not destroyed to join) · `inv 21` (deletion never orphans
history) · `inv 22` (three-layer authority separation) · `inv 23` (Guardianship as a global edge) ·
`inv 24` (unified transition scheduler) · `inv 25` (`migration-pending` interim state) · `inv 28`/`inv 30`
(minor-initiated guardianship banned) · `inv 29` (worst-case-default / take the stricter signal).

### ADRs cited (system of record — `docs/adr/`)
`MMT-ADR-0001` (Clerk = auth only) · `0002` (Payer = store-delegated) · `0007` (core identity entity &
role model) · `0008` (Guardianship = global edge) · `0009` (unified daily scheduler) · `0010`
(family-join primitive) · `0011` (Phase-E data-model realization) · `0012` (one-time baseline reset) ·
`0013` (policy-engine spine) · `0014` (router runtime/vetting split) · `0015` (pre-baseline amendments).

### Counsel rulings baked in (runway-internal IDs; the rules graduate in §4/§6 plain language)
- `I-C1` — `consent_states` cascade defect; write-then-delete defect; no retain-tier → fixed by `person_retain`.
- `I-C2` — guardian-initiated child erasure lawful → `deletion_audit.deleted_by` + forward-only guard.
- `I-C4` — consent never refreshed at age transitions (live defect) → owned by the daily sweep.
- `I-PB-B1` — no legal usage floor; "11" is a product choice needing documented rationale.
- `I-PB-B2a` — VPC = disclosure-grade enumerated method; tokenised pass/fail only → `consent_grant.assurance_token`.
- `I-PB-B2b` — direction-aware gate; retain prior value + audit fact → `consent_grant.prior_value`/`audit_fact`.
- `I-PB-B3b` — platform age-signal routing-only; never substitutes for VPC.
- `I-A2` — parent's contract ≠ lawful basis for a minor's processing → `consent_grant.lawful_basis`.
- `I-D1` — consent ontology cannot represent cross-org consent → schema pre-wires the v1 org-scoped stance.
- `I-E3` — moved-country grace window (parameter, not value).

### Code citations (pre-cut drift map — rot at the clean cut)
- `packages/database/src/schema/profiles.ts:38-50` — the `birthYearSchema` 11-floor (the "11" final call).
- `profiles.ts:79-180` — existing `accounts` + `profiles` + inert `organizations`/`memberships` + `family_links`.
- `profiles.ts:319-321` — the `onDelete:'cascade'` consent-receipt-destroying defect.
- `apps/api/src/middleware/account.ts` — the JIT `findOrCreateAccount` (per `MMT-ADR-0010`).
- `apps/api/src/inngest/functions/daily-snapshot.ts` — the daily-sweep pattern `MMT-ADR-0009` mirrors.
- `apps/api/drizzle/0106_identity_t1_org_membership.sql` + `migrations/identity-t1-backfill.sql` — the inert revert targets.
- `apps/api/src/services/consent/consent.ts:898-901` — the write-then-delete defect.
