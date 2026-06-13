# Decision capture — account-detachment, graduation vocabulary, supporter wall (2026-06-09)

**Status:** ratified in session (owner: Zuzana, 2026-06-09); pending canon amendment (deltas listed in
§4). **Traces to:** `docs/canon/identity/ontology.md` (inv 4/13/15/16/20/23), `prd.md` (R4, Part 10),
`domain-model.md` (§4 ADR-0008 derivation, §5 transition catalogue), `data-model.md` (§6.4
`migration-pending`), `MMT-ADR-0008`/`0010`. Session context: the 2026-06-09 flow-inventory audit
surfaced the parent-editable child mentor-memory screen and raw-input audit as supporter-privacy
tensions; this ruling resolves them on the identity model rather than per-screen.

---

## §1 — The rulings

1. **Account-detachment** (new canonical term) = the **managed → credentialed** transition: a Login
   attaches to the existing `person_id` while the Person may remain consent-gated (the "credentialed
   charge" cell, ontology §3.1 / inv 4). Action-triggered, identity-preserving (inv 20 mechanics),
   via the `MMT-ADR-0010` invite-flow + `migration-pending` interim. **Consent is untouched** — the
   guardianship edge and consent record ride through unchanged; where law requires it, the guardian
   remains consent-holder. Consent-holding conveys **no in-app control** (consent ≠ control; cf.
   inv 28's consent ≠ contract).
2. **Graduation** (term re-pointed) = the **consent-capability crossing** (time-triggered, scheduler
   per inv 24): guardian visibility → learner opt-in default-off (inv 19), guardian-granted
   supporterships lapse unless re-confirmed (inv 16), explicit self-takeover prompt (PRD Part 10).
   The 18-crossing (guardianship dissolves) stays its own threshold.
3. **Detachment entitlement at 13.** Account-detachment is guardian-grantable at any age (canon Part 10
   "own device" path, unchanged) and becomes **child-claimable at 13** — this supplies inv 13's open
   credential-eligibility-floor decision (ROADMAP). v1 mechanism stays parent-initiated invite-flow;
   the child-initiated request-to-detach is a follow-on flow (not banned — only minor-initiated
   *guardianship* is banned, inv 28/30).
4. **Mentor-memory management is a derived `manage`/`operate` capability**, never a stored grant. Per
   `MMT-ADR-0008` Option A: `guardian-link ∧ shared-org ∧ charge-has-no-Login`. Consequence: the
   parent-managed child mentor-memory surface (view/toggle/correct/delete — summaries without
   provenance) is legitimate **for managed charges only** and is structurally suppressed by
   account-detachment. No per-screen flag gating; the capability derivation is the gate. Same rule
   governs the raw-input audit surface on child detail.
5. **Supporter ceiling = the recap/grades layer.** A supporter (and a post-detachment
   guardian-as-consent-holder) sees curated summaries — recaps, subjects, mastery, streaks, activity —
   never notes, mentor memory, or transcripts. Notes stay walled at every tier; guardian access to a
   managed charge's full data runs through the explicit, audited export/rights path only (inv 21
   erasure/export pattern), never ambient browsing. Any future widening must be two-way-transparent
   (child's UI states what the guardian can see), never covert.
6. **Proxy mode: no entry, mechanics retained.** Verified 2026-06-09: zero production call sites pass
   `proxyMode: true` (`use-parent-proxy.ts:11-17`, `profile.ts:373` — comments only); proxy is dormant
   plumbing. Ruling: keep the mechanics (candidate for guardian act-for, PRD Part 9 crosswalk ⚠), never
   re-wire a user-facing entry point without an explicit ADR.

## §2 — The tier table

| | Managed charge (no Login) | Credentialed charge (detached, still consent-gated) | Consent-capable (graduated) |
|---|---|---|---|
| Guardian capacity | consent-authority + derived operate/manage/view | **consent-authority only** (derived ops suppressed by Login presence) | none; supportership only if re-confirmed (inv 16) |
| Mentor memory | guardian may view/toggle/correct (summaries, no provenance) | untouchable | untouchable |
| Notes | walled; export/rights path only | walled | walled |
| Recaps/grades layer | visible (guardian view) | visible via Supportership edge (guardian-granted, inv 15) | visible only via learner-opt-in Supportership (inv 19) |
| Who can trigger next transition | guardian grants Login any age; child claims at 13 | graduation = time-triggered (scheduler, inv 24) | 18-crossing dissolves guardianship |

## §3 — Architecture verdict (checked 2026-06-09, all four canon docs)

The model handles account-detachment **natively** — no new entities, no schema change:
- the credentialed-charge cell is a named valid combination (ontology §3.1, inv 4);
- the transition is already row 1 of the lifecycle catalogue (domain-model §5), separate from the
  consent-crossing and 18 rows;
- mechanics specced to failure modes (data-model §6.4: nullable `person.login_id`, guardianship row
  unchanged, `migration-pending` interim);
- the capability consequence is automatic (ADR-0008 derivation — "a credentialed charge suppresses
  guardian `operate`");
- post-detachment summaries = the existing Supportership edge (inv 15/16).

## §4 — Canon deltas to execute (lockstep with an ADR or canon edit, per MMT-ADR-0000)

1. **Vocabulary fix (term-drift):** "graduation" currently names three different events — managed→
   credentialed (inv 20, R4), consent-capability crossing (inv 16), and 18-crossing (domain-model §5).
   Rename the login transition **account-detachment** (inv 20 + R4 mechanics + domain-model §5 row 1);
   reserve **graduation** for the consent-capability crossing (inv 16 + R9 effects); leave the
   18-crossing as its own named threshold.
2. **inv 13 floor:** record 13 as the child-claimable detachment age (the open ROADMAP
   credential-eligibility decision); guardian-grantable below it (existing Part 10 own-device ruling).
3. **R4 split:** R4a account-detachment (identity preserved, consent unchanged, any time); R4b
   graduation (the consent-crossing effects R4 currently bundles).
4. **PRD Part 10 addition:** the supporter-ceiling + notes-wall + proxy-no-entry rulings (§1.5/§1.6
   above) as settled product rulings.
5. **De-credential stays disallowed** (PRD Part 10) — detachment is one-directional like graduation.

## §5 — What this kills in the current app (post-baseline work, not now)

- `child/[profileId]/mentor-memory.tsx` + export: becomes derived-capability-gated (managed charges
  only) instead of unconditionally reachable.
- Raw-input audit card in `child/[profileId]/index.tsx:451-513`: same gating.
- Proxy entry points: none exist; add a guard note/test rather than code change.
- These ride the identity baseline reset — do not build flag-gating interim fixes (cf.
  `project_stars_parked_until_baseline_reset` pattern).
